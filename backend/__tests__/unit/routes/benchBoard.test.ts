/**
 * GET /analytics/bench-board.
 *
 * THE FIRST TEST ASSERTS THE ROUTE IS MOUNTED, for the reason slot 2 learned
 * the hard way: a handler unit test passes throughout an outage where the
 * wiring is missing, because the handler was never the problem.
 *
 * The rest are about honesty at zero. The bench is empty today and will be for
 * a while, so the states that matter most are the ones with no rows in them —
 * a board that renders a confident zero it did not compute is worse than one
 * that renders nothing.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import fs from "fs";
import path from "path";
import { prisma } from "../../../src/config/database";

const mockPrisma = prisma as any;

// Dynamically importing the analytics router pulls its whole controller graph.
// The 5s default is not enough and a timeout here reads exactly like cross-file
// mock pollution — passes alone, fails in suite — which it is not.
vi.setConfig({ testTimeout: 30_000 });

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

// The gate is mocked, not reimplemented. What is under test is whether the
// board REPORTS the gate's verdict, not whether the gate is right — that has
// its own tests, and duplicating its logic here would let the two drift apart
// while both stayed green.
const complianceCheckMany = vi.fn();
vi.mock("../../../src/services/complianceMonitorService", async (orig) => {
  const actual = (await orig()) as any;
  return { ...actual, complianceCheckMany: (...a: unknown[]) => complianceCheckMany(...a) };
});

async function app() {
  const analytics = (await import("../../../src/routes/analytics")).default;
  const a = express();
  a.use(express.json());
  a.use("/api/analytics", analytics);
  return a;
}

const carrier = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  companyName: "Test Freight LLC",
  mcNumber: "MC-123456",
  authorityGrantedDate: null,
  approvedAt: new Date("2026-08-01T00:00:00Z"),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.carrierProfile.findMany.mockResolvedValue([]);
  mockPrisma.carrierProfile.count.mockResolvedValue(0);
  mockPrisma.carrierAgreement.count.mockResolvedValue(0);
  mockPrisma.routingGuide.findMany.mockResolvedValue([]);
  mockPrisma.routingGuide.count.mockResolvedValue(0);
  complianceCheckMany.mockResolvedValue(new Map());
});

describe("the route is mounted", () => {
  it("does not 404", async () => {
    const res = await request(await app()).get("/api/analytics/bench-board");
    expect(res.status).not.toBe(404);
    expect(res.status).toBe(200);
  });

  it("the router source declares it, so the mount cannot silently vanish", () => {
    // \r-stripped: guards in this repo have been silently broken on CRLF
    // checkouts by matching \n-anchored patterns against source.
    const src = fs
      .readFileSync(path.resolve(__dirname, "../../../src/routes/analytics.ts"), "utf8")
      .split(/\r?\n/)
      .map((l) => l.replace(/\r$/, ""))
      .join("\n");
    expect(src).toMatch(/"\/bench-board"/);
  });
});

describe("an empty bench is reported as empty, not as broken", () => {
  it("returns zeroes and an empty roster rather than erroring", async () => {
    const res = await request(await app()).get("/api/analytics/bench-board");
    expect(res.status).toBe(200);
    expect(res.body.bench.total).toBe(0);
    expect(res.body.bench.tenderable).toBe(0);
    expect(res.body.bench.carriers).toEqual([]);
    expect(res.body.lanes).toEqual([]);
  });

  it("still marks itself provisional — the tiers are not ratified", async () => {
    const res = await request(await app()).get("/api/analytics/bench-board");
    expect(res.body.provisional).toBe(true);
  });

  it("carries every tier key even at zero, so the grid never has holes", async () => {
    const res = await request(await app()).get("/api/analytics/bench-board");
    expect(Object.keys(res.body.bench.tiers).sort()).toEqual(
      ["AGE_NOT_ON_FILE", "BLOCKED", "OVERRIDE_ELIGIBLE", "READY"],
    );
  });
});

describe("it reports the gate's verdict rather than its own", () => {
  it("counts a carrier as tenderable only when the gate allows", async () => {
    mockPrisma.carrierProfile.findMany.mockResolvedValue([
      carrier({ id: "c1" }),
      carrier({ id: "c2", companyName: "Blocked Hauling" }),
    ]);
    complianceCheckMany.mockResolvedValue(
      new Map([
        ["c1", { allowed: true, blocked_reasons: [] }],
        ["c2", { allowed: false, blocked_reasons: ["Insurance expired"] }],
      ]),
    );
    const res = await request(await app()).get("/api/analytics/bench-board");
    expect(res.body.bench.total).toBe(2);
    expect(res.body.bench.tenderable).toBe(1);
  });

  it("passes the gate's reasons through verbatim, never re-worded", async () => {
    // An AE acts on these strings. Paraphrasing them here would produce a board
    // saying something the gate does not.
    mockPrisma.carrierProfile.findMany.mockResolvedValue([carrier({ id: "c2" })]);
    complianceCheckMany.mockResolvedValue(
      new Map([["c2", { allowed: false, blocked_reasons: ["No signed Broker-Carrier Agreement", "COI expired"] }]]),
    );
    const res = await request(await app()).get("/api/analytics/bench-board");
    expect(res.body.bench.carriers[0].blockedReasons).toEqual([
      "No signed Broker-Carrier Agreement",
      "COI expired",
    ]);
  });

  it("when the gate itself fails, nobody is claimed tenderable", async () => {
    // Fail toward NOT asserting a carrier can haul. A gate outage must not
    // read as a clean bench.
    mockPrisma.carrierProfile.findMany.mockResolvedValue([carrier()]);
    complianceCheckMany.mockRejectedValue(new Error("gate is down"));
    const res = await request(await app()).get("/api/analytics/bench-board");
    expect(res.status).toBe(200);
    expect(res.body.bench.total).toBe(1);
    expect(res.body.bench.tenderable).toBe(0);
  });

  it("excludes test accounts and deleted carriers from the bench", async () => {
    await request(await app()).get("/api/analytics/bench-board");
    const where = mockPrisma.carrierProfile.findMany.mock.calls[0][0].where;
    expect(where.isTestAccount).toBe(false);
    expect(where.deletedAt).toBeNull();
    expect(where.onboardingStatus).toBe("APPROVED");
  });
});

describe("lane coverage", () => {
  it("counts only ranked carriers who are actually on the bench", async () => {
    // A routing guide can rank a carrier who has since been suspended or
    // deleted. They are ranked, but they are not available.
    mockPrisma.carrierProfile.findMany.mockResolvedValue([carrier({ id: "c1" })]);
    complianceCheckMany.mockResolvedValue(new Map([["c1", { allowed: true, blocked_reasons: [] }]]));
    mockPrisma.routingGuide.findMany.mockResolvedValue([
      {
        id: "g1",
        name: "MI to TX Dry Van",
        originState: "MI",
        destState: "TX",
        equipmentType: "Dry Van",
        customer: { name: "BKN" },
        entries: [{ carrierId: "c1" }, { carrierId: "c-gone" }],
      },
    ]);
    const res = await request(await app()).get("/api/analytics/bench-board");
    expect(res.body.lanes).toHaveLength(1);
    expect(res.body.lanes[0].benched).toBe(1);
    expect(res.body.lanes[0].tenderable).toBe(1);
    expect(res.body.lanes[0].customerName).toBe("BKN");
  });

  it("shows a global guide as global rather than inventing a customer", async () => {
    mockPrisma.routingGuide.findMany.mockResolvedValue([
      {
        id: "g2", name: "Any", originState: "MI", destState: "OH",
        equipmentType: "Reefer", customer: null, entries: [],
      },
    ]);
    const res = await request(await app()).get("/api/analytics/bench-board");
    expect(res.body.lanes[0].customerName).toBeNull();
  });

  it("excludes expired and inactive guides", async () => {
    await request(await app()).get("/api/analytics/bench-board");
    const where = mockPrisma.routingGuide.findMany.mock.calls[0][0].where;
    expect(where.isActive).toBe(true);
    expect(where.deletedAt).toBeNull();
    expect(Array.isArray(where.OR)).toBe(true);
  });
});

describe("weekly counters are windowed, not cumulative", () => {
  it("asks for two adjacent windows per counter, with no gap", async () => {
    await request(await app()).get("/api/analytics/bench-board");

    // sourced: two carrierProfile.count calls on createdAt.
    const cpCalls = mockPrisma.carrierProfile.count.mock.calls.map((c: any) => c[0].where);
    const created = cpCalls.filter((w: any) => w.createdAt);
    expect(created).toHaveLength(2);
    const thisWeekStart = created[0].createdAt.gte;
    const lastWindow = created[1].createdAt;
    // The upper bound of last week must be exactly this week's lower bound —
    // otherwise a carrier lands in both buckets or neither.
    expect(lastWindow.lt.getTime()).toBe(thisWeekStart.getTime());
    expect(lastWindow.gte.getTime()).toBeLessThan(lastWindow.lt.getTime());
  });

  it("counts only SIGNED broker-carrier agreements", async () => {
    await request(await app()).get("/api/analytics/bench-board");
    for (const call of mockPrisma.carrierAgreement.count.mock.calls) {
      expect(call[0].where.templateName).toBe("broker-carrier");
      expect(call[0].where.status).toBe("SIGNED");
    }
  });

  it("excludes test accounts from the sourced and approved counters", async () => {
    // Otherwise a week of fixture-building reads as a week of business.
    await request(await app()).get("/api/analytics/bench-board");
    for (const call of mockPrisma.carrierProfile.count.mock.calls) {
      expect(call[0].where.isTestAccount).toBe(false);
    }
  });

  it("reports a delta that is thisWeek minus lastWeek, including negative", async () => {
    mockPrisma.carrierProfile.count
      .mockResolvedValueOnce(2)  // sourced this
      .mockResolvedValueOnce(5)  // sourced last
      .mockResolvedValueOnce(1)  // approved this
      .mockResolvedValueOnce(1); // approved last
    const res = await request(await app()).get("/api/analytics/bench-board");
    expect(res.body.weekly.sourced).toEqual({ thisWeek: 2, lastWeek: 5, delta: -3 });
    expect(res.body.weekly.approved).toEqual({ thisWeek: 1, lastWeek: 1, delta: 0 });
  });

  it("does NOT attach a delta to the tenderable count", async () => {
    // There is no history for it — nothing records what it was last Tuesday —
    // so a week-over-week figure would have to be invented.
    const res = await request(await app()).get("/api/analytics/bench-board");
    expect(res.body.weekly).not.toHaveProperty("tenderable");
    expect(typeof res.body.bench.tenderable).toBe("number");
  });
});
