/**
 * Which fall-off records count toward deactivation review — the rule, pinned.
 *
 * Lifecycle-gaps B3c (finding #9), decision 2 of 2026-09-18: a customer_cancel
 * release is RECORDED and does NOT count. The guard also holds the rule
 * complete against carrierReleaseService's own reason list, so a reason added
 * there has a review decision here or the suite goes red.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  countsTowardReview,
  fallOffReasonCode,
  reviewableFallOffCount,
  needsDeactivationReview,
  NO_FAULT_FALL_OFF_REASONS,
  DEACTIVATION_REVIEW_THRESHOLD,
} from "../../../src/lib/fallOffScoring";
import { RELEASE_REASONS } from "../../../src/services/carrierReleaseService";

const BACKEND = path.join(__dirname, "../../..");

describe("countsTowardReview", () => {
  it("#9: a customer_cancel fall-off is kept and does not count", () => {
    expect(countsTowardReview("customer_cancel")).toBe(false);
    expect(countsTowardReview("customer_cancel: shipper pulled the order")).toBe(false);
  });

  it("srl_error never counts (it is never recorded, but the rule is complete)", () => {
    expect(countsTowardReview("srl_error: wrong carrier tendered")).toBe(false);
  });

  it("the carrier's own fall-offs count: carrier_fell_off, compliance_lapse, and rate_dispute (unchanged)", () => {
    expect(countsTowardReview("carrier_fell_off")).toBe(true);
    expect(countsTowardReview("carrier_fell_off: driver quit")).toBe(true);
    expect(countsTowardReview("compliance_lapse: COI expired")).toBe(true);
    expect(countsTowardReview("rate_dispute")).toBe(true);
  });

  it("a legacy free-text reason with no code counts — those rows were only ever written by the carrier-fault path", () => {
    expect(fallOffReasonCode("Carrier cancelled/removed")).toBeNull();
    expect(countsTowardReview("Carrier cancelled/removed")).toBe(true);
    expect(countsTowardReview(null)).toBe(true);
  });

  it("the code is the leading token — a note containing a reason word does not reclassify the row", () => {
    expect(fallOffReasonCode("carrier_fell_off: customer_cancel was mentioned")).toBe("carrier_fell_off");
    expect(countsTowardReview("carrier_fell_off: customer_cancel was mentioned")).toBe(true);
  });
});

describe("the rule is complete against the release reasons", () => {
  it("every ReleaseReason has a decision (vacuity tripwire on the reason list)", () => {
    expect(RELEASE_REASONS.length, "tripwire").toBeGreaterThanOrEqual(5);
    for (const r of RELEASE_REASONS) expect(typeof countsTowardReview(r), r).toBe("boolean");
    for (const r of NO_FAULT_FALL_OFF_REASONS) expect(RELEASE_REASONS, r).toContain(r);
  });
});

describe("reviewableFallOffCount + needsDeactivationReview", () => {
  it("two shipper cancellations beside one carrier fall-off count as one, below the threshold", () => {
    const n = reviewableFallOffCount([{ reason: "customer_cancel" }, { reason: "customer_cancel: x" }, { reason: "carrier_fell_off" }]);
    expect(n).toBe(1);
    expect(needsDeactivationReview(n)).toBe(false);
  });

  it("two of the carrier's own reach the threshold", () => {
    const n = reviewableFallOffCount([{ reason: "carrier_fell_off: a" }, { reason: "compliance_lapse" }]);
    expect(n).toBe(DEACTIVATION_REVIEW_THRESHOLD);
    expect(needsDeactivationReview(n)).toBe(true);
  });
});

describe("a cancellation records no fall-off — the cancel path cannot reach a writer", () => {
  // FallOffEvent has exactly two writers: carrierReleaseService (the release)
  // and, before B3c, fallOffRecovery (now the release's own event). The
  // status-cancel path is loadController → cancelCascade + onLoadCancelledOrTONU,
  // and none of the three imports either writer. Comments stripped: cancelCascade
  // mentions the release service in prose to say it is NOT called.
  const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const CANCEL_PATH = ["src/controllers/loadController.ts", "src/services/cancelCascade.ts", "src/services/integrationService.ts"];

  it("none of the cancel-path files imports carrierReleaseService or fallOffRecovery, or writes fallOffEvent", () => {
    for (const f of CANCEL_PATH) {
      const src = strip(fs.readFileSync(path.join(BACKEND, f), "utf8"));
      expect(src, `${f} imports the release service`).not.toMatch(/from "\.\.\/services\/carrierReleaseService"|from "\.\/carrierReleaseService"/);
      expect(src, `${f} imports fall-off recovery`).not.toMatch(/fallOffRecovery"/);
      expect(src, `${f} writes a fall-off`).not.toMatch(/fallOffEvent\.create/);
    }
  });

  it("scanner self-test: the writer pattern is findable in the release service (vacuity tripwire)", () => {
    const src = strip(fs.readFileSync(path.join(BACKEND, "src/services/carrierReleaseService.ts"), "utf8"));
    expect(src).toMatch(/fallOffEvent\.create/);
    expect(src).toMatch(/from "\.\.\/config\/database"/);
  });
});
