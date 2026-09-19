/**
 * archiveCarrier / restoreCarrier / suspendCarrier.
 *
 * Carrier-archive recut C3 (2026-09-19), under CLAUDE.md §14 "CARRIER ARCHIVE —
 * RATIFIED 2026-09-19": only IN-FLIGHT work blocks (a load the carrier is on
 * that can still reach POD_RECEIVED — DELIVERED included — or a tender they
 * have accepted on such a load); six classes of open offer WITHDRAW inside the
 * transaction; payables, disputes and every kind of history neither block nor
 * change; the reason is required and recorded; the login is deactivated in the
 * same transaction and restore undoes it. Suspension still requires a reason.
 *
 * B6c (2026-09-19): restore is not a rewind. The carrier returns at REVIEWING
 * whatever it was, the four archive columns are cleared (the lifecycle row
 * keeps what they said), and the chameleon fingerprint is rebuilt AFTER the
 * commit — awaited, reported, never fatal to the restore.
 *
 * The census is mocked here (its own test covers what it reads); what this
 * file proves is what the controller DOES with a census: refuses on the right
 * rows, writes the right things on the tx client, and records the act.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { prisma } from "../../../src/config/database";

vi.mock("../../../src/lib/carrierReferences", async (orig) => {
  const real = await orig<typeof import("../../../src/lib/carrierReferences")>();
  return { ...real, censusCarrierReferences: vi.fn() };
});
vi.mock("../../../src/services/infoRequestService", () => ({
  closeOpenInfoRequestsForStatus: vi.fn().mockResolvedValue([]),
  announceInfoRequestsClosedByStatus: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../src/services/tenderTransitionService", () => ({
  settleTenders: vi.fn().mockResolvedValue({ count: 0, tenderIds: [] }),
}));
vi.mock("../../../src/services/waterfallEngineService", () => ({
  advanceWaterfall: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../src/services/waterfallEventService", () => ({
  logWaterfallEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../src/services/chameleonDetectionService", () => ({
  buildFingerprint: vi.fn().mockResolvedValue(undefined),
}));
import { censusCarrierReferences, type CarrierReferenceCensus } from "../../../src/lib/carrierReferences";
import { closeOpenInfoRequestsForStatus, announceInfoRequestsClosedByStatus } from "../../../src/services/infoRequestService";
import { settleTenders } from "../../../src/services/tenderTransitionService";
import { advanceWaterfall } from "../../../src/services/waterfallEngineService";
import { logWaterfallEvent } from "../../../src/services/waterfallEventService";
import { buildFingerprint } from "../../../src/services/chameleonDetectionService";
import { log } from "../../../src/lib/logger";
import { archiveCarrier, restoreCarrier } from "../../../src/controllers/carrierController";
import { suspendCarrier } from "../../../src/controllers/complianceController";

const mockPrisma = vi.mocked(prisma) as any;
const census = vi.mocked(censusCarrierReferences);
const closeRequests = vi.mocked(closeOpenInfoRequestsForStatus);
const announce = vi.mocked(announceInfoRequestsClosedByStatus);
const settle = vi.mocked(settleTenders);
const advance = vi.mocked(advanceWaterfall);
const logEvent = vi.mocked(logWaterfallEvent);
const rebuild = vi.mocked(buildFingerprint);

const EMPTY: CarrierReferenceCensus = {
  loads: [], tenders: 0, liveTenders: 0, withdrawableTenderIds: [], holdingTenders: [], bids: 0,
  waterfallPositions: 0, openWaterfallPositions: [], carrierPays: 0, unpaidCarrierPays: 0,
  settlements: 0, disputes: 0, agreements: 0, documents: 0, drivers: 0, fallOffs: 0, chameleonMatches: 0,
  infoRequests: 0, overrides: 0, fraudReports: 0, quickPayEnrollments: 0, routingGuideEntries: 0, dockSchedules: 0,
  ediTransactions: 0, exceptionAlerts: 0,
};
const PROFILE = { id: "cp-1", userId: "u-1", companyName: "Peace Transport", deletedAt: null, onboardingStatus: "APPROVED" };
const REASON = { reason: "CEASED_OPERATIONS", archiveNote: "Owner retired, trucks sold." };

function load(id: string, ref: string, status: string, inFlight: boolean) {
  return { id, loadNumber: `SRL-${ref}`, referenceNumber: ref, status, inFlight };
}
function holding(id: string, status: string, l: { id: string; ref: string; status: string; deletedAt?: Date | null }) {
  return { id, status, load: { id: l.id, loadNumber: `SRL-${l.ref}`, referenceNumber: l.ref, status: l.status, deletedAt: l.deletedAt ?? null } } as any;
}

function call(fn: (req: any, res: any) => Promise<any>, params: Record<string, string>, body: Record<string, unknown> = {}) {
  const req = { params, body, user: { id: "ae-1", email: "ae@srl.test", role: "ADMIN" }, headers: {} } as any;
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
  return { req, res, run: () => fn(req, res) };
}

describe("archiveCarrier", () => {
  /** The tx client the interactive $transaction hands the controller — a distinct object, so "on the tx" is provable. */
  let tx: any;
  beforeEach(() => {
    vi.clearAllMocks();
    tx = mockPrisma; // the shared mock plays the transaction client; identity is what the assertions check
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(PROFILE);
    mockPrisma.$transaction.mockImplementation(async (ops: any) => (typeof ops === "function" ? ops(tx) : Promise.all(ops)));
    mockPrisma.carrierProfile.update.mockResolvedValue({});
    mockPrisma.user.update.mockResolvedValue({});
    mockPrisma.loadBid.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.waterfallPosition.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.dockSchedule.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.routingGuideEntry.updateMany.mockResolvedValue({ count: 0 });
    settle.mockResolvedValue({ count: 0, tenderIds: [] });
    closeRequests.mockResolvedValue([]);
    census.mockResolvedValue(EMPTY);
  });

  function noWrites() {
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.carrierProfile.update).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(settle).not.toHaveBeenCalled();
    expect(closeRequests).not.toHaveBeenCalled();
    expect(mockPrisma.auditTrail.create).not.toHaveBeenCalled();
  }

  it("404 for unknown or already-archived; the census is not even taken", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue({ ...PROFILE, deletedAt: new Date() });
    const { res, run } = call(archiveCarrier, { id: "cp-1" }, REASON);
    await run();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(census).not.toHaveBeenCalled();
    noWrites();
  });

  it("422 without a reason, or with one outside the vocabulary — before the census, before any write", async () => {
    for (const [body, code] of [[{}, "ARCHIVE_REASON_REQUIRED"], [{ reason: "BECAUSE" }, "ARCHIVE_REASON_INVALID"], [{ reason: "DUPLICATE_RECORD", archiveNote: "x".repeat(501) }, "ARCHIVE_NOTE_INVALID"]] as const) {
      vi.clearAllMocks();
      mockPrisma.carrierProfile.findUnique.mockResolvedValue(PROFILE);
      const { res, run } = call(archiveCarrier, { id: "cp-1" }, body as any);
      await run();
      expect(res.status, JSON.stringify(body)).toHaveBeenCalledWith(422);
      expect(res.json.mock.calls[0][0]).toMatchObject({ code });
      expect(census).not.toHaveBeenCalled();
      noWrites();
    }
  });

  it("an in-flight load (Load.carrierId) refuses: 409 CARRIER_HOLDS_LIVE_LOADS, the load named, Suspend pointed at, nothing written", async () => {
    census.mockResolvedValue({
      ...EMPTY,
      loads: [load("l1", "121492", "BOOKED", true), load("l2", "121400", "COMPLETED", false)],
      tenders: 2, liveTenders: 1, withdrawableTenderIds: ["t-open"], carrierPays: 1, unpaidCarrierPays: 1,
    });
    const { res, run } = call(archiveCarrier, { id: "cp-1" }, REASON);
    await run();
    expect(res.status).toHaveBeenCalledWith(409);
    const body = res.json.mock.calls[0][0];
    expect(body.error).toBe("CARRIER_HOLDS_LIVE_LOADS");
    expect(body.message).toContain("Peace Transport cannot be archived: on 1 load still in flight (SRL-121492)");
    expect(body.message).toContain("History does not block an archive");
    expect(body.blockingLoads).toEqual([expect.objectContaining({ id: "l1", loadNumber: "SRL-121492", status: "BOOKED", via: "assignment" })]);
    expect(body.remedy.inFlightLoads).toEqual(["SRL-121492"]);
    expect(body.remedy.releaseInFlightLoadsFirst).toMatch(/Release the carrier from this load first/);
    expect(body.remedy.suspend).toBe("POST /compliance/carrier/cp-1/suspend");
    expect(body.remedy).not.toHaveProperty("unpaidCarrierPays"); // no longer a reason, so no longer a remedy
    expect(body.references.total).toBe(5);
    noWrites();
  });

  it("DELIVERED-pre-POD is in flight: a delivered load whose POD is still owed refuses", async () => {
    census.mockResolvedValue({ ...EMPTY, loads: [load("l9", "121499", "DELIVERED", true)] });
    const { res, run } = call(archiveCarrier, { id: "cp-1" }, REASON);
    await run();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].remedy.inFlightLoads).toEqual(["SRL-121499"]);
    noWrites();
  });

  it("a CONFIRMED tender on an in-flight load refuses even when Load.carrierId names nobody — the second signal", async () => {
    census.mockResolvedValue({
      ...EMPTY,
      liveTenders: 1,
      holdingTenders: [holding("t-conf", "CONFIRMED", { id: "l2", ref: "121493", status: "DISPATCHED" })],
    });
    const { res, run } = call(archiveCarrier, { id: "cp-1" }, REASON);
    await run();
    expect(res.status).toHaveBeenCalledWith(409);
    const body = res.json.mock.calls[0][0];
    expect(body.blockingLoads).toEqual([expect.objectContaining({ id: "l2", via: "committed_tender" })]);
    expect(body.remedy.holdingTenders).toEqual([{ id: "t-conf", status: "CONFIRMED", loadId: "l2" }]);
    noWrites();
  });

  it("history never blocks: a signed agreement, unpaid payables, an open dispute, documents, drivers and a CONFIRMED tender on a COMPLETED load are all archived through", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue({ ...PROFILE, onboardingStatus: "SUSPENDED" });
    census.mockResolvedValue({
      ...EMPTY,
      loads: [load("l2", "121400", "COMPLETED", false), load("l3", "121401", "CANCELLED", false)],
      tenders: 4, liveTenders: 1,
      holdingTenders: [holding("t-old", "CONFIRMED", { id: "l2", ref: "121400", status: "COMPLETED" }), holding("t-gone", "ACCEPTED", { id: "l4", ref: "121402", status: "DISPATCHED", deletedAt: new Date() })],
      agreements: 1, carrierPays: 3, unpaidCarrierPays: 2, disputes: 1, documents: 6, drivers: 2, settlements: 1,
    });
    const { res, run } = call(archiveCarrier, { id: "cp-1" }, REASON);
    await run();
    expect(res.status).not.toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0]).toMatchObject({ success: true, details: { archived: true, loginDeactivated: true, references: 20 } }); // 2 loads + 4 tenders + 1 agreement + 3 pays + 1 dispute + 6 docs + 2 drivers + 1 settlement
    // Payables and disputes: neither block nor change.
    expect(mockPrisma.carrierPay?.updateMany ?? vi.fn()).not.toHaveBeenCalled();
    expect(mockPrisma.paymentDispute?.updateMany ?? vi.fn()).not.toHaveBeenCalled();
    // A suspended carrier may be archived: the two are independent dimensions.
    expect(mockPrisma.carrierProfile.update.mock.calls[0][0].data).not.toHaveProperty("onboardingStatus");
  });

  it("the transaction: profile with its reason, login off, and the six withdrawals — every write on the tx client, scoped to open rows", async () => {
    const now = Date.now();
    census.mockResolvedValue({
      ...EMPTY,
      tenders: 3, liveTenders: 2, withdrawableTenderIds: ["t-off", "t-ctr"],
      waterfallPositions: 3,
      openWaterfallPositions: [
        { id: "p-q", waterfallId: "wf-1", loadId: "l-wf1", position: 4, status: "queued" },
        { id: "p-t", waterfallId: "wf-2", loadId: "l-wf2", position: 2, status: "tendered" },
      ],
      bids: 2, dockSchedules: 2, routingGuideEntries: 1, infoRequests: 2,
    });
    settle.mockResolvedValue({ count: 2, tenderIds: ["t-off", "t-ctr"] });
    mockPrisma.waterfallPosition.updateMany.mockResolvedValue({ count: 2 });
    mockPrisma.loadBid.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.dockSchedule.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.routingGuideEntry.updateMany.mockResolvedValue({ count: 1 });
    closeRequests.mockResolvedValue([{ id: "ir-1", category: "COI_UPDATE", createdById: "ae-2" }]);

    const { res, run } = call(archiveCarrier, { id: "cp-1" }, REASON);
    await run();
    await new Promise((r) => setImmediate(r)); // the post-commit fan-out is fire-and-forget

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    // The profile: deletedAt + deletedBy + the reason and the note, in one write.
    expect(mockPrisma.carrierProfile.update).toHaveBeenCalledWith({
      where: { id: "cp-1" },
      data: { deletedAt: expect.any(Date), deletedBy: "ae@srl.test", archiveReason: "CEASED_OPERATIONS", archiveNote: "Owner retired, trucks sold." },
    });
    expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: "u-1" }, data: { isActive: false } });
    // 1. tenders: through the transition service, WITHDRAWN with the archive reason, on the tx.
    expect(settle).toHaveBeenCalledTimes(1);
    const [settleInput, settleDb] = settle.mock.calls[0];
    expect(settleInput).toMatchObject({ tenderIds: ["t-off", "t-ctr"], to: "WITHDRAWN", reason: "carrier_archived", actor: { id: "ae-1", type: "USER" } });
    expect(settleDb).toBe(tx);
    // 2. positions: skipped, scoped to the open ones.
    expect(mockPrisma.waterfallPosition.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["p-q", "p-t"] }, status: { in: ["queued", "tendered"] } },
      data: { status: "skipped" },
    });
    // 3. bids: pending → rejected, the reviewer recorded — SRL's act, not the carrier's "withdrawn".
    expect(mockPrisma.loadBid.updateMany).toHaveBeenCalledWith({
      where: { carrierId: "u-1", status: "pending" },
      data: { status: "rejected", reviewedAt: expect.any(Date), reviewedById: "ae-1" },
    });
    // 4. dock schedules: only FUTURE scheduled ones, cancelled, carrier kept.
    const dock = mockPrisma.dockSchedule.updateMany.mock.calls[0][0];
    expect(dock.where).toMatchObject({ carrierId: "cp-1", status: "SCHEDULED" });
    expect(dock.where.appointmentDate.gt.getTime()).toBeGreaterThanOrEqual(now - 1000);
    expect(dock.data).toEqual({ status: "CANCELLED" });
    // 5. routing entries: deactivated.
    expect(mockPrisma.routingGuideEntry.updateMany).toHaveBeenCalledWith({ where: { carrierId: "cp-1", isActive: true }, data: { isActive: false } });
    // 6. info requests: the Item 260 chokepoint, on the tx, as ARCHIVED.
    expect(closeRequests).toHaveBeenCalledWith({ carrierId: "cp-1", newStatus: "ARCHIVED", closedById: "ae-1" }, tx);

    // The lifecycle record carries the code, the note, and what was withdrawn.
    expect(mockPrisma.auditTrail.create).toHaveBeenCalledTimes(1);
    const row = mockPrisma.auditTrail.create.mock.calls[0][0].data;
    expect(row).toEqual(expect.objectContaining({ action: "DEACTIVATE", entityType: "CarrierProfile", entityId: "cp-1", performedById: "ae-1" }));
    expect(row.changedFields).toEqual(expect.objectContaining({
      actionDetail: "CARRIER_ARCHIVED",
      entityName: "Peace Transport",
      reasonCode: "CEASED_OPERATIONS",
      reason: "Owner retired, trucks sold.",
      previous: { deletedAt: null, loginActive: true, onboardingStatus: "APPROVED" },
    }));
    expect(row.changedFields.new).toEqual(expect.objectContaining({
      loginActive: false,
      archiveReason: "CEASED_OPERATIONS",
      withdrawn: { tenders: 2, positions: 2, bids: 1, dockSchedules: 1, routingEntries: 1, infoRequests: 1 },
    }));

    // After the commit: the AE is told about the closed requests; the cascade
    // standing at the TENDERED position moves on; the queued one just stays skipped.
    expect(announce).toHaveBeenCalledWith([{ id: "ir-1", category: "COI_UPDATE", createdById: "ae-2" }], { carrierId: "cp-1", carrierName: "Peace Transport", newStatus: "ARCHIVED" });
    expect(logEvent).toHaveBeenCalledTimes(1);
    expect(logEvent.mock.calls[0][0]).toMatchObject({ loadId: "l-wf2", event: "position_skipped", metadata: expect.objectContaining({ positionId: "p-t", reason: "carrier_archived" }) });
    expect(advance).toHaveBeenCalledTimes(1);
    expect(advance).toHaveBeenCalledWith("wf-2", 3);

    expect(res.json.mock.calls[0][0]).toMatchObject({
      success: true,
      details: { archived: true, loginDeactivated: true, archiveReason: "CEASED_OPERATIONS", withdrawn: { tenders: 2, positions: 2, bids: 1, dockSchedules: 1, routingEntries: 1, infoRequests: 1 } },
    });
  });

  it("withdrawals run inside the transaction, after the profile write and before the commit", async () => {
    const order: string[] = [];
    mockPrisma.$transaction.mockImplementation(async (ops: any) => { order.push("begin"); const r = await ops(tx); order.push("commit"); return r; });
    mockPrisma.carrierProfile.update.mockImplementation(async () => { order.push("profile"); return {}; });
    settle.mockImplementation(async () => { order.push("tenders"); return { count: 0, tenderIds: [] }; });
    closeRequests.mockImplementation(async () => { order.push("info"); return []; });
    mockPrisma.auditTrail.create.mockImplementation(async () => { order.push("audit"); return {}; });
    const { run } = call(archiveCarrier, { id: "cp-1" }, REASON);
    await run();
    expect(order).toEqual(["begin", "profile", "tenders", "info", "commit", "audit"]);
  });

  it("if a withdrawal throws, nothing is archived: the transaction fails, no lifecycle row, no announcement", async () => {
    census.mockResolvedValue({ ...EMPTY, withdrawableTenderIds: ["t-off"], liveTenders: 1 });
    settle.mockRejectedValue(new Error("tender service down"));
    const { run } = call(archiveCarrier, { id: "cp-1" }, REASON);
    await expect(run()).rejects.toThrow("tender service down");
    expect(mockPrisma.auditTrail.create).not.toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalled();
    expect(advance).not.toHaveBeenCalled();
  });
});

