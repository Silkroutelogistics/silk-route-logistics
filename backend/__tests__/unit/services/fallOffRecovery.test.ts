/**
 * Fall-off recovery records ONE fall-off and flags review on the carrier's own.
 *
 * Lifecycle-gaps B3c (finding #9). Two defects lived in executeFallOffRecovery:
 * it created its own FallOffEvent and then called releaseCarrier, which records
 * one too — so every fall-off through this path was counted twice and the
 * "2+ fall-offs" review flag fired on a carrier's FIRST; and the counter read
 * every reason, so two shipper cancellations flagged a blameless carrier.
 *
 * releaseCarrier is mocked here as the recorder it is; what is asserted is that
 * THIS function writes no second record, updates the release's own event, and
 * counts through lib/fallOffScoring.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/services/carrierReleaseService", () => ({
  releaseCarrier: vi.fn(),
  RELEASE_REASONS: ["carrier_fell_off", "compliance_lapse", "rate_dispute", "customer_cancel", "srl_error"],
}));
vi.mock("../../../src/services/smartMatchService", () => ({ matchCarriersForLoad: vi.fn().mockResolvedValue({ matches: [] }) }));
vi.mock("../../../src/services/carrierAssignmentService", () => ({ assignCarrier: vi.fn() }));
vi.mock("../../../src/services/emailService", () => ({ sendFallOffAlertEmail: vi.fn().mockResolvedValue(undefined) }));

import { prisma } from "../../../src/config/database";
import { releaseCarrier } from "../../../src/services/carrierReleaseService";
import { executeFallOffRecovery } from "../../../src/services/fallOffRecovery";

const p = prisma as any;
const release = vi.mocked(releaseCarrier);

function load(carrierId: string | null = "u-carrier") {
  return {
    id: "load-1", referenceNumber: "SRL-1", carrierId, posterId: "u-ae",
    originCity: "A", originState: "AA", destCity: "B", destState: "BB", pickupDate: new Date(), carrierRate: 1000,
    carrier: carrierId ? { id: carrierId, firstName: "P", lastName: "T", company: "PEACE TRANSPORT", carrierProfile: {} } : null,
    poster: { id: "u-ae", email: "ae@srl.test", firstName: "AE" },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  p.load.findUnique.mockResolvedValue(load());
  p.carrierProfile.findFirst.mockResolvedValue({ id: "cp-1", companyName: "PEACE TRANSPORT", notes: "" });
  p.carrierProfile.update.mockResolvedValue({});
  p.notification.create.mockResolvedValue({});
  p.fallOffEvent.update.mockResolvedValue({});
  p.fallOffEvent.findMany.mockResolvedValue([]);
  release.mockResolvedValue({ released: true, tenderId: "t-1", rcVoided: 0, faultRecorded: true, fallOffEventId: "ev-release", returnedTo: "loadboard" });
});

const reviewNotices = () =>
  p.notification.create.mock.calls.filter((c: any[]) => String(c[0]?.data?.title ?? "").includes("Deactivation Review"));

describe("executeFallOffRecovery — one record", () => {
  it("writes NO FallOffEvent of its own; the release is the recorder, and its event is the one updated", async () => {
    const r = await executeFallOffRecovery("load-1", "driver quit");
    expect(p.fallOffEvent.create).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledWith({ loadId: "load-1", reason: "carrier_fell_off", note: "driver quit" });
    expect(p.fallOffEvent.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "ev-release" } }));
    expect(r.eventId).toBe("ev-release");
  });

  it("a load with no carrier releases nothing and updates no event, without throwing", async () => {
    p.load.findUnique.mockResolvedValue(load(null));
    release.mockResolvedValue({ released: false, tenderId: null, rcVoided: 0, faultRecorded: false, fallOffEventId: null, returnedTo: "none" });
    const r = await executeFallOffRecovery("load-1");
    expect(p.fallOffEvent.create).not.toHaveBeenCalled();
    expect(p.fallOffEvent.update).not.toHaveBeenCalled();
    expect(r.eventId).toBeNull();
  });
});

describe("executeFallOffRecovery — the review flag counts the carrier's own fall-offs", () => {
  it("#9: one carrier fall-off beside two customer cancellations does NOT flag review", async () => {
    p.fallOffEvent.findMany.mockResolvedValue([
      { reason: "customer_cancel: shipper pulled it" },
      { reason: "customer_cancel" },
      { reason: "carrier_fell_off: driver quit" },
    ]);
    await executeFallOffRecovery("load-1", "driver quit");
    expect(reviewNotices()).toHaveLength(0);
  });

  it("two of the carrier's own DO flag review, and the notice states the count is theirs", async () => {
    p.fallOffEvent.findMany.mockResolvedValue([{ reason: "carrier_fell_off: a" }, { reason: "carrier_fell_off: b" }, { reason: "customer_cancel" }]);
    await executeFallOffRecovery("load-1");
    const notices = reviewNotices();
    expect(notices).toHaveLength(1);
    expect(notices[0][0].data.message).toMatch(/2 fall-offs of their own/);
  });

  it("the first fall-off on a clean carrier no longer flags review (the double record used to make it 2)", async () => {
    p.fallOffEvent.findMany.mockResolvedValue([{ reason: "carrier_fell_off: first ever" }]);
    await executeFallOffRecovery("load-1");
    expect(reviewNotices()).toHaveLength(0);
  });
});
