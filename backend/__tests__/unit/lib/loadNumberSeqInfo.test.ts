import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { loadNumberSeqInfo, resetLoadNumberSeqCache, LEGACY_FLOOR } from "../../../src/lib/loadNumberSeqInfo";

// WHY AN INJECTED STORE AND NOT A REAL DATABASE. The brief asked for "a test DB
// with the sequence at 121498". The backend CI job has no postgres `services:`
// container -- its DATABASE_URL points at a localhost where nothing listens, so
// that `prisma validate` does not fail -- and 0 of 281 backend tests open a real
// connection (setup.ts mocks src/config/database globally). A real-DB test here
// would be SKIPPED in CI, which is a guard that never runs: the precise failure
// this arc exists to close. The store is injected instead, the classification
// runs for real, and the live query + the GRANT are proven against production in
// R4 -- which is a real database, and the only one that can prove them.

const store = (rows: unknown) => ({ $queryRawUnsafe: async () => rows as any });
const throwing = { $queryRawUnsafe: async () => { throw new Error("permission denied for sequence load_number_seq"); } };

describe("loadNumberSeqInfo", () => {
  beforeEach(() => resetLoadNumberSeqCache());

  it("ADVERSARIAL: a sequence sitting at 121498 is flagged, not passed", async () => {
    const r = await loadNumberSeqInfo(store([{ last_value: 121498n, is_called: false }]), 1_000);
    expect(r.next).toBe(121498);
    expect(r.range).toBe("LEGACY RANGE");
    expect(r.unexpected).toBe(true);
  });

  it("reports the live production state as bare", async () => {
    const r = await loadNumberSeqInfo(store([{ last_value: 5001n, is_called: false }]), 1_000);
    expect(r).toMatchObject({ next: 5001, range: "bare", unexpected: false });
  });

  it("is_called=true means last_value is spent, so next is the one after", async () => {
    // The state after Wasi books load 5001: last_value=5001, is_called=true.
    const r = await loadNumberSeqInfo(store([{ last_value: 5001n, is_called: true }]), 1_000);
    expect(r.next).toBe(5002);
    expect(r.range).toBe("bare");
  });

  it("the boundary is the legacy floor itself", async () => {
    resetLoadNumberSeqCache();
    const at = await loadNumberSeqInfo(store([{ last_value: BigInt(LEGACY_FLOOR), is_called: false }]), 1);
    expect(at.range).toBe("LEGACY RANGE");
    resetLoadNumberSeqCache();
    const below = await loadNumberSeqInfo(store([{ last_value: BigInt(LEGACY_FLOOR - 1), is_called: false }]), 1);
    expect(below.range).toBe("bare");
  });

  it("a FAILED read reports unknown and must never read as bare", async () => {
    const r = await loadNumberSeqInfo(throwing, 1_000);
    expect(r.next).toBeNull();
    expect(r.range).toBeNull();
    expect(r.unexpected).toBeNull();
    expect(r.range).not.toBe("bare"); // the whole point: no evidence != the safe answer
    expect(r.error).toContain("permission denied");
  });

  it("an empty result is unknown, not bare", async () => {
    const r = await loadNumberSeqInfo(store([]), 1_000);
    expect(r.range).toBeNull();
    expect(r.error).toContain("no row");
  });

  it("caches within the TTL but never caches a failure", async () => {
    const ok = await loadNumberSeqInfo(store([{ last_value: 5001n, is_called: false }]), 1_000);
    expect(ok.range).toBe("bare");
    // Same window, a store that would answer differently: the cached value wins.
    expect((await loadNumberSeqInfo(store([{ last_value: 999999n, is_called: false }]), 1_500)).next).toBe(5001);

    resetLoadNumberSeqCache();
    await loadNumberSeqInfo(throwing, 2_000);
    // A failure must not pin "unknown" for the process.
    expect((await loadNumberSeqInfo(store([{ last_value: 5001n, is_called: false }]), 2_100)).range).toBe("bare");
  });

  it("STRUCTURAL: the field is actually wired into the /api/health payload", async () => {
    // Presence of the lib proves nothing about whether health reports it --
    // §19 Sub-pattern 16, fifth fire. This reads the handler source, because the
    // router cannot be booted under the global database mock.
    const src = fs.readFileSync(path.join(__dirname, "../../../src/routes/index.ts"), "utf8");
    const health = src.slice(src.indexOf('router.get("/health"'), src.indexOf('router.get("/health/detailed"'));
    expect(health.length).toBeGreaterThan(200); // vacuity tripwire: the slice found the handler
    expect(health).toContain("load_number_seq: await loadNumberSeqInfo(");
  });
});
