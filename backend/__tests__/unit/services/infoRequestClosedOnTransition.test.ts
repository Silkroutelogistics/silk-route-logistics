/**
 * A carrier moving to a closed state takes its open info requests with it.
 *
 * THE OTHER DOOR. F2 stopped a request being CREATED against a carrier the
 * portal cannot show it to. It did nothing about a carrier who moves into one
 * of those states while a request is already open — same harm, arriving the
 * other way: the portal stops rendering the section, the carrier can never
 * answer, and the AE waits for a reply that cannot come. F2 shut the door and
 * left the window.
 *
 * TWO OPEN REQUESTS ON EVERY TRANSITION, deliberately. One would pass whether
 * the close were per-request or per-carrier, and would not show whether the AE
 * is told once or once per request. The counts are the point: the carrier hears
 * about each ask it must stop chasing, and the AE hears once about the event
 * that closed them.
 *
 * INSIDE THE TRANSACTION is asserted by ordering, not by inspection. A close
 * that ran after the commit would leave a window where the carrier is APPROVED
 * with an open request — exactly the stranded row this prevents — and no
 * assertion about the final state can distinguish that from the correct one.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Response } from "express";

const { mockPrisma, order, notifyWithdrawn, confirmAnswered } = vi.hoisted(() => {
  const order: string[] = [];
  return {
    order,
    notifyWithdrawn: vi.fn(async () => { order.push("notify-carrier"); return true; }),
    confirmAnswered: vi.fn(async () => true),
    mockPrisma: {
      carrierProfile: { findUnique: vi.fn(), update: vi.fn() },
      infoRequest: { findMany: vi.fn(), updateMany: vi.fn() },
      user: { update: vi.fn() },
      notification: { create: vi.fn(), findFirst: vi.fn() },
      auditTrail: { create: vi.fn() },
      systemLog: { create: vi.fn() },
      $transaction: vi.fn(),
    },
  };
});

vi.mock("../../../src/config/database", () => ({ prisma: mockPrisma }));
vi.mock("../../../src/lib/logger", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
// §19 Sub-pattern 20 — outbound dead by construction.
vi.mock("../../../src/services/emailService", () => ({ sendEmail: vi.fn(), wrap: (s: string) => s }));
vi.mock("../../../src/services/integrationService", () => ({ onCarrierApproved: vi.fn(async () => {}) }));
// The whole module is replaced, so BOTH exports infoRequestService imports must
// be supplied — a factory with only one makes resolveInfoRequest throw.
vi.mock("../../../src/services/onboardingLifecycleService", () => ({
  notifyInfoRequestWithdrawn: notifyWithdrawn,
  confirmInfoRequestAnswered: confirmAnswered,
}));

import { approveCarrier } from "../../../src/services/approvalService";
import { rejectCarrier } from "../../../src/services/rejectionService";
import { suspendCarrier } from "../../../src/controllers/complianceController";
import { CLOSED_BY_STATUS_REASON } from "../../../src/services/infoRequestService";

const CARRIER_ID = "carrier-1";
const AE_ID = "u-ae";

/** Two open requests raised by the SAME AE, so "notified once" is measurable. */
const TWO_OPEN = [
  { id: "ir-1", category: "COI_UPDATE", createdById: AE_ID },
  { id: "ir-2", category: "W9_UPDATE", createdById: AE_ID },
];

function makeRes(): Response & { _status: number; _body: any } {
  const res: any = { _status: 200, _body: undefined };
  res.status = (c: number) => { res._status = c; return res; };
  res.json = (b: any) => { res._body = b; return res; };
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;

  mockPrisma.carrierProfile.findUnique.mockResolvedValue({
    id: CARRIER_ID,
    userId: "u-carrier",
    onboardingStatus: "INFO_REQUESTED",
    companyName: "Test Carrier LLC",
    mcNumber: "MC-1",
    dotNumber: "1",
    user: { id: "u-carrier", email: "carrier@srl.invalid", firstName: "Sam", company: "Test Carrier LLC", lastName: "Driver" },
  });
  mockPrisma.carrierProfile.update.mockResolvedValue({ id: CARRIER_ID });
  mockPrisma.user.update.mockResolvedValue({});
  mockPrisma.infoRequest.findMany.mockResolvedValue(TWO_OPEN);
  // Markers, not just return values: the ordering assertions below are the only
  // way to tell "closed inside the transaction" from "closed after it", and no
  // assertion about the final state can distinguish those two.
  mockPrisma.infoRequest.updateMany.mockImplementation(async () => {
    order.push("close");
    return { count: 2 };
  });
  mockPrisma.notification.create.mockResolvedValue({});
  mockPrisma.notification.findFirst.mockResolvedValue(null);
  mockPrisma.auditTrail.create.mockResolvedValue({});
  mockPrisma.systemLog.create.mockResolvedValue({});

  // $transaction ships as a bare vi.fn() with no implementation — out of the
  // box it returns undefined and never runs its callback, so an unconfigured
  // test would exercise none of the body and pass for the wrong reason.
  mockPrisma.$transaction.mockImplementation(async (cb: any) => {
    const out = await cb(mockPrisma);
    order.push("commit");
    return out;
  });
});

/** Every transition is driven through its real entry point, not the helper. */
const TRANSITIONS = [
  {
    status: "APPROVED" as const,
    run: () => approveCarrier({ carrierId: CARRIER_ID, approvedById: AE_ID }),
  },
  {
    status: "REJECTED" as const,
    run: () => rejectCarrier({ carrierId: CARRIER_ID, rejectedById: AE_ID, reason: "MISSING_DOCUMENTS" }),
  },
  {
    status: "SUSPENDED" as const,
    run: () => suspendCarrier({ params: { carrierId: CARRIER_ID }, user: { id: AE_ID } } as any, makeRes()),
  },
];

