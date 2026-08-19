// Terminating a carrier agreement (Arc 6 Phase 2).
//
// CarrierAgreement has carried terminatedAt / terminatedBy / terminationReason
// since the model was written and nothing ever wrote them, so a signed BCA was
// signed forever — no way to record an offboarded carrier or an agreement
// superseded when counsel returns.
//
// The property these tests exist to hold is that termination is a STATUS CHANGE
// and never a delete. A terminated agreement is the record of what governed the
// loads a carrier already ran; destroying the row would destroy that evidence.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    carrierAgreement: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    notification: { create: vi.fn() },
  },
}));

vi.mock("../../../src/config/database", () => ({ prisma: mockPrisma }));
vi.mock("../../../src/lib/logger", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { terminateAgreement } from "../../../src/controllers/carrierVettingController";

function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function makeReq(overrides: any = {}) {
  return {
    params: { id: "carrier-1", agreementId: "agreement-1" },
    body: { reason: "Carrier offboarded at their own request" },
    user: { id: "admin-1", role: "ADMIN" },
    headers: {},
    ...overrides,
  } as any;
}

const SIGNED_AGREEMENT = {
  id: "agreement-1",
  carrierId: "carrier-1",
  status: "SIGNED",
  templateName: "broker-carrier",
  terminatedAt: null,
  carrier: { userId: "user-1", companyName: "Test Carrier LLC" },
};

describe("terminateAgreement", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockPrisma.notification.create.mockResolvedValue({});
  });

  it("moves a signed agreement to TERMINATED and stamps who, when and why", async () => {
    mockPrisma.carrierAgreement.findFirst.mockResolvedValue(SIGNED_AGREEMENT);
    mockPrisma.carrierAgreement.update.mockResolvedValue({ ...SIGNED_AGREEMENT, status: "TERMINATED" });

    const res = makeRes();
    await terminateAgreement(makeReq(), res);

    const call = mockPrisma.carrierAgreement.update.mock.calls[0][0];
    expect(call.data.status).toBe("TERMINATED");
    expect(call.data.terminatedBy).toBe("admin-1");
    expect(call.data.terminatedAt).toBeInstanceOf(Date);
    expect(call.data.terminationReason).toBe("Carrier offboarded at their own request");
  });

  it("NEVER deletes the row — termination is evidence, not cleanup", async () => {
    // If this ever fails, someone has turned a contract record into a tombstone.
    mockPrisma.carrierAgreement.findFirst.mockResolvedValue(SIGNED_AGREEMENT);
    mockPrisma.carrierAgreement.update.mockResolvedValue({ ...SIGNED_AGREEMENT, status: "TERMINATED" });

    await terminateAgreement(makeReq(), makeRes());

    expect(mockPrisma.carrierAgreement.delete).not.toHaveBeenCalled();
    expect(mockPrisma.carrierAgreement.deleteMany).not.toHaveBeenCalled();
  });

  it("leaves the executed PDF and the signature metadata alone", async () => {
    // documentUrl, signedByName, signerIp and signerUserAgent are the proof of
    // what was agreed. Termination ends the agreement; it does not rewrite it.
    mockPrisma.carrierAgreement.findFirst.mockResolvedValue(SIGNED_AGREEMENT);
    mockPrisma.carrierAgreement.update.mockResolvedValue({ ...SIGNED_AGREEMENT, status: "TERMINATED" });

    await terminateAgreement(makeReq(), makeRes());

    const data = mockPrisma.carrierAgreement.update.mock.calls[0][0].data;
    for (const field of ["documentUrl", "signedByName", "signedAt", "signatureData", "signerIp", "signerUserAgent", "version"]) {
      expect(data).not.toHaveProperty(field);
    }
  });

  it("tells the carrier, and tells them what it means for them", async () => {
    mockPrisma.carrierAgreement.findFirst.mockResolvedValue(SIGNED_AGREEMENT);
    mockPrisma.carrierAgreement.update.mockResolvedValue({ ...SIGNED_AGREEMENT, status: "TERMINATED" });

    await terminateAgreement(makeReq(), makeRes());

    const note = mockPrisma.notification.create.mock.calls[0][0].data;
    expect(note.userId).toBe("user-1");
    expect(note.message).toContain("Carrier offboarded at their own request");
    expect(note.message).toContain("not be able to accept new loads");
    expect(note.message).toContain("in flight are unaffected");
  });

  it("does not fail the termination when the notification fails", async () => {
    // The agreement must not end up half-terminated because a notify threw.
    mockPrisma.carrierAgreement.findFirst.mockResolvedValue(SIGNED_AGREEMENT);
    mockPrisma.carrierAgreement.update.mockResolvedValue({ ...SIGNED_AGREEMENT, status: "TERMINATED" });
    mockPrisma.notification.create.mockRejectedValue(new Error("notify down"));

    const res = makeRes();
    await expect(terminateAgreement(makeReq(), res)).resolves.not.toThrow();
    expect(mockPrisma.carrierAgreement.update).toHaveBeenCalled();
  });

  it("requires a reason of at least 10 characters", async () => {
    const res = makeRes();
    await terminateAgreement(makeReq({ body: { reason: "no" } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].code).toBe("REASON_REQUIRED");
    expect(mockPrisma.carrierAgreement.update).not.toHaveBeenCalled();
  });

  it("refuses to re-terminate, rather than overwriting the original record", async () => {
    // Re-stamping would replace who ended it and why with a later actor's
    // version of events.
    mockPrisma.carrierAgreement.findFirst.mockResolvedValue({
      ...SIGNED_AGREEMENT,
      status: "TERMINATED",
      terminatedAt: new Date("2026-06-01T00:00:00Z"),
    });

    const res = makeRes();
    await terminateAgreement(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].code).toBe("AGREEMENT_ALREADY_TERMINATED");
    expect(mockPrisma.carrierAgreement.update).not.toHaveBeenCalled();
  });

  it("refuses to terminate an agreement that was never signed", async () => {
    mockPrisma.carrierAgreement.findFirst.mockResolvedValue({ ...SIGNED_AGREEMENT, status: "DRAFT" });

    const res = makeRes();
    await terminateAgreement(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].code).toBe("AGREEMENT_NOT_SIGNED");
  });

  it("scopes the lookup by carrierId, so another carrier's agreement is unreachable", async () => {
    mockPrisma.carrierAgreement.findFirst.mockResolvedValue(null);

    const res = makeRes();
    await terminateAgreement(makeReq(), res);

    const where = mockPrisma.carrierAgreement.findFirst.mock.calls[0][0].where;
    expect(where.id).toBe("agreement-1");
    expect(where.carrierId).toBe("carrier-1");
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
