// Single source of truth for the carrier archive reasons and the words a
// person sees for them. Consumed by the frontend (via the @shared alias) and
// the backend (via rootDir + include), the same bridge
// shared/constants/cancellationReasons.ts uses -- and for the same reason: the
// third hand-kept copy of a vocabulary is the one that drifts.
//
// The KEYS are the Prisma `CarrierArchiveReason` enum (B1a, v3.8.bdh), in the
// order a picker should show them. The label map is a Record over the union,
// so an eighth reason added here without a label fails tsc in BOTH trees; the
// backend pins this union to the Prisma enum where the enum type exists
// (carrierController.ts, and the parity test beside it), so a value added
// here without a migration, or a migration without an entry here, fails.
//
// Labels are operator-facing SRL copy: short enough to sit beside a long
// carrier name at list density, no em dashes, no contractions.

export type CarrierArchiveReason =
  | "DUPLICATE_RECORD"
  | "CEASED_OPERATIONS"
  | "AUTHORITY_REVOKED"
  | "FRAUD_CONFIRMED"
  | "INSURANCE_LAPSED_UNRESPONSIVE"
  | "RELATIONSHIP_ENDED"
  | "ERRONEOUS_RECORD";

/** Every reason, in the order a picker should show them. */
export const CARRIER_ARCHIVE_REASONS: readonly CarrierArchiveReason[] = [
  "DUPLICATE_RECORD",
  "CEASED_OPERATIONS",
  "AUTHORITY_REVOKED",
  "FRAUD_CONFIRMED",
  "INSURANCE_LAPSED_UNRESPONSIVE",
  "RELATIONSHIP_ENDED",
  "ERRONEOUS_RECORD",
];

/** What an operator reads for each reason. Exhaustive by type. */
export const CARRIER_ARCHIVE_REASON_LABELS: Readonly<Record<CarrierArchiveReason, string>> = {
  DUPLICATE_RECORD: "Duplicate record",
  CEASED_OPERATIONS: "Ceased operations",
  AUTHORITY_REVOKED: "Authority revoked",
  FRAUD_CONFIRMED: "Fraud confirmed",
  INSURANCE_LAPSED_UNRESPONSIVE: "Insurance lapsed, unresponsive",
  RELATIONSHIP_ENDED: "Relationship ended",
  ERRONEOUS_RECORD: "Erroneous record",
};

/**
 * The label for a stored reason. Takes a string rather than the union because
 * the value arrives over the wire: a row written by a newer server than the
 * bundle reading it must still render, and the raw code is a more honest
 * fallback than a blank cell.
 */
export function carrierArchiveReasonLabel(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return (CARRIER_ARCHIVE_REASON_LABELS as Record<string, string>)[reason] ?? reason;
}
