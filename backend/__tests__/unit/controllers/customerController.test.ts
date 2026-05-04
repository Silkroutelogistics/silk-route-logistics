import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";
import { getCustomers } from "../../../src/controllers/customerController";

const mockPrisma = vi.mocked(prisma);

function mockReqRes(query: Record<string, any> = {}, user: any = { id: "u-1", email: "ae@srl.test", role: "BROKER" }) {
  const req: any = { query, user };
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return { req, res };
}

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
