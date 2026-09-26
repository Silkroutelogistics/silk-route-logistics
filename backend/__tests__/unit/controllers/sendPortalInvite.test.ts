// v3.8.aqs — AE "send portal invite" for an approved customer with no login.
// v3.8.bjv — the recipient is a CONTACT the AE picked from the live contact
// list, never Customer.email. The incident: Beekeepers' Customer.email held the
// AP address; the AP contact was deleted from the list, and the invite still
// went to AP because this endpoint read the customer column. Every case below
// that refuses asserts the email was NOT sent, not merely the status code.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";

const { sendPortalInviteEmail } = vi.hoisted(() => ({ sendPortalInviteEmail: vi.fn() }));
vi.mock("../../../src/services/emailService", () => ({
  sendEmail: vi.fn(),
  sendPortalInviteEmail,
}));
vi.mock("../../../src/services/customerActivityService", () => ({
  logCustomerActivity: vi.fn().mockResolvedValue(undefined),
}));

import { sendPortalInvite } from "../../../src/controllers/customerController";

const mockPrisma = vi.mocked(prisma, true) as any;

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}
const reqFor = (body: Record<string, unknown> = { contactId: "ct-1" }, id = "cust-1") =>
  ({ params: { id }, body, user: { id: "ae-1", email: "ae@srl.test" } }) as any;

// Customer.email carries the AP address on purpose: it must never be used.
const CUSTOMER = { id: "cust-1", name: "Beekeepers", contactName: "Old AP", email: "accountspayable@bee.test", userId: null };

describe("customerController.sendPortalInvite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendPortalInviteEmail.mockResolvedValue(undefined);
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.customerContact.findFirst = vi.fn();
  });

  it("404 when the customer does not exist", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue(null);
    const res = mockRes();
    await sendPortalInvite(reqFor(), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(sendPortalInviteEmail).not.toHaveBeenCalled();
  });

  it("409 when the customer already has a linked login", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue({ ...CUSTOMER, userId: "u-9" });
    const res = mockRes();
    await sendPortalInvite(reqFor(), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(sendPortalInviteEmail).not.toHaveBeenCalled();
  });

  it("refuses with no contactId even when Customer.email is set — no fallback to the customer column", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue(CUSTOMER);
    const res = mockRes();
    await sendPortalInvite(reqFor({}), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "CONTACT_REQUIRED" }));
    expect(sendPortalInviteEmail).not.toHaveBeenCalled();
  });

  it("THE INCIDENT: a contact deleted from the list gets nothing, and neither does Customer.email", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue(CUSTOMER);
    mockPrisma.customerContact.findFirst.mockResolvedValue(null); // hard-deleted row
    const res = mockRes();
    await sendPortalInvite(reqFor({ contactId: "deleted-ap-contact" }), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "CONTACT_NOT_ON_LIST" }));
    expect(sendPortalInviteEmail).not.toHaveBeenCalled();
  });

  it("scopes the contact lookup to THIS customer, so another customer's contact id is refused", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue(CUSTOMER);
    mockPrisma.customerContact.findFirst.mockResolvedValue(null);
    await sendPortalInvite(reqFor({ contactId: "ct-other" }), mockRes());
    expect(mockPrisma.customerContact.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "ct-other", customerId: "cust-1" } }),
    );
  });

  it("409 for a Do Not Contact contact", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue(CUSTOMER);
    mockPrisma.customerContact.findFirst.mockResolvedValue({ id: "ct-1", name: "Jane", email: "jane@bee.test", doNotContact: true });
    const res = mockRes();
    await sendPortalInvite(reqFor(), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(sendPortalInviteEmail).not.toHaveBeenCalled();
  });

  it("400 when the chosen contact has no email", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue(CUSTOMER);
    mockPrisma.customerContact.findFirst.mockResolvedValue({ id: "ct-1", name: "Jane", email: null, doNotContact: false });
    const res = mockRes();
    await sendPortalInvite(reqFor(), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(sendPortalInviteEmail).not.toHaveBeenCalled();
  });

  it("409 when a login already exists for the contact's email (would collide at register)", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue(CUSTOMER);
    mockPrisma.customerContact.findFirst.mockResolvedValue({ id: "ct-1", name: "Jane", email: "jane@bee.test", doNotContact: false });
    mockPrisma.user.findFirst.mockResolvedValue({ id: "existing-user" });
    const res = mockRes();
    await sendPortalInvite(reqFor(), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(sendPortalInviteEmail).not.toHaveBeenCalled();
  });

  it("sends to the chosen contact's email — never Customer.email — with that email in the register link", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue(CUSTOMER);
    mockPrisma.customerContact.findFirst.mockResolvedValue({ id: "ct-1", name: "Jane Ops", email: "Jane@Bee.test", doNotContact: false });
    const res = mockRes();
    await sendPortalInvite(reqFor(), res);

    expect(sendPortalInviteEmail).toHaveBeenCalledOnce();
    const [email, name, url] = sendPortalInviteEmail.mock.calls[0];
    expect(email).toBe("Jane@Bee.test");
    expect(email).not.toBe(CUSTOMER.email);
    expect(name).toBe("Jane Ops");
    expect(url).toContain("/shipper/register?email=");
    expect(url).toContain(encodeURIComponent("Jane@Bee.test"));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, sentTo: "Jane@Bee.test" }));
  });
});
