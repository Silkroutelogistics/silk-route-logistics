/**
 * C1 — the population of scripts holding their own PrismaClient may SHRINK and
 * never GROW.
 *
 * WHY THIS IS A FROZEN INVENTORY RATHER THAN "NOTHING MAY DO THIS". The arc's
 * directive states the rule as an absolute, and 39 of 151 tracked scripts break
 * it today. A guard that is red on 39 files against correct code is a guard
 * nobody reads (the Item 194 A1 lesson: enforcing a rule the codebase does not
 * yet satisfy breaks the build rather than the habit). So the population is
 * frozen at what it is, each entry carries why, and the assertion is that the
 * number does not climb.
 *
 * WHAT A FOREIGN CLIENT ACTUALLY COSTS, now that the trigger exists. The counting
 * moved to an AFTER UPDATE OF status trigger precisely BECAUSE the client
 * extension could not see these writes — SRL-121496 was reversed twice, once by
 * a script with its own client and once by the canonical endpoint, and only the
 * second was counted. So a foreign client no longer corrupts the gate: the
 * trigger sees every writer by construction.
 *
 * It still costs the rest of the extension. `src/config/database.ts` hangs
 * `observeLoadTransition` off `$allOperations`, so a write through a foreign
 * client emits no real-time violation line — and anything attached there later
 * inherits the same blind spot silently. That is the axis this guard defends,
 * and it is worth saying plainly rather than implying the gate is at risk.
 *
 * THE THREE REASONS, and only the first is permanent:
 *
 *   READ_ONLY_CENSUS — connects as `srl_readonly` through `_census-credential.ts`.
 *     CANNOT use the shared singleton by construction: the singleton is built
 *     from `backend/.env`, which the §2.2 production rail resolves to the local
 *     container, and these read PRODUCTION as a different, SELECT-only role.
 *     Correct, permanent, and not a target for removal.
 *
 *   PROOF — drives a throwaway container for a proof or a gate. The singleton
 *     would point at whatever `.env` says, which is the wrong database for a
 *     proof and the whole point of the rail for everything else.
 *
 *   PRODUCTION_WRITE — a one-off operator script that must reach PRODUCTION to
 *     do its job. Structurally the same argument as READ_ONLY_CENSUS, only the
 *     role differs: the §2.2 rail resolves `backend/.env` to the local container,
 *     so a script that writes to production cannot use the singleton no matter
 *     how much anyone would like it to.
 *
 *     FOUND BY USING THIS GUARD, AND NOT FULLY ACTED ON. Several entries sitting
 *     in MAINTENANCE below almost certainly belong here — apply-email-citext, the
 *     rotate-* pair and the reconcile-* pair all target production. So the
 *     MAINTENANCE ceiling is a number over a bucket whose definition is looser
 *     than it reads. Re-auditing those twenty is its own pass and would be
 *     unreviewable bundled into an unrelated commit, so it is recorded rather
 *     than done. Until then read MAINTENANCE as 'not yet classified', not as a
 *     proven claim that each could use the singleton.
 *
 *   MAINTENANCE — one-off repair, backfill, rotation or verification. This is
 *     the bucket that should shrink: most of these predate the singleton being
 *     a comfortable thing to import from a script.
 *
 * REACH, STATED: this reads TRACKED files (`git ls-files`), never the working
 * directory. That is deliberate. Walking the directory would flag every other
 * session's untracked scratch script, which §2.2 says are theirs and not mine to
 * touch, and a guard that is permanently red in the main checkout is a guard
 * people learn to skip. The cost is that a brand-new script is invisible until
 * `git add` puts it in the index — so this fires at the commit that introduces
 * it, not the moment it is written. That is the boundary that matters, but it is
 * not the same as "immediately", and a green run on an unstaged file proves
 * nothing about that file.
 *
 * TO ADD A SCRIPT: don't. Import the shared client from `src/config/database`.
 * If the script genuinely needs a different role or a different database, it
 * belongs in READ_ONLY_CENSUS or PROOF and the entry states which.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const BACKEND = path.resolve(__dirname, "../../..");

/**
 * Comments stripped BEFORE matching. `_carrier-assignment-proof.ts` documents
 * this exact footgun in prose — a PrismaPromise minted by one client cannot be
 * enrolled in another client's `$transaction`, it executes independently and
 * survives the rollback — and a naive scan reads that explanation as an
 * instantiation. Prose is not code (§19 Sub-pattern 17).
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function instantiatesOwnClient(source: string): boolean {
  return /new\s+PrismaClient\s*\(/.test(stripComments(source));
}

/** Tracked scripts only, keyed by their path under `scripts/`. */
function trackedScripts(): string[] {
  const out = execSync("git ls-files scripts", {
    cwd: BACKEND,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024, // an ENOBUFS here would be swallowed as "no scripts"
  });
  return out
    .split(/\r?\n/)
    .filter((l) => l.endsWith(".ts"))
    .map((l) => l.replace(/^scripts\//, ""));
}

type Reason = "READ_ONLY_CENSUS" | "PRODUCTION_WRITE" | "PROOF" | "MAINTENANCE";

const OWN_CLIENT_INVENTORY: Record<string, Reason> = {
  // Read production as srl_readonly through _census-credential.ts.
  "_arc-a2-prod-gate.ts": "READ_ONLY_CENSUS",
  "_r0-121496-census.ts": "READ_ONLY_CENSUS",
  "_readonly-121497-divergence.ts": "READ_ONLY_CENSUS",
  "_readonly-agreement-version-fidelity.ts": "READ_ONLY_CENSUS",
  "_readonly-b2-status-census.ts": "READ_ONLY_CENSUS",
  "_readonly-bare-bol-census.ts": "READ_ONLY_CENSUS",
  "_readonly-bhy-postdeploy-verify.ts": "READ_ONLY_CENSUS",
  "_readonly-bhy-rowcount-gate.ts": "READ_ONLY_CENSUS",
  "_readonly-p5-mail-consent-verify.ts": "READ_ONLY_CENSUS",
  "_readonly-p6-eight-table.ts": "READ_ONLY_CENSUS",
  "_readonly-peace-transport-select.ts": "READ_ONLY_CENSUS",
  "_readonly-render-bol-review.ts": "READ_ONLY_CENSUS",
  "_readonly-writepath-census.ts": "READ_ONLY_CENSUS",

  // Drive a throwaway container; the singleton would target the wrong database.
  "_arc-c1-foreign-client-proof.ts": "PROOF",
  // Reaches production to write; the singleton resolves to the local container.
  "repair-load-121495-cancel-residue.ts": "PRODUCTION_WRITE",
  "_arc-a2-counter-proof.ts": "PROOF",
  "_arc-inforequest-concurrent-proof.ts": "PROOF",
  "_b11-countersign-proof.ts": "PROOF",
  "_b5-fk-gate.ts": "PROOF",
  "_sibling-withdraw-proof.ts": "PROOF",
  "_tender-activity-proof.ts": "PROOF",

  // One-off repair / backfill / rotation / verification. The bucket to shrink.
  "_arc121497-review-pdfs.ts": "MAINTENANCE",
  "_readonly-arc-avg-preflight.ts": "MAINTENANCE",
  "_readonly-carrier-2fa-census.ts": "MAINTENANCE",
  "apply-email-citext.ts": "MAINTENANCE",
  "archive-dispatch-courses.ts": "MAINTENANCE",
  "backfill-customer-contacts-from-email.ts": "MAINTENANCE",
  "cancel-stranded-shipments.ts": "MAINTENANCE",
  "check-migration-ledger.ts": "MAINTENANCE",
  "create-operations-account.ts": "MAINTENANCE",
  "dedupe-scan-email.ts": "MAINTENANCE",
  "mark-legacy-test-loads.ts": "MAINTENANCE",
  "reconcile-carrier-status-drift.ts": "MAINTENANCE",
  "reconcile-srl-121488.ts": "MAINTENANCE",
  "repair-load-121495-tracking-and-notice.ts": "MAINTENANCE",
  "restart-load-number-sequence.ts": "MAINTENANCE",
  "rotate-seed-accounts.ts": "MAINTENANCE",
  "rotate-whaider-password.ts": "MAINTENANCE",
  "seed-training-courses.ts": "MAINTENANCE",
  "verify-db-target.ts": "MAINTENANCE",
  "verify-email-citext.ts": "MAINTENANCE",
};

/**
 * ONLY THE MAINTENANCE BUCKET RATCHETS, and the asymmetry is the point.
 *
 * A single ceiling over all three buckets would be raised by every arc that
 * writes a proof or a census - both legitimate by construction, and both will
 * keep arriving. A ratchet that must be raised routinely teaches the reflex of
 * raising it, which is how a ratchet stops being one. So the number that may
 * not climb is the DEBT: one-off scripts that could import the singleton and
 * do not.
 *
 * RESIDUAL, STATED: this can still be widened by labelling a maintenance script
 * PROOF. Nothing here can tell those apart from source - which is why the reason
 * is a literal in the inventory above rather than an inferred property, so the
 * mislabel is a visible word in a reviewed diff instead of a silent skip.
 */
const MAINTENANCE_CEILING = 20;

describe("the detector reads code, not prose", () => {
  // These fixtures ARE the gate. The count below is only as trustworthy as the
  // matcher, and the matcher has two documented ways to be wrong in this repo.
  it("counts a real instantiation", () => {
    expect(instantiatesOwnClient(`const db = new PrismaClient();`)).toBe(true);
  });

  it("counts one carrying options across a line break", () => {
    expect(
      instantiatesOwnClient(`const db = new PrismaClient({\n  datasourceUrl: url,\n});`),
    ).toBe(true);
  });

  it("does NOT count a line comment", () => {
    expect(instantiatesOwnClient(`// never do: new PrismaClient()`)).toBe(false);
  });

  it("does NOT count a block comment", () => {
    expect(
      instantiatesOwnClient(`/**\n * A new PrismaClient() here would not\n * join the outer transaction.\n */`),
    ).toBe(false);
  });

  it("does NOT count the bare type name", () => {
    // An import or a type annotation is not an instantiation.
    expect(instantiatesOwnClient(`import type { PrismaClient } from "@prisma/client";`)).toBe(
      false,
    );
  });
});

describe("scripts do not gain their own PrismaClient", () => {
  const tracked = trackedScripts();

  it("the corpus is real", () => {
    // Vacuity tripwire. A git failure or a wrong cwd yields an empty list, and
    // every assertion below would then pass while measuring nothing.
    expect(tracked.length).toBeGreaterThan(100);
  });

  it("no script outside the frozen inventory instantiates one", () => {
    const offenders = tracked.filter((rel) => {
      if (rel in OWN_CLIENT_INVENTORY) return false;
      const full = path.join(BACKEND, "scripts", rel);
      if (!fs.existsSync(full)) return false;
      return instantiatesOwnClient(fs.readFileSync(full, "utf8"));
    });

    expect(
      offenders,
      offenders.length === 0
        ? ""
        : `These scripts hold their own PrismaClient and are not in the frozen inventory:\n` +
            offenders.map((o) => `  backend/scripts/${o}`).join("\n") +
            `\n\nImport the shared client from src/config/database instead. A write through\n` +
            `a foreign client bypasses the $allOperations extension, so it emits no\n` +
            `transition log line — and anything attached there later inherits the same\n` +
            `blind spot with nothing to announce it.\n` +
            `If the script genuinely needs another role (srl_readonly) or another\n` +
            `database (a proof container), add it with that reason.`,
    ).toEqual([]);
  });

  it("carries no stale entry", () => {
    // Dead permission silently widens a guard: an entry for a file that no
    // longer instantiates one is a free pass waiting for a future edit.
    const stale = Object.keys(OWN_CLIENT_INVENTORY).filter((rel) => {
      const full = path.join(BACKEND, "scripts", rel);
      if (!fs.existsSync(full)) return true; // deleted — remove the entry
      return !instantiatesOwnClient(fs.readFileSync(full, "utf8"));
    });

    expect(
      stale,
      stale.length === 0
        ? ""
        : `These inventory entries no longer earn their place — the file is gone, or it\n` +
            `no longer instantiates a client. Remove them so the count keeps falling:\n` +
            stale.map((s) => `  ${s}`).join("\n"),
    ).toEqual([]);
  });

  it("the maintenance bucket may only shrink", () => {
    // The offenders test above is satisfied by ADDING a name to the literal,
    // which is the cheapest way to silence this guard. For the bucket that is
    // actual debt, that route is closed: raising this number is a deliberate,
    // visible edit and there is no good reason to make one.
    const maintenance = Object.values(OWN_CLIENT_INVENTORY).filter((r) => r === "MAINTENANCE");
    expect(maintenance.length).toBeLessThanOrEqual(MAINTENANCE_CEILING);
  });

  it("every credential-routed entry actually uses the census credential", () => {
    // The permanent bucket is the one worth policing: labelling an ordinary
    // maintenance script READ_ONLY_CENSUS would exempt it from ever shrinking.
    const mislabelled = Object.entries(OWN_CLIENT_INVENTORY)
      .filter(([, reason]) => reason === "READ_ONLY_CENSUS" || reason === "PRODUCTION_WRITE")
      .map(([rel]) => rel)
      .filter((rel) => {
        const full = path.join(BACKEND, "scripts", rel);
        if (!fs.existsSync(full)) return false; // the stale test owns this case
        const body = stripComments(fs.readFileSync(full, "utf8"));
        return !/resolveCensusCredential|applyCensusCredential/.test(body);
      });

    expect(
      mislabelled,
      mislabelled.length === 0
        ? ""
        : `Reaches production but does not route through _census-credential.ts — the\n` +
            `Item 304.2 shape, where a script parses the production env itself:\n` +
            mislabelled.map((m) => `  ${m}`).join("\n"),
    ).toEqual([]);
  });
});
