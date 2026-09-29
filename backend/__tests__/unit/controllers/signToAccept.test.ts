/**
 * Item 342 (v3.8.bom) — accepting a direct offer IS signing its rate
 * confirmation.
 *
 * An offer that went out with its RC is refused a bare accept and taken
 * through the signing page instead, which delegates here with viaSignature. An
 * AE accepting on the carrier's behalf is not the carrier's signature, so the
 * RC goes to the carrier to sign: issued at accept for a counter (ruling 3),
 * re-sent for one issued with the offer.
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
const autoGenerateRateConfirmation = vi.fn().mockResolvedValue({ id: "rc-draft" });
vi.mock("../../../src/services/autoRateConfirmationService", () => ({
  autoGenerateRateConfirmation: (...a: unknown[]) => autoGenerateRateConfirmation(...a),
}));
vi.mock("../../../src/services/rateConfirmationVoidService", () => ({
  voidLiveRateConfirmations: vi.fn().mockResolvedValue({ count: 0 }),
}));
const recordElection = vi.fn().mockResolvedValue({ ok: true });
vi.mock("../../../src/services/quickPayElectionService", () => ({
  voidForTender: vi.fn().mockResolvedValue(undefined),
  record: (...a: unknown[]) => recordElection(...a),
}));
const autoIssue = vi.fn().mockResolvedValue({ issued: true, rateConfirmationId: "rc-x" });
vi.mock("../../../src/services/rateConfirmationAutoIssue", () => ({
  autoIssueRateConfirmation: (...a: unknown[]) => autoIssue(...a),
}));

import { prisma } from "../../../src/config/database";
import { acceptTender, acceptTenderOnBehalf } from "../../../src/controllers/tenderController";

const mockPrisma = prisma as any;

function req(overrides: Record<string, unknown> = {}) {
  return {
    params: { id: "t-1" },
    body: {},
    user: { id: "u-carrier", email: "c@srl.invalid", role: "CARRIER" },
    ...overrides,
  } as never;
}
function res() {
  const r: any = { statusCode: 200, body: null };
  r.status = vi.fn((c: number) => { r.statusCode = c; return r; });
  r.json = vi.fn((d: unknown) => { r.body = d; return r; });
  return r;
}
function tender(status = "OFFERED") {
  return {
    id: "t-1", loadId: "load-1", carrierId: "cp-1", status, offeredRate: 1500, counterRate: status === "COUNTERED" ? 1650 : null,
    expiresAt: null, carrier: { id: "cp-1", userId: "u-carrier" },
  };
}
/** The RC issued with the offer, or none. */
function offerRc(present: boolean) {
  mockPrisma.rateConfirmation.findFirst = vi.fn(async ({ where }: any) =>
    present && where.status === "SENT" ? { id: "rc-offer" } : where.status?.in ? { id: present ? "rc-offer" : "rc-draft" } : null,
  );
}
const ON_BEHALF_BODY = { reason: "carrier agreed on the phone", evidenceType: "call_timestamp", evidenceRef: "2026-09-29 10:14" };

beforeEach(() => {
  vi.clearAllMocks();
  stampCarrierAcceptance.mockResolvedValue({ stamped: true });
  assignCarrier.mockResolvedValue(undefined);
  mockPrisma.loadTender.findUnique = vi.fn().mockResolvedValue(tender());
  mockPrisma.load.findUnique = vi.fn().mockResolvedValue({ id: "load-1", status: "TENDERED", posterId: "ae-1", carrierRate: 1500 });
  mockPrisma.loadTender.findUniqueOrThrow = vi.fn().mockResolvedValue({ id: "t-1", status: "ACCEPTED" });
  mockPrisma.shipment.create = vi.fn().mockResolvedValue({ id: "s-1" });
  mockPrisma.carrierProfile.findUnique = vi.fn().mockResolvedValue({ tier: "SILVER", quickPayVersion: "v1" });
  mockPrisma.auditLog.create = vi.fn().mockResolvedValue({});
  mockPrisma.$transaction.mockImplementation(async (arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(mockPrisma)));
  offerRc(false);
});

describe("a direct offer is accepted by signing its rate confirmation", () => {
  it("refuses a bare self-accept when the RC was issued with the offer, and books nothing", async () => {
    offerRc(true);
    const r = res();
    await acceptTender(req(), r);
    expect(r.statusCode).toBe(409);
    expect(r.body.code).toBe("SIGN_TO_ACCEPT");
    expect(r.body.rateConfirmationId).toBe("rc-offer");
    expect(assignCarrier).not.toHaveBeenCalled();
    expect(mockPrisma.shipment.create).not.toHaveBeenCalled();
  });

  it("the signing page's accept goes through and does not stack a second draft", async () => {
    offerRc(true);
    const r = res();
    await acceptTender(req({ viaSignature: { rateConfirmationId: "rc-offer" } }), r);
    expect(r.statusCode).toBe(200);
    expect(assignCarrier).toHaveBeenCalledTimes(1);
    expect(autoGenerateRateConfirmation).not.toHaveBeenCalled();
  });

  it("an offer with no RC issued is accepted as before, and drafts at accept", async () => {
    const r = res();
    await acceptTender(req(), r);
    expect(r.statusCode).toBe(200);
    expect(autoGenerateRateConfirmation).toHaveBeenCalledTimes(1);
  });
});

describe("an AE accepting on the carrier's behalf sends the RC to the carrier to sign", () => {
  it("ISSUES the counter's rate confirmation at accept (ruling 3)", async () => {
    mockPrisma.loadTender.findUnique = vi.fn().mockResolvedValue(tender("COUNTERED"));
    const r = res();
    await acceptTenderOnBehalf(req({ user: { id: "ae-1", role: "ADMIN" }, body: ON_BEHALF_BODY }), r);
    expect(r.statusCode).toBe(200);
    expect(autoIssue).toHaveBeenCalledWith("load-1", "rc-draft", "ae-1");
    expect(r.body.rateConfirmationIssued).toBe(true);
  });

  it("re-sends an RC issued with the offer, and ignores a late Quick Pay election", async () => {
    offerRc(true);
    const r = res();
    await acceptTenderOnBehalf(req({ user: { id: "ae-1", role: "ADMIN" }, body: { ...ON_BEHALF_BODY, quickPaySpeed: "SAME_DAY" } }), r);
    expect(r.statusCode).toBe(200);
    expect(recordElection).not.toHaveBeenCalled();
    expect(autoIssue).toHaveBeenCalledWith("load-1", "rc-offer", "ae-1");
  });

  it("a plain offer with no RC issued keeps the draft for the AE to send", async () => {
    const r = res();
    await acceptTenderOnBehalf(req({ user: { id: "ae-1", role: "ADMIN" }, body: ON_BEHALF_BODY }), r);
    expect(r.statusCode).toBe(200);
    expect(autoIssue).not.toHaveBeenCalled();
    expect(r.body.rateConfirmationIssued).toBe(false);
  });
});
