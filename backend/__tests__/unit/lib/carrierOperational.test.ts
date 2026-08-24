/**
 * One definition of who gets monitored, and one of who gets offered a load.
 *
 * The named case at the bottom is why this file exists: a carrier approved
 * through approvalService.approveCarrier must appear in all four compliance
 * sweeps. Before B2 they appeared in none, because the approve path writes
 * onboardingStatus and the sweeps filtered on status.
 *
 * THE ASSERTIONS RUN AGAINST THE REAL WHERE-FRAGMENTS, evaluated by a small
 * matcher below, rather than against a parallel in-memory predicate. An earlier
 * draft exported `isMonitoredCarrier`/`isDispatchableCarrier` for readability
 * and the reachability gate correctly flagged both as consumed only by tests —
 * which is the same shape as the defect this commit fixes: a correct answer
 * nothing consults. They were deleted. What production passes to Prisma is what
 * gets tested.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  monitoredCarrierWhere,
  dispatchableCarrierWhere,
  pairedApplicationStatus,
} from "../../../src/lib/carrierOperational";

type Row = Record<string, unknown>;

/**
 * Evaluate the subset of Prisma where-syntax these builders emit:
 * scalar equality, `{ in: [...] }`, and a top-level OR of such clauses.
 *
 * Deliberately narrow. If a builder starts emitting something this cannot
 * evaluate, the throw is the signal to extend it — silently returning false
 * would turn every assertion below into a passing lie.
 */
function matches(where: Record<string, unknown>, row: Row): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === "OR") {
      const arms = cond as Array<Record<string, unknown>>;
      if (!arms.some((a) => matches(a, row))) return false;
      continue;
    }
    if (key === "AND") {
      const arms = cond as Array<Record<string, unknown>>;
      if (!arms.every((a) => matches(a, row))) return false;
      continue;
    }
    if (cond !== null && typeof cond === "object") {
      const c = cond as Record<string, unknown>;
      if (!("in" in c)) throw new Error(`matcher cannot evaluate ${key}: ${JSON.stringify(cond)}`);
      if (!(c.in as unknown[]).includes(row[key])) return false;
      continue;
    }
    if (row[key] !== cond) return false;
  }
  return true;
}

const row = (over: Row = {}): Row => ({
  onboardingStatus: "APPROVED",
  status: "APPROVED",
  isTestAccount: false,
  deletedAt: null,
  ...over,
});

const monitored = (r: Row) => matches(monitoredCarrierWhere() as Record<string, unknown>, r);
const dispatchable = (r: Row) => matches(dispatchableCarrierWhere() as Record<string, unknown>, r);

describe("the matcher itself is honest", () => {
  it("throws rather than silently failing on syntax it cannot evaluate", () => {
    expect(() => matches({ x: { gt: 3 } }, { x: 5 })).toThrow(/cannot evaluate/);
  });

  it("distinguishes — it is not a constant", () => {
    expect(monitored(row())).toBe(true);
    expect(monitored(row({ isTestAccount: true }))).toBe(false);
  });
});

describe("monitoring errs INCLUSIVE", () => {
  it("scans a carrier the two enums DISAGREE about", () => {
    // THE DEFECT, as a test. approvalService sets onboardingStatus and leaves
    // status at its @default(NEW). A filter on status alone skipped them.
    expect(monitored(row({ onboardingStatus: "APPROVED", status: "NEW" }))).toBe(true);
    // …and the mirror, where the application side is the one saying yes.
    expect(monitored(row({ onboardingStatus: "PENDING", status: "APPROVED" }))).toBe(true);
  });

  it("keeps scanning a SUSPENDED carrier", () => {
    // Deliberate. A suspended carrier is post-approval, and the reason to keep
    // looking is exactly that we may need to learn about a sanctions hit or a
    // lapsed policy while they are suspended.
    expect(monitored(row({ onboardingStatus: "SUSPENDED", status: "SUSPENDED" }))).toBe(true);
    expect(monitored(row({ onboardingStatus: "SUSPENDED", status: "NEW" }))).toBe(true);
  });

  it("does not widen to carriers the sweeps never covered", () => {
    // This repairs a drift; it does not quietly enlarge who gets scanned.
    expect(monitored(row({ onboardingStatus: "PENDING", status: "NEW" }))).toBe(false);
    expect(monitored(row({ onboardingStatus: "REJECTED", status: "REJECTED" }))).toBe(false);
    expect(monitored(row({ onboardingStatus: "REVIEWING", status: "REVIEW" }))).toBe(false);
  });

  it("still excludes test accounts and deleted rows", () => {
    expect(monitored(row({ isTestAccount: true }))).toBe(false);
    expect(monitored(row({ deletedAt: new Date() }))).toBe(false);
  });

  it("the fragment spans both enums with an OR", () => {
    const w = monitoredCarrierWhere() as any;
    expect(w.deletedAt).toBeNull();
    expect(w.isTestAccount).toBe(false);
    expect(Array.isArray(w.OR)).toBe(true);
    // One arm per enum — that IS the fix. A single arm is the bug.
    expect(w.OR.map((c: Row) => Object.keys(c)[0]).sort()).toEqual(["onboardingStatus", "status"]);
  });
});

