/**
 * carrier-portal-upgrade G18/G19/G20 — the one place a carrier-facing status
 * becomes a label and a colour.
 *
 * Owner default 2: every status label derives from the DB enum through one
 * shared mapper, with no label-only states. So the maps below are keyed BY
 * ENUM, not by bare string. A bare key is unsafe here: CONFIRMED is both a
 * LoadStatus and a TenderStatus, and EXPIRED is both a TenderStatus and an
 * insurance state, with different meanings for a carrier.
 *
 * carrierStatus.test.ts reads backend/prisma/schema.prisma and fails when an
 * enum gains a value this file does not map, or this file maps a value the
 * enum does not have.
 *
 * Before this, CarrierBadge mapped three enums in one flat table and left
 * 13 values unlabelled. DISPUTED and REJECTED pay, and TONU loads, rendered in
 * the same flat grey as a routine state.
 */
export type Tone = "success" | "warning" | "danger" | "info" | "gold" | "navy" | "silver" | "neutral";
export type StatusDisplay = { label: string; tone: Tone };

/** prisma enum LoadStatus */
export const LOAD_STATUS = {
  DRAFT: { label: "Draft", tone: "neutral" },
  PLANNED: { label: "Planned", tone: "neutral" },
  POSTED: { label: "Posted", tone: "info" },
  TENDERED: { label: "Tendered", tone: "info" },
  CONFIRMED: { label: "Confirmed", tone: "info" },
  BOOKED: { label: "Booked", tone: "info" },
  DISPATCHED: { label: "Dispatched", tone: "info" },
  AT_PICKUP: { label: "At pickup", tone: "warning" },
  LOADED: { label: "Loaded", tone: "warning" },
  PICKED_UP: { label: "Picked up", tone: "warning" },
  IN_TRANSIT: { label: "In transit", tone: "info" },
  AT_DELIVERY: { label: "At delivery", tone: "info" },
  DELIVERED: { label: "Delivered", tone: "success" },
  POD_RECEIVED: { label: "POD received", tone: "success" },
  INVOICED: { label: "Invoiced", tone: "success" },
  COMPLETED: { label: "Completed", tone: "success" },
  // Truck ordered, not used: the load did not move, and the carrier is owed a TONU fee.
  TONU: { label: "TONU", tone: "gold" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
} as const satisfies Record<string, StatusDisplay>;

/** prisma enum CarrierPayStatus */
export const CARRIER_PAY_STATUS = {
  PENDING: { label: "Pending", tone: "warning" },
  PREPARED: { label: "Prepared", tone: "info" },
  SUBMITTED: { label: "Submitted", tone: "info" },
  APPROVED: { label: "Approved", tone: "info" },
  SCHEDULED: { label: "Scheduled", tone: "warning" },
  PROCESSING: { label: "Processing", tone: "info" },
  PAID: { label: "Paid", tone: "success" },
  // The two a carrier must not miss: something is wrong with their pay.
  DISPUTED: { label: "Disputed", tone: "danger" },
  REJECTED: { label: "Rejected", tone: "danger" },
  ON_HOLD: { label: "On hold", tone: "warning" },
  VOID: { label: "Void", tone: "neutral" },
} as const satisfies Record<string, StatusDisplay>;

/**
 * prisma enum TenderStatus. Tone by outcome, not by name: SRL's withdrawal and
 * the carrier's decline both mean "the load went elsewhere", and colouring
 * SRL's withdrawal like a refusal would blame the carrier. Labels for tenders
 * come from carrierTenderLabel (lib/loadDerivedStatus), which reads the reason.
 */
export const TENDER_STATUS = {
  OFFERED: { label: "Offered", tone: "info" },
  ACCEPTED: { label: "Accepted", tone: "success" },
  COUNTERED: { label: "Countered", tone: "warning" },
  DECLINED: { label: "Declined", tone: "neutral" },
  RC_SENT: { label: "Rate confirmation sent", tone: "warning" },
  CONFIRMED: { label: "Confirmed", tone: "success" },
  EXPIRED: { label: "Expired", tone: "neutral" },
  WITHDRAWN: { label: "Withdrawn", tone: "neutral" },
  RELEASED: { label: "Released", tone: "danger" },
} as const satisfies Record<string, StatusDisplay>;

/** Server-computed insurance and expiry states (not a Prisma enum). */
export const COMPLIANCE_STATUS = {
  VALID: { label: "Valid", tone: "success" },
  EXPIRING_SOON: { label: "Expiring soon", tone: "warning" },
  EXPIRED: { label: "Expired", tone: "danger" },
} as const satisfies Record<string, StatusDisplay>;

/** Caravan Partner Program tiers (§7: Silver, Gold, Platinum only). */
export const CPP_TIER = {
  SILVER: { label: "Silver", tone: "silver" },
  GOLD: { label: "Gold", tone: "gold" },
  PLATINUM: { label: "Platinum", tone: "navy" },
} as const satisfies Record<string, StatusDisplay>;

const KINDS = {
  load: LOAD_STATUS,
  pay: CARRIER_PAY_STATUS,
  tender: TENDER_STATUS,
  compliance: COMPLIANCE_STATUS,
  tier: CPP_TIER,
} as const;
export type StatusKind = keyof typeof KINDS;

/**
 * The label and tone for a value of a known kind. A value the map does not know
 * (an old row, a new enum value before this file catches up) still renders,
 * as its own words in neutral, rather than vanishing.
 */
export function statusDisplay(kind: StatusKind, value: string | null | undefined): StatusDisplay {
  if (!value) return { label: "Unknown", tone: "neutral" };
  const hit = (KINDS[kind] as Record<string, StatusDisplay>)[value];
  if (hit) return hit;
  const words = value.toLowerCase().replace(/_/g, " ");
  return { label: words.charAt(0).toUpperCase() + words.slice(1), tone: "neutral" };
}

/** Tailwind classes per tone, from SRL status tokens (§2.1). Text holds AA on its own background. */
export const TONE_CLASSES: Record<Tone, { bg: string; text: string; dot: string }> = {
  success: { bg: "bg-[#E6F0E9]", text: "text-[#256340]", dot: "bg-[#2F7A4F]" },
  warning: { bg: "bg-[#FBEFD4]", text: "text-[#854F0B]", dot: "bg-[#B07A1A]" },
  danger: { bg: "bg-[#F6E3E3]", text: "text-[#9B2C2C]", dot: "bg-[#9B2C2C]" },
  info: { bg: "bg-[#E2EAF2]", text: "text-[#2A5B8B]", dot: "bg-[#2A5B8B]" },
  gold: { bg: "bg-[#FAEEDA]", text: "text-[#854F0B]", dot: "bg-[#C5A572]" },
  navy: { bg: "bg-[#E2EAF2]", text: "text-[#0A2540]", dot: "bg-[#C5A572]" },
  silver: { bg: "bg-[#E2EAF2]", text: "text-[#3A4A5F]", dot: "bg-[#8AA5C0]" },
  neutral: { bg: "bg-[#F5EEE0]", text: "text-[#3A4A5F]", dot: "bg-[#6B7685]" },
};