describe("restoreCarrier", () => {
  const ARCHIVED = { id: "cp-1", userId: "u-1", deletedAt: new Date("2026-09-01T00:00:00Z"), companyName: "Peace Transport", onboardingStatus: "APPROVED", archiveReason: "CEASED_OPERATIONS" };
  const RESTORE_DATA = { deletedAt: null, deletedBy: null, archiveReason: null, archiveNote: null, onboardingStatus: "REVIEWING", status: "REVIEW" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (ops: any) => (typeof ops === "function" ? ops(mockPrisma) : Promise.all(ops)));
    mockPrisma.carrierProfile.update.mockResolvedValue({});
    mockPrisma.user.update.mockResolvedValue({});
    rebuild.mockReset();
    rebuild.mockResolvedValue(undefined);
  });

  it("undoes both halves of the archive: the row and the login", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(ARCHIVED);
    const { res, run } = call(restoreCarrier, { id: "cp-1" });
    await run();
    expect(mockPrisma.carrierProfile.update).toHaveBeenCalledWith({ where: { id: "cp-1" }, data: RESTORE_DATA });
    expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: "u-1" }, data: { isActive: true } });
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0]).toMatchObject({
      details: { restored: true, loginReactivated: true, onboardingStatus: "REVIEWING", fingerprintRebuilt: true },
    });
    // B6b (#24) — the restore is a lifecycle act too; B6c — it says what it did.
    expect(mockPrisma.auditTrail.create).toHaveBeenCalledTimes(1);
    const row = mockPrisma.auditTrail.create.mock.calls[0][0].data;
    expect(row).toEqual(expect.objectContaining({ action: "STATUS_CHANGE", entityType: "CarrierProfile", entityId: "cp-1", performedById: "ae-1" }));
    expect(row.changedFields.actionDetail).toBe("CARRIER_RESTORED");
    expect(row.changedFields.entityName).toBe("Peace Transport");
    expect(row.changedFields.previous).toEqual({
      deletedAt: "2026-09-01T00:00:00.000Z", loginActive: false, onboardingStatus: "APPROVED", archiveReason: "CEASED_OPERATIONS",
    });
    expect(row.changedFields.new).toEqual({ deletedAt: null, loginActive: true, onboardingStatus: "REVIEWING", fingerprintRebuilt: true });
  });

  it.each(["APPROVED", "SUSPENDED", "REJECTED", "PENDING"])(
    "comes back at REVIEWING whatever it was before (%s) — restore is not a rewind",
    async (was) => {
      mockPrisma.carrierProfile.findUnique.mockResolvedValue({ ...ARCHIVED, onboardingStatus: was });
      const { run } = call(restoreCarrier, { id: "cp-1" });
      await run();
      const data = mockPrisma.carrierProfile.update.mock.calls[0][0].data;
      expect(data.onboardingStatus).toBe("REVIEWING");
      // and the row remembers what it was, so the rewind is recoverable by a human
      const row = mockPrisma.auditTrail.create.mock.calls[0][0].data;
      expect(row.changedFields.previous.onboardingStatus).toBe(was);
    },
  );

  it("clears all four archive columns; the lifecycle row keeps what they said", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue({ ...ARCHIVED, archiveReason: "FRAUD_CONFIRMED" });
    const { run } = call(restoreCarrier, { id: "cp-1" });
    await run();
    const data = mockPrisma.carrierProfile.update.mock.calls[0][0].data;
    expect(data).toEqual(expect.objectContaining({ deletedAt: null, deletedBy: null, archiveReason: null, archiveNote: null }));
    const row = mockPrisma.auditTrail.create.mock.calls[0][0].data;
    expect(row.changedFields.previous.archiveReason).toBe("FRAUD_CONFIRMED");
  });

  it("rebuilds the fingerprint from the restored row AFTER the transaction has committed, and before the record is written", async () => {
    // The commit resolves on a macrotask so a missing `await` on the transaction
    // (an un-awaited transaction + a microtask-resolved import) would reach the
    // rebuild first and be caught here, not merely be out of invocation order.
    let committed = false;
    mockPrisma.$transaction.mockImplementation(async (ops: any) => {
      await new Promise((r) => setTimeout(r, 0));
      const out = await Promise.all(ops);
      committed = true;
      return out;
    });
    let committedWhenRebuilt: boolean | null = null;
    rebuild.mockImplementation(async () => { committedWhenRebuilt = committed; });
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(ARCHIVED);
    const { run } = call(restoreCarrier, { id: "cp-1" });
    await run();
    expect(rebuild).toHaveBeenCalledTimes(1);
    expect(rebuild).toHaveBeenCalledWith("cp-1");
    expect(committedWhenRebuilt).toBe(true);
    expect(rebuild.mock.invocationCallOrder[0]).toBeLessThan(mockPrisma.auditTrail.create.mock.invocationCallOrder[0]);
  });

  it("a fingerprint failure is logged and reported, never a 500 — the restore has already committed", async () => {
    const err = vi.spyOn(log, "error").mockImplementation((() => {}) as any);
    rebuild.mockRejectedValue(new Error("Carrier not found"));
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(ARCHIVED);
    const { res, run } = call(restoreCarrier, { id: "cp-1" });
    await run();
    expect(res.status).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: "u-1" }, data: { isActive: true } });
    expect(res.json.mock.calls[0][0]).toMatchObject({ details: { restored: true, loginReactivated: true, onboardingStatus: "REVIEWING", fingerprintRebuilt: false } });
    const row = mockPrisma.auditTrail.create.mock.calls[0][0].data;
    expect(row.changedFields.new.fingerprintRebuilt).toBe(false);
    expect(err).toHaveBeenCalledTimes(1);
    expect(err.mock.calls[0][0]).toMatchObject({ carrierId: "cp-1" });
    expect(String(err.mock.calls[0][1])).toMatch(/fingerprint/i);
    err.mockRestore();
  });

  it("404 when the carrier is not archived — nothing written, nothing rebuilt", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue({ ...ARCHIVED, deletedAt: null });
    const { res, run } = call(restoreCarrier, { id: "cp-1" });
    await run();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(rebuild).not.toHaveBeenCalled();
    expect(mockPrisma.auditTrail.create).not.toHaveBeenCalled();
  });
});

