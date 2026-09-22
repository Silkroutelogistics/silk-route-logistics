/**
 * Carrier-archive recut B2b (2026-09-21) — the gate is inside the chokepoints,
 * and every path that reaches a chokepoint is named.
 *
 * `createTender` is the single LoadTender writer and `assignCarrier` the single
 * Load.carrierId writer (held by loadTenderWriters / carrierIdWriterDrift).
 * Until B2b neither asked the compliance gate, so the refusal was the caller's
 * or nobody's, and Phase A found five live paths on which it was nobody's.
 * This suite holds three things:
 *
 *   1. Each chokepoint calls the gate BEFORE its write, on the right id space
 *      (profile id for tenders, user id resolved to a profile for assignment),
 *      and `clearCarrier` does not — releasing an ineligible carrier must work.
 *   2. The set of files that CALL each chokepoint is frozen by name — a sixth
 *      entry surface is a deliberate edit here, not an accident. Call sites,
 *      not importers: carrierLoads.ts imports assignCarrier and never calls it.
 *      instant-book is on the assignCarrier list BY NAME (Item 291 / the §13.3
 *      instant-book repair item): it passes a CarrierProfile id where a User id
 *      belongs and stays dead by construction — now refused by the gate's
 *      "no profile for that user" branch rather than by an FK violation.
 *   3. Behaviourally: when the gate refuses, no write is attempted.
 *
 * The scanner blanks comments and matches the bound local name across a line
 * break (§19 Sub-pattern 18), and a vacuity tripwire proves it sees the sites
 * this tree is known to have.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.resolve(__dirname, "../../../src");

/** Blank comments in place so prose cannot satisfy a code assertion. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}
function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.ts$/.test(e.name) && !/\.d\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}
const rel = (p: string) => path.relative(SRC, p).replace(/\\/g, "/");

/**
 * For one chokepoint export: every src file that imports it (under any local
 * name) and CALLS that name at least once. Returns rel path → call count.
 */
function callers(exportName: string, modulePath: RegExp): Map<string, number> {
  const out = new Map<string, number>();
  for (const f of walk(SRC)) {
    const src = code(fs.readFileSync(f, "utf8"));
    const imp = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*"[^"]*${modulePath.source}"`, "g");
    let local: string | null = null;
    for (const m of src.matchAll(imp)) {
      for (const part of m[1].split(",")) {
        const [orig, alias] = part.trim().split(/\s+as\s+/);
        if (orig === exportName) local = alias ?? orig;
      }
    }
    if (!local) continue;
    // a CALL: the local name followed by `(`, not preceded by `.` (a method of
    // something else) or by `function ` (a definition).
    const call = new RegExp(`(?<![.\\w])${local}\\s*\\(`, "g");
    const n = [...src.matchAll(call)].length;
    if (n > 0) out.set(rel(f), n);
  }
  return out;
}

const CREATE_TENDER_CALLERS = [
  "controllers/tenderController.ts", // direct tender (as createTenderRow)
  "controllers/withTenderController.ts", // load + tender drawer
  "routes/carrierLoads.ts", // carrier load-board accept
  "routes/loadBids.ts", // AE accepts a bid
  "services/broadcastTenderService.ts", // broadcast — Phase A row C
  "services/waterfallEngineService.ts", // the cascade's own tenderPosition — row D's offer
  "services/waterfallTenderService.ts", // manual waterfall launch
].sort();

const ASSIGN_CARRIER_CALLERS = [
  "controllers/tenderController.ts", // acceptTender (on-behalf delegates)
  "routes/automation.ts", // assign-match (row A) and fall-off-accept's route half
  "routes/loadBids.ts", // AE accepts a bid → DISPATCHED
  "services/fallOffRecovery.ts", // row B's service half
  "services/instantBookService.ts", // row E — DEAD BY CONSTRUCTION, listed by name
  "services/waterfallEngineService.ts", // acceptPosition
].sort();

