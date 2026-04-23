# SRL Defect + Issue Log

Running catalog of known defects, open issues, and
quality concerns. Updated continuously. Lives in git
so it's searchable and never lost.

## Format per entry
- One-line symptom description
- Page / component / file where it lives
- Severity: P0 (prospect-blocking) / P1 (visible but non-blocking) / P2 (cosmetic)
- Status: Open / Investigating / Fixed in <commit>
- Date noted

---

## Open — discovered 2026-04-22 evening

### P2 — "Get a Free Quote" information vague
- Form / section — needs content rewrite
- Unclear what info the prospect provides or what they get back

---

## S6 family — AE Console defects (all P1, pre-existing)

### S6 (parent) — AE Console: some tabs render "super dark"
- Location: Various AE Console tabs (specific labels TBD)
- Symptom: Visual defect, usable but wrong — tabs render with very dark backgrounds that hurt readability
- Severity: P1 visual
- Status: Open, parent-level audit deferred until specific tab labels are enumerated
- Discovered: 2026-04-22

### S6.c — Lane Analytics: runtime crash on undefined .toFixed()
- Location: AE Console → Lane Analytics tab
- Symptom: Error boundary renders "Something went wrong" with stack trace "Cannot read properties of undefined (reading 'toFixed')"
- Secondary issue: Error message text rendered white-on-white, barely visible
- Severity: P1 functional crash + visual defect in error state
- Status: Open, will audit and fix in v3.7.n.9
- Discovered: 2026-04-23

---

## Open — content density concerns (not bugs, design debt)
- Some pages feel long with too much info + extra pictures
- Candidates for trim: TBD (list tomorrow)
- Scope: content editorial, separate from technical defects

## P2 — UX content improvements (tradeoffs to decide during editorial pass)
- Shippers page quote form: "Origin City/State" and "Destination City/State" fields — open question whether to require full address including street + ZIP (higher friction, richer data) or keep city/state (lower friction, faster lead capture). UX tradeoff to decide during editorial pass, not a bug.
- Shippers page "BY THE NUMBERS / Performance That Speaks" section — currently shows only "48 States Covered" with no other stats. Pre-launch, no real operational numbers to report. Editorial decision required: (a) delete section, (b) replace with capability block, (c) replace with credentials block. Do NOT fabricate performance metrics. Defer to Friday/weekend editorial pass.

---

## Fixed — recent

- 2026-04-22 | Compass logo missing on prod BOLs | v3.7.o-build-prep + Render dashboard
- 2026-04-22 | Email signature file-not-found | v3.7.o-build-prep.1 + Render dashboard
- 2026-04-22 | Sign In dropdown Shipper/Carrier labels invisible | v3.7.n.1
- 2026-04-22 | CI feature flag test timeout flaky | v3.7.n.2
- 2026-04-23 | Shippers page content invisible below hero (JS null-dereference on getElementById('hamburgerBtn') halted IIFE) | v3.7.n.3
- 2026-04-23 | Carrier page CTA "Questions?" line invisible (black text on navy-gradient bg) + onboarding email updated accounting@ → carriers@ | v3.7.n.4
- 2026-04-23 | Track page logo rendering at intrinsic PNG dimensions (tracking.html missing srl-logo.css link) | v3.7.n.5
- 2026-04-23 | Track page footer layout collapsed to centered text stack (tracking.css had 2-rule stub; ported full 4-column rules from carriers.css, adapted for navy bg) | v3.7.n.5
- 2026-04-23 | Contact page "Find Us" map: deprecated Google Maps iframe endpoint no longer renders; replaced with static location card + "Open in Google Maps" link | v3.7.n.6
- 2026-04-23 | Lead Hunter Send Outreach modal body text + Cancel button rendering text-slate-400 on dark navy bg (3.2:1 contrast, failed WCAG AA for body text); swapped to text-slate-300 (4.8:1) matching readable-sibling convention | v3.7.n.7 — SUPERSEDED: root cause is globals.css [data-mode="light"] .text-slate-* !important overrides that reverse colors on dark surfaces; this partial fix had no visual effect in light mode. Full fix deferred to Phase 6 theme cleanup.
- 2026-04-23 | Portal dashboard layouts (Shipper + Carrier) token-always-null auth guard — 2-month silent regression from 2026-02-23 commit 172d6f3b security hardening (localStorage → httpOnly cookie migration updated auth stores but missed the two downstream dashboard layouts). Bypassed AuthGuard.tsx pattern that kept AE Console working. Also broke the notifications useQuery (enabled: !!token) in both layouts during the same window. Fixed by matching the AuthGuard user-presence + loadUser() pattern. | v3.7.n.7.1
- 2026-04-23 | S6.b Load Board "+ New Load" button non-functional when no load is selected — CreateLoadModal render was nested inside a {load && (...)} wrapper (introduced 2026-03-31) while the button was added outside it (2026-04-08 commit 10e0ea3d). Clicks toggled state correctly but the modal was unmounted when no load was selected (the typical Load Board open state). Fixed by moving the modal render out of the wrapper; added clarifying comment to prevent re-nesting during future cleanups. | v3.7.n.8

