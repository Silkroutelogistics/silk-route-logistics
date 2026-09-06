/**
 * Every writer that moves a carrier into a closed state is accounted for.
 *
 * FIXING SIX SITES FIXES SIX SITES. This fails the seventh.
 *
 * That is the lesson carrierStatusPairing.test.ts already banked for the
 * status-pair problem, and it applies here for the same reason: the close is a
 * rule about a TRANSITION, and transitions are written in eleven files by
 * fourteen separate `prisma.carrierProfile.update` calls. A rule enforced by
 * remembering is a rule that lasts until the next person adds a writer.
 *
 * A FROZEN INVENTORY, NOT AN "ALL WIRED" ASSERTION. Some writers genuinely must
 * NOT close requests, and asserting otherwise would be false. Each is listed
 * with its reason, so an exclusion is a decision somebody wrote down rather
 * than a site somebody missed — which from the outside look identical.
 *
 * The scanner finds ASSIGNMENTS, not call shapes. Three earlier versions of the
 * sibling census matched `prisma.carrierProfile.update(` and missed `tx.` writes
 * and nested creates; an assignment does not vary however the write around it
 * is spelled.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.join(__dirname, "../../../src");

/** Files that write CarrierProfile.onboardingStatus. Mirrors the list in
 *  carrierStatusPairing.test.ts, which is the census this one rides on. */
const CARRIER_FILES = [
  "controllers/carrierController.ts",
  "controllers/complianceController.ts",
  "services/approvalService.ts",
  "services/complianceMonitorService.ts",
  "services/infoRequestService.ts",
  "services/ofacScreeningService.ts",
  "services/onboardingLifecycleService.ts",
  "services/rejectionService.ts",
  "routes/carriers.ts",
  "routes/carrierAuth.ts",
  "services/carrierVettingService.ts",
];

/**
 * Every site that can put a carrier into APPROVED, REJECTED or SUSPENDED, and
 * what this arc decided about it. `wired` means the close runs in the same
 * transaction; anything else must say why not.
 */
const DISPOSITION: Record<string, { wired: boolean; why: string }> = {
  "services/approvalService.ts": {
    wired: true,
    why: "canonical AE approve — both the AE route and the Compass auto-approve converge here",
  },
  "services/rejectionService.ts": {
    wired: true,
    why: "canonical AE reject — had no transaction at all before G1, so the wrap is part of the change rather than an addition to an existing one",
  },
  "controllers/complianceController.ts": {
    wired: true,
    why: "AE-initiated manual suspend (POST /compliance/carrier/:id/suspend, ADMIN)",
  },
  "controllers/carrierController.ts": {
    wired: true,
    why: "verifyCarrier writes APPROVED or REJECTED from a variable; admin-setup approves an existing profile. The create branch is deliberately not wired — a profile that does not exist yet cannot hold a request",
  },
  "routes/carriers.ts": {
    wired: true,
    why: "emergency-approve is a second, unconverged approve path on an existing carrier",
  },
  "services/complianceMonitorService.ts": {
    wired: false,
    why: "AUTOMATIC suspensions only. checkAutoReversal reinstates FMCSA-suspended carriers on the next compliance scan and the suspension email tells the carrier so, which makes the state transient. Closing their requests would tell a carrier to stop, reinstate them hours later, and leave the AE to re-raise everything. The APPROVED write in this file is that reversal, arriving from SUSPENDED — the requests are already closed by then",
  },
  "services/ofacScreeningService.ts": {
    wired: false,
    why: "OFAC auto-suspend at score >= 90. Arguably not transient, unlike the FMCSA sweeps — recorded as a deliberate omission rather than done, because it is one path in a different service and this rule should arrive at a seam somebody chose",
  },
};

/** Blank comments in place, preserving offsets — the sibling census's idiom, and
 *  the one that survives a comment containing a block-comment delimiter. */
function stripComments(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}