for (const t of TRANSITIONS) {
  describe(`moving a carrier to ${t.status}`, () => {
    it("cancels every open request", async () => {
      await t.run();

      expect(mockPrisma.infoRequest.updateMany).toHaveBeenCalledTimes(1);
      const call = mockPrisma.infoRequest.updateMany.mock.calls[0][0];
      expect(call.where).toEqual({ carrierId: CARRIER_ID, status: "OPEN" });
      expect(call.data.status).toBe("CANCELLED");
    });

    it("records a reason naming the status change", async () => {
      await t.run();

      // Not a generic "cancelled". An AE reading a CANCELLED row has to be able
      // to tell "I withdrew this" from "the status change closed it", and the
      // row is the only place that distinction survives.
      const { data } = mockPrisma.infoRequest.updateMany.mock.calls[0][0];
      expect(data.cancelReason).toBe(CLOSED_BY_STATUS_REASON[t.status]);
      expect(data.cancelReason).toContain(t.status === "SUSPENDED" ? "suspended" : t.status.toLowerCase());
      expect(data.cancelledById).toBe(AE_ID);
      expect(data.cancelledAt).toBeInstanceOf(Date);
    });

    it("closes INSIDE the transaction, before the commit", async () => {
      await t.run();

      // The ordering is the assertion. A close that ran after the commit would
      // leave a window with the carrier already in a closed state and the
      // request still open — the stranded row, briefly, and permanently if the
      // second write then failed.
      const closeIndex = order.indexOf("close");
      const commitIndex = order.indexOf("commit");
      expect(closeIndex).toBeGreaterThanOrEqual(0);
      expect(commitIndex).toBeGreaterThan(closeIndex);
    });

    it("tells the carrier about each ask, after the commit", async () => {
      await t.run();

      // Once per request: each is a separate thing to stop chasing, and
      // announceOnce keys its dedup on the requestId.
      expect(notifyWithdrawn).toHaveBeenCalledTimes(2);
      const ids = notifyWithdrawn.mock.calls.map((c: any) => c[0].requestId).sort();
      expect(ids).toEqual(["ir-1", "ir-2"]);

      // F4's rule. announceOnce dedups on the requestId, so a notice sent for a
      // close that then rolled back would permanently suppress the correct one.
      expect(order.indexOf("commit")).toBeLessThan(order.indexOf("notify-carrier"));
    });

    it("tells the requesting AE once, not once per request", async () => {
      await t.run();

      // Both requests were raised by the same AE. Three bell rows for one event
      // is the noise that teaches people to stop reading the bell.
      const aeNotes = mockPrisma.notification.create.mock.calls
        .map((c: any) => c[0].data)
        .filter((d: any) => d.userId === AE_ID);
      expect(aeNotes).toHaveLength(1);
      expect(aeNotes[0].message).toContain("2 open info request");
      expect(aeNotes[0].message).toContain(t.status);
    });

    it("does nothing when the carrier has no open requests", async () => {
      mockPrisma.infoRequest.findMany.mockResolvedValue([]);

      await t.run();

      // A no-op has to be a real no-op: an updateMany with an empty match still
      // writes nothing, but a notification would still fire and tell a carrier
      // to stop chasing something nobody asked for.
      expect(mockPrisma.infoRequest.updateMany).not.toHaveBeenCalled();
      expect(notifyWithdrawn).not.toHaveBeenCalled();
      const aeNotes = mockPrisma.notification.create.mock.calls
        .map((c: any) => c[0].data)
        .filter((d: any) => d.userId === AE_ID);
      expect(aeNotes).toHaveLength(0);
    });

    it("still performs the transition itself", async () => {
      // Tripwire. Every assertion above is about a side effect; if the entry
      // point had thrown before doing its own job they could all pass while the
      // carrier never moved.
      await t.run();
      expect(mockPrisma.carrierProfile.update).toHaveBeenCalled();
      const data = mockPrisma.carrierProfile.update.mock.calls[0][0].data;
      expect(data.onboardingStatus).toBe(t.status);
    });
  });
}

describe("the requests are closed for one carrier only", () => {
  it("scopes both the read and the write to the carrier being transitioned", async () => {
    await approveCarrier({ carrierId: CARRIER_ID, approvedById: AE_ID });

    expect(mockPrisma.infoRequest.findMany.mock.calls[0][0].where).toEqual({
      carrierId: CARRIER_ID,
      status: "OPEN",
    });
    expect(mockPrisma.infoRequest.updateMany.mock.calls[0][0].where).toEqual({
      carrierId: CARRIER_ID,
      status: "OPEN",
    });
  });

  it("notifies each distinct AE separately when two raised the requests", async () => {
    mockPrisma.infoRequest.findMany.mockResolvedValue([
      { id: "ir-1", category: "COI_UPDATE", createdById: "u-ae-a" },
      { id: "ir-2", category: "W9_UPDATE", createdById: "u-ae-b" },
    ]);

    await approveCarrier({ carrierId: CARRIER_ID, approvedById: AE_ID });

    // "Once" means once per AE, not once overall — an AE who is not told has
    // no way to learn their ask was closed.
    const recipients = mockPrisma.notification.create.mock.calls
      .map((c: any) => c[0].data.userId)
      .filter((u: string) => u.startsWith("u-ae-"));
    expect(recipients.sort()).toEqual(["u-ae-a", "u-ae-b"]);
  });
});
