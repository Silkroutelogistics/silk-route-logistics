/**
 * One definition of who gets monitored, and one of who gets offered a load.
 *
 * The named case at the bottom is the whole reason this file exists: a carrier
 * approved through approvalService.approveCarrier must appear in all four
 * compliance sweeps. Before B2 they appeared in none of them, because the
 * approve path writes onboardingStatus and the sweeps filtered on status.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  monitoredCarrierWhere,
  dispatchableCarrierWhere,
  isMonitoredCarrier,
  isDispatchableCarrier,
  pairedApplicationStatus,
} from "../../../src/lib/carrierOperational";

const carrier = (over: Partial<Record<string, unknown>> = {}) => ({
  onboardingStatus: "APPROVED",
  status: "APPROVED",
  isTestAccount: false,
  deletedAt: null as Date | null,
  ...over,
}) as any;

describe("monitoring errs INCLUSIVE", () => {
  it("scans a carrier the two enums DISAGREE about", () => {
    // THE DEFECT, stated as a test. approvalService sets onboardingStatus and
    // leaves status at its @default(NEW). A filter on status alone skipped
    // them; the inclusive rule does not.
    expect(isMonitoredCarrier(carrier({ onboardingStatus: "APPROVED", status: "NEW" }))).toBe(true);
    // …and the mirror case, where the application side is the one that says yes.
    expect(isMonitoredCarrier(carrier({ onboardingStatus: "PENDING", status: "APPROVED" }))).toBe(true);
  });

  it("keeps scanning a SUSPENDED carrier", () => {
    // Deliberate. A suspended carrier is post-approval, and the reason to keep
    // looking is exactly that we may need to learn about a sanctions hit or a
    // lapsed policy while they are suspended.
    expect(isMonitoredCarrier(carrier({ onboardingStatus: "SUSPENDED", status: "SUSPENDED" }))).toBe(true);
    expect(isMonitoredCarrier(carrier({ onboardingStatus: "SUSPENDED", status: "NEW" }))).toBe(true);
  });

  it("does not widen to carriers the sweeps never covered", () => {
    // This repairs a drift; it does not quietly enlarge who gets scanned.
    // PENDING and REJECTED were never in the population.
    expect(isMonitoredCarrier(carrier({ onboardingStatus: "PENDING", status: "NEW" }))).toBe(false);
    expect(isMonitoredCarrier(carrier({ onboardingStatus: "REJECTED", status: "REJECTED" }))).toBe(false);
    expect(isMonitoredCarrier(carrier({ onboardingStatus: "REVIEWING", status: "REVIEW" }))).toBe(false);
  });

  it("still excludes test accounts and deleted rows", () => {
    expect(isMonitoredCarrier(carrier({ isTestAccount: true }))).toBe(false);
    expect(isMonitoredCarrier(carrier({ deletedAt: new Date() }))).toBe(false);
  });

  it("the SQL fragment spans both enums with an OR", () => {
    const w = monitoredCarrierWhere() as any;
    expect(w.deletedAt).toBeNull();
    expect(w.isTestAccount).toBe(false);
    expect(Array.isArray(w.OR)).toBe(true);
    expect(w.OR).toHaveLength(2);
    // One arm per enum — that IS the fix. A single-arm filter is the bug.
    const keys = w.OR.map((c: Record<string, unknown>) => Object.keys(c)[0]).sort();
    expect(keys).toEqual(["onboardingStatus", "status"]);
  });
});

describe("dispatch eligibility errs EXCLUSIVE", () => {
  it("requires BOTH enums to agree", () => {
    expect(isDispatchableCarrier(carrier({ onboardingStatus: "APPROVED", status: "APPROVED" }))).toBe(true);
    // Opposite direction from monitoring: a disagreement means do NOT offer.
    expect(isDispatchableCarrier(carrier({ onboardingStatus: "SUSPENDED", status: "APPROVED" }))).toBe(false);
    expect(isDispatchableCarrier(carrier({ onboardingStatus: "PENDING", status: "APPROVED" }))).toBe(false);
  });

  it("tolerates NEW on the application side, which the drift left behind", () => {
    // The @default. Narrowing to APPROVED alone is safe only after the
    // drift-repair has run and the writer discipline has held.
    expect(isDispatchableCarrier(carrier({ onboardingStatus: "APPROVED", status: "NEW" }))).toBe(true);
  });

  it("the two predicates genuinely disagree — the split is not cosmetic", () => {
    // If both answered the same thing, one of them would be dead weight.
    const suspended = carrier({ onboardingStatus: "SUSPENDED", status: "SUSPENDED" });
    expect(isMonitoredCarrier(suspended)).toBe(true);
    expect(isDispatchableCarrier(suspended)).toBe(false);
  });

  it("the SQL fragment ANDs rather than ORs", () => {
    const w = dispatchableCarrierWhere() as any;
    expect(w.onboardingStatus).toBe("APPROVED");
    expect(w.status.in).toEqual(["APPROVED", "NEW"]);
    expect(w.OR).toBeUndefined();
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
   * onboardingStatus: "APPROVED" and nothing else, leaving status at NEW, and
   * all four sweeps filtered `status: "APPROVED"`. So the carrier an AE just
   * approved was outside sanctions rescan, insurance-expiry monitoring, CSA
   * scanning and ELD validation — permanently, and silently.
   */
  const approvedTheOldWay = carrier({ onboardingStatus: "APPROVED", status: "NEW" });
  const approvedTheNewWay = carrier({ onboardingStatus: "APPROVED", status: "APPROVED" });

  it("appears in the monitored set even with the pre-fix stale status", () => {
    // Rows written before the fix still exist. They must be scanned without
    // waiting for the drift repair to reach them.
    expect(isMonitoredCarrier(approvedTheOldWay)).toBe(true);
  });

  it("appears in the monitored set once writers pair correctly", () => {
    expect(isMonitoredCarrier(approvedTheNewWay)).toBe(true);
  });

  it("is dispatchable either way, so the fix does not strand anybody", () => {
    // The NEW tolerance in the exclusive rule exists for exactly this row.
    expect(isDispatchableCarrier(approvedTheOldWay)).toBe(true);
    expect(isDispatchableCarrier(approvedTheNewWay)).toBe(true);
  });

  it("the OLD single-field filter would have missed them — the bug, pinned", () => {
    // Reproduces what the four sweeps used to do, so the failure this fix
    // prevents is stated in the suite rather than only in a commit message.
    const oldSweepFilter = (c: { status: string }) => c.status === "APPROVED";
    expect(oldSweepFilter(approvedTheOldWay)).toBe(false);
    expect(isMonitoredCarrier(approvedTheOldWay)).toBe(true);
  });
});

