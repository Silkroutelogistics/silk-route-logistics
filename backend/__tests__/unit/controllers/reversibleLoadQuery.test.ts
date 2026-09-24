/**
 * GET /loads?reversible=true — the reversal queue behind the board.
 *
 * Three properties, and the second is the one ruling 3 turns on:
 *   1. it is ADMIN/CEO only, refused server-side and not merely hidden;
 *   2. it does NOT change what activeOnly means, so no other surface moves;
 *   3. it includes soft-deleted loads, because the archive path cancels AND
 *      hides -- a listing that kept deletedAt: null would miss exactly the
 *      loads most likely to need reversing.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { getLoads } from "../../../src/controllers/loadController";
import { prisma } from "../../../src/config/database";
import { UNCANCEL_WINDOW_HOURS } from "../../../src/lib/uncancelPolicy";

const mockPrisma = prisma as any;

function mockReqRes(query: Record<string, string>, role = "ADMIN") {
  return {
    req: { query, params: {}, body: {}, headers: {}, user: { id: "u1", role, email: "a@x" } } as any,
    res: { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any,
  };
}

/** The where-clause the controller actually handed Prisma. */
function whereOf() {
  const call = mockPrisma.load.findMany.mock.calls[0];
  return call ? call[0].where : null;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.load.findMany.mockResolvedValue([]);
  mockPrisma.load.count.mockResolvedValue(0);
  mockPrisma.invoice.findMany.mockResolvedValue([]);
});

describe("the reversal queue — v3.8.bja", () => {
  it("is refused for every role but ADMIN and CEO", async () => {
    for (const role of ["BROKER", "DISPATCH", "OPERATIONS", "ACCOUNTING", "CARRIER", "SHIPPER"]) {
      vi.clearAllMocks();
      mockPrisma.load.findMany.mockResolvedValue([]);
      mockPrisma.load.count.mockResolvedValue(0);
      const { req, res } = mockReqRes({ reversible: "true" }, role);
      await getLoads(req, res);
      expect(res.status, role + " reached the reversal queue").toHaveBeenCalledWith(403);
      expect(mockPrisma.load.findMany, role + " ran the query").not.toHaveBeenCalled();
    }
  });

  it.each(["ADMIN", "CEO"])("%s may read it", async (role) => {
    const { req, res } = mockReqRes({ reversible: "true" }, role);
    await getLoads(req, res);
    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(mockPrisma.load.findMany).toHaveBeenCalled();
  });

  it("asks for CANCELLED loads inside the window", async () => {
    const before = Date.now();
    const { req, res } = mockReqRes({ reversible: "true" });
    await getLoads(req, res);
    const where = whereOf();
    expect(where.status).toBe("CANCELLED");
    const cutoff = where.cancelledAt.gte.getTime();
    const expected = before - UNCANCEL_WINDOW_HOURS * 3_600_000;
    // Within a second of the window's edge, computed from the same constant the
    // policy refuses on — so the tab and the button cannot disagree about when
    // a load stops being reversible.
    expect(Math.abs(cutoff - expected)).toBeLessThan(2000);
  });

  it("INCLUDES soft-deleted loads — the archive path cancels and hides", async () => {
    const { req, res } = mockReqRes({ reversible: "true" });
    await getLoads(req, res);
    expect(whereOf()).not.toHaveProperty("deletedAt");
  });

  it("leaves activeOnly exactly as it was (ruling 3)", async () => {
    const { req, res } = mockReqRes({ activeOnly: "true" });
    await getLoads(req, res);
    const where = whereOf();
    expect(where.deletedAt).toBeNull();
    expect(where.status).toEqual({
      notIn: ["DELIVERED", "POD_RECEIVED", "INVOICED", "COMPLETED", "TONU", "CANCELLED"],
    });
  });

  it("a plain board request is untouched by any of this", async () => {
    const { req, res } = mockReqRes({});
    await getLoads(req, res);
    const where = whereOf();
    expect(where).not.toHaveProperty("cancelledAt");
    expect(where.deletedAt).toBeNull();
  });
});

describe("the response says whether a row can actually be reversed", () => {
  it("strips the snapshot blob and answers with a boolean", async () => {
    mockPrisma.load.findMany.mockResolvedValue([
      { id: "l1", status: "CANCELLED", cancellationSnapshot: { version: 1, load: { status: "BOOKED" } } },
      { id: "l2", status: "CANCELLED", cancellationSnapshot: null },
    ]);
    mockPrisma.load.count.mockResolvedValue(2);
    const { req, res } = mockReqRes({ reversible: "true" });

    await getLoads(req, res);

    const [payload] = res.json.mock.calls[0];
    expect(payload.loads).toHaveLength(2);
    // The blob is an internal before-image. A list has use for whether one
    // exists, never for what is in it.
    expect(payload.loads[0]).not.toHaveProperty("cancellationSnapshot");
    expect(payload.loads[1]).not.toHaveProperty("cancellationSnapshot");
    expect(payload.loads[0].reversible).toBe(true);
    // Cancelled before SRL recorded before-images: it is listed, and the
    // surface can say why the action is unavailable instead of offering a
    // button that refuses.
    expect(payload.loads[1].reversible).toBe(false);
  });
});
