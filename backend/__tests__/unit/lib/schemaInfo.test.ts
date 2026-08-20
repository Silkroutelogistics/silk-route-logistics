// /api/health reports which schema production is on.
//
// The incident this closes: a column-drop migration reached production and
// /api/health reported the commit BEFORE it, because migrate deploy runs during
// the BUILD while the previous process keeps serving. The SHA was correct about
// the process and silent about the database, and the database was what had
// changed.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: { $queryRawUnsafe: vi.fn() },
}));

vi.mock("../../../src/config/database", () => ({ prisma: mockPrisma }));

async function freshModule() {
  // The value is cached per process, so each test needs its own module instance.
  vi.resetModules();
  return await import("../../../src/lib/schemaInfo");
}

describe("schemaInfo", () => {
  beforeEach(() => vi.resetAllMocks());

  it("reports the most recently applied migration", async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([
      { migration_name: "20260819160000_drop_superseded_carrier_doc_urls", finished_at: new Date("2026-08-20T19:59:00Z") },
    ]);

    const { schemaInfo } = await freshModule();
    const info = await schemaInfo();

    expect(info.migration).toBe("20260819160000_drop_superseded_carrier_doc_urls");
    expect(info.appliedAt).toBe("2026-08-20T19:59:00.000Z");
  });

  it("asks only for applied, un-rolled-back migrations, newest first", async () => {
    // A pending or rolled-back row would misreport the live schema, which is the
    // one thing this field exists to get right.
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

    const { schemaInfo } = await freshModule();
    await schemaInfo();

    const sql = mockPrisma.$queryRawUnsafe.mock.calls[0][0] as string;
    expect(sql).toContain("finished_at IS NOT NULL");
    expect(sql).toContain("rolled_back_at IS NULL");
    expect(sql).toContain("ORDER BY finished_at DESC");
  });

  it("caches per process — a migration cannot apply to a running process", async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([
      { migration_name: "m1", finished_at: new Date("2026-08-20T00:00:00Z") },
    ]);

    const { schemaInfo } = await freshModule();
    await schemaInfo();
    await schemaInfo();
    await schemaInfo();

    expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
  });

  it("never throws when the database is unreachable", async () => {
    // /health's main job is answering while things are broken. A failure here
    // must not take down the endpoint that reports the failure.
    mockPrisma.$queryRawUnsafe.mockRejectedValue(new Error("db down"));

    const { schemaInfo } = await freshModule();
    const info = await schemaInfo();

    expect(info).toEqual({ migration: null, appliedAt: null });
  });

  it("does not cache a failure — the next call can still answer", async () => {
    mockPrisma.$queryRawUnsafe.mockRejectedValueOnce(new Error("transient"));
    const { schemaInfo } = await freshModule();
    expect((await schemaInfo()).migration).toBeNull();

    mockPrisma.$queryRawUnsafe.mockResolvedValue([
      { migration_name: "m2", finished_at: new Date("2026-08-20T00:00:00Z") },
    ]);
    expect((await schemaInfo()).migration).toBe("m2");
  });

  it("handles an empty ledger without inventing a migration", async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    const { schemaInfo } = await freshModule();
    expect(await schemaInfo()).toEqual({ migration: null, appliedAt: null });
  });
});

describe("the health endpoint exposes it", () => {
  it("includes schema alongside the SHA", async () => {
    // Pins the wiring, not just the helper. The incident happened because the
    // endpoint reported build identity and nothing about the schema.
    const fs = await import("fs");
    const path = await import("path");
    const server = fs.readFileSync(path.join(__dirname, "../../../src/server.ts"), "utf8");

    expect(server).toContain("schema: await schemaInfo()");
    // Next to buildInfo, so one read answers both "what code" and "what schema".
    const sha = server.indexOf("...buildInfo()");
    const schema = server.indexOf("schema: await schemaInfo()");
    expect(sha).toBeGreaterThan(-1);
    expect(schema).toBeGreaterThan(sha);
  });
});
