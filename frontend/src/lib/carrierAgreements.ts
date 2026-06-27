// Single source of the carrier-facing agreement review content + versions.
// Consumed by the post-approval Activation screen (binding e-signature) and,
// after Track 1.1c, the onboarding consent step — so both surfaces show the
// same articles and stamp the same version onto the signature/consent record.
//
// IMPORTANT (CLAUDE.md §14 + §16): this text is the interim draft shown for
// review. The standalone executable Broker-Carrier Agreement + Caravan Quick
// Pay Agreement are under Michigan commercial-attorney review; swap the
// attorney-final body in here and bump the version — the signing mechanism
// records consent against whatever version is current, no code change needed.
//
// v3.8 counsel architecture (Dirk Beckwith / Foster Swift, confirmed 2026-06):
// the BCA is the master agreement; the BOL and Rate Confirmation are clean
// forms that reference it. The v3.8 defaults are landed here — non-solicit
// 12 months / 15% (CLAUDE.md §14 canon) and Kalamazoo-County binding
// arbitration. Still pending Dirk's final confirmation before the
// attorney-final body is swapped in: insurance limits (he proposed lower),
// the additional carrier protections (fraud/identity, OTIF, 18-month
// authority, OFAC, audit), and litigation-vs-arbitration form. See the v3.8
// BCA merge draft in Drive (Foster Swift folder).
//
// NOTE — duplication: the onboarding Step 4 click-through (onboarding/page.tsx)
// is a SEPARATE inline copy of these terms. Both were aligned to the v3.8
// defaults in this commit; consolidating onboarding to import BCA_ARTICLES is
// a banked follow-up so there is a single source.

export const BCA_VERSION = "2026-06-27-v1";
export const QP_VERSION = "2026-05-24-v1";

export interface AgreementArticle {
  title: string;
  body: string;
}

// Broker-Carrier Agreement — article summaries shown in the review pane. The
// full executed agreement governs; these are the binding terms in brief.
export const BCA_ARTICLES: AgreementArticle[] = [
  {
    title: "1. Authority & Compliance",
    body: "Carrier holds and maintains active FMCSA operating authority and all required filings, and complies with all applicable FMCSA, DOT, and state regulations at all times. Carrier is solely responsible for driver qualification, hours of service, drug and alcohol testing, and equipment condition.",
  },
  {
    title: "2. Insurance",
    body: "Carrier maintains, at minimum, $1,000,000 auto liability, $100,000 cargo, and $1,000,000 general liability, naming Silk Route Logistics as certificate holder with 30 days' written notice of cancellation. Coverage is continuous for the term of this agreement.",
  },
  {
    title: "3. Independent Contractor",
    body: "Carrier is an independent contractor, not an agent, employee, partner, or joint venturer of SRL. Carrier controls the means and manner of transportation and furnishes its own equipment, drivers, fuel, and labor.",
  },
  {
    title: "4. Load Acceptance & Transportation",
    body: "Each load is governed by the rate confirmation issued for that load; acceptance of a rate confirmation forms a binding agreement for that shipment. Carrier shall not re-broker, co-broker, assign, interline, or subcontract any load without SRL's prior written consent.",
  },
  {
    title: "5. Documentation & Payment",
    body: "Carrier submits a clean, signed bill of lading and proof of delivery to invoice. SRL pays Carrier per the rate confirmation and the Caravan Partner Program pay terms. Quick Pay is optional and governed by the separate Caravan Quick Pay Agreement.",
  },
  {
    title: "6. Cargo Claims & Liability",
    body: "Carrier assumes full Carmack Amendment liability (49 U.S.C. § 14706) for loss, damage, or delay to cargo from receipt through delivery. SRL is a licensed property broker, not a motor carrier, and assumes no carrier liability for the freight.",
  },
  {
    title: "7. Performance & Compass Score",
    body: "SRL measures on-time pickup and delivery, tracking compliance, claims ratio, communication, document timeliness, and acceptance through the published 7-factor Compass Score. Performance governs Caravan Partner Program tier advancement.",
  },
  {
    title: "8. Confidentiality & Non-Solicitation",
    body: "Carrier keeps SRL shipper identities, rates, and lane data confidential and will not solicit or back-solicit SRL's customers for 12 months after the last SRL load, with liquidated damages of 15% of the gross revenue on any improperly solicited shipment.",
  },
  {
    title: "9. Term & Termination",
    body: "This agreement is continuous until terminated by either party on written notice. Obligations that by their nature survive termination — confidentiality, non-solicitation, indemnity, accrued payment, and cargo liability — survive.",
  },
  {
    title: "10. Governing Law & Dispute Resolution",
    body: "This agreement is governed by the laws of the State of Michigan and applicable federal transportation law. Disputes are resolved by binding arbitration in Kalamazoo County, Michigan.",
  },
  {
    title: "11. Data Privacy & Consent",
    body: "Carrier consents to SRL verifying its FMCSA authority, insurance, and safety record, and to receiving operational, tendering, and tracking communications related to its loads.",
  },
];

// Quick Pay is OPTIONAL and reversible — it is never required to haul.
export const QP_SUMMARY =
  "Quick Pay is optional. Your standard pay by tier is always free: Silver Net-30, Gold Net-21, Platinum Net-14. When you want your money sooner, Quick Pay advances payment after a clean proof of delivery for a flat fee by tier. Turn it on or off anytime — it never affects your eligibility to haul.";

export interface QpTierTerm {
  tier: string;
  standard: string;
  sevenDay: string;
}

export const QP_TIER_TERMS: QpTierTerm[] = [
  { tier: "Silver", standard: "Net-30 free", sevenDay: "3% at 7 days" },
  { tier: "Gold", standard: "Net-21 free", sevenDay: "2% at 7 days" },
  { tier: "Platinum", standard: "Net-14 free", sevenDay: "1% at 7 days" },
];

// Universal same-day premium per CLAUDE.md §8 — applies on any tier.
export const QP_SAME_DAY_NOTE = "Same-day Quick Pay is available on any tier for an additional 2% on the tier fee.";
