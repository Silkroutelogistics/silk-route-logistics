/**
 * carrier-portal-upgrade G8 — a carrier or shipper messages SRL, not each other.
 *
 * GET /messages/users searched every account on the platform and returned name,
 * company and email; POST /messages accepted any receiver. A carrier could list
 * and message other carriers and shippers. External callers now see and reach
 * SRL staff only; staff are unchanged.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";
import { getUsers, sendMessage } from "../../../src/controllers/messageController";

const mockPrisma = prisma as any;
mockPrisma.message ??= {};
mockPrisma.message.create ??= vi.fn();

function res() {
  const r: any = { statusCode: 200, body: undefined };
  r.status = vi.fn((c: number) => { r.statusCode = c; return r; });
  r.json = vi.fn((b: unknown) => { r.body = b; return r; });
  return r;
}
const carrier = { id: "u-carrier", email: "c@srl.invalid", role: "CARRIER" };

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.user.findMany.mockResolvedValue([]);
  mockPrisma.message.create.mockResolvedValue({ id: "m1" });
});

describe("GET /messages/users", () => {
  it("a carrier's search is limited to SRL staff", async () => {
    await getUsers({ user: carrier, query: { search: "freight" } } as any, res());
    const where = mockPrisma.user.findMany.mock.calls[0][0].where;
    expect(where.role.in).toEqual(expect.arrayContaining(["BROKER", "OPERATIONS", "ADMIN"]));
    expect(where.role.in).not.toContain("CARRIER");
    expect(where.role.in).not.toContain("SHIPPER");
  });

  it("staff search is unchanged", async () => {
    await getUsers({ user: { ...carrier, role: "OPERATIONS" }, query: {} } as any, res());
    expect(mockPrisma.user.findMany.mock.calls[0][0].where.role).toBeUndefined();
  });
});

describe("POST /messages", () => {
  it("a carrier cannot message another carrier", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ role: "CARRIER" });
    const r = res();
    await sendMessage({ user: carrier, body: { receiverId: "u-competitor", content: "hi" } } as any, r);
    expect(r.statusCode).toBe(403);
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  it("a carrier cannot message a receiver that does not exist", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const r = res();
    await sendMessage({ user: carrier, body: { receiverId: "u-nobody", content: "hi" } } as any, r);
    expect(r.statusCode).toBe(403);
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  it("a carrier can message SRL staff", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ role: "DISPATCH" });
    const r = res();
    await sendMessage({ user: carrier, body: { receiverId: "u-dispatch", content: "on my way" } } as any, r);
    expect(r.statusCode).toBe(201);
    expect(mockPrisma.message.create).toHaveBeenCalled();
  });
});
