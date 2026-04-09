import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";

// Mock compliance check
vi.mock("../../../src/services/complianceMonitorService", () => ({
  complianceCheck: vi.fn().mockResolvedValue({ allowed: true, warnings: [], blocked_reasons: [] }),
}));
// Mock validators
vi.mock("../../../src/validators/tender", () => ({
  createTenderSchema: { parse: (v: any) => v },
  counterTenderSchema: { parse: (v: any) => v },
}));
// Mock shipment number
vi.mock("../../../src/controllers/shipmentController", () => ({
  nextShipmentNumber: vi.fn().mockResolvedValue("SHP-0001"),
}));

import { createTender, acceptTender, declineTender, processExpiredTenders } from "../../../src/controllers/tenderController";
import { complianceCheck } from "../../../src/services/complianceMonitorService";

function mockReq(overrides: any = {}) {
  return { params: {}, body: {}, user: { id: "user-1", role: "BROKER" }, ...overrides } as any;
}
function mockRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = vi.fn((code: number) => { res.statusCode = code; return res; });
  res.json = vi.fn((data: any) => { res.body = data; return res; });
  return res;
}

describe("tenderController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createTender", () => {
    it("returns 404 if load not found", async () => {
      (prisma.load.findUnique as any).mockResolvedValue(null);
      const req = mockReq({ params: { id: "load-1" }, body: { carrierId: "c-1", offeredRate: 2500, expiresAt: new Date() } });
      const res = mockRes();
      await createTender(req, res);
      expect(res.statusCode).toBe(404);
      expect(res.body.error).toContain("Load not found");
    });

    it("rejects tendering on BOOKED loads", async () => {
      (prisma.load.findUnique as any).mockResolvedValue({ id: "load-1", status: "BOOKED" });
      const req = mockReq({ params: { id: "load-1" }, body: { carrierId: "c-1", offeredRate: 2500 } });
      const res = mockRes();
      await createTender(req, res);
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain("Cannot tender");
    });

    it("blocks non-compliant carriers", async () => {
      (prisma.load.findUnique as any).mockResolvedValue({ id: "load-1", status: "POSTED" });
      (prisma.carrierProfile.findUnique as any).mockResolvedValue({ id: "c-1", userId: "cu-1" });
      (complianceCheck as any).mockResolvedValue({ allowed: false, blocked_reasons: ["Insurance expired"], warnings: [] });
      const req = mockReq({ params: { id: "load-1" }, body: { carrierId: "c-1", offeredRate: 2500 } });
      const res = mockRes();
      await createTender(req, res);
      expect(res.statusCode).toBe(403);
      expect(res.body.error).toContain("non-compliant");
    });

    it("creates tender and advances POSTED → TENDERED", async () => {
      (prisma.load.findUnique as any).mockResolvedValue({ id: "load-1", status: "POSTED" });
      (prisma.carrierProfile.findUnique as any).mockResolvedValue({ id: "c-1", userId: "cu-1" });
      (complianceCheck as any).mockResolvedValue({ allowed: true, warnings: [], blocked_reasons: [] });
      (prisma.loadTender.create as any).mockResolvedValue({ id: "t-1", loadId: "load-1", carrierId: "c-1", offeredRate: 2500, status: "OFFERED" });
      (prisma.load.update as any).mockResolvedValue({});
      (prisma.notification.create as any).mockResolvedValue({});
      (prisma as any).loadTrackingEvent = { create: vi.fn().mockResolvedValue({}) };

      const req = mockReq({ params: { id: "load-1" }, body: { carrierId: "c-1", offeredRate: 2500, expiresAt: new Date() } });
      const res = mockRes();
      await createTender(req, res);
      expect(res.statusCode).toBe(201);
      expect(prisma.load.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: "TENDERED" }),
      }));
    });
  });

  describe("declineTender", () => {
    it("returns 404 if tender not found", async () => {
      (prisma.loadTender.findUnique as any).mockResolvedValue(null);
      const req = mockReq({ params: { id: "t-1" } });
      const res = mockRes();
      await declineTender(req, res);
      expect(res.statusCode).toBe(404);
    });

    it("returns 403 if not the carrier", async () => {
      (prisma.loadTender.findUnique as any).mockResolvedValue({
        id: "t-1", carrier: { userId: "other-user" }, load: { posterId: "p-1" },
      });
      const req = mockReq({ params: { id: "t-1" }, user: { id: "user-1" } });
      const res = mockRes();
      await declineTender(req, res);
      expect(res.statusCode).toBe(403);
    });
  });

  describe("processExpiredTenders", () => {
    it("returns zero counts when no expired tenders", async () => {
      (prisma.loadTender.findMany as any).mockResolvedValue([]);
      const result = await processExpiredTenders();
      expect(result).toEqual({ expired: 0, loadsReverted: 0 });
    });

    it("expires stale tenders and reverts loads to POSTED", async () => {
      (prisma.loadTender.findMany as any).mockResolvedValue([
        { id: "t-1", loadId: "load-1", carrierId: "c-1" },
      ]);
      (prisma.loadTender.updateMany as any).mockResolvedValue({ count: 1 });
      (prisma.loadTender.count as any).mockResolvedValue(0);
      (prisma.load.findUnique as any).mockResolvedValue({ id: "load-1", status: "TENDERED", posterId: "p-1", referenceNumber: "SRL-001" });
      (prisma.load.update as any).mockResolvedValue({});
      (prisma.notification.create as any).mockResolvedValue({});
      (prisma as any).loadTrackingEvent = { create: vi.fn().mockResolvedValue({}) };

      const result = await processExpiredTenders();
      expect(result.expired).toBe(1);
      expect(result.loadsReverted).toBe(1);
      expect(prisma.load.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: "POSTED" }),
      }));
    });
  });
});
