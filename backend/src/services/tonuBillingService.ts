// Records the TONU obligation on the accessorial ledger.
//
// Arc 3 Phase 2, closing the leg v3.8.aso banked. resolveTonuBilling already
// decided who owes whom; this is the writer that puts that decision somewhere
// both money paths already look.
//
// It deliberately writes ONE LoadAccessorial row rather than reaching into the
// invoice and the settlement separately. That is not a shortcut — it is the
// existing architecture:
//
//   customer side — invoiceService.unbilledCustomerAccessorials reads the
//     ledger, applies the customer's negotiated rate, and skips any row whose
//     `billedTo` is not SHIPPER or whose price is zero.
//   carrier side  — integrationService.approvedAccessorials reads the same
//     ledger and does NOT filter on billedTo, so a row billed to nobody still
//     pays the carrier.
//
// So one row, with `amount` / `customerAmount` / `billedTo` set per fault side,
// expresses both legs correctly and nothing parallel gets built.
//
// The ledger is also the only safe anchor on a TONU. onLoadCancelledOrTONU
// cancels tenders, reverses shipper credit, voids CarrierPay records, cancels
// approval-queue entries and reverses factoring funds — it never touches
// LoadAccessorial. Writing a CarrierPay here instead would race that reversal
// (it is fire-and-forget from loadController) and could leave the payable voided
// or not depending on which finished first. The ledger cannot be raced.
//
// WHAT THIS DOES NOT DO, and why — see the note at the bottom of this file.

import { prisma } from "../config/database";
import { log } from "../lib/logger";
import { resolveTonuBilling, type TonuFaultSide } from "../lib/tonuPolicy";
import { syncInvoiceAccessorials } from "./invoiceService";
import { syncCarrierPayAccessorials } from "./integrationService";

export interface TonuRecordResult {
  created: boolean;
  reason: string;
  accessorialId?: string;
  amount?: number;
}

/**
 * Write the TONU obligation for a load, once.
 *
 * Idempotent on (loadId, type=TONU): a re-flip, a retry, or a double-submit
 * finds the existing row and returns without creating a second one. Without
 * this guard an AE correcting a fault side by re-flipping would bill the
 * customer twice for one wasted truck.
 *
 * A REJECTED row does not block a new one — that is an AE having thrown the
 * charge out, and a later TONU on the same load should be recordable.
 */
export async function recordTonuObligation(
  loadId: string,
  faultSide: TonuFaultSide,
  actorId?: string,
): Promise<TonuRecordResult> {
  const decision = resolveTonuBilling(faultSide);

  if (!decision.billCustomer && !decision.payCarrier) {
    return { created: false, reason: "Carrier-fault TONU: nothing owed in either direction." };
  }

  const existing = await prisma.loadAccessorial.findFirst({
    where: { loadId, type: "TONU", status: { not: "REJECTED" } },
    select: { id: true },
  });
  if (existing) {
    return { created: false, reason: "TONU already recorded on this load.", accessorialId: existing.id };
  }

  const now = new Date();
  const row = await prisma.loadAccessorial.create({
    data: {
      loadId,
      type: "TONU",
      // What the carrier is owed. Read from the ratified schedule via
      // resolveTonuBilling, never a literal.
      amount: decision.amount,
      // NULL lets the customer's negotiated rate apply, falling back to cost —
      // the same resolution every other accessorial gets. 0 means bill nothing,
      // which the customer reader drops via its `amount > 0` filter.
      customerAmount: decision.billCustomer ? null : 0,
      // The customer reader keeps only SHIPPER (or unset). Marking a
      // broker-fault TONU as billed to BROKER is what keeps it off the
      // customer's invoice while still paying the carrier.
      billedTo: decision.billCustomer ? "SHIPPER" : "BROKER",
      // APPROVED because a fault side was chosen deliberately by an AE at the
      // flip. PENDING would mean "a claim nobody has looked at", which is not
      // what this is.
      status: "APPROVED",
      approvedBy: actorId ?? null,
      approvedAt: now,
      notes: decision.rationale,
    },
    select: { id: true },
  });

  log.info(
    { loadId, faultSide, accessorialId: row.id, amount: decision.amount, billCustomer: decision.billCustomer, payCarrier: decision.payCarrier },
    "[TONU] Obligation recorded on the accessorial ledger",
  );

  // Push into both money paths. Each is a no-op when the load has no invoice
  // and no settlement yet, which on a TONU is the normal case — see below.
  // Non-blocking: a sync failure must not fail the TONU flip, and the ledger row
  // is already durable either way.
  void syncInvoiceAccessorials(loadId).catch((err) =>
    log.error({ err, loadId }, "[TONU] syncInvoiceAccessorials failed (non-fatal)"),
  );
  void syncCarrierPayAccessorials(loadId).catch((err) =>
    log.error({ err, loadId }, "[TONU] syncCarrierPayAccessorials failed (non-fatal)"),
  );

  return { created: true, reason: decision.rationale, accessorialId: row.id, amount: decision.amount };
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVATION IS BANKED, and the reason is specific rather than caution.
//
// The obligation is now recorded in the one place both money paths read. It
// does not become money today, because on a TONU load neither money DOCUMENT
// exists:
//
//   customer — syncInvoiceAccessorials returns null when there is no BASE
//     invoice ("Not invoiced yet. autoGenerateInvoice will read the ledger when
//     it runs"), and autoGenerateInvoice only fires on the POD/delivery path. A
//     TONU load never delivers, so no invoice is ever raised for it.
//   carrier  — syncCarrierPayAccessorials returns early when there is no
//     CarrierPay ("Not settled yet"), createCarrierPayOnDelivery likewise only
//     runs on delivery, and onLoadCancelledOrTONU voids any CarrierPay that did
//     exist.
//
// Both gaps are the same shape: a TONU needs a money document of its own, and
// the two ways to conjure one are both wrong to do here. Calling
// autoGenerateInvoice would bill the customer the full linehaul for a truck that
// never moved. Writing a bespoke TONU invoice or a bespoke TONU settlement is
// the parallel plumbing this design exists to avoid.
//
// So the ledger row is the deliverable, and it is genuinely load-bearing: the
// moment an AE raises an invoice or a settlement against a TONU load, the
// existing readers pick this row up with no further work. What is missing is a
// deliberate "settle a TONU" surface, which is a product decision about how SRL
// bills a customer for a truck that never rolled. Banked in §13.3 with these
// call sites.
// ─────────────────────────────────────────────────────────────────────────────
