/**
 * A second invoice under a number already issued answers 409
 * DUPLICATE_INVOICE_NUMBER, naming the invoice that holds it, never a 500
 * (ruled 2026-09-26). Two doors: the global errorHandler, which async handlers
 * (invoiceController, autoGenerateInvoice's status paths) reach through
 * express-async-errors, and accountingController.createInvoice, which catches
 * for itself.
 */
import "express-async-errors";
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { prisma } from "../../../src/config/database";
import { errorHandler } from "../../../src/middleware/errorHandler";
import { DuplicateInvoiceNumberError } from "../../../src/lib/invoiceNumber";
import { createInvoice } from "../../../src/controllers/accountingController";

const mockPrisma = prisma as any;
const res = () => { const r: any = {}; r.status = vi.fn().mockReturnValue(r); r.json = vi.fn().mockReturnValue(r); return r; };

// An async handler, the shape the real routes have: the throw reaches the
// handler only through express-async-errors, as it does in server.ts.
function app(err: Error) {
  const a = express();
  a.get("/x", async () => { await Promise.resolve(); throw err; });
  a.use(errorHandler);
  return a;
}

describe("a duplicate invoice number is a 409, not a 500", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The default branch does prisma.errorLog.create(...).catch(...); a bare
    // vi.fn() returns undefined and the handler itself would throw.
    mockPrisma.errorLog.create.mockResolvedValue({});
  });

  it("errorHandler: 409 DUPLICATE_INVOICE_NUMBER naming the holder, and no error_logs write", async () => {
    const r = await request(app(new DuplicateInvoiceNumberError("121494I", "SRL-121494I"))).get("/x");
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: "DUPLICATE_INVOICE_NUMBER", heldBy: "SRL-121494I" });
    expect(mockPrisma.errorLog.create).not.toHaveBeenCalled();
  });

  it("errorHandler control: any other error is still the 500 it was", async () => {
    const r = await request(app(new Error("boom"))).get("/x");
    expect(r.status).toBe(500);
    expect(mockPrisma.errorLog.create).toHaveBeenCalled();
  });

  it("createInvoice: a number held in invoiceNumber, which the srlDocNumber scan cannot see, is refused 409 and nothing is written", async () => {
    mockPrisma.load.findUnique.mockResolvedValue({ id: "load-4", posterId: "u-1", customerId: "c-1", loadNumber: "SRL-121494", referenceNumber: "SRL-121494" });
    mockPrisma.rateConfirmation.findFirst.mockResolvedValue(null);
    mockPrisma.invoice.findMany.mockResolvedValue([]);
    mockPrisma.invoice.findFirst.mockResolvedValue({ id: "inv-held", srlDocNumber: null, invoiceNumber: "SRL-121494I" });
    const r = res();
    await createInvoice({ body: { loadId: "load-4", amount: 2550 }, user: { id: "ae-1", role: "ADMIN" } } as any, r);
    expect(r.status).toHaveBeenCalledWith(409);
    expect(r.json.mock.calls[0][0]).toMatchObject({ code: "DUPLICATE_INVOICE_NUMBER", heldBy: "SRL-121494I" });
    expect(mockPrisma.invoice.create).not.toHaveBeenCalled();
  });
});
