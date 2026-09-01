/**
 * INVARIANT: a load reads TENDERED only if a LoadTender row backs it.
 *
 * This is the v3.8.j incident class — "the load advanced through TENDERED with
 * no carrier ever assigned" — reaching production again through a route the
 * original guard did not cover. That guard lives in loadController.updateLoad;
 * waterfallEngineService writes `prisma.load.update` directly from a service
 * and never passes through it.
 *
 * How it failed: startWaterfall flipped the load to TENDERED optimistically,
 * BEFORE tenderPosition ran and therefore before anything knew whether a tender
 * would be sent at all. A fallback-only cascade — which is every cascade today,
 * since scoring requires cppTier SILVER+ and no carrier holds it — took the
 * isFallback branch and created zero LoadTender rows. The load then read
 * TENDERED with nothing tendered, invisible to the carrier loadboard, to
 * outreach and to re-cascade (all POSTED-gated), and unreachable by the tender
 * expiry sweep, which derives its set from EXPIRED tenders and so can never see
 * a load that has none. SRL-121488 sat in exactly that state.
 *
 * These tests drive the REAL exported functions. The invariant is asserted
 * structurally — every load.update is inspected — rather than by checking that
 * one known line is absent, so a future writer added anywhere in the module is
 * caught too.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// The activity timeline is not what this file is about, and it cannot be
// reached through the shared prisma mock anyway: loadActivityService
// constructs its OWN PrismaClient (loadActivityService.ts:1) instead of
// importing the mocked singleton from config/database, so it tries to open a
// real connection under test. Stubbed at the wrapper seam.
vi.mock("../../../src/services/waterfallEventService", () => ({
  logWaterfallEvent: vi.fn().mockResolvedValue(undefined),
  // v3.8.axe — createTender records an opening transition through this export.
  // Deliberately NOT aliased to logWaterfallEvent: aliasing would hide exactly
  // the kind of divergence this mock gap just surfaced (§19 Sub-pattern 11).
  logTenderTransition: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../src/routes/trackTraceSSE", () => ({
  broadcastSSE: vi.fn(),
}));

import { prisma } from "../../../src/config/database";
import {
  startWaterfall,
  triggerFallbackChain,
  promoteStaleOpenLoadsToDat,
} from "../../../src/services/waterfallEngineService";

const mockPrisma = prisma as any;

/** Every `data` object passed to prisma.load.update during a test. */
function loadUpdates(): any[] {
  return (mockPrisma.load.update.mock.calls ?? []).map((c: any[]) => c[0]?.data ?? {});
}
function wroteTendered(): boolean {
  return loadUpdates().some((d) => d.status === "TENDERED");
}

const LOAD_ID = "load-1";
const WF_ID = "wf-1";

beforeEach(() => {
  vi.clearAllMocks();

  mockPrisma.waterfall = {
    findUnique: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
  };
  mockPrisma.waterfallPosition = {
    findFirst: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
  };
  mockPrisma.carrierProfile.findUnique.mockResolvedValue({ id: "cp-1", userId: "u-1" });
  mockPrisma.load.update.mockResolvedValue({});
  mockPrisma.load.findMany.mockResolvedValue([]);
  mockPrisma.loadTender.create.mockResolvedValue({ id: "t-1" });
  mockPrisma.loadBid = { count: vi.fn().mockResolvedValue(0) };
  mockPrisma.loadActivity = { create: vi.fn().mockResolvedValue({}) };
  mockPrisma.waterfallEvent = { create: vi.fn().mockResolvedValue({}) };
  mockPrisma.notification.create.mockResolvedValue({});
  mockPrisma.systemLog.create.mockResolvedValue({});

  // Array form: execute what it is handed, like the real client.
  mockPrisma.$transaction.mockImplementation(async (arg: any) =>
    Array.isArray(arg) ? Promise.all(arg) : arg(mockPrisma),
  );
});

/** A cascade whose only position is the DAT fallback — the live shape today. */
function fallbackOnlyWaterfall() {
  mockPrisma.waterfall.findUnique.mockResolvedValue({
    id: WF_ID,
    loadId: LOAD_ID,
    status: "building",
    positions: [{ id: "p-1", position: 1, isFallback: true, carrierId: null }],
    load: { id: LOAD_ID, customerRate: 1000, carrierRate: 900 },
  });
  mockPrisma.waterfallPosition.findFirst.mockResolvedValue({
    id: "p-1",
    position: 1,
    isFallback: true,
    carrierId: null,
    waterfall: { loadId: LOAD_ID, mode: "semi_auto" },
  });
}

function carrierWaterfall() {
  mockPrisma.waterfall.findUnique.mockResolvedValue({
    id: WF_ID,
    loadId: LOAD_ID,
    status: "building",
    positions: [{ id: "p-1", position: 1, isFallback: false, carrierId: "u-1" }],
    load: { id: LOAD_ID, customerRate: 1000, carrierRate: 900 },
  });
  mockPrisma.waterfallPosition.findFirst.mockResolvedValue({
    id: "p-1",
    position: 1,
    isFallback: false,
    carrierId: "u-1",
    offeredRate: 900,
    waterfall: { loadId: LOAD_ID, mode: "semi_auto" },
  });
}

