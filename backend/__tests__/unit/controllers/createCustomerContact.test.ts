/**
 * v3.8.bkv — the contact typed on the New Customer form goes on the
 * contact list. It was written only to Customer.contactName/email, which the
 * contact-list rule never reads, so a brand-new customer had nobody to send
 * a portal invite or a quote to.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";

vi.mock("../../../src/services/customerActivityService", () => ({ logCustomerActivity: vi.fn() }));

import { createCustomer } from "../../../src/controllers/customerController";

const mockPrisma = prisma as any;

function reqRes(body: Record<string, unknown>) {
  const req: any = { body, user: { id: "u-ae", email: "ae@srl.test", role: "ADMIN" } };
  const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  return { req, res };
}

describe("createCustomer — the named contact goes on the list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.customer.create.mockResolvedValue({ id: "cust-new", name: "Acme" });
    mockPrisma.shipperCredit.create.mockResolvedValue({});
    mockPrisma.customerContact.create.mockResolvedValue({});
  });

  it("a named contact becomes the primary contact, with the email and phone typed", async () => {
    const { req, res } = reqRes({ name: "Acme", contactName: " Jane Ops ", email: "jane@acme.test", phone: "555-0100" });
    await createCustomer(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockPrisma.customerContact.create).toHaveBeenCalledTimes(1);
    const data = mockPrisma.customerContact.create.mock.calls[0][0].data;
    expect(data).toEqual({ customerId: "cust-new", name: "Jane Ops", email: "jane@acme.test", phone: "555-0100", isPrimary: true });
    // Being on the list is not consent to be mailed.
    expect(data).not.toHaveProperty("receivesOperationalUpdates");
    expect(data).not.toHaveProperty("receivesTrackingLink");
    expect(data).not.toHaveProperty("isBilling");
  });

  it("an email with no name adds nobody — it may be a shared mailbox such as AP", async () => {
    const { req, res } = reqRes({ name: "Acme", email: "accountspayable@acme.test" });
    await createCustomer(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockPrisma.customerContact.create).not.toHaveBeenCalled();
  });

  it("a failed contact write does not fail the customer", async () => {
    mockPrisma.customerContact.create.mockRejectedValue(new Error("db"));
    const { req, res } = reqRes({ name: "Acme", contactName: "Jane Ops" });
    await createCustomer(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
