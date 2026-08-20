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

describe("the health endpoints expose it", () => {
  // THIS TEST WAS WRONG AND STILL PASSED. It pinned server.ts, which serves the
  // internal /health — while the endpoint anyone actually reads for deploy
  // verification, and the one that misled during the incident, is /api/health in
  // routes/index.ts. The field shipped to the wrong handler, tsc was clean, this
  // assertion was green, and production returned no schema field at all. Caught
  // only by curling production.
  //
  // So both are pinned now, and the /api one first, because it is the one the
  // lesson is about.
  const read = async (rel: string) => {
    const fs = await import("fs");
    const path = await import("path");
    return fs.readFileSync(path.join(__dirname, "../../../src", rel), "utf8");
  };

  it("/api/health — the endpoint used for deploy verification", async () => {
    const src = await read("routes/index.ts");
    expect(src).toContain("schema: await schemaInfo()");

    const sha = src.indexOf("...buildInfo()");
    const schema = src.indexOf("schema: await schemaInfo()");
    expect(sha).toBeGreaterThan(-1);
    expect(schema).toBeGreaterThan(sha);
  });

  it("/health — the internal check, kept consistent with it", async () => {
    const src = await read("server.ts");
    expect(src).toContain("schema: await schemaInfo()");
  });

  it("both handlers are async, since reading the ledger is a query", async () => {
    // The /api/health handler was synchronous; adding an awaited call without
    // making it async would have silently serialised a Promise into the body.
    const api = await read("routes/index.ts");
    expect(api).toContain('router.get("/health", async (_req, res)');
    const internal = await read("server.ts");
    expect(internal).toContain('app.get("/health", async (_req, res)');
  });
});
