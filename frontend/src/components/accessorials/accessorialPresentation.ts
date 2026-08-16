/**
 * How the console reads an accessorial line.
 *
 * Every rule here is a mirror of a backend rule, and the backend file is named
 * beside each one. Nothing in this module decides anything — it restates what
 * the money paths already do so an operator sees the same arithmetic the
 * settlement and the invoice will run. A screen that computes its own answer is
 * worse than no screen, because the operator will quote it to a carrier.
 */

export type AccessorialStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface AccessorialRow {
  id: string;
  type: string;
  amount: number | string;
  quantity?: number | string | null;
  unit?: string | null;
  rate?: number | string | null;
  status: AccessorialStatus | string;
  notes?: string | null;
  billedTo?: string | null;
  createdBy?: string | null;
  createdAt?: string | null;
  approvedAt?: string | null;
  rejectedReason?: string | null;
  shipperInvoiceId?: string | null;
  stop?: {
    stopNumber?: number | null;
    stopType?: string | null;
    facilityName?: string | null;
    city?: string | null;
    state?: string | null;
  } | null;
}

/** Mirrors ACCESSORIAL_PRESENTATION in backend/src/services/invoiceService.ts. */
const LABELS: Record<string, string> = {
  DETENTION_PU: "Detention (pickup)",
  DETENTION_DEL: "Detention (delivery)",
  LUMPER: "Lumper",
  TONU: "TONU",
  LAYOVER: "Layover",
  DEADHEAD: "Deadhead",
  DRIVER_ASSIST: "Driver assist",
  REEFER_FUEL: "Reefer fuel",
  HAZMAT: "Hazmat",
  INSIDE_DELIVERY: "Inside delivery",
  LIFTGATE: "Liftgate",
  PALLET_EXCHANGE: "Pallet exchange",
};

export function accessorialLabel(type: string): string {
  return LABELS[type] ?? String(type).replace(/_/g, " ").toLowerCase();
}

/**
 * Mirrors isAtCostReimbursement in backend/src/services/integrationService.ts.
 *
 * Money the carrier fronted and SRL repays at cost, rather than money the
 * carrier earned. The Quick Pay fee is never charged on it. Deliberately narrow
 * on both sides: a line this does not recognise stays in the fee base, which
 * costs SRL margin rather than skimming a carrier.
 */
export function isAtCostReimbursement(row: { type?: string | null; notes?: string | null }): boolean {
  const text = `${row?.type ?? ""} ${row?.notes ?? ""}`.toLowerCase();
  return /\blumper\b|\breimburse/.test(text);
}

/**
 * Mirrors the billedTo filter in unbilledCustomerAccessorials
 * (backend/src/services/invoiceService.ts).
 *
 * `billedTo` is NOT a router that sends a line to one side or the other. The
 * carrier is owed every approved line; this decides only whether the SAME line
 * also passes through to the customer. Null bills through, because at-cost
 * pass-through is the ratified default and silently eating a lumper would be
 * the wrong failure.
 */
export function billsToCustomer(row: { billedTo?: string | null }): boolean {
  const b = row?.billedTo;
  return !b || String(b).toUpperCase() === "SHIPPER";
}

export const isApproved = (row: { status: string }) => String(row.status).toUpperCase() === "APPROVED";
export const isPending = (row: { status: string }) => String(row.status).toUpperCase() === "PENDING";
export const isRejected = (row: { status: string }) => String(row.status).toUpperCase() === "REJECTED";

/** A system-written row carries a null createdBy. Every manual line records its author. */
export const isSystemWritten = (row: { createdBy?: string | null }) => !row?.createdBy;

export const num = (v: number | string | null | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const money = (n: number): string =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2 });

/**
 * How the amount was arrived at, in the operator's units.
 *
 * applyStopDwellCharges stores detention as billable MINUTES so the ledger can
 * round the same way the reconciler does. Minutes are the wrong unit to hand a
 * dispatcher who is about to defend the number to a carrier, so detention is
 * shown in hours with the minutes kept beside it. Returns null when the row
 * carries no basis, which is every hand-entered flat charge.
 */
export function computationBasis(row: AccessorialRow): string | null {
  const qty = row.quantity == null ? null : num(row.quantity);
  const rate = row.rate == null ? null : num(row.rate);
  const unit = (row.unit ?? "").toLowerCase();

  if (qty === null || !qty) return null;

  if (unit === "minutes") {
    const hours = qty / 60;
    const hoursLabel = Number.isInteger(hours) ? `${hours}` : hours.toFixed(2).replace(/0$/, "");
    return rate
      ? `${hoursLabel} h billable (${qty} min) at ${money(rate)}/hr`
      : `${hoursLabel} h billable (${qty} min)`;
  }
  if (unit === "days") {
    return rate
      ? `${qty} day${qty === 1 ? "" : "s"} at ${money(rate)}/day`
      : `${qty} day${qty === 1 ? "" : "s"}`;
  }
  if (rate) return `${qty} ${unit || "×"} at ${money(rate)}`;
  return `${qty} ${unit || ""}`.trim();
}

/** "Stop 2 · Acme Cold, Kalamazoo MI" — where the charge happened. */
export function stopLabel(row: AccessorialRow): string | null {
  const s = row.stop;
  if (!s) return null;
  const where = [s.facilityName, [s.city, s.state].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const n = s.stopNumber != null ? `Stop ${s.stopNumber}` : null;
  return [n, where].filter(Boolean).join(" · ") || null;
}

/**
 * The two money columns, computed the way the two backend paths compute them.
 *
 *   carrier  — carrierAccessorialsForLoad: EVERY approved line, whatever its
 *              billedTo. reimbursements is the at-cost subset, which is paid in
 *              full but held out of the Quick Pay fee base.
 *   customer — unbilledCustomerAccessorials: approved lines that bill through.
 *
 * The same line appears in both. That is the at-cost pass-through working, not
 * double counting: SRL pays the carrier and bills the customer the identical
 * figure, and takes no margin on it.
 */
export function splitAccessorials(rows: AccessorialRow[]) {
  const approved = rows.filter(isApproved);
  const carrierLines = approved;
  const customerLines = approved.filter(billsToCustomer);

  const sum = (ls: AccessorialRow[]) =>
    Math.round(ls.reduce((s, l) => s + num(l.amount), 0) * 100) / 100;

  return {
    carrierLines,
    customerLines,
    carrierTotal: sum(carrierLines),
    customerTotal: sum(customerLines),
    reimbursements: sum(carrierLines.filter(isAtCostReimbursement)),
    pending: rows.filter(isPending),
    rejected: rows.filter(isRejected),
  };
}
