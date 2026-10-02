/**
 * carrier-portal-upgrade R1 (G26, staff side) — a carrier's message tells SRL.
 *
 * Before this, POST /messages saved the message and notified nobody. Now a
 * carrier's message creates an in-app notification for the SRL rep it was sent
 * to, or, when that rep is inactive, for the active operations team (OPERATIONS
 * and DISPATCH; no on-call roster exists). The recipient is always staff, never
 * another carrier, and a failed notice never fails the send.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";
import { sendMessage } from "../../../src/controllers/messageController";

const mockPrisma = prisma as any;
mockPrisma.message ??= {};
mockPrisma.message.create ??= vi.fn();
mockPrisma.notification ??= {};
mockPrisma.notification.createMany ??= vi.fn();

function res() {
  const r: any = { statusCode: 200, body: undefined };
  r.status = vi.fn((c: number) => { r.statusCode = c; return r; });
  r.json = vi.fn((b: unknown) => { r.body = b; return r; });
  return r;
}

const carrier = { id: "u-carrier", email: "c@srl.invalid", role: "CARRIER" };
const USERS: Record<string, { id: string; role: string; isActive: boolean; firstName: string; lastName: string; company: string | null }> = {
  "u-carrier": { id: "u-carrier", role: "CARRIER", isActive: true, firstName: "Dana", lastName: "Reyes", company: "Dream Line LLC" },
  "u-rep": { id: "u-rep", role: "BROKER", isActive: true, firstName: "Noor", lastName: "Ahmed", company: "SRL" },
  "u-rep-gone": { id: "u-rep-gone", role: "BROKER", isActive: false, firstName: "Old", lastName: "Rep", company: "SRL" },
  "u-other-carrier": { id: "u-other-carrier", role: "CARRIER", isActive: true, firstName: "Rival", lastName: "Hauler", company: "Rival LLC" },
};

const send = async (user: typeof carrier, receiverId: string, content = "Load 121601 is loaded") => {
  const r = res();
  await sendMessage({ user, body: { receiverId, content } } as any, r);
  return r;
};
const notified = () => mockPrisma.notification.createMany.mock.calls.flatMap((c: any[]) => c[0].data);

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.user.findUnique.mockImplementation(async ({ where }: any) => USERS[where.id] ?? null);
  mockPrisma.user.findMany.mockResolvedValue([{ id: "u-ops-1" }, { id: "u-dispatch-1" }]);
  mockPrisma.message.create.mockResolvedValue({ id: "m1" });
  mockPrisma.notification.createMany.mockResolvedValue({ count: 1 });
});

describe("POST /messages notifies SRL staff of a carrier's message", () => {
  it("the rep the carrier wrote to gets one MESSAGE_RECEIVED notice", async () => {
    const r = await send(carrier, "u-rep");
    expect(r.statusCode).toBe(201);
    const n = notified();
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ userId: "u-rep", type: "MESSAGE_RECEIVED", link: "/dashboard/messages" });
    expect(n[0].title).toBe("New message from Dream Line LLC");
    expect(n[0].message).toBe("Load 121601 is loaded");
    expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
  });

  it("an inactive rep is replaced by the active operations team, and only staff roles are asked for", async () => {
    await send(carrier, "u-rep-gone");
    const where = mockPrisma.user.findMany.mock.calls[0][0].where;
    expect(where.isActive).toBe(true);
    expect(where.role.in).toEqual(["OPERATIONS", "DISPATCH"]);
    expect(notified().map((x: any) => x.userId)).toEqual(["u-ops-1", "u-dispatch-1"]);
  });

  it("never notifies another carrier: a message to a carrier is refused and nothing is created", async () => {
    const r = await send(carrier, "u-other-carrier");
    expect(r.statusCode).toBe(403);
    expect(mockPrisma.notification.createMany).not.toHaveBeenCalled();
  });

  it("staff writing to a carrier creates no staff notice (staff side only)", async () => {
    await send({ id: "u-rep", email: "n@srl.invalid", role: "BROKER" }, "u-carrier");
    expect(mockPrisma.notification.createMany).not.toHaveBeenCalled();
  });

  it("a failed notice does not fail the message", async () => {
    mockPrisma.notification.createMany.mockRejectedValue(new Error("db down"));
    const r = await send(carrier, "u-rep");
    expect(r.statusCode).toBe(201);
    expect(mockPrisma.message.create).toHaveBeenCalledTimes(1);
  });

  it("a long message is previewed, not copied whole", async () => {
    await send(carrier, "u-rep", "x".repeat(400));
    expect(notified()[0].message).toHaveLength(140);
  });
});
