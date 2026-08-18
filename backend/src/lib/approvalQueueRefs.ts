/**
 * What an ApprovalQueue row points at.
 *
 * WHY THIS IS A CONSTANT AND NOT A STRING LITERAL
 * ----------------------------------------------
 * `ApprovalQueue.referenceType` is a free-form String, and it drifted into two
 * spellings that never met: twelve writers wrote "CarrierPay" while every reader
 * compared against "CARRIER_PAY". The comparison silently failed, `referenceData`
 * resolved null, and no cascade fired.
 *
 * That is not cosmetic. The accessorial shortfall escalation — raised when an
 * accessorial is approved after a settlement has already been committed, and the
 * one mechanism that says a carrier is still owed money — is written under the
 * spelling nothing reads. The queue accepted the row, the row was real, and the
 * screen meant to action it could never resolve it.
 *
 * Prisma cannot enforce this (the column is a String, and widening it to an enum
 * is a migration with its own backfill), so the enforcement is that there is
 * exactly one place to import from. A literal in a new writer is the bug
 * returning.
 *
 * SCREAMING_SNAKE is canonical because that is what every reader already used and
 * what the sibling INVOICE branch uses. The migration alongside this file
 * normalises the rows already in the table.
 */
export const APPROVAL_REF = {
  CARRIER_PAY: "CARRIER_PAY",
  INVOICE: "INVOICE",
} as const;

export type ApprovalRefType = (typeof APPROVAL_REF)[keyof typeof APPROVAL_REF];

/**
 * Legacy spellings, kept so a reader can still resolve rows written before the
 * normalisation — including any that arrive from a replica or a backup restored
 * after the migration ran.
 *
 * Prefer `matchesRef` over comparing to this directly.
 */
const LEGACY: Record<string, ApprovalRefType> = {
  CarrierPay: APPROVAL_REF.CARRIER_PAY,
  carrierPay: APPROVAL_REF.CARRIER_PAY,
  Invoice: APPROVAL_REF.INVOICE,
  invoice: APPROVAL_REF.INVOICE,
};

/** Does a stored referenceType — canonical or legacy — mean `want`? */
export function matchesRef(stored: string | null | undefined, want: ApprovalRefType): boolean {
  if (!stored) return false;
  if (stored === want) return true;
  return LEGACY[stored] === want;
}
