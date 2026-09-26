import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { loadNumberSeqInfo, resetLoadNumberSeqCache } from "../../../src/lib/loadNumberSeqInfo";
import { LOAD_NUMBER_FLOOR } from "../../../src/lib/documentNumber";

// WHY AN INJECTED STORE AND NOT A REAL DATABASE. The backend CI job has no
// postgres `services:` container -- its DATABASE_URL points at a localhost where
// nothing listens, so that `prisma validate` does not fail -- and backend unit
// tests do not open a real connection (setup.ts mocks src/config/database
// globally). A real-DB test here would be SKIPPED in CI, which is a guard that
// never runs. The store is injected instead, the classification runs for real,
// and the live query + the GRANT were proven against production in v3.8.biq.
//
// THE MEANING INVERTED on 2026-09-26 (§21.2 corrected): loads continue from the
// last legacy number, so 121498 and upward is the healthy state and the retired
// 5001 series is the flagged one. The first case is production as it stands.

const store = (rows: unknown) => ({ $queryRawUnsafe: async () => rows as any });
const throwing = { $queryRawUnsafe: async () => { throw new Error("permission denied for sequence load_number_seq"); } };

describe("loadNumberSeqInfo", () => {
  beforeEach(() => resetLoadNumberSeqCache());

  it("ADVERSARIAL: production after 5001 and 5002 (last_value 5002, spent) is flagged BELOW FLOOR, not passed", async () => {
    const r = await loadNumberSeqInfo(store([{ last_value: 5002n, is_called: true }]), 1_000);
    expect(r).toMatchObject({ next: 5003, range: "BELOW FLOOR", unexpected: true });
  });

  it("the state the restart script leaves (121497, spent) reports 121498 as continuing", async () => {
    const r = await loadNumberSeqInfo(store([{ last_value: 121497n, is_called: true }]), 1_000);
    expect(r).toMatchObject({ next: 121498, range: "continuing", unexpected: false });
  });

  it("a fresh sequence (START WITH 121498, not yet called) is continuing", async () => {
    const r = await loadNumberSeqInfo(store([{ last_value: 121498n, is_called: false }]), 1_000);
    expect(r).toMatchObject({ next: 121498, range: "continuing", unexpected: false });
  });

  it("the boundary is the floor itself, and is_called moves it by one", async () => {
    expect(LOAD_NUMBER_FLOOR).toBe(121498);
    const at = await loadNumberSeqInfo(store([{ last_value: BigInt(LOAD_NUMBER_FLOOR), is_called: false }]), 1);
    expect(at.range).toBe("continuing");
    resetLoadNumberSeqCache();
    const below = await loadNumberSeqInfo(store([{ last_value: BigInt(LOAD_NUMBER_FLOOR - 1), is_called: false }]), 1);
    expect(below).toMatchObject({ next: LOAD_NUMBER_FLOOR - 1, range: "BELOW FLOOR", unexpected: true });
    resetLoadNumberSeqCache();
    const spent = await loadNumberSeqInfo(store([{ last_value: BigInt(LOAD_NUMBER_FLOOR - 1), is_called: true }]), 1);
    expect(spent).toMatchObject({ next: LOAD_NUMBER_FLOOR, range: "continuing", unexpected: false });
  });

  it("a FAILED read reports unknown and must never read as continuing", async () => {
    const r = await loadNumberSeqInfo(throwing, 1_000);
    expect(r.next).toBeNull();
    expect(r.range).toBeNull();
    expect(r.unexpected).toBeNull();
    expect(r.range).not.toBe("continuing"); // the whole point: no evidence != the safe answer
    expect(r.error).toContain("permission denied");
  });

  it("an empty result is unknown, not continuing", async () => {
    const r = await loadNumberSeqInfo(store([]), 1_000);
    expect(r.range).toBeNull();
    expect(r.error).toContain("no row");
  });

  it("caches within the TTL but never caches a failure", async () => {
    const ok = await loadNumberSeqInfo(store([{ last_value: 121498n, is_called: false }]), 1_000);
    expect(ok.range).toBe("continuing");
    // Same window, a store that would answer differently: the cached value wins.
    expect((await loadNumberSeqInfo(store([{ last_value: 5002n, is_called: true }]), 1_500)).next).toBe(121498);

    resetLoadNumberSeqCache();
    await loadNumberSeqInfo(throwing, 2_000);
    // A failure must not pin "unknown" for the process.
    expect((await loadNumberSeqInfo(store([{ last_value: 121498n, is_called: false }]), 2_100)).range).toBe("continuing");
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
