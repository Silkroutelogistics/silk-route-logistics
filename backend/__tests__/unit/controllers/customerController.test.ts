import { describe, it, expect, vi, beforeEach } from "vitest";

// customerActivityService instantiates its own PrismaClient — must mock
// before importing the controller so logCustomerActivity is a no-op in tests.
vi.mock("../../../src/services/customerActivityService", () => ({
  logCustomerActivity: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "../../../src/config/database";
import { getCustomers, approveCustomer, markManuallyReviewed } from "../../../src/controllers/customerController";
import { logCustomerActivity } from "../../../src/services/customerActivityService";

const mockPrisma = vi.mocked(prisma);
const mockLogActivity = vi.mocked(logCustomerActivity);

function mockReqRes(query: Record<string, any> = {}, user: any = { id: "u-1", email: "ae@srl.test", role: "BROKER" }) {
  const req: any = { query, user };
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return { req, res };
}

function mockApproveReqRes(params: Record<string, any> = {}, user: any = { id: "u-1", email: "ae@srl.test", role: "ADMIN" }) {
  const req: any = { params, user };
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return { req, res };
}

const FULLY_QUALIFIED_PENDING = {
  id: "cust-1",
  name: "Acme Mfg",
  email: "ops@acme.test",
  onboardingStatus: "PENDING",
  taxId: "12-3456789",
  creditStatus: "APPROVED",
  creditCheckDate: new Date("2026-04-01"),
  contractUrl: "https://srl/contracts/acme.pdf",
  approvedAt: null,
  approvedById: null,
};

describe("customerController.getCustomers — ?context filter (Lead Hunter / CRM separation)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.customer.findMany.mockResolvedValue([] as any);
    mockPrisma.customer.count.mockResolvedValue(0 as any);
    mockPrisma.load.aggregate.mockResolvedValue({ _sum: { customerRate: 0, rate: 0 }, _count: 0 } as any);
    mockPrisma.shipment.aggregate.mockResolvedValue({ _sum: { rate: 0 }, _count: 0 } as any);
  });

  it("context=crm filters to onboardingStatus = APPROVED", async () => {
    const { req, res } = mockReqRes({ context: "crm" });
    await getCustomers(req, res);

    const findManyArgs = mockPrisma.customer.findMany.mock.calls[0][0];
    expect(findManyArgs.where.onboardingStatus).toBe("APPROVED");
  });

  it("context=prospects filters to onboardingStatus != APPROVED", async () => {
    const { req, res } = mockReqRes({ context: "prospects" });
    await getCustomers(req, res);

    const findManyArgs = mockPrisma.customer.findMany.mock.calls[0][0];
    expect(findManyArgs.where.onboardingStatus).toEqual({ not: "APPROVED" });
  });

  it("omitted context preserves legacy behavior (no onboardingStatus filter)", async () => {
    const { req, res } = mockReqRes({});
    await getCustomers(req, res);

    const findManyArgs = mockPrisma.customer.findMany.mock.calls[0][0];
    expect(findManyArgs.where.onboardingStatus).toBeUndefined();
  });

  it("rejects invalid context value via validator", async () => {
    const { req, res } = mockReqRes({ context: "garbage" });
    await expect(getCustomers(req, res)).rejects.toThrow();
  });

  it("context filter coexists with search + status + city filters", async () => {
    const { req, res } = mockReqRes({
      context: "crm",
      search: "acme",
      status: "Active",
      city: "Detroit",
    });
    await getCustomers(req, res);

    const findManyArgs = mockPrisma.customer.findMany.mock.calls[0][0];
    expect(findManyArgs.where.onboardingStatus).toBe("APPROVED");
    expect(findManyArgs.where.status).toBe("Active");
    expect(findManyArgs.where.city).toEqual({ contains: "Detroit", mode: "insensitive" });
    expect(findManyArgs.where.OR).toBeDefined();
  });

  it("context filter applies to both findMany and count (so totals match the filtered list)", async () => {
    const { req, res } = mockReqRes({ context: "crm" });
    await getCustomers(req, res);

    const findManyArgs = mockPrisma.customer.findMany.mock.calls[0][0];
    const countArgs = mockPrisma.customer.count.mock.calls[0][0];
    expect(findManyArgs.where).toEqual(countArgs.where);
  });
});

