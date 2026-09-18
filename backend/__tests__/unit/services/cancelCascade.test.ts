/**
 * The cancellation cascade.
 *
 * `deleteLoad` cascades deletedAt to THREE of Load's thirty-one children. Two of
 * the survivors are live surfaces, not dormant rows: a Shipment left IN_TRANSIT
 * kept runLateDetection emailing every 30 minutes, and the tracking token kept
 * the public page open — both verified against production on 2026-09-02.
 *
 * The cases that matter are the negative ones. "Cancels the shipment" is easy to
 * satisfy; "does NOT fire on a DELIVERED status change" and "does NOT touch
 * carrierId" are the ones that stop this becoming a second, quieter path for
 * releasing a carrier.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "fs";
import path from "path";
// The controller's OTHER side effects are mocked so that driving deleteLoad and
// updateLoadStatus exercises the real cascade — the point of the "both call
// paths" block below, which used to read the controller as text.
vi.mock("../../../src/services/invoiceService", () => ({ autoGenerateInvoice: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../../src/services/mileageService", () => ({ calculateMileage: vi.fn().mockResolvedValue({ practical_miles: 1, drive_time_hours: 1 }) }));
vi.mock("../../../src/services/shipperNotificationService", () => ({
  sendShipperPickupEmail: vi.fn().mockResolvedValue(undefined), sendShipperDeliveryEmail: vi.fn().mockResolvedValue(undefined),
  sendShipperMilestoneEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../src/services/integrationService", () => ({
  onLoadDelivered: vi.fn().mockResolvedValue(undefined), onLoadDispatched: vi.fn().mockResolvedValue(undefined), onLoadCancelledOrTONU: vi.fn().mockResolvedValue(undefined),
  enforceShipperCredit: vi.fn().mockResolvedValue({ allowed: true }),
}));
vi.mock("../../../src/services/tonuBillingService", () => ({ recordTonuObligation: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../../src/services/aiLearningLoop/feedbackCollector", () => ({ onLoadStatusChange: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../../src/validators/load", () => ({
  createLoadSchema: { parse: (v: any) => v }, updateLoadStatusSchema: { parse: (v: any) => v },
  loadQuerySchema: { parse: (v: any) => v },
}));
import { cascadeLoadCancellation, CASCADE_EVENT_TYPE } from "../../../src/services/cancelCascade";
import { VOIDABLE_EXCLUSIONS } from "../../../src/services/rateConfirmationVoidService";
import { deleteLoad, updateLoadStatus } from "../../../src/controllers/loadController";
import { prisma } from "../../../src/config/database";

const mockPrisma = prisma as any;
const SRC = path.resolve(__dirname, "../../../src");
const cascadeSrc = fs.readFileSync(path.join(SRC, "services/cancelCascade.ts"), "utf8");

function codeOnly(s: string): string {
  return s.replace(new RegExp("/\\*[\\s\\S]*?\\*/", "g"), "").replace(new RegExp("^[ \\t]*//.*$", "gm"), "");
}

beforeEach(() => {
  vi.clearAllMocks();
  // Explicit resolved values: clearAllMocks resets call history but NOT a queued
  // mockResolvedValue, so a count leaking from a previous case would read as
  // cascade logic (v3.8.alh).
  mockPrisma.shipment.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.load.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.shipperTrackingToken.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.rateConfirmation.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.loadActivity.create.mockResolvedValue(null);
});

describe("what the cascade stops", () => {
  it("cancels every shipment on the load, not just the first", async () => {
    // The status path already synced ONE shipment via findFirst. updateMany is
    // the difference: a load with two shipments left the second one running.
    mockPrisma.shipment.updateMany.mockResolvedValue({ count: 2 });
    const r = await cascadeLoadCancellation("load-1", mockPrisma);
    expect(r.shipmentsCancelled).toBe(2);
    const [arg] = mockPrisma.shipment.updateMany.mock.calls[0];
    expect(arg.where).toMatchObject({ loadId: "load-1", status: { not: "CANCELLED" } });
    expect(arg.data.status).toBe("CANCELLED");
  });

  it("nulls the public tracking token", async () => {
    mockPrisma.load.updateMany.mockResolvedValue({ count: 1 });
    const r = await cascadeLoadCancellation("load-1", mockPrisma);
    expect(r.trackingTokenCleared).toBe(true);
    const [arg] = mockPrisma.load.updateMany.mock.calls[0];
    expect(arg.where).toMatchObject({ id: "load-1", trackingToken: { not: null } });
    expect(arg.data.trackingToken).toBeNull();
  });

  it("EXPIRES shipper tracking rows rather than deleting them", async () => {
    // The record of what was issued, and to whom, outlives the link it granted.
    mockPrisma.shipperTrackingToken.updateMany.mockResolvedValue({ count: 3 });
    const r = await cascadeLoadCancellation("load-1", mockPrisma);
    expect(r.shipperTokensExpired).toBe(3);
    const [arg] = mockPrisma.shipperTrackingToken.updateMany.mock.calls[0];
    expect(arg.data.expiresAt).toBeInstanceOf(Date);
    expect(codeOnly(cascadeSrc)).not.toContain("shipperTrackingToken.deleteMany");
  });

  it("writes exactly one LoadActivity row tagged cancel_cascade", async () => {
    await cascadeLoadCancellation("load-1", mockPrisma, { reason: "test load" });
    expect(mockPrisma.loadActivity.create).toHaveBeenCalledTimes(1);
    const [arg] = mockPrisma.loadActivity.create.mock.calls[0];
    expect(arg.data.eventType).toBe(CASCADE_EVENT_TYPE);
    expect(arg.data.loadId).toBe("load-1");
    expect(arg.data.metadata).toMatchObject({ reason: "test load" });
  });
});

