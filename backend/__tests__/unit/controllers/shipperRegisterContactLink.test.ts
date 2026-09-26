// v3.8.bhb — the portal invite now goes to a CONTACT whose email need not equal
// Customer.email. Registration must attach that contact's login to the existing
// customer rather than forking a duplicate PENDING customer — but only on an
// unambiguous match, and never through a Do Not Contact contact.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";

vi.mock("../../../src/services/emailService", () => ({
  sendOtpEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}));

import { register } from "../../../src/controllers/authController";

const mockPrisma = vi.mocked(prisma, true) as any;

function reqRes() {
  const req: any = {
    body: {
      email: "jane.ops@bee.test",
      password: "Password123!Strong",
      firstName: "Jane",
      lastName: "Ops",
      role: "SHIPPER",
      company: "Beekeepers",
    },
    headers: { "user-agent": "test" },
    ip: "127.0.0.1",
  };
  const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), cookie: vi.fn().mockReturnThis() };
  return { req, res };
}

describe("register — SHIPPER links to the customer whose contact list carries the email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({
      id: "user-new", email: "jane.ops@bee.test", firstName: "Jane", lastName: "Ops", role: "SHIPPER", company: "Beekeepers",
    });
    mockPrisma.customer.findFirst.mockResolvedValue(null); // no Customer.email match
    mockPrisma.customer.update.mockResolvedValue({});
    mockPrisma.customer.create.mockResolvedValue({});
  });

  it("links to the one unlinked customer listing the email on a contact — no duplicate created", async () => {
    mockPrisma.customer.findMany.mockResolvedValue([{ id: "cust-bee" }]);
    const { req, res } = reqRes();
    await register(req, res);

    const where = mockPrisma.customer.findMany.mock.calls[0][0].where;
    expect(where.userId).toBeNull();
    expect(where.contacts.some.doNotContact).toBe(false);
    expect(mockPrisma.customer.update).toHaveBeenCalledWith({ where: { id: "cust-bee" }, data: { userId: "user-new" } });
    expect(mockPrisma.customer.create).not.toHaveBeenCalled();
  });

  it("does NOT guess when two customers list the email — falls through to a fresh PENDING customer", async () => {
    mockPrisma.customer.findMany.mockResolvedValue([{ id: "cust-a" }, { id: "cust-b" }]);
    const { req, res } = reqRes();
    await register(req, res);
    expect(mockPrisma.customer.update).not.toHaveBeenCalled();
    expect(mockPrisma.customer.create).toHaveBeenCalledOnce();
    expect(mockPrisma.customer.create.mock.calls[0][0].data.onboardingStatus).toBe("PENDING");
  });

  it("a Customer.email match still wins and the contact lookup is not consulted", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue({ id: "cust-direct" });
    const { req, res } = reqRes();
    await register(req, res);
    expect(mockPrisma.customer.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.customer.update).toHaveBeenCalledWith({ where: { id: "cust-direct" }, data: { userId: "user-new" } });
  });
});