describe("suspendCarrier requires a reason (B5b)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (ops: any) => (typeof ops === "function" ? ops(mockPrisma) : Promise.all(ops)));
    mockPrisma.carrierProfile.findUnique.mockResolvedValue({ ...PROFILE, user: { company: "Peace Transport", firstName: "P", lastName: "T" } });
    mockPrisma.carrierProfile.update.mockResolvedValue({ id: "cp-1" });
    mockPrisma.auditTrail.create.mockResolvedValue({});
  });

  it("no reason, or a four-character one, is refused 400 before any write", async () => {
    for (const body of [{}, { reason: "dupe" }]) {
      vi.clearAllMocks();
      const { res, run } = call(suspendCarrier, { carrierId: "cp-1" }, body);
      await run();
      expect(res.status, JSON.stringify(body)).toHaveBeenCalledWith(400);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.carrierProfile.update).not.toHaveBeenCalled();
    }
  });

  it("a real reason is recorded on the row and in the audit trail", async () => {
    const { run } = call(suspendCarrier, { carrierId: "cp-1" }, { reason: "Repeated no-shows on booked loads" });
    await run();
    expect(mockPrisma.carrierProfile.update).toHaveBeenCalledTimes(1);
    const data = mockPrisma.carrierProfile.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ onboardingStatus: "SUSPENDED", autoSuspendCause: "AE_MANUAL" });
    expect(data.autoSuspendReason).toBe("Suspended by an administrator: Repeated no-shows on booked loads");
    expect(mockPrisma.auditTrail.create.mock.calls[0][0].data.changedFields.reason).toContain("Repeated no-shows");
  });
});

