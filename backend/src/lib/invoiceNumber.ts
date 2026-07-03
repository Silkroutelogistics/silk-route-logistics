import { prisma } from "../config/database";

/**
 * Next invoice number in the canonical INV-<n> sequential format.
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
  build: (invoiceNumber: string) => Promise<T>,
  attempts = 6,
): Promise<T> {
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
