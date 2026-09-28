// What is still owed on an invoice, in the one form every surface shows.
//
// The invoice's total (totalAmount, or amount on rows from before the itemised
// total) less what has been paid, never below zero. It is the same arithmetic
// payment posting settles on: a payment that brings paidAmount up to the total
// makes the invoice PAID. A partly paid invoice that has turned OVERDUE shows
// this balance (ruling 2026-09-27, 2), since its status no longer says PARTIAL.

export interface InvoiceMoney {
  amount?: number | null;
  totalAmount?: number | null;
  paidAmount?: number | null;
}

/** The invoice total less what has been paid, in cents, never below zero. */
export function invoiceBalance(inv: InvoiceMoney): number {
  const total = inv.totalAmount ?? inv.amount ?? 0;
  return Math.max(0, Math.round((total - (inv.paidAmount ?? 0)) * 100) / 100);
}
