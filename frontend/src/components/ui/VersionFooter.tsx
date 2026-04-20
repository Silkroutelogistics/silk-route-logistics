"use client";

// Version: MAJOR.MINOR.letter (a-z, then bump minor)
// v3.0 — Light mode default, warm stone palette
// v3.1 — Login redesign, mobile responsiveness, design system tokens
// v3.2 — Gmail reply tracking, Lead Hunter DB-persist, full system audit, Compass 25-check wiring
// v3.2.h — BOL v7 (barcode, gold accents, 17 T&C, Mainfreight-style table), Address Book DB, 3D logo
// v3.3.d — Enterprise TMS: Routing Guide, Exception Engine, Broadcast Tendering, Dock Scheduling,
//          Carrier Call Log, Shipper Defaults, Fuel Tables, Geo Heatmaps, Variance Reports,
//          Tagging Engine, PO/SKU Tracking, Backhaul Discovery, Calendar View, GL Codes

// v3.6.c — Mass email overhaul (plain-text + Gmail sig), stage-aware templates,
//          Resend webhook tracking, follow-up sequencer + Queue, engagement scoring
// v3.6.d — Not Interested pipeline stage + idempotent mark flow (button lock,
//          backend 30s dedupe, shared prospectStatusService), filter chip,
//          amber "Not Interested Reply" confirmation chip, warm-badge suppression
// v3.6.e — Forgot-password wired across carrier/shipper/AE Next.js logins
//          (spans → Link, 3 forgot-password + 3 reset-password pages reusing
//          the existing backend endpoint; reset URL routed by user.role).
//          Seeded test carrier decommissioned, README credentials table redacted.
// v3.6.f — Shared site chrome: site-chrome.json drives one React <SiteFooter /> +
//          <SiteNav /> and a prebuild inject-chrome.mjs that templates partials
//          into 13 marketing HTML pages. MC#/Kalamazoo/"Where Carriers Come
//          First" drift collapsed through the single source.
// v3.6.g — Forgot/reset-password pages now share the login split-screen brand
//          aesthetic (navy left panel with map + feature pills + rotating
//          slides + gold-accented insight; cream form panel on right). Shared
//          <LoginBrandPanel variant="ae|carrier|shipper" /> component drives
//          all 6 auth-flow pages across the three login types.
// v3.6.h — HOTFIX for v3.6.f regression. Cleaned orphan HTML that the greedy
//          migrator regex left behind (index, tracking, shippers). Reverted
//          injected nav IDs to legacy names (mainNav, loginBtn, loginWrap,
//          hamburger, mobileMenu, mobileOverlay) so each page's pre-existing
//          inline wiring script resolves without null-deref. inject-chrome now
//          refuses to write if content outside INCLUDE markers changed
//          (SHA-256 integrity guard). New verify-chrome npm script for CI.
//          Deleted buggy migrate-chrome-markers.mjs.
// v3.6.i — Restored pre-Phase-2 walking-penguin nav overlay on index.html via
//          new INCLUDE marker attribute: <!-- INCLUDE:nav logo="penguin" -->.
//          Penguin SVG copied verbatim from commit 36e5636; animation lives
//          in already-loaded srl-logo.css. Marco Polo widget on public site
//          re-skinned to match AE Console light-mode React component (white
//          card + dark navy header + gold accents). Footer logo + 11 auth
//          splash logos wrapped in <a href="/"> for clickability. Integrity
//          guard + verify-chrome regex both updated to accept optional
//          marker attributes.
// v3.7.a — Caravan Partner Program rebrand + BRONZE→SILVER tier migration +
//          v3 Quick Pay pricing (Silver 3%/5%, Gold 2%/4%, Platinum 1%/3% —
//          same-day is universal +2% premium) + getEffectiveTier identity
//          mapping fix (PLATINUM→PLATINUM, GUEST/NONE→SILVER) + new
//          LoadQuickPayOverride Prisma model with per-load audit trail +
//          monthly variance cron emailing CEO on 1st + 7-factor Compass
//          Score block published on /carriers + SOP-012/SOP-013 rewritten
//          with v3 values + carvanService.ts → caravanService.ts rename.
//          BREAKING: CarrierTier enum no longer contains BRONZE.
// v3.7.b — Phase 3 gap-close: QuickPayOverridePanel React component wired
//          into RateConfirmationModal (tier-default fetch, editable applied
//          rate, reason dropdown when Δ ≠ 0, note required on OTHER). New
//          caravanService.test.ts with 9 regression tests guarding the
//          v3.7.a PLATINUM→PLATINUM identity fix + Silver fallback for
//          Guest/None/default. Fixed orphan "Guest → Bronze" string in
//          MarcoPolo system prompt that v3.7.a missed.
// v3.7.c — Public-site tier-copy hotfix. carriers.html tier cards rewritten
//          from v2 Bronze/Silver/Gold (Net-21/14/7, 3.5%/2.5%/1.5%) to v3
//          Silver/Gold/Platinum with locked pricing + FSC pass-through per
//          tier + priority freight on Platinum. Milestone labels aligned
//          to tierService names. index.html Caravan ladder + faq.html
//          Caravan Loyalty Program answer all swept to v3 copy.
// v3.7.d — Phase 4A Truth-Up Cleanup. Removed fabricated volume stats
//          (500+, 12K+, 98%, 99.2%, 15,000+, $50M+, 15-Min, 99.2%) from
//          /carriers hero + coverage, /, /about stats grid (kept only
//          "48 States Covered"), /shipper landing. Deleted fabricated
//          testimonials section on / (Michael Reeves, Petrovic, Chen).
//          "Asset-based brokerage" → "Freight brokerage" / "Property
//          broker" across /, /about, /auth/login, /auth/forgot-password,
//          /auth/reset-password. Retired "$0 Commission" / "Zero
//          Commission" / "Zero Factoring Fees" at 3 locations (/,
//          /carriers Caravan section, / Caravan compact subhead) →
//          replaced with "Full FSC pass-through" + "No factoring
//          contract required" framing. Dropped human-support "24/7"
//          claims at /, /about, /contact, /carriers, /shippers, /shipper
//          landing (Marco Polo AI "24/7" retained — AI is genuinely
//          always-on software). QP comparison table "1-3% flat" →
//          "1% / 2% / 3% by tier". /contact Hours block consolidated to
//          Honest Hours Copy (Mon–Fri 7am–7pm ET + after-hours
//          emergency line). Index trust bar section deleted (1 real
//          stat + 3 fabricated did not warrant the section after
//          removals). Orphan #trust scroll anchor rewired to #shippers.
// v3.7.e — Phase 4B CarrierFraudBanner. New section on /carriers
//          between "Why Carriers" and the Caravan tier structure,
//          communicating SRL's anti-fraud posture: FMCSA authority
//          + insurance verification before dispatch, no re-brokering,
//          BMC-84 bond on file with FMCSA. Fraud-report CTA links to
//          mailto:compliance@silkroutelogistics.ai (email already
//          operational — referenced across insuranceVerificationService,
//          complianceMonitorService, secEdgarService). Navy/gold
//          brand treatment, not alarming red. Shield icon glyph,
//          flex-wrap layout for mobile responsiveness.
// v3.7.f — Chrome micro-fix. Migrated .nav-login-btn /
//          .nav-login-wrap / .nav-login-dropdown CSS from
//          pages/index.css (homepage-scoped) to shared/css/
//          utilities.css (loaded on every marketing page). Fixes
//          unstyled "Sign In" button artifact on /carriers, /about,
//          /contact, /shippers, /faq, /blog, /careers, /privacy,
//          /terms, /tracking, /register, /login — originally
//          introduced in v3.6.f shared-nav migration but only
//          wired on homepage. Option B: added 8 CSS variables
//          these rules depend on to utilities.css :root block
//          using values verified identical across pages. No rule
//          body changes. Deeper variable consolidation filed as
//          Phase 5 tech-debt.
// v3.7.g — Phase 4C positioning rewrite. Homepage hero reframed
//          around carrier economics ("Freight brokerage built for
//          the carrier's side of the bill."). /carriers full
//          narrative rewrite: new hero ("The Caravan Partner
//          Program. Three tiers, one principle — the rate you see
//          is the rate you earn."), three commitments section
//          (100% FSC pass-through, itemized quotes, Quick Pay
//          without factoring contract), honest math box showing
//          $2,200-load economics side-by-side with typical-broker
//          figures (no named competitors; Option B disclaimer),
//          Milestones M1–M6 advancement path, "What's coming"
//          roadmap framing rate cards / fuel card / insurance
//          referrals / equipment financing as aspirational not
//          current, new closing CTA. All copy traces to Honest
//          Claims Whitelist. Also fixed contact.html:247 FAQ
//          (retired "Caravan Carrier Program" + v2 QP values →
//          "Caravan Partner Program" + v3 values).
export const SRL_VERSION = "3.7.g";

export function VersionFooter({ className }: { className?: string }) {
  return (
    <p className={`text-[10px] ${className || ""}`} style={{ color: "var(--srl-text-muted)" }}>
      SRL v{SRL_VERSION}
    </p>
  );
}
