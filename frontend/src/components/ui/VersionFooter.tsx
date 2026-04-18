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
export const SRL_VERSION = "3.6.i";

export function VersionFooter({ className }: { className?: string }) {
  return (
    <p className={`text-[10px] ${className || ""}`} style={{ color: "var(--srl-text-muted)" }}>
      SRL v{SRL_VERSION}
    </p>
  );
}