describe("the invariant: TENDERED implies a LoadTender exists", () => {
  it("a fallback-only cascade never writes TENDERED — this is SRL-121488", async () => {
    fallbackOnlyWaterfall();
    mockPrisma.load.findUnique.mockResolvedValue({ status: "POSTED" });

    await startWaterfall(WF_ID);

    expect(mockPrisma.loadTender.create).not.toHaveBeenCalled();
    expect(wroteTendered()).toBe(false);
  });

  it("a carrier cascade writes TENDERED, and only alongside the tender", async () => {
    carrierWaterfall();
    mockPrisma.load.findUnique.mockResolvedValue({ status: "POSTED" });

    await startWaterfall(WF_ID);

    expect(mockPrisma.loadTender.create).toHaveBeenCalledTimes(1);
    expect(wroteTendered()).toBe(true);
  });

  it("the tender and the status flip go in ONE transaction, not two writes", async () => {
    carrierWaterfall();
    mockPrisma.load.findUnique.mockResolvedValue({ status: "POSTED" });

    await startWaterfall(WF_ID);

    // Both operations go through ONE $transaction, so a failure to create the
    // tender cannot leave the status flipped behind it.
    //
    // v3.8.axe — re-aimed from the ARRAY SHAPE to the invariant. This asserted
    // `Array.isArray(batch) && batch.length === 2`, which pinned an
    // implementation detail: the cascade now uses the interactive form, because
    // createTender is async (it must write a transition row) and an async call
    // cannot be an element of $transaction([...]). The intent — one transaction
    // containing both writes — is unchanged, so the assertion follows the
    // intent rather than the form.
    //
    // What a unit test can prove here is that a transaction is opened at all;
    // with Prisma mocked, "inside" and "outside" the callback are the same
    // object. That a rollback actually rolls back is proven against a real
    // database in scripts/_create-tender-proof.ts, case 4.
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(typeof mockPrisma.$transaction.mock.calls[0][0]).toBe("function");
    expect(mockPrisma.loadTender.create).toHaveBeenCalledTimes(1);
    expect(wroteTendered()).toBe(true);
  });

  it("startWaterfall itself writes visibility but never status", async () => {
    fallbackOnlyWaterfall();
    mockPrisma.load.findUnique.mockResolvedValue({ status: "POSTED" });

    await startWaterfall(WF_ID);

    const visibilityWrite = loadUpdates().find((d) => d.visibility === "waterfall");
    expect(visibilityWrite).toBeTruthy();
    expect(visibilityWrite.status).toBeUndefined();
  });

  it("no second flip when the load is already TENDERED", async () => {
    carrierWaterfall();
    mockPrisma.load.findUnique.mockResolvedValue({ status: "TENDERED" });

    await startWaterfall(WF_ID);

    expect(mockPrisma.loadTender.create).toHaveBeenCalledTimes(1);
    // v3.8.axe — the tender records; the status must NOT move a second time.
    // Was `batch.length === 1`; now asserts the absence of the flip directly,
    // which is what the title claims and survives the array/interactive change.
    expect(wroteTendered()).toBe(false);
  });

  it("an illegal starting state does not get flipped to TENDERED", async () => {
    carrierWaterfall();
    // DELIVERED has no path to TENDERED in the AE map. The tender still
    // records (the offer happened); the status must not move.
    mockPrisma.load.findUnique.mockResolvedValue({ status: "DELIVERED" });

    await startWaterfall(WF_ID);

    // v3.8.axe — the offer still records; the illegal flip must not happen.
    expect(mockPrisma.loadTender.create).toHaveBeenCalledTimes(1);
    expect(wroteTendered()).toBe(false);
  });
});

describe("exhaustion returns the load to the board", () => {
  it("visibility and status move together on exhaustion", async () => {
    mockPrisma.load.findUnique.mockResolvedValue({ status: "TENDERED", posterId: null });

    await triggerFallbackChain(LOAD_ID, WF_ID);

    const d = loadUpdates().find((u) => u.visibility === "open");
    expect(d).toBeTruthy();
    expect(d.status).toBe("POSTED");
  });

  it("a load that is not TENDERED is left alone", async () => {
    mockPrisma.load.findUnique.mockResolvedValue({ status: "BOOKED", posterId: null });

    await triggerFallbackChain(LOAD_ID, WF_ID);

    const d = loadUpdates().find((u) => u.visibility === "open");
    expect(d.status).toBeUndefined();
  });

  it("DAT promotion heals a pre-fix row rather than burying it", async () => {
    mockPrisma.load.findMany.mockResolvedValue([
      { id: LOAD_ID, posterId: null, referenceNumber: "R", loadNumber: "SRL-121488" },
    ]);
    mockPrisma.load.findUnique.mockResolvedValue({ status: "TENDERED" });

    await promoteStaleOpenLoadsToDat();

    const d = loadUpdates().find((u) => u.visibility === "dat");
    expect(d).toBeTruthy();
    expect(d.status).toBe("POSTED");
  });
});

describe("the guard cannot pass vacuously", () => {
  it("loadUpdates() actually observes writes", async () => {
    mockPrisma.load.findUnique.mockResolvedValue({ status: "TENDERED", posterId: null });
    await triggerFallbackChain(LOAD_ID, WF_ID);
    expect(loadUpdates().length).toBeGreaterThan(0);
  });
});
