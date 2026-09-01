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

  const ALLOWED = new Set([
    "scripts/prisma-deploy-production.ts",
    "scripts/prisma-status-production.ts",
  ]);

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

  const loadsProductionEnv = (src: string) => {
    // Comments stripped first. prisma-target-guard.ts DISCUSSES
    // `dotenv.config({ path })` in its header while calling nothing of the
    // kind — it hand-parses one key — so reading prose as code flagged the
    // breach detector as a breach. Third correction to this predicate, and
    // each one narrowed it toward what the rail actually cares about.
    const code = stripComments(src);
    return code.includes(".env.production.local") && /dotenv\s*\.\s*config/.test(code);
  };

  it("no file outside the two production scripts LOADS the production datasource", () => {
    // Each additional loader is another way to reach production, and the rail's
    // whole value is that the ways are countable and named.
    const offenders: string[] = [];
    for (const f of [...walk(path.join(BACKEND, "src")), ...walk(path.join(BACKEND, "scripts")), ...walk(path.join(BACKEND, "__tests__"))]) {
      const rel = path.relative(BACKEND, f).replace(/\\/g, "/");
      if (ALLOWED.has(rel)) continue;
      // This file carries fixture strings for the self-test below, so it looks
      // like a loader to its own scanner. A guard flagging itself is noise.
      if (rel === "__tests__/unit/ci/productionRail.test.ts") continue;
      if (loadsProductionEnv(fs.readFileSync(f, "utf8"))) offenders.push(rel);
    }
    expect(offenders, "a new loader of the production datasource").toEqual([]);
  });

  it("the detector can tell loading from mentioning (self-test)", () => {
    // Without this, a regex that had stopped matching would report a clean tree
    // forever — and that failure looks exactly like success.
    const NAME = ".env.production.local";
    expect(loadsProductionEnv('const P = "' + NAME + '";\ndotenv.config({ path: P });')).toBe(true);
    expect(loadsProductionEnv("// reads " + NAME + " to compare hosts")).toBe(false);
    expect(loadsProductionEnv('dotenv.config({ path: ".env.local" });')).toBe(false);
  });

  it("the allow-list has no dead entries", () => {
    for (const rel of ALLOWED) {
      const p = path.join(BACKEND, rel);
      expect(fs.existsSync(p), `${rel} is allow-listed but does not exist`).toBe(true);
      expect(loadsProductionEnv(fs.readFileSync(p, "utf8")), `${rel} is allow-listed but does not load the file`).toBe(true);
    }
  });

  it("the pattern is gitignored", () => {
    const gi = fs.readFileSync(path.join(REPO, ".gitignore"), "utf8");
    expect(gi).toMatch(/^\.env\.\*\.local$/m);
  });
});
