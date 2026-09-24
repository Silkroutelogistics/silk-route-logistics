// Two helpers, and after §21.2 ruling 3 they serve two DIFFERENT populations.
//
//   nextSequentialInvoiceNumber — the RETIRED INV-<n> sequence, which now issues
//     to one case only: an invoice with no load, and therefore no stem to take.
//     Its legacy-date guard is still load-bearing and is still locked here.
//
//   createInvoiceWithRetry — a load-backed invoice MIRRORS the load's document
//     number; a load-less one allocates and retries.
//
// The three createInvoiceWithRetry cases below were written for the old
// single-argument contract and went red on the signature change. They are
// RE-AIMED rather than deleted: every one of them describes the load-LESS path,
// which is unchanged, so passing `null` restores their original meaning and they
// go on guarding the retry behaviour that the fire-and-forget auto-invoice
// callers depend on (§13.3 Item 244.2 — a superseded test is re-aimed, because
// deleting it destroys the only evidence that the surviving path still works).
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

describe("createInvoiceWithRetry — a load-LESS invoice still allocates and retries", () => {
  beforeEach(() => {
    (mockPrisma.invoice.findMany as any).mockResolvedValue([{ invoiceNumber: "INV-1042" }]);
  });

  it("calls build once and returns its result on success", async () => {
    const build = vi.fn().mockResolvedValue({ id: "inv-1" });
    const result = await createInvoiceWithRetry(null, build);
    expect(result).toEqual({ id: "inv-1" });
    expect(build).toHaveBeenCalledTimes(1);
    expect(build).toHaveBeenCalledWith("INV-1043");
  });

  it("retries with a fresh number on a P2002 unique collision", async () => {
    const build = vi
      .fn()
      .mockRejectedValueOnce({ code: "P2002" })
      .mockResolvedValueOnce({ id: "inv-2" });
    const result = await createInvoiceWithRetry(null, build);
    expect(result).toEqual({ id: "inv-2" });
    expect(build).toHaveBeenCalledTimes(2);
  });

  it("rethrows a non-P2002 error immediately (no retry)", async () => {
    const build = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(createInvoiceWithRetry(null, build)).rejects.toThrow("boom");
    expect(build).toHaveBeenCalledTimes(1);
  });
});

describe("createInvoiceWithRetry — a load-BACKED invoice mirrors the load's number", () => {
  it("uses the document number verbatim", async () => {
    // The whole of ruling 3 at one call site: the invoice a customer receives on
    // load 5001 is numbered 5001, the same string as its BOL and its rate
    // confirmation, so quoting one number names all of them.
    const build = vi.fn().mockResolvedValue({ id: "inv-3" });
    const result = await createInvoiceWithRetry("5001", build);
    expect(result).toEqual({ id: "inv-3" });
    expect(build).toHaveBeenCalledWith("5001");
  });

  it("never touches the INV- sequence", async () => {
    // The half that would otherwise go unnoticed: allocating an INV- number and
    // then overwriting it with the mirror would LOOK identical from the outside
    // while still burning a sequence number on every load-backed invoice, so the
    // retired sequence would keep climbing and the next load-less invoice would
    // land wherever the load-backed traffic had pushed it.
    const build = vi.fn().mockResolvedValue({ id: "inv-4" });
    await createInvoiceWithRetry("5001", build);
    expect(mockPrisma.invoice.findMany).not.toHaveBeenCalled();
  });

  it("carries a revision through untouched", async () => {
    // withDocumentNumber is what hands this 5001-2 when 5001 is taken; this
    // function must not second-guess it.
    const build = vi.fn().mockResolvedValue({ id: "inv-5" });
    await createInvoiceWithRetry("5001-2", build);
    expect(build).toHaveBeenCalledWith("5001-2");
  });

  it("still mirrors a LEGACY suffixed number, so old loads keep their scheme", async () => {
    const build = vi.fn().mockResolvedValue({ id: "inv-6" });
    await createInvoiceWithRetry("SRL-121485I", build);
    expect(build).toHaveBeenCalledWith("SRL-121485I");
  });

  it("does NOT retry a P2002 on a mirrored number — it throws at once", async () => {
    // This is what the short-circuit is FOR. The number is derived from the load
    // rather than allocated by scanning, so a P2002 does not mean "somebody took
    // this number, take the next one" — it means an invoice already carries this
    // load's document number, which is a real error. Retrying would recompute
    // the identical string six times and rethrow the same error six attempts
    // later, hiding the cause behind a delay.
    const build = vi.fn().mockRejectedValue({ code: "P2002" });
    await expect(createInvoiceWithRetry("5001", build)).rejects.toMatchObject({ code: "P2002" });
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("treats an empty stem as load-less rather than numbering an invoice ''", async () => {
    // resolveLoadStem returns null for a blank, but a caller reading a column
    // directly could hand this "". Falling through to the sequence is the safe
    // direction; mirroring would write an empty invoice number.
    (mockPrisma.invoice.findMany as any).mockResolvedValue([{ invoiceNumber: "INV-1042" }]);
    const build = vi.fn().mockResolvedValue({ id: "inv-7" });
    await createInvoiceWithRetry("", build);
    expect(build).toHaveBeenCalledWith("INV-1043");
  });
});
