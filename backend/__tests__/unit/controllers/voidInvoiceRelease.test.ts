/** v3.8.ash — voiding an invoice must RELEASE the accessorials it had billed.
 *
 *  `shipperInvoiceId` is the stamp meaning "this charge is on a customer
 *  document". unbilledCustomerAccessorials selects on `shipperInvoiceId: null`,
 *  so a row still pointing at a voided invoice is invisible to every later
 *  billing pass: the detention was approved, billed once onto a document that no
 *  longer exists, and could never be billed again.
 *
 *  Silent revenue loss with no error and no screen showing it — the only trace
 *  was a row nobody queries.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma, tx } = vi.hoisted(() => {
  const tx = {
    invoice: { update: vi.fn() },
    loadAccessorial: { updateMany: vi.fn() },
  };
  return {
    tx,
    mockPrisma: {
      invoice: { findUnique: vi.fn(), update: vi.fn() },
      $transaction: vi.fn(async (fn: any) => fn(tx)),
    },
  };
});

vi.mock("../../../src/config/database", () => ({ prisma: mockPrisma }));
vi.mock("../../../src/lib/logger", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { voidInvoice } from "../../../src/controllers/accountingController";

const INVOICE_ID = "inv-1";

function res() {
  const r: any = {};
  r.status = vi.fn(() => r);
  r.json = vi.fn(() => r);
  return r;
}

function arrange(status = "SENT", releasedCount = 2) {
  mockPrisma.invoice.findUnique.mockResolvedValue({
    id: INVOICE_ID, status, invoiceNumber: "INV-1001", notes: null,
  });
  tx.invoice.update.mockResolvedValue({ id: INVOICE_ID, status: "VOID", invoiceNumber: "INV-1001" });
  tx.loadAccessorial.updateMany.mockResolvedValue({ count: releasedCount });
}

beforeEach(() => vi.clearAllMocks());

describe("voidInvoice releases its accessorials", () => {
  it("clears the stamp on every accessorial the voided invoice had billed", async () => {
    arrange();
    const r = res();
    await voidInvoice({ params: { id: INVOICE_ID }, body: {}, user: { id: "u1" } } as any, r);

    expect(tx.loadAccessorial.updateMany).toHaveBeenCalledWith({
      where: { shipperInvoiceId: INVOICE_ID },
      data: { shipperInvoiceId: null },
    });
  });

  it("releases in the SAME transaction as the void", async () => {
    // A void that half-happened would leave charges stranded against an invoice
    // already marked dead — precisely the state this fix exists to prevent.
    arrange();
    await voidInvoice({ params: { id: INVOICE_ID }, body: {}, user: { id: "u1" } } as any, res());

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    // Both writes went to the transaction client, not the global one.
    expect(tx.invoice.update).toHaveBeenCalled();
    expect(mockPrisma.invoice.update).not.toHaveBeenCalled();
  });

  it("tells the caller how many charges came back into play", async () => {
    arrange("SENT", 3);
    const r = res();
    await voidInvoice({ params: { id: INVOICE_ID }, body: {}, user: { id: "u1" } } as any, r);

    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ accessorialsReleased: 3 }));
  });

  it("does not release anything when the void is refused", async () => {
    // A paid invoice cannot be voided — and must not have its charges unstamped,
    // which would re-bill a customer who has already paid them.
    arrange("PAID");
    const r = res();
    await voidInvoice({ params: { id: INVOICE_ID }, body: {}, user: { id: "u1" } } as any, r);

    expect(r.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(tx.loadAccessorial.updateMany).not.toHaveBeenCalled();
  });

  it("refuses to void an already-voided invoice rather than releasing twice", async () => {
    arrange("VOID");
    const r = res();
    await voidInvoice({ params: { id: INVOICE_ID }, body: {}, user: { id: "u1" } } as any, r);

    expect(r.status).toHaveBeenCalledWith(400);
    expect(tx.loadAccessorial.updateMany).not.toHaveBeenCalled();
  });

  it("handles a void with nothing to release", async () => {
    arrange("SENT", 0);
    const r = res();
    await voidInvoice({ params: { id: INVOICE_ID }, body: {}, user: { id: "u1" } } as any, r);

    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ accessorialsReleased: 0 }));
  });
});
