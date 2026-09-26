// v3.8.bkc — the CRM customers LIST read $43,450 / 9 loads for Beekeepers:
// every load's customerRate (five cancelled loads and two TONU linehauls
// included) PLUS the Shipment table's rate, which is the carrier rate written on
// every tender accept. It now reads lib/customerLoadStats, like the drawer, and
// labels YTD only what is YTD.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prisma } from "../../../src/config/database";
import { getCustomers } from "../../../src/controllers/customerController";

const mockPrisma = vi.mocked(prisma, true) as any;

const load = (p: Record<string, unknown>) => ({
  deletedAt: null, customerRate: null, marginPercent: null,
  originCity: "Northlake", originState: "TX", destCity: "Hebron", destState: "KY",
  invoices: [], loadAccessorials: [], pickupDate: new Date("2026-09-20T12:00:00Z"), createdAt: new Date("2026-09-18T12:00:00Z"),
  customerId: "cust-bee", ...p,
});
const tonu = (customerAmount: number | null) => [{ type: "TONU", status: "APPROVED", billedTo: "SHIPPER", amount: 200, customerAmount, quantity: null, unit: null }];

// The database query already excludes CANCELLED (asserted below), so the live
// loads it returns for Beekeepers are these four.
const LIVE_BEE = [
  load({ status: "TONU", customerRate: 2600, loadAccessorials: tonu(null) }),
  load({ status: "COMPLETED", customerRate: 700, invoices: [{ status: "DRAFT", totalAmount: 700, amount: 700 }] }),
  load({ status: "COMPLETED", customerRate: 2550, invoices: [{ status: "DRAFT", totalAmount: 2550, amount: 2550 }] }),
  load({ status: "TONU", customerRate: 2700, loadAccessorials: tonu(250) }),
];

function mockRes() { const r: any = {}; r.status = vi.fn().mockReturnValue(r); r.json = vi.fn().mockReturnValue(r); return r; }

describe("getCustomers — CRM list figures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-26T15:00:00Z"));
    mockPrisma.customer.findMany.mockImplementation(async (args: any) =>
      args?.select?.defaultAccessorialRates
        ? [{ id: "cust-bee", defaultAccessorialRates: null }]
        : [{ id: "cust-bee", name: "Beekeepers", _count: { shipments: 9, loads: 15 }, contacts: [] }],
    );
    mockPrisma.customer.count.mockResolvedValue(1);
    mockPrisma.load.findMany.mockResolvedValue(LIVE_BEE);
    mockPrisma.load.aggregate.mockResolvedValue({ _sum: { customerRate: 24450 }, _count: 9 });
    mockPrisma.shipment.aggregate.mockResolvedValue({ _sum: { rate: 19000 } });
  });
  afterEach(() => vi.useRealTimers());

  it("reads $3,700 over 4 loads for Beekeepers — not $43,450 over 9", async () => {
    const res = mockRes();
    await getCustomers({ query: { context: "crm" } } as any, res);
    const row = res.json.mock.calls[0][0].customers[0];
    expect(row.ytdRevenue).toBe(3700);
    expect(row.ytdLoads).toBe(4);
    expect(row.totalRevenue).toBe(3700);
    expect(row.totalLoads).toBe(4);
    expect(row.totalRevenue).not.toBe(43450);
  });

  it("never sums the Shipment table (carrier rates) or the unfiltered load aggregate", async () => {
    await getCustomers({ query: { context: "crm" } } as any, mockRes());
    expect(mockPrisma.shipment.aggregate).not.toHaveBeenCalled();
    expect(mockPrisma.load.aggregate).not.toHaveBeenCalled();
  });

  it("asks for the page's customers in ONE load query, cancelled and deleted excluded", async () => {
    await getCustomers({ query: { context: "crm" } } as any, mockRes());
    expect(mockPrisma.load.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.load.findMany.mock.calls[0][0].where).toMatchObject({
      customerId: { in: ["cust-bee"] }, deletedAt: null, status: { not: "CANCELLED" },
    });
  });

  it("YTD is Jan 1 Eastern: a load picked up in 2025 counts all-time but not YTD", async () => {
    mockPrisma.load.findMany.mockResolvedValue([
      ...LIVE_BEE,
      load({ status: "COMPLETED", customerRate: 1000, pickupDate: new Date("2025-12-15T12:00:00Z"), invoices: [{ status: "PAID", totalAmount: 1000, amount: 1000 }] }),
    ]);
    const res = mockRes();
    await getCustomers({ query: { context: "crm" } } as any, res);
    const row = res.json.mock.calls[0][0].customers[0];
    expect(row.totalRevenue).toBe(4700);
    expect(row.ytdRevenue).toBe(3700);
    expect(row.ytdLoads).toBe(4);
  });
});