const CLOSED = /onboardingStatus:\s*"(APPROVED|REJECTED|SUSPENDED)"/g;

function scan(rel: string): { closedWrites: number; hasClose: boolean } {
  const src = stripComments(fs.readFileSync(path.join(SRC, rel), "utf8"));
  // A `where:` filter is a read, not a write. Both look like the same
  // assignment, so the enclosing key is what separates them — and getting this
  // wrong in the permissive direction is what makes a census read healthy.
  const closedWrites = [...src.matchAll(CLOSED)].filter((m) => {
    const before = src.slice(Math.max(0, m.index! - 400), m.index!);
    const lastWhere = before.lastIndexOf("where:");
    const lastData = Math.max(before.lastIndexOf("data:"), before.lastIndexOf("create:"), before.lastIndexOf("update:"));
    return lastData > lastWhere;
  }).length;
  return { closedWrites, hasClose: src.includes("closeOpenInfoRequestsForStatus") };
}

describe("the close-on-transition rule is applied or explicitly excused", () => {
  it("every file that writes a closed status has a disposition", () => {
    const undeclared: string[] = [];
    for (const rel of CARRIER_FILES) {
      const { closedWrites } = scan(rel);
      if (closedWrites > 0 && !DISPOSITION[rel]) undeclared.push(`${rel} (${closedWrites} write(s))`);
    }
    expect(
      undeclared,
      `a new file moves carriers into a closed state and says nothing about open info requests.\n` +
        `Wire closeOpenInfoRequestsForStatus into its transaction, or add a DISPOSITION entry saying why not:\n${undeclared.join("\n")}`,
    ).toEqual([]);
  });

  it("every file marked wired actually calls the close", () => {
    const missing: string[] = [];
    for (const [rel, d] of Object.entries(DISPOSITION)) {
      if (!d.wired) continue;
      if (!scan(rel).hasClose) missing.push(rel);
    }
    expect(missing, `marked wired but does not call closeOpenInfoRequestsForStatus:\n${missing.join("\n")}`).toEqual([]);
  });

  it("every file marked excluded genuinely does not call it", () => {
    // Dead permission reads as a considered exception. If an excluded file
    // gains the close, the reason above is now false and should be deleted.
    const stale: string[] = [];
    for (const [rel, d] of Object.entries(DISPOSITION)) {
      if (d.wired) continue;
      if (scan(rel).hasClose) stale.push(rel);
    }
    expect(stale, `marked excluded but now calls the close — update its DISPOSITION reason:\n${stale.join("\n")}`).toEqual([]);
  });

  it("every disposition names a file that exists and gives a reason", () => {
    for (const [rel, d] of Object.entries(DISPOSITION)) {
      expect(fs.existsSync(path.join(SRC, rel)), `stale disposition: ${rel}`).toBe(true);
      expect(d.why.length, `${rel} has no reason`).toBeGreaterThan(30);
    }
  });

  it("the scanner sees real writes and is not matching where-clauses", () => {
    // Vacuity tripwire, and a correctness one. approvalService has exactly one
    // closed-status WRITE; complianceMonitorService is full of
    // `where: { onboardingStatus: "APPROVED" }` reads, and a scanner that
    // counted those would report every file as a writer and prove nothing.
    expect(scan("services/approvalService.ts").closedWrites).toBe(1);
    expect(scan("services/rejectionService.ts").closedWrites).toBe(1);
    expect(scan("controllers/complianceController.ts").closedWrites).toBe(1);

    const cppRel = "services/complianceMonitorService.ts";
    const raw = fs.readFileSync(path.join(SRC, cppRel), "utf8");
    expect(raw).toMatch(/where:\s*\{[^}]*onboardingStatus:\s*"APPROVED"/);
    // Those reads are not counted; the real writes in that file are.
    expect(scan(cppRel).closedWrites).toBeGreaterThan(0);
  });
});
