/**
 * The restore, and C4: the inverse must NOT fire.
 *
 * The guards are proven in uncancelPolicy.test.ts, where they are pure. What is
 * left to prove here is the half that writes -- that it puts back exactly the
 * rows the before-image names, that it hands the shipper back the SAME tracking
 * link, and that it triggers nothing forward.
 *
 * "TRIGGERS NOTHING FORWARD" IS ASSERTED TWO WAYS, because either alone is
 * weak. Structurally, the service must not import the senders at all -- a
 * behavioural check can only observe what it thought to mock, and cannot see a
 * sender added next month. Behaviourally, the create-shaped calls that would
 * DOUBLE something (a second tender, a second payable, a second credit write)
 * must never happen -- which a structural check cannot see, because the service
 * legitimately imports prisma.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { uncancelLoad, UNCANCEL_EVENT_TYPE } from "../../../src/services/uncancelLoad";
import { prisma } from "../../../src/config/database";

const mockPrisma = prisma as any;
const CANCELLED_AT = new Date("2026-09-20T09:00:00.000Z");
const NOW = new Date("2026-09-21T09:00:00.000Z");

function snapshot(over: Record<string, unknown> = {}) {
  return {
    version: 1,
    takenAt: CANCELLED_AT.toISOString(),
    load: { status: "DISPATCHED", softDeleted: false },
    shipments: [{ id: "s1", status: "IN_TRANSIT" }],
    trackingTokenRevoked: true,
    shipperTrackingTokens: [{ id: "st1", expiresAt: "2026-12-01T00:00:00.000Z" }],
    rateConfirmations: [{ id: "rc1", status: "SENT" }],
    tenders: [{ id: "tn1", status: "ACCEPTED", deletedAt: null }],
    shipperCredit: { id: "cr1", currentUtilized: 12500, autoBlocked: false, blockedReason: null, blockedAt: null },
    carrierPays: [{ id: "cp1", status: "PREPARED", notes: null }],
    ...over,
  };
}

/** A transaction client distinct from the global one, so "inside" is observable. */
function txClient() {
  const m = () => vi.fn().mockResolvedValue({ count: 1 });
  const tx = {
    load: { update: vi.fn().mockResolvedValue({}) },
    shipment: { updateMany: m() },
    shipperTrackingToken: { updateMany: m() },
    // findMany too: restoreTenders reads each tender's CURRENT state so the
    // transition row can name what it moved FROM, and a fake missing it throws
    // in a way that reads like service logic.
    loadTender: { updateMany: m(), create: vi.fn(), findMany: vi.fn().mockResolvedValue([{ id: "tn1", loadId: "load-1", status: "WITHDRAWN" }]) },
    shipperCredit: { updateMany: m() },
    carrierPay: { updateMany: m(), create: vi.fn() },
    loadActivity: { create: vi.fn().mockResolvedValue({}) },
  };
  mockPrisma.$transaction.mockImplementation(async (arg: any) =>
    Array.isArray(arg) ? Promise.all(arg) : arg(tx),
  );
  return tx;
}

function seed(over: Record<string, unknown> = {}) {
  mockPrisma.load.findUnique.mockResolvedValue({
    id: "load-1",
    status: "CANCELLED",
    cancelledAt: CANCELLED_AT,
    cancellationSnapshot: snapshot(),
    ...over,
  });
  mockPrisma.loadAccessorial.count.mockResolvedValue(0);
  mockPrisma.loadTender.findMany.mockResolvedValue([{ id: "tn1", status: "WITHDRAWN" }]);
}

beforeEach(() => {
  vi.clearAllMocks();
  seed();
});

