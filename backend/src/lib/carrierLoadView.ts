/**
 * carrier-portal-upgrade G3/G4 — what a carrier may see of a Load.
 *
 * Load holds both sides of the deal in one row: what SRL charges the shipper and
 * what SRL pays the carrier. Any handler that returns a Load through `include`
 * (no `select`) sends every scalar, so GET /carrier-loads/:id and
 * GET /carrier/tenders were handing a carrier SRL's customer rate and margin,
 * plus the shipper's contact name, email and phone.
 *
 * `Load.rate` is hidden too: it is a write-only mirror holding the CUSTOMER rate
 * on some creation paths (frontend lib/rateDisplay.ts, §13.3 Item 227), so a
 * carrier can never be sure it is theirs.
 *
 * A denylist, because the carrier pages read dozens of operational fields and an
 * allowlist would silently blank one of them. carrierLoadView.test.ts keeps it
 * honest: every Load column whose name says margin, revenue, customer or cost
 * must appear here or in its reviewed allowlist, so a new one fails CI until
 * somebody decides which side it is on.
 */
import { isSrlStaffRole } from "./documentTypes";

export const CARRIER_HIDDEN_LOAD_FIELDS = [
  "rate",
  "customerRate",
  "customerRatePerMile",
  "grossMargin",
  "marginPercent",
  "marginPerMile",
  "revenuePerMile",
  "costPerMile",
  "targetCarrierCost",
  "customerInvoiced",
  "customerId",
  // Relation: the shipper's name and contact details. SRL is the carrier's one
  // point of contact.
  "customer",
] as const;

type Poster = {
  firstName?: string | null; lastName?: string | null; company?: string | null;
  phone?: string | null; email?: string | null; role?: string | null;
} | null | undefined;

type CarrierLoadView<T> = Omit<T, (typeof CARRIER_HIDDEN_LOAD_FIELDS)[number]>;

/**
 * The load with the customer side removed, and the poster reduced to a contact.
 *
 * G40 (correcting v3.8.bow): the poster is the carrier's rep, and a carrier on
 * the road needs a number to call. Phone and email are kept when the poster is
 * SRL staff, and dropped otherwise, so a load some other role posted can never
 * hand a carrier that person's details. The role itself is not sent.
 * An absent load passes through as absent rather than becoming `{}`.
 */
export function toCarrierLoadView<T extends Record<string, unknown>>(load: T): CarrierLoadView<T>;
export function toCarrierLoadView<T extends Record<string, unknown>>(load: T | null | undefined): CarrierLoadView<T> | null | undefined;
export function toCarrierLoadView<T extends Record<string, unknown>>(load: T | null | undefined): CarrierLoadView<T> | null | undefined {
  if (load === null || load === undefined) return load;
  const out: Record<string, unknown> = { ...load };
  for (const k of CARRIER_HIDDEN_LOAD_FIELDS) delete out[k];
  if (out.poster && typeof out.poster === "object") {
    const p = out.poster as NonNullable<Poster>;
    const staff = isSrlStaffRole(p.role);
    out.poster = {
      firstName: p.firstName ?? null, lastName: p.lastName ?? null, company: p.company ?? null,
      phone: staff ? p.phone ?? null : null, email: staff ? p.email ?? null : null,
    };
  }
  return out as CarrierLoadView<T>;
}
