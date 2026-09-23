// WHO IS AT THE DOCK — one resolver, used by the bill of lading and the rate
// confirmation, so the two documents can never name different people for the
// same stop.
//
// THE DEFECT THIS CLOSES. Both renderers fell back to the CUSTOMER'S BILLING
// CONTACT when the load carried no stop contact:
//
//   pdfService.ts  renderParty()  load.originContactName || load.customer?.contactName
//   pdfService.ts  RC parties     ... || load.customer?.phone
//
// Measured on production 2026-09-23: SRL-121497 (BOOKED, pickup 2026-09-24,
// BOL number already issued) prints "Contact: Monika Pape" on the shipper line.
// Monika Pape is Beekeepers Naturals' billing contact; the shipper facility is
// Steuart Nutrition Kentucky in Erlanger. The document sends a driver to a dock
// with the name of somebody in accounts payable on it — a person who is not
// there, has no connection to it, and cannot help. Three further loads
// (121493, 121492, 121491) print the same, all dead.
//
// The RC's own comment above its fallback already named the harm — "a driver
// calling it reaches accounts payable, not the gate" — and then did it anyway.
//
// THE TIERS (ruling 2). First tier that YIELDS a contact wins:
//
//   1. the load's own stop contact          Load.originContactName / destContactName
//   2. the facility the load is LINKED to   Load.originFacilityId / destFacilityId
//   3. a CRM facility of the same customer  exact normalized name + city match
//
//   0 matches or >1 matches at tier 3 = blank. A blank prints a handwrite line,
//   which a driver can fill at the dock. A wrong name cannot be corrected by
//   anyone who reads it.
//
// THE BILLING CONTACT IS NEVER A TIER. Not last, not "as a last resort". It is
// not a dock contact in any circumstance, so there is no circumstance in which
// printing it is better than printing nothing.
//
// NO CROSS-TIER MERGING, DELIBERATELY. A contact comes from exactly one tier —
// we never take the name from tier 1 and the email from tier 2. The load-level
// "Carlos" and the facility's "Carlos" may be the same person, and assuming so
// is how a stranger's email address reaches a legal document. If a tier knows
// the name it is the tier that knows the address.
//
// WHY THE TIER LOGIC IS PURE. pickStopContact() touches no database, so the
// rules are tested without a mock and a mock can never make a tier pass for a
// reason the production path would not. resolveStopContacts() is the thin async
// shell that fetches; it holds no rules.

/** What the renderers print. `source` is for logs and tests, never rendered. */
export interface StopContact {
  name: string | null;
  phone: string | null;
  email: string | null;
  source: "LOAD" | "FACILITY_FK" | "FACILITY_MATCH" | null;
}

/** The subset of CustomerFacility this resolver reads. */
export interface FacilityContactRow {
  id: string;
  name: string | null;
  city: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
}

export interface StopContactInput {
  /** Tier 1 — the load's own stop contact. */
  loadContactName?: string | null;
  loadContactPhone?: string | null;
  /** Tier 2 — the facility this stop is linked to by FK, if any. */
  linkedFacility?: FacilityContactRow | null;
  /** Tier 3 match key — the stop's own company and city, from the load. */
  company?: string | null;
  city?: string | null;
  /** Tier 3 candidates — the facilities belonging to this load's customer. */
  candidateFacilities?: FacilityContactRow[] | null;
}

export const BLANK_CONTACT: StopContact = { name: null, phone: null, email: null, source: null };

/**
 * trim, case-fold, collapse internal whitespace (ruling 2).
 *
 * Returns "" for anything that normalizes to empty, and callers MUST treat ""
 * as unmatchable — otherwise a facility with a blank name matches a stop with a
 * blank company, which is every unmatched row matching every other one.
 */
