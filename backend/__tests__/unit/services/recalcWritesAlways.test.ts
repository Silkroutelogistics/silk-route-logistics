/**
 * The weekly Compass recalc writes a scorecard row for every carrier it
 * selects, so a run is distinguishable from a run that never happened.
 *
 * WHY THIS EXISTS. On Sunday 2026-09-06 the recalc produced no rows at all.
 * The job was registered (cron/index.ts:376), initCronJobs is called
 * unconditionally (server.ts:303), withGuard did not suppress it, and the
 * selection returned both APPROVED carriers. It wrote nothing because
 * `recalculateCarrierCPP` returned at `if (loads.length === 0) return;` before
 * reaching its create, and production has no loads at all. Nothing on any path
 * of that job writes to the database, so a run, a skip and a crash were
 * indistinguishable afterwards.
 *
 * A carrier with no loads is a carrier whose load-derived factors are
 * UNMEASURED. That is a fact worth recording, not a reason to record nothing.
 *
 * THE TRAP THIS GUARDS. Simply deleting the early return would have been worse
 * than the bug. `communicationScore` computed `respondedChecks / (length || 1)`,
 * so a carrier nobody had ever called scored 0% communication; `acceptanceRate`
 * did the same with tenders, and §9 weights that at 10% of the composite. Both
 * would have persisted a false measurement, which is precisely the defect
 * v3.8.bax fixed for tracking, pointing the other way. Every factor is now null
 * when its denominator is zero, the composite renormalises over what remains,
 * and the non-nullable columns receive the 0 sentinel.
 *
 * Phase 1 of the mandatory-ELD arc. checkGuestPromotion and the 3-load band are
 * deliberately untouched here: that path is the §10 M1 advancement gate and is
 * banked as its own item.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/config/database", () => ({
  prisma: {
    carrierProfile: { findUnique: vi.fn(), update: vi.fn() },
    load: { findMany: vi.fn(), count: vi.fn() },
    checkCallSchedule: { findMany: vi.fn() },
    paymentDispute: { count: vi.fn() },
    document: { findMany: vi.fn() },
    loadTender: { findMany: vi.fn() },
    loadTrackingEvent: { findMany: vi.fn() },
    invoice: { aggregate: vi.fn() },
    carrierScorecard: { create: vi.fn() },
    carrierBonus: { create: vi.fn() },
    notification: { create: vi.fn() },
  },
}));

import { prisma } from "../../../src/config/database";
import { recalculateCarrierCPP } from "../../../src/services/integrationService";

const p = vi.mocked(prisma) as any;

function profile(over: Record<string, unknown> = {}) {
  return {
    id: "cp_1",
    userId: "u_1",
    tier: "SILVER",
    cppTier: "SILVER",
    eldEnabled: false,
    user: { id: "u_1", firstName: "Test", company: "Test Carrier" },
    scorecards: [],
    ...over,
  };
}

/** Nothing measurable anywhere: no loads, no calls, no tenders, no docs. */
function emptyWorld() {
  p.load.findMany.mockResolvedValue([]);
  p.load.count.mockResolvedValue(0);
  p.checkCallSchedule.findMany.mockResolvedValue([]);
  p.paymentDispute.count.mockResolvedValue(0);
  p.document.findMany.mockResolvedValue([]);
  p.loadTender.findMany.mockResolvedValue([]);
  p.loadTrackingEvent.findMany.mockResolvedValue([]);
  p.invoice.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
}

const written = () => p.carrierScorecard.create.mock.calls[0][0].data;