describe("what the cascade must NOT do", () => {
  it("never writes carrierId", async () => {
    // Assignment is written by carrierAssignmentService and released by
    // carrierReleaseService, which settles the tender, voids live paper and
    // records a fall-off. Clearing it here would do a tenth of that silently and
    // mark a carrier as having fallen off a load SRL cancelled.
    await cascadeLoadCancellation("load-1", mockPrisma);
    for (const [arg] of mockPrisma.load.updateMany.mock.calls) {
      expect(JSON.stringify(arg.data)).not.toContain("carrierId");
    }
    expect(codeOnly(cascadeSrc)).not.toContain("carrierId");
  });

  it("does not delete anything — every write is an update", async () => {
    const code = codeOnly(cascadeSrc);
    expect(code).not.toContain(".delete(");
    expect(code).not.toContain(".deleteMany(");
    expect(code).toContain("updateMany"); // vacuity tripwire
  });
});

describe("idempotence", () => {
  it("a second call moves nothing, because every write is scoped to the un-cascaded state", async () => {
    mockPrisma.shipment.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    mockPrisma.load.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    mockPrisma.shipperTrackingToken.updateMany.mockResolvedValueOnce({ count: 2 }).mockResolvedValueOnce({ count: 0 });

    const first = await cascadeLoadCancellation("load-1", mockPrisma);
    const second = await cascadeLoadCancellation("load-1", mockPrisma);

    expect(first).toEqual({ shipmentsCancelled: 1, trackingTokenCleared: true, shipperTokensExpired: 2, rateConfirmationsVoided: 0 });
    expect(second).toEqual({ shipmentsCancelled: 0, trackingTokenCleared: false, shipperTokensExpired: 0, rateConfirmationsVoided: 0 });
  });

  it("the scoping that makes it idempotent is in the where clauses, not in a caller guard", async () => {
    await cascadeLoadCancellation("load-1", mockPrisma);
    expect(mockPrisma.shipment.updateMany.mock.calls[0][0].where.status).toEqual({ not: "CANCELLED" });
    expect(mockPrisma.load.updateMany.mock.calls[0][0].where.trackingToken).toEqual({ not: null });
    expect(mockPrisma.shipperTrackingToken.updateMany.mock.calls[0][0].where.expiresAt).toHaveProperty("gt");
  });
});

// ── B4a: the rate confirmation ──────────────────────────
describe("the rate confirmation on cancel", () => {
  it("voids the live rate confirmations and nulls their signing tokens", async () => {
    mockPrisma.rateConfirmation.updateMany.mockResolvedValue({ count: 1 });
    const r = await cascadeLoadCancellation("load-1", mockPrisma);
    expect(r.rateConfirmationsVoided).toBe(1);
    const call = mockPrisma.rateConfirmation.updateMany.mock.calls[0][0];
    expect(call.where.loadId).toBe("load-1");
    expect(call.data).toEqual(expect.objectContaining({ status: "VOID", signTokenHash: null, signTokenId: null, signTokenExpiresAt: null }));
  });

  it("never touches SIGNED or FINALIZED — an executed document is evidence, not a draft", async () => {
    await cascadeLoadCancellation("load-1", mockPrisma);
    const notIn: string[] = mockPrisma.rateConfirmation.updateMany.mock.calls[0][0].where.status.notIn;
    expect(notIn).toEqual(expect.arrayContaining(["SIGNED", "FINALIZED", "VOID"]));
    expect([...VOIDABLE_EXCLUSIONS]).toEqual(expect.arrayContaining(["SIGNED", "FINALIZED"]));
  });

  it("runs on the SAME client the cascade was handed, so it joins the caller's transaction", async () => {
    const tx = { ...mockPrisma, rateConfirmation: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) } };
    const r = await cascadeLoadCancellation("load-1", tx as any);
    expect(r.rateConfirmationsVoided).toBe(2);
    expect(tx.rateConfirmation.updateMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.rateConfirmation.updateMany).not.toHaveBeenCalled();
  });
});

