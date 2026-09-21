/**
 * Does a customer invoice agree with the accessorial ledger, line by line?
 *
 * §13.3 Item 282b. The customer leg reaches exactly-once by MARKING ledger rows
 * (`LoadAccessorial.shipperInvoiceId`); the carrier leg reconciles totals. The
 * marking design has a blind spot: once a row is stamped onto a draft, the
 * sync never reads it again, so an amount edit on that row reaches the carrier
 * payable and not the customer line. This module is the read that closes the
 * blind spot — given an invoice's lines and the load's ledger, it says which
 * lines bill a figure the ledger no longer holds, by how much, and which line
 * to move. It decides nothing about SENT invoices and writes nothing at all;
 * the caller (282c, `repriceDraftInvoices`) owns both.
 *
 * PURE. No Prisma, no clock, no pricing — the caller resolves each row's
 * customer price through `customerPriceFor` and hands it in, so this function
 * cannot disagree with the pricer and can be tested to the cent without a
 * database. Deterministic output order (by line sortOrder) so a report is
 * diff-able run to run.
 *
 * WHAT "BILLED" MEANS HERE. A row may have several lines on one invoice — its
 * charge, a credit that took it off, a second charge after re-approval — so the
 * figure compared is the NET of every line carrying its id, not the last line.
 * A row that was credited back to zero and re-approved therefore reads as
 * agreeing at its new charge, which is what happened.
 *
 * Money vocabulary matches the 282 production census: `netDelta` positive means
 * the customer is UNDER-billed relative to the ledger; `grossDelta` is the sum
 * of absolute movements.
 */

/** The ledger row as the diff needs it. `customerPrice` is already resolved. */
export interface LedgerRowView {
  id: string;
  type: string;
  status: string;
  /** Who the row is billed to; null means the customer (matches unbilledCustomerAccessorials). */
  billedTo: string | null;
  /** The invoice this row is stamped to, if any. */
  shipperInvoiceId: string | null;
  /** What the customer should be billed for it today (customerPriceFor). */
  customerPrice: number;
}

/** An invoice line as the diff needs it. */
export interface InvoiceLineView {
  id: string;
  accessorialId: string | null;
  type: string;
  amount: number;
  sortOrder: number;
}

/** A stamped row whose net billed figure no longer matches its customer price. */
export interface Reprice {
  accessorialId: string;
  type: string;
  /** The line the delta is applied to: the latest positive line, else the latest line. */
  lineId: string;
  /** What that one line reads today. */
  lineAmount: number;
  /** Net of every line on this invoice carrying the row's id. */
  billed: number;
  /** The row's customer price today. */
  expected: number;
  /** expected − billed. Positive: the customer is under-billed. */
  delta: number;
}

export type Anomaly =
  /** An accessorial-typed line with no row id — written before 282a, or by an API line editor that carries none; cannot be re-priced by key. */
  | { kind: "UNKEYED_LINE"; lineId: string; type: string; amount: number }
  /** A line keyed to a row that no longer exists, billing a non-zero net. */
  | { kind: "ORPHAN_LINE"; accessorialId: string; net: number }
  /** Lines bill a non-zero net for a row that is NOT stamped to this invoice — the mark and the lines disagree. */
  | { kind: "NET_ON_UNSTAMPED_ROW"; accessorialId: string; net: number; stampedTo: string | null }
  /** A row stamped to this invoice with no line at all — stamped before 282a, the lines replaced by an API line editor, or the fold half-failed. */
  | { kind: "STAMPED_NO_LINE"; accessorialId: string; expected: number }
  /** A row stamped here that is not APPROVED. The credit path owns it; not re-priced. */
  | { kind: "STAMPED_NOT_APPROVED"; accessorialId: string; status: string }
  /** A row stamped here that is billed to someone other than the customer. Not re-priced. */
  | { kind: "STAMPED_NOT_CUSTOMER"; accessorialId: string; billedTo: string };

