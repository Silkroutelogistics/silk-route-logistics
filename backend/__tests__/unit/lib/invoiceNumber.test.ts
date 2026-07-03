// go-live audit: lock the two behaviors of the invoice-number helper —
//   (a) nextSequentialInvoiceNumber ignores legacy date-format numbers
//       (INV-YYYYMMDD-XXXX) so parseInt can't jump the sequence, and
//   (b) createInvoiceWithRetry retries on a P2002 unique collision (so a
//       concurrent duplicate isn't silently lost) but rethrows other errors.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";
import { nextSequentialInvoiceNumber, createInvoiceWithRetry } from "../../../src/lib/invoiceNumber";

const mockPrisma = vi.mocked(prisma, true);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("nextSequentialInvoiceNumber", () => {
  it("returns INV-1001 when there are no prior invoices", async () => {
    (mockPrisma.invoice.findMany as any).mockResolvedValue([]);
    expect(await nextSequentialInvoiceNumber()).toBe("INV-1001");
  });

  it("increments from the max sequential number", async () => {
    (mockPrisma.invoice.findMany as any).mockResolvedValue([{ invoiceNumber: "INV-1042" }, { invoiceNumber: "INV-1041" }]);
    expect(await nextSequentialInvoiceNumber()).toBe("INV-1043");
  });

  it("IGNORES legacy date-format numbers so the sequence doesn't jump", async () => {
    // Without the guard, parseInt("20260706-0001") = 20260706 -> INV-20260707.
    (mockPrisma.invoice.findMany as any).mockResolvedValue([
      { invoiceNumber: "INV-20260706-0001" },
      { invoiceNumber: "INV-1042" },
    ]);
    expect(await nextSequentialInvoiceNumber()).toBe("INV-1043");
  });
});

describe("createInvoiceWithRetry", () => {
  beforeEach(() => {
    (mockPrisma.invoice.findMany as any).mockResolvedValue([{ invoiceNumber: "INV-1042" }]);
  });

  it("calls build once and returns its result on success", async () => {
    const build = vi.fn().mockResolvedValue({ id: "inv-1" });
    const result = await createInvoiceWithRetry(build);
    expect(result).toEqual({ id: "inv-1" });
    expect(build).toHaveBeenCalledTimes(1);
    expect(build).toHaveBeenCalledWith("INV-1043");
  });

  it("retries with a fresh number on a P2002 unique collision", async () => {
    const build = vi
      .fn()
      .mockRejectedValueOnce({ code: "P2002" })
      .mockResolvedValueOnce({ id: "inv-2" });
    const result = await createInvoiceWithRetry(build);
    expect(result).toEqual({ id: "inv-2" });
    expect(build).toHaveBeenCalledTimes(2);
  });

  it("rethrows a non-P2002 error immediately (no retry)", async () => {
    const build = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(createInvoiceWithRetry(build)).rejects.toThrow("boom");
    expect(build).toHaveBeenCalledTimes(1);
  });
});