---

## Deferred

- Mobile menu dropdown — not verified post-v3.7.n.1, may share same bug
- AWS Rekognition SDK fallback on prod — biometric verification using hash-based
- BOLTemplate.tsx preview pane visual mismatch with downloaded PDF — honest-label banner shipped in v3.7.o
- security-policy.html does NOT load srl-logo.css, but this is NOT the same bug as S4 on tracking.html. security-policy.html uses its own nav structure + its own 32px logo sizing rule (not the shared .srl-logo-* classes). Page renders correctly as-is. Adding srl-logo.css would be a no-op. Flagged here for future nav-unification phase consideration (converting security-policy.html to use the shared nav partial would be the right tidy-up, but is scope creep for hotfix commits).
- 2026-04-23 | CSV Import modal in Lead Hunter tab: 2 parallel text-slate-400 → text-slate-300 contrast fixes needed (same pattern as S6.a Send Outreach modal, flagged during v3.7.n.7 audit). Defer to follow-up micro-commit; not prospect-blocking, internal AE Console only. — SUPERSEDED by Phase 6 theme cleanup (see below); the root cause is the globals.css text-slate-* light-mode overrides, not the individual class names.

---

## Phase 6 — Portal Approval Workflow (post-Apollo launch)

- **S-2 (P0 policy)** — Shipper approval gate in backend (`authController.ts handleVerifyOtp`). Currently absent; any registered SHIPPER can log in immediately after OTP. Mirror carrier-auth pattern: check `customer.onboardingStatus !== "APPROVED"` → return 403 with friendly message. See `my-knowledge-base/wiki/` for intended flow (docs sparse — will need to write).
- **S-3 (P1)** — Shipper approval UI in AE Console. No current analog exists (`accounting/credit` is credit-limit management, not portal-access approval). Create a dedicated surface: `/dashboard/shippers` with an Approve button mirroring `dashboard/carriers/page.tsx:730`.
- **Credit check integration** — service TBD. Candidates: Experian Business, D&B, manual SOP. Once picked, wire into S-2 gate as prerequisite for APPROVED status.
- **Carrier self-service onboarding UI** — upload COI / W9 / Authority letter, view application status. Schema supports flags (`w9Uploaded`, `insuranceCertUploaded`, `authorityDocUploaded`) but no carrier-facing UI exists. Required to move from carrier "under review" dead-end to actionable workflow (C2 from Batch Alpha audit 2026-04-23).
- **Carrier status-check / next-steps page** for PENDING state. Currently the "under review" screen is a text-only 403 with no forward path. Needs a companion landing for PENDING carriers showing what's required to progress.
- **Shipper "application under review" UX** — once S-2 gate is added, shippers hitting the gate need the same quality of messaging. Scope alongside S-2 + S-3.
- **C3 clarification** — verify/document that `dashboard/carriers/page.tsx` Approve/Reject button role-gate (`ADMIN || CEO` only, line 730) is intentional. If OPERATIONS/DISPATCH/BROKER roles should also approve, widen the guard. If not, document the rationale in CLAUDE.md.

## Phase 6 — Theme System Cleanup

- **Root-cause fix for `[data-mode="light"] .text-slate-*` `!important` overrides in globals.css** (lines 162-173). The current scheme remaps dark-mode Tailwind text classes to dark values in light mode, which backfires on modals/panels that hardcode dark backgrounds. Options: scope the overrides to exclude dark-surface containers, OR remove the global remap and theme individual components explicitly, OR adopt a `.dark-surface` opt-in class.
- **14 candidate surfaces to re-audit after root fix ships** (from v3.7.n.7.1 audit): Send Outreach modal, CSV Import modal, MarcoPolo widget, `/onboarding/page.tsx`, `/admin/users/page.tsx`, `/shipper/dashboard/layout.tsx`, `/accounting/layout.tsx` (covers all 13 accounting routes), plus others flagged via `bg-[#1e293b]` / `bg-[#1a1f35]` / `bg-[#141a2e]` / `bg-[#1a2340]` / `bg-[#0A0B0F]` / `bg-[#0a1120]` / `bg-[#121e30]` hex usages that escape the globals.css bg-remap but still trigger the text-remap.
- **CSV Import modal parallel fixes** (already flagged above) — resolve via the root theme cleanup, not per-class touch-ups.
- **S6.a full fix** — theme root-cause resolves this; the partial v3.7.n.7 class swap is irrelevant in light mode and can be reverted or left as documentation only.

## Phase 6 — Portal + Public Page Visual Alignment (observed 2026-04-23 post-v3.7.n.7.1 verify)

