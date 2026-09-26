/**
 * Send lock for the four BKN invoices SRL delivered by hand through Tipalti on
 * 2026-09-25 (121492I, 121494I, 121495I, 121496I). Until production records those
 * deliveries, three are DRAFTs and SRL-121492 has no invoice, so either email path
 * would bill the customer a second time. Both refuse these four loads.
 *
 * Lifted once RECONCILE step 3c marks them SENT via TIPALTI: from then on the
 * duplicate guard covers them (sendInvoice refuses a non-DRAFT, and
 * generateInvoiceFromLoad refuses a load that already has an invoice). Keyed on the
 * load number's digits, not row ids, so it reads the same in every environment.
 */
const LOCKED_LOAD_DIGITS: ReadonlySet<string> = new Set(["121492", "121494", "121495", "121496"]);

export const INVOICE_SEND_LOCKED = "INVOICE_SEND_LOCKED";

/** True for a locked load in either spelling: `SRL-121494` or `121494`. */
export function isInvoiceSendLocked(loadNumber: string | null | undefined): boolean {
  const m = /^(?:SRL-)?(\d+)$/.exec((loadNumber ?? "").trim());
  return m !== null && LOCKED_LOAD_DIGITS.has(m[1]);
}

export function sendLockedMessage(loadNumber: string): string {
  return (
    `Invoice email is locked for load ${loadNumber}. Its invoice was delivered through Tipalti on ` +
    `2026-09-25, outside the platform, so emailing it would bill the customer twice. Record the ` +
    `delivery with mark-sent instead.`
  );
}
