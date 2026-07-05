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

// v3.8.aqj — the Broker-Carrier Agreement text + version now live ONLY in the
// backend (backend/src/data/agreements.ts) and are fetched via
// GET /carrier-auth/agreement/broker-carrier, so the activation review pane, the
// onboarding click-through, and the executed PDF all render ONE source. The
// frontend BCA_ARTICLES / BCA_VERSION copies were removed to end the drift.
export const QP_VERSION = "2026-05-24-v1";

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
