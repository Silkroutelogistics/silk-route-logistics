import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";

// Mock dependent services
vi.mock("../../../src/services/tierService", () => ({
  calculateTier: vi.fn().mockReturnValue("SILVER"),
  getBonusPercentage: vi.fn().mockReturnValue(2),
}));
vi.mock("../../../src/services/integrationService", () => ({
  onCarrierApproved: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../src/services/storageService", () => ({
  uploadFile: vi.fn().mockResolvedValue("https://cdn.example.com/file.pdf"),
}));
vi.mock("../../../src/validators/carrier", () => ({
  carrierRegisterSchema: { parse: (v: any) => v },
  verifyCarrierSchema: { parse: (v: any) => v },
}));

import {
  getOnboardingStatus,
  verifyCarrier,
  getAllCarriers,
  getCarrierDetail,
  updateCarrier,
  uploadCarrierDocuments,
} from "../../../src/controllers/carrierController";

const mockPrisma = vi.mocked(prisma);

function mockReqRes(body: Record<string, any> = {}, user?: any, params?: any, query?: any) {
  return {
    req: { body, user, params: params || {}, query: query || {}, headers: {} } as any,
    res: { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any,
  };
}

describe("carrierController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // verifyCarrier wraps its writes in a transaction (G1). The shared mock's
    // $transaction is a bare vi.fn() returning undefined that never runs the
    // callback, so without this the controller's writes silently do not happen
    // and res.json receives undefined — a mock still modelling a controller
    // that no longer exists. Same shape as the findFirst mock gap banked at
    // §19 Sub-pattern 11 case study #3.
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
  });

  // ── getOnboardingStatus ─────────────────────────────────
  it("getOnboardingStatus — returns profile status", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue({
      onboardingStatus: "APPROVED",
      w9Uploaded: true,
      insuranceCertUploaded: true,
      authorityDocUploaded: true,
      tier: "SILVER",
      approvedAt: new Date(),
    } as any);

    const { req, res } = mockReqRes({}, { id: "carrier-1", role: "CARRIER" });

    await getOnboardingStatus(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ onboardingStatus: "APPROVED", tier: "SILVER" })
    );
  });

  it("getOnboardingStatus — returns 404 when no profile", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(null);

    const { req, res } = mockReqRes({}, { id: "carrier-1", role: "CARRIER" });

    await getOnboardingStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Carrier profile not found" });
  });

  // ── verifyCarrier ───────────────────────────────────────
  it("verifyCarrier — approves carrier and creates notification", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue({
      id: "profile-1",
      userId: "carrier-1",
    } as any);
    mockPrisma.carrierProfile.update.mockResolvedValue({
      id: "profile-1",
      onboardingStatus: "APPROVED",
      approvedAt: new Date(),
    } as any);
    mockPrisma.user.update.mockResolvedValue({} as any);
    mockPrisma.notification.create.mockResolvedValue({} as any);

    const { req, res } = mockReqRes(
      { status: "APPROVED", safetyScore: 95 },
      { id: "admin-1", role: "ADMIN" },
      { id: "profile-1" }
    );

    await verifyCarrier(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ onboardingStatus: "APPROVED" })
    );
    expect(mockPrisma.notification.create).toHaveBeenCalled();
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "carrier-1" }, data: { isVerified: true } })
    );
  });

  // ── getAllCarriers ──────────────────────────────────────
  it("getAllCarriers — returns carrier list with performance data", async () => {
    mockPrisma.carrierProfile.findMany.mockResolvedValue([
      {
        id: "profile-1",
        userId: "carrier-1",
        tier: "SILVER",
        mcNumber: "MC-123456",
        dotNumber: "DOT-789",
        equipmentTypes: ["Dry Van"],
        operatingRegions: ["SOUTHEAST"],
        safetyScore: 95,
        numberOfTrucks: 10,
        onboardingStatus: "APPROVED",
        user: { id: "carrier-1", firstName: "John", lastName: "Doe", email: "john@test.com", company: "Test Trucking", phone: "555-1234" },
        scorecards: [],
        tenders: [],
        createdAt: new Date(),
      },
    ] as any);
    mockPrisma.load.count.mockResolvedValue(5);
    mockPrisma.invoice.aggregate.mockResolvedValue({ _sum: { amount: 50000 } } as any);

    const { req, res } = mockReqRes({}, { id: "admin-1", role: "ADMIN" }, {}, {});

    await getAllCarriers(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        carriers: expect.arrayContaining([
          expect.objectContaining({ company: "Test Trucking", tier: "SILVER" }),
        ]),
        total: 1,
      })
    );
  });

  // ── getCarrierDetail ────────────────────────────────────
  it("getCarrierDetail — returns 404 when carrier not found", async () => {
    mockPrisma.carrierProfile.findFirst.mockResolvedValue(null);

    const { req, res } = mockReqRes({}, { id: "admin-1", role: "ADMIN" }, { id: "nonexistent" });

    await getCarrierDetail(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Carrier not found" });
  });

  // ── updateCarrier ───────────────────────────────────────
  /**
   * updateCarrier is a GENERIC field-update handler that also accepts
   * onboardingStatus. PUT /carriers/:id validates it against an enum containing
   * all three closed states; PATCH /carrier/:id validates nothing at all. Both
   * are ADMIN/CEO and both land here, so this was a live path to APPROVED that
   * left every open request unanswerable.
   *
   * Exercised through the REAL service rather than a mocked one: the point is
   * that the close actually reaches the database from this handler, and a mock
   * asserting it was called would pass against a close wired outside the
   * transaction.
   */
  /**
   * The handler wrote onboardingStatus = "DOCUMENTS_SUBMITTED", a value removed
   * from the enum in v3.8.ajd. Prisma rejects it, so the endpoint threw a 500 —
   * after the files had reached storage and their Document rows had committed.
   * The carrier saw a failure and retried into duplicates.
   */
  it("uploadCarrierDocuments — advances a PENDING carrier to a status the enum has", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue({
      id: "profile-1", userId: "carrier-1", onboardingStatus: "PENDING",
    } as any);
    mockPrisma.document.create.mockResolvedValue({ id: "doc-1" } as any);
    mockPrisma.carrierProfile.update.mockResolvedValue({ id: "profile-1" } as any);

    const { req, res } = mockReqRes({}, { id: "carrier-1", role: "CARRIER" }, {});
    req.files = [
      { originalname: "w9.pdf", buffer: Buffer.from("x"), mimetype: "application/pdf" },
    ];
    await uploadCarrierDocuments(req, res);

    const call = mockPrisma.carrierProfile.update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data.onboardingStatus, "the retired literal is back").toBe("REVIEWING");
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("uploadCarrierDocuments — does not knock an APPROVED carrier out of approval", async () => {
    // The obvious repair — write REVIEWING unconditionally — would un-approve a
    // carrier for uploading a renewed COI, and block them from tenders. That is
    // worse than the 500 it replaces.
    mockPrisma.carrierProfile.findUnique.mockResolvedValue({
      id: "profile-1", userId: "carrier-1", onboardingStatus: "APPROVED",
    } as any);
    mockPrisma.document.create.mockResolvedValue({ id: "doc-1" } as any);
    mockPrisma.carrierProfile.update.mockResolvedValue({ id: "profile-1" } as any);

    const { req, res } = mockReqRes({}, { id: "carrier-1", role: "CARRIER" }, {});
    req.files = [
      { originalname: "insurance-renewal.pdf", buffer: Buffer.from("x"), mimetype: "application/pdf" },
    ];
    await uploadCarrierDocuments(req, res);

    const call = mockPrisma.carrierProfile.update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data.onboardingStatus).toBeUndefined();
    // The flag it exists to set is still set.
    expect(call.data.insuranceCertUploaded).toBe(true);
  });

  it("updateCarrier — closes open info requests when it sets a closed status", async () => {
    mockPrisma.infoRequest.updateManyAndReturn.mockResolvedValue([
      { id: "ir-1", category: "COI_UPDATE", createdById: "ae-1" },
      { id: "ir-2", category: "W9_UPDATE", createdById: "ae-1" },
    ] as any);
    mockPrisma.carrierProfile.update.mockResolvedValue({
      id: "profile-1",
      companyName: "Acme Freight",
      onboardingStatus: "APPROVED",
    } as any);

    const { req, res } = mockReqRes(
      { onboardingStatus: "APPROVED" },
      { id: "admin-1", role: "ADMIN" },
      { id: "profile-1" },
    );
    await updateCarrier(req, res);

    expect(mockPrisma.infoRequest.updateManyAndReturn).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ carrierId: "profile-1", status: "OPEN" }),
        data: expect.objectContaining({ status: "CANCELLED" }),
      }),
    );
  });

  it("updateCarrier — leaves open requests alone for a status that is not closing", async () => {
    // REVIEWING and INFO_REQUESTED are states the carrier portal still renders
    // the section in, so a request raised against them is answerable and must
    // survive. Closing on every status change would be the opposite bug.
    mockPrisma.infoRequest.updateManyAndReturn.mockResolvedValue([
      { id: "ir-1", category: "COI_UPDATE", createdById: "ae-1" },
    ] as any);
    mockPrisma.carrierProfile.update.mockResolvedValue({
      id: "profile-1", companyName: "Acme Freight", onboardingStatus: "REVIEWING",
    } as any);

    const { req, res } = mockReqRes(
      { onboardingStatus: "REVIEWING" },
      { id: "admin-1", role: "ADMIN" },
      { id: "profile-1" },
    );
    await updateCarrier(req, res);

    expect(mockPrisma.infoRequest.updateManyAndReturn).not.toHaveBeenCalled();
  });

  it("updateCarrier — a field-only edit never touches info requests", async () => {
    // The common case. Editing an insurance expiry must not close anything.
    mockPrisma.carrierProfile.update.mockResolvedValue({
      id: "profile-1", companyName: "Acme Freight",
    } as any);

    const { req, res } = mockReqRes(
      { safetyScore: 91 },
      { id: "admin-1", role: "ADMIN" },
      { id: "profile-1" },
    );
    await updateCarrier(req, res);

    expect(mockPrisma.infoRequest.updateManyAndReturn).not.toHaveBeenCalled();
  });

  it("updateCarrier — updates carrier profile fields", async () => {
    mockPrisma.carrierProfile.update.mockResolvedValue({
      id: "profile-1",
      safetyScore: 98,
      tier: "GOLD",
    } as any);

    const { req, res } = mockReqRes(
      { safetyScore: "98", tier: "GOLD" },
      { id: "admin-1", role: "ADMIN" },
      { id: "profile-1" }
    );

    await updateCarrier(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ safetyScore: 98, tier: "GOLD" })
    );
  });
});
