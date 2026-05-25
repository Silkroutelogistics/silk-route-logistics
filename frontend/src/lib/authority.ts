/**
 * v3.8.akg §13.3 Item 8.9 — Client-side mirror of the canonical
 * authority block. Pairs with backend/src/config/authority.ts; both
 * modules MUST stay value-identical. Any value change to one
 * requires the same change to the other.
 *
 * Consumed by client-rendered React surfaces that print or display
 * legal-identity fields — BOLTemplate.tsx (PDF render component
 * used in the AE Console preview surface), RateConfirmationModal.tsx
 * (RC form's SRL_INFO block that pre-fills the rate-con header).
 *
 * Surfaces that should NOT consume from here (use existing canonical):
 *   - Public HTML pages — render via inject-chrome.mjs from
 *     frontend/src/lib/site-chrome.json (already authoritative).
 *   - _partials/footer.html — direct edit (already authoritative).
 *   - Lead Hunter outreach signature — backend/src/config/signatures/
 *     whaider.html SOT.
 *
 * See backend/src/config/authority.ts header for full verification
 * provenance.
 */

// ─── Legal identity ──────────────────────────────────────────────

export const ENTITY_NAME = "Silk Route Logistics Inc." as const;
export const TAGLINE = "Where Trust Travels." as const;
export const DOMAIN = "silkroutelogistics.ai" as const;

export const MC_NUMBER = "1794414" as const;
export const DOT_NUMBER = "4526880" as const;
export const MC_LABEL = `MC# ${MC_NUMBER}` as const;
export const DOT_LABEL = `DOT# ${DOT_NUMBER}` as const;

export const BOND_TYPE = "BMC-84" as const;
export const BOND_AMOUNT = "$75,000" as const;

// ─── Principal address ──────────────────────────────────────────

export const PRINCIPAL_ADDRESS_STREET = "2317 S 35th St" as const;
export const PRINCIPAL_ADDRESS_CITY = "Galesburg" as const;
export const PRINCIPAL_ADDRESS_STATE = "MI" as const;
export const PRINCIPAL_ADDRESS_ZIP = "49053" as const;
export const PRINCIPAL_ADDRESS_ONE_LINE =
  `${PRINCIPAL_ADDRESS_STREET}, ${PRINCIPAL_ADDRESS_CITY}, ${PRINCIPAL_ADDRESS_STATE} ${PRINCIPAL_ADDRESS_ZIP}` as const;

// ─── Contact ────────────────────────────────────────────────────

export const PHONE = "(269) 220-6760" as const;
export const OPERATIONS_EMAIL = "operations@silkroutelogistics.ai" as const;
