/**
 * Ruling 2 (2026-09-21) — a carrier INVOICE is required to approve a
 * settlement; an AE may override with a ≥10-character reason, recorded in
 * the audit log with who and when; the override is gated to AE roles.
 *
 * Three handlers write APPROVED (approvePayment, bulkApprovePayments, the
 * approval-queue review) and all three go through ONE gate,
 * lib/carrierPayInvoiceGate. The gate reads the invoice off the Document
 * rows through the shared paperwork rule — the same slot the carrier's panel
 * renders — never off CarrierPay.docCarrierInvoice, which is a non-fatal
 * recompute of those rows and can lag them.
 *
 * Prisma is the shared mock; handlers are called directly with a fake
 * req/res, the accountingController.test.ts idiom. The load-bearing
 * assertions are what was WRITTEN: no APPROVED write on a refusal, exactly
 * one audit row on an override, and the row naming who, when and why.
 *
 * Adversarially verified at authoring: removing the gate call from
 * approvePayment turns the 409 case red with APPROVED written; recording the
 * override AFTER the write (or not at all) turns the audit-row case red;
 * widening INVOICE_OVERRIDE_ROLES to ACCOUNTING turns the 403 case red.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";

const { onInvoicePaid, sumAtCostReimbursements } = vi.hoisted(() => ({
  onInvoicePaid: vi.fn().mockResolvedValue(undefined),
  sumAtCostReimbursements: vi.fn().mockReturnValue(0),
}));
vi.mock("../../../src/services/integrationService", () => ({
  onInvoicePaid, sumAtCostReimbursements,
  atCostReimbursementsForLoad: vi.fn(), carrierAccessorialsForLoad: vi.fn(),
}));

import { approvePayment, bulkApprovePayments, reviewApproval } from "../../../src/controllers/accountingController";
import {
  assertInvoiceOnFileOrOverride, invoiceOnFile, INVOICE_OVERRIDE_ACTION, INVOICE_OVERRIDE_ROLES, INVOICE_OVERRIDE_MIN_REASON,
} from "../../../src/lib/carrierPayInvoiceGate";

const mockPrisma = prisma as any;

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}
const req = (over: Record<string, unknown> = {}) => ({
  params: { id: "pay-1" }, body: {}, user: { id: "u-admin", role: "ADMIN", email: "a@srl.invalid" }, ...over,
});

/** Arm the load + its INVOICE documents (the rows the gate reads). */
function armInvoice(status: "PENDING" | "VERIFIED" | "REJECTED" | null) {
  mockPrisma.load.findUnique.mockResolvedValue({ status: "DELIVERED", equipmentType: "Dry Van 53'", temperatureControlled: false });
  mockPrisma.document.findMany.mockResolvedValue(status ? [{ id: "d-inv", docType: "INVOICE", status, createdAt: new Date() }] : []);
}
function armPay(status = "SUBMITTED") {
  mockPrisma.carrierPay.findUnique.mockResolvedValue({ id: "pay-1", loadId: "load-1", status });
  mockPrisma.carrierPay.update.mockResolvedValue({ id: "pay-1", status: "APPROVED" });
  mockPrisma.approvalQueue.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.auditLog.create.mockResolvedValue({});
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the gate", () => {
  it("an INVOICE at PENDING or VERIFIED is on file; REJECTED or absent is not", async () => {
    armInvoice("PENDING"); expect(await invoiceOnFile("load-1")).toBe(true);
    armInvoice("VERIFIED"); expect(await invoiceOnFile("load-1")).toBe(true);
    armInvoice("REJECTED"); expect(await invoiceOnFile("load-1")).toBe(false);
    armInvoice(null); expect(await invoiceOnFile("load-1")).toBe(false);
  });

  it("reads the Document rows, never the settlement's docCarrierInvoice column", async () => {
    // A stale column would say the invoice is there; the rows say it is not.
    armInvoice(null);
    mockPrisma.carrierPay.findUnique.mockResolvedValue({ id: "pay-1", loadId: "load-1", docCarrierInvoice: true });
    expect(await invoiceOnFile("load-1")).toBe(false);
    expect(mockPrisma.document.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { loadId: "load-1", docType: "INVOICE" } }));
  });

  it("no invoice, no reason → 409 INVOICE_REQUIRED, no audit row", async () => {
    armInvoice(null);
    const v = await assertInvoiceOnFileOrOverride({ carrierPayId: "pay-1", loadId: "load-1", actor: { id: "u", role: "ADMIN" } });
    expect(v).toMatchObject({ allowed: false, status: 409, code: "INVOICE_REQUIRED" });
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("a short reason is not an override: 400, no audit row", async () => {
    armInvoice(null);
    const v = await assertInvoiceOnFileOrOverride({ carrierPayId: "pay-1", loadId: "load-1", actor: { id: "u", role: "ADMIN" }, overrideReason: "ok fine   " });
    expect(v).toMatchObject({ allowed: false, status: 400, code: "OVERRIDE_REASON_TOO_SHORT" });
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("ACCOUNTING may not override: 403 even with a full reason", async () => {
    armInvoice(null);
    expect(INVOICE_OVERRIDE_ROLES.has("ACCOUNTING")).toBe(false);
    const v = await assertInvoiceOnFileOrOverride({ carrierPayId: "pay-1", loadId: "load-1", actor: { id: "u", role: "ACCOUNTING" }, overrideReason: "Carrier emailed the invoice to the desk; on file in Gmail." });
    expect(v).toMatchObject({ allowed: false, status: 403, code: "OVERRIDE_NOT_PERMITTED" });
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("an AE override with a ≥10-char reason is allowed and writes ONE audit row with who, when and why", async () => {
    armInvoice(null);
    mockPrisma.auditLog.create.mockResolvedValue({});
    const reason = "Carrier emailed the invoice to the desk; attached in Gmail thread.";
    const v = await assertInvoiceOnFileOrOverride({ carrierPayId: "pay-1", loadId: "load-1", actor: { id: "u-broker", role: "BROKER" }, overrideReason: reason });
    expect(v).toEqual({ allowed: true, overridden: true, reason });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    const row = mockPrisma.auditLog.create.mock.calls[0][0].data;
    expect(row).toMatchObject({ userId: "u-broker", action: INVOICE_OVERRIDE_ACTION, entity: "CarrierPay", entityId: "pay-1" });
    expect(row.details).toMatchObject({ reason, loadId: "load-1", role: "BROKER" });
    expect(new Date(row.details.at).getTime()).toBeGreaterThan(0);
    expect(reason.length).toBeGreaterThanOrEqual(INVOICE_OVERRIDE_MIN_REASON);
  });

  it("with the invoice on file the override is not consulted and nothing is recorded", async () => {
    armInvoice("PENDING");
    const v = await assertInvoiceOnFileOrOverride({ carrierPayId: "pay-1", loadId: "load-1", actor: { id: "u", role: "ACCOUNTING" }, overrideReason: "irrelevant, invoice is here" });
    expect(v).toEqual({ allowed: true, overridden: false });
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });
});

describe("approvePayment", () => {
  it("refuses 409 with NO APPROVED write when the invoice is missing", async () => {
    armPay(); armInvoice(null);
    const res = mockRes();
    await approvePayment(req() as any, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0]).toMatchObject({ code: "INVOICE_REQUIRED" });
    expect(mockPrisma.carrierPay.update).not.toHaveBeenCalled();
    expect(mockPrisma.approvalQueue.updateMany).not.toHaveBeenCalled();
  });

  it("approves when the invoice is on file", async () => {
    armPay(); armInvoice("PENDING");
    const res = mockRes();
    await approvePayment(req() as any, res);
    expect(mockPrisma.carrierPay.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.carrierPay.update.mock.calls[0][0].data.status).toBe("APPROVED");
    expect(res.status).not.toHaveBeenCalledWith(409);
  });

  it("approves on an AE override, and the audit row lands BEFORE the APPROVED write", async () => {
    armPay(); armInvoice(null);
    const order: string[] = [];
    mockPrisma.auditLog.create.mockImplementation(async () => { order.push("audit"); return {}; });
    mockPrisma.carrierPay.update.mockImplementation(async () => { order.push("approve"); return { id: "pay-1", status: "APPROVED" }; });
    const res = mockRes();
    await approvePayment(req({ body: { overrideReason: "Invoice received by fax, filed under SRL-121492 in the desk binder." } }) as any, res);
    expect(order).toEqual(["audit", "approve"]);
    expect(res.status).not.toHaveBeenCalledWith(409);
  });

  it("the SUBMITTED-status check still comes first: a PREPARED payment is 400 before the gate reads anything", async () => {
    armPay("PREPARED"); armInvoice(null);
    const res = mockRes();
    await approvePayment(req() as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.document.findMany).not.toHaveBeenCalled();
  });
});

describe("bulkApprovePayments", () => {
  it("approves the ones with an invoice, refuses the rest BY ID, and takes no override", async () => {
    mockPrisma.carrierPay.findMany.mockResolvedValue([{ id: "p-a", loadId: "l-a" }, { id: "p-b", loadId: "l-b" }]);
    mockPrisma.load.findUnique.mockResolvedValue({ status: "DELIVERED", equipmentType: "Dry Van", temperatureControlled: false });
    mockPrisma.document.findMany.mockImplementation(async ({ where }: any) =>
      where.loadId === "l-a" ? [{ id: "d", docType: "INVOICE", status: "PENDING", createdAt: new Date() }] : []);
    mockPrisma.carrierPay.updateMany.mockResolvedValue({ count: 1 });
    const res = mockRes();
    await bulkApprovePayments(req({ body: { paymentIds: ["p-a", "p-b"], overrideReason: "a reason for all of them, which is a reason for none" } }) as any, res);
    const where = mockPrisma.carrierPay.updateMany.mock.calls[0][0].where;
    expect(where.id.in).toEqual(["p-a"]);
    expect(res.json.mock.calls[0][0]).toEqual({ approved: 1, requested: 2, refused: [{ id: "p-b", code: "INVOICE_REQUIRED" }] });
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("writes nothing when none has an invoice", async () => {
    mockPrisma.carrierPay.findMany.mockResolvedValue([{ id: "p-b", loadId: "l-b" }]);
    armInvoice(null);
    const res = mockRes();
    await bulkApprovePayments(req({ body: { paymentIds: ["p-b"] } }) as any, res);
    expect(mockPrisma.carrierPay.updateMany).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0]).toMatchObject({ approved: 0, refused: [{ id: "p-b", code: "INVOICE_REQUIRED" }] });
  });
});

describe("reviewApproval (approval queue → CARRIER_PAY)", () => {
  function armQueue() {
    mockPrisma.approvalQueue.findUnique.mockResolvedValue({ id: "q-1", status: "PENDING", referenceType: "CARRIER_PAY", referenceId: "pay-1" });
    mockPrisma.approvalQueue.update.mockResolvedValue({ id: "q-1", status: "APPROVED" });
    mockPrisma.carrierPay.findUnique.mockResolvedValue({ id: "pay-1", loadId: "load-1", status: "SUBMITTED" });
    mockPrisma.carrierPay.update.mockResolvedValue({});
  }

  it("refuses BEFORE the queue row is marked, so the approval stays PENDING", async () => {
    armQueue(); armInvoice(null);
    const res = mockRes();
    await reviewApproval(req({ params: { id: "q-1" }, body: { action: "approve" } }) as any, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockPrisma.approvalQueue.update).not.toHaveBeenCalled();
    expect(mockPrisma.carrierPay.update).not.toHaveBeenCalled();
  });

  it("approves the queue row and the payment when the invoice is on file", async () => {
    armQueue(); armInvoice("VERIFIED");
    const res = mockRes();
    await reviewApproval(req({ params: { id: "q-1" }, body: { action: "approve" } }) as any, res);
    expect(mockPrisma.approvalQueue.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.carrierPay.update.mock.calls[0][0].data.status).toBe("APPROVED");
  });

  it("a REJECT never consults the gate", async () => {
    armQueue(); armInvoice(null);
    const res = mockRes();
    await reviewApproval(req({ params: { id: "q-1" }, body: { action: "reject", notes: "no" } }) as any, res);
    expect(mockPrisma.document.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.carrierPay.update.mock.calls[0][0].data.status).toBe("REJECTED");
  });
});
