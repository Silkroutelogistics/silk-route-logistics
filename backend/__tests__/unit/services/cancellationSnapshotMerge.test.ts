/**
 * The DEFERRED half of the cancellation before-image.
 *
 * cancelCascade captures the rows it writes inside the cancel transaction.
 * onLoadCancelledOrTONU runs fire-and-forget AFTERWARDS and writes the money
 * rows -- tenders, shipper credit, carrier pay -- which the transactional half
 * never sees. An un-cancel that guessed at those would either strand a
 * carrier's pay or double-count a shipper's credit, so they are recorded.
 *
 * THE ABSENT CASE IS THE INTERESTING ONE. That path can fail independently, and
 * when it does the keys stay absent. Absent must never become a default: the
 * un-cancel refuses it instead. These cases pin that the merge does not invent
 * a container to attach to.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { mergeCancellationSnapshot } from "../../../src/services/cancelCascade";
import { prisma } from "../../../src/config/database";

const mockPrisma = prisma as any;
const SRC = path.resolve(__dirname, "../../../src/services/integrationService.ts");
const src = fs.readFileSync(SRC, "utf8");

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.load.findUnique.mockResolvedValue(null);
  mockPrisma.load.update.mockResolvedValue({});
});

describe("mergeCancellationSnapshot — v3.8.biv", () => {
  it("writes NOTHING when the transactional half never ran", async () => {
    // Inventing a container here would produce a snapshot that looks complete
    // and describes half a cancel. Absent is the honest state.
    mockPrisma.load.findUnique.mockResolvedValue({ cancellationSnapshot: null });
    const ok = await mergeCancellationSnapshot("load-1", { tenders: [] });
    expect(ok).toBe(false);
    expect(mockPrisma.load.update).not.toHaveBeenCalled();
  });

  it("adds the deferred keys onto an existing snapshot", async () => {
    mockPrisma.load.findUnique.mockResolvedValue({
      cancellationSnapshot: { version: 1, takenAt: "T", shipments: [], trackingTokenRevoked: true, shipperTrackingTokens: [], rateConfirmations: [] },
    });
    const ok = await mergeCancellationSnapshot("load-1", {
      tenders: [{ id: "t1", status: "OFFERED", deletedAt: null }],
      carrierPays: [{ id: "cp1", status: "PREPARED", notes: null }],
      shipperCredit: null,
    });
    expect(ok).toBe(true);
    const [arg] = mockPrisma.load.update.mock.calls[0];
    const snap = arg.data.cancellationSnapshot;
    expect(snap.tenders).toEqual([{ id: "t1", status: "OFFERED", deletedAt: null }]);
    expect(snap.carrierPays).toEqual([{ id: "cp1", status: "PREPARED", notes: null }]);
    expect(snap.shipments, "the transactional half must survive the merge").toEqual([]);
    expect(snap.version).toBe(1);
  });

  it("a re-run cannot overwrite what was already recorded", async () => {
    // The first reading is the only one taken before the writes.
    mockPrisma.load.findUnique.mockResolvedValue({
      cancellationSnapshot: { version: 1, tenders: [{ id: "t1", status: "OFFERED", deletedAt: null }] },
    });
    await mergeCancellationSnapshot("load-1", { tenders: [{ id: "t1", status: "WITHDRAWN", deletedAt: "X" }] });
    const [arg] = mockPrisma.load.update.mock.calls[0];
    expect(arg.data.cancellationSnapshot.tenders[0].status, "a second pass overwrote the original reading").toBe("OFFERED");
  });
});

describe("the capture is wired BEFORE the writes — structural", () => {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  const fn = code.slice(code.indexOf("export async function onLoadCancelledOrTONU("));
  const body = fn.slice(0, fn.indexOf("\nexport "));

  it("finds the function (vacuity tripwire)", () => {
    expect(body.length, "the slice found nothing — the scanner is broken, not the file").toBeGreaterThan(500);
  });

  it("captures the before-image ahead of withdrawLiveTenders", () => {
    const capture = body.indexOf("mergeCancellationSnapshot(");
    const withdraw = body.indexOf("withdrawLiveTenders(");
    expect(capture, "no before-image capture in the cancellation cleanup").toBeGreaterThan(-1);
    expect(withdraw).toBeGreaterThan(-1);
    expect(capture, "the before-image is taken AFTER the tenders are withdrawn — it records the damage").toBeLessThan(withdraw);
  });

  it("reads the tender set from the shared constants, not a fourth hand-written copy", () => {
    expect(body).toContain("status: { in: [...LIVE_STATES, ...HOLDS_LOAD] }");
  });

  // Finding B. Recording only the tenders the cancel WITHDREW left a committed
  // carrier tender out of the before-image, and uncancelPolicy then read its
  // absence as "tendered again since the cancel" -- refusing the reversal on
  // exactly the loads most likely to need one. HOLDS_LOAD is the set that holds
  // the load without being live: ACCEPTED, RC_SENT, CONFIRMED.
  it("records the tenders that HOLD the load, not only the ones it withdrew", () => {
    expect(body, "HOLDS_LOAD missing from the capture query -- a CONFIRMED tender goes unrecorded").toContain("HOLDS_LOAD");
  });
});
