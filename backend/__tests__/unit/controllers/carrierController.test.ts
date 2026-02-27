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
