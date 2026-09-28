/**
 * F-D6 (ruled 2026-09-28, option b): who may read a load, and which of its money each
 * party may see. GET /loads/:id and GET /loads both read this one rule.
 *
 * A load has two commercial sides. What the CUSTOMER pays SRL is the customer side; what
 * SRL pays the CARRIER is the carrier side; the difference is SRL's margin. A carrier must
 * never see the customer side, a shipper must never see the carrier side, and neither may
 * see the margin, because margin plus either side gives the other.
 *
 * The sets are named field by field rather than by pattern, and a guard
 * (loadPartyView.test.ts) fails when a money-named column is added to Load without being
 * classified here, so a new column is withheld by decision, not by luck.
 */
import { isSrlStaffRole } from "./documentTypes";

/** What the customer pays, and figures derived from it. Hidden from a carrier. */
export const CUSTOMER_SIDE_LOAD_FIELDS = [
  "customerRate",
  "rate", // the write-only mirror of customerRate (Item 227): the same number
  "customerRatePerMile",
  "revenuePerMile",
  "invoicedTotal", // GET /loads adds it: what the customer was billed
] as const;

/** What SRL pays the carrier, and its terms. Hidden from a shipper. */
export const CARRIER_SIDE_LOAD_FIELDS = [
  "carrierRate",
  "totalCarrierPay",
  "costPerMile",
  "targetCarrierCost",
  "extraStopPay",
  "quickPayFeePercent",
  "carrierPaymentTier",
  "carrierPaymentMethod",
] as const;

/** SRL's own numbers: the margin, and money columns whose side is not fixed. Hidden from both. */
export const SRL_ONLY_LOAD_FIELDS = [
  "grossMargin",
  "marginPercent",
  "marginPerMile",
  "fuelSurcharge",
  "fuelSurchargeAmount",
  "lumperEstimate",
] as const;

/**
 * Money columns both parties may see: the cargo value, the released value the BOL
 * prints (49 U.S.C. § 14706(c), on the document both sign), and a COD amount.
 */
export const SHARED_LOAD_MONEY_FIELDS = ["cargoValue", "declaredValue", "codAmount"] as const;

export type LoadParty = "STAFF" | "CARRIER" | "SHIPPER";

interface PartyLoad {
  carrierId?: string | null;
  posterId?: string | null;
  customer?: { userId?: string | null } | null;
}

/**
 * The caller's party on this load, or null when it is not a party. Staff see every load.
 * A carrier is a party when the load is assigned to it; a shipper when it posted the load
 * or is the load's customer. Every other role is not a party.
 */
export function loadPartyOf(user: { id: string; role: string } | undefined, load: PartyLoad): LoadParty | null {
  if (!user) return null;
  if (isSrlStaffRole(user.role)) return "STAFF";
  if (user.role === "CARRIER" && load.carrierId === user.id) return "CARRIER";
  if (user.role === "SHIPPER" && (load.posterId === user.id || (!!load.customer?.userId && load.customer.userId === user.id))) return "SHIPPER";
  return null;
}

/** The fields a party must not receive. Staff receive everything. */
export function hiddenLoadFieldsFor(party: LoadParty): readonly string[] {
  if (party === "CARRIER") return [...CUSTOMER_SIDE_LOAD_FIELDS, ...SRL_ONLY_LOAD_FIELDS];
  if (party === "SHIPPER") return [...CARRIER_SIDE_LOAD_FIELDS, ...SRL_ONLY_LOAD_FIELDS];
  return [];
}

/** A copy of the load without the fields this party must not see. */
export function redactLoadForParty<T extends Record<string, unknown>>(load: T, party: LoadParty): T {
  const hidden = hiddenLoadFieldsFor(party);
  if (hidden.length === 0) return load;
  const out: Record<string, unknown> = { ...load };
  for (const f of hidden) delete out[f];
  return out as T;
}