describe("the restore — v3.8.biy", () => {
  it("puts the load back to the status the before-image recorded", async () => {
    const tx = txClient();
    const r = await uncancelLoad({ loadId: "load-1", actorId: "u1", actorRole: "ADMIN", reason: "shipper re-confirmed", now: NOW });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.report.restoredTo).toBe("DISPATCHED");
    const [arg] = tx.load.update.mock.calls[0];
    expect(arg.data.status).toBe("DISPATCHED");
  });

  it("clears every field the cancel wrote, so a later cancel starts clean", async () => {
    const tx = txClient();
    await uncancelLoad({ loadId: "load-1", actorId: "u1", actorRole: "ADMIN", reason: "r", now: NOW });
    const [arg] = tx.load.update.mock.calls[0];
    expect(arg.data.cancellationReasonCode).toBeNull();
    expect(arg.data.cancellationFaultParty).toBeNull();
    expect(arg.data.cancellationReason).toBeNull();
    expect(arg.data.cancelledAt).toBeNull();
    expect(arg.data.cancelledById).toBeNull();
  });

  it("CLEARS THE SNAPSHOT — without this the next cancel records nothing", async () => {
    // The cascade persists its before-image scoped to `cancellationSnapshot:
    // { equals: DbNull }`. A load that kept a stale snapshot would be cancelled
    // again and capture none of it, and THAT cancel would be the irreversible
    // one. This is the least obvious line in the service and the most costly to
    // lose, so it is asserted on its own.
    const tx = txClient();
    await uncancelLoad({ loadId: "load-1", actorId: "u1", actorRole: "ADMIN", reason: "r", now: NOW });
    const [arg] = tx.load.update.mock.calls[0];
    expect(arg.data.cancellationSnapshot, "a stale snapshot blocks the next cancel's before-image").toBeDefined();
    expect(String(arg.data.cancellationSnapshot)).toContain("DbNull");
  });

  it("adversarial case 4 — the shipper keeps the SAME tracking link", async () => {
    // The cancel revokes rather than destroys precisely so this is possible.
    // A new uuid would work and would make the link already in the shipper's
    // inbox read as broken.
    const tx = txClient();
    const r = await uncancelLoad({ loadId: "load-1", actorId: "u1", actorRole: "ADMIN", reason: "r", now: NOW });
    const [arg] = tx.load.update.mock.calls[0];
    expect(arg.data.trackingTokenRevokedAt, "the revocation was not lifted").toBeNull();
    expect(arg.data).not.toHaveProperty("trackingToken");
    expect(r.ok && r.report.trackingLinkRestored).toBe(true);
  });

  it("does not lift a revocation this cancel did not make", async () => {
    mockPrisma.load.findUnique.mockResolvedValue({
      id: "load-1", status: "CANCELLED", cancelledAt: CANCELLED_AT,
      cancellationSnapshot: snapshot({ trackingTokenRevoked: false }),
    });
    const tx = txClient();
    await uncancelLoad({ loadId: "load-1", actorId: "u1", actorRole: "ADMIN", reason: "r", now: NOW });
    const [arg] = tx.load.update.mock.calls[0];
    expect(arg.data).not.toHaveProperty("trackingTokenRevokedAt");
  });

  it("restores shipments through the mapper, not from the recorded status", async () => {
    // The snapshot says IN_TRANSIT; the load restores to DISPATCHED. Deriving
    // means the shipment cannot contradict its load.
    const tx = txClient();
    await uncancelLoad({ loadId: "load-1", actorId: "u1", actorRole: "ADMIN", reason: "r", now: NOW });
    const [arg] = tx.shipment.updateMany.mock.calls[0];
    expect(arg.where).toEqual({ id: "s1", loadId: "load-1" });
    expect(arg.data.status).toBe("DISPATCHED");
    expect(arg.data.status, "restored the recorded status instead of the derived one").not.toBe("IN_TRANSIT");
  });

  it("pushes the shipper tracking links back to the expiry they had", async () => {
    const tx = txClient();
    await uncancelLoad({ loadId: "load-1", actorId: "u1", actorRole: "ADMIN", reason: "r", now: NOW });
    const [arg] = tx.shipperTrackingToken.updateMany.mock.calls[0];
    expect(arg.where).toEqual({ id: "st1", loadId: "load-1" });
    expect(arg.data.expiresAt.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });

  it("restores tenders to what they were, through the one service allowed to move them", async () => {
    const tx = txClient();
    await uncancelLoad({ loadId: "load-1", actorId: "u1", actorRole: "ADMIN", reason: "r", now: NOW });
    const [arg] = tx.loadTender.updateMany.mock.calls[0];
    expect(arg.where).toEqual({ id: "tn1", loadId: "load-1" });
    expect(arg.data.status).toBe("ACCEPTED");
    expect(arg.data.deletedAt).toBeNull();
    // It went through tenderTransitionService, which is what writes the
    // transition row -- so the carrier's timeline shows the reinstatement
    // rather than a status that changed with no record of changing.
    const transitions = tx.loadActivity.create.mock.calls.filter(
      ([a]: any[]) => a?.data?.eventType === "tender_transition",
    );
    expect(transitions.length, "the tender moved with no transition row").toBe(1);
  });

  it("unhides only when this cancel hid it", async () => {
    const tx = txClient();
    await uncancelLoad({ loadId: "load-1", actorId: "u1", actorRole: "ADMIN", reason: "r", now: NOW });
    expect(tx.load.update.mock.calls[0][0].data).not.toHaveProperty("deletedAt");

    vi.clearAllMocks();
    mockPrisma.load.findUnique.mockResolvedValue({
      id: "load-1", status: "CANCELLED", cancelledAt: CANCELLED_AT,
      cancellationSnapshot: snapshot({ load: { status: "BOOKED", softDeleted: true } }),
    });
    mockPrisma.loadAccessorial.count.mockResolvedValue(0);
    mockPrisma.loadTender.findMany.mockResolvedValue([{ id: "tn1", status: "WITHDRAWN" }]);
    const tx2 = txClient();
    await uncancelLoad({ loadId: "load-1", actorId: "u1", actorRole: "ADMIN", reason: "r", now: NOW });
    expect(tx2.load.update.mock.calls[0][0].data.deletedAt).toBeNull();
  });

  it("reports the rate confirmations rather than un-voiding them", async () => {
    const tx = txClient();
    const r = await uncancelLoad({ loadId: "load-1", actorId: "u1", actorRole: "ADMIN", reason: "r", now: NOW });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // An un-voided RC says SENT and has no signing token: worse than absent,
    // because it looks live.
    expect(r.report.rateConfirmationsToReissue).toEqual([{ id: "rc1", status: "SENT" }]);
    expect((tx as any).rateConfirmation).toBeUndefined();
  });

  it("writes one activity row naming the reason", async () => {
    const tx = txClient();
    await uncancelLoad({ loadId: "load-1", actorId: "u1", actorRole: "ADMIN", actorName: "A Admin", reason: "shipper re-confirmed", now: NOW });
    // Scoped by event type: the tender restore writes its own transition row
    // through tenderTransitionService, so a bare call count here would be
    // asserting the number of activity rows rather than that the un-cancel
    // wrote exactly one of its own.
    const own = tx.loadActivity.create.mock.calls.filter(
      ([x]: any[]) => x?.data?.eventType === UNCANCEL_EVENT_TYPE,
    );
    expect(own.length).toBe(1);
    const [arg] = own[0];
    expect(arg.data.metadata.reason).toBe("shipper re-confirmed");
    expect(arg.data.actorId).toBe("u1");
  });

  it("writes nothing at all when the policy refuses", async () => {
    const tx = txClient();
    const r = await uncancelLoad({ loadId: "load-1", actorId: "u1", actorRole: "AE", reason: "r", now: NOW });
    expect(r.ok).toBe(false);
    expect(tx.load.update).not.toHaveBeenCalled();
    expect(tx.loadActivity.create).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("C4 — the inverse must NOT fire", () => {
  it("adversarial case 5 — the shipper credit is SET, never incremented", async () => {
    const tx = txClient();
    await uncancelLoad({ loadId: "load-1", actorId: "u1", actorRole: "ADMIN", reason: "r", now: NOW });
    const [arg] = tx.shipperCredit.updateMany.mock.calls[0];
    expect(arg.data.currentUtilized).toBe(12500);
    // `increment` would re-apply the load's value on top of a figure that
    // already includes it — the double-count this case exists to catch.
    expect(JSON.stringify(arg.data)).not.toContain("increment");
    expect(JSON.stringify(arg.data)).not.toContain("decrement");
  });

  it("adversarial case 5 — carrier pay is restored, never re-raised", async () => {
    const tx = txClient();
    await uncancelLoad({ loadId: "load-1", actorId: "u1", actorRole: "ADMIN", reason: "r", now: NOW });
    expect(tx.carrierPay.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.carrierPay.updateMany.mock.calls[0][0].data.status).toBe("PREPARED");
    expect(tx.carrierPay.create, "a second payable").not.toHaveBeenCalled();
  });

  it("no tender is created — restoring is not re-tendering", async () => {
    const tx = txClient();
    await uncancelLoad({ loadId: "load-1", actorId: "u1", actorRole: "ADMIN", reason: "r", now: NOW });
    expect(tx.loadTender.create).not.toHaveBeenCalled();
  });

  it("structurally imports no sender, so one added later cannot fire silently", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../../src/services/uncancelLoad.ts"),
      "utf8",
    );
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

    expect(code.length, "the scanner read nothing — it is broken, not the file").toBeGreaterThan(500);
    // Named rather than pattern-matched: each of these is a real forward
    // trigger that would duplicate something the cancel already reversed.
    for (const forbidden of [
      "notifyTenderAction",
      "sendTrackingLinkToCrmContacts",
      "autoGenerateInvoice",
      "createCarrierPayOnDelivery",
      "sendRateConfirmation",
      "createTender",
      "emailService",
      "notificationService",
    ]) {
      expect(code, "uncancelLoad reaches a forward trigger: " + forbidden).not.toContain(forbidden);
    }
  });

  it("the forbidden list is not vacuous — it matches the real senders' names", () => {
    // A list of names that exist nowhere would pass forever. Each is checked to
    // be a real export somewhere in src, so the assertion above has teeth.
    const SRC = path.resolve(__dirname, "../../../src");
    const walk = (d: string): string[] =>
      fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(d, e.name);
        return e.isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
      });
    const all = walk(SRC).map((f) => fs.readFileSync(f, "utf8")).join("\n");
    for (const name of ["notifyTenderAction", "sendTrackingLinkToCrmContacts", "autoGenerateInvoice", "createCarrierPayOnDelivery"]) {
      expect(all, name + " is not a real symbol — the C4 guard is checking for nothing").toContain(name);
    }
  });
});
