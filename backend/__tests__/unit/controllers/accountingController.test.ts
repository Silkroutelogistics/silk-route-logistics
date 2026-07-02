// Money-ledger coverage for accountingController.markInvoicePaid — the shipper
// AR "record payment received" path. Locks the go-live audit R1/R2/R3 fixes:
//   R1 accumulate partials (never clobber paidAmount)
//   R2 atomic conditional write (a concurrent full-pay can't double-credit the
//      factoring fund — the loser matches zero rows -> 409, onInvoicePaid skipped)
//   R3 reject non-positive amounts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";

// onInvoicePaid is dynamically imported inside markInvoicePaid — mock the module.
const onInvoicePaid = vi.fn().mockResolvedValue(undefined);
vi.mock("../../../src/services/integrationService", () => ({ onInvoicePaid }));

import { markInvoicePaid } from "../../../src/controllers/accountingController";

const mockPrisma = vi.mocked(prisma, true);

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function makeInvoice(overrides: Record<string, any> = {}) {
  return { id: "inv-1", status: "SUBMITTED", amount: 1000, totalAmount: null, paidAmount: null, loadId: "load-1", ...overrides };
}

function lastUpdateManyData() {
  return (mockPrisma.invoice.updateMany as any).mock.calls[0][0].data;
}

beforeEach(() => {
  vi.clearAllMocks();
  (mockPrisma.invoice.updateMany as any).mockResolvedValue({ count: 1 });
  // load-completion branch: load at INVOICED so the (benign) COMPLETED flip runs.
  (mockPrisma.load.findUnique as any).mockResolvedValue({ status: "INVOICED", referenceNumber: "SRL-1" });
  (mockPrisma.load.updateMany as any).mockResolvedValue({ count: 1 });
});

describe("markInvoicePaid — payment ledger (go-live audit R1/R2/R3)", () => {
  it("full payment flips to PAID and credits the fund once", async () => {
    (mockPrisma.invoice.findUnique as any)
      .mockResolvedValueOnce(makeInvoice()) // existing lookup
      .mockResolvedValueOnce(makeInvoice({ status: "PAID", paidAmount: 1000 })); // re-fetch
    const res = mockRes();

    await markInvoicePaid({ params: { id: "inv-1" }, body: {} } as any, res); // no paidAmount -> full

    const data = lastUpdateManyData();
    expect(data.status).toBe("PAID");
    expect(data.paidAmount).toBe(1000);
    expect(onInvoicePaid).toHaveBeenCalledWith("inv-1", 1000);
    expect(res.status).not.toHaveBeenCalledWith(400);
  });

  it("R1: accumulates a second payment instead of clobbering ($600 then $400 -> PAID @ 1000)", async () => {
    (mockPrisma.invoice.findUnique as any)
      .mockResolvedValueOnce(makeInvoice({ status: "PARTIAL", paidAmount: 600 })) // already 600 paid
      .mockResolvedValueOnce(makeInvoice({ status: "PAID", paidAmount: 1000 }));
    const res = mockRes();

    await markInvoicePaid({ params: { id: "inv-1" }, body: { paidAmount: 400 } } as any, res);

    const data = lastUpdateManyData();
    expect(data.paidAmount).toBe(1000); // 600 prior + 400 now — NOT overwritten to 400
    expect(data.status).toBe("PAID");
  });

  it("keeps status PARTIAL when the cumulative amount is still below total", async () => {
    (mockPrisma.invoice.findUnique as any)
      .mockResolvedValueOnce(makeInvoice()) // prior 0
      .mockResolvedValueOnce(makeInvoice({ status: "PARTIAL", paidAmount: 300 }));
    const res = mockRes();

    await markInvoicePaid({ params: { id: "inv-1" }, body: { paidAmount: 300 } } as any, res);

    const data = lastUpdateManyData();
    expect(data.status).toBe("PARTIAL");
    expect(data.paidAmount).toBe(300);
    // willBePaid is false -> load-completion branch skipped
    expect(mockPrisma.load.findUnique).not.toHaveBeenCalled();
  });

  it("R3: rejects a non-positive amount with 400 and records nothing", async () => {
    (mockPrisma.invoice.findUnique as any).mockResolvedValueOnce(makeInvoice());
    const res = mockRes();

    await markInvoicePaid({ params: { id: "inv-1" }, body: { paidAmount: -50 } } as any, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.invoice.updateMany).not.toHaveBeenCalled();
    expect(onInvoicePaid).not.toHaveBeenCalled();
  });

  it("R2: a concurrently-settled invoice matches zero rows -> 409, fund NOT credited again", async () => {
    (mockPrisma.invoice.findUnique as any).mockResolvedValueOnce(makeInvoice());
    (mockPrisma.invoice.updateMany as any).mockResolvedValue({ count: 0 }); // someone else already paid
    const res = mockRes();

    await markInvoicePaid({ params: { id: "inv-1" }, body: {} } as any, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(onInvoicePaid).not.toHaveBeenCalled();
  });

  it("returns 404 when the invoice does not exist", async () => {
    (mockPrisma.invoice.findUnique as any).mockResolvedValueOnce(null);
    const res = mockRes();

    await markInvoicePaid({ params: { id: "missing" }, body: {} } as any, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockPrisma.invoice.updateMany).not.toHaveBeenCalled();
  });
});