/**
 * The four sweeps must ASK the resolver, not carry their own copy of the rule.
 *
 * Without this, someone re-adds `status: "APPROVED"` to one sweep and every
 * test above keeps passing — the resolver would still be correct, and still be
 * ignored by the one query that mattered. That is the shape of the original
 * defect: a right answer that nothing consulted.
 */
describe("the four compliance sweeps consume the resolver", () => {
  const SWEEPS = [
    { file: "services/ofacScreeningService.ts", what: "weekly sanctions / SDN rescan" },
    { file: "services/insuranceVerificationService.ts", what: "insurance-expiry sweep" },
    { file: "services/csaBasicService.ts", what: "CSA BASIC scan" },
    { file: "services/eldValidationService.ts", what: "ELD validation sweep" },
  ];

  const read = (rel: string) =>
    fs.readFileSync(path.join(__dirname, "../../../src", rel), "utf8").split("\r\n").join("\n");

  it.each(SWEEPS)("$what calls monitoredCarrierWhere()", ({ file }) => {
    expect(read(file)).toContain("monitoredCarrierWhere()");
  });

  it.each(SWEEPS)("$what no longer filters on status alone", ({ file }) => {
    // The literal that caused it. Comments are stripped so the explanation of
    // the old behaviour does not read as the old behaviour.
    const src = read(file)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    expect(src).not.toMatch(/status:\s*"APPROVED"/);
  });
});
