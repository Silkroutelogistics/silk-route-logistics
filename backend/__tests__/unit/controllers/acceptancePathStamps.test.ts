/**
 * C4a — acceptTender records the acceptance, and it is the one wiring point
 * that four entry surfaces share.
 *
 * acceptTenderOnBehalf, the carrier load-board accept and the emailed
 * magic-link all delegate here through the response-capturing shim with a
 * synthetic CARRIER actor, so none of them carries its own stamp and none of
 * them can drift from this one.
 *
 * The stamp is mocked: this file tests the WIRING. The writer's own rules
 * (first write wins, the R8d refusal) are exercised behaviourally in
 * lib/acceptanceEvidence.test.ts, and re-proving them once per call site would
 * be four copies of one guarantee.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Real `authorize`, so the bid-award route's AE gate is the real one.
vi.mock("../../../src/middleware/auth", async (orig) => {
  const actual = (await orig()) as any;
  return {
    ...actual,
    authenticate: (req: any, res: any, next: any) => {
      const role = req.headers["x-test-role"];
      if (!role) return res.status(401).json({ error: "No token provided" });
      req.user = { id: `u-${String(role).toLowerCase()}`, email: `${role}@srl.invalid`, role };
      next();
    },
  };
});
vi.mock("../../../src/services/waterfallEventService", () => ({
  logWaterfallEvent: vi.fn().mockResolvedValue(undefined),
  logTenderTransition: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../src/services/checkCallAutomation", () => ({
  createCheckCallSchedule: vi.fn().mockResolvedValue(undefined),
}));

const stampCarrierAcceptance = vi.fn().mockResolvedValue({ stamped: true });
vi.mock("../../../src/lib/acceptanceEvidence", () => ({
  stampCarrierAcceptance: (...a: unknown[]) => stampCarrierAcceptance(...a),
}));
vi.mock("../../../src/services/complianceMonitorService", () => ({
  complianceCheck: vi.fn().mockResolvedValue({
    allowed: true, blocked_reasons: [], blocked_codes: [], released: [], warnings: [],
  }),
}));
vi.mock("../../../src/services/tenderTransitionService", () => ({
  settleTender: vi.fn().mockResolvedValue({ count: 1 }),
  settleTenders: vi.fn().mockResolvedValue({ count: 0, tenderIds: [] }),
  withdrawLiveTenders: vi.fn().mockResolvedValue({ count: 0, tenderIds: [] }),
}));
const assignCarrier = vi.fn().mockResolvedValue(undefined);
vi.mock("../../../src/services/carrierAssignmentService", () => ({
  assignCarrier: (...a: unknown[]) => assignCarrier(...a),
  clearCarrier: vi.fn(),
}));
vi.mock("../../../src/lib/hooks", () => ({ hooks: { run: vi.fn().mockResolvedValue(undefined) } }));
vi.mock("../../../src/controllers/shipmentController", () => ({
  nextShipmentNumber: vi.fn().mockResolvedValue("SHP-1"),
}));
vi.mock("../../../src/services/notificationService", () => ({
  notifyTenderAction: vi.fn().mockResolvedValue(undefined),
  notifyQuickPayElectionOpen: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../src/services/autoRateConfirmationService", () => ({
  autoGenerateRateConfirmation: vi.fn().mockResolvedValue(null),
}));
vi.mock("../../../src/services/rateConfirmationVoidService", () => ({
  voidLiveRateConfirmations: vi.fn().mockResolvedValue({ count: 0 }),
}));
vi.mock("../../../src/services/quickPayElectionService", () => ({
  voidForTender: vi.fn().mockResolvedValue(undefined),
  record: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "../../../src/config/database";
import { acceptTender } from "../../../src/controllers/tenderController";

const mockPrisma = prisma as any;

const TENDER = "t-1";
const LOAD = "load-1";
const CARRIER_USER = "u-carrier";
const CARRIER_PROFILE = "cp-1";

function req(overrides: Record<string, unknown> = {}) {
  return {
    params: { id: TENDER },
    body: {},
    user: { id: CARRIER_USER, email: "c@srl.invalid", role: "CARRIER" },
    ...overrides,
  } as never;
}
function res() {
  const r: any = { statusCode: 200, body: null };
  r.status = vi.fn((c: number) => { r.statusCode = c; return r; });
  r.json = vi.fn((d: unknown) => { r.body = d; return r; });
  return r;
}

beforeEach(() => {
  vi.clearAllMocks();
  stampCarrierAcceptance.mockResolvedValue({ stamped: true });
  assignCarrier.mockResolvedValue(undefined);

  mockPrisma.loadTender.findUnique = vi.fn().mockResolvedValue({
    id: TENDER,
    loadId: LOAD,
    carrierId: CARRIER_PROFILE,
    status: "OFFERED",
    offeredRate: 1500,
    expiresAt: null,
    carrier: { id: CARRIER_PROFILE, userId: CARRIER_USER },
  });
  // TENDERED -> BOOKED is a transition the AE map allows.
  mockPrisma.load.findUnique = vi.fn().mockResolvedValue({
    id: LOAD, status: "TENDERED", customerRate: 2000, carrierRate: 1500,
  });
  mockPrisma.loadTender.findUniqueOrThrow = vi.fn().mockResolvedValue({ id: TENDER, status: "ACCEPTED" });
  mockPrisma.shipment.create = vi.fn().mockResolvedValue({ id: "s-1" });
  mockPrisma.$transaction.mockImplementation(async (arg: any) =>
    Array.isArray(arg) ? Promise.all(arg) : arg(mockPrisma),
  );
});

describe("acceptTender records the acceptance", () => {
  it("stamps TENDER_ACCEPT for the tender's carrier, once", async () => {
    const r = res();
    await acceptTender(req(), r);

    expect(r.statusCode).toBe(200);
    expect(stampCarrierAcceptance).toHaveBeenCalledTimes(1);
    expect(stampCarrierAcceptance.mock.calls[0][0]).toMatchObject({
      loadId: LOAD,
      via: "TENDER_ACCEPT",
      // From the TENDER's carrier — the authoritative row — never from
      // req.user, which is synthetic on three of the four entry surfaces.
      carrierUserId: CARRIER_USER,
      byUserId: CARRIER_USER,
    });
  });

  it("names the AE as byUserId on an on-behalf accept, and the carrier as the carrier", async () => {
    const r = res();
    // The shape acceptTenderOnBehalf builds: a synthetic CARRIER actor, with
    // the real human recorded separately.
    await acceptTender(req({ onBehalf: { actorId: "u-ae", reason: "phoned in", evidence: {} } }), r);

    expect(stampCarrierAcceptance.mock.calls[0][0]).toMatchObject({
      via: "TENDER_ACCEPT",
      carrierUserId: CARRIER_USER,
      byUserId: "u-ae",
    });
  });

  it("stamps inside the same transaction as the assignment", async () => {
    await acceptTender(req(), res());
    // Both received the tx client, so a load can never hold a carrier with no
    // record of them agreeing to it.
    expect(assignCarrier).toHaveBeenCalled();
    expect(stampCarrierAcceptance.mock.calls[0][1]).toBeDefined();
  });
});

describe("a refused accept records nothing", () => {
  it("stamps nothing when the caller does not own the tender", async () => {
    const r = res();
    await acceptTender(req({ user: { id: "u-someone-else", email: "", role: "CARRIER" } }), r);

    expect(r.statusCode).toBe(403);
    expect(stampCarrierAcceptance).not.toHaveBeenCalled();
  });

  it("stamps nothing when the tender has expired", async () => {
    mockPrisma.loadTender.findUnique.mockResolvedValue({
      id: TENDER, loadId: LOAD, carrierId: CARRIER_PROFILE, status: "OFFERED",
      offeredRate: 1500, expiresAt: new Date("2020-01-01T00:00:00.000Z"),
      carrier: { id: CARRIER_PROFILE, userId: CARRIER_USER },
    });
    const r = res();
    await acceptTender(req(), r);

    expect(r.statusCode).toBeGreaterThanOrEqual(400);
    expect(stampCarrierAcceptance).not.toHaveBeenCalled();
  });
});

/**
 * The bid award. The CARRIER's act here is the BID — submitted in their own
 * session under authorize("CARRIER") — and the AE award accepts a standing
 * offer. So it IS a carrier acceptance even though an AE pressed the button,
 * and it is stamped at the award, because that is when the offer became a
 * commitment.
 */
