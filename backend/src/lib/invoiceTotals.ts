/**
 * What a load has actually been billed.
 *
 * Extracted from accountingController rather than written fresh. There were
 * already two spellings of "which invoices count" in this codebase — the
 * accounting summary excludes DRAFT on the grounds that a draft has been issued
 * to nobody, while invoiceService's base lookups filter only `status not VOID`
 * and therefore count drafts. A third definition would have made the loads
 * board disagree with the accounting page about the same load, and the next
 * reader would have found whichever one they looked at first and believed it.
 *
 * DRAFT IS EXCLUDED. `autoGenerateInvoice` creates invoices as DRAFT, so a
 * freshly-invoiced load reports null here and the board keeps showing the
 * customer rate until the invoice is actually issued. That is the honest
 * answer: what the customer has been billed is not what we intend to bill them.
 */
import { prisma } from "../config/database";

/**
 * Statuses that mean an invoice has been issued to a customer.
 *
 * Mirrors accountingController's REVENUE_STATUSES exactly. If one moves, the
 * other must — a test pins them together for that reason.
 */
export const BILLED_STATUSES = [
  "SUBMITTED", "SENT", "PARTIAL", "UNDER_REVIEW",
  "APPROVED", "FUNDED", "PAID", "OVERDUE",
] as const;

export type InvoiceMoneyRow = { amount: number | null; totalAmount: number | null };

/** totalAmount is the itemised total; amount is always populated. */
export function invoiceValue(i: InvoiceMoneyRow): number {
  return i.totalAmount ?? i.amount ?? 0;
}

/**
 * Billed total per load, for a batch of loads.
 *
 * Returns a Map that OMITS loads with no qualifying invoice. Absent is not
 * zero, and the distinction is load-bearing: `customerBilled()` on the frontend
 * prefers `invoicedTotal` whenever it is not null, so emitting 0 for an
 * un-invoiced load would replace the customer rate with $0 on every row of the
 * board. A missing key falls through to customerRate; a 0 does not.
 *
 * Summed PER ROW rather than with two `_sum` aggregates. `totalAmount ?? amount`
 * is a per-row choice, and two column sums cannot express it once a load mixes
 * rows that carry totalAmount with rows that do not — which is exactly what a
 * base invoice created before the itemised-total era plus a modern SUPPLEMENTAL
 * looks like. A load can hold several invoices: `Invoice.loadId` is not unique,
 * and a supplemental carries only the accessorial delta while the base keeps
 * its own figure, so the billed total is their SUM.
 */
export async function invoicedTotalsForLoads(loadIds: string[]): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  if (loadIds.length === 0) return totals;

  const rows = await prisma.invoice.findMany({
    where: {
      loadId: { in: loadIds },
      status: { in: [...BILLED_STATUSES] },
      deletedAt: null,
    },
    select: { loadId: true, amount: true, totalAmount: true },
  });

  for (const r of rows) {
    totals.set(r.loadId, (totals.get(r.loadId) ?? 0) + invoiceValue(r));
  }
  return totals;
}