export function normalizeKey(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function contactFrom(
  source: StopContact["source"],
  name: string | null | undefined,
  phone: string | null | undefined,
  email: string | null | undefined,
): StopContact | null {
  const n = String(name ?? "").trim() || null;
  const p = String(phone ?? "").trim() || null;
  const e = String(email ?? "").trim() || null;
  // A tier with nothing in it is not an answer — fall through to the next.
  if (!n && !p && !e) return null;
  return { name: n, phone: p, email: e, source };
}

/**
 * Resolve one stop's dock contact. Pure.
 *
 * The load carries no email column, so a tier-1 contact has `email: null`.
 * That is the honest answer: we hold a name and a phone for that stop and no
 * address for them.
 */
export function pickStopContact(input: StopContactInput): StopContact {
  // Tier 1 — the load's own stop contact.
  const tier1 = contactFrom("LOAD", input.loadContactName, input.loadContactPhone, null);
  if (tier1) return tier1;

  // Tier 2 — the facility this stop is linked to.
  if (input.linkedFacility) {
    const f = input.linkedFacility;
    const tier2 = contactFrom("FACILITY_FK", f.contactName, f.contactPhone, f.contactEmail);
    if (tier2) return tier2;
  }

  // Tier 3 — a CRM facility of the same customer, matched on name + city.
  //
  // Both keys must be non-empty on the stop side. A stop with no company or no
  // city has nothing to match ON, and matching on "" would pair it with every
  // facility that also has a gap.
  const wantName = normalizeKey(input.company);
  const wantCity = normalizeKey(input.city);
  if (wantName && wantCity && input.candidateFacilities?.length) {
    const hits = input.candidateFacilities.filter(
      (f) => normalizeKey(f.name) === wantName && normalizeKey(f.city) === wantCity,
    );
    // UNIQUE OR NOTHING. Two facilities answering to the same name in the same
    // city is a CRM data question, and guessing between them puts one dock's
    // contact on another dock's paperwork.
    if (hits.length === 1) {
      const tier3 = contactFrom("FACILITY_MATCH", hits[0].contactName, hits[0].contactPhone, hits[0].contactEmail);
      if (tier3) return tier3;
    }
  }

  return BLANK_CONTACT;
}

/** Both stops of a load, resolved. */
export interface ResolvedStopContacts {
  shipper: StopContact;
  consignee: StopContact;
}

/** The load fields the async shell reads. Structural, so any assembler's row fits. */
export interface StopContactLoad {
  customerId?: string | null;
  originCompany?: string | null;
  originCity?: string | null;
  originContactName?: string | null;
  originContactPhone?: string | null;
  originFacilityId?: string | null;
  destCompany?: string | null;
  destCity?: string | null;
  destContactName?: string | null;
  destContactPhone?: string | null;
  destFacilityId?: string | null;
}

/** Just enough of the Prisma client to fetch facilities — keeps this testable. */
export interface FacilityReader {
  customerFacility: {
    findMany(args: any): Promise<any[]>;
  };
}

const FACILITY_FIELDS = {
  id: true, name: true, city: true,
  contactName: true, contactPhone: true, contactEmail: true,
} as const;

/**
 * Fetch what the tiers need, then apply them. Holds NO rules — every decision
 * is pickStopContact's.
 *
 * ONE QUERY. Tier 2's facilities and tier 3's candidates both come from the
 * customer's facility list, so the FK is resolved against rows already in hand
 * rather than fetched again. At SRL's volume that list is single digits.
 *
 * NEVER THROWS. A document must render even when the CRM lookup fails; the
 * caller gets blank contacts and the BOL prints handwrite lines, which is what
 * it printed before this resolver existed.
 */
export async function resolveStopContacts(
  load: StopContactLoad,
  db: FacilityReader,
): Promise<ResolvedStopContacts> {
  let facilities: FacilityContactRow[] = [];
  if (load.customerId) {
    try {
      facilities = (await db.customerFacility.findMany({
        where: { customerId: load.customerId },
        select: FACILITY_FIELDS,
      })) as FacilityContactRow[];
    } catch {
      facilities = [];
    }
  }
  const byId = (id: string | null | undefined) =>
    (id ? facilities.find((f) => f.id === id) : undefined) ?? null;

  return {
    shipper: pickStopContact({
      loadContactName: load.originContactName,
      loadContactPhone: load.originContactPhone,
      linkedFacility: byId(load.originFacilityId),
      company: load.originCompany,
      city: load.originCity,
      candidateFacilities: facilities,
    }),
    consignee: pickStopContact({
      loadContactName: load.destContactName,
      loadContactPhone: load.destContactPhone,
      linkedFacility: byId(load.destFacilityId),
      company: load.destCompany,
      city: load.destCity,
      candidateFacilities: facilities,
    }),
  };
}