describe("the route stays controller-backed and audited (source guard)", () => {
  const src = fs.readFileSync(path.join(__dirname, "../../../src/routes/carriers.ts"), "utf8").replace(/\/\/[^\n]*/g, "");
  it("archiveCarrier archives (soft) and never hard-deletes the profile or the login", () => {
    const ctrl = fs.readFileSync(path.join(__dirname, "../../../src/controllers/carrierController.ts"), "utf8").replace(/\/\/[^\n]*/g, "");
    const start = ctrl.indexOf("export async function archiveCarrier(");
    const end = ctrl.indexOf("export async function restoreCarrier(");
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const body = ctrl.slice(start, end);
    // B6b captured the timestamp (`const archivedAt = new Date()`) so the audit row
    // and the soft-delete carry the same instant; either spelling is the soft write.
    expect(body).toMatch(/deletedAt: (new Date\(\)|archivedAt)[,\s]/);
    expect(body).toMatch(/const archivedAt = new Date\(\)|deletedAt: new Date\(\)/);
    expect(body).toMatch(/isActive: false/);
    expect(body).not.toMatch(/carrierProfile\.delete\(/);
    expect(body).not.toMatch(/user\.delete\(/);
  });

  it("DELETE /:id runs archiveCarrier behind an audit row; restore likewise", () => {
    expect(src).toMatch(/router\.delete\("\/:id",[^\n]*auditLog\("DELETE", "Carrier"\),\s*archiveCarrier\)/);
    expect(src).toMatch(/router\.put\("\/:id\/restore",[^\n]*restoreCarrier\)/);
    expect(src).not.toMatch(/data: \{ deletedAt: new Date\(\), deletedBy/); // the inline soft-delete is gone
  });
  it("suspend is scoped to ADMIN, CEO, OPERATIONS (decision 5)", () => {
    const compliance = fs.readFileSync(path.join(__dirname, "../../../src/routes/compliance.ts"), "utf8");
    expect(compliance).toMatch(/router\.post\("\/carrier\/:carrierId\/suspend", authorize\("ADMIN", "CEO", "OPERATIONS"\), suspendCarrier\)/);
  });
});
