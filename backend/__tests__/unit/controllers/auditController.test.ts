/**
 * B6a (2026-09-17) — the Audit Log search narrows the rows AND the count.
 *
 * The page used to filter the current 25-row page client-side and print the
 * server's total beneath it, so a search read "3 of 412 results". `q` now goes
 * to the server and lands on the same `where` the count uses; the total is
 * the truth for the query the AE typed.
 *
 * Adversarially verified at authoring: applying q to the rows but not the
 * count turns the shared-where case red.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";
import { getAuditLogs } from "../../../src/controllers/auditController";

const mockPrisma = prisma as any;

function res() {
  const r: any = { statusCode: 200, body: undefined };
  r.status = (c: number) => { r.statusCode = c; return r; };
  r.json = (b: unknown) => { r.body = b; return r; };
  return r;
}

beforeEach(() => {
  mockPrisma.auditLog.findMany = vi.fn().mockResolvedValue([]);
  mockPrisma.auditLog.count = vi.fn().mockResolvedValue(0);
});

describe("GET /audit/logs?q=", () => {
  it("applies q to the rows and to the count through ONE where", async () => {
    const r = res();
    await getAuditLogs({ query: { q: "otp", page: "2", limit: "25" } } as any, r);
    const rowsWhere = mockPrisma.auditLog.findMany.mock.calls[0][0].where;
    const countWhere = mockPrisma.auditLog.count.mock.calls[0][0].where;
    expect(rowsWhere).toBe(countWhere); // the same object, not merely equal
    expect(rowsWhere.OR).toEqual([
      { user: { email: { contains: "otp", mode: "insensitive" } } },
      { action: { contains: "otp", mode: "insensitive" } },
      { changes: { contains: "otp", mode: "insensitive" } },
    ]);
    expect(mockPrisma.auditLog.findMany.mock.calls[0][0]).toMatchObject({ skip: 25, take: 25 });
    expect(r.body).toMatchObject({ page: 2 });
  });

  it("no q means no OR — the existing filters are untouched", async () => {
    await getAuditLogs({ query: { action: "LOGIN", entity: "Session" } } as any, res());
    const where = mockPrisma.auditLog.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ action: "LOGIN", entity: "Session" });
    expect(mockPrisma.auditLog.count.mock.calls[0][0].where).toBe(where);
  });

  it("q composes with the action/entity filters rather than replacing them", async () => {
    await getAuditLogs({ query: { q: "cj", action: "LOGIN" } } as any, res());
    const where = mockPrisma.auditLog.findMany.mock.calls[0][0].where;
    expect(where.action).toBe("LOGIN");
    expect(where.OR).toHaveLength(3);
  });

  it("caps q at 100 characters by truncation, and trims it", async () => {
    const long = "x".repeat(150);
    await getAuditLogs({ query: { q: `  ${long}  ` } } as any, res());
    const where = mockPrisma.auditLog.findMany.mock.calls[0][0].where;
    expect(where.OR[0].user.email.contains).toHaveLength(100);
    expect(where.OR[2].changes.contains).toBe("x".repeat(100));
  });

  it("a whitespace-only q is no q", async () => {
    await getAuditLogs({ query: { q: "   " } } as any, res());
    expect(mockPrisma.auditLog.findMany.mock.calls[0][0].where.OR).toBeUndefined();
  });
});
