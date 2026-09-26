/**
 * v3.8.bkn — a quote goes to a contact on the customer's list, and is
 * recorded as sent only when it was.
 *
 * The defect: send-quote marked the order quote_sent and logged "Quote sent"
 * BEFORE emailing, then mailed Customer.email — Beekeepers' AP address — and
 * swallowed any failure. Every refusal below asserts that no email left AND
 * that nothing was recorded, not merely the status code.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import express from "express";
import type { Server } from "http";

const { sendEmail, logCustomerActivity } = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  logCustomerActivity: vi.fn(),
}));

vi.mock("../../../src/middleware/auth", async (orig) => {
  const actual = (await orig()) as any;
  return {
    ...actual,
    authenticate: (req: any, _res: any, next: any) => {
      req.user = { id: "u-ae", email: "ae@srl.test", role: "ADMIN" };
      next();
    },
  };
});
vi.mock("../../../src/services/emailService", () => ({ sendEmail, wrap: (s: string) => s }));
vi.mock("../../../src/services/customerActivityService", () => ({ logCustomerActivity }));
vi.mock("../../../src/routes/quoteApprove", () => ({ buildQuoteApprovalUrl: () => "https://srl.test/quote/approve/t" }));

import ordersRouter from "../../../src/routes/orders";
import { prisma } from "../../../src/config/database";

const mockPrisma = prisma as any;
let server: Server;
let base = "";

// Customer.email is deliberately NOT on the order's customer shape any more;
// the fixture keeps the AP address on the side to prove nothing reaches it.
const AP = "accountspayable@bee.test";
const ORDER = {
  id: "ord-1", orderNumber: "Q-1001", customerId: "cust-bee",
  originCity: "Northlake", originState: "TX", destCity: "Hebron", destState: "KY",
  equipmentType: "Dry Van 53'", pickupDate: null, deliveryDate: null, customerRate: 2550,
  customer: { id: "cust-bee", name: "Beekeepers", email: AP },
};
const JANE = { id: "ct-jane", name: "Jane Ops", email: "jane@bee.test", doNotContact: false };

async function post(body: Record<string, unknown>) {
  const r = await fetch(`${base}/ord-1/send-quote`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}

beforeEach(async () => {
  vi.clearAllMocks();
  if (!server) {
    const app = express();
    app.use(express.json());
    app.use("/orders", ordersRouter);
    await new Promise<void>((r) => { server = app.listen(0, "127.0.0.1", () => r()); });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}/orders`;
  }
  mockPrisma.order.findUnique = vi.fn().mockResolvedValue(ORDER);
  mockPrisma.order.update = vi.fn().mockResolvedValue({ ...ORDER, status: "quote_sent" });
  mockPrisma.customerContact.findFirst.mockResolvedValue(JANE);
  sendEmail.mockResolvedValue("resend-msg-1");
  logCustomerActivity.mockResolvedValue(undefined);
});
afterAll(() => server?.close());

function nothingRecorded() {
  expect(mockPrisma.order.update).not.toHaveBeenCalled();
  expect(logCustomerActivity).not.toHaveBeenCalled();
}

describe("POST /orders/:id/send-quote", () => {
  it("sends to the chosen contact, then records it with who received it", async () => {
    const { status, body } = await post({ contactId: "ct-jane" });
    expect(status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0]).toBe("jane@bee.test");
    expect(sendEmail.mock.calls[0][2]).toContain("Hello Jane Ops,");
    expect(body.sentTo).toEqual({ name: "Jane Ops", email: "jane@bee.test" });
    expect(mockPrisma.order.update.mock.calls[0][0].data.status).toBe("quote_sent");
    expect(logCustomerActivity.mock.calls[0][0].description).toContain("Jane Ops <jane@bee.test>");
    // The contact lookup is scoped to THIS customer's list.
    expect(mockPrisma.customerContact.findFirst.mock.calls[0][0].where).toEqual({ id: "ct-jane", customerId: "cust-bee" });
  });

  it("never mails Customer.email", async () => {
    await post({ contactId: "ct-jane" });
    for (const call of sendEmail.mock.calls) expect(call[0]).not.toBe(AP);
  });

  it("400 CONTACT_REQUIRED with no contact — no fallback, nothing sent or recorded", async () => {
    const { status, body } = await post({});
    expect(status).toBe(400);
    expect(body.code).toBe("CONTACT_REQUIRED");
    expect(sendEmail).not.toHaveBeenCalled();
    nothingRecorded();
  });

  it("404 CONTACT_NOT_ON_LIST for a deleted or foreign contact", async () => {
    mockPrisma.customerContact.findFirst.mockResolvedValue(null);
    const { status, body } = await post({ contactId: "ct-deleted-ap" });
    expect(status).toBe(404);
    expect(body.code).toBe("CONTACT_NOT_ON_LIST");
    expect(sendEmail).not.toHaveBeenCalled();
    nothingRecorded();
  });

  it("409 CONTACT_DO_NOT_CONTACT", async () => {
    mockPrisma.customerContact.findFirst.mockResolvedValue({ ...JANE, doNotContact: true });
    const { status, body } = await post({ contactId: "ct-jane" });
    expect(status).toBe(409);
    expect(body.code).toBe("CONTACT_DO_NOT_CONTACT");
    expect(sendEmail).not.toHaveBeenCalled();
    nothingRecorded();
  });

  it("502 when the email fails — the order is NOT marked quoted", async () => {
    sendEmail.mockRejectedValue(new Error("resend down"));
    const { status, body } = await post({ contactId: "ct-jane" });
    expect(status).toBe(502);
    expect(body.code).toBe("QUOTE_EMAIL_FAILED");
    nothingRecorded();
  });

  it("503 when mail is not configured — a send that returned no id is not a send", async () => {
    sendEmail.mockResolvedValue(undefined);
    const { status, body } = await post({ contactId: "ct-jane" });
    expect(status).toBe(503);
    expect(body.code).toBe("EMAIL_NOT_CONFIGURED");
    nothingRecorded();
  });
});

describe("GET /orders/:id/quote-preview", () => {
  const LIST = [
    { id: "ct-jane", name: "Jane Ops", email: "jane@bee.test", isPrimary: true, title: "Logistics" },
    { id: "ct-sam", name: "Sam Buyer", email: " sam@bee.test ", isPrimary: false, title: null },
    { id: "ct-noemail", name: "No Email", email: null, isPrimary: false, title: null },
  ];

  it("offers the eligible contacts and defaults to the primary — never Customer.email", async () => {
    mockPrisma.customerContact.findMany.mockResolvedValue(LIST);
    const r = await fetch(`${base}/ord-1/quote-preview`);
    const body = await r.json();
    expect(r.status).toBe(200);
    expect(body.recipients.map((c: any) => c.id)).toEqual(["ct-jane", "ct-sam"]);
    expect(body.recipients[1].email).toBe("sam@bee.test");
    expect(body.selectedContactId).toBe("ct-jane");
    expect(body.recipientEmail).toBe("jane@bee.test");
    expect(body.html).toContain("Hello Jane Ops,");
    expect(JSON.stringify(body)).not.toContain(AP);
    expect(mockPrisma.customerContact.findMany.mock.calls[0][0].where).toEqual({ customerId: "cust-bee", doNotContact: false });
  });

  it("previews the contact asked for", async () => {
    mockPrisma.customerContact.findMany.mockResolvedValue(LIST);
    const body = await (await fetch(`${base}/ord-1/quote-preview?contactId=ct-sam`)).json();
    expect(body.selectedContactId).toBe("ct-sam");
    expect(body.html).toContain("Hello Sam Buyer,");
  });

  it("names no recipient when the list has no one who can receive it", async () => {
    mockPrisma.customerContact.findMany.mockResolvedValue([LIST[2]]);
    const body = await (await fetch(`${base}/ord-1/quote-preview`)).json();
    expect(body.recipients).toEqual([]);
    expect(body.selectedContactId).toBeNull();
    expect(body.recipientEmail).toBeNull();
  });
});
