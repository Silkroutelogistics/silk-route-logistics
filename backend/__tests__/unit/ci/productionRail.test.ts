/**
 * The production rail.
 *
 * WHAT IT PROTECTS. Until v3.8 commit 12a, backend/.env held the production Neon
 * pair, so a raw `npx prisma migrate deploy` typed by a human resolved to
 * PRODUCTION while the shell looked entirely local. That is not hypothetical: a
 * migration landed on Neon at 15:11:07 UTC on 2026-09-01 (§13.3 Item 252). It
 * was additive and harmless. The rail exists because the next one might not be.
 *
 * The rail is one sentence: .env targets the local container, the production
 * datasource lives only in .env.production.local, and nothing loads that file
 * except the two scripts with "production" in their names.
 *
 * TWO KINDS OF CASE HERE, and the difference matters.
 *
 * The `railBreach` cases are pure and always run — they assert the detector
 * works. The cases that read backend/.env can only run where that file exists,
 * which is a developer machine and not CI, because .env is gitignored. Those
 * skip rather than pass when it is absent: a check that silently passes on a
 * missing input is the vacuous-green shape this codebase keeps unpicking, and
 * a skip says plainly that it did not run.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { railBreach, readFromEnvFile, hostOf, isLocalHost } from "../../../scripts/prisma-target-guard";

const BACKEND = path.resolve(__dirname, "../../..");
const ENV_FILE = path.join(BACKEND, ".env");
const PROD_FILE = path.join(BACKEND, ".env.production.local");
const REPO = path.resolve(BACKEND, "..");

const haveEnv = fs.existsSync(ENV_FILE);
const haveProd = fs.existsSync(PROD_FILE);

/** A throwaway pair of dotenv files, so the detector is driven with real input. */
function withFiles(a: string, b: string, fn: (fa: string, fb: string) => void) {
  const dir = fs.mkdtempSync(path.join(require("os").tmpdir(), "rail-"));
  const fa = path.join(dir, ".env");
  const fb = path.join(dir, ".env.production.local");
  fs.writeFileSync(fa, a);
  fs.writeFileSync(fb, b);
  try { fn(fa, fb); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

const NEON = "postgresql://u:p@ep-green-frog-ajsgv9me.c-3.us-east-2.aws.neon.tech/neondb";
const LOCAL = "postgresql://postgres:p@127.0.0.1:55473/srl";

describe("the breach detector", () => {
  it("is quiet when .env is local and production lives elsewhere", () => {
    withFiles(`DIRECT_URL=${LOCAL}\n`, `DIRECT_URL=${NEON}\n`, (a, b) => {
      expect(railBreach(a, b)).toBeNull();
    });
  });

  it("fires when both files name the same production host", () => {
    // The single way the rail can be undone: somebody pastes the production URL
    // back into .env. Both files then agree, every command still looks fine, and
    // the separation is gone.
    withFiles(`DIRECT_URL=${NEON}\n`, `DIRECT_URL=${NEON}\n`, (a, b) => {
      const r = railBreach(a, b);
      expect(r).not.toBeNull();
      expect(r!.host).toContain("neon.tech");
    });
  });

  it("catches it on DATABASE_URL too, not only DIRECT_URL", () => {
    // migrate reads DIRECT_URL, but a breach on either is a breach: the seed
    // and every app process read DATABASE_URL.
    withFiles(`DATABASE_URL=${NEON}\n`, `DATABASE_URL=${NEON}\n`, (a, b) => {
      expect(railBreach(a, b)).not.toBeNull();
    });
  });

  it("does not cry wolf when both are local", () => {
    // A developer who has pointed the production file at a container is doing
    // something harmless, and a guard that fires on it is one people learn to
    // ignore.
    withFiles(`DIRECT_URL=${LOCAL}\n`, `DIRECT_URL=${LOCAL}\n`, (a, b) => {
      expect(railBreach(a, b)).toBeNull();
    });
  });

  it("is quiet when there is no production file at all", () => {
    withFiles(`DIRECT_URL=${LOCAL}\n`, "", (a) => {
      expect(railBreach(a, path.join(path.dirname(a), "nope"))).toBeNull();
    });
  });
});

describe("this working tree", () => {
  it.skipIf(!haveEnv)("backend/.env resolves to a LOCAL host", () => {
    // The load-bearing assertion. If this fails, a raw `npx prisma migrate
    // deploy` reaches production, which is precisely how Item 252 happened.
    for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
      const v = readFromEnvFile(ENV_FILE, key);
      if (!v) continue;
      expect(isLocalHost(hostOf(v)), `backend/.env ${key} points at ${hostOf(v)} — the production rail is breached`).toBe(true);
    }
  });

  it.skipIf(!haveEnv || !haveProd)("the two files do not name the same host", () => {
    expect(railBreach(ENV_FILE, PROD_FILE)).toBeNull();
  });

  it.skipIf(!haveEnv)("the check actually read something (vacuity tripwire)", () => {
    // A .env with neither key would pass the assertion above by having nothing
    // to assert on.
    const any = readFromEnvFile(ENV_FILE, "DATABASE_URL") ?? readFromEnvFile(ENV_FILE, "DIRECT_URL");
    expect(any, "backend/.env declares no datasource at all").toBeTruthy();
  });
});

describe("only the production scripts load the production file", () => {
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name))
        : /\.(ts|tsx|js|mjs|cjs)$/.test(e.name) ? [path.join(dir, e.name)] : []);

  /**
   * EVERY file that names the production datasource is classified, with a
   * reason. Unclassified is a failure.
   *
   * This replaces an allow-list plus a loader-API predicate, and the reason is
   * that the predicate could not hold the line. It asked "does this file call
   * `dotenv.config`", and by its own header that question had already been
   * corrected three times. When it was measured against the tree it was GREEN
   * while SEVEN files loaded the production datasource outside it, in three
   * distinct shapes it had no way to see:
   *
   *   `dotenv.parse` instead of `.config`                          (4 files)
   *   readFileSync + `new PrismaClient({ datasourceUrl })`         (1 file)
   *   readFileSync, write `process.env`, then dynamically import
   *     the app's own prisma singleton — no dotenv, no client      (2 files)
   *
   * The third shape is the argument against ever widening this predicate
   * again: it constructs nothing and imports nothing statically, so no list of
   * loader APIs can catch it. A fourth shape would be invented the same way.
   *
   * So the trigger is NAMING the file at all — the one thing every route to
   * production must do — and the question becomes "which class is this, and
   * why", which a human answers once and a reader can audit. The rail's value,
   * in its own words, is that the ways to reach production are countable and
   * named. Seven uncounted ways is not that; seven named ones is.
   */
  type ProductionFileClass = "NAMED_COMMAND" | "RAIL_ENFORCEMENT" | "GUARD_FIXTURES" | "READ_ONLY_TOOL";

  const CLASSIFIED: Record<string, { klass: ProductionFileClass; why: string }> = {
    "scripts/prisma-deploy-production.ts": {
      klass: "NAMED_COMMAND",
      why: "npm run prisma:deploy:production — the sanctioned way to apply migrations, guarded before it builds the environment",
    },
    "scripts/prisma-status-production.ts": {
      klass: "NAMED_COMMAND",
      why: "npm run prisma:status:production — read-only status, same guard",
    },
    "scripts/prisma-target-guard.ts": {
      klass: "RAIL_ENFORCEMENT",
      why: "reads the file to COMPARE hostnames and refuses; never puts a credential into the environment and never connects. Allow-listing the breach detector as a breach was the first version's error",
    },
    "__tests__/unit/ci/productionRail.test.ts": {
      klass: "GUARD_FIXTURES",
      why: "this file — its fixture strings name the production file so it looks like a loader to its own scanner",
    },
    "scripts/_arc-a2-prod-gate.ts": {
      klass: "READ_ONLY_TOOL",
      why: "pre-merge row-count gate; SELECT only",
    },
    "scripts/_readonly-agreement-version-fidelity.ts": {
      klass: "READ_ONLY_TOOL",
      why: "compares stored agreement text against the served body; SELECT only",
    },
    "scripts/_readonly-b2-status-census.ts": {
      klass: "READ_ONLY_TOOL",
      why: "carrier onboarding-status census; SELECT only",
    },
    "scripts/_readonly-bare-bol-census.ts": {
      klass: "READ_ONLY_TOOL",
      why: "BOL numbering census; SELECT only",
    },
    "scripts/_readonly-bca-executed-count.ts": {
      klass: "READ_ONLY_TOOL",
      why: "counts executed agreements at a version before a body swap; SELECT only",
    },
    "scripts/_readonly-peace-transport-select.ts": {
      klass: "READ_ONLY_TOOL",
      why: "single-carrier read for an incident; SELECT only",
    },
    "scripts/_readonly-qp-archive-verify.ts": {
      klass: "READ_ONLY_TOOL",
      why: "Quick Pay archive verification; SELECT only",
    },
  };

  /**
   * LOADING is the thing that matters, not mentioning.
   *
   * The first version of this check matched any file naming the production
   * file, and flagged prisma-target-guard.ts — which READS that file to compare
   * hostnames and never puts a credential into the environment. That file is
   * the breach detector, so allow-listing it would have granted the exemption
   * to the one file whose whole job is to police the rail.
   *
   * A load is: the file NAMES the production file AND calls `dotenv.config`.
   * Both halves are required and proximity is not — the first version demanded
   * they sit within 120 characters, and in the real scripts `import dotenv` is
   * forty lines above a `dotenv.config({ path: PROD_FILE })` that never repeats
   * the filename. It reported the two legitimate loaders as clean, which is the
   * direction that matters: an instrument whose reach excludes the answer
   * (§19 Sub-pattern 17).
   */
  const stripComments = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  /**
   * NAMING is the trigger, and comments do not count. prisma-target-guard.ts
   * DISCUSSES `dotenv.config({ path })` in its header while calling nothing of
   * the kind, so reading prose as code once flagged the breach detector as a
   * breach. Stripping comments is what the old predicate got right, and it is
   * kept verbatim.
   */
  const namesProductionFile = (src: string) => stripComments(src).includes(".env.production.local");

  /**
   * NAMING is not the only route any more. Item 303 moved the census scripts
   * onto `_census-credential`, which names the file on their behalf, so a
   * caller can reach production while naming nothing. `_arc-a2-prod-gate.ts`
   * did exactly that and the liveness check read it as dead permission.
   * Reaching production is the question; naming was only ever a proxy for it.
   */
  const reachesProduction = (src: string) => {
    const code = stripComments(src);
    return code.includes(".env.production.local") || /from\s+["'][./]*_census-credential["']/.test(code);
  };

  /**
   * A write, per line — and the per-line part is the point.
   *
   * The first version banned `$executeRaw` outright and immediately flagged
   * `_arc-a2-prod-gate.ts`, whose only match is
   * `$executeRawUnsafe("SET default_transaction_read_only = on")`. That is not
   * a write; it is Postgres being told to REFUSE writes for the rest of the
   * session, which makes it the strongest read-only guarantee in the set — the
   * Item 262 census pattern. Flagging the safest script in the group would have
   * taught the next reader to disable this check.
   *
   * So a `$executeRaw` line carrying `default_transaction_read_only` is
   * exempt, and any OTHER raw statement still counts. The exemption is the
   * statement, not the file.
   */
  const READ_ONLY_LOCK = /default_transaction_read_only/;
  const WRITE_CALL = /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(|\$executeRaw/;
  const writeLines = (src: string) =>
    stripComments(src)
      .split(/\r?\n/)
      .filter((l) => WRITE_CALL.test(l) && !READ_ONLY_LOCK.test(l));

  const scanTree = () =>
    [...walk(path.join(BACKEND, "src")), ...walk(path.join(BACKEND, "scripts")), ...walk(path.join(BACKEND, "__tests__"))];

  it("every file that names the production datasource is classified", () => {
    const files = scanTree();

    // Vacuity tripwire. A walker that quietly stopped matching would report an
    // empty offender list, and that failure looks exactly like success — the
    // shape this whole guard exists to refuse.
    expect(files.length, "the walker found almost nothing; it is broken, not the tree").toBeGreaterThan(200);

    const unclassified: string[] = [];
    for (const f of files) {
      const rel = path.relative(BACKEND, f).replace(/\\/g, "/");
      if (!namesProductionFile(fs.readFileSync(f, "utf8"))) continue;
      if (!CLASSIFIED[rel]) unclassified.push(rel);
    }
    expect(
      unclassified,
      "a new route to the production datasource. Classify it in CLASSIFIED with a reason, or stop naming the file",
    ).toEqual([]);
  });

  it("a READ_ONLY_TOOL contains no write", () => {
    // The read-only claim in each of these headers is prose until something
    // checks it. Seven scripts connect to production under that promise.
    for (const [rel, { klass }] of Object.entries(CLASSIFIED)) {
      if (klass !== "READ_ONLY_TOOL") continue;
      const found = writeLines(fs.readFileSync(path.join(BACKEND, rel), "utf8"));
      expect(found, `${rel} is classified READ_ONLY_TOOL but writes`).toEqual([]);
    }
  });

  /**
   * The test above proves the script does not write TODAY. This one makes
   * Postgres refuse a write whatever the script is edited into tomorrow.
   *
   * Both halves are required, and the SHOW is the load-bearing one: a SET that
   * silently failed to take looks identical from the script's side to one that
   * took, which is §19 Sub-pattern 16 exactly. Asserting the SET alone would be
   * a guard that proves the statement is written rather than that it held.
   */
  const locksSession = (src: string) => {
    const code = stripComments(src);
    return {
      sets: /SET\s+default_transaction_read_only\s*=\s*on/i.test(code),
      verifies: /SHOW\s+default_transaction_read_only/i.test(code),
    };
  };

  it("a READ_ONLY_TOOL locks the session and verifies the lock took", () => {
    for (const [rel, { klass }] of Object.entries(CLASSIFIED)) {
      if (klass !== "READ_ONLY_TOOL") continue;
      const { sets, verifies } = locksSession(fs.readFileSync(path.join(BACKEND, rel), "utf8"));
      expect(sets, `${rel} is classified READ_ONLY_TOOL but never SETs default_transaction_read_only`).toBe(true);
      expect(verifies, `${rel} SETs the read-only lock but never SHOWs it back — a SET that did not take reads as success`).toBe(true);
    }
  });

  it("the detector can tell naming from mentioning (self-test)", () => {
    // Without this, a matcher that had stopped matching would report a clean
    // tree forever.
    const NAME = ".env.production.local";
    expect(namesProductionFile('const P = "' + NAME + '";')).toBe(true);
    expect(namesProductionFile("// reads " + NAME + " to compare hosts")).toBe(false);
    expect(namesProductionFile("/* " + NAME + " */")).toBe(false);
    expect(namesProductionFile('dotenv.config({ path: ".env.local" });')).toBe(false);
    // the helper route: reaches production without naming the file
    expect(reachesProduction('import { resolveCensusCredential } from "./_census-credential";')).toBe(true);
    expect(namesProductionFile('import { resolveCensusCredential } from "./_census-credential";')).toBe(false);
    expect(reachesProduction('// via ./_census-credential')).toBe(false);
    // and the write detector, since every READ_ONLY_TOOL entry rests on it
    expect(writeLines("await prisma.user.deleteMany({})")).toHaveLength(1);
    expect(writeLines("await prisma.user.findMany({})")).toHaveLength(0);
    expect(writeLines("await prisma.$executeRawUnsafe(`DELETE FROM users`)")).toHaveLength(1);
    // the read-only lock is not a write — the exemption is the statement, not the file
    expect(writeLines("await prisma.$executeRawUnsafe(`SET default_transaction_read_only = on`)")).toHaveLength(0);
    // ...and the lock detector needs BOTH halves, since a SET alone proves only that the line is written
    expect(locksSession("$executeRawUnsafe(`SET default_transaction_read_only = on`)")).toEqual({ sets: true, verifies: false });
    expect(locksSession("$queryRawUnsafe(`SHOW default_transaction_read_only`)")).toEqual({ sets: false, verifies: true });
    expect(locksSession("// SET default_transaction_read_only = on")).toEqual({ sets: false, verifies: false });
    // ...and exempting that line does not exempt a real write elsewhere in the same file
    expect(
      writeLines("await prisma.$executeRawUnsafe(`SET default_transaction_read_only = on`)\nawait prisma.user.delete({})"),
    ).toHaveLength(1);
  });

  it("the classification has no dead entries", () => {
    for (const [rel, { why }] of Object.entries(CLASSIFIED)) {
      const p = path.join(BACKEND, rel);
      expect(fs.existsSync(p), `${rel} is classified but does not exist`).toBe(true);
      expect(reachesProduction(fs.readFileSync(p, "utf8")), `${rel} is classified but no longer reaches production by either route`).toBe(true);
      expect(why.length, `${rel} is classified with no reason`).toBeGreaterThan(10);
    }
  });

  it("the pattern is gitignored", () => {
    const gi = fs.readFileSync(path.join(REPO, ".gitignore"), "utf8");
    expect(gi).toMatch(/^\.env\.\*\.local$/m);
  });
});
