/**
 * carrier-portal-upgrade M2 — the carrier notification reads are scoped twice.
 *
 * 1. IDOR (G38): PATCH /notifications/:id/read updated by id alone, so any
 *    signed-in user could mark anyone's notification read. It must now match
 *    the caller's own row, and a row that is not theirs is a 404.
 * 2. Allowlist: a carrier's list, unread count and mark-all add
 *    `type IN (CARRIER_NOTIFICATION_TYPES)`, so an internal type never reaches a
 *    carrier's bell even if a writer someday picks the wrong recipient. Staff
 *    reads are unchanged.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";
import { getNotifications, markAsRead, markAllRead, getUnreadCount } from "../../../src/controllers/notificationController";
import { CARRIER_NOTIFICATION_TYPES } from "../../../src/lib/carrierNotificationTypes";

const mockPrisma = prisma as any;
mockPrisma.notification ??= {};
for (const m of ["findMany", "updateMany", "update", "count"]) mockPrisma.notification[m] ??= vi.fn();

function res() {
  const r: any = { statusCode: 200, body: undefined };
  r.status = vi.fn((c: number) => { r.statusCode = c; return r; });
  r.json = vi.fn((b: unknown) => { r.body = b; return r; });
  return r;
}
const carrierA = { id: "u-carrier-a", email: "a@srl.invalid", role: "CARRIER" };
const staff = { id: "u-ae", email: "ae@srl.invalid", role: "BROKER" };

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.notification.findMany.mockResolvedValue([]);
  mockPrisma.notification.count.mockResolvedValue(0);
});

describe("PATCH /notifications/:id/read (G38)", () => {
  it("carrier A cannot mark carrier B's notification read", async () => {
    // B's row exists, but the scoped update matches nothing for A.
    mockPrisma.notification.updateMany.mockResolvedValue({ count: 0 });
    const r = res();
    await markAsRead({ user: carrierA, params: { id: "n-belongs-to-b" } } as any, r);
    expect(r.statusCode).toBe(404);
    expect(mockPrisma.notification.update).not.toHaveBeenCalled();
    expect(mockPrisma.notification.updateMany.mock.calls[0][0].where).toEqual({ id: "n-belongs-to-b", userId: "u-carrier-a" });
  });

  it("marks the caller's own notification read", async () => {
    mockPrisma.notification.updateMany.mockResolvedValue({ count: 1 });
    const r = res();
    await markAsRead({ user: carrierA, params: { id: "n-own" } } as any, r);
    expect(r.statusCode).toBe(200);
  });
});

describe("the carrier allowlist", () => {
  it("is applied to the list, the unread count and mark-all for a carrier", async () => {
    mockPrisma.notification.updateMany.mockResolvedValue({ count: 0 });
    await getNotifications({ user: carrierA } as any, res());
    await getUnreadCount({ user: carrierA } as any, res());
    await markAllRead({ user: carrierA } as any, res());
    const wheres = [
      mockPrisma.notification.findMany.mock.calls[0][0].where,
      mockPrisma.notification.count.mock.calls[0][0].where,
      mockPrisma.notification.updateMany.mock.calls[0][0].where,
    ];
    for (const w of wheres) {
      expect(w.userId).toBe("u-carrier-a");
      expect(w.type.in).toEqual([...CARRIER_NOTIFICATION_TYPES]);
    }
  });

  it("excludes the internal types an AE or compliance alert uses", () => {
    for (const internal of ["VETTING_DECLINE", "CHECK_CALL_DUE", "INVOICE", "CREDIT_ALERT", "EMAIL_LOAD", "SYSTEM_ERROR", "DISPUTE"]) {
      expect(CARRIER_NOTIFICATION_TYPES as readonly string[]).not.toContain(internal);
    }
  });

  it("leaves a staff member's reads unfiltered by type", async () => {
    await getNotifications({ user: staff } as any, res());
    expect(mockPrisma.notification.findMany.mock.calls[0][0].where).toEqual({ userId: "u-ae" });
  });
});
