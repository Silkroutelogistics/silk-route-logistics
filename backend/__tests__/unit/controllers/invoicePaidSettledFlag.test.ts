/**
 * v3.8.blg — invoiceController.markInvoicePaid tells onInvoicePaid whether
 * THIS payment settled the invoice. The payment record (on time or late) is
 * counted only on the settling payment; a partial one releases credit and
 * records nothing yet. accountingController.markInvoicePaid is pinned the same
 * way in accountingController.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";

const { onInvoicePaid } = vi.hoisted(() => ({ onInvoicePaid: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../../src/services/integrationService", () => ({ onInvoicePaid }));
vi.mock("../../../src/services/pdfService", () => ({ generateInvoicePdf: vi.fn() }));
vi.mock("../../../src/services/emailService", () => ({ sendEmail: vi.fn(), wrap: vi.fn((h: string) => h) }));

import { markInvoicePaid } from "../../../src/controllers/invoiceController";

const mockPrisma = prisma as any;

function call(paidAmount?: number) {
  const req: any = { params: { id: "inv-1" }, body: paidAmount == null ? {} : { paidAmount }, user: { id: "u-1" } };
  const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  return markInvoicePaid(req, res).then(() => res);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.invoice.findUnique.mockResolvedValue({ id: "inv-1", status: "SENT", amount: 1000, totalAmount: 1000, paidAmount: null });
  mockPrisma.invoice.updateMany.mockResolvedValue({ count: 1 });
});

describe("invoiceController.markInvoicePaid — the settled flag", () => {
  it("a full payment settles the invoice", async () => {
    await call();
    expect(onInvoicePaid).toHaveBeenCalledWith("inv-1", 1000, true);
  });

  it("a partial payment does not", async () => {
    await call(400);
    expect(onInvoicePaid).toHaveBeenCalledWith("inv-1", 400, false);
  });

  it("the payment that completes a partly paid invoice settles it", async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue({ id: "inv-1", status: "PARTIAL", amount: 1000, totalAmount: 1000, paidAmount: 600 });
    await call(400);
    expect(onInvoicePaid).toHaveBeenCalledWith("inv-1", 400, true);
  });
});