// ── both call paths, observed rather than read ──────────
// These replaced five assertions that grepped loadController.ts as text
// (lifecycle-gaps audit A8). They now DRIVE the two handlers against a mocked
// client and watch the real cascade's writes land — on the transaction client
// for deleteLoad, on the global client for the status path, and not at all
// for a TONU.
describe("both call paths invoke it, and only for CANCELLED", () => {
  function mockReqRes(body: Record<string, any>, user: any, params: any) {
    return {
      req: { body, user, params, query: {}, headers: {} } as any,
      res: { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any,
    };
  }
  /** A DISTINCT transaction client, so "inside the transaction" is observable. */
  function txClient() {
    const m = () => vi.fn().mockResolvedValue({ count: 0 });
    const tx = {
      load: { update: vi.fn().mockResolvedValue({}), updateMany: m() },
      loadTender: { updateMany: m() }, checkCall: { updateMany: m() }, invoice: { updateMany: m() },
      shipment: { updateMany: m() }, shipperTrackingToken: { updateMany: m() },
      rateConfirmation: { updateMany: m() }, loadActivity: { create: vi.fn().mockResolvedValue(null) },
    };
    mockPrisma.$transaction.mockImplementation(async (arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(tx)));
    return tx;
  }

  it("deleteLoad runs the cascade INSIDE its transaction — the writes land on the tx client, none on the global one", async () => {
    const tx = txClient();
    mockPrisma.load.findUnique.mockResolvedValue({ id: "load-1", posterId: "u1", status: "BOOKED", podUrl: null, deletedAt: null });
    const { req, res } = mockReqRes({ cancellationReasonCode: "SHIPPER_CANCELLED" }, { id: "u1", role: "ADMIN", email: "a@x" }, { id: "load-1" });

    await deleteLoad(req, res);

    expect(res.json).toHaveBeenCalledWith({ success: true, message: "Load archived" });
    expect(tx.shipment.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.rateConfirmation.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.loadActivity.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventType: CASCADE_EVENT_TYPE }) }));
    expect(mockPrisma.shipment.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.rateConfirmation.updateMany).not.toHaveBeenCalled();
  });

  it("the status path runs the cascade on a CANCELLED transition", async () => {
    txClient();
    mockPrisma.load.findUnique.mockResolvedValue({ id: "load-1", posterId: "u1", status: "TENDERED", carrierId: null, podUrl: null });
    mockPrisma.load.update.mockResolvedValue({ id: "load-1", status: "CANCELLED", carrierId: null, referenceNumber: "R" });
    mockPrisma.shipment.findFirst.mockResolvedValue(null);
    const { req, res } = mockReqRes({ status: "CANCELLED", cancellationReasonCode: "SHIPPER_FREIGHT_NOT_READY" }, { id: "u1", role: "OPERATIONS" }, { id: "load-1" });

    await updateLoadStatus(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(mockPrisma.shipment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ loadId: "load-1" }) }));
    expect(mockPrisma.rateConfirmation.updateMany).toHaveBeenCalledTimes(1);
  });

  it("a TONU does NOT run the cascade — the freight was real and its shipment stays", async () => {
    txClient();
    mockPrisma.load.findUnique.mockResolvedValue({ id: "load-1", posterId: "u1", status: "BOOKED", carrierId: "c1", podUrl: null });
    mockPrisma.load.update.mockResolvedValue({ id: "load-1", status: "TONU", carrierId: "c1", referenceNumber: "R" });
    mockPrisma.shipment.findFirst.mockResolvedValue(null);
    mockPrisma.notification.create.mockResolvedValue({});
    const { req, res } = mockReqRes({ status: "TONU", tonuFaultSide: "CUSTOMER" }, { id: "u1", role: "OPERATIONS" }, { id: "load-1" });

    await updateLoadStatus(req, res);

    expect(res.status).not.toHaveBeenCalledWith(422);
    expect(mockPrisma.shipment.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.rateConfirmation.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.loadActivity.create).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventType: CASCADE_EVENT_TYPE }) }));
  });
});
