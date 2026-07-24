// v3.8.aqs — AE "send portal invite" for an approved customer with no login.
// Locks: 404 unknown, 409 already-linked, 400 no-email, 409 email-taken,
// and the happy path (invite email sent, exact on-file email in the link).
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
const reqFor = (id = "cust-1") => ({ params: { id }, user: { id: "ae-1", email: "ae@srl.test" } }) as any;

describe("customerController.sendPortalInvite — v3.8.aqs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendPortalInviteEmail.mockResolvedValue(undefined);
    mockPrisma.user.findFirst.mockResolvedValue(null);
  });

  it("404 when the customer does not exist", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue(null);
    const res = mockRes();
    await sendPortalInvite(reqFor(), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(sendPortalInviteEmail).not.toHaveBeenCalled();
  });

  it("409 when the customer already has a linked login", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue({ id: "cust-1", name: "Bee", email: "ap@bee.test", userId: "u-9" });
    const res = mockRes();
    await sendPortalInvite(reqFor(), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(sendPortalInviteEmail).not.toHaveBeenCalled();
  });

  it("400 when the customer has no email on file", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue({ id: "cust-1", name: "Bee", email: null, userId: null });
    const res = mockRes();
    await sendPortalInvite(reqFor(), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(sendPortalInviteEmail).not.toHaveBeenCalled();
  });

  it("409 when a login already exists for that email (would collide at register)", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue({ id: "cust-1", name: "Bee", email: "ap@bee.test", userId: null });
    mockPrisma.user.findFirst.mockResolvedValue({ id: "existing-user" });
    const res = mockRes();
    await sendPortalInvite(reqFor(), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(sendPortalInviteEmail).not.toHaveBeenCalled();
  });

  it("sends the invite with the exact on-file email in the register link", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue({
      id: "cust-1", name: "Beekeepers", contactName: "Jane", email: "AP@Bee.test", userId: null,
    });
    const res = mockRes();
    await sendPortalInvite(reqFor(), res);

    expect(sendPortalInviteEmail).toHaveBeenCalledOnce();
    const [email, name, url] = sendPortalInviteEmail.mock.calls[0];
    expect(email).toBe("AP@Bee.test");
    expect(name).toBe("Jane");
    expect(url).toContain("/shipper/register?email=");
    expect(url).toContain(encodeURIComponent("AP@Bee.test"));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, sentTo: "AP@Bee.test" }));
  });
});