describe("customerController.approveCustomer — required-checks gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: fully-qualified PENDING customer flips to APPROVED + status='Active'", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue(FULLY_QUALIFIED_PENDING as any);
    mockPrisma.customer.update.mockResolvedValue({
      ...FULLY_QUALIFIED_PENDING,
      onboardingStatus: "APPROVED",
      status: "Active",
      approvedAt: new Date(),
      approvedById: "u-1",
    } as any);

    const { req, res } = mockApproveReqRes({ id: "cust-1" });
    await approveCustomer(req, res);

    // v3.8.tt — approve flips BOTH onboardingStatus AND status. status='Active'
    // is the architectural marker that transitions a record from Lead Hunter
    // into CRM (Lead Hunter stages: Lead/Contacted/Qualified/Proposal/Won/
    // Not Interested/Prospect; CRM: Active).
    expect(mockPrisma.customer.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "cust-1" },
      data: expect.objectContaining({
        onboardingStatus: "APPROVED",
        status: "Active",
        approvedById: "u-1",
        approvedAt: expect.any(Date),
      }),
    }));
    expect(mockLogActivity).toHaveBeenCalledWith(expect.objectContaining({
      customerId: "cust-1",
      eventType: "onboarding_approved",
      actorType: "USER",
      actorId: "u-1",
    }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 422 with missing-checks array when TIN is absent", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue({
      ...FULLY_QUALIFIED_PENDING,
      taxId: null,
    } as any);

    const { req, res } = mockApproveReqRes({ id: "cust-1" });
    await approveCustomer(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    const payload = (res.json as any).mock.calls[0][0];
    expect(payload.error).toBe("Required checks not satisfied");
    expect(payload.missing).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "taxId" }),
    ]));
    expect(mockPrisma.customer.update).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("returns 422 when credit not APPROVED/CONDITIONAL", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue({
      ...FULLY_QUALIFIED_PENDING,
      creditStatus: "NOT_CHECKED",
      creditCheckDate: null,
    } as any);

    const { req, res } = mockApproveReqRes({ id: "cust-1" });
    await approveCustomer(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    const payload = (res.json as any).mock.calls[0][0];
    expect(payload.missing).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "creditCheck" }),
    ]));
  });

  it("returns 422 when contract URL is absent", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue({
      ...FULLY_QUALIFIED_PENDING,
      contractUrl: null,
    } as any);

    const { req, res } = mockApproveReqRes({ id: "cust-1" });
    await approveCustomer(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    const payload = (res.json as any).mock.calls[0][0];
    expect(payload.missing).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "contractUrl" }),
    ]));
  });

  it("returns 422 with all three missing when nothing is filled", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue({
      ...FULLY_QUALIFIED_PENDING,
      taxId: null,
      creditStatus: "NOT_CHECKED",
      creditCheckDate: null,
      contractUrl: null,
    } as any);

    const { req, res } = mockApproveReqRes({ id: "cust-1" });
    await approveCustomer(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    const payload = (res.json as any).mock.calls[0][0];
    expect(payload.missing.map((m: any) => m.field).sort()).toEqual([
      "contractUrl", "creditCheck", "taxId",
    ]);
  });

  it("idempotent: already-APPROVED returns current state without re-writing", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue({
      ...FULLY_QUALIFIED_PENDING,
      onboardingStatus: "APPROVED",
      approvedAt: new Date("2026-01-01"),
      approvedById: "u-prior",
    } as any);

    const { req, res } = mockApproveReqRes({ id: "cust-1" });
    await approveCustomer(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = (res.json as any).mock.calls[0][0];
    expect(payload.alreadyApproved).toBe(true);
    expect(mockPrisma.customer.update).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("returns 404 when customer not found or soft-deleted (deletedAt set)", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue(null);

    const { req, res } = mockApproveReqRes({ id: "missing" });
    await approveCustomer(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockPrisma.customer.update).not.toHaveBeenCalled();
  });

  it("findFirst query excludes soft-deleted customers", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue(FULLY_QUALIFIED_PENDING as any);
    mockPrisma.customer.update.mockResolvedValue({} as any);

    const { req, res } = mockApproveReqRes({ id: "cust-1" });
    await approveCustomer(req, res);

    const findArgs = (mockPrisma.customer.findFirst as any).mock.calls[0][0];
    expect(findArgs.where).toEqual({ id: "cust-1", deletedAt: null });
  });

  it("CONDITIONAL credit status with check date is acceptable", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue({
      ...FULLY_QUALIFIED_PENDING,
      creditStatus: "CONDITIONAL",
    } as any);
    mockPrisma.customer.update.mockResolvedValue({} as any);

    const { req, res } = mockApproveReqRes({ id: "cust-1" });
    await approveCustomer(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockPrisma.customer.update).toHaveBeenCalled();
  });
});

