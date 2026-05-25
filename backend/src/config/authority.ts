/**
 * v3.8.akg §13.3 Item 8.9 — Canonical authority block for SRL.
 *
 * Single source of truth for the legal-identity + contact fields that
 * print on shipping documents (BOL, Rate Confirmation, Invoice, SOP),
 * outbound emails (carrier-fraud-banner verification, insurance-verify),
 * AE Console surfaces (verifyController), and the skill chrome library
 * mirror (srl-chrome.ts BRAND block).
 *
 * Pre-akg every consumer hardcoded these values inline, which produced
 * the §13.3 Item 8.8 leading-zero MC# typo that propagated to ~17
 * surfaces (CLAUDE.md §1 + §4 line 410 + 6 backend services + the
 * BOLTemplate.tsx React mirror + 10 public HTML pages — last item
 * auto-corrected via site-chrome.json + _partials/footer.html since
 * v3.8.aih). akg consolidates into this module so any future
 * legal-identity change is a one-edit operation, NOT a 17-surface
 * sweep.
 *
 * Verification per §3.13: each value below verified against an
 * authoritative source before commit:
 *   - MC#/DOT#: FMCSA SAFER (https://safer.fmcsa.dot.gov/) + .claude
 *     skill canonical at references/voice.md:98
 *   - BMC-84 bond: filed BMC-84 paperwork (PFA Protects CA# 0M18074,
 *     $75,000 face value, completed 2026-02-19 per §1)
 *   - Contingent cargo: §18.8 Lead Hunter authority line canonical
 *     ($100K through Hancock & Associates)
 *   - Principal address: CLAUDE.md §1 (filed FMCSA + BMC-84 paperwork)
 *   - Phone: CLAUDE.md §1 (operating mainline)
 *   - Tagline: CLAUDE.md §1 brand canonical
 *   - Governing law + venue: CLAUDE.md §14 + Caravan Quick Pay
 *     Agreement v2 Article 18
 *
 * Mirror at frontend/src/lib/authority.ts for client surfaces
 * (BOLTemplate.tsx + RC modal). Both modules MUST stay in sync;
 * any value-change to one requires the same change to the other.
 */

// ─── Legal identity ──────────────────────────────────────────────

export const ENTITY_NAME = "Silk Route Logistics Inc." as const;
export const ENTITY_FORM = "Michigan C-Corp" as const;
export const TAGLINE = "Where Trust Travels." as const;
export const DOMAIN = "silkroutelogistics.ai" as const;

// FMCSA authority. Format follows skill canonical voice.md:98 — "#"
// symbol + single space, no hyphen, no leading zero.
export const MC_NUMBER = "1794414" as const;
export const DOT_NUMBER = "4526880" as const;
export const MC_LABEL = `MC# ${MC_NUMBER}` as const;
export const DOT_LABEL = `DOT# ${DOT_NUMBER}` as const;

// BMC-84 bond filed with FMCSA per §1.
export const BOND_TYPE = "BMC-84" as const;
export const BOND_AMOUNT = "$75,000" as const;
export const BOND_SURETY = "PFA Protects" as const;
export const BOND_SURETY_CA = "0M18074" as const;

// Contingent cargo insurance per §18.8 Lead Hunter authority line.
// Sub-rule c reminder: vendor-stack reveal banned on public marketing
// surfaces per §20.1.5 (see /shippers v3.8.agn hotfix). Allowed in
// Lead Hunter outreach + carrier-fraud-banner (compliance audience).
export const CONTINGENT_CARGO_AMOUNT = "$100K" as const;
export const CONTINGENT_CARGO_CARRIER = "Hancock & Associates" as const;

// ─── Principal address + venue ───────────────────────────────────

export const PRINCIPAL_ADDRESS_STREET = "2317 S 35th St" as const;
export const PRINCIPAL_ADDRESS_CITY = "Galesburg" as const;
export const PRINCIPAL_ADDRESS_STATE = "MI" as const;
export const PRINCIPAL_ADDRESS_ZIP = "49053" as const;
export const PRINCIPAL_ADDRESS_COUNTY = "Kalamazoo County" as const;
export const PRINCIPAL_ADDRESS_ONE_LINE = `${PRINCIPAL_ADDRESS_STREET}, ${PRINCIPAL_ADDRESS_CITY}, ${PRINCIPAL_ADDRESS_STATE} ${PRINCIPAL_ADDRESS_ZIP}` as const;

// §14 Caravan Quick Pay Agreement v2 + BCA — governing law + venue
// chosen at incorporation; Galesburg is in Kalamazoo County so
// county-level venue references are correct without modification.
export const GOVERNING_LAW = "State of Michigan" as const;
export const VENUE = PRINCIPAL_ADDRESS_COUNTY;

// ─── Contact + ops ───────────────────────────────────────────────

export const PHONE = "(269) 220-6760" as const;
export const PHONE_E164 = "+12692206760" as const;

export const OPERATIONS_EMAIL = "operations@silkroutelogistics.ai" as const;
export const COMPLIANCE_EMAIL = "compliance@silkroutelogistics.ai" as const;
export const ACCOUNTING_EMAIL = "accounting@silkroutelogistics.ai" as const;
export const SALES_EMAIL = "sales@silkroutelogistics.ai" as const;
export const CARRIERS_EMAIL = "carriers@silkroutelogistics.ai" as const;
export const NOREPLY_EMAIL = "noreply@silkroutelogistics.ai" as const;

// §6 honest hours canonical. Long form for PDFs + email footers;
// short form for tight UI surfaces.
export const OPERATIONS_HOURS_LONG =
  "Business hours coverage Monday–Friday, 7:00 AM – 7:00 PM Eastern. After-hours emergency line available for active loads in transit." as const;
export const OPERATIONS_HOURS_SHORT =
  "Business hours Mon–Fri 7am–7pm ET + after-hours emergency line" as const;

// ─── Formatted authority lines (use for outreach + footer copy) ──

/**
 * Lead Hunter outreach authority line per §18.8.
 * Used on cold-outreach intro emails as the legal-identity proof
 * before the operational ask. Includes contingent cargo + vendor
 * name because the audience (shipper compliance + AP) needs the
 * specifics; this string is NOT for public marketing surfaces
 * (Lens 1.5 vendor-stack-reveal ban — see §20.1.5).
 */
export const AUTHORITY_LINE_OUTREACH =
  `Michigan-licensed property broker (${MC_LABEL}, ${DOT_LABEL}, ${BOND_TYPE} bonded ${BOND_AMOUNT}, ${CONTINGENT_CARGO_AMOUNT} contingent cargo through ${CONTINGENT_CARGO_CARRIER})` as const;

/**
 * Public-page / shipping-document authority footer line.
 * Surfaces MC#/DOT# + bond existence WITHOUT naming the underwriter
 * (Lens 1.5 compliance for §20 public marketing context). Used in
 * BOL/RC PDF footers + CarrierFraudBanner on /carriers.
 */
export const AUTHORITY_LINE_PUBLIC =
  `Property broker · FMCSA ${MC_LABEL} · ${DOT_LABEL} · ${BOND_TYPE} surety bond on file` as const;
