/**
 * The routing-guide lookup is CUSTOMER-SCOPED, and that is a leak boundary.
 *
 * RoutingGuide.customerId is nullable: a guide belongs to one customer, or to
 * nobody (global). That makes the customer filter two questions rather than
 * one, and the first cut of B4 got BOTH directions wrong —
 *
 *   customerId set  -> filtered on it alone, so global guides never applied
 *   customerId null -> dropped the filter, so ANY customer's guide matched
 *
 * The second is the one that matters. A shipper's routing guide encodes who
 * they have negotiated with and in what order; letting it steer a load that is
 * not theirs leaks a commercial relationship into another customer's dispatch.
 *
 * Unreachable today — RoutingGuideEntry has zero rows — which is exactly why it
 * needs a test. It becomes reachable on the day the feature starts mattering.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";
import { loadRoutingGuideRanks } from "../../../src/services/waterfallScoringService";

const mockPrisma = prisma as any;

const ctx = (over: Record<string, unknown> = {}) => ({
  loadId: "L1",
  equipmentType: "Dry Van",
  originState: "MI",
  destState: "TX",
  pickupDate: new Date("2026-09-01T12:00:00Z"),
  deliveryDate: new Date("2026-09-03T12:00:00Z"),
  distance: 1200,
  customerRate: 2400,
  carrierRate: 2000,
  customerId: null as string | null,
  ...over,
}) as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.routingGuide.findFirst.mockResolvedValue(null);
});

describe("routing guide lookup — customer scoping", () => {
  it("NEVER queries without a customer filter, which is the leak", () => {
    // The assertion with teeth. An unfiltered query would match whichever
    // guide happened to be most recently updated, for any customer at all.
    return loadRoutingGuideRanks(ctx()).then(() => {
      expect(mockPrisma.routingGuide.findFirst).toHaveBeenCalled();
      for (const call of mockPrisma.routingGuide.findFirst.mock.calls) {
        const where = call[0].where;
        expect(
          "customerId" in where,
          "every routing-guide query must constrain customerId",
        ).toBe(true);
      }
    });
  });

  it("a load with no customer sees ONLY global guides", async () => {
    await loadRoutingGuideRanks(ctx({ customerId: null }));
    const wheres = mockPrisma.routingGuide.findFirst.mock.calls.map((c: any) => c[0].where);
    expect(wheres).toHaveLength(1);
    expect(wheres[0].customerId).toBeNull();
  });

  it("a load WITH a customer asks for their guide first", async () => {
    await loadRoutingGuideRanks(ctx({ customerId: "cust-A" }));
    const wheres = mockPrisma.routingGuide.findFirst.mock.calls.map((c: any) => c[0].where);
    expect(wheres[0].customerId).toBe("cust-A");
  });

  it("falls back to a global guide when the customer has none", async () => {
    await loadRoutingGuideRanks(ctx({ customerId: "cust-A" }));
    const wheres = mockPrisma.routingGuide.findFirst.mock.calls.map((c: any) => c[0].where);
    expect(wheres).toHaveLength(2);
    expect(wheres[0].customerId).toBe("cust-A");
    expect(wheres[1].customerId).toBeNull();
  });

  it("a customer-specific guide WINS — no fallback query is made", async () => {
    mockPrisma.routingGuide.findFirst.mockResolvedValueOnce({
      entries: [{ carrierId: "c1", rank: 1 }],
    });
    const ranks = await loadRoutingGuideRanks(ctx({ customerId: "cust-A" }));
    expect(mockPrisma.routingGuide.findFirst).toHaveBeenCalledTimes(1);
    expect(ranks.get("c1")).toBe(1);
  });

  it("scopes to the lane and excludes expired and inactive guides", async () => {
    await loadRoutingGuideRanks(ctx({ customerId: "cust-A" }));
    const where = mockPrisma.routingGuide.findFirst.mock.calls[0][0].where;
    expect(where.originState).toBe("MI");
    expect(where.destState).toBe("TX");
    expect(where.equipmentType).toBe("Dry Van");
    expect(where.isActive).toBe(true);
    expect(where.deletedAt).toBeNull();
    expect(Array.isArray(where.OR)).toBe(true);
  });

  it("returns an empty map, never throws, when the lookup fails", async () => {
    // Scoring must degrade to NEUTRAL_NO_GUIDE rather than take dispatch down.
    mockPrisma.routingGuide.findFirst.mockRejectedValue(new Error("db is down"));
    const ranks = await loadRoutingGuideRanks(ctx({ customerId: "cust-A" }));
    expect(ranks.size).toBe(0);
  });

  it("short-circuits without touching the DB on an incomplete lane", async () => {
    await loadRoutingGuideRanks(ctx({ originState: "" }));
    expect(mockPrisma.routingGuide.findFirst).not.toHaveBeenCalled();
  });
});