// v3.8.oo Gap 1 — manual credit review now persists creditStatus alongside
// the date + notes, closing the private-company gap from audit f939aa1.
describe("customerController.markManuallyReviewed — Gap 1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.customer.findFirst.mockResolvedValue({ id: "cust-1" } as any);
    mockPrisma.customer.update.mockResolvedValue({ id: "cust-1" } as any);
  });

  function mockManualReqRes(body: any, params: Record<string, any> = { id: "cust-1" }) {
    const req: any = { body, params, user: { id: "u-1", email: "ae@srl.test", role: "BROKER" } };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    return { req, res };
  }

  it("creditStatus=APPROVED writes APPROVED + sets creditCheckDate + notes flow through", async () => {
    const { req, res } = mockManualReqRes({ creditStatus: "APPROVED", notes: "Trade refs verified" });
    await markManuallyReviewed(req, res);

    expect(mockPrisma.customer.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "cust-1" },
      data: expect.objectContaining({
        creditStatus: "APPROVED",
        creditCheckSource: "manual",
        creditCheckResult: "approved",
        creditCheckDate: expect.any(Date),
        creditCheckNotes: "Trade refs verified",
      }),
    }));
    expect(mockLogActivity).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "credit_check_manual",
      metadata: expect.objectContaining({ creditStatus: "APPROVED", hasNotes: true }),
    }));
  });

  it("creditStatus=CONDITIONAL writes CONDITIONAL (the default UI selection for private companies)", async () => {
    const { req, res } = mockManualReqRes({ creditStatus: "CONDITIONAL" });
    await markManuallyReviewed(req, res);

    expect(mockPrisma.customer.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        creditStatus: "CONDITIONAL",
        creditCheckResult: "approved",
        creditCheckNotes: "Marked as manually reviewed",
      }),
    }));
  });

  it("creditStatus=DENIED writes DENIED + creditCheckResult flips to 'rejected'", async () => {
    const { req, res } = mockManualReqRes({ creditStatus: "DENIED", notes: "Multiple late payments on prior loads" });
    await markManuallyReviewed(req, res);

    expect(mockPrisma.customer.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        creditStatus: "DENIED",
        creditCheckResult: "rejected",
      }),
    }));
  });

  it("invalid creditStatus enum value throws (zod 422 path)", async () => {
    const { req, res } = mockManualReqRes({ creditStatus: "REJECTED" });
    await expect(markManuallyReviewed(req, res)).rejects.toThrow();
    expect(mockPrisma.customer.update).not.toHaveBeenCalled();
  });

  it("missing creditStatus body field throws (zod 422 path)", async () => {
    const { req, res } = mockManualReqRes({ notes: "no status" });
    await expect(markManuallyReviewed(req, res)).rejects.toThrow();
    expect(mockPrisma.customer.update).not.toHaveBeenCalled();
  });

  it("returns 404 when customer not found / soft-deleted", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue(null);
    const { req, res } = mockManualReqRes({ creditStatus: "CONDITIONAL" }, { id: "missing" });
    await markManuallyReviewed(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockPrisma.customer.update).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });
});