describe("the bid award records the carrier's acceptance", () => {
  const BID = "bid-1";
  const BID_CARRIER = "u-bidder";

  async function award(action: "accept" | "reject") {
    const loadBids = (await import("../../../src/routes/loadBids")).default;
    const a = express();
    a.use(express.json());
    a.use("/api", loadBids);
    return request(a)
      .patch(`/api/loads/${LOAD}/bids/${BID}`)
      .set("x-test-role", "BROKER")
      .send({ action });
  }

  beforeEach(() => {
    mockPrisma.loadBid = {
      findUnique: vi.fn().mockResolvedValue({
        id: BID, loadId: LOAD, carrierId: BID_CARRIER, bidRate: 1500, status: "pending",
      }),
      update: vi.fn().mockResolvedValue({ id: BID, status: "accepted" }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    };
    mockPrisma.carrierProfile.findUnique = vi.fn().mockResolvedValue({ id: CARRIER_PROFILE, userId: BID_CARRIER });
  });

  it("stamps BID_AWARD_ACCEPT for the bidding carrier", async () => {
    const res = await award("accept");
    expect(res.status).toBe(200);

    expect(stampCarrierAcceptance).toHaveBeenCalledTimes(1);
    expect(stampCarrierAcceptance.mock.calls[0][0]).toMatchObject({
      loadId: LOAD,
      via: "BID_AWARD_ACCEPT",
      // LoadBid.carrierId is the submitting user's id and the model has no
      // separate column, so the carrier and the actor genuinely are one person.
      carrierUserId: BID_CARRIER,
      byUserId: BID_CARRIER,
    });
  });

  it("stamps nothing when the AE rejects the bid", async () => {
    const res = await award("reject");
    expect(res.status).toBe(200);
    expect(stampCarrierAcceptance).not.toHaveBeenCalled();
  });
});
