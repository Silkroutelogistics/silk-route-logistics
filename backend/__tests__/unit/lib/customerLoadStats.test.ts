// v3.8.bjx — the CRM Loads tab counted CANCELLED loads in revenue, the drawer
// header summed the CARRIER rate, and lanes grouped by state pair only. The
// fixture is Beekeepers as it stood on 2026-09-26: nine loads, five cancelled,
// two TONU, one POD received, one delivered. The old tab showed $24,450.
import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import {
  summarizeCustomerLoads,
  earnedRevenueFor,
  loadCustomerLoadStats,
  type StatsLoad,
} from "../../../src/lib/customerLoadStats";

const lane = (o: [string, string], d: [string, string]) => ({
  originCity: o[0], originState: o[1], destCity: d[0], destState: d[1],
});
const tonuRow = (customerAmount: number | null, billedTo: string | null = "SHIPPER", status = "APPROVED") => ({
  type: "TONU", status, billedTo, amount: 200, customerAmount, quantity: null, unit: null,
});
function load(p: Partial<StatsLoad> & { status: string }): StatsLoad {
  return {
    deletedAt: null, customerRate: null, marginPercent: null,
    ...lane(["Northlake", "TX"], ["Hebron", "KY"]),
    invoices: [], loadAccessorials: [], ...p,
  } as StatsLoad;
}

const BEEKEEPERS: StatsLoad[] = [
  load({ status: "CANCELLED", customerRate: 6900, ...lane(["Colton", "CA"], ["Hebron", "KY"]) }),        // 5002
  load({ status: "CANCELLED", customerRate: 3200, ...lane(["Northlake", "TX"], ["North Las Vegas", "NV"]) }), // 5001
  load({ status: "CANCELLED", customerRate: 650, ...lane(["Erlanger", "KY"], ["Hebron", "KY"]) }),       // 121497
  load({ status: "TONU", customerRate: 2600, marginPercent: 8, loadAccessorials: [tonuRow(null)] }),      // 121496 — $200 policy
  load({ status: "POD_RECEIVED", customerRate: 700, marginPercent: 10, ...lane(["Irving", "TX"], ["Northlake", "TX"]) }), // 121495
  load({ status: "DELIVERED", customerRate: 2550, marginPercent: 6, ...lane(["Irving", "TX"], ["Hebron", "KY"]) }),       // 121494
  load({ status: "CANCELLED", customerRate: 2550, ...lane(["Irving", "TX"], ["Hebron", "KY"]) }),        // 121493
  load({ status: "TONU", customerRate: 2700, marginPercent: 7, loadAccessorials: [tonuRow(250)] }),       // 121492 — $250 agreed
  load({ status: "CANCELLED", customerRate: 2600 }),                                                     // 121491
];

describe("summarizeCustomerLoads — the Beekeepers drawer", () => {
  const s = summarizeCustomerLoads(BEEKEEPERS, null);

  it("counts no cancelled load", () => {
    expect(s.totalLoads).toBe(4);
  });

  it("revenue is earned only: $700 + $2,550 delivered + the two TONU charges ($200 + $250) — not $24,450", () => {
    expect(s.earnedRevenue).toBe(3700);
    expect(s.earnedRevenue).not.toBe(24450);
  });

  it("avg margin is over delivered loads only, divided by that count — TONU margins are left out", () => {
    expect(s.avgMargin).toBe(8); // (10 + 6) / 2
  });

  it("lanes key on city and state: Irving TX -> Hebron KY is not folded into Northlake TX -> Hebron KY", () => {
    const nl = s.topLanes.find((l) => l.origin === "Northlake, TX" && l.dest === "Hebron, KY");
    const irv = s.topLanes.find((l) => l.origin === "Irving, TX" && l.dest === "Hebron, KY");
    expect(nl?.count).toBe(2); // the two TONUs; the cancelled 121491 is out
    expect(irv?.count).toBe(1); // 121494; the cancelled 121493 is out
    expect(s.topLanes.some((l) => l.origin.startsWith("Colton"))).toBe(false);
  });

  it("a lane with only TONU loads has no average rate, rather than the linehaul that never ran", () => {
    const nl = s.topLanes.find((l) => l.origin === "Northlake, TX" && l.dest === "Hebron, KY");
    expect(nl?.avgRate).toBeNull();
  });
});