export interface InvoiceLedgerDiff {
  invoiceId: string;
  reprice: Reprice[];
  anomalies: Anomaly[];
  /** Σ delta over `reprice`. Positive: the customer is under-billed. */
  netDelta: number;
  /** Σ |delta| over `reprice`. */
  grossDelta: number;
  /** No re-price and no anomaly. */
  agrees: boolean;
}

/** Line types that come from the load, not the ledger. A NULL key on these is correct. */
const LOAD_LINE_TYPES = new Set(["LINEHAUL", "FUEL_SURCHARGE"]);

const round2 = (n: number) => Math.round(n * 100) / 100;
const isCustomer = (billedTo: string | null) => !billedTo || String(billedTo).toUpperCase() === "SHIPPER";

export function diffInvoiceAgainstLedger(
  invoiceId: string,
  lines: InvoiceLineView[],
  ledger: LedgerRowView[],
): InvoiceLedgerDiff {
  const anomalies: Anomaly[] = [];
  const reprice: Reprice[] = [];

  const rowsById = new Map(ledger.map((r) => [r.id, r]));
  const linesByRow = new Map<string, InvoiceLineView[]>();
  const ordered = [...lines].sort((a, b) => a.sortOrder - b.sortOrder);

  for (const line of ordered) {
    if (line.accessorialId == null) {
      if (!LOAD_LINE_TYPES.has(String(line.type).toUpperCase())) {
        anomalies.push({ kind: "UNKEYED_LINE", lineId: line.id, type: line.type, amount: round2(line.amount) });
      }
      continue;
    }
    const list = linesByRow.get(line.accessorialId) ?? [];
    list.push(line);
    linesByRow.set(line.accessorialId, list);
  }

  // Lines keyed to rows: the row is either stamped here (compare), stamped
  // elsewhere or nowhere (the net here must be zero), or gone (orphan).
  for (const [accessorialId, rowLines] of linesByRow) {
    const net = round2(rowLines.reduce((s, l) => s + l.amount, 0));
    const row = rowsById.get(accessorialId);
    if (!row) {
      if (net !== 0) anomalies.push({ kind: "ORPHAN_LINE", accessorialId, net });
      continue;
    }
    if (row.shipperInvoiceId !== invoiceId) {
      if (net !== 0) anomalies.push({ kind: "NET_ON_UNSTAMPED_ROW", accessorialId, net, stampedTo: row.shipperInvoiceId });
      continue;
    }
    if (String(row.status).toUpperCase() !== "APPROVED") {
      anomalies.push({ kind: "STAMPED_NOT_APPROVED", accessorialId, status: row.status });
      continue;
    }
    if (!isCustomer(row.billedTo)) {
      anomalies.push({ kind: "STAMPED_NOT_CUSTOMER", accessorialId, billedTo: String(row.billedTo) });
      continue;
    }
    const expected = round2(row.customerPrice);
    const delta = round2(expected - net);
    if (Math.abs(delta) < 0.005) continue;
    // Move the latest positive line, so a credit that was folded in keeps its
    // own figure and its own reason; fall back to the latest line of any sign.
    const positives = rowLines.filter((l) => l.amount > 0);
    const target = (positives.length ? positives : rowLines).at(-1)!;
    reprice.push({
      accessorialId, type: row.type, lineId: target.id, lineAmount: round2(target.amount),
      billed: net, expected, delta,
    });
  }

  // Rows stamped here that no line carries.
  for (const row of ledger) {
    if (row.shipperInvoiceId === invoiceId && !linesByRow.has(row.id)) {
      anomalies.push({ kind: "STAMPED_NO_LINE", accessorialId: row.id, expected: round2(row.customerPrice) });
    }
  }

  const netDelta = round2(reprice.reduce((s, r) => s + r.delta, 0));
  const grossDelta = round2(reprice.reduce((s, r) => s + Math.abs(r.delta), 0));
  return { invoiceId, reprice, anomalies, netDelta, grossDelta, agrees: reprice.length === 0 && anomalies.length === 0 };
}