describe("recalculateCarrierCPP writes on every run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emptyWorld();
  });

  it("writes a scorecard row for a carrier with zero loads", async () => {
    p.carrierProfile.findUnique.mockResolvedValue(profile());

    await recalculateCarrierCPP("cp_1");

    expect(
      p.carrierScorecard.create,
      "a carrier with no loads must still produce a row, or a run is indistinguishable from a skip",
    ).toHaveBeenCalledTimes(1);
    expect(written().carrierId).toBe("cp_1");
  });

  it("persists every unmeasured factor as the 0 sentinel, never as a score", async () => {
    p.carrierProfile.findUnique.mockResolvedValue(profile());

    await recalculateCarrierCPP("cp_1");

    const row = written();
    for (const k of [
      "onTimePickupPct",
      "onTimeDeliveryPct",
      "communicationScore",
      "claimRatio",
      "documentSubmissionTimeliness",
      "acceptanceRate",
      "gpsCompliancePct",
    ]) {
      expect(row[k], `${k} must be the sentinel, not a fabricated value`).toBe(0);
      expect(Number.isNaN(row[k]), `${k} must not be NaN`).toBe(false);
    }
  });

  it("scores 0 overall when nothing was measured, rather than inventing a number", async () => {
    p.carrierProfile.findUnique.mockResolvedValue(profile());

    await recalculateCarrierCPP("cp_1");

    // Every term is null, so the composite has no weight to renormalise over.
    // 0 here is the sentinel, and readers gate on measurability, exactly as
    // they already do for the tracking column.
    expect(written().overallScore).toBe(0);
  });

  it("still writes for a GUEST carrier below the promotion threshold", async () => {
    // checkGuestPromotion returns false under 3 completed loads, so the GUEST
    // branch falls through rather than swallowing the run. The promotion path
    // itself is untouched: this asserts it does not eat the write, not that it
    // behaves any differently.
    p.carrierProfile.findUnique.mockResolvedValue(profile({ tier: "GUEST", cppTier: "GUEST" }));
    p.load.count.mockResolvedValue(0);

    await recalculateCarrierCPP("cp_1");

    expect(p.carrierProfile.update, "no promotion should have fired").not.toHaveBeenCalled();
    expect(p.carrierScorecard.create).toHaveBeenCalledTimes(1);
  });

  it("an absent denominator is excluded from the composite, not scored as zero", async () => {
    // THIS IS THE ASSERTION THAT CATCHES THE `|| 1` DEFECT, and the reason the
    // sentinel checks above cannot: an unmeasured factor persists as 0 and a
    // falsely-measured one persists as 0 too, so the column is blind to the
    // difference. Only the composite can see it.
    //
    // One load, no check calls, no tenders. claimRatio is measurable (0 claims
    // against 1 load); communication and acceptance are not. Correct behaviour
    // renormalises over claimRatio alone and reads 100. The `|| 1` denominator
    // would fold two invented zeroes into the composite and drag it to ~42.86.
    p.carrierProfile.findUnique.mockResolvedValue(profile());
    p.load.findMany.mockResolvedValue([
      { id: "l_1", pickupDate: null, deliveryDate: null, status: "DELIVERED", createdAt: new Date(), updatedAt: new Date(), pickupTimeEnd: null, deliveryTimeEnd: null, actualPickupDatetime: null, actualDeliveryDatetime: null },
    ]);

    await recalculateCarrierCPP("cp_1");

    expect(
      written().overallScore,
      "communication and acceptance were never measured and must not be scored as 0",
    ).toBe(100);
  });

  it("does not regress the measured path: real denominators still score", async () => {
    // The `|| 1` denominators were the trap. With real activity the numbers
    // must be unchanged, so this is the other half of the guard.
    p.carrierProfile.findUnique.mockResolvedValue(profile());
    p.load.findMany.mockResolvedValue([
      { id: "l_1", pickupDate: null, deliveryDate: null, status: "DELIVERED", createdAt: new Date(), updatedAt: new Date(), pickupTimeEnd: null, deliveryTimeEnd: null, actualPickupDatetime: null, actualDeliveryDatetime: null },
    ]);
    p.checkCallSchedule.findMany.mockResolvedValue([{ status: "RESPONDED" }, { status: "RESPONDED" }]);
    p.loadTender.findMany.mockResolvedValue([{ status: "ACCEPTED" }, { status: "DECLINED" }]);

    await recalculateCarrierCPP("cp_1");

    const row = written();
    expect(row.communicationScore, "2 of 2 answered is 100, not 0").toBe(100);
    expect(row.acceptanceRate, "1 of 2 accepted is 50").toBe(50);
    expect(row.claimRatio, "no claims against one load is a measured 0").toBe(0);
    expect(row.overallScore, "renormalised over the three measured factors").toBeGreaterThan(0);
  });
});