describe("earnedRevenueFor", () => {
  it("an invoiced load earns its live invoices, ignoring VOID, REJECTED and deleted ones", () => {
    const l = load({
      status: "INVOICED", customerRate: 2000,
      invoices: [
        { status: "SENT", totalAmount: 2150, amount: 2000 },
        { status: "DRAFT", totalAmount: null, amount: 75 },
        { status: "VOID", totalAmount: 9999, amount: 9999 },
        { status: "REJECTED", totalAmount: 5000, amount: 5000 },
        { status: "SENT", totalAmount: 800, amount: 800, deletedAt: new Date() },
      ],
    });
    expect(earnedRevenueFor(l, null)).toBe(2225);
  });

  it("a broker- or carrier-fault TONU bills the customer nothing and earns nothing", () => {
    expect(earnedRevenueFor(load({ status: "TONU", customerRate: 2600, loadAccessorials: [tonuRow(null, "BROKER")] }), null)).toBe(0);
    expect(earnedRevenueFor(load({ status: "TONU", customerRate: 2600, loadAccessorials: [] }), null)).toBe(0);
  });

  it("a rejected TONU row earns nothing", () => {
    expect(earnedRevenueFor(load({ status: "TONU", loadAccessorials: [tonuRow(250, "SHIPPER", "REJECTED")] }), null)).toBe(0);
  });

  it("an open load has earned nothing yet", () => {
    for (const status of ["POSTED", "TENDERED", "BOOKED", "DISPATCHED", "IN_TRANSIT", "AT_DELIVERY"]) {
      expect(earnedRevenueFor(load({ status, customerRate: 3000 }), null), status).toBe(0);
    }
  });

  it("a cancelled or deleted load earns nothing even if it carries an invoice", () => {
    const inv = [{ status: "SENT", totalAmount: 500, amount: 500 }];
    expect(earnedRevenueFor(load({ status: "CANCELLED", invoices: inv }), null)).toBe(0);
    expect(earnedRevenueFor(load({ status: "DELIVERED", deletedAt: new Date(), invoices: inv }), null)).toBe(0);
  });
});

it("avg margin is null — rendered as a dash — when no delivered load carries one", () => {
  expect(summarizeCustomerLoads([load({ status: "BOOKED", customerRate: 1000 })], null).avgMargin).toBeNull();
});

it("loadCustomerLoadStats asks the database for live, non-cancelled loads only", async () => {
  const findMany = vi.fn().mockResolvedValue([]);
  const db = { customer: { findUnique: vi.fn().mockResolvedValue({ defaultAccessorialRates: null }) }, load: { findMany } };
  await loadCustomerLoadStats(db, "cust-1");
  const where = findMany.mock.calls[0][0].where;
  expect(where).toMatchObject({ customerId: "cust-1", deletedAt: null, status: { not: "CANCELLED" } });
});

describe("both surfaces read the one calculation (source guard)", () => {
  const read = (rel: string) =>
    fs.readFileSync(path.join(__dirname, "../../../src", rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  it("the Loads tab endpoint and the drawer header both call loadCustomerLoadStats", () => {
    expect(read("routes/crmCustomer.ts")).toMatch(/loadCustomerLoadStats\(prisma, req\.params\.id\)/);
    expect(read("controllers/customerController.ts")).toMatch(/loadCustomerLoadStats\(prisma, customer\.id\)/);
  });

  it("the drawer header no longer sums Shipment.rate (the carrier rate)", () => {
    const src = read("controllers/customerController.ts");
    const fn = src.slice(src.indexOf("export async function getCustomerById"), src.indexOf("export async function", src.indexOf("export async function getCustomerById") + 10));
    expect(fn.length, "vacuity: found getCustomerById").toBeGreaterThan(200);
    expect(fn).not.toMatch(/shipment\.aggregate/);
  });
});
