/**
 * Ruling 2 (2026-09-21): a carrier INVOICE is required to move a CarrierPay
 * to APPROVED. An AE may override with a reason of at least ten characters,
 * and the override is written to the audit log with who and when.
 *
 * ONE gate for every path that writes APPROVED (approvePayment,
 * bulkApprovePayments, the approval-queue review) -- three handlers each
 * remembering to check is how the Quick Pay fee gate came to have a fourth
 * path that checked nothing (§14, the accountingController prepare/edit
 * bypass v3.8.asb closed).
 *
 * WHAT "ON FILE" MEANS. The invoice slot from shared/constants/paperwork --
 * the same table the carrier's paperwork panel renders -- at UPLOADED or
 * VERIFIED. It is read from the Document rows, not from the settlement's
 * `docCarrierInvoice` column: that column is a recompute of those rows
 * written by a non-fatal sync, so it can lag the truth by one failed write,
 * and a payment gate must not refuse on a stale cache. A REJECTED invoice
 * is not on file; the AE is waiting for a replacement.
 *
 * WHO MAY OVERRIDE. AE roles. ACCOUNTING is deliberately not one of them:
 * the ruling gates the override to the desk that manages the carrier, and
 * the approve routes are ADMIN/CEO today, so this set is the floor if those
 * routes are ever widened.
 */
import { prisma } from "../config/database";
import { paperworkSlots } from "../../../shared/constants/paperwork";

export const INVOICE_OVERRIDE_MIN_REASON = 10;
export const INVOICE_OVERRIDE_ACTION = "CARRIER_PAY_INVOICE_OVERRIDE";

/** The desk that may waive the invoice. Mirrors the AE_ROLES sets in routes/orders, loadBids, waterfalls. */
export const INVOICE_OVERRIDE_ROLES: ReadonlySet<string> = new Set([
  "BROKER", "ADMIN", "DISPATCH", "OPERATIONS", "CEO", "AE", "ACCOUNT_EXECUTIVE",
]);

export type InvoiceGateVerdict =
  | { allowed: true; overridden: false }
  | { allowed: true; overridden: true; reason: string }
  | { allowed: false; status: 409 | 403 | 400; code: "INVOICE_REQUIRED" | "OVERRIDE_NOT_PERMITTED" | "OVERRIDE_REASON_TOO_SHORT"; error: string };

export interface InvoiceGateInput {
  carrierPayId: string;
  loadId: string;
  actor: { id: string; role: string };
  /** From the request body. A short or absent reason is not an override. */
  overrideReason?: unknown;
}

/** Is a carrier invoice on file for the load: an INVOICE document at UPLOADED or VERIFIED? */
export async function invoiceOnFile(loadId: string, db: { document: { findMany: typeof prisma.document.findMany }; load: { findUnique: typeof prisma.load.findUnique } } = prisma): Promise<boolean> {
  const [load, docs] = await Promise.all([
    db.load.findUnique({ where: { id: loadId }, select: { status: true, equipmentType: true, temperatureControlled: true } }),
    db.document.findMany({ where: { loadId, docType: "INVOICE" }, select: { id: true, docType: true, status: true, createdAt: true } }),
  ]);
  if (!load) return false;
  const slot = paperworkSlots(load, docs).find((s) => s.key === "INVOICE");
  return !!slot && (slot.state === "UPLOADED" || slot.state === "VERIFIED");
}

/**
 * Decide, and if an override is used, RECORD it before the caller writes
 * APPROVED. Recording first is deliberate: an approval that then fails to
 * write leaves an audit row saying an override was granted for nothing,
 * which is recoverable; an approval that writes and then fails to record
 * leaves a waived invoice with no trace, which is not.
 */
export async function assertInvoiceOnFileOrOverride(input: InvoiceGateInput): Promise<InvoiceGateVerdict> {
  if (await invoiceOnFile(input.loadId)) return { allowed: true, overridden: false };

  const reason = typeof input.overrideReason === "string" ? input.overrideReason.trim() : "";
  if (!reason) {
    return {
      allowed: false, status: 409, code: "INVOICE_REQUIRED",
      error: "The carrier's invoice is not on file for this load. Approval needs the invoice, or an AE override with a reason.",
    };
  }
  if (!INVOICE_OVERRIDE_ROLES.has(input.actor.role)) {
    return { allowed: false, status: 403, code: "OVERRIDE_NOT_PERMITTED", error: "Only an AE may approve a settlement without the carrier's invoice." };
  }
  if (reason.length < INVOICE_OVERRIDE_MIN_REASON) {
    return {
      allowed: false, status: 400, code: "OVERRIDE_REASON_TOO_SHORT",
      error: `An override needs a reason of at least ${INVOICE_OVERRIDE_MIN_REASON} characters.`,
    };
  }

  await prisma.auditLog.create({
    data: {
      userId: input.actor.id,
      action: INVOICE_OVERRIDE_ACTION,
      entity: "CarrierPay",
      entityId: input.carrierPayId,
      changes: `Approved without the carrier's invoice on file: ${reason}`,
      details: { reason, loadId: input.loadId, carrierPayId: input.carrierPayId, role: input.actor.role, at: new Date().toISOString() },
    },
  });
  return { allowed: true, overridden: true, reason };
}
