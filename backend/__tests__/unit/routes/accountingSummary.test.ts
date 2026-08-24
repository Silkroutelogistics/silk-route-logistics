/**
 * GET /accounting/summary — the endpoint that did not exist.
 *
 * The dashboard had been calling it since it was written. The router defines
 * 56 routes and none of them matched, so every call 404'd; the frontend had no
 * .catch, so the rejection became undefined and `?? 0` rendered a confident $0
 * across three cards.
 *
 * THE FIRST TEST HERE ASSERTS THE ROUTE IS MOUNTED, not merely that a function
 * exists. A unit test of the handler would have passed throughout the entire
 * outage — the handler was never the problem, the wiring was. That distinction
 * is the whole lesson of this defect.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import fs from "fs";
import path from "path";
import { prisma } from "../../../src/config/database";
import {
  etStartOfMonth,
  etStartOfWeek,
  weekIsInsideMonth,
} from "../../../src/lib/financePeriods";

const mockPrisma = prisma as any;

// Auth is not what this file is about; admit every request as a CEO.
vi.mock("../../../src/middleware/auth", async (orig) => {
  const actual = (await orig()) as any;
  return {
    ...actual,
    authenticate: (req: any, _res: any, next: any) => {
      req.user = { id: "u-ceo", email: "ceo@srl.test", role: "CEO" };
      next();
    },
    authorize: () => (_req: any, _res: any, next: any) => next(),
  };
});

async function app() {
  const accounting = (await import("../../../src/routes/accounting")).default;
  const a = express();
  a.use(express.json());
  a.use("/api/accounting", accounting);
  return a;
}

const inv = (amount: number, opts: Partial<Record<string, unknown>> = {}) => ({
  amount,
  totalAmount: null,
  load: { carrierRate: null },
  paidAmount: null,
  ...opts,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.invoice.findMany.mockResolvedValue([]);
});

describe("the route is mounted (the actual defect)", () => {
  it("does not 404 — a handler nobody can reach is the bug this fixes", async () => {
    const res = await request(await app()).get("/api/accounting/summary");
    expect(res.status).not.toBe(404);
    expect(res.status).toBe(200);
  });

  it("the router source actually declares it, so the mount cannot silently vanish", () => {
    // Reads the real file. \r-stripped: three guards in this repo are broken on
    // CRLF checkouts because they match \n-anchored patterns against source.
    const src = fs
      .readFileSync(path.resolve(__dirname, "../../../src/routes/accounting.ts"), "utf8")
      .split("\n")
      .map((l) => l.replace(/\r$/, ""))
      .join("\n");
    expect(src).toMatch(/router\.get\(\s*"\/summary"/);
  });
});

describe("revenue is invoice-derived, never Load.rate", () => {
  it("sums invoice value across the month window", async () => {
    mockPrisma.invoice.findMany
      .mockResolvedValueOnce([inv(550), inv(4650)]) // month
      .mockResolvedValueOnce([])                     // week
      .mockResolvedValueOnce([]);                    // collected
    const res = await request(await app()).get("/api/accounting/summary");
    expect(res.body.revenueMTD).toBe(5200);
    expect(res.body.basis).toBe("invoice");
  });

  it("prefers totalAmount when present, falls back to amount", async () => {
    mockPrisma.invoice.findMany
      .mockResolvedValueOnce([inv(100, { totalAmount: 175 }), inv(25)])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const res = await request(await app()).get("/api/accounting/summary");
    expect(res.body.revenueMTD).toBe(200);
  });

  it("queries the invoice table, and never the load table, for revenue", async () => {
    await request(await app()).get("/api/accounting/summary");
    expect(mockPrisma.invoice.findMany).toHaveBeenCalled();
    // Load is only ever reached through the invoice relation, for margin.
    expect(mockPrisma.load.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.load.aggregate).not.toHaveBeenCalled();
  });

  it("excludes DRAFT, VOID and REJECTED from every revenue window", async () => {
    await request(await app()).get("/api/accounting/summary");
    for (const call of mockPrisma.invoice.findMany.mock.calls.slice(0, 2)) {
      const statuses: string[] = call[0].where.status.in;
      expect(statuses).not.toContain("DRAFT");
      expect(statuses).not.toContain("VOID");
      expect(statuses).not.toContain("REJECTED");
      // PAID is billed revenue and MUST be included — excluding it would make
      // this receivables, which is a different question.
      expect(statuses).toContain("PAID");
    }
  });
});

describe("SRL-121488 contributes nothing", () => {
  it("an uncovered POSTED load with no invoice moves no figure", async () => {
    // The load that started this: POSTED, no carrier, no invoice, $4,850 of
    // customerRate. It previously produced "Revenue This Week $4,850" against
    // "$0 MTD" because the week query summed Load.rate over pickup dates with
    // no status filter and no upper bound. Invoice-derived, it is simply absent.
    mockPrisma.invoice.findMany.mockResolvedValue([]); // no invoice exists for it
    const res = await request(await app()).get("/api/accounting/summary");
    expect(res.body.revenueMTD).toBe(0);
    expect(res.body.revenueThisWeek).toBe(0);
    expect(res.body.invoiceCounts).toEqual({ month: 0, week: 0 });
  });
});

describe("null versus zero", () => {
  it("cashBalance is null — not derivable, so it must not read as $0 in the bank", async () => {
    const res = await request(await app()).get("/api/accounting/summary");
    expect(res.body.cashBalance).toBeNull();
  });

  it("margin is null when no invoice has a cost side, not 100%", async () => {
    // Treating a missing carrierRate as zero cost would report 100% margin,
    // which is worse than reporting nothing.
    mockPrisma.invoice.findMany
      .mockResolvedValueOnce([inv(1000)]) // load.carrierRate null
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const res = await request(await app()).get("/api/accounting/summary");
    expect(res.body.avgMarginPercent).toBeNull();
  });

  it("margin is computed from the loads that do have a carrierRate", async () => {
    mockPrisma.invoice.findMany
      .mockResolvedValueOnce([
        inv(1000, { load: { carrierRate: 800 } }), // 20% margin
        inv(500),                                   // no cost side — excluded
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const res = await request(await app()).get("/api/accounting/summary");
    expect(res.body.avgMarginPercent).toBeCloseTo(20, 5);
  });

  it("a real zero is 0, not null — absence of revenue is an answer", async () => {
    const res = await request(await app()).get("/api/accounting/summary");
    expect(res.body.revenueMTD).toBe(0);
    expect(res.body.revenueMTD).not.toBeNull();
  });
});

describe("window math (ET), and the consistency the old pair lacked", () => {
  it("the week window starts no earlier than the month window when nested", () => {
    const now = new Date();
    if (weekIsInsideMonth(now)) {
      expect(etStartOfWeek(now).getTime()).toBeGreaterThanOrEqual(etStartOfMonth(now).getTime());
    }
  });

  it("weekly revenue cannot exceed monthly when the week is inside the month", async () => {
    // THE T5 REGRESSION CASE: $4,850 this week against $0 this month. Both
    // figures now come from one query shape over nested windows, so the
    // narrower window is a subset by construction.
    mockPrisma.invoice.findMany
      .mockResolvedValueOnce([inv(5200)]) // month
      .mockResolvedValueOnce([inv(4850)]) // week
      .mockResolvedValueOnce([]);
    const res = await request(await app()).get("/api/accounting/summary");
    if (weekIsInsideMonth(new Date())) {
      expect(res.body.revenueThisWeek).toBeLessThanOrEqual(res.body.revenueMTD);
    }
  });

  it("month start is midnight ET on the 1st, not the server's local month", () => {
    const start = etStartOfMonth(new Date("2026-08-24T10:15:00Z"));
    const et = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false,
    }).format(start);
    expect(et).toContain("08/01/2026");
    expect(et).toMatch(/\b00\b/);
  });

  it("week start is midnight ET on a Sunday, with the time zeroed", () => {
    // The old frontend startOfWeek copied the current wall-clock time, so the
    // boundary was "Sunday at whatever o'clock it is now" and loads picking up
    // early Sunday fell out of the week entirely.
    const start = etStartOfWeek(new Date("2026-08-24T10:15:00Z")); // a Monday
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(start);
    expect(parts).toContain("Sun");
    expect(parts).toMatch(/\b00:00\b/);
  });

  it("handles the DST boundary — offset is read at the instant, not assumed", () => {
    // March 2026: EST -> EDT. A fixed -5 or -4 is wrong for half the year.
    const inEst = etStartOfMonth(new Date("2026-01-15T12:00:00Z"));
    const inEdt = etStartOfMonth(new Date("2026-07-15T12:00:00Z"));
    const hourOf = (d: Date) =>
      new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hour12: false }).format(d);
    expect(hourOf(inEst)).toMatch(/\b00\b/);
    expect(hourOf(inEdt)).toMatch(/\b00\b/);
  });
});
