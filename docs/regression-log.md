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
- 2026-04-23 | S6.c Lane Analytics runtime crash ("Cannot read properties of undefined (reading 'toFixed')") — root cause was shape mismatch between backend response (marginPct/avgRatePerMile/loads, byEquipmentType with avgMarginPercent) and frontend interface declarations (marginPercent/avgRate/volume, byEquipment with avgMargin). Three unguarded .toFixed() calls crashed on the undefined fields whenever backend returned non-empty data. Fixed by adding typed BackendLaneResponse + BackendMarginResponse interfaces and adapter functions (adaptLanesResponse / adaptMarginResponse) that map backend shape → frontend shape at the useQuery boundary. Stats object also derived locally (backend doesn't return it). Trend defaults to "FLAT". Full backend/frontend contract alignment deferred to Phase 6 architectural debt. Secondary issue (error-boundary text white-on-white) consolidated under Phase 6 Theme System Cleanup. | v3.7.n.9
- 2026-04-28 | BOL freight table rendered single aggregated row even when load.lineItems contained multiple rows (L2228322560 surfaced this — two LoadLineItem rows summed into one 48"×42"×52" body row). pdfService.ts now iterates load.lineItems, draws one body row per item with its own pieces / packageType / description / dimensions / weight / freightClass / NMFC / hazmat, dashed horizontal separator between rows, totals strip aggregating the full lineItems array. Cap of 10 rendered rows on page 1 with a cream-tinted "+N additional line items — full manifest attached" footer note when exceeded. Falls back to legacy single-row from flat fields when lineItems is empty. | v3.8.d
- 2026-04-28 | Public /tracking page rendered HTML entities literally (`Dry Van 53&#x27;` instead of `Dry Van 53'`) on equipment, commodity, shipperName and other public-facing string fields. Root cause: backend sanitizeInput middleware (server.ts:150) HTML-escapes every req.body string for XSS defense, so values containing apostrophes/quotes/angle-brackets are stored encoded; PDFKit decodes at its own boundary (pdfService safe()), but React text nodes don't auto-decode. Fixed by applying decodeHtmlEntities on the public-page serializer for: equipment, commodity, origin/destination city/state, shipperName, carrierFirstName, lastLocation city/state, stops city/state, checkCalls city/state. Decode is scoped to the public response — internal AE Console responses keep escaped form. | v3.8.d
- 2026-04-29 | BOL renderer (backend pdfService.ts) read from the master customer record for the Shipper section instead of from per-load physical-location fields, AND emitted literal placeholder strings ("[Consignee Facility]", "[Shipper Ref]", "[Contact · Phone]", "None  ·  [per-load notes]") into the printed BOL when binding logic was missing or fields were empty. Diagnosed via direct DB query of L2228322560 — `originCompany: 'Mainfreight N Lake'` and `destCompany: 'Pharmaloz Manufacturing'` populated correctly but BOL showed customer name `Beekeepers Naturals USA Inc.` and literal `[Consignee Facility]`. Frontend BOLTemplate.tsx already reads load-level fields correctly so the divergence was backend-side only. Fixes: Shipper reads `load.originCompany || load.shipperFacility || load.customer?.name`; Consignee reads `load.destCompany || load.consigneeFacility` (no customer fallback per CLAUDE.md §3.9); SHIPPER REF walks the schema's 4-field PO chain (`poNumbers[0] → shipperReference → shipperPoNumber → customerRef`); empty contact line renders em-dashes; empty special instructions renders "None". LoadBOLData interface extended with originCompany, destCompany, poNumbers, customerRef. Closes the previously-specced v3.8.c.1 micro-patch by merging it in. | v3.8.d.1
- 2026-04-29 | sanitizeInput middleware was HTML-entity-escaping every req.body / req.query / req.params string at write time for XSS defense, causing values containing apostrophes / quotes / angle-brackets to be stored encoded in the DB. Symptom surfaced on /tracking (v3.8.d) and BOL renderer (v3.8.d.1) where every consumer needed a compensating decode pass. Architectural fix: middleware rewritten to do INPUT hygiene only (trim, null-byte strip, 10k length cap) — no HTML entity escaping. XSS defense moves to OUTPUT layer per OWASP guidance: React auto-escapes JSX text nodes, pdfService safe() handles PDF, JSON encoding handles its own char-set. /api/webhooks exemption retained for raw external payloads. Companion one-time migration script `backend/scripts/decode-encoded-load-fields.ts` walks the loads table and decodes 19 tracked fields in place (idempotent). Defense-in-depth: pdfService safe() and trackingController decodeOpt() retained for one sprint cycle; removal candidate in v3.8.e. Spec correction: spec stated /api/orders is currently exempted as v3.8.c bandaid, but security.ts source confirms only /api/webhooks is exempted — no re-enable needed. | v3.8.d.2
- 2026-04-29 | Order Builder allowed re-attempting "Create load" on an already-converted order, producing HTTP 409 "Order already converted" (orders.ts:212) with no UI guard. Root cause: resumeDraft hydrated the form from order.formData but never inspected order.loadId, so a draft that had previously been converted resumed as if fresh. Fix: track loadId in component state, render an amber "This order has already been converted to a load" banner with deep-link to /dashboard/loads, and disable the Create load button when loadId is set. Backend GET /:id now joins the load record to expose loadReferenceNumber + loadNumber for the banner's identifier. Backend GET /?status=draft adds loadId: null to the where clause as defense-in-depth. Frontend drafts list defensive-filters d.loadId client-side too. | v3.8.d.3
- 2026-04-29 | Migration script `decode-encoded-load-fields.ts` did not handle double-encoded values (e.g. `Dry Van 53&amp;#x27;` from rows written through the old sanitizeInput middleware twice). The decodeHtmlEntities utility's single-pass replace doesn't re-scan replaced regions, so one call yields `Dry Van 53&#x27;` not `'`. Fix: new decodeUntilStable helper iterates up to 5 times, stops when output is unchanged. Cap prevents runaway loops on malformed input. | v3.8.d.3
- 2026-04-29 | BOL SHIPPER REF cell rendered only the first PO number from `load.poNumbers[]` even when multiple POs were entered in Order Builder. v3.8.d.1 spec deferred multi-PO display ("rendering more than poNumbers[0] — separate feature") but a real shipper-side reconciliation issue exists when only one of two POs prints. Fix: new formatPoList helper in pdfService — bare value for 1 PO, comma-joined for 2 ("1472, 5678"), "first, second +N more" for 3+. Stays within the metaCell width constraint (~91pt at fontSize 9.5 with lineBreak: false). | v3.8.d.4

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
- **S6.c secondary issue** — AE Console error boundary (`frontend/src/app/dashboard/error.tsx:18` and `frontend/src/app/error.tsx:18`) renders "Something went wrong" heading with `text-white`, which gets remapped to dark via globals.css `[data-mode="light"] .text-white !important`. Result: white-on-white fallback text on the cream/light page bg. Observed 2026-04-23 during S6.c Lane Analytics crash investigation; same root cause as S6.a Send Outreach modal dim-text. Fixed together with the root theme-remap cleanup — no separate commit.

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
- **Load Board "New Load" modal vs. Order Builder overlap** — Load Board "+ New Load" (`dashboard/loads/page.tsx` → `CreateLoadModal`, 4-step wizard: Route/Freight/Pricing/Review, ~15 fields) duplicates the purpose of Order Builder (`/dashboard/orders`, ~40 fields with facility lookups, PU/DEL windows, dispatch method, pricing intelligence, tender configuration). Two surfaces for one task. Observed during v3.7.n.8 S6.b verification 2026-04-23.
  - Decision required: consolidate on Order Builder as canonical order-entry, OR keep modal as a quick-capture surface with explicit "Finish in Order Builder" graduation path.
- **`sanitizeInput` middleware HTML-escape-everything pattern** — `backend/src/middleware/security.ts` runs `escapeHtml` on every string in `req.body` / `req.query` / `req.params` for XSS defense. Two side effects: (a) values like `Dry Van 53'` are stored in the DB as `Dry Van 53&#x27;`, requiring decode at every output boundary that doesn't auto-decode (PDFKit, React text nodes); (b) any developer reading the DB sees encoded values that don't match what was entered. Today the workaround is per-boundary decode (`pdfService.ts safe()` for PDFs, `trackingController.ts decodeOpt()` for public /tracking). Long-term options: (1) move sanitization to output (template engine / React already auto-escape — input-time escaping is double-escape on output anyway), (2) keep input-time but use a content-aware filter (DOMPurify) instead of blanket entity-encoding, (3) keep current middleware but add a global response interceptor that decodes on serialization. Not an Apollo blocker; deferred. Surfaced 2026-04-28 during v3.8.d /tracking encoding fix.
- **BOL multi-line page-2 dynamic rendering** — v3.8.d caps page-1 line-item rendering at 10 rows with a "+N additional line items — full manifest attached" footer note. For loads exceeding the cap, page 2+ should render the overflow with proper pagination (header/footer carried, totals on final page). Apollo-shipped loads will be 1–3 lines in practice so the cap is defensive only; tackle when actual load pattern shows >10 lines becoming common, OR when a customer specifically requests multi-page manifests on the BOL itself. Logged 2026-04-28.
  - Questions to resolve before acting:
    1. Does Order Builder handle both pre-dispatch creation AND post-dispatch editing?
    2. Do both surfaces create records via the same backend controller, or are there two fragmented data paths?
    3. Which surface does Wasi actually use in daily ops?
  - Not a bug — both flows currently work. Logged as architectural / UX consolidation debt for Phase 6 post-Apollo launch.
- **No "Edit Load" UI for converted orders** — surfaced 2026-04-29 during v3.8.d.4 BOL audit. Backend has the capability: [`PUT /loads/:id`](backend/src/routes/loads.ts#L37) calls `updateLoad` ([loadController.ts:706](backend/src/controllers/loadController.ts#L706)) and accepts `createLoadSchema.partial()` (any field). Authorized for BROKER/ADMIN/CEO/DISPATCH. Frontend has zero callers — only `PATCH /loads/:id/status` (status advancement) and `/carrier-status` are wired. No "Edit details" button on the Load Board row, no edit modal anywhere. The Order Builder's converted-order banner (v3.8.d.3) explicitly says "Editing here will not change the dispatched load" — true, because the form writes to `order.formData`, never to the live Load. Practical consequence: if a customer changes a PO, weight, pickup window, or commodity after conversion, ops staff has no UI path to update the load; today's only options are cancel + recreate, direct API call via dev tools, or DB edit. Phase 6 sprint candidate: **EditLoadModal** that mirrors Order Builder fields, calls `PUT /loads/:id`, gates by status (e.g. only fully editable up to `LOADED` — once `IN_TRANSIT`, fields like origin/dest shouldn't change because the carrier is executing), and writes back to the source `order.formData` so re-printed BOLs stay in sync. Effort estimate: 100-200 lines, single sprint.
- **Track & Trace has no load-status advancement controls** — surfaced 2026-04-29. Backend permits the transition (`PICKED_UP → IN_TRANSIT` is in [VALID_TRANSITIONS:435](backend/src/controllers/loadController.ts#L435), and `PATCH /loads/:id/status` is the wired endpoint). The Load Board uses it: `STATUS_ACTIONS["PICKED_UP"] = "In Transit"` renders a button on the row ([page.tsx:98](frontend/src/app/dashboard/loads/page.tsx#L98)). The Track & Trace module ([dashboard/track-trace/](frontend/src/app/dashboard/track-trace/)) has 7 tabs (Details / Tracking / Activity / Check Calls / Docs / Photos / Exceptions / Finance) but **zero `api.patch('/loads/:id/status')` calls** — the only status-touching write is `POST /check-calls` with hardcoded `status: "IN_TRANSIT"`, which sets the *check-call's* status field, not the load's. So today, advancing PICKED_UP → IN_TRANSIT (or any in-flight status transition) requires bouncing back to the Load Board. Phase 6: add a status-advancement control to the T&T LoadDetailDrawer header — same `updateStatus` mutation as the Load Board, gated by `VALID_TRANSITIONS`. Small change, big UX win for dispatchers who spend their day in T&T.
- **Convert-to-load bypass of `loadController.createLoad`** — caught during v3.8.c Order Builder integration. [routes/orders.ts:242-338](backend/src/routes/orders.ts#L242-L338) writes directly via `prisma.load.create` instead of calling the controller, which required duplicating field-mapping + line-item validation logic. Short-term fix in v3.8.c: exported `buildLineItems` and `LineItemCreateInput` from `loadController.ts` and imported them in `routes/orders.ts`. Long-term refactor: consider routing convert-to-load through `loadController.createLoad` (would need to thread order-state-transition side effects — `prisma.order.update` status to `load_created`, `logLoadActivity`, `logCustomerActivity`, `createCheckCallSchedule`, waterfall build/start, tracking-link fan-out — through the controller or a post-hook system). Also check whether other Load write paths (`shipperPortalController:816`, `emailToLoadService:470` — per v3.8.a schema audit) have the same bypass pattern and need similar updates as line-item support rolls forward. All three direct-write paths currently accept the v3.8.c lineItems only via the `convert-to-load` route; the other two still rely on flat fields.

## Phase 6 — Order Builder UX Polish (deferred from v3.8.c 2026-04-24)

All three flagged during v3.8.c visual polish pass. Deferred to post-Apollo work stream pending product decisions on edge cases (closed days, catalog size, override semantics, UI indicators for auto-suggested values).

- **F — PU/DEL window time inline with dates.** Current Route section renders pickup-date + pickup-window-start + pickup-window-end across two rows (date on one row, windows on another). AE requested date + window on one row, with delivery matching pattern. Layout restructure in [page.tsx Route section] required — moderate diff. Also need to confirm with designer whether windows stay as raw HH:MM inputs or switch to dropdown/picker (Wasi mentioned "there must be drop down option as well" in the 2026-04-24 thread — unclear whether that's a preset-list dropdown or a time picker component).
- **G — CRM facility operating-hours auto-populate.** When origin/dest facility is picked via `FacilityPicker`, read `CustomerFacility.operatingHours` (JSONB with per-weekday open/close) for the pickup/delivery weekday (derived from `pickupDate` / `deliveryDate`) and auto-fill `pickupTimeStart` / `pickupTimeEnd` (and delivery pair). Product decisions needed: closed-day UI (block or warn?), missing-hours fallback (leave blank vs. default window?), override semantics (lock after manual edit vs. re-overwrite on facility change?), and whether the user-visible indicator for "auto-populated from facility hours" should be distinct from existing "Auto-filled" badges.
- **H — NMFC + freight-class auto-suggest on line items.** Two sub-items:
  - **H1 — Commodity description → NMFC lookup.** Build a small `COMMODITY_NMFC_MAP` in `types.ts` similar to existing `COMMODITY_CLASS_MAP`. Product decision: initial catalog size (common freight classes only, or broader NMFC catalog import?) and override semantics (mirror the "clears on manual edit" pattern from freight-class auto-suggest).
  - **H2 — Density-based freight class.** Real LTL logic: `density = weight ÷ (L × W × H ÷ 1728 cubic feet)` → map to class bracket (e.g., density > 30 → 50; 22.5–30 → 55; … 1–2 → 400; <1 → 500). Only fires when all four inputs (weight + L + W + H) are filled. Product decision: density-based takes priority over description-based or vice versa? UI indicator for which signal drove the suggestion?
  - Neither is a correctness issue — current description-based class suggester covers the common case. These are precision enhancements for AE power users.

## Phase 6 — Content / Editorial

- Shippers page "BY THE NUMBERS / Performance That Speaks" section decision — (a) delete, (b) replace with capability block, (c) replace with credentials block. Do NOT fabricate performance metrics. (Duplicate of P2 UX improvements item above; consolidate here when editorial pass begins.)
- Shippers page quote form: city/state vs. full-address UX tradeoff — friction vs. data richness. (Duplicate of P2 UX improvements item above.)
- Page length / density review — marketing pages currently feel long with extra imagery; trim candidates TBD.
- "Get a Free Quote" copy clarity — unclear what info the prospect provides or what they get back. (Duplicate of P2 UX item above.)