describe("dispatch eligibility errs EXCLUSIVE", () => {
  it("requires BOTH enums to agree", () => {
    expect(dispatchable(row({ onboardingStatus: "APPROVED", status: "APPROVED" }))).toBe(true);
    // Opposite direction from monitoring: a disagreement means do NOT offer.
    expect(dispatchable(row({ onboardingStatus: "SUSPENDED", status: "APPROVED" }))).toBe(false);
    expect(dispatchable(row({ onboardingStatus: "PENDING", status: "APPROVED" }))).toBe(false);
  });

  it("tolerates NEW on the application side, which the drift left behind", () => {
    expect(dispatchable(row({ onboardingStatus: "APPROVED", status: "NEW" }))).toBe(true);
  });

  it("excludes soft-deleted carriers, which the inline filter did not", () => {
    // smartMatchService's hand-written where had no deletedAt clause, so a
    // soft-deleted carrier could be matched to a load.
    expect(dispatchable(row({ deletedAt: new Date() }))).toBe(false);
  });

  it("the two answers genuinely disagree — the split is not cosmetic", () => {
    // If both said the same thing, one of them would be dead weight.
    const suspended = row({ onboardingStatus: "SUSPENDED", status: "SUSPENDED" });
    expect(monitored(suspended)).toBe(true);
    expect(dispatchable(suspended)).toBe(false);
  });
});

describe("pairedApplicationStatus", () => {
  it("maps each onboarding state to its application counterpart", () => {
    expect(pairedApplicationStatus("APPROVED")).toBe("APPROVED");
    expect(pairedApplicationStatus("REJECTED")).toBe("REJECTED");
    expect(pairedApplicationStatus("SUSPENDED")).toBe("SUSPENDED");
    expect(pairedApplicationStatus("PENDING")).toBe("NEW");
    expect(pairedApplicationStatus("REVIEWING")).toBe("REVIEW");
    expect(pairedApplicationStatus("INFO_REQUESTED")).toBe("REVIEW");
  });

  it("returns null rather than guessing for an unknown value", () => {
    // A writer receiving null leaves status alone. Inventing a value here would
    // put a wrong answer into the column the sweeps read.
    expect(pairedApplicationStatus("SOMETHING_NEW")).toBeNull();
  });
});

describe("THE REGRESSION CASE — a carrier approved the normal way is monitored", () => {
  /**
   * approvalService.approveCarrier is the canonical approve path. Pre-B2 it set
   * onboardingStatus "APPROVED" and nothing else, leaving status at NEW, while
   * all four sweeps filtered `status: "APPROVED"`. So the carrier an AE had
   * just approved was outside sanctions rescan, insurance-expiry monitoring,
   * CSA scanning and ELD validation — permanently, and silently.
   */
  const approvedTheOldWay = row({ onboardingStatus: "APPROVED", status: "NEW" });
  const approvedTheNewWay = row({ onboardingStatus: "APPROVED", status: "APPROVED" });

  it("appears in the monitored set even with the pre-fix stale status", () => {
    // Rows written before the fix still exist. They must be scanned without
    // waiting for the drift repair to reach them.
    expect(monitored(approvedTheOldWay)).toBe(true);
  });

  it("appears in the monitored set once writers pair correctly", () => {
    expect(monitored(approvedTheNewWay)).toBe(true);
  });

  it("is dispatchable either way, so the fix strands nobody", () => {
    expect(dispatchable(approvedTheOldWay)).toBe(true);
    expect(dispatchable(approvedTheNewWay)).toBe(true);
  });

  it("the OLD single-field filter would have missed them — the bug, pinned", () => {
    // Reproduces what the four sweeps used to do, so the failure this prevents
    // is stated in the suite rather than only in a commit message.
    const oldSweepFilter = (c: Row) => c.status === "APPROVED";
    expect(oldSweepFilter(approvedTheOldWay)).toBe(false);
    expect(monitored(approvedTheOldWay)).toBe(true);
  });
});

/**
 * The consumers must ASK the resolver rather than carry their own copy.
 *
 * Without this, someone re-adds `status: "APPROVED"` to one sweep and every
 * test above keeps passing — the resolver still correct, and still ignored by
 * the one query that mattered. That is the original defect exactly.
 */
describe("the consumers use the resolver", () => {
  const SWEEPS = [
    { file: "services/ofacScreeningService.ts", what: "weekly sanctions / SDN rescan" },
    { file: "services/insuranceVerificationService.ts", what: "insurance-expiry sweep" },
    { file: "services/csaBasicService.ts", what: "CSA BASIC scan" },
    { file: "services/eldValidationService.ts", what: "ELD validation sweep" },
  ];

  const read = (rel: string) =>
    fs.readFileSync(path.join(__dirname, "../../../src", rel), "utf8").split("\r\n").join("\n");
  const stripped = (rel: string) =>
    read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  it.each(SWEEPS)("$what calls monitoredCarrierWhere()", ({ file }) => {
    expect(read(file)).toContain("monitoredCarrierWhere()");
  });

  it.each(SWEEPS)("$what no longer filters on status alone", ({ file }) => {
    expect(stripped(file)).not.toMatch(/status:\s*"APPROVED"/);
  });

  it("the dispatch picker calls dispatchableCarrierWhere()", () => {
    // smartMatchService is the exclusive answer's production consumer. Without
    // it the predicate would be exported and unused — which the reachability
    // gate flags, and which is the shape of the bug being fixed.
    expect(read("services/smartMatchService.ts")).toContain("dispatchableCarrierWhere()");
  });
});
