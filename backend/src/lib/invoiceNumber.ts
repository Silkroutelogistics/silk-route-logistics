import { prisma } from "../config/database";

/**
 * Next invoice number in the RETIRED INV-<n> sequential format.
 *
 * §21.2 ruling 3 (2026-09-24): INV-#### is no longer issued to a load-backed
 * invoice. That invoice carries the bare load number, the same number as its
 * BOL, its rate confirmation and its CarrierPay, and `invoiceNumber` mirrors
 * `srlDocNumber` so a customer quoting 5001 names the load and the invoice at
 * once. The sequence survives for ONE case and is not deleted: an invoice with
 * no load has no stem to take, and refusing to bill over a missing internal
 * reference would be the wrong failure.
 *
 * LEGACY INV- NUMBERS ARE NEVER REWRITTEN. They are what a customer has in
 * their accounts-payable system and on the remittance advice they already sent;
 * search resolves them, and the column keeps them.
 *
 * go-live audit: robust against legacy date-format numbers (INV-YYYYMMDD-XXXX,
 * produced by accountingController.createInvoice). Those are IGNORED when
 * computing the max, so parseInt can't jump the sequence to INV-20260707 the way
 * `parseInt("20260706-0001")` did. The two formats coexist without polluting each
 * other's sequence.
 *
 * Not collision-proof on its own (two callers can read the same max) — pair it
 * with createInvoiceWithRetry so a concurrent duplicate retries with a fresh
 * number instead of throwing a P2002 that a fire-and-forget caller would swallow,
 * silently dropping the invoice.
 */
export async function nextSequentialInvoiceNumber(client: any = prisma): Promise<string> {
  const recent = await client.invoice.findMany({
    where: { invoiceNumber: { startsWith: "INV-" } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { invoiceNumber: true },
  });
  let max = 1000;
  for (const r of recent || []) {
    const tail = String(r?.invoiceNumber ?? "").slice(4); // after "INV-"
    if (/^\d+$/.test(tail)) {
      const n = parseInt(tail, 10);
      if (n > max) max = n;
    }
  }
  return `INV-${max + 1}`;
}

/**
 * Allocate a unique invoice number and run `build(invoiceNumber)`, retrying on a
 * Prisma unique-constraint violation (P2002) with a freshly-computed number.
 * Use for every Invoice create so a concurrent collision retries instead of
 * being lost (the POD-upload / delivery auto-invoice callers are fire-and-forget
 * and would otherwise swallow the P2002 and leave the load with no invoice).
 */
export async function createInvoiceWithRetry<T>(
  srlDocNumber: string | null,
  build: (invoiceNumber: string) => Promise<T>,
  attempts = 6,
): Promise<T> {
  // §21.2 ruling 3 — a load-backed invoice MIRRORS its document number, and
  // there is nothing here to retry. The number is DERIVED from the load rather
  // than allocated by scanning, so a P2002 on it does not mean "somebody took
  // this number, take the next one" — it means an invoice already carries this
  // load's document number, which is a real error. Retrying would recompute the
  // same string six times and rethrow the same error six attempts later, which
  // is strictly worse than failing at once: it hides the cause behind a delay.
  //
  // The revision case is already handled upstream by withDocumentNumber, which
  // is what hands this function 5001-2 when 5001 is taken.
  if (srlDocNumber) return build(srlDocNumber);

  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    const invoiceNumber = await nextSequentialInvoiceNumber();
    try {
      return await build(invoiceNumber);
    } catch (e: any) {
      lastErr = e;
      if (e?.code === "P2002" && i < attempts - 1) continue; // duplicate number — retry
      throw e;
    }
  }
  throw lastErr ?? new Error("Failed to allocate a unique invoice number");
}
