/**
 * liftSuspension — the exit from SUSPENDED.
 *
 * Before this there was none: approveCarrier and rejectCarrier both refuse a
 * suspended carrier and name "lift suspension" as the remedy, and nothing
 * provided it. These cases pin the contract:
 *
 *   - a reason is required, and nothing moves without one
 *   - only a SUSPENDED, non-archived carrier can be lifted
 *   - the lift lands on REVIEWING (never APPROVED), paired, with the three
 *     auto-suspend columns cleared — they are not inert while set
 *   - the write is conditional, so a status changed underneath is refused
 *     rather than overwritten
 *   - the audit row keeps what the cleared columns said, and a failed audit,
 *     notification or email never fails the lift
 *
 * The prisma mock holds ONE row and evaluates each WHERE against it, so a
 * wrong filter fails here instead of matching whatever the author assumed
 * (§13.3 Item 273.10). The fixture is BLUE FALCON BROKERAGE LLC as production
 * held it on 2026-09-26.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Response } from "express";

type Row = {
  id: string;
  companyName: string;
  onboardingStatus: string;
  status: string;
  deletedAt: Date | null;
  autoSuspendedAt: Date | null;
  autoSuspendReason: string | null;
  autoSuspendCause: string | null;
  userId: string;
};

const { mockPrisma, mockSendEmail, state } = vi.hoisted(() => {
  const state: { row: Row | null; flipBeforeWrite: string | null } = { row: null, flipBeforeWrite: null };
  const mockPrisma = {
    carrierProfile: {
      findUnique: vi.fn(async (args: { where: { id: string } }) => {
        const r = state.row;
        if (!r || r.id !== args.where.id) return null;
        const snapshot = {
          ...r,
          user: { email: "wasihaider3089+carrier4@gmail.com", firstName: "John", lastName: "Doe", company: null },
        };
        // Simulates a second writer landing between this read and the write.
        if (state.flipBeforeWrite) r.onboardingStatus = state.flipBeforeWrite;
        return snapshot;
      }),
      updateMany: vi.fn(async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const r = state.row;
        const w = args.where;
        const matches =
          !!r &&
          r.id === w.id &&
          (w.onboardingStatus === undefined || r.onboardingStatus === w.onboardingStatus) &&
          (!("deletedAt" in w) || r.deletedAt === w.deletedAt);
        if (!matches) return { count: 0 };
        Object.assign(r!, args.data);
        return { count: 1 };
      }),
    },
    auditTrail: { create: vi.fn(async () => ({})) },
    notification: { create: vi.fn(async () => ({})) },
  };
  return { mockPrisma, mockSendEmail: vi.fn(async () => "msg-id"), state };
});

vi.mock("../../../src/config/database", () => ({ prisma: mockPrisma }));
vi.mock("../../../src/lib/logger", () => ({ log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("../../../src/services/emailService", () => ({ sendEmail: mockSendEmail, wrap: (s: string) => s }));
vi.mock("../../../src/services/complianceMonitorService", () => ({ complianceCheck: vi.fn() }));
vi.mock("../../../src/services/fmcsaService", () => ({ calendarMonthsBetween: () => 24 }));
vi.mock("../../../src/services/infoRequestService", () => ({
  closeOpenInfoRequestsForStatus: vi.fn(async () => []),
  announceInfoRequestsClosedByStatus: vi.fn(async () => undefined),
}));

import { liftSuspension } from "../../../src/controllers/complianceController";

const SUSPENDED_AT = new Date("2026-09-23T22:23:54.133Z");
const SUSPEND_REASON = "Suspended by an administrator: Carrier not needed in the network.";

function blueFalcon(over: Partial<Row> = {}): Row {
  return {
    id: "cmton885a003iib1vw2gm0yg7",
    companyName: "BLUE FALCON BROKERAGE LLC",
    onboardingStatus: "SUSPENDED",
    status: "SUSPENDED",
    deletedAt: null,
    autoSuspendedAt: SUSPENDED_AT,
    autoSuspendReason: SUSPEND_REASON,
    autoSuspendCause: "AE_MANUAL",
    userId: "cmton885a003hib1vr17t5nn0",
    ...over,
  };
}

async function call(body: unknown, carrierId = "cmton885a003iib1vw2gm0yg7") {
  const res: { statusCode: number; body: any } = { statusCode: 200, body: undefined };
  const r = {
    status(code: number) { res.statusCode = code; return r; },
    json(b: unknown) { res.body = b; return r; },
  } as unknown as Response;
  const req = { params: { carrierId }, body, user: { id: "admin-1", email: "whaider@silkroutelogistics.ai", role: "ADMIN" } };
  await liftSuspension(req as any, r);
  // Let the fire-and-forget notification and email settle.
  await new Promise((resolve) => setImmediate(resolve));
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.row = blueFalcon();
  state.flipBeforeWrite = null;
});

describe("liftSuspension", () => {
  it("refuses without a 5-character reason, and nothing moves", async () => {
    const res = await call({ reason: " ok " });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/at least 5 characters/);
    expect(mockPrisma.carrierProfile.updateMany).not.toHaveBeenCalled();
    expect(state.row!.onboardingStatus).toBe("SUSPENDED");
  });

  it("404s an unknown carrier", async () => {
    const res = await call({ reason: "testing the portal" }, "no-such-carrier");
    expect(res.statusCode).toBe(404);
  });

  it("refuses an archived carrier and points at Restore", async () => {
    state.row = blueFalcon({ deletedAt: new Date("2026-09-24T00:00:00Z") });
    const res = await call({ reason: "testing the portal" });
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe("CARRIER_ARCHIVED");
    expect(res.body.error).toMatch(/Restore it first/);
    expect(state.row!.onboardingStatus).toBe("SUSPENDED");
    expect(state.row!.autoSuspendedAt).toEqual(SUSPENDED_AT);
  });

  it("refuses a carrier that is not suspended", async () => {
    state.row = blueFalcon({ onboardingStatus: "APPROVED", status: "APPROVED", autoSuspendedAt: null, autoSuspendReason: null, autoSuspendCause: null });
    const res = await call({ reason: "testing the portal" });
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe("NOT_SUSPENDED");
    expect(state.row!.onboardingStatus).toBe("APPROVED");
  });

  it("lands on REVIEWING, paired, with the auto-suspend columns cleared", async () => {
    const res = await call({ reason: "  Need this login for carrier portal testing  " });
    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe("cmton885a003iib1vw2gm0yg7");
    expect(res.body.carrier.onboardingStatus).toBe("REVIEWING");
    expect(state.row).toMatchObject({
      onboardingStatus: "REVIEWING",
      status: "REVIEW",
      autoSuspendedAt: null,
      autoSuspendReason: null,
      autoSuspendCause: null,
      deletedAt: null,
    });
    // Never APPROVED: approving is a separate act.
    expect(state.row!.onboardingStatus).not.toBe("APPROVED");
  });

  it("the audit row keeps what the cleared columns said, and the admin's reason", async () => {
    await call({ reason: "  Need this login for carrier portal testing  " });
    expect(mockPrisma.auditTrail.create).toHaveBeenCalledTimes(1);
    const data = (mockPrisma.auditTrail.create.mock.calls[0] as any)[0].data;
    expect(data).toMatchObject({ action: "STATUS_CHANGE", entityType: "CarrierProfile", entityId: "cmton885a003iib1vw2gm0yg7", performedById: "admin-1" });
    expect(data.changedFields).toEqual({
      actionDetail: "CARRIER_SUSPENSION_LIFTED",
      carrierName: "BLUE FALCON BROKERAGE LLC",
      previousStatus: "SUSPENDED",
      newStatus: "REVIEWING",
      reason: "Need this login for carrier portal testing",
      previousCause: "AE_MANUAL",
      previousReason: SUSPEND_REASON,
      previousSuspendedAt: SUSPENDED_AT.toISOString(),
    });
  });

  it("tells the carrier they can sign in again, without the admin's reason", async () => {
    await call({ reason: "Need this login for carrier portal testing" });
    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);
    const notif = (mockPrisma.notification.create.mock.calls[0] as any)[0].data;
    expect(notif).toMatchObject({ userId: "cmton885a003hib1vr17t5nn0", title: "Suspension lifted" });
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const [to, subject, html] = mockSendEmail.mock.calls[0] as unknown as [string, string, string];
    expect(to).toBe("wasihaider3089+carrier4@gmail.com");
    expect(subject).toMatch(/no longer suspended/);
    expect(html).toContain("sign in to the carrier portal again");
    expect(html).not.toContain("portal testing");
  });

  it("a status changed between the read and the write is refused, not overwritten", async () => {
    state.flipBeforeWrite = "APPROVED"; // e.g. the weekly auto-reversal landed first
    const res = await call({ reason: "Need this login for carrier portal testing" });
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe("SUSPENSION_CHANGED");
    expect(state.row!.onboardingStatus).toBe("APPROVED");
    expect(mockPrisma.auditTrail.create).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("a failed audit row, notification or email never fails the lift", async () => {
    mockPrisma.auditTrail.create.mockRejectedValueOnce(new Error("audit down"));
    mockPrisma.notification.create.mockRejectedValueOnce(new Error("notif down"));
    mockSendEmail.mockRejectedValueOnce(new Error("resend down"));
    const res = await call({ reason: "Need this login for carrier portal testing" });
    expect(res.statusCode).toBe(200);
    expect(state.row!.onboardingStatus).toBe("REVIEWING");
  });
});