describe("chokepoint gate coverage (B2b)", () => {
  const assignSrc = code(fs.readFileSync(path.join(SRC, "services/carrierAssignmentService.ts"), "utf8"));
  const tenderSrc = code(fs.readFileSync(path.join(SRC, "services/tenderCreationService.ts"), "utf8"));

  it("createTender asks the gate by PROFILE id before it writes the tender", () => {
    const fn = tenderSrc.slice(tenderSrc.indexOf("export async function createTender("));
    const gate = fn.indexOf('assertEligibleByProfileId(input.carrierProfileId, "createTender")');
    const write = fn.indexOf("db.loadTender.create(");
    expect(gate, "createTender must call assertEligibleByProfileId on input.carrierProfileId").toBeGreaterThan(-1);
    expect(write, "createTender's write not found — scanner broken").toBeGreaterThan(-1);
    expect(gate, "the gate must come before the write").toBeLessThan(write);
  });

  it("assignCarrier asks the gate by USER id before it writes, and clearCarrier does not", () => {
    const assign = assignSrc.slice(
      assignSrc.indexOf("export async function assignCarrier("),
      assignSrc.indexOf("export interface ClearCarrierInput"),
    );
    const gate = assign.indexOf('assertEligibleByUserId(carrierUserId, "assignCarrier")');
    const write = assign.indexOf("db.load.update(");
    expect(gate, "assignCarrier must call assertEligibleByUserId on carrierUserId").toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(-1);
    expect(gate, "the gate must come before the write").toBeLessThan(write);
    expect(assign, "assignCarrier must refuse extra.carrierId — spread last, it would override the gated value").toMatch(
      /hasOwnProperty\.call\(extra, "carrierId"\)/,
    );
    const clear = assignSrc.slice(assignSrc.indexOf("export function clearCarrier("));
    expect(clear, "clearCarrier must NOT be gated — releasing an ineligible carrier must always work").not.toMatch(/assertEligible/);
  });

  it("every createTender caller is named, and no unnamed file calls it", () => {
    const found = callers("createTender", /tenderCreationService/);
    expect(found.size, "vacuity tripwire — the scanner must see the known callers").toBeGreaterThanOrEqual(6);
    expect([...found.keys()].sort()).toEqual(CREATE_TENDER_CALLERS);
  });

  it("every assignCarrier caller is named — instant-book by name — and carrierLoads' dead import is not one", () => {
    const found = callers("assignCarrier", /carrierAssignmentService/);
    expect(found.size, "vacuity tripwire").toBeGreaterThanOrEqual(6);
    expect([...found.keys()].sort()).toEqual(ASSIGN_CARRIER_CALLERS);
    expect(found.has("services/instantBookService.ts"), "instant-book must appear on this list by name").toBe(true);
    expect(found.has("routes/carrierLoads.ts"), "carrierLoads imports assignCarrier and never calls it — importers are not callers").toBe(false);
  });

  it("instant-book still hands a CarrierProfile id to assignCarrier — dead by construction, refused by the gate's no-profile branch", () => {
    const ib = code(fs.readFileSync(path.join(SRC, "services/instantBookService.ts"), "utf8"));
    // canInstantBook resolves the carrier by primary key …
    expect(ib).toMatch(/carrierProfile\.findUnique\(\s*\{\s*where:\s*\{\s*id:\s*carrierId/);
    // … and the same value is passed as the user id. When somebody repairs this
    // (§13.3 instant-book item) this case goes red ON PURPOSE: the repair must
    // then decide what gates POST /api/ai/instant-book, which today is
    // authenticate-only with no authorize.
    expect(ib).toMatch(/carrierUserId:\s*carrierId/);
  });
});

describe("chokepoint gate behaviour (B2b)", () => {
  const eligibility = vi.hoisted(() => ({
    assertEligibleByUserId: vi.fn(),
    assertEligibleByProfileId: vi.fn(),
  }));
  vi.mock("../../../src/lib/carrierEligibility", () => ({
    assertEligibleByUserId: eligibility.assertEligibleByUserId,
    assertEligibleByProfileId: eligibility.assertEligibleByProfileId,
    isCarrierIneligible: (e: unknown) => (e as any)?.code === "CARRIER_INELIGIBLE",
  }));
  vi.mock("../../../src/config/database", () => ({ prisma: {} }));
  vi.mock("../../../src/services/waterfallEventService", () => ({ logTenderTransition: vi.fn().mockResolvedValue(undefined) }));

  beforeEach(() => {
    eligibility.assertEligibleByUserId.mockReset();
    eligibility.assertEligibleByProfileId.mockReset();
  });

  it("assignCarrier attempts no write when the gate refuses", async () => {
    const { assignCarrier } = await import("../../../src/services/carrierAssignmentService");
    const refusal = Object.assign(new Error("refused"), { code: "CARRIER_INELIGIBLE", status: 403 });
    eligibility.assertEligibleByUserId.mockRejectedValue(refusal);
    const db = { load: { update: vi.fn() } } as any;
    await expect(assignCarrier({ loadId: "L", carrierUserId: "U", actor: "AUTO", status: "BOOKED" }, db)).rejects.toBe(refusal);
    expect(db.load.update).not.toHaveBeenCalled();
    expect(eligibility.assertEligibleByUserId).toHaveBeenCalledWith("U", "assignCarrier");
  });

  it("assignCarrier writes when the gate allows, and refuses extra.carrierId without asking the gate", async () => {
    const { assignCarrier } = await import("../../../src/services/carrierAssignmentService");
    eligibility.assertEligibleByUserId.mockResolvedValue({ carrierProfileId: "cp", verdict: { allowed: true } });
    const db = { load: { update: vi.fn().mockResolvedValue({ id: "L" }) } } as any;
    await assignCarrier({ loadId: "L", carrierUserId: "U", actor: "AUTO", status: "BOOKED" }, db);
    expect(db.load.update).toHaveBeenCalledTimes(1);
    expect(db.load.update.mock.calls[0][0].data.carrierId).toBe("U");
    await expect(
      assignCarrier({ loadId: "L", carrierUserId: "U", actor: "AUTO", extra: { carrierId: "X" } as any }, db),
    ).rejects.toThrow(/extra\.carrierId/);
    expect(eligibility.assertEligibleByUserId).toHaveBeenCalledTimes(1);
  });

  it("createTender attempts no write when the gate refuses", async () => {
    const { createTender } = await import("../../../src/services/tenderCreationService");
    const refusal = Object.assign(new Error("refused"), { code: "CARRIER_INELIGIBLE", status: 403 });
    eligibility.assertEligibleByProfileId.mockRejectedValue(refusal);
    const db = { load: { findUnique: vi.fn() }, loadTender: { findFirst: vi.fn(), create: vi.fn() } } as any;
    await expect(createTender({ loadId: "L", carrierProfileId: "CP", offeredRate: 100 }, db)).rejects.toBe(refusal);
    expect(db.loadTender.create).not.toHaveBeenCalled();
    expect(db.load.findUnique, "the gate must run before even the fan-out read").not.toHaveBeenCalled();
  });
});
