/**
 * Lifecycle-gaps B4b — nothing is invoiced or paid on a cancelled load.
 *
 * Manual POST /invoices and POST /carrier-pays never read load.status, so a
 * CANCELLED load could be invoiced and paid by hand; only the automatic paths
 * keyed on DELIVERED. One rule (assessLoadBillable) at all three entry points:
 * CANCELLED or archived → refused; TONU → admitted only once its fault side is
 * recorded, because the two-sided rule bills or pays from that field.
 *
 * Every refusal case is paired with a live-load control on the same path, so
 * a guard that refused everything could not pass (§19 Sub-pattern 16).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../../src/services/pdfService", () => ({ generateInvoicePdf: vi.fn() }));
vi.mock("../../../src/services/emailService", () => ({ sendEmail: vi.fn(), sendInvoiceEmail: vi.fn() }));
vi.mock("../../../src/validators/invoice", () => ({
  createInvoiceSchema: { parse: (v: any) => v }, submitForFactoringSchema: { parse: (v: any) => v },
  updateLineItemsSchema: { parse: (v: any) => v }, batchInvoiceStatusSchema: { parse: (v: any) => v },
}));
vi.mock("../../../src/validators/carrierPay", () => ({
  createCarrierPaySchema: { parse: (v: any) => v }, updateCarrierPaySchema: { parse: (v: any) => v },
  batchCarrierPaySchema: { parse: (v: any) => v },
}));
vi.mock("../../../src/controllers/carrierController", () => ({ isQuickPayPilotApproved: vi.fn().mockResolvedValue(true) }));

import { assessLoadBillable, autoGenerateInvoice } from "../../../src/services/invoiceService";
import { createInvoice } from "../../../src/controllers/invoiceController";
import { createCarrierPay } from "../../../src/controllers/carrierPayController";
import { prisma } from "../../../src/config/database";

const mockPrisma = prisma as any;
const res = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }) as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.invoice.findFirst.mockResolvedValue(null);
  mockPrisma.invoice.create.mockImplementation(async (a: any) => ({ id: "inv-1", ...a.data }));
  mockPrisma.invoice.findUnique.mockResolvedValue({ id: "inv-1", lineItems: [] });
  mockPrisma.invoiceLineItem.createMany.mockResolvedValue({ count: 0 });
  mockPrisma.carrierPay.create.mockImplementation(async (a: any) => ({ id: "cp-1", ...a.data }));
  mockPrisma.carrierPay.findFirst.mockResolvedValue(null);
  mockPrisma.notification.create.mockResolvedValue({});
  mockPrisma.$transaction.mockImplementation(async (arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(mockPrisma)));
});

describe("assessLoadBillable — the rule", () => {
  it("refuses CANCELLED and archived loads", () => {
    expect(assessLoadBillable({ status: "CANCELLED" })).toMatchObject({ ok: false, code: "LOAD_CANCELLED" });
    expect(assessLoadBillable({ status: "DELIVERED", deletedAt: new Date() })).toMatchObject({ ok: false, code: "LOAD_CANCELLED" });
  });
  it("refuses a TONU with no fault side, admits one with it", () => {
    expect(assessLoadBillable({ status: "TONU", tonuFaultSide: null })).toMatchObject({ ok: false, code: "TONU_FAULT_SIDE_MISSING" });
    expect(assessLoadBillable({ status: "TONU", tonuFaultSide: "CUSTOMER" })).toEqual({ ok: true });
  });
  it("admits an ordinary live load", () => {
    expect(assessLoadBillable({ status: "DELIVERED", tonuFaultSide: null, deletedAt: null })).toEqual({ ok: true });
  });
});

describe("createInvoice (manual)", () => {
  const body = { loadId: "l1", amount: 100, dueDate: new Date().toISOString() };
  it("refuses a CANCELLED load with 409 LOAD_CANCELLED and creates nothing", async () => {
    mockPrisma.load.findUnique.mockResolvedValue({ status: "CANCELLED", tonuFaultSide: null, deletedAt: null });
    const r = res();
    await createInvoice({ body, user: { id: "u1", role: "ACCOUNTING" } } as any, r);
    expect(r.status).toHaveBeenCalledWith(409);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ code: "LOAD_CANCELLED" }));
    expect(mockPrisma.invoice.create).not.toHaveBeenCalled();
  });
  it("admits a TONU with a fault side (control)", async () => {
    mockPrisma.load.findUnique.mockResolvedValue({ status: "TONU", tonuFaultSide: "CUSTOMER", deletedAt: null });
    const r = res();
    await createInvoice({ body, user: { id: "u1", role: "ACCOUNTING" } } as any, r);
    expect(r.status).not.toHaveBeenCalledWith(409);
    expect(mockPrisma.invoice.create).toHaveBeenCalledTimes(1);
  });
  it("404s an unknown load rather than guessing", async () => {
    mockPrisma.load.findUnique.mockResolvedValue(null);
    const r = res();
    await createInvoice({ body, user: { id: "u1", role: "ACCOUNTING" } } as any, r);
    expect(r.status).toHaveBeenCalledWith(404);
  });
});

describe("createCarrierPay (manual)", () => {
  const body = { carrierId: "c1", loadId: "l1", amount: 1000, isQuickPay: false, paymentMethod: "ACH", scheduledDate: null, notes: null };
  it("refuses a CANCELLED load with 409 LOAD_CANCELLED and pays nothing", async () => {
    mockPrisma.load.findUnique.mockResolvedValue({ status: "CANCELLED", tonuFaultSide: null, deletedAt: null });
    const r = res();
    await createCarrierPay({ body, user: { id: "u1", role: "ACCOUNTING" } } as any, r);
    expect(r.status).toHaveBeenCalledWith(409);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ code: "LOAD_CANCELLED" }));
    expect(mockPrisma.carrierPay.create).not.toHaveBeenCalled();
  });
  it("refuses a TONU with no fault side — there is nothing to pay from yet", async () => {
    mockPrisma.load.findUnique.mockResolvedValue({ status: "TONU", tonuFaultSide: null, deletedAt: null });
    const r = res();
    await createCarrierPay({ body, user: { id: "u1", role: "ACCOUNTING" } } as any, r);
    expect(r.status).toHaveBeenCalledWith(409);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ code: "TONU_FAULT_SIDE_MISSING" }));
    expect(mockPrisma.carrierPay.create).not.toHaveBeenCalled();
  });
  it("admits a TONU with a fault side (control)", async () => {
    mockPrisma.load.findUnique.mockResolvedValue({ status: "TONU", tonuFaultSide: "CUSTOMER", deletedAt: null });
    const r = res();
    await createCarrierPay({ body, user: { id: "u1", role: "ACCOUNTING" } } as any, r);
    expect(r.status).not.toHaveBeenCalledWith(409);
    expect(mockPrisma.carrierPay.create).toHaveBeenCalledTimes(1);
  });
});

describe("autoGenerateInvoice (automatic)", () => {
  const live = { id: "l1", referenceNumber: "R", posterId: "u1", customerRate: 2500, fuelSurcharge: 0,
    originCity: "A", originState: "AA", destCity: "B", destState: "BB", tonuFaultSide: null, deletedAt: null };
  it("returns null and creates nothing on a CANCELLED load", async () => {
    mockPrisma.load.findUnique.mockResolvedValue({ ...live, status: "CANCELLED" });
    expect(await autoGenerateInvoice("l1")).toBeNull();
    expect(mockPrisma.invoice.create).not.toHaveBeenCalled();
  });
  it("drafts on a DELIVERED load (control)", async () => {
    mockPrisma.load.findUnique.mockResolvedValue({ ...live, status: "DELIVERED" });
    mockPrisma.invoice.findFirst.mockResolvedValue(null);
    await autoGenerateInvoice("l1");
    expect(mockPrisma.invoice.create).toHaveBeenCalledTimes(1);
  });
});