- `/shipper` (singular, portal landing page at silkroutelogistics.ai/shipper) uses a distinct dark-theme visual system that diverges from the rest of the marketing site (/shippers.html, /carriers.html, /contact.html, /about.html, homepage). Specific divergences:
  - Hero "Ship Smarter with Full Freight Visibility" uses different type and layout treatment than homepage hero
  - "How Our Freight Brokerage Platform Stacks Up" comparison table has functional content but visual identity disconnected from marketing site
  - Dark theme vs. cream/light elsewhere
  - Gold accent application doesn't match canonical CANONICAL/LEGACY/SUPERSEDED bucket split from CLAUDE.md §2.1
  - Verify: is `/shipper` intended as a prospect-facing landing OR as a post-authentication upsell view? If prospect-facing, it should match the marketing site design system. If authenticated-only, it should match the portal design system (which itself needs theme alignment per existing Phase 6 Theme System Cleanup entry above).
- `/shippers.html` (plural, marketing-site page) vs `/shipper` (portal landing) — two separate pages with similar intent but different design systems. Evaluate whether both should exist; if yes, both should match the same canonical system.
- Observed during manual portal verification after v3.7.n.7.1 login regression fix. Not a bug, not a blocker, purely visual/editorial debt. Route functions correctly.
- Carrier Portal landing equivalent (`/carrier` vs `/carriers.html`) likely has same divergence — verify during Phase 6 portal visual refresh pass.

## Phase 6 — CI / Testing Gaps

- **E2E smoke tests for SHIPPER/CARRIER portal login flows.** The 2026-02-23 → 2026-04-23 regression went undetected for 2 months because no such test exists. Candidates: Cypress or Playwright. Minimum coverage: (1) valid shipper credentials → OTP → reach /shipper/dashboard without bounce; (2) same for carrier (requires approved carrier fixture); (3) invalid credentials rejected; (4) OTP expiry.
- **E2E smoke for AE Console login flow** — currently working via AuthGuard.tsx, but same class of regression possible in future store refactors. Same coverage pattern.
- **CI regression assertion** — consider a unit test that asserts `useAuthStore.token` and `useCarrierAuth.token` are never used as auth guards in any dashboard layout (grep-based lint). Would have caught the 172d6f3b regression at commit time.

## Phase 6 — Architecture & Refactors

- **Audit all `.token` / `tempToken` usage across the codebase after 172d6f3b.** Known benign latent consumers (from v3.7.n.7.1 audit): `dashboard/layout.tsx:10`, `accounting/layout.tsx:63`, `carrier/login/page.tsx:47,51` (all pass to MarcoPolo or do non-blocking redirects). Validate no new consumers accrue and decide whether to remove the dead `token` field entirely from both stores.
- **`useSessionTimeout` hook** — audit whether its redirect / state logic depends on `store.token` being populated. Not explicitly tested in v3.7.n.7.1; the hook was left untouched but deserves verification.
- **`/accounting/approvals` naming collision** — this route is for carrier payment-settlement approvals (AR), but "approvals" is frequently misread as application/portal approval. Rename to `/accounting/payment-approvals` or `/accounting/settlements-approvals` when next touched.
- **Orphan marketing pages in `frontend/public/`** — `login.html` + `register.html` at root alongside `auth/login.html` and `auth/register.html`. Decide which is canonical, redirect the other, remove duplicates.
- **Dead `.login-dropdown` CSS block in `utilities.css`** (lines 191-238) — entire alternate dropdown styling system with no HTML consumer. Likely remnant from abandoned redesign. Remove once confirmed unused.
- **Shared `/shared/css/footer.css` partial** — v3.7.n.5 ported footer rules from `carriers.css` to `tracking.css`. Cleaner long-term: extract shared footer rules into a partial loaded by all marketing pages. Scheduled for Phase 5 CSS variable consolidation per CLAUDE.md §13.
- **Consolidate `carrierAuth.ts` duplication with shared `authController.ts`** — password-expiry, TOTP, session registration are duplicated between the two. Only the approval gate is carrier-specific. Refactor candidate once portal patterns stabilize.
- **`CarrierProfile.onboardingStatus` vs. `status` enum redundancy** — two overlapping status enums on the same model. Only `onboardingStatus` gates login; `status: CarrierApplicationStatus` is tracked but unused for auth. Consolidate or document the divide.

## Phase 6 — Content / Editorial

- Shippers page "BY THE NUMBERS / Performance That Speaks" section decision — (a) delete, (b) replace with capability block, (c) replace with credentials block. Do NOT fabricate performance metrics. (Duplicate of P2 UX improvements item above; consolidate here when editorial pass begins.)
- Shippers page quote form: city/state vs. full-address UX tradeoff — friction vs. data richness. (Duplicate of P2 UX improvements item above.)
- Page length / density review — marketing pages currently feel long with extra imagery; trim candidates TBD.
- "Get a Free Quote" copy clarity — unclear what info the prospect provides or what they get back. (Duplicate of P2 UX item above.)
