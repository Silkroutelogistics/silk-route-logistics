/**
 * Mark-sent records a delivery SRL did not send (RECONCILE step 2): it never
 * emails, records channel, when and who, takes the customer's channel when none
 * is given, refuses a future date, and keeps one BASE invoice per load.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";

const { sendCustomerInvoiceEmail, sendEmail } = vi.hoisted(() => ({ sendCustomerInvoiceEmail: vi.fn(), sendEmail: vi.fn() }));
vi.mock("../../../src/services/emailService", () => ({ sendCustomerInvoiceEmail, sendEmail }));
vi.mock("../../../src/services/pdfService", () => ({ generateInvoicePdf: vi.fn() }));

import { markInvoiceSent } from "../../../src/controllers/accountingController";

const mockPrisma = vi.mocked(prisma, true) as any;
const res = () => { const r: any = {}; r.status = vi.fn().mockReturnValue(r); r.json = vi.fn().mockReturnValue(r); return r; };
const INV = { id: "inv-2", loadId: "load-1", status: "DRAFT", invoiceKind: "BASE", deletedAt: null, load: { customer: { defaultInvoiceChannel: "TIPALTI" } } };
const req = (body: any) => ({ params: { id: "inv-2" }, body, user: { id: "u-wasi", role: "ADMIN" }, ip: "127.0.0.1" }) as any;
const AT = "2026-09-25T21:00:00.000Z"; // 17:00 America/Toronto

describe("mark-sent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
    mockPrisma.invoice.findUnique.mockImplementation(async (a: any) => (a.select ? INV : { ...INV, status: "SENT" }));
    mockPrisma.invoice.findFirst.mockResolvedValue(null);
    mockPrisma.invoice.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.auditTrail.create.mockResolvedValue({});
  });

  it("records channel, when and who, flips SENT, and emails nothing", async () => {
    const r = res();
    await markInvoiceSent(req({ channel: "MANUAL", deliveredAt: AT }), r);
    expect(r.status).not.toHaveBeenCalled();
    expect(mockPrisma.invoice.updateMany.mock.calls[0][0]).toEqual({
      where: { id: "inv-2", status: { in: ["DRAFT", "SUBMITTED"] } },
      data: { status: "SENT", sentDate: new Date(AT), deliveryChannel: "MANUAL", deliveredAt: new Date(AT), deliveredById: "u-wasi" },
    });
    expect(mockPrisma.auditTrail.create.mock.calls[0][0].data).toMatchObject({
      entityId: "inv-2", action: "STATUS_CHANGE", performedById: "u-wasi",
      changedFields: { status: { from: "DRAFT", to: "SENT" }, deliveryChannel: "MANUAL", actionDetail: "INVOICE_MARKED_SENT" },
    });
    expect(sendCustomerInvoiceEmail).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("with no channel given, the customer's default is recorded", async () => {
    await markInvoiceSent(req({ deliveredAt: AT }), res());
    expect(mockPrisma.invoice.updateMany.mock.calls[0][0].data.deliveryChannel).toBe("TIPALTI");
  });

  it("refuses a delivery date in the future, and writes nothing", async () => {
    const r = res();
    await markInvoiceSent(req({ channel: "TIPALTI", deliveredAt: new Date(Date.now() + 86_400_000).toISOString() }), r);
    expect(r.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.invoice.updateMany).not.toHaveBeenCalled();
  });

  it("keeps one BASE invoice per load: a second is refused 409 and nothing is written", async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue({ id: "inv-1", invoiceNumber: "INV-9", srlDocNumber: "121494I", status: "SENT" });
    const r = res();
    await markInvoiceSent(req({ channel: "TIPALTI", deliveredAt: AT }), r);
    expect(r.status).toHaveBeenCalledWith(409);
    expect(r.json.mock.calls[0][0].code).toBe("LOAD_ALREADY_INVOICED");
    expect(mockPrisma.invoice.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.auditTrail.create).not.toHaveBeenCalled();
  });
});
