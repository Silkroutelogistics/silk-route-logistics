# Silk Route Logistics — Project Context (CLAUDE.md)

This file is the single binding source of truth for any Claude Code session working in this repo. Read it at session start. Rules below override all defaults. Follow them exactly.

Last consolidated: Phase 6.2 close (v3.8.ee, sprint span `7c74bb1`–`df3545f`).

---

**Where the rest of the context lives.** This file is injected into every session AND into every
subagent's system prompt, so its size is not a style question: at ~405,000 tokens it exceeded the whole
context window of any 200k model, which is why §2.5 rule c is suspended. What a session needs *every*
time stays here. What it needs only when doing a named kind of work moved to `docs/claude/`; what is
closed or historical moved to `docs/claude/archive/`. See `docs/claude/README.md` for the conventions.

**§ numbers never change.** 2,332 `§N` citations exist across the codebase (§13.3 alone is cited 599
times). Content moved; labels travel with it, and the `§N` heading stays here as a one-line stub naming
the file the body now lives in — so a citation still lands somewhere that tells you where to look.
Renumbering anything would go stale across 599 comments in a single commit. Do not do it.

---

## §1 PROJECT IDENTITY

- **Legal entity:** Silk Route Logistics Inc. (Michigan C-Corp)
- **Principal address:** 2317 S 35th St, Galesburg, MI 49053. Filed with FMCSA, listed on BMC-84 bond paperwork, and appears on the filed Bill of Lading. Galesburg is inside Kalamazoo County, so county-level venue references (§14 and Broker-Carrier Agreement §10, which the Quick Pay Agreement incorporates by reference rather than restating) remain correct as "Kalamazoo County". Correction history: earlier CLAUDE.md revisions listed Kalamazoo as principal city — that was a session-memory error corrected in v3.7.i; see §3.13 for the rule it codified.
- **FMCSA authority:** USDOT 4526880, MC# 1794414, active property broker
- **SCAC:** SILT — issued by NMFTA August 2026 (applied 2026-08-12 via scaccode.com; entity type broker, non-Class-8 identity verification completed). Renews annually on NMFTA's July 1 – June 30 cycle (~$115/yr including the $5 identity-verification fee) — add to the compliance calendar alongside BMC-84 and UCR. Use on shipper routing guides, customer onboarding/TMS setup forms, and EDI transactions (204/214/210) when that module goes live. Source: NMFTA-issued certificate emailed to whaider@ (primary source per §3.13).
- **BMC-84 surety bond:** $75,000, filed with FMCSA, surety PFA Protects (CA# 0M18074), completed February 19, 2026. BOC-3 process agent designation also on file.
- **Domain:** silkroutelogistics.ai
- **Tagline:** "Where Trust Travels."
- **Phone:** (269) 220-6760
- **Founder/CEO:** Wasi Haider. Internal tool surfaces may reference by name per §3.10; public marketing pages must not (see §5 Prohibited Claims).
- **Primary contact emails:**
  - `whaider@silkroutelogistics.ai` — founder/CEO, prospect outreach sender
  - `accounting@silkroutelogistics.ai` — AR, carrier pay inquiries
  - `compliance@silkroutelogistics.ai` — fraud reports, BMC-84 claims, FMCSA contact
  - `noreply@silkroutelogistics.ai` — system/transactional emails only
  - `operations@silkroutelogistics.ai` — customer-facing operations contact. Used on BOL, Rate Confirmation, Invoice, and other shipper/carrier-facing documents generated via the `srl-brand-design` skill. Routes to `whaider@` until the Pakistan-based AE/Compliance hire (Oct 2026), at which point routing flips to that inbox without requiring document reissue. The forward-looking aliasing avoids a future BOL-template churn when the hire lands.
  - `sales@silkroutelogistics.ai` — inbound prospect/lead intake. The public quote form at `/shippers.html#quote-form` (POST `/api/leads/website`) creates `WebsiteLead` rows + fires a notification + shipper confirmation. **v3.8.amv: the quote-form notification recipient moved from `sales@` → `operations@`.** Resend had auto-suppressed `sales@` after early hard bounces (the v3.8.amu verification tests fired before the inbound alias existed → bounced "user unknown" → Resend blocklisted the address → every later notification showed "Suppressed" in Resend and was never sent, which is why Google's Email Log Search showed 0). `operations@` is the real shared mailbox `sales@` aliases to anyway (Google Workspace: `operations@` mailbox created 2026-05-28, `sales@` is its alias), so leads now land there directly — one inbox alongside the contact form's `operations@` notification. `sales@` remains the public-facing inbound alias (mail TO it routes to the `operations@` shared inbox; only our outbound Resend notification was repointed). (This entry once also cited `frontend/public/ae/communications.html:71`; that whole tree was deleted in v3.8.asc, 2026-08-17 — reference retired 2026-09-21.) Routes to `whaider@` until the first AE/Sales hire. Documented 2026-05-19 (v3.8.aej docs catch-up) per §13.3 Item 8.2.1; recipient repoint 2026-06-02 (v3.8.amv).
  - `carriers@silkroutelogistics.ai` — inbound carrier prospect/application intake. Used on the /carriers.html closing CTA email link and any other carrier-facing onboarding inquiry surface. Mirrors the sales@ pattern but routes to the carrier-side AE/compliance inbox. Routes to `whaider@` (and/or `compliance@`) until the carrier-side hire lands, at which point routing flips to that inbox without requiring page reissue. The forward-looking aliasing avoids future template churn when the hire occurs. Documented 2026-05-21 (v3.8.ahf).
  - `careers@silkroutelogistics.ai` — inbound recruiting/hiring intake. Used on the `/careers.html` "Interested in Joining SRL?" email CTA. Routes to `whaider@` until a hiring lead exists, at which point routing flips without requiring page reissue (same forward-looking aliasing pattern as `sales@`/`carriers@`). Documented 2026-05-31 (v3.8.amg) during the /careers §20 audit (Wasi directive: keep the `careers@` alias rather than repoint to `whaider@`).

---

## §2 ARCHITECTURE

- **Frontend:**
  - Next.js 15 app router (`frontend/src/app/`) — React 19, TypeScript, Tailwind CSS 4, TanStack Query, Zustand, Recharts
  - Static HTML marketing pages (`frontend/public/*.html`) — 13 pages served via Cloudflare Pages auto-deploy from `main`
  - Shared CSS: `frontend/public/shared/css/utilities.css` (loaded on all pages via chrome injector — holds nav-login CSS after v3.7.f migration)
  - Shared chrome: `<!-- INCLUDE:nav -->` + `<!-- INCLUDE:footer -->` markers expanded by `inject-chrome.mjs` prebuild
- **Backend:** Node.js + Express + TypeScript (`backend/src/`) auto-deployed to Render from `main`
- **Database:** Neon PostgreSQL via Prisma ORM. Schema pushed via `prisma db push` — migration history has drift, avoid `prisma migrate dev`.
- **Auth:** JWT with bcrypt, 9 roles: CARRIER, BROKER, SHIPPER, FACTOR, ADMIN, DISPATCH, OPERATIONS, ACCOUNTING, CEO
- **PDF generation:** pdfkit (BOL, Rate Confirmation, Invoice)
- **Email delivery:** Resend. Google Workspace is the mailbox host.
- **Testing:** Vitest — `backend/__tests__/unit/services/` convention
- **CI:** GitHub Actions — lint + typecheck + build on push/PR
- **Brand colors + typography:** see §2.1 Design System below (single source of truth). Short form: gold `#BA7517`, navy resolves from `themes.css` (`#0D1B2A` in the default silk-route-classic light mode), canvas `#faf9f7`, gold tint `#FAEEDA`, dark gold `#854F0B`.
- **Key Prisma models added Feb 2026:**
  - `RateConfirmation` — JSON formData + indexed financial columns, linked to Load
  - `CheckCall` — Track & Trace check-call log, linked to Load + User

### Backend patterns
- Controllers return `void`, use `res.status().json()` directly
- `AuthRequest` extends Express Request with `user?: { id, email, role }`
- Routes use `authenticate` middleware + `authorize(...roles)` + `auditLog(action, entity)`

### Frontend patterns
- Zustand for auth store, axios-based `api` client with token interceptor
- Dark UI theme on authenticated dashboards: navy bg, gold accents (`bg-gold`, `text-navy`), `bg-white/5` cards

### Load status pipeline (full)

```
DRAFT → POSTED → TENDERED → CONFIRMED → BOOKED → DISPATCHED →
AT_PICKUP → LOADED → IN_TRANSIT → AT_DELIVERY → DELIVERED →
POD_RECEIVED → INVOICED → COMPLETED
```

Also: `TONU`, `CANCELLED`, `PICKED_UP` (legacy alias).

### Tender accept → status flip: BOOKED vs DISPATCHED is intentional (Sprint 39 P3 decision)

Three accept paths exist; **DIRECT path produces `BOOKED`, both bulk paths produce `DISPATCHED`.** This divergence is deliberate, not a bug. Documented here so future sprints don't try to "fix" it without considering the operational reasoning + analytics dependency.

| Path | Code site | Status flip | `dispatchedAt` |
|---|---|---|---|
| Direct tender accept (carrier accepts in portal) | `tenderController.acceptTender` | **BOOKED** | not set |
| Direct tender accept-on-behalf (AE override) | `tenderController.acceptTenderOnBehalf` | **BOOKED** | not set |
| Waterfall accept (auto-pilot scoring engine) | `waterfallEngineService.acceptPosition` | DISPATCHED | set |
| Loadboard bid accept (carrier-bid → AE accepts) | `routes/loadBids.ts` accept handler | DISPATCHED | set |

**Operational philosophy:**
- **Direct path → BOOKED:** AE-curated path. Broker manually picked the carrier and intends a separate "send dispatch order" step (rate confirm, BOL, carrier readiness verification). The intermediate BOOKED state is a load-bearing checkpoint where AE can review before committing dispatch. Advance to DISPATCHED is explicit via the "Advance status" button.
- **Bulk paths → DISPATCHED:** Auto-pilot. Waterfall scoring + loadboard bidding are designed for hands-off dispatch where the next operational moment is not a broker decision. Accept = dispatch. Skipping BOOKED matches that semantic.

**Analytics dependency:** `routes/waterfalls.ts:39, 83, 110` queries `dispatchedAt` for "loads dispatched today / last 7 days" dashboards. Aligning all three paths to BOOKED (P1) would silently exclude bulk dispatches from those queries until an explicit advance fires — a real product break, not a theoretical concern.

**Sprint 39 alternatives considered:** P1 (all → BOOKED, breaks analytics + 2-of-3 surfaces touched), P2 (all → DISPATCHED, removes broker checkpoint on direct path), P3 (document divergence, zero code change). Audit-first surfaced the third path (loadbid) and the analytics dependency that flipped the recommendation away from P1. P3 chosen.

**Tracking-link fan-out timing — the customer is told at the SIGNATURE, on every path. Settled 2026-09-01 (v3.8 commit 12c); supersedes the Sprint 39 α resolution and the 11e asymmetry.**

**Sprint 39 α (retired):** `sendTrackingLinkToCrmContacts` fired at the accept moment on every path. The reasoning was to tie the fan-out to the *event* that means committed rather than to a later *state* — and that reasoning still holds. What changed is which event that is. Sprint 39 chose accept because it was the latest signal available; RC_SENT and CONFIRMED did not exist.

**Commit 11e's asymmetry (also retired, after one commit):** direct paths moved to CONFIRMED while the auto-dispatch paths stayed at accept. That was correct at the time and for a specific reason — the auto paths could not reach CONFIRMED, because **the waterfall issued no rate confirmation at all and the loadboard-bid path drafted one and stopped.** No signing link reached those carriers, so a signature was not late, it was impossible. Moving the announcement alone would have stranded every auto-dispatched customer.

**Current rule, uniform:** every accept path issues the rate confirmation, and the customer is told when the carrier signs.

| Path | Issues the RC at accept | Customer told at |
|---|---|---|
| Direct tender accept (`tenderController.acceptTender`) | auto-RC drafted; AE sends | CONFIRMED |
| Load-and-tender drawer (`withTenderController`) | auto-RC drafted; AE sends | CONFIRMED |
| Waterfall auto-pilot (`waterfallEngineService.acceptPosition`) | **drafted AND issued** | CONFIRMED |
| Loadboard bid accept (`routes/loadBids.ts`) | **drafted AND issued** | CONFIRMED |

**Where the signature is obtained differs, and only that.** A carrier who accepted in their own session can be shown the signing step inline. A loadboard bid is accepted by an **AE**, often hours after the bid was placed, so there is no carrier session to show anything in — the emailed link is the whole mechanism there, which is why *issuing* rather than *drafting* is the load-bearing change on that path.

**A carrier who never signs is not a stalled load.** The tender sits at RC_SENT and Needs Attention chases it on `RC_SIGN_SLA_HOURS`, exactly as on the direct path. That is a visible, chaseable state rather than a load that looks finished and is not.

**The fan-out is idempotent** on `Load.trackingLinkSent` (11e). `Load.trackingLinkAutoSend` still governs whether it happens at all.

### AE Console modules

Served at `/dashboard/*`, `/accounting/*`, `/admin/*` via Next.js app router. The static HTML that once sat at `frontend/public/ae/*` was **deleted in v3.8.asc (2026-08-17)** — 12 pages and their CSS — so the React routes are the only AE surface. Reference retired 2026-09-21; §12's exemption for that tree went with it.

**Live React routes: 48 dashboard + 13 accounting + 4 admin = 65 live routes.** (Counts exclude Next.js convention files — `layout.tsx`, `error.tsx`, `loading.tsx`.) Grouped by function:

- **Operations (daily-use):** `lead-hunter` · `crm` · `carriers` · `loads` · `orders` · `dispatch` · `track-trace` · `loads-calendar` · `dock-scheduling` · `tender` · `drivers` · `fleet`
- **Financial operations:** `finance` · `invoices` · `payables` · `settlements` · `factoring` · `quick-pay` (dashboard) + `/accounting/*`: `aging` · `analytics` · `approvals` · `credit` · `disputes` · `export` · `fund` · `invoices` · `payments` · `pnl` · `quick-pay` · `quickpay-revenue` · `reports`
- **Intelligence + analytics:** `overview` · `scorecard` · `revenue` · `waterfall` · `market` · `lane-analytics` · `geo-spend` · `backhaul-discovery` · `variance-reports` · `ai-costs` · `ai-insights`
- **Compliance + documents:** `compliance` · `claims` · `documents` · `audit` · `violations` · `fuel-tables`
- **Configuration + rules:** `rfp` · `routing-guide` · `exception-config` · `contract-rates` · `shipper-defaults` · `tagging-rules` · `sops` · `training-courses` (SRL Driver Academy authoring, v3.8.ane) · `settings`
- **Communication:** `messages` · `communications` · `phone-console`
- **Integrations:** `edi` · `integrations` · `tracking`
- **Admin (platform-level):** `/admin/*` — `users` · `system` · `monitoring` · `analytics`

**Canonical Lead Hunter component:** `ProspectDrawer` (`frontend/src/app/dashboard/lead-hunter/ProspectDrawer.tsx`). Lead-hunter-specific; wraps `IconTabs` from `@/components/ui/IconTabs`. Originated in v3.6.a (`4668f67`), evolved through v3.6.b (`e8af6a1`) and v3.6.c (`8fe73b3`). The "SlideDrawer" name from prior session memory is synthesis error — no component by that name exists.

---

### §2.1 Design tokens (primary source: designer handoff at project/colors_and_type.css, confirmed 2026-04-22)

**CANONICAL — Color (use for all new work)**

Navy scale:
- `--navy: #0A2540` — primary structural; confirmed canonical 2026-04-22 via designer handoff + pixel verification against `project/screenshots/v29-full.png`. Supersedes prior §2.1 synthesis-error flag.
- `--navy-900: #061629`
- `--navy-800: #0A2540` (alias of `--navy`)
- `--navy-700: #15365A`
- `--navy-600: #234A73`
- `--navy-500: #355E8A`
- `--navy-400: #5B7EA3`
- `--navy-300: #8AA5C0`
- `--navy-200: #BECEDE`
- `--navy-100: #E2EAF2`

Gold scale:
- `--gold: #C5A572` — primary accent (dividers, section labels, icons, wing). Role documented 2026-04-22 per designer handoff. Existing codebase usage of `#BA7517` as primary gold predates handoff; migration to role-correct usage tracked in future phases, not in v3.7.n.
- `--gold-dark: #BA7517` — CTA fills, hover emphasis, outbound links
- `--gold-light: #DAC39C`
- `--gold-tint: #FAEEDA` — active/selected row, subtle highlight

Cream / surface:
- `--cream: #FBF7F0` — page background
- `--cream-2: #F5EEE0` — alt row tint, sunken panels
- `--cream-3: #EFE6D3`
- `--white: #FFFFFF` — sparingly, card elevation only
- `--black: #000000` — never as text

Semantic foreground:
- `--fg-1: #0A2540` (primary text on cream)
- `--fg-2: #3A4A5F` (secondary, captions)
- `--fg-3: #6B7685` (tertiary, muted)
- `--fg-disabled: #A7AEB8`
- `--fg-on-navy: #FBF7F0`
- `--fg-on-navy-2: #C9D2DE`

Semantic background:
- `--bg-page: #FBF7F0`
- `--bg-surface: #FFFFFF`
- `--bg-surface-2: #F5EEE0`
- `--bg-navy: #0A2540`
- `--bg-navy-2: #15365A`

Borders + focus:
- `--border-1: rgba(10,37,64,0.10)`
- `--border-2: rgba(10,37,64,0.16)`
- `--border-strong: rgba(10,37,64,0.32)`
- `--border-on-navy: rgba(251,247,240,0.14)`
- `--focus-ring: 0 0 0 3px rgba(197,165,114,0.40)`

Status:
- `--success: #2F7A4F` / `--success-bg: #E6F0E9`
- `--warning: #B07A1A` / `--warning-bg: #FBEFD4`
- `--danger: #9B2C2C` / `--danger-bg: #F6E3E3`
- `--info: #2A5B8B` / `--info-bg: #E2EAF2`

**CANONICAL — Layout / Spatial / Motion**

Spacing (8px grid): 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 / 128 px

Layout:
- container-max: 1280px
- container-console: 1440px
- section-pad: 100px
- section-pad-console: 56px

Radii: 2 / 4 / 8 / 12 / 16 / 9999 px

Shadows (navy-tinted): Four-stop scale from `0 1px 2px rgba(10,37,64,0.06)` to `0 24px 48px rgba(10,37,64,0.18)`.

Motion:
- Ease: `cubic-bezier(0.2, 0.6, 0.2, 1)`
- Durations: 120 / 180 / 280 / 480 ms

**LEGACY (live in codebase, retained as-is)**

- `#0D1B2A` — themes.css light-default navy. Currently rendering in production. Superseded conceptually by `#0A2540` for new work. Not migrated in v3.7.n — code migration tracked separately when themes.css reconciliation is scheduled.
- `#854F0B` — dark gold used by `IconTabs` and `ContactsPanel`. Not in designer canonical set. Retained for existing surfaces. Do not introduce to new work; use `--gold-dark` (`#BA7517`) for emphasis or `--gold` (`#C5A572`) for accents per designer spec.
- `#0F1117`, `#1a1a2e`, `#0A1220` — AE Console and dark-mode navy surfaces. Designer handoff does not enumerate a dark-mode variant; these values retained as-is.
- `#faf9f7` — portal canvas. Superseded conceptually by `#FBF7F0` (`--cream`). Not migrated in v3.7.n.

**SUPERSEDED (prior synthesis errors — do not introduce)**

- `#F5EFE1` — prior §2.1 flagged this as synthesis error; flag retained. Nearest designer value is `--cream-2 #F5EEE0`. If this hex appears in code review, correct to `#F5EEE0`.
- Prior `#0A2540` synthesis-error flag removed — hex is now CANONICAL per designer handoff (above). Any future suggestion that `#0A2540` is incorrect should be treated as regression — verify against `project/colors_and_type.css` before changing.

**DEFERRED (not reconciled in v3.7.n)**

- **Typography** — designer handoff declares Playfair Display (display), DM Sans (body), Georgia (tagline-only: "Where Trust Travels."), and SF Mono (mono). Current §2.1 documented Georgia as primary for legal PDFs (BOL v2.8, QP Agreement v2, rate confirmation). Role reassignment deferred — will be reconciled in a dedicated commit, likely folded into v3.7.o when BOL PDF font embedding work begins (v3.7.o requires `*.ttf` assets from `project/fonts/` to be checked into the repo and loaded by PDFKit).
- ~~**Type scale, line-height, letter-spacing tokens** — deferred alongside typography reconciliation.~~ **SUPERSEDED 2026-08-31.** The UI type scale is ratified and lives in the brand skill (`references/tokens.md` §8 "UI type scale") — 11px labels / 12px dense cells / 13px secondary / 14px body / 16px lead, with a hard floor of 11px on every surface. Screen only; the display scale and the 9.5pt PDF/legal density are unchanged, so line-height and letter-spacing remain open. The deferral had a measurable cost: with nothing to conform to, the carrier drawer alone ran 9/10/11/12/14/15px — see `docs/audits/drawer-conformance-audit.md` §7.

---

### §2.2 — Production Deployment (Canonical)

**Backend service:** Render Web Service "silk-route-logistics"
- URL: https://api.silkroutelogistics.ai
- GitHub: Silkroutelogistics/silk-route-logistics, branch `main`
- Dashboard: https://dashboard.render.com/web/srv-d64iqtffte5s73894h8g
- **Dashboard is canonical** — `render.yaml` is documentation-only (kept in sync with the dashboard but not Blueprint-managed). Edits to `render.yaml` alone will deploy without effect.

**Required env vars on Render (canonical):**
- `DATABASE_URL` — pooled Neon endpoint (hostname contains `-pooler`). Used by runtime backend for normal queries; pooler manages connection limits.
- `DIRECT_URL` — direct Neon endpoint (hostname does NOT contain `-pooler`). Used by Prisma for ALL migrate operations per the `directUrl = env("DIRECT_URL")` line in `schema.prisma`'s datasource block (added v3.8.ajg). Direct connection releases the advisory lock cleanly the moment migrate exits — permanent fix for the P1002 contention class that fired three times in the v3.8.a* arc.
- `PRISMA_MIGRATE_LOCK_TIMEOUT=60000` — bumps Prisma's advisory-lock acquisition timeout from 10s default to 60s. Belt-and-suspenders alongside `DIRECT_URL`. Reduces residual P1002 frequency on the rare case where the direct URL itself is briefly contended (e.g. Render hot-redeploy stacking).
- `NODE_ENV=production` — runtime env. Note that build chain prefixes `NODE_ENV=development` on the `npm install` step only (see buildCommand below); the runtime value is preserved.
- `RESEND_API_KEY`, `JWT_SECRET`, `OPENPHONE_API_KEY`, `OPENPHONE_PHONE_NUMBER_ID`, `FMCSA_WEB_KEY` — service-specific; see Render dashboard for current values.

**Local development requires the same `DATABASE_URL` + `DIRECT_URL` pair** in `backend/.env`. Without `DIRECT_URL` set locally, `prisma migrate dev` + `prisma migrate status` will fall back to `DATABASE_URL` and reintroduce the pooler-cached-lock risk during local migration authoring.

**Build Command** (canonical, copy verbatim to Render dashboard):

```
NODE_ENV=development npm install && npm run build && node scripts/check-direct-url.js && npx prisma migrate deploy && npx prisma migrate status && cp -r src/assets/. dist/backend/src/assets/ && cp -r src/config/. dist/backend/src/config/ && cp -r src/lib/. dist/backend/src/lib/
```

**v3.8.ajs `check-direct-url.js` guard.** Added between `npm run build` and `prisma migrate deploy`. Verifies `DIRECT_URL` env var is (a) set and (b) does NOT contain `-pooler` in the hostname. Exit code 1 with self-explanatory remediation message if either condition fails. Catches the misconfiguration class that hit v3.8.ajr's deploy (Render env var was set but to the pooled URL by mistake → Prisma routed migrate through the pooler → P1002 timeout in 10s with no diagnostic). Pre-ajs the failure mode was silent (10s migrate timeout with no hint about WHY); post-ajs the build fails in <1s with the exact remediation steps. Banks the four-location checklist (§19 Sub-pattern 11 case study #2) as enforced code, not just docs.

**Sprint 47 cp -r form (`SRC/. DEST/` trailing-dot, NOT `SRC DEST`).** POSIX `cp -r SRC DEST` when DEST already exists copies SRC as a CHILD of DEST — producing `DEST/SRC_NAME/files...` (nested), not `DEST/files...` (expected). `tsc` creates `dist/backend/src/{lib,config,assets}/` directories first (emitting compiled `.js` files into them), so by the time the cp steps run, all three destination directories pre-exist and the nesting bug fires silently. Sprint 44b shipped `cp -r src/config dist/backend/src/config` form thinking it would copy contents; it actually produced `dist/backend/src/config/config/signatures/whaider.html` (nested), and the runtime `email/builder.ts:18` reading `dist/backend/src/config/signatures/whaider.html` got the "file not found" warning on every cold start since. Same bug hit Sprint 45-RC's `cp -r src/lib` — compass PNGs went to `dist/backend/src/lib/lib/srl_compass_*.png` instead of `dist/backend/src/lib/srl_compass_*.png`, fallback navy ring rendered on every Rate Confirmation PDF. **Sprint 47 trailing-dot form `cp -r SRC/. DEST/` always copies CONTENTS regardless of whether DEST exists.** Empirical verification gate (Sprint 47 Phase B0 Step 4) — Pattern 6 sub-rule c extension: command-success is not file-landed-at-expected-path; both must be verified.

The `NODE_ENV=development npm install` prefix (Sprint 46) is install-time only — runtime `NODE_ENV=production` is preserved via render.yaml `envVars` block. The override is load-bearing because Render's env-level `NODE_ENV=production` would otherwise cause `npm install` to skip the `devDependencies` block entirely, leaving all `@types/*` packages absent at compile time. Under that condition, `Request` from `express` resolves to `any`, `AuthRequest extends Request<any,any,any,any>` cascades to "Property 'params/body/query' does not exist on type 'AuthRequest'", and tsc emits ~1,100 errors. Pre-Sprint-46 those errors were masked by `(npx tsc \|\| true)` in `backend/package.json` build script; Sprint 46 dropped the `\|\| true` so tsc now fails the build, and the `NODE_ENV=development` prefix is required to make tsc actually pass (devDeps installed → @types resolved → AuthRequest cascade healed).

**Architectural property — build chain is fail-fast post-Sprint-46.** tsc error → build halts → cp steps don't execute → deploy fails visibly. Pre-Sprint-46 the chain was fail-silent: `|| true` swallowed tsc, cp steps ran regardless, deploy succeeded with broken artifacts (Sprint 45-RC compass mark placeholder + Sprint 44b email signature template both shipped because of this — runtime fallbacks fired without anyone seeing the build-time failure that put them there). Item 96 banks this lesson as canonical methodology principle.

The `prisma migrate status` step is a post-deploy verification gate (Sprint 44b P3). It fails the build if any migrations remain pending after `migrate deploy` runs, catching silent-skip class regressions before the new artifact ships.

**The `cp -r src/lib/. dist/backend/src/lib/` step no longer carries anything, and that is deliberate rather than an oversight (v3.8.bfx).** It was added in Sprint 45-RC because `drawCompassMark` read `srl_compass_{60,120,240,480}.png` as `__dirname` siblings, so without it every Rate Confirmation rendered the placeholder navy ring. The mark is now **vector** — `lib/srlMark.ts` path data drawn through `doc.path()` — the four PNGs are deleted, and **`backend/src/lib` contains no non-`.ts` file at all**, so the step copies sources `tsc` has already compiled into that directory. It is retained for one reason: `render.yaml` is documentation-only and the **Render dashboard is canonical** (below), so removing it here without Wasi editing the dashboard would create a docs-vs-dashboard divergence to buy nothing. A harmless no-op copy beats a divergence. If any future `__dirname`-relative asset lands under `src/lib`, the step is already there; if the dashboard buildCommand is ever edited for another reason, dropping this clause is safe. **What is NOT true any more: no runtime path reads a file out of `src/lib`, so this step failing can no longer 500 a PDF.**

**Prisma 6's `migrate status` returns non-zero exit code on pending/failed migrations inherently — no `--exit-code` flag needed (and not supported).** The Sprint 44b initial directive specified `--exit-code` from a Prisma 5-era convention; Prisma 6.19's `npx prisma migrate status --help` exposes only `--help / --config / --schema` with no `--exit-code` option, and the Render deploy that triggered this hotfix surfaced "unknown or unexpected option: --exit-code" after the `migrate deploy` step ran clean. Behavior verified via `LASTEXITCODE: 0` on clean status run + non-zero on drift. Item 73 logs this caught + closed.

The `cp -r src/config dist/backend/src/config` step is load-bearing for runtime `__dirname`-relative reads of email signature templates (`backend/src/email/builder.ts:18` reads `dist/backend/src/config/signatures/whaider.html`). Item 72 (Sprint 44b pre-commit audit) caught the omission of this step in an intermediate Sprint 44b draft — restored before commit. Any future `__dirname`-relative asset under `backend/src/` must either live under `src/assets/` or `src/config/`, or the buildCommand must extend the cp chain.

**MORE THAN ONE SESSION MAY BE WORKING THIS REPO AT ONCE (hard rule, added
2026-08-21).**

Two sessions took `v3.8.aud` on the same afternoon. Neither noticed. The
letter is assigned from memory of "what came last", and a second session is
precisely the thing that invalidates that memory.

**Before every commit, in this order:**

1. **Re-derive the version letter from origin, never from memory.** Run
   `node backend/scripts/check-version-letter.js <letter>`. It fetches, takes
   the maximum over both the footer and the commit subjects, and refuses a
   letter already claimed on origin. Run it immediately before the commit —
   origin moved twice under Arc 24 alone, so an answer from session start is
   already stale.
2. **Read `git status` for foreign modifications.** Files you did not touch,
   modified since you started, belong to somebody else. Do not stage them, do
   not revert them, do not "clean them up".
3. **Never stage broader than the files you edited.** `git add backend/src`
   is how another session's work — or an unrelated stray file — rides into
   your commit. Name the paths. Arc 23's broad add swept in an empty file and
   came within one directory of taking uncommitted work with it.

4. **THE INDEX IS SHARED STATE. Stage by explicit pathspec, late, never early.**
   `git add` writes to `.git/index`, and there is one index per repository, not
   one per session. Anything you stage is staged for the other session too, and
   their next bare `git commit` takes it.

   Arc 26 staged twelve files and paused to re-run the version guard. In that
   gap the concurrent session committed, and all twelve rode into a commit
   titled *"fix(auth): logout actually revokes the session"* — describing none
   of them. They reset it back out correctly and nothing was lost, but the
   window is the defect, and it is not small: any pause between `git add` and
   `git commit` is a window.

   So: **`git commit -F msg -- path1 path2 …`**, which stages and commits as one
   act. A brand-new file still needs `git add` first, because a pathspec commit
   only matches paths git already knows — do that immediately before the commit,
   never as a separate step earlier in the arc.

   Corollary for the version-letter guard: it reads the UNSTAGED diff, so
   running it after staging your own bump makes it report your own letter as
   claimed. Run it before you stage, and read the file list when it fires —
   Arc 26's `auj` collision was real (the other session's `schema.prisma`) and
   was very nearly dismissed because part of the same signal was self-inflicted.

**If a file you need is being edited by another session, it is theirs.** Do
not race it. Arc 23 needed `schema.prisma` for a hold branch while another
session had it open; the schema change went to `_pending_migrations/` instead
and lost nothing, because that work was going to be held anyway. When their
work has landed, restore YOUR file from `HEAD` and replay only their hunk —
after verifying it verbatim in the tree first. Never the blanket checkout.

**Audit reports must be named `audit-*.md` or they are not ignored.** The
pattern in `.gitignore` is `docs/audit-reports/audit-*.md`. A report filed as
`<subject>-audit.md` matches nothing, shows up untracked, and is then exactly
the kind of file the shared-index rule above says gets swept into another
session's commit. Check with `git check-ignore -v <path>` before writing.

**Untracked files are not branch-scoped.** `git branch -D` leaves behind any
directory the branch created. Arc 23 abandoned a hold branch and left a
destructive migration sitting untracked in `prisma/migrations/` — the
SCHEDULED directory — where one `git add -A` would have applied it. After
abandoning a branch, read `git status` for what the deletion did not take.

**HELD WORK LIVES ON A BRANCH, NEVER ON `main` (hard rule, added 2026-08-20).**

Any commit whose release conditions are not yet met — a migration waiting on a
verification step, a change waiting on a secret, anything a human still has to
approve — goes on a branch named `hold/<what-it-is-waiting-for>`. **Merging is
the release act.** Nothing else.

The rule exists because the alternative was tried and failed. A column-drop
migration was committed to `main` as the unpushed tip, with a note saying not to
push it. That worked exactly as long as nobody committed on top of it. Two
commits later it was no longer the tip, `git push` carried it along, Render
auto-deployed, and the columns were dropped from production without the
row-count verification the migration's own header required. Full account at
§13.3 Item 212.

**A commit held back by position is not held back.** Position is not a
mechanism: it depends on every future session noticing an ordering constraint
that nothing enforces, and it fails silently and completely the first time one
does not. A branch cannot be pushed by accident, because pushing `main` does not
push it.

Corollaries worth stating, since each was a step in that failure:

- **Re-read `git log origin/main..HEAD` immediately before every push.** If it
  contains anything you did not intend to release, stop. This is cheap and it is
  the last point at which the mistake above was catchable.
- **A CI poll must target YOUR commit SHA, never "latest run on main".** With two
  sessions pushing, the newest run belongs to whoever pushed last. In the v3.8.awl
  arc the poll returned `d6ba6233 completed success` — a different session's
  commit — while `2efdff12` was still in flight. Reporting that would have been
  citing someone else's green as your own. Resolve the run by SHA
  (`gh run list --json headSha,conclusion,databaseId` and match), then read the
  job list from that run id. Same failure family as §19 Sub-pattern 16: the check
  ran, and it was not watching what its name implied.

  **Do NOT reach for `gh run list --commit <sha>`.** It is the obvious shortcut
  for exactly this rule and it **returns `[]` silently** for a run that exists —
  no error, no warning, indistinguishable from "CI has not started". In the
  v3.8.awo arc it returned empty twice, minutes apart, while run `33425243512`
  was in progress and plainly visible in `gh run list` with that `headSha`. An
  empty result reads as "not started yet", and the natural next move is to fall
  back to the latest run on main — which is the precise failure this rule exists
  to prevent. **`--json headSha` with an explicit match is the only method that
  has been observed to work.**
- **`/api/health` does not tell you whether a migration landed.** `migrate deploy`
  runs during the BUILD while the previous process keeps serving, so the SHA can
  report the old commit while the schema has already changed. Read the `schema`
  field (v3.8.atj) or `_prisma_migrations` directly.
- **A destructive migration's own verification gate runs BEFORE the push**, not
  after. Once it has applied, the question the gate answers is unanswerable
  except through PITR.

**Schema mutation paths:**

1. **CANONICAL — author migration in feature branch:**

   ```powershell
   cd backend
   npm run prisma:migrate -- --name <descriptive_name>
   ```

   **Use the npm script, not the raw `prisma` command.** Every schema-touching
   script routes through `backend/scripts/prisma-target-guard.ts` first, which
   resolves the URL the CLI will actually use and refuses any non-local host
   unless `PRISMA_TARGET=production` is set on that one invocation.

   **The trap it exists to close (2026-08-31):** `migrate` and `db push` read
   **`directUrl`** (`schema.prisma:27`), not `url`. Exporting only
   `DATABASE_URL` points the runtime at localhost while every migrate command
   still reaches production through `DIRECT_URL` — and the shell looks local to
   whoever typed it. The only tell is one substring in the hostname: no
   `-pooler` means it is the direct Neon endpoint, not the pooled one.

   **THE PRODUCTION RAIL (v3.8.axy). `backend/.env` resolves to the LOCAL
   container and nothing else.** The production `DATABASE_URL` and `DIRECT_URL`
   live only in **`backend/.env.production.local`**, which is gitignored
   (`.gitignore:14`) and which nothing loads automatically — Prisma reads
   `.env`, never `.env.*.local`. So a raw `npx prisma migrate deploy` typed by
   a human now reaches the local container **by construction** rather than
   because they remembered a rule.

   That rule was not enough: a migration reached production from a local shell
   at 15:11:07 on 2026-09-01 because `.env` held the production pair and the
   raw command bypassed the guard entirely (§13.3 Item 252).

   **Reaching production is now two named commands**, both of which run the
   target guard against the environment they have already built:

   ```powershell
   npm run prisma:status:production   # read-only
   npm run prisma:deploy:production   # applies pending migrations
   ```

   The guard also refuses when `.env` and `.env.production.local` resolve to the
   same non-local host — the one way the separation can be silently undone, by
   pasting the production URL back into `.env`.

   **`psql`, GUI clients and any script that carries its own connection string
   remain OUTSIDE the guard, and always were.** What changed is that they can no
   longer pick production up from `backend/.env`; the credentials are only in
   `.env.production.local`. A human who copies that string into `psql` is making
   a deliberate choice, which is the most the rail can offer.

   Note the Render build chain calls `npx prisma migrate deploy` directly and is
   deliberately unaffected — deploying to production is that command's job. The
   guard protects a human at a terminal.

   **The seed is deliberately NOT routed through it, and must not be.**
   `package.json#prisma.seed` is the plain `npx ts-node prisma/seed.ts`, because
   `prisma db seed` does **not** run its command through a shell: a
   `guard && seed` chain is tokenised, the guard receives `&&` as an argument,
   exits 0, and Prisma reports success while the seed never runs. That shipped
   once and took the whole E2E suite down with a 404 three layers away — §19
   Sub-pattern 16, ninth fire. The seed does not need it: `prisma/seed.ts` calls
   its own `assertNotProduction()` before the TRUNCATE, fails closed on an
   absent `DATABASE_URL`, and cannot be defeated by how it is invoked.

   Migration auto-applies to local DB + creates migration file at `prisma/migrations/<timestamp>_<name>/`. Commit migration file alongside `schema.prisma` changes. Render auto-deploys main branch → `migrate deploy` applies the migration in build chain.

2. **EMERGENCY OVERRIDE — only for incident response:**

   If a migration file ships but Render fails to apply it cleanly, run from local:

   ```powershell
   $env:DATABASE_URL = "<prod-url-from-.env>"
   npx prisma migrate deploy
   ```

   If a migration is in the file but already manifest in prod (rare — should not happen with this canonical):

   ```powershell
   npx prisma migrate resolve --applied "<migration-name>"
   ```

   Document override in `regression-log.md` with reason and verification.

3. **NEVER — `prisma db push` against production.**

   Was used historically for v3.8.aa-dd schema work; resolved in Sprint 44b via baseline reset (single init migration captures full prod state as of 2026-05-09). Going forward this path is **deprecated for production**. `db push` is acceptable for the CI test DB (fresh per run, no migration history needed) — see `.github/workflows/ci.yml`.

**Local development:**
Use `prisma migrate dev` to author migrations against local DB. Never use `db push` for permanent schema changes. `db push` is acceptable for rapid prototyping that gets captured as a migration before commit.

**Verification commands (read-only):**

From `backend/` with `$env:DATABASE_URL` set to prod:

```powershell
npx prisma migrate status
```

Should always show `Database schema is up to date`.

**Sprint 44b baseline reset note:**

The single migration `20260509170000_baseline_init` at `prisma/migrations/` captures complete prod schema as of 2026-05-09. Prior 15 migrations archived to `prisma/_archived_migrations_2026-05-09/` for historical reference only — they are NOT part of the active migration chain. Render's `_prisma_migrations` table was cleared and the baseline marked as applied during Sprint 44b execution.

**Pre-Sprint-44b state (deprecated, retained for context):**

Render Build Command lacked `prisma migrate deploy` entirely. Schema additions during Apr 24 → May 4 landed in prod via manual `prisma db push`, bypassing migration history. Audit caught this via Sprint 44a Track 1 (CSV of 87 prod enums vs 6 `CREATE TYPE` statements in migrations) — drift scope was 81 of 87 enums plus corresponding tables/columns.

### §2.5 — Output protocol (token discipline; binding on every arc)

**Every halt ends with a HALT CARD** — one fenced block, ≤15 lines, nothing printed after it:
```
HALT <arc> @ <sha> | pushed y/n
COMMITS: <sha> <letter> <subject>            — one line per commit
GATES: btsc N | test P/F | ftsc N | build ok/fail | e2e ok/deferred
INJECTIONS: N run, N red as expected
FINDINGS: <=3 lines
OPEN: numbered decisions, one line each
DETAIL: scratchpad/arc-handoff.md
```
- **Gate output goes to `.logs/<gate>.log`** — the `.log` extension is load-bearing: `.gitignore:26` `*.log` ignores it at any depth, but `.logs/` is NOT itself a pattern, so `.logs/notes.txt` would be swept into another session's commit (§2.2). Verify with `git check-ignore -v` before first use. Print only counts and failing test names; run vitest with `--reporter=dot`.
- **Searches and subagent returns carry counts and file lists, never match bodies** — unless a body IS the finding. Subagent returns ≤20 lines; mechanical scans pass `model: haiku` explicitly.
- **Compact at every halt. Start a fresh session at each arc boundary.**

---

### §2.5 — Usage budget (added 2026-09-22). What a session SPENDS — binding like the rest of §2, and deliberately not §19: that library catches defects, this governs spend, and a session that runs out of context mid-arc loses the arc.

- **Halt reports: 15 lines max in chat** — status, gate pass/fail counts, a findings table, open questions. Detail goes to a scratchpad file, cited by path. **Never paste full gate or scanner output** into a report.
- **Cite `file:line`. Do not quote code blocks in reports.** A reader who wants the code can open it; a reader who wants the conclusion should not have to scroll past the code to reach it.
- **Read a file once per block. Grep with line ranges before opening whole files.** This is the other half of the delegation rule below: that rule sends search to a subagent and keeps judgment on the main path, and reading a file to understand it IS judgment — so it lands on the expensive path by default, and nothing else says to do it economically.
- **Mechanical work goes to a subagent on the cheapest capable model** — grep, enumerate, count, run scanners, run matrices. Judgment stays on the main path. The main path decides what a finding means; it does not have to be the thing that counted the rows. **SUSPENDED 2026-09-23 — and the thing that suspends it is this file.** CLAUDE.md is injected into every subagent's system prompt, so at ~405,000 tokens it exceeds the ENTIRE context window of any 200k model: **haiku cannot be spawned in this repository at all.** Two attempts died before their first tool call — `Prompt is too long · the request is ~458,654 tokens (limit 200,000)`. The next model up was then probed with a task whose whole content was `wc -l CLAUDE.md`; it answered correctly and **spent 646,443 tokens doing it.** That is the floor cost of any delegation here, paid before the agent does any work — so the rule as written now spends more than it saves, which inverts its own purpose. **Revival condition, named so it is checkable rather than a feeling: the core must load under 200,000 tokens.** At that point haiku starts and the rule returns unchanged, with no edit needed beyond deleting this clause. Until then mechanical work stays on the main path and the deviation is recorded per block rather than taken silently. The acceptance test is not an estimate: spawn a haiku subagent with a trivial task and see whether it starts.
- **Compact at every halt. Each block starts from its handoff file, not from prior context.** A block that cannot be resumed from its handoff file has an incomplete handoff file, and that is the defect to fix.
- **The full gate stack runs at a block's tip only.** Intermediate commits get backend `tsc` + `npm test`. Running the whole stack on every commit of a ten-commit block spends the budget re-proving what the tip proves once.
- **Adversarial matrix: only the injections the directive names, plus one per new guard.** The second half is a FLOOR, not a ceiling — it is the one clause here that mandates work rather than bounding it, which is why it is not folded into the budget rule above. §19 Sub-pattern 16's recurring shape is a guard that was green and blind, and running the injection is the only thing that tells a guard that works from a guard that merely runs.
- **No polling, no standing watches, no re-checks on idle notices. Act on explicit triggers only.** An idle notice is not a trigger; a message, a user turn, or a named completion is.
- **One guard run per commit unless it fires.** Deliberately its own line rather than part of the gate-stack rule above, because that rule does not reach the guards this one is mostly about: `npm test` is `vitest run`, so `verify:rc` and `verify:bol` (which chains three more) sit outside it entirely — and those are the slow ones, where re-running a green guard actually costs something.
- **`npm test` runs at `--maxWorkers=2` by default — but the rerun protocol is the half that carries it.** Item 300, FIVE occurrences: tinypool dies with `ERR_IPC_CHANNEL_CLOSED` and **no result**, which is a crash and not a test failure — reading it as one is how a green suite gets called red. The fifth fire landed AT `--maxWorkers=2`, so treat the setting as a default, never as a cure. On that crash rerun ONCE and log both runs; a second failure halts rather than being re-run again.

---

## §3 BINDING RULES

Organized by firing frequency — universal rules first, domain-specific last. All rules enforceable across sessions; a Claude Code session must respect these without re-explanation.

### §3.1 Versioning

- Format: `MAJOR.MINOR.letter` (e.g. `v3.7.a`)
- **Default: bump the letter. Always. For every commit that deploys.** Sequence: `a → b → c → … → z → aa → ab → …` Continue past `z` with double-letters; **never** roll the minor at `z`.
- **Minor bump** (e.g. `v3.7.z → v3.8.a`): user-initiated only. Do not propose a minor bump unprompted. If you think one is warranted, ship the work as the next letter and mention the thought in the report — let the user promote it.
- **Never skip a letter.** Sequence is continuous.
- If the user names a specific version in their instruction (e.g. "ship this as v3.7.a"), use exactly that — don't second-guess.
- **Source of truth:** `frontend/src/components/ui/VersionFooter.tsx` — update with every commit that deploys.
- **Docs-only commits ship unversioned.** Letter bump fires on commits that change user-visible state (frontend, backend API, migrations, deploy artifacts). Does NOT fire on commits that only change developer-facing context (CLAUDE.md, MEMORY.md, READMEs, session handoffs, `docs/`). Confirmed at v3.7.j sign-off and reaffirmed at v3.8.e.2 docs catch-up.

### §3.2 Content sweeps verify rendered output

After any content/copy commit that touches a page:
1. Open the actual rendered page on deployed prod (not local file)
2. `curl`-and-`grep` the rendered HTML for strings that should be **removed** AND strings that should be **present**
3. Only then sign off

Content sweeps that verify only the diff are the bug that produced the v3.7.c stale-tier-copy miss. Diff says "I changed line X to Y"; rendered-output verification says "line Y is actually what the user sees."

### §3.3 Atomic commits + halt + smoke test

- One commit per sub-phase. Not three. Not five.
- Each commit description fits in one sentence; if it needs a paragraph, the commit is too big.
- Halt + smoke test between each sub-phase. Wait for user sign-off before the next.
- Pre-commit: `npx tsc --noEmit` from `backend/` + `npm test` from `backend/` + `npx next build` from `frontend/` must all pass clean. `npm test` added to the canonical gate at v3.8.alh after ald/alf/alg shipped with CI red because tsc was green but vitest was not — Sub-pattern 11 third fire. CI runs `npm test` on every push; local gate must mirror.
- **AND `npm run verify:rc` from `backend/`, on any commit that touches the Rate
  Confirmation or the shared chrome it draws with.** The fit matrix renders
  fifteen fixtures and asserts page count, footer clearance, required and
  forbidden text, that the line haul is on the page at all, and that SRL's
  customer rate is not. It is a script rather than a vitest file because it
  needs pdfjs and takes seconds per fixture, so it does not belong in the unit
  run — but it was therefore also not in ANY gate, and it sat red for fifteen
  of fifteen cases for an entire arc while nobody was obliged to look. A gate
  nobody runs is a gate that is off. Now it has a name and a place in this list.
- **AND `npm run verify:bol` from `backend/`, on any commit that touches the
  Bill of Lading or the shared chrome it draws with.** Three gates behind one
  name: the fit matrix (six line-item shapes, one page each, terms strip below
  content, content above the footer rule), the one-page smoke, and the anchor
  parity gate.

  **The anchor gate exists because a render pin cannot answer the question the
  BOL migration asks.** Moving the BOL onto shared chrome moves its pin by
  construction on nearly every commit, and a moved pin proves only that
  something changed. Acceptance is PARITY, so the gate measures it: body
  anchors must hold to pixel-verified v2.9 canon, while letterhead anchors are
  expected to move once to the operational register and are reported rather
  than enforced. Re-capture deliberately with `--capture`, and say in the commit
  what moved and why.

  Same reasoning as `verify:rc` above, and the same history: these two BOL
  gates existed for months wired to nothing — no npm script, no CI job — so
  they ran only when somebody remembered. A gate nobody runs is a gate that is
  off.
- **AND `npm run test:e2e:local` from the repo root, on any commit that changes a
  contract E2E exercises** — an endpoint's request or response shape, an
  agreement version, a compliance verdict, an auth or signing path. Added
  2026-09-02 after a factual count: **4 of the last 20 CI runs on `main` were
  red, and 3 of those 4 were E2E** — the one job the gate above never ran.
  Backend, frontend and deploy were green on all three. That is not bad luck;
  it is a gate that omits the only job exercising the full wire (real HTTP, real
  database, real contracts between services), so a contract change lands red
  *after* push by construction. The runner already existed (`a63876d4`, "the
  suite that kept going red is now runnable before the push") and was not being
  used. It costs ~1.5 minutes and it is not optional. Sub-pattern 11, fourth
  operational context.

### §3.4 Halt > ship

- Clarification is free.
- Post-deploy fixes are expensive.
- When in doubt, halt and surface.
- Never auto-correct ambiguous scope. Never guess at a missing file or uncertain value.

### §3.5 Audit-first pattern

- Before writing code: discovery bash commands to map actual codebase state.
- Halt on unexpected state, surface to user, do not guess.
- Pre-existing bugs may hide in code adjacent to new work — investigate, don't paper over.
- Root-cause before code. Ask "why" 3 times before writing a fix. Read the error. Reproduce it. Understand the mechanism. Then fix once. No blind retrying.

### §3.6 Next.js route shadowing

When both `frontend/public/*.html` AND `frontend/src/app/.../page.tsx` exist for the same path, the React component wins at runtime. Audit BOTH locations when editing content; note which is live before assuming an edit took effect.

**Origin:** v3.7.d auth tagline fix — edits to static HTML auth pages were shadowed by React auth routes.

### §3.7 Delete before you add

- Before building anything new, check for dead code related to what you're touching.
- Remove unused imports, dead functions, orphaned localStorage code.
- Don't add to code smells — reduce them.

### §3.8 Database over localStorage

- Pipeline stages, activity logs, address books, and any data that should persist across sessions MUST be stored in the database.
- localStorage is acceptable ONLY for: UI preferences (theme, sidebar state, view mode).
- When migrating localStorage to DB, keep localStorage as an instant-UI cache but always read/write through the API.

### §3.9 Origin/destination = physical location

- BOL, Rate Confirmation, and all shipping documents use `load.originAddress/City/State/Zip` for shipper and `load.destAddress/City/State/Zip` for consignee.
- Customer (billing entity) address is NEVER used on shipping documents unless origin fields are empty.
- `shipperFacility` and `consigneeFacility` are the company names at pickup/delivery — not the billing customer.

### §3.10 Sender identity for emails

- All prospect/lead outreach: from `Wasih Haider <whaider@silkroutelogistics.ai>` with personal plain-text style.
- Reply-to: `whaider@silkroutelogistics.ai` (so replies land in Gmail for tracking).
- Use the shared `EMAIL_SIGNATURE` from `emailSequenceService.ts` on all outreach emails.
- System/transactional emails (OTP, password reset, notifications): from `noreply@silkroutelogistics.ai`.
- Fraud reports / compliance: `compliance@silkroutelogistics.ai` (see CarrierFraudBanner, v3.7.e).
- AR / carrier pay: `accounting@silkroutelogistics.ai`.

### §3.11 PDFKit coordinate system

- PDFKit uses TOP-DOWN Y coordinates. Y=0 is the TOP of the page, Y=792 is the bottom (letter size).
- Start content at `y=12` and increment downward.
- Set `margins: { top: 34, bottom: 0, left: 34, right: 34 }` to prevent auto-pagination.
- Only use explicit `doc.addPage()` for intentional page breaks.
- **NEVER** use bottom-up Y math — that's ReportLab/Python, not PDFKit/Node.

### §3.12 Legitimate claim exceptions

Marketing claim rules (§4, §5) do **not** apply to the following contexts:

- **Industry citations** — ATRI-sourced safety/cost facts, NIOSH driver wellness facts in splash quotes. Internal employee audience.
- **Technical documentation** — e.g. `security-policy.html` rate-limiting docs are not marketing.
- **User-input form enums** — e.g. shipper register page "500+" in a monthly-shipments dropdown is a form value, not a claim.
- **Milestone threshold phrases** — "97% on-time", "98% on-time" as M4/M5 requirements are tier requirements, not volume claims.
- **Historical changelog comments** — comments in code that factually record past decisions should NOT be edited to match present state (they are a record, not a claim).

### §3.13 Address / legal-identity verification

Never trust session memory or prior docs for legal-notice-critical identity fields (principal address, MC#, DOT#, bond surety). Verify against FMCSA SAFER, incorporation docs, or bond paperwork before asserting canonical. A session-memory error in this category propagated a wrong city into CLAUDE.md commit `57eb145`; v3.7.i corrected it. Lesson: legal identity fields need primary-source verification, not chat-memory synthesis.

---

## §4 HONEST CLAIMS WHITELIST (authoritative)

Only these claims may appear on public marketing pages:

1. **FSC itemized on every rate confirmation** — line-haul, fuel surcharge, and accessorials shown as separate line items; rate-con total equals settlement total. Per v3.8.aib Sprint 1 honesty pass, the prior "tier-graduated FSC pass-through" framing (Silver: loaded miles; Gold: loaded + empty miles; Platinum: all miles) was retired — shipper-billed FSC is loaded-miles-only by industry formula, so tier-graduated pass-through on empty/all miles requires SRL to pay from margin (unbacked pre-revenue). Stronger claims ("100% pass-through" / "pass-through on loaded miles") are HELD until the operational pricing model is confirmed. The itemized-on-RC framing is what's verifiable today.
2. Itemized quotes, no post-booking clipping
3. No factoring contract required to use Quick Pay
4. Performance-based tier advancement via Milestones M1–M6 (advancement independent of fleet size)
5. Published Quick Pay fees: Silver 3% / Gold 2% / Platinum 1% at 7-day standard; +2% for same-day at any tier
6. Free standard pay by tier: Silver Net-30, Gold Net-21, Platinum Net-14
7. ~~Tier-based quarterly safety bonuses at Gold ($450/qtr) and Platinum ($900/qtr)~~ — **RETIRED v3.8.aib Sprint 1.** No SafetyScore tracking + monthly payout backend. Cannot honor claim until built. Moved to §5 prohibited.
8. ~~Tier-based referral bonuses ($250 / $500 / $750)~~ — **RETIRED v3.8.aib Sprint 1.** No ReferralCode/Referral Prisma schema, no attribution mechanism at first-load-delivered, no payout workflow. First referrer would have no way to be paid. Moved to §5 prohibited.
9. ~~Tier-based detention pay~~ — **RETIRED v3.8.aib Sprint 1.** Industry research (TQL, C.H. Robinson, Echo, Coyote, RXO, Landstar) shows uniform-rate or shipper-pass-through detention models; NONE differentiate by carrier tier. Moved to §5 prohibited.
10. Property broker registered under FMCSA authority (USDOT 4526880, MC# 1794414), BMC-84 bond on file
11. 7-factor transparent Compass Score (published on /carriers)
12. Marco Polo AI assistant is 24/7 (AI software is always on)
13. **Pay-ladder tier differentiation** (added v3.8.aib Sprint 1) — Silver Net-30 + 3% QP, Gold Net-21 + 2% QP (9 days faster + 1 point lower than Silver), Platinum Net-14 + 1% QP (7 days faster than Gold, lowest fee). This is the canonical tier-cards spine since pay terms + QP fees are broker-controlled and verifiable; all other tier-based claims (FSC tier-graduation, safety, referral, detention) retired per items 7-9 + 1.
14. **Day-1 Silver entry** (added v3.8.aib Sprint 1) — every approved carrier starts at Silver regardless of fleet size; public Compass Score visible from load #1. Real per §10 M1.
15. **Universal floor benefits** (added v3.8.aib Sprint 1) — every approved carrier gets these 10 capabilities regardless of tier, all verified live per Phase A audit: Marco Polo AI 24/7 dispatch (§4#12), BMC-84 $75K bond protection (§1), Compass Score portal-visible (§4#11), FSC itemized on every rate confirmation (Commitment #2 + `pdfService.ts`), auto rate-confirmation within seconds of accept (Sprint Phase 2 v3.8.acd), branded tracking links (§20.3 Lens 1.5 + v3.7.k), mobile POD upload (`documentController`), SRL-handled check calls (`CheckCall` Prisma model), in-portal dispute resolution (`notificationService` DISPUTE types + accounting/disputes), Compass-Engine-enforced no-double-brokering (`chameleonDetectionService.ts`). Live tile inventory on /carriers per v3.8.aib "Every Caravan Partner gets" section.

---

## §5 PROHIBITED CLAIMS (must not appear on marketing pages)

- Volume stats without real numbers (carrier counts, load counts, on-time percentages)
- Named customer testimonials unless a real carrier/shipper provided one in writing
- "Asset-based" / "our fleet" / "our trucks" / "we own"
- "Zero dispatch commission" / "$0 Commission" / "Zero Commission" (retired positioning)
- "Zero factoring fees" (misleading — replaced by no-contract framing)
- Blanket "100% FSC pass-through" / "Full FSC pass-through" framing (retired 2026-05-19 v3.8.ads — overstated). UPDATE v3.8.aib Sprint 1: the "tier-graduated FSC pass-through" framing (Silver: loaded miles; Gold: loaded + empty; Platinum: all miles) ALSO retired — shipper-billed FSC is loaded-miles-only by industry formula, so pass-through on empty/all miles requires SRL to pay from margin (unbacked pre-revenue). Use "FSC itemized on every rate confirmation" instead until operational pricing model is confirmed.
- "Tier-based quarterly safety bonuses" / "$150/mo safety bonus" / "$300/mo safety bonus" / "$450/qtr" / "$900/qtr" — retired v3.8.aib Sprint 1. No SafetyScore tracking + monthly payout backend exists. Cannot honor the claim until built. Held entirely until operational mechanism is in place.
- "Tier-based referral bonuses" / "$250 / $500 / $750 referral bonus" — retired v3.8.aib Sprint 1. No `ReferralCode` Prisma model, no `Referral` attribution model, no first-load-delivered qualification trigger, no payout workflow. First carrier to refer someone would have no operational way to be paid. Held entirely. Multi-sprint backend build required before claim returns.
- "Tier-based detention pay" / differentiated $/hr by tier (e.g., Silver $50/hr, Gold $65/hr, Platinum $75/hr) — retired v3.8.aib Sprint 1. Industry-standard research showed uniform-rate or shipper-pass-through detention models across all major brokers (TQL, C.H. Robinson, Echo, Coyote, RXO, Landstar); NONE differentiate by carrier tier. Differential pay by tier for the same wait time at the same shipper risks DOT/FMCSA discrimination optics. **Canonical uniform accessorial policy (ratified 2026-08-14, v3.8.arn) — the figures SRL actually prints:** detention is **$50/hr for ALL equipment types after 2 hours free time at each stop, capped at $250 per stop**; TONU is **$200 flat**; layover is **$250 per day**. The cap is deliberately EQUAL to the layover day rate (ratified 2026-08-14, v3.8.ars): at $200 detention stopped accruing at billable hour 4 while auto-layover only fired at hour 24, leaving an 18-hour gap where a held carrier earned nothing. At the cap detention CONVERTS to layover and the two do not stack for the same hours. **The $250 cap and the $250 layover day rate both stand — re-ratified 2026-08-15 — and the detention-to-layover conversion is performed in [`backend/src/lib/detentionLayover.ts`](backend/src/lib/detentionLayover.ts), the single writer of both charge types for a stop.** The ladder it pays, stated so the next reader can check the code against it: free time runs from arrival to arrival + 2h and is not billable; detention bills $50/hr from hour 2 to hour 7, where the $250 per-stop cap is reached; that instant is the conversion, and **layover day one bills at the conversion**, so a stop still held past hour 7 is worth $500 (the $250 detention cap plus the first layover day); each further layover day bills $250. Detention and layover never cover the same hour. The conversion instant is derived as free time plus cap divided by rate, never hardcoded, so changing the cap or the rate moves the handoff with it. One condition the Rate Confirmation prints is not yet enforced by any writer: detention is not payable if the carrier arrives outside the appointment window, and `detentionLayover.ts` takes arrival as given. Free time accrues per stop (each stop is independent and non-cumulative) and the cap is per stop, matching the Rate Confirmation, which renders the cap as `$N/stop cap` (`srl-chrome.ts` `drawRateConTerms`). The terse phrasing is deliberate and measured: the grid cell draws with `lineBreak: false`, and `capped at $250/stop · notify` measures 216.6pt against 202pt of available width, so the longer wording would overprint the adjacent TONU label. Do not "improve" it without re-measuring. **No tier differentiation and no equipment differentiation** — the prior "$50/hr dry van / $65/hr reefer" split was retired here because it was never implemented: `srl-chrome.ts` carries a single `detentionRatePerHour` field with no equipment branch, so the reefer rate could never have printed. **TONU — two sides, two triggers, one amount. Ratified 2026-08-15, NOT YET IMPLEMENTED.** Bill the CUSTOMER $200 on ANY cancellation, with no notice test. Pay the CARRIER $200 only when the cancellation lands same-day as pickup or after the carrier was dispatched. Neither side is built. There is no customer-side TONU charge anywhere in the billing path, and the carrier-side clause the Rate Confirmation prints today (`pdfService.ts` `governingClauses`: "payable only if SRL gave you the pickup number and shipper address and cleared you to head to pickup, and SRL or the shipper then cancels") pays on a narrower trigger than the ratified one — it does not reach a same-day cancellation on a carrier who was not yet cleared to roll. Treat both sides as ratified-pending-implementation and do not describe either as live. **The 4-hour cancellation window is the CARRIER'S release window. Ratified 2026-08-15, NOT YET IMPLEMENTED.** The carrier may release a load up to 4 hours before pickup without penalty. It is **not** a window for SRL to cancel penalty-free. This supersedes the earlier reading recorded here — "SRL gives 4 hours' notice without penalty" — which is what made the window and the TONU clause contradict: both governed the same party backing out, on the same signed page. Reframed, they govern different parties. The release window is the carrier backing out; TONU is SRL or the shipper backing out. They can now sit on one signed Rate Confirmation without conflict, and **the prior OPEN caveat is resolved** — the instruction not to treat the 4-hour window as a TONU safe harbor no longer applies, because the window is no longer SRL's to use. The terms grid still renders the line as `4-hour notice without penalty` (`srl-chrome.ts` `drawRateConTerms`, value supplied by `pdfService.ts` `cancellationWindowHours: 4`) without naming the party; it must name the carrier as the releasing party when this is implemented, and `e2e/helpers/pdf.ts` pins that string character for character, so both move in the same change.
- Operational tier lines pending confirmation — NOT to claim on /carriers (or any public surface) until the underlying operational mechanism is confirmed live and committed-to: (a) "Priority Compass Engine placement for Gold" — waterfall engine tie-breaker logic for Gold-vs-Silver on equal scores not yet implemented; (b) "Dedicated lane eligibility for Gold" — operational policy decision pending; (c) "Quarterly business review with AE for Platinum" — AE role exists but QBR cadence not committed; (d) "Advisory voice on CPP evolution for Platinum" — only M6 has advisory voice per §10; broader Platinum application is held. All four banked in v3.8.aib for future re-evaluation once operationally real.
- "Hauling your first load within 48 hours" / specific onboarding hour-count SLAs (retired 2026-05-19 v3.8.ads — no operational SLA wired today. Use "most carriers cleared within a few business days" until a real onboarding SLA is measured and operationally enforced.)
- "24/7" for human-support contexts (reserved for Marco Polo AI only)
- "Monthly all-in rate cards" as current offering (roadmap only per /carriers "What's coming")
- Fuel card program, insurance referrals, equipment financing as current offerings (roadmap only)
- Named competitors (CHR, TQL, Landstar, Convoy, RXO, etc.) — use "typical broker" / "most brokers" / "industry average"
- "Wasi Haider" name or personal bio on public marketing pages (internal tools exempt per §3.12)
- "X+" style volume metrics without real numbers (500+, 12K+, $50M+ etc. — all retired in v3.7.d)

---

## §6 HONEST HOURS COPY (authoritative)

Use this exact text wherever operating coverage is claimed:

> "Business hours coverage Monday–Friday, 7:00 AM – 7:00 PM Eastern. After-hours emergency line available for active loads in transit."

Short-form variant (tight UI contexts):

> "Business hours Mon–Fri 7am–7pm ET + after-hours emergency line"

---

## §7 PROGRAM NAME CONVENTION (enforce strictly)

- **Full form (preferred):** "Caravan Partner Program"
- **Abbreviation after first reference on same page:** "CPP"
- **Prohibited variants** (retired, never use):
  - "Caravan Program" (missing "Partner")
  - "Caravan Carrier Program"
  - "Caravan Loyalty Program"
  - "Partner Program" (standalone, missing "Caravan")
  - "SRAPP" (fully retired)
- **"Caravan Network"** is acceptable ONLY as the eyebrow pill on `/carriers`; never as a program name.

---

## §8 v3 QUICK PAY PRICING (LOCKED)

> **Pilot note (ratified 2026-08-16, §21.1).** Quick Pay is a **limited pilot**:
> the carrier requests it, SRL approves or declines, and SRL may withdraw it on
> notice. That governs **availability only**. Every figure in this section is
> unchanged and stays LOCKED — a pilot changes who can get in, never what it
> costs. Standard tier pay is free and never depends on the pilot. Do not
> soften any number here on the theory that a pilot is provisional, and do not
> present reaching a tier as granting Quick Pay: it grants the Net terms and
> the published fee that would apply, not admission.

> **Tier-advancement calibration note (added v3.8.aij, 2026-05-23).** Tier names + pricing are stable; the loads / on-time / tenure thresholds in §10 that gate advancement between tiers are calibrated to **current pre-revenue launch volume** and are scheduled to be revisited at ~6 months operational baseline OR when monthly volume materially increases. Threshold revisions go through the same atomic-commit + halt cadence as the v3.8.aii backend + v3.8.aij ledger commits that locked them.

### v3.8.aib Sprint 1 honesty pass — retired lines per tier

The Detention / Referral / Safety Bonus / FSC-pass-through-by-tier lines previously listed under each tier are **RETIRED** as canonical claims. None had backend tracking, payout workflow, or operational margin behind them. See §5 prohibited claims for details. What remains is the pay-ladder spine, auto-approve thresholds, monthly limits, and Platinum's Priority freight access — all broker-controlled and verifiable.

### Silver (1–4 trucks, Day-1 entry)
- Net-30 free · 7-day QP 3% · same-day 5% (3%+2%)
- Auto-approve $2,000/load · monthly limit $15K
- ~~Detention $50/hr after 2hr~~ — retired v3.8.aib (see §5)
- ~~Referral $250~~ — retired v3.8.aib (see §5)
- ~~FSC pass-through: loaded miles~~ — reframed v3.8.aib to "FSC itemized on every rate confirmation" universal (§4 #1)

### Gold (5–10 trucks OR M4 milestone)
- Net-21 free · 7-day QP 2% · same-day 4% (2%+2%)
- Auto-approve $4,000/load · monthly limit $40K
- ~~Detention $65/hr after 2hr~~ — retired v3.8.aib (see §5)
- ~~Referral $500~~ — retired v3.8.aib (see §5)
- ~~Safety bonus $150/mo ($450/qtr)~~ — retired v3.8.aib (see §5)
- ~~FSC pass-through: loaded + empty miles~~ — retired v3.8.aib (see §5); shipper-billed FSC is loaded-miles-only

### Platinum (11+ trucks OR M5 milestone)
- Net-14 free · 7-day QP 1% · same-day 3% (1%+2%)
- Auto-approve $6,000/load · monthly limit $80K
- ~~Detention $75/hr after 1.5hr~~ — retired v3.8.aib (see §5)
- ~~Referral $750~~ — retired v3.8.aib (see §5)
- ~~Safety bonus $300/mo ($900/qtr)~~ — retired v3.8.aib (see §5)
- ~~FSC pass-through: all miles~~ — retired v3.8.aib (see §5); requires SRL to pay from margin, unbacked
- Priority freight access — RETAINED, broker-controlled

### Critical rule
Same-day Quick Pay is UNIVERSAL +2% premium on tier fee. **Not tier-gated.** Every tier can elect same-day on any load.

---

## §9 COMPASS SCORE (7-factor, published on /carriers)

| Factor | Weight |
|---|---|
| On-time pickup | 20% |
| On-time delivery | 20% |
| Tracking compliance | 15% |
| Claims ratio | 15% |
| Communication | 10% |
| Document timeliness | 10% |
| Acceptance rate | 10% |

> Factor renamed "GPS compliance" → "Tracking compliance" (v3.8.alz, Build C, 2026-05-30) so the public label matches what's measured: % of loads with captured location visibility from any source (carrier portal / geofence / check-call-email / **ELD** via motiveService+samsaraService). The `CarrierScorecard.gpsCompliancePct` DB column is unchanged. Compass factors are now genuinely measured backend-side (Builds A/B/D/C/E) — on-time pickup/delivery from actual event timestamps + 2h grace, document timeliness POD≤delivery+24h, tracking from LoadTrackingEvent location. Tracking compliance is **NOT MEASURED (corrected 2026-09-07, v3.8.bax + v3.8.bay)**. It read NEUTRAL (100) until a carrier connected ELD, and **nothing in the codebase has ever written `CarrierProfile.eldEnabled`**, so that constant was a standing claim of location visibility SRL does not have, carrying 15% of the composite on every carrier. `lib/trackingFactor.resolveTrackingFactor` now returns null when no location source exists, and `tierService.calculateOverallScore` renormalises over the remaining six factors, so an unmeasured carrier is scored on what SRL can actually observe rather than credited with a tracking record nobody captured. `CarrierScorecard.gpsCompliancePct` is `Float @default(0)` and cannot hold null without a migration, so the persisted value for such a carrier is a 0 sentinel; every reader gates on `eldEnabled` and renders "Not measured", because printing the sentinel would be the same false claim pointing the other way. Phase 1 replaces the sentinel with a nullable column. Per-carrier ELD credentials (`CarrierProfile.eldApiKeyEncrypted` etc.) are on the schema and unwritten: see §13.3 Item 261.
>
> **Document-timeliness alignment (noted v3.8.arn, measurement unchanged).** The POD ≤ delivery + 24h window this factor grades on now agrees with what the Rate Confirmation promises the carrier — signed BOL, POD, and supporting paperwork due within 24 hours of delivery. Carriers are graded against the same deadline they are given in writing, so the factor is defensible if a carrier disputes a Compass score. Any future change to one must move the other in the same commit.

---

## §10 TIER ADVANCEMENT GATES (locked launch model, v3.8.aii + v3.8.aij)

The Caravan Partner Program advances carriers through 3 tiers (Silver / Gold / Platinum) plus a Founding recognition status on top of Platinum. Each transition is an **AND** of (cumulative-since-join loads, on-time pct, tenure days). Counting reads `cppTotalLoads` + `cppJoinedDate` per `caravanService.checkMilestoneAdvancement`.

**Threshold calibration:** the load thresholds below (12 / 20 / 30) are calibrated to current pre-revenue launch volume. Revisit at ~6 months operational baseline OR when monthly volume materially increases. Per §8 note.

**Single authoritative advancement gate.** The legacy parallel score-based promotion path in `tierService` (score ≥90 → Gold, ≥95 → Platinum) was retired in v3.8.aii so a carrier cannot bypass the loads-and-days gate via service score alone.

| Tier / status | Code milestone enum | Loads (cumulative-since-join) | On-time | Tenure floor | Outcome |
|---|---|---|---|---|---|
| Silver (entry) | M1_FIRST_LOAD | 3 completed loads + service score ≥ 70 (`tierService.checkGuestPromotion`) | — | — | Silver tier active. Working toward Gold gate. |
| Gold | M4_PARTNER | 12 | 97% | 90 days | → Gold tier. Net-21 + 2% 7-day QP unlock per §8. |
| Platinum | M5_CORE | 20 | 98% | 120 days | → Platinum tier. Net-14 + 1% 7-day QP unlock per §8. Priority freight access. |
| Founding | M6_FOUNDING | 30 | 98% | 180 days | Recognition status. Carrier remains tier=PLATINUM with Founding flag; 1% Quick Pay tier locked permanently. |

**Retired gating criteria (do not surface on carrier-facing pages):**
- **Referral requirement** — retired v3.8.aii. No field tracks referrals; the referral system was retired in v3.8.aib Sprint 1.
- **"3 active lanes"** — retired v3.8.aii. No field exists in code for this criterion; was page-only marketing copy that didn't map to any backend gate.
- **Score-based promotion** — retired v3.8.aii. `tierService.calculateTier(overallScore)` + `recalculateAllTiers` deleted. Compass Score still drives scorecard persistence + bonus % display but does NOT mutate tier directly.
- **Fleet-size promotion shortcut** — `calculateTierFromFleet` retired v3.8.aii (dead code, zero callers). Per CLAUDE.md §11 v3.7.a "PLATINUM identity fix" precedent and the locked model's "advancement is performance-based" framing, fleet size does not bypass the gate.

**Legacy enum value handling.** `CarrierMilestone` enum still includes `M2_PROVEN` and `M3_RELIABLE` values for backwards compatibility with any pre-reconciliation persisted rows. `checkMilestoneAdvancement` normalizes both to `M1_FIRST_LOAD` lookup so those carriers advance to `M4_PARTNER` under the locked gate. No Prisma migration shipped; legacy values are inert after Commit 1.

---

## §11 PHASES SHIPPED (chronological, all on main)

Moved → `docs/claude/archive/phases-shipped.md`. 168 chronological rows of shipped work plus the §11
architectural finding on `sanitizeInput` input-time escaping. A log, not a rule — read it to find out
when something shipped, or what a version letter refers to.

---

## §12 EXEMPT SURFACES (internal tools — different rules)

Marketing content rules (§4, §5) do **NOT** apply to these surfaces:

- `frontend/src/app/dashboard/lead-hunter/**` — email signatures intentionally sign as Wasi per earlier decision (§3.10)
- `frontend/src/app/ae/**`, `frontend/src/app/accounting/**`, `frontend/src/app/admin/**` — internal tools, fabricated fixture data allowed (see §13 deferred cleanup)
- `frontend/src/data/splashQuotes.ts` — ATRI/NIOSH-sourced industry facts, employee audience
- Internal dashboards may reference "Wasi" or "Sales (Wasih)" labels
- `frontend/public/security-policy.html` — technical rate-limiting documentation, not marketing
- ~~`frontend/public/ae/**` — internal AE console HTML, fixture data OK~~ — **the tree was deleted in v3.8.asc (2026-08-17)**; no such surface exists and nothing is exempt under it (retired 2026-09-21).

---

## §13 DEFERRED POLISH / CLEANUP QUEUE (non-blocking)

Sequenced backlog. Ordering is deliberate: items earlier in the list should be done before items later.

### §13.1 Active state

Phase 6.2 closed at v3.8.ee (Lead Hunter / CRM separation). No active sprint. Phase 6.3 awaiting scoping.

### §13.2 Pre-Phase-6.2 housekeeping

Should complete before next sprint kickoff:

1. **Migration script run against prod** — `backend/scripts/decode-encoded-load-fields.ts`. Idempotent, multi-pass-safe. Walks 19 fields on loads table, decodes pre-v3.8.d.2 encoded values in place. Run once and confirmed clean (4 loads decoded incl. one 6-times-encoded outlier) on 2026-04-29; **rerun if any pre-v3.8.d.2 data is still suspected** in surfaces beyond the loads table.

2. ~~**Phase 5E.c — T&T source-of-truth scoping decision**~~ — **CLOSED 2026-04-30** at "current-state documented; future-state explicitly deferred with named triggers" level. See [`docs/architecture/track-and-trace-source-of-truth.md`](docs/architecture/track-and-trace-source-of-truth.md) v1.0. Documents canonical source (`Load.trackingEvents[]`), write paths, auth boundaries, PII scope on public /tracking, display granularity vs. industry public-tracker patterns (RXO/Coyote Camp 2 vs. C.H. Robinson Camp 1), 5 deferred future-state decisions with named reopen triggers, 3 risks with mitigations, 4 implicit architectural decisions surfaced for searchability. Phase 5E gaps #1 + #2 already closed via the live `/tracking` page discovered during v3.8.c verification; gap #3 closed by this document. Phase 5E now fully closed.

### §13.3 Phase 6.2 sprint candidates

Moved → `docs/claude/backlog.md`, and split from there into `docs/claude/backlog-open.md` (items still
waiting on a decision or a build) and `docs/claude/archive/backlog-records.md` (accounts of arcs that
shipped). ~250 items, 52% of this file before the move. Cited 599 times across the codebase, so the label
stays here.

**Read `backlog-open.md` before proposing work** — §19 Sub-pattern 15 exists because a stale "NOT built"
claim is read exactly when somebody is deciding whether to build something, and commissions duplicate work.

302. **`generate-logo.ts` would recreate the assets the logo arc removed, and `font-drift.js` keys on one of them (banked 2026-09-22, v3.8.bgi arc).** The arc replaced every copy of the SRL mark with the verified vector master, and ruling 7 gated deletion of the abandoned gradient-"P" family on a zero-reference sweep. **The sweep does not show zero.** [`backend/scripts/generate-logo.ts`](backend/scripts/generate-logo.ts) still writes three of them — `../src/assets/logo.png` (`:110`), `../assets/logo-pdf.png` (`:120`) and `../../frontend/public/logo-compass.png` (`:129`) — so a single run of that generator puts back assets this arc deliberately stopped using, in the old khaki trace, with nothing to warn whoever runs it. And [`backend/scripts/font-drift.js:109`](backend/scripts/font-drift.js#L109) keys on `frontend/public/logo.svg`, so deleting that file would take a guard's subject with it rather than merely tidying a public directory. **Nothing was deleted and nothing was fixed here** — this is the "otherwise report" branch of ruling 7, recorded so the next session does not read the arc's completeness as permission to delete. **Fix shape when taken up:** retire `generate-logo.ts` (it generates a design SRL no longer uses; its output has no live consumer), then re-run the sweep, then delete the P-design family and re-point `font-drift.js` at `frontend/public/brand/srl-logo-fullcolour.svg` in the same commit. Do the order in that sequence — deleting first breaks the guard, and the guard going red on a file nobody meant to keep is how a real font-drift finding gets ignored.

303. **The Neon rotation, the read-only census role, and one instructed claim the database disproved (2026-09-22, v3.8.bgk).** The `neondb_owner` password was reset, Render updated, and a read-only role `srl_readonly` created. Rotation verified read-only end to end; the findings that outlive it:

    **303.1 — The read-only credential was not gitignored, and a census still ran as the owner.** `.gitignore` carried `.env`, `.env.*.local` and `.env.production`, none of which matches `.env.production.readonly`: `git check-ignore -v` printed no match and `git status` listed the file, so a production credential sat in the tree visible to `git add -A` — the shared-index hazard of §2.2, where anything staged is staged for every session. Closed with `.env.production.*` rather than the two exact names, so an unforeseen variant is ignored by default instead of exposed by default (`.env.example` does not match and stays tracked). The file itself was `.env.production.readonly.txt`, a Windows Save-as artifact, renamed to the name the rail looks for. **Separately:** the seven tracked census scripts reached production as `neondb_owner` — the role that can write every table — kept harmless only by `SET default_transaction_read_only = on`, a session setting each script asks for itself, and **three of the seven never asked for it at all** (`_readonly-agreement-version-fidelity`, `_readonly-qp-archive-verify`, `_readonly-bca-executed-count`). They were read-only by the author's discipline and nothing else. They now load `backend/.env.production.readonly` through one resolver, `scripts/_census-credential.ts`, and connect as `srl_readonly`; the session setting stays as the second layer. The guards are positive rather than "not localhost" — host must BE Neon, user must NOT be the owner — so pasting the owner URL into the read-only file is refused rather than silently restoring write access. **`_b5-fk-gate.ts` was deliberately NOT repointed:** it matched the grep only because its COMMENT explains the rail's blind spot, while its code reads `backend/.env` and refuses any non-local host by design (Item 291.9/291.10). Prose is not code — §19 Sub-pattern 17.

    **303.2 — CORRECTED: `GRANT SELECT ON ALL TABLES` does NOT need re-running after a migration.** The instruction to bank was: *GRANT SELECT ON ALL TABLES IN SCHEMA public TO srl_readonly must be re-run after any migration that adds a table, or the next census fails on the new table.* Production disproves it. `pg_default_acl` holds a row `{srl_readonly=r/neondb_owner}` for objtype `r` in schema `public`, so `ALTER DEFAULT PRIVILEGES` has already been run, and **all 141 public tables are owned by `neondb_owner`** — which is the role migrations run as. A table a migration creates is therefore readable by `srl_readonly` automatically. Measured alongside: 141/141 tables SELECT-able, **zero** tables with any INSERT/UPDATE/DELETE, `USAGE` on schema public granted, role attributes `rolsuper=false rolcreatedb=false rolcreaterole=false rolbypassrls=false`. **The caveat that IS real, and is narrower:** the default ACL is scoped to `neondb_owner` AS CREATOR and to objtype `r` — a table created by any other role is not covered, and sequences (`S`) are not covered at all (irrelevant to a SELECT-only census). Banking the instructed claim unchecked would have put a false maintenance obligation into canon and sent someone to re-run a grant that is already automatic — §19 Sub-pattern 15, and the Item 250 rule that a verified premise beats an instructed one.

    **303.3 — The read-only role's refusal is a property of the ROLE, proven by control.** `srl_readonly` INSERT into `loads` → **SQLSTATE 42501, permission denied**; the identical probe as `neondb_owner` → **23502 not-null violation**, i.e. the row would have been inserted but for constraints. The outcomes differ, so 42501 is measuring grants rather than something incidental. **The probe deliberately did NOT set `default_transaction_read_only`:** under that setting Postgres refuses with 25006 whatever the role's grants are, so the check would have passed while proving only that the session setting ran — the vacuous-green shape of §19 Sub-pattern 16. Both probes were wrapped in a transaction and rolled back; `loads` row count unchanged at 29 before and after.

    **303.4 — `ACCOUNTING_EMAIL` is a compile-time constant; changing the recipient needs a deploy.** [`backend/src/config/authority.ts:109`](backend/src/config/authority.ts#L109) is `export const ACCOUNTING_EMAIL = "accounting@silkroutelogistics.ai" as const` — no `process.env` read anywhere near it, and no entry in `render.yaml`. So the address an accountant's mail goes to is fixed at build time. **Fix shape:** read it from env with the current value as the fallback, so behaviour is unchanged until the var is set, alongside `PORTAL_BASE_URL` — which already has exactly this shape at [`lib/driverPingToken.ts:60`](backend/src/lib/driverPingToken.ts#L60) (`process.env.PORTAL_BASE_URL || "https://silkroutelogistics.ai"`) and is the precedent to copy. Same class as Item 296, and the four-location checklist (§19 Sub-pattern 11 case study #2) applies to any new env name.

    **303.5 — `portalTourCompletedAt` is organically stamped: bei is live with real carriers.** Two rows, neither seeded: **JETEX FREIGHT LLC 2026-09-22T16:48:18.968Z** and **JOT FREIGHT LLC 2026-09-22T18:57:10.576Z**. The once-per-carrier stamp is doing what Item 293 describes.

    **303.6 — Already banked elsewhere; recorded here only as pointers, not duplicates.** Production route existence cannot be probed unauthenticated — the `tenderRoutes` catch-all at `routes/index.ts:315` returns a byte-identical `401 {"error":"No token provided"}` for a real route and a nonexistent one, so **existence comes from source and behaviour from staging**. That is §19 Sub-pattern 16's ELEVENTH FIRE, already written up there; it is a standing property, not a defect. **`/api/auth/e2e-token` stays 404 in production** (v3.8.anh hard-404 on `NODE_ENV==="production"`) and must not be re-enabled to make probing easier. Item 273.11's second measured occurrence was banked at `cd501292`; **Item 273.12 remains the fix** and is still unactioned.

    **303.7 — Banked, not done: the untracked census scripts still carry the owner credential.** Scripts under `backend/scripts` that load `.env.production.local` and are untracked belong to sessions that have not committed them (`_a0-rowcount-gate`, `_arc-b2-a0-aeroswift`, `_arc-phase0-prod-proof`, `_arc-phase0-recalc-check`, `_arc-phase1-a1-db`, `_arc-phase1-prod-proof`, `_readonly-document-upload-census`). §2.2 says another session's uncommitted work is not mine to stage or edit, so they were left alone. Whoever owns them should point the read-only ones at `_census-credential.ts`. The tracked WRITE scripts (`mark-legacy-test-loads`, `cancel-stranded-shipments`, `backfill-customer-contacts-from-email`) and the two named rail commands correctly keep `neondb_owner` and were not touched.


304. **A reused container manufactured a false P0, and it survived diagnosis all the way to a halt card (2026-09-23).** Four findings from the credential-rails arc, one of them a methodology fire with two prior occurrences already on the books.

    **304.1 — CLEAN-SEED BEFORE TREATING ANY CONTAINER RESULT AS A FINDING. THIRD FIRE OF THE SHARED-CONTAINER CLASS.** The BOL access gate (`CARRIER` + no CONFIRMED tender → `403 RC_NOT_SIGNED`) was probed against a container that had already been through a full E2E run and a second `db push` + seed. It answered **HTTP 500** for the carrier AND for an AE — and an AE bypasses the gate by design, which is what made the result look structural rather than environmental. The reading recorded was "BOL generation fails for every container load; the refusal is unreachable; Check 2 inconclusive". **All of it was wrong.** On a container seeded once from empty, the same request returns **403 RC_NOT_SIGNED** for the carrier and a **44,985-byte PDF** for the AE, and a direct call to the generator renders **33 of 33** seeded loads. The gate had been working the whole time. **Why it got as far as a halt card:** a 500 and a 403 are the same colour to anyone reading "not 200", so the probe's own failure looked like the subject's. The AE control — added later — is the thing that separates them, because a load that cannot render refuses everybody while a gate refuses only the carrier. **Same class as two occurrences already recorded, and they should be read together:** Item 273.6 / 291.13 (the E2E runner's fixed ports and reused container let a concurrent run consume the waterfall fixture, so `_readonly` B6.5d failed on a fixture that was legitimately gone) and Item 222.4 (`.next` shared between two builds produced an `ENOENT` on a manifest that was not a code error). **The standing rule, now three-fire validated:** a container that has served a previous run is evidence about that run, not about the code. Seed from empty — or scope the container per session (`E2E_LOCAL_CONTAINER` / `E2E_LOCAL_PG_PORT`) — before any observation from it is written down as a finding. The cost of not doing so here was a P0-shaped claim in a report, and the cost of doing it was one `docker run`.

    **304.2 — Item 303.7 stays OPEN: seven untracked census scripts carry the owner credential, and the resolver cannot reach them.** `_a0-rowcount-gate`, `_arc-b2-a0-aeroswift`, `_arc-phase0-prod-proof`, `_arc-phase0-recalc-check`, `_arc-phase1-a1-db`, `_arc-phase1-prod-proof`, `_readonly-document-upload-census` each parse `.env.production.local` with their own loader and connect as `neondb_owner`. **`resolveCensusCredential` already refuses `neondb_owner`** (since v3.8.bgk, pinned by `credentialGuards.test.ts` in v3.8.bgy) — but enforcement in a resolver reaches only the scripts that import it, and **none of these seven does** (verified individually, not inferred). So no change to `_census-credential.ts` can close this, and adding a second refusal elsewhere would be motion rather than progress. **Bounded risk, worth stating precisely:** the files are untracked, so they never reach CI and cannot run anywhere but the one machine holding them; they belong to the sessions that wrote them, and §2.2 puts them out of reach of any other session to edit or delete. **Closes when their owner points the read-only ones at `_census-credential.ts` or deletes them.** The tracked WRITE scripts (`mark-legacy-test-loads`, `cancel-stranded-shipments`, `backfill-customer-contacts-from-email`) and the two named rail commands correctly keep the owner credential and are not part of this.

    **304.3 — A root `tsc` gate over `e2e/` is red on HEAD, and `npx tsc` at the repo root is a decoy package.** `./backend/node_modules/.bin/tsc --noEmit -p tsconfig.json` reports `e2e/helpers/pdf.ts(19,1): error TS2578: Unused '@ts-expect-error' directive.` **Pre-existing** — present with this arc's files removed, so not introduced here — and it does not fail CI, because no job runs a root typecheck over `e2e/`. Two things follow. The directive is stale: whatever it suppressed now type-checks on its own, so it should go rather than be widened. And **`npx tsc` from the repo root resolves to a joke package that prints "This is not the tsc command you are looking for" and exits 1** — a reader who takes that exit code as a typecheck failure is reading a decoy, and one who takes it as "typechecking is broken" is also wrong. Use `./backend/node_modules/.bin/tsc` explicitly for anything outside `backend/` and `frontend/`, both of which have their own local binary on PATH.

    **304.4 — CLOSED: `.env.production.local` `DATABASE_URL` was the direct endpoint for an unknown interval; it is now pooled and the gap is guarded.** The file held `DATABASE_URL` and `DIRECT_URL` as byte-identical DIRECT urls with `-pooler` appearing nowhere (Item 303, finding b1). Re-measured 2026-09-23: `DATABASE_URL` pooled **true**, `DIRECT_URL` pooled **false**, hosts differ — correct. **How long it was wrong is not knowable:** the file is gitignored, so there is no history to read, and nothing logged the shape. What closes it is not the repair but the guard — `check-direct-url.js` (v3.8.bgy) now fails the build when a `neon.tech` `DATABASE_URL` lacks `-pooler`, so the same drift cannot return silently on Render. **The guard reads the build environment, not this file**, so a future local repaste could still go unnoticed; the file's correctness is checked by the census scripts' own neon.tech assertion and by nothing else.

305. **Rebasing an arc around a live peer session: the throwaway worktree, and the stale local ref it leaves behind (2026-09-23).** `git rebase` refuses to run over unstaged changes, and §2.2 Rule 8 says another session's uncommitted work is never yours to stage, revert or stash. When both hold at once the integration cannot happen in the shared worktree at all — and the resolution is not to touch their files.

    **What ran.** A peer session held **1,430 deletions across 16 files** of in-flight brand-skill work in the primary worktree; `git rebase origin/main` answered *"cannot rebase: You have unstaged changes"* before starting, leaving no partial state. The arc was rebased instead in a throwaway worktree cut off `origin/main` (`git worktree add <dir> -b tmp/<arc> <local-main-sha>`), conflicts resolved and gates run there, and the result pushed as a ref: `git push origin tmp/<arc>:main`. **A ref push does not read the working tree**, so the peer's dirty files were never a factor and ended byte-for-byte as found — 17 modified, 0 staged, verified after the push.

    **The consequence, and it is deliberate.** Local `main` is left pointing at the pre-rebase SHA while `origin/main` carries the rebased arc. Do NOT "fix" that with `git update-ref` or `git reset`: the rebased commits carry the same CONTENT under new SHAs, so moving the ref under a dirty tree makes every file whose conflict resolution differed (here the render pins, CLAUDE.md and VersionFooter) show as spuriously modified in the peer's `git status`, and `reset --hard` would destroy their work outright. The correct close is that the peer commits or stashes their own work and runs an ordinary `git pull --rebase`, where **patch-id drops the already-upstream commits** — all 34 of them here — replaying only their own.

    **THE HAZARD, and the reason this is written down.** Between the push and that pull the local ref is stale and *looks* like an ordinary branch. **Work started from it re-parents onto the pre-rebase base, so committing and pushing from there duplicates the entire arc on `origin/main`.** A docs commit is enough to do it — this item was written in a fresh worktree off `origin/main` for exactly that reason. The check costs one line: compare `git rev-parse main` against `git rev-parse origin/main` before committing in any worktree whose branch may be stale, and when they differ either integrate first or cut a fresh worktree. Same family as §2.2's shared-index rule and Item 291.13's fixed E2E ports: shared state on one machine is shared state.


306. **`auditLog` cannot see a response that is not `res.json`, so a declared audit can be decoration (2026-09-23, surfaced by Item 8.3.b's arc).** The middleware wraps `res.json` and nothing else. A handler answering `res.send`, `res.sendStatus` or `res.end` is invisible to it, and it fires only on 2xx — so a route can *declare* an audit, pass every review that greps for one, and record nothing.

    **It was not hypothetical.** `router.delete("/:id/contacts/:cid", auditLog("DELETE", "CustomerContact"), …)` answered `204 .send()`. The declaration **had never once fired**, which is why the BKN contact deleted between 12:00 and 13:53 on 2026-09-23 left no trace. v3.8.bhn removed the false declaration rather than leaving it as cover it did not provide, and `deleteCustomerContact` now writes its own `AuditTrail` row — carrying the actor **and the consent the contact held**, which is strictly more than the middleware could have recorded.

    **The numbers, and they measure two different things — both are true.** There are **89** `auditLog(` declarations across `backend/src/routes/` on `origin/main` pre-arc and **88** after v3.8.bhn removed the one that never fired. Separately, a success-path census of **67** routes (classified on *what the handler answers on success*, not on whether it ever calls `res.json` anywhere) found **66 audited and exactly 1 silently unaudited** — the one now closed.

    **Census v1 reported 0 and was wrong, which is the methodology half.** It asked "does this handler ever call `res.json`" — and `deleteCustomerContact` answers 404 *with* json and 204 *with* send, so it looked covered. The question that discriminates is what the handler answers **on the success path**, because that is the only path `auditLog` fires on. §19 Sub-pattern 16: the check ran, and it was not checking the thing its name implied.

    **PENDING — the middleware fix, and a census of all 89 declarations against their actual success-path response shape.** The 67-route census was scoped to the arc's blast radius, so **the other declarations have not been checked** and any one of them answering `res.send` is silently recording nothing today. Fix shape: `auditLog` wraps `res.send` / `res.sendStatus` / `res.end` as well as `res.json`, dedupes so a handler calling `res.json` internally does not double-write, and keeps the 2xx gate. Then a guard asserts every declaring route is actually observable — **a text guard cannot do this** (presence is not function, Sub-pattern 16's fifth fire), so it has to exercise the route and read whether a row landed.
---

## §14 LEGAL / COMPLIANCE STATUS

- Property broker under 49 U.S.C. §§ 13904, 13906
- **Carmack Amendment:** SRL is NOT liable as a motor carrier. Carriers sign the bill of lading and assume Carmack liability per the Broker-Carrier Agreement.
- **BMC-84 bond:** $75,000, filed with FMCSA, surety PFA Protects (CA# 0M18074) — full detail in §1. No carrier-facing agreement restates the bond provisions and none needs to: the bond is a filing with the FMCSA, not a term between SRL and a carrier, and per the counsel-confirmed architecture covenants live in the Broker-Carrier Agreement. The citation that stood here to "Caravan Quick Pay Agreement v2 (Article 20)" pointed at a document that does not exist in this repo; removed 2026-08-16.
- Michigan governing law, Kalamazoo County venue for disputes.
- Non-solicitation 12 months post-termination, 15% liquidated damages (Flock pattern).
- **Broker-Carrier Agreement — exists in-house, pending counsel.** The body is `BROKER_CARRIER_AGREEMENT` in [`backend/src/data/agreements.ts`](backend/src/data/agreements.ts): 11 sections, `BCA_VERSION = 2026-06-27-v1`. It is the master agreement governing every tendered load. The agreement PDF renders from it, the carrier portal fetches it (`GET /carrier-auth/agreement/broker-carrier`), the onboarding click-through presents it, and carriers sign it today. A standalone `.docx` is no longer the mechanism: this file is the source and the PDF is generated, so the review pane, the click-through, and the executed PDF cannot disagree on the *body* — and, since v3.8.asb, cannot disagree on the *version* either. [`frontend/src/app/onboarding/page.tsx`](frontend/src/app/onboarding/page.tsx) used to keep a hardcoded `BCA_VERSION = "2026-05-24-v1"` as the fallback behind its fetch (`bcaContent?.version ?? BCA_VERSION`), so a failed fetch stamped a three-month-stale string onto `CarrierProfile.bcaVersion` — and let the applicant tick "I agree to the Broker-Carrier Agreement above" while the pane still read "Loading the agreement…". It failed OPEN. That constant is deleted, the acknowledgement checkbox is disabled until the body has loaded (the activation pane's fail-closed pattern), and [`carrierController.ts`](backend/src/controllers/carrierController.ts) now stamps `BCA_VERSION` server-side instead of `data.bcaVersion || null`. The validator still declares `bcaVersion` so a cached older bundle does not 400, but it is accepted and ignored. It has NOT been through a Michigan commercial attorney — see §16 #1. Each load is further governed by the Rate Confirmation, an operational form incorporating this Agreement by reference; the Agreement controls on conflict.
- **Agreement termination — RATIFIED 2026-08-21, and IMPLEMENTED.** `POST /api/carriers/:id/agreements/:agreementId/terminate` ([`carrierVettingController.ts`](backend/src/controllers/carrierVettingController.ts)), **ADMIN + CEO only, effective immediately, reason required (≥10 chars), carrier notified with that reason.** It **never deletes** — the row is marked TERMINATED and keeps its signature, IP, user agent, version and executed PDF, because a terminated agreement is still the evidence of what was agreed while it stood.

  **Who:** ADMIN + CEO, deliberately narrower than the ADMIN/CEO/OPERATIONS that may create and sign one. Terminating a BCA hard-blocks every tender for that carrier, which is a carrier-approval-class consequence, so it sits with carrier-approval-class authority. Widening it to OPERATIONS is a business decision and is not blocked by anything technical.

  **Notice:** none. Termination bites the moment it is recorded. **This is defensible because the paper does not promise otherwise** — the BCA contains no termination-notice clause, and §244's 30-day notice governs Caravan *program criteria*, not the agreement body. That is an absence rather than a permission, and it is the right default until counsel says otherwise: a platform that supports immediate termination can add a notice window later, whereas one that cannot terminate at all has no answer to a carrier who must be stopped today.

  **What counsel should settle (rides with §16 #1, not a platform blocker):** whether the BCA should carry a termination-notice clause at all, and if so how long. The consolidated draft should state plainly what the platform must support, since the mechanism now exists and the paper is silent about it.

  **TERMINATION MID-LOAD — RATIFIED 2026-08-21 (Arc 18), and IMPLEMENTED.** The policy, verbatim:

  > **In-flight loads complete and pay normally. Termination blocks future tenders only. Freight-cause exceptions are human-handled and out of code scope.**

  This is the behaviour the platform already had; Arc 17 found it *undecided* rather than broken and pinned it while the question stood. Ratifying it costs nothing to change and everything to leave unsaid. **A carrier who hauls a load is owed for it whatever else is true about the relationship** — the freight is on their truck, somebody has to deliver it, and refusing to pay for work already done because the commercial relationship ended is both wrong and the kind of thing that gets a broker's bond claimed against. The third clause matters as much as the first two: if a carrier is being terminated *because* of something on this load, that is a human decision about that load, taken on the load, and code must not try to infer it.

  **What the code does, therefore, is not stop anything — it makes sure a human knows.** Two consequences follow from terminating a Broker-Carrier Agreement, and only two ([`terminationImpactService.ts`](backend/src/services/terminationImpactService.ts)):

  1. **The owning AE is notified**, by load number and lane, that a load of theirs is now being hauled by a carrier SRL has terminated — one message per AE listing all of their affected loads, not one per load. The admin who terminated always receives the full picture regardless of who posted the loads, because they took the action.
  2. **Those loads move to the EXPEDITED check-call cadence**, reusing the protocol the platform already runs for urgent freight rather than inventing a second one. The concrete risk of a terminated carrier finishing a load is that they stop answering. **Watch harder; do not seize.**

  **In-flight means assigned and past tender but not yet POD_RECEIVED.** A load at POD_RECEIVED or beyond is excluded deliberately: the freight is delivered and the paperwork is in, so a terminated carrier at that point needs paying, not watching. Terminating a **Quick Pay** Agreement triggers none of this — it changes payment timing, not who is hauling, and escalating check calls over a fee change would be noise.

  **The confirmation modal states both halves before the admin commits**, because the prior wording ("loads already in flight are unaffected") reads as *nothing happens to them* and left an admin to guess whether SRL still pays. It now separates **stops immediately** — this carrier cannot be tendered or accept any new load until they sign a new agreement — from **does not stop**: loads already in flight stay with this carrier, complete normally, and **are paid normally**, with check calls tightened and the AE notified. It closes by saying that a load which must be taken off this carrier has to be moved on the load itself, because termination will not do it.

  **TERMINATED reads as terminated, not as never-signed.** That distinction is enforced in two places (v3.8.atf): the carrier compliance panel names the date and reason, and the tender-time override modal treats `AGREEMENT_TERMINATED` as a hard block whose remedy is a signature rather than a waiver. Confusing the two was the original defect — an AE offered a waiver for a condition no waiver can fix.

- **CARRIER ARCHIVE — RATIFIED 2026-09-19. Archive is `deletedAt` plus `isActive` off; suspend is the operational state; both may apply to the same carrier; only in-flight work blocks.** Ruled by Wasi on 2026-09-19, superseding the any-history rule that v3.8.bdi shipped as an interim ("a carrier with history is suspended, never archived"). This paragraph is the ruling's text; the code follows it, not the other way round.

  **What archive IS.** `CarrierProfile.deletedAt` + `deletedBy` + a `CarrierArchiveReason` + an optional note, and `User.isActive = false`, written in ONE transaction. It is a soft delete: the profile, its documents, its executed agreements, its audit rows and its history stay; the login stops — `middleware/auth.ts` refuses an inactive user on the next request, so no token blacklist is needed. Nothing is deleted.

  **What suspend IS, and why the two are independent.** `onboardingStatus = SUSPENDED` is the OPERATIONAL state: a carrier who may not be tendered today and may be reinstated tomorrow (the FMCSA auto-reversal does exactly that). Archive is a record-lifecycle state. They are two dimensions, not two values of one, and **both may apply to the same carrier**: a suspended carrier may be archived, and archiving does not write `onboardingStatus`. A surface that folds them into one status is wrong.

  **Only IN-FLIGHT work blocks an archive. History never does.** In flight means a load assigned to the carrier from which POD_RECEIVED is still reachable under the load state machine — **DELIVERED-pre-POD counts as in flight**, because the POD is still owed (Item 195 F-8) — and a tender the carrier has accepted (ACCEPTED, RC_SENT, CONFIRMED) on such a load. The refusal is a 409 that names the loads; the exit is to release or complete them, or to suspend instead. Loads past POD, paid settlements, executed agreements, documents, drivers, scans, past matches and settled tenders are history and never block — a signed BCA is evidence, and evidence is kept, not deleted (v3.8.bdi's test "a signed agreement alone refuses" is reversed by this ruling).

  **Six classes of open offer WITHDRAW inside the archive transaction instead of refusing:** open tender offers (OFFERED, COUNTERED), queued waterfall positions, pending bids, future dock schedules, active routing-guide entries, and open info requests. Each is an offer nobody has accepted or work nobody has started; each is closed by SRL's act and recorded as SRL's act, never as the carrier's refusal (the v3.8.aww rule: a withdrawal must not read as a decline anywhere a carrier is scored). If a withdrawal fails, the transaction fails and nothing is archived.

  **Payables and disputes NEITHER block NOR change.** An unpaid `CarrierPay` stays owed and stays payable; an open `PaymentDispute` stays open; a settlement in progress finishes. Archiving hides nothing from accounting and forgives nothing: money owed to a carrier is owed whatever the state of the record.

- **Caravan Quick Pay Agreement — exists in-house, pending counsel.** The body is `CARAVAN_QUICK_PAY_AGREEMENT` in the same file: 10 sections, versioned by `QP_VERSION` in that file. **The literal version string is deliberately not reproduced here** — go read the constant. Every time this section has restated it, it has gone stale, once inside the same hour it was written. `getAgreement()` resolves `quick-pay`, `quickpay`, and `qp` to it, so `GET /carrier-auth/agreement/quick-pay` serves it and the signed `CarrierAgreement` row written by [`routes/carrierAuth.ts`](backend/src/routes/carrierAuth.ts) records consent against a version that points at real clauses. It is a first draft written in-house. It is NOT attorney-reviewed and NOT final — §16 #2. It is a **supplement**, not a second master: Section 1 incorporates the BCA by reference, it deliberately does not restate BCA covenants, and the BCA controls on conflict. Every economic figure in it is the locked §8 ladder. When counsel returns, swap the body in that file and bump `QP_VERSION`; the signing mechanism records consent against whatever version is current, so no code change is needed. **Version-stamping invariant:** the version recorded on a `CarrierAgreement` signature row must be the version of the text the signer was actually shown, resolved server-side from `agreements.ts`. A request body must never decide it. The frontend `QP_VERSION` mirror this section previously flagged is gone — deleted in v3.8.asa, recorded at [`frontend/src/lib/carrierAgreements.ts`](frontend/src/lib/carrierAgreements.ts) — and the activation pane now fetches the body and posts back the version served with it. That closed the client half; v3.8.asb closed the server half. Both signing paths in [`routes/carrierAuth.ts`](backend/src/routes/carrierAuth.ts) (`sign-bca`, `quickpay-election`) now compare the posted version against the served constant, return `409 AGREEMENT_VERSION_STALE` on mismatch so a stale tab is told to reload rather than silently recording consent to a body nobody can reproduce, and stamp the constant — never the request. **The tripwire for any future consent write is the pattern `bodyVersion || CONSTANT`, or any write that stamps a version the request supplied.** The constant is the only correct source; the request is only ever evidence of what the signer was shown, which is what the 409 is for. **Correction history:** the "DRAFTED — 22 articles, 3 exhibits, 513 paragraphs, 42.6 KB" instrument described here through 2026-08-15 is not in this repo and never was. The 2026-08-15 replacement text was itself written mid-flight and read as false the moment its own commit landed — it said the endpoint 404s and cited `2026-05-24-v1`, both of which describe the state before that sprint. Corrected 2026-08-16. Describe what is, not what is in motion. That correction then went stale inside the same day: this section cited `2026-08-15-v1` while the constant had moved to `-16`, and it warned about a frontend version mirror that had already been deleted, while the server-side tripwire that actually remained went unrecorded. Corrected again 2026-08-16. That correction was then itself overtaken while it was being written: a parallel sprint bumped the constant again (v3.8.asb, narrowing two Quick Pay clauses that promised more than the billing path delivers) between the sentence being typed and the pass being verified. Three drifts, one of them inside the hour. So the literal is now gone from this section entirely. The lesson is narrower than "describe what is" — **do not restate a value that lives in code. Cite the constant and make the reader go read it.** A version string in prose has a half-life measured in hours; a pointer to the constant does not.
- **A SEVERE CARRIER-SPECIFIC FRAUD SIGNAL MAY BLOCK A TENDER; THE BLOCK MUST
  ALWAYS NAME ITS HUMAN EXIT (ratified 2026-08-21, Arc 24).** Chameleon risk at
  HIGH is the only fraud signal that blocks rather than deducts, and it earns
  that because it is evidence about THIS carrier — a phone, email, address,
  EIN, IP or DOT hash overlapping another carrier's — not a generic score. A
  reincarnated carrier under a fresh MC is the loss a broker cannot absorb: it
  lands on the shipper's freight and SRL's bond, and unlike an overpayment it
  is not recoverable afterwards.

  **The exit is the load-bearing half.** An AE reviews the matches on the
  carrier's Security Signals card; clearing them recomputes the risk from what
  remains and releases the block. Confirming one keeps it. A block a human
  cannot escape is a deletion with extra steps, so the blocked reason itself
  states the remedy rather than leaving an AE to find it.

  This applies to every block, not just this one. The vetting-score block was
  found in the same arc to be a SECOND, unnamed block sitting behind the first:
  clearing a match removes a 20-point deduction that stays baked into a
  persisted score until vetting re-runs, so an AE followed the named exit and
  hit a different wall. It now names the re-vet as its own exit.

  **Item 231 narrowed, not reversed (ratified 2026-09-17, v3.8.bbw).** A match
  row is evidence, and evidence can stop existing — the rule that produced it
  changes (v3.8.bbv: EMAIL became the same inbox, never the same provider), the
  other carrier is deleted, a fingerprint is corrected. A rescan now retires
  the OPEN rows it can no longer support: DISMISSED, `reviewedById` NULL,
  `reviewNotes` "Retired by rescan: no fingerprint overlap under current
  rule", one SystemLog row per batch carrying the ids. REVIEWED, DISMISSED and
  CONFIRMED_FRAUD are never touched. **A system retirement is not a human
  judgment:** only a HUMAN dismissal (`reviewedById` set) suppresses a pair
  that later genuinely matches; a retired pair comes back as a fresh OPEN row
  if the evidence returns. And the level the scan writes is the level a
  review reads — `checkChameleon` writes through `recomputeChameleonRiskLevel`
  — so a CONFIRMED verdict survives a rescan and a downgrade lands on the
  same path as an escalation.

- **AN OVERRIDE RELEASES; IT DOES NOT SKIP. HARD FLOORS APPLY REGARDLESS
  (ratified 2026-08-22, Arc 26).** A blanket compliance override runs the full
  check sequence and releases only the **waivable** blocks. It never short-
  circuits the gate, and the response **names every block it released** rather
  than returning a bare `allowed: true`.

  **NINE blocks are absolute and no override of any kind waives them**, ratified
  across five arcs:

  | Code | Ratified | Why |
  |---|---|---|
  | `AUTHORITY_TOO_YOUNG` (<12mo) | Arc 26 | reconciled an existing contradiction |
  | `AGREEMENT_TERMINATED` | Arc 26 | same |
  | `OFAC_MATCH` | Arc 27 | sanctions are a legal prohibition on transacting |
  | `FMCSA_REVOKED` | Arc 27 | a carrier with no operating authority is not a carrier |
  | `OUT_OF_SERVICE` | Arc 27 | a federal prohibition on operating, lifted only by FMCSA |
  | `INSURANCE_EXPIRED` | v3.8.axl | whether cover is in force is the insurer's fact, and it is the one uncovered loss nobody claws back |
  | `CARRIER_ARCHIVED` | carrier-archive B2a, 2026-09-20 | the record is out of the operation (login off, every open offer withdrawn); the remedy is a RESTORE, which is its own decision with its own audit row — not a 24-hour waiver |
  | `CARRIER_NOT_APPROVED` | carrier-archive B2a, 2026-09-20 | only an APPROVED carrier may be tendered; the remedy is an APPROVAL, which is its own decision with its own authority. **Absorbs the old SUSPENDED / REJECTED refusals**, which until B2a were plain reason strings a blanket override released |
  | `AGREEMENT_MISSING` | v3.8.beh (2026-09-21) | whether a contract exists is a fact — the same fact as TERMINATED with a weaker excuse. **Fired live on 2026-09-18:** a blanket override released the bare "no signed agreement" reason on a carrier holding only the registration click-wrap, the tender was created (`created_under_compliance_override`), the carrier accepted in their own session, and SRL-121492 ran with no contract governing it |

  **AGREEMENT_MISSING is decided by ONE predicate, and so is everything else
  that asks the question.** [`lib/agreementState.ts`](backend/src/lib/agreementState.ts)
  (`getAgreementState` / pure `agreementStateFrom`) returns `SIGNED |
  TERMINATED | MISSING`; the tender gate, the Compass "Carrier-Broker
  Agreement" factor, and (from Commit 2) the rate confirmation signature all
  call it. Three where-clauses became one. A surface that asks "is there an
  executed BCA" by any other route is drift, and the v3.8.aqi incident (a
  Quick Pay row read as the BCA on the vetting report) is what that drift
  costs.

  **D1 — "signed" means ANY executed version (ratified 2026-09-21).** A
  `SIGNED` `broker-carrier` row of any version counts, including the two
  carriers on the archived `2026-06-27-v1` body. **Reason:** there is no
  in-portal re-sign surface yet (§13.3 Item 199 Phase 2), so requiring the
  current F11 body would lock those two out with nothing they could do about
  it. F11-only enforcement is deferred to the Item 199 Phase 2 re-consent
  sprint, which must ship the re-sign path BEFORE the version filter. The
  registration click-wrap (`ACKNOWLEDGED`, v3.8.awo) is NOT a signature and
  never satisfies this — the enum comment says so and the predicate is where
  that sentence became code.

  **D2 — no gate at RC issuance (AE send), a considered deferral
  (2026-09-21).** With AGREEMENT_MISSING absolute, an RC cannot reach an
  unsigned carrier except through a termination between accept and send;
  the signature-time check (Commit 2) catches that at the binding moment,
  which is the one that matters. Gating the send as well would be a third
  copy of the same question on a path that cannot reach it. Revisit only if
  a path that issues an RC without passing accept ever appears.

  **An override releases a JUDGMENT CALL, never a FACT.** Whether a 14-month
  authority is good enough for this load is a judgment, and judgments are what an
  AE is entitled to make. Whether a carrier is under sanctions, has had its
  authority revoked, or is subject to an Out-of-Service order is not a judgment —
  those are facts held by another party. SRL waiving its own record of one does
  not change the fact; it only removes the evidence that SRL knew. That is the
  test for admission to this set, and it is why the first two entries arrived by
  reconciliation and the next three by decision. `INSURANCE_EXPIRED` and
  `AGREEMENT_MISSING` pass it in the same plain form: whether cover is in force
  is the insurer's fact, and whether a contract exists is one SRL can only
  record, never waive into being.

  **`CARRIER_ARCHIVED` and `CARRIER_NOT_APPROVED` pass a SECOND form of it.**
  An archive and a non-APPROVED status are SRL's own facts rather than another
  party's, so the first form does not reach them — but each has its own remedy
  with its own authority and audit row (restore; approve), and an override that
  stood in for either would let a 24-hour waiver take a decision the platform
  records elsewhere. Before B2a a blanket override released a SUSPENDED or
  REJECTED carrier for a day; it does not now, and that is the change Wasi
  ruled for.

  **The grace period is deliberately NOT part of this.** An active
  `insuranceGracePeriodEnd` still produces a WARNING rather than a block: that is
  SRL granting time against a renewal already in motion, granted once and with an
  end date, not an AE waiving a lapse at tender time. The distinction is what
  keeps this a policy rather than a loophole, and it is asserted by
  `_hard-fail-refusal-proof.ts` so it cannot later be folded in.

  **The absolutes are checked BEFORE the scoped allow-list at the override
  endpoint, and the order is load-bearing.** An absolute is not a scoped code
  either, so with the allow-list first every one of the six was refused as
  `400 UNKNOWN_CHECK_CODE` — telling an AE they had made a typo when what they
  hit was policy. Both answers refuse and nothing unsafe happened, but a block
  that names the wrong remedy sends somebody to re-type a code that was correct.

  The Arc 26 pair were already declared un-waivable elsewhere — the override
  endpoint 409s rather than mint against a <12-month authority, and the modal
  disables submit on a terminated agreement — and the gate was the one place that
  disagreed, and it was the place that decides. The Arc 27 three carried no such
  declaration anywhere, so each was declared at its source FIRST (a
  `blocked_code` with `overridable: false`, a 409 from the override endpoint, a
  disabled submit with the reason on screen) and the gate's absolute set mirrors
  those declarations rather than leading them.

  **Membership in that set is mirrored, never judged fresh.** A block is
  absolute when the rest of the system already refuses to waive it: an
  `overridable: false` code, an endpoint that 409s, a modal that disables
  submit. Adding one means marking it in all of those places and saying why
  here. Adding a block the endpoint would still happily mint an override for is
  the same contradiction pointing the other way.

  **Recording an override must never be able to prevent it.** Naming what a
  grant releases is documentation of an act the admin is already authorised to
  take — role-gated, quota-checked, reason-required, audited. If computing that
  record fails, the grant proceeds with a thinner record; it does not 500 and
  leave a load stuck with no explanation.

  ~~**Open, and deliberately not decided here:** OFAC/SDN, FMCSA authority
  revoked, and FMCSA Out-of-Service are still waivable by a blanket override.~~
  **CLOSED — ratified Arc 27**, all three now absolute; see the table above.
  Expired insurance followed in v3.8.axl on the same test.

- **FAIL TOWARD NOT PAYING, NOT TOWARD PAYING THE WRONG NUMBER (ratified 2026-08-21, Arc 16/17).** When a money path cannot determine what SRL owes, it must **refuse and tell a human** — never substitute a number that happens to be nearby.

  The rule exists because the alternative was in production. `createCarrierPayOnDelivery` read `load.carrierRate || load.rate || 0`, and `load.rate` holds the CUSTOMER rate on the primary creation path. With no accept path writing `carrierRate`, an ordinary load settled the carrier at **100% of SRL's revenue** — silently, on a document that looked entirely normal. The `||` was there to be safe. It was the bug.

  **The asymmetry is the whole argument.** Refusing to pay is recoverable in minutes: the AE is notified, sets the rate, and it settles. Overpaying by the entire margin is a clawback conversation with a carrier who is holding a signed rate confirmation, and SRL is in the wrong. The two errors are not comparable, so the defaults must not be symmetric.

  Concretely: a null agreed rate raises no `CarrierPay` and notifies the AE; carrier outreach omits the rate row rather than quoting a number it cannot source; `invoiceService` already refuses on a zero customer rate, which is the same principle on the billing side and is where the shape was copied from.

  **The direction reverses for eligibility filters, and for the same reason.** A filter that cannot tell whether a carrier covers a lane must fail OPEN — offering a lane the carrier declines costs a decline and is visible; never offering it loses the load and is invisible. Pay decisions fail closed; matching decisions fail open. Ask which error can be seen and corrected. (Arc 17 §13.3 Item 223.1.)

- **Ratified-vs-implemented ledger (as of 2026-08-16).** A ratified term is not a live term. This section is where that distinction is kept, because a future session reads this file as binding and will otherwise quote a decision as behaviour. Figures live in §5 and are deliberately not restated here.
  - **Corrected detention-to-layover ladder — RATIFIED AND IMPLEMENTED.** [`backend/src/lib/detentionLayover.ts`](backend/src/lib/detentionLayover.ts) is the single writer of both charge types for a stop, and [`backend/__tests__/unit/lib/detentionLayover.test.ts`](backend/__tests__/unit/lib/detentionLayover.test.ts) holds it: named cases at the conversion instant and either side of it, plus an invariant sweep in quarter-hour steps out to five days asserting that detention and layover never cover the same hour, that **no band past the conversion is left unpaid by any instrument**, that charges never decrease as dwell grows, that every started layover day is paid, and that the ladder never pays less than the pre-sprint code did at the same dwell. **Read that second one precisely, because it is narrower than it looks and the narrowness is deliberate:** the ladder is FLAT from hour 7 to hour 31 — a 14-hour hold and a 30-hour hold both pay $500 — and that is correct, because layover day one is billed in full at the conversion rather than accrued through those hours. The guarantee the code can support is *no unpaid band*, not *earns continuously*. An earlier version of this bullet said "no band past the conversion accrues nothing", which reads as the stronger claim and is why the test and the reconciler doc were both reworded off it. Do not restore the stronger wording, and do not "fix" the flat band — it is prepaid, not unaccrued. The sweep's overlap test asserts its own exercised count, so it cannot pass vacuously. This one is safe to describe as live.
  - **Caravan Quick Pay Agreement body — EXISTS AND IS SIGNED TODAY; counsel review OPEN.** The document is real and binding on the carrier who signs it. It is not attorney-reviewed. §16 #2.
  - **Consent path — RATIFIED AND IMPLEMENTED, no residual gap.** Both activation panes fetch the agreement body from the backend, render what was served, and post back the version served with it; both fail closed when no body loaded. The executed PDF is generated and stored against the signature row for both agreements, and both signing routes reject a stale posted version with a 409 rather than stamping it. The onboarding registration write was the one surface off that path — it posted `bcaVersion` in the registration payload, so the 409 guard never saw it — and v3.8.asb closed it by deleting the page's stale fallback constant, disabling the acknowledgement until the body loads, and stamping the version server-side. **No consent write anywhere now takes its version from the request.** The standing tripwire is unchanged: `bodyVersion || CONSTANT`, or any write that stamps a version the request supplied.
  - **Quick Pay §3 three-condition charge gate — IMPLEMENTED ON ALL THREE CHARGE PATHS.** §3 says Broker will not deduct a Quick Pay fee unless a fee is recorded on the load, the agreement is signed, and Quick Pay is enabled. Three paths can deduct one: `integrationService.createCarrierPayOnDelivery`, `routes/carrierPayments` (the carrier's own request), and `accountingController` prepare/edit. The third checked **none** of the three until v3.8.asb — it derived a fee from a request-supplied `PaymentTier` string, so `PUT /accounting/payments/:id` with `{ paymentTier: "PRIORITY" }` overwrote the correctly-zero fee the delivery path had written and deducted 3% from a carrier who had signed nothing. All three now resolve the fee from the load behind the same gate, and [`__tests__/unit/controllers/quickPayChargeGate.test.ts`](backend/__tests__/unit/controllers/quickPayChargeGate.test.ts) pins each condition independently. **If a fourth charge path is added it checks the same three conditions, or the clause is false again.**
  - **Accessorials reaching the invoice and the settlement — LARGELY BUILT, and the sentence that said otherwise was stale.** Through v3.8.asc this file and the release notes said "accessorial rows are written correctly and reach neither the shipper invoice nor the carrier settlement." A ten-agent trace of the money path in v3.8.ase established that v3.8.asb had already closed both main legs: `autoGenerateInvoice` reads the approved ledger, itemises it, and stamps `shipperInvoiceId`; `syncInvoiceAccessorials` folds a late approval into a DRAFT base or raises a real SUPPLEMENTAL invoice with its own `…S` number; `createCarrierPayOnDelivery` and `syncCarrierPayAccessorials` carry the carrier side, re-pricing in place while the settlement is still open and escalating rather than rewriting once it is committed. An AE can approve a claim on a live React surface and the money moves. **Do not repeat the old sentence.** What remains is edge-work, tracked below and in §13.3.
  - **Customer billing separated from carrier pay — MECHANISM BUILT (v3.8.ase), INERT UNTIL RATES ARE ENTERED.** `LoadAccessorial` carried ONE `amount` column that both sides read, so every accessorial was billed to the customer at exactly what the carrier was paid — zero margin, on a policy that explicitly says customer billing is negotiable per contract while carrier pay is the uniform schedule. `Customer.defaultAccessorialRates` had held the negotiated rates the whole time and no money path read it. v3.8.ase adds a nullable `customerAmount` (NULL means "bill what we paid", so no historical row changes meaning and no backfill was needed) and a single resolver, `invoiceService.customerPriceFor`, which prefers an explicit per-row figure, then the customer's negotiated rate, then cost. **A read-only production check at ship time found ZERO customers with negotiated rates on file, so billing is unchanged until rates are entered on a customer.** The rate is per-unit where the row carries a quantity and flat where it does not.
  - **Quick Pay §8 ineligibility conditions — NOT IMPLEMENTED, and the clause now says so.** Neither charge path queries `PaymentDispute` for an open cargo claim, nor runs `complianceCheck` for authority and insurance standing. §8 stated these as an automatic state ("a load is not eligible… standard tier payment terms continue to apply"), which a carrier could rely on and be charged anyway; it now states them as a right Broker may exercise through the §6 review. Do not restate them as automatic before the checks exist on all three charge paths. The same clause also contradicted §5 outright on incomplete documentation — §5 said the load "remains eligible on the same terms", §8 said "not eligible… standard tier terms apply", one signed page, opposite money — resolved in favour of §5, which is what the billing path does.
  - **TONU two-sided billing — RATIFIED 2026-08-15, NOT IMPLEMENTED.** Neither side exists in the billing path. There is no customer-side TONU charge at all, and `onLoadCancelledOrTONU` ([`integrationService.ts`](backend/src/services/integrationService.ts)) *reverses* credit, voids AP and reverses funding on cancellation — it raises nothing. TONU is a load status today, not a charge. The carrier-side clause the Rate Confirmation prints pays on a narrower trigger than the ratified one. Do not describe either side as live.
  - **4-hour carrier release window — RATIFIED 2026-08-15, NOT IMPLEMENTED.** Nothing enforces it, and the terms grid still prints the line without naming the releasing party. §5 carries the reframing and the reason it no longer conflicts with TONU.
- **Public `/track` PII scope — REVERSED 2026-08-12 (v3.8.ara), superseding the v3.7.k lock.** Wasi reviewed a live QR scan and directed that the public tracking view expose only the lane, not the parties or the cargo. `STATUS_ONLY` (the access level the BOL QR mints, and the default for any bare lookup) now returns **only**: origin + destination **city/state**, status, progress, milestones, scheduled/actual dates, last known city/state, and ETA. **Withheld from STATUS_ONLY:** `shipperName` (customer), `commodity`, `weight`, `equipment`, temperature spec, stop-by-stop facility detail, check calls, and `podUrl`. `FULL`-access tokens (issued deliberately to a shipper) still receive everything.
  - The prior v3.7.k rationale — "the BOL already prints the shipper beside the QR, so redacting adds nothing" — was rejected because the QR outlives the paper: the link is forwarded, photographed, and scanned by dock workers, lumpers, and receivers who are not parties to the shipment. A public link that names the customer and the commodity discloses who ships what, on which lane, in what volume.
  - Implementation: `trackingController.ts` gates every commercially sensitive field on `accessLevel === "FULL"`. Pre-ara only `stops` and `checkCalls` were gated while the rest returned unconditionally — the gate existed but was not honored.
  - Do NOT re-expose customer/commodity on `STATUS_ONLY` without an explicit reversal of THIS decision.

---

## §14.1 SANDBOX TRAPS (this environment; each cost real time before it was recognised)

These are not defects in the codebase. Each one produced a **plausible-looking failure of the thing under test**, which is what makes them expensive: the natural response is to debug the fix rather than the harness. Banked Arc 28 after all three fired in one arc.

- **`pkill` silently does nothing here.** Three consecutive "restarts" of a local server all reported success and all left the original process running, so several rounds of diagnosis were spent on a stale build. **Kill by PID** (`netstat -ano | grep :PORT` → `taskkill /F /PID`), and **verify freshness from the artifact** — `/api/health` reports `bootedAt`, which is what finally exposed it. A restart you did not confirm is a restart that did not happen.
- **`NODE_ENV=production` locally demands TLS the container does not offer.** Prisma refuses a plain Postgres connection and every query throws `error performing TLS handshake`, which surfaces as a 500 from whatever handler ran first. Append `?sslmode=disable` when running a production-config build against a local container.
- **`prisma generate` picks up a concurrent session's schema.** A migration committed by another session between the container being created and the client being generated leaves the client asking for a column the container lacks — here, `users.googleSub` — and the resulting error names *your* handler. Re-run `prisma migrate deploy` against the rehearsal container after any pull or any concurrent-session commit.

**The shared lesson:** when a probe fails, the first question is whether the probe is sound, not whether the code is. Two of the three above looked exactly like the feature being fixed was still broken.

## §15 TOOL PREFERENCES (this Claude Code environment)

- **`bash grep` is reliable; the Grep tool has a known quirk on `/tmp` paths** — use `bash grep` for verification via the Bash tool. Lesson origin: v3.7.d smoke test, Grep tool returned zero matches while `bash grep` found the hits.
- **Rendered-output verification requires deployed URL** (not local file reads) — smoke tests use `curl` on `silkroutelogistics.ai`, not local file reads. Cloudflare Pages takes ~2–3 min to deploy after push; use a single background Bash task with `sleep 180` + `curl` + `grep` chain.
- **Visual confirmation requires the user** — no headless browser available. Claude Code can verify HTML structure + deployed content via curl/grep, but pixel-level checks require screenshots from the user.
- **VS Code Claude Code extension** is the primary surface; commits via bash `git` in the integrated terminal.
- **Shell working directory persists** between Bash calls (e.g. `cd backend` sticks). Use absolute paths (`git -C "c:/Users/..."`) or explicit `cd` at the start of each command if the state matters.
- **Exit code 1 from `grep -c` returning zero matches** — this is expected and healthy (grep conventions). If a background Bash ends with a regression-grep that returns zero prohibited-string hits, the whole pipeline "fails" with exit 1 even though the result is a PASS. Read the output, not just the status.
- **`LogSeverity` enum uses `WARNING`, not `WARN`** — non-standard naming. Caught during v3.8.e.1 build (TS2322 error: `'WARN' is not assignable to LogSeverity`). Most observability platforms (Datadog, Sentry, Pino, Winston) use `WARN`. If logging infrastructure is migrated, the enum mismatch will resurface — worth normalizing during any logging refactor. Today: always write `WARNING` when constructing SystemLog records.

---

## §16 FIRST-CARRIER ONBOARDING BLOCKERS (pre-launch, must resolve before first carrier signs)

1. **Michigan commercial attorney review of the Broker-Carrier Agreement** (Foster Swift / Dirk Beckwith). The 11-section body exists in-house at `backend/src/data/agreements.ts` (`BCA_VERSION 2026-06-27-v1`) and carriers sign it today; it has not been through counsel. Swap the reviewed body into that file and bump the version — no code change. The earlier framing of this blocker as "create a standalone `.docx`" is retired: the body exists and the PDF is generated from it.
2. **Michigan commercial attorney review of the Caravan Quick Pay Agreement** ($400–$800 budget; send with #1 as one counsel pass). The 10-section body exists in-house (see `QP_VERSION` in `backend/src/data/agreements.ts` for the version to send; do not quote it from memory) and is what a carrier signs today. **Send the always-billable TONU with it:** the 2026-08-15 ratification bills the customer $200 on any cancellation with no notice test, which is a liquidated charge and should be reviewed as one before it is ever billed. See §5.
3. **DAT load board registration** activation
4. **Carrier onboarding welcome email final verification** before first real carrier touches it (v3 language confirmed at `routes/carriers.ts:614` in v3.7.h; re-verify before go-live)
5. **`compliance@silkroutelogistics.ai` alias monitoring cadence** confirmed (published on CarrierFraudBanner since v3.7.e)
6. **Insurance verification** — contingent broker coverage via PFA Protects + LOGISTIQ Broker Shield. Confirm policies active, not just in application state.

7. ~~**Agreement-termination policy — WHO and WITH WHAT NOTICE.**~~ **RATIFIED 2026-08-21, moved to §14.** Admin-only (ADMIN + CEO), effective immediately, carrier notified with the reason. Whether the *paper* should promise notice before termination is counsel's domain and rides with #1 — it is not a platform blocker, because the platform can add a notice window later without changing what it already supports. The mechanism, the constraint that it never deletes, and the reason immediacy is defensible now are recorded in §14 as ratified policy rather than held here as an open question.

---

## §17 SECURITY GATE VERIFICATION METHODOLOGY

Documents the smoke-verification pattern used for v3.8.e.1 (SHIPPER approval gate) so future security gates can be verified the same way.

### When to apply

Any sprint that adds or modifies role-based access controls, approval gates, status-based authorization, or session-issuance logic. Prevents shipping security features without empirical verification of the gate firing.

### Permanent test fixtures

Two SHIPPER users in production DB serve as permanent test fixtures:

- **`shipper@acmemfg.com`** (Robert Mitchell / Acme Manufacturing) — kept at `onboardingStatus = PENDING` indefinitely. Use for verifying SHIPPER-gate behavior on PENDING users without disturbing real shipper accounts.
- **`wasihaider3089@gmail.com`** (Wasi / Haider Logistics) — kept at `APPROVED`. Use for positive-path testing.

Do not flip the Acme fixture to APPROVED. Do not delete it.

### Verification methodology (from v3.8.e.1 smoke)

1. Open incognito browser window (clean session state)
2. Open DevTools → Network tab → check "Preserve log"
3. Navigate to login flow
4. Attempt login as PENDING user (Acme fixture, OR temporarily-flipped real account)
5. Submit credentials and OTP
6. Capture status code on the relevant verify-OTP request
7. Expected: 403 status, user not redirected to dashboard, no session token issued
8. If using a temporarily-flipped real account: revert via SQL after test

**Important:** "Preserve log" only preserves request entries through navigation/redirect; response bodies may be GC'd. The 403 status alone is the security signal — message body verification is UX, not security.

### Known limitation

Response body inspection on auth-gate failures is unreliable in DevTools because the failure typically triggers a redirect that wipes response data from the network panel. UX message rendering should be verified separately — either via backend logs (Render dashboard) or as part of the proper "application under review" page when that ships in S-3.

---

## §18 LEAD HUNTER STANDING RULES

These rules apply to every Lead Hunter sprint without re-statement. Codified during the v3.8.v–v3.8.cc Lead Hunter outreach quality fix sprint. §13.3 backlog items that touch Lead Hunter (Apollo importer, prospect schema, outreach generator, sequencer, mass email) must reference this section.

### §18.1 Audit-first

Before any code change in a Lead Hunter sprint: read CLAUDE.md §13.3, `docs/regression-log.md`, and the latest five commits in `git log` to confirm baseline. Report current commit SHA + Phase state before touching code. Map the call paths that the change will affect (CSV importer → bulkCreateCustomers → Customer model → buildEmail/buildEmailSync → sendMassEmail / startSequence / processDueSequences). Do not begin until the audit is surfaced and the baseline is acknowledged.

### §18.2 Atomic commits per bug

One bug = one commit = one regression-log entry (when applicable). No batched commits. Each commit has its own version letter per §3.1. Halt + smoke test (backend `npx tsc --noEmit` clean + frontend `npx tsc --noEmit` clean) between sub-phases. Wait for sign-off before the next.

### §18.3 Brand skill at moment-of-claim

Before any copy/voice claim, read [`/.claude/skills/srl-brand-design/references/voice.md`](.claude/skills/srl-brand-design/references/voice.md) AND [`tokens.md`](.claude/skills/srl-brand-design/references/tokens.md) from disk. Every time. Do not work from session memory; voice/token rules update independently of code and the file is the source of truth. Apply the three calibration questions before publishing copy: would a 15-yr dispatcher nod or roll their eyes? Could a competitor say this verbatim? Is there a number, lane, regulatory citation, or named tool somewhere?

### §18.4 Apollo CSV columns are literal

Apollo emits exact column headers: `First Name`, `Last Name`, `Company Name`, `Title`, `Email`, `Industry`, `Vertical`. Capitals and spaces matter. Importers MUST read these literals — never `Contact Name`, never `firstName`, never `company_name`. Compose `contactName = First Name + " " + Last Name` so downstream firstName extraction (`fullName.split(/\s+/)[0]`) produces the contact's actual first name, not the company's first token. Reference fixture: `srl_coldchain_2026-05-04.csv` (user downloads).

### §18.5 Version verification against §13.3

When a sprint directive suggests a version tag, verify against §3.1 sequence-continuous and §13.3 backlog before applying. If the suggested letter conflicts (taken by a parallel sprint, behind current HEAD, or skips a letter), allocate the next available letter and note the reassignment in the commit message. Never silently re-letter without surfacing.

### §18.6 Ship-default on mechanical halts

When you halt on a mechanical issue (file not found, permission denied, missing skill mount, version-letter conflict, expected dependency absent), make the obvious call and proceed. Do not surface A/B/C menus for non-strategic decisions. Flag the call in the commit message or audit report so it's reviewable. Reserve halts for §3.4 strategic ambiguity (legal claim correctness, scope boundary, irreversible action).

### §18.7 Cold-outreach data flow is import-time validated

Every `Customer` record created through the Lead Hunter import path MUST have `vertical ∈ {COLDCHAIN, WELLNESS}` before any outreach generation runs. `UNKNOWN` is a valid persisted state but is a **hard block** on the email-generation pipeline. UNKNOWN customers surface in the AE Console **Manual Review queue** (Lead Hunter pipeline view → "Manual Review (N)" filter mode at [`page.tsx`](frontend/src/app/dashboard/lead-hunter/page.tsx)).

The hard block enforces at six call sites:

1. [`buildEmail`](backend/src/email/builder.ts) (DB lookup) — throws on `customer.vertical === "UNKNOWN"`
2. [`buildEmailSync`](backend/src/email/builder.ts) (in-memory) — throws on `params.vertical === "UNKNOWN"`
3. `getTemplate` (defense in depth) — throws on Touch 1 + UNKNOWN
4. [`sendMassEmail`](backend/src/controllers/customerController.ts) — skips with reason in `skippedReasons[]` response field
5. [`startSequence`](backend/src/services/emailSequenceService.ts) — throws on UNKNOWN, sequence cannot start
6. `processDueSequences` (cron tick) — holds an active sequence by pushing `nextSendAt` forward 24h, never advances step on UNKNOWN

Adding any new outreach call path requires the same gate. The schema-level enum at [`schema.prisma`](backend/prisma/schema.prisma) (`enum ProspectVertical { COLDCHAIN, WELLNESS, UNKNOWN }`) is the SOT for valid values.

### §18.8 Honest-framing rule

Cold-outreach copy MUST follow voice.md + §4 + §5:

- No fabricated metrics ("98% pickup rate", "8-12% reduction", "X+ shippers"). Pre-revenue means pre-revenue. Use capability claims (regulatory authority, Compass Engine vetting) instead.
- No marketing softeners ("I'd love the opportunity", "see if we can add value", "would you be open to a brief call", "I'd be happy to").
- No em-dashes in body copy (commas, colons, sentence breaks instead). Em-dashes acceptable only in list-separator context.
- No "we track" / "we serve" / "we deliver to X retailers" implied-portfolio language unless the portfolio actually exists. Use industry-knowledge framing: "In refrigerated CPG, the operational signal that matters is..."
- Compass Engine is a **33-point carrier vetting system** (re-derive this number before quoting it — `backend/__tests__/unit/services/compassCheckCount.test.ts` holds every surface to the code). Never describe as "AI-powered market intelligence" (per voice.md line 25 prohibition).
- Authority line on every cold-outreach intro: `Michigan-licensed property broker (MC# 1794414, DOT# 4526880, BMC-84 bonded $75K, $100K contingent cargo through Hancock & Associates)`.
- Sender identity: `Wasi Haider` / `whaider@silkroutelogistics.ai` (never `Wasih`). Single source of truth: `CEO_NAME` + `CEO_EMAIL` exports in [`backend/src/email/builder.ts`](backend/src/email/builder.ts) — startup log line surfaces a regression in production logs immediately.
- Specific operational ask at close: "send a recent BOL on a tricky lane and I'll come back with a quote and the carrier's full Compass profile" — never "would you be open to a brief call this week?"

### §18.9 — Outreach copy AI-tell audit (mandatory pre-send)

Every SRL outreach email — Lead Hunter generated, manually drafted, or templated — must pass an AI-tell audit before send. The audit applies to body, subject line, and signature. The character "—" (em dash, U+2014) must not appear anywhere in any sent email. Banned constructions:

  1. Em dashes in body, subject, or signature. Replace with periods, commas, colons, or restructure.
  2. "That's where..." / "That's the..." / "That's what..." sentence openers. Use the actual subject of the sentence.
  3. Parenthetical asides used as voice texture. Allowed only when genuinely necessary for clarity.
  4. Symmetric two-clause balanced sentences ("X is Y, and Y is X"-style construction).
  5. Consultant-speak imports: "step-change", "in under a year", "planning-vs-actuals", "leverage", "synergy", "best-in-class", "world-class", "north star", "unlock value", "comprehensive solution", "AI-powered" (when describing capabilities, not products).
  6. Marketing softeners: "I'd love the opportunity", "see if we can add value", "would you be open to a brief call", "I would appreciate the opportunity to connect".
  7. Repeated close patterns within a single batch. No two outreach emails sent within the same week may use the same closing operational ask. Acceptable closes: "Send a recent BOL on [lane] and I'll quote against your incumbent" / "If your next outbound RFQ has a slot open" / "What does your current carrier review cycle look like?" / Other operational asks specific to the recipient's situation.

Adjective/noun lists are NOT banned when they are factual proper-noun enumerations (real product categories, real retailer names from the recipient's actual distribution). The prohibition is on adjective-stacking as a "showing range" device, not on naming actual entities.

Hook structure rule (per voice.md, restated here for outreach scope):
  - Opening sentence: a company-specific operational signal that proves recipient research. Not credentials.
  - Authority line (MC#, BMC-84, contingent cargo): one line above signature. Not paragraph one.
  - Length: 4-5 short paragraphs. Tight beats long.
  - Compass Engine described correctly (33-point carrier vetting — see §18.8 on re-deriving the count), never "AI-powered market intelligence".

Implementation guidance for Lead Hunter system prompts (touch1ColdChainTemplate, touch1WellnessTemplate, fallback): the system prompt must explicitly enumerate the banned constructions in §18.9 above and instruct the model to self-check before output. The audit is also applied at the test/preview stage — Little Spoon and MERIT preview render must pass §18.9 audit, not just §18.8 honest-framing.

For manual outreach (founder-drafted in Gmail, not Lead Hunter generated): same audit applies. Run it mentally before send. The discipline is the writer's, not the platform's.

---

## §19 METHODOLOGY LOG

Patterns surfaced cumulatively during sprints. **Consult during Phase A audit before any code change.** Updated each session as new patterns emerge. Quarterly review prunes calcified patterns and promotes hot ones.

Each entry: name, sprint of origin (commit hash), trigger conditions, what to do, an example sprint where it caught something.

### Active patterns (as of Sprint 44.5, 2026-05-09)

#### 1. Audit-first methodology (Sprint 1+, ongoing)
- **Trigger:** any code change request.
- **Action:** Phase A audit (read-only) on render path + handlers + cache invalidation BEFORE Phase B implementation.
- **Caught in:** every session. Memory #11 fired 16x in the Sprint 22-37 session alone — assumed knowledge of code paths is wrong; verify before assuming.

#### 2. Path β methodology (Sprint 32, v3.8.aak)
- **Trigger:** opaque API failure with silent or generic error.
- **Action:** 3-sprint cadence:
  - Sprint N: ship error UI (observability layer)
  - Sprint N+1: widen extractor (diagnostics layer)
  - Sprint N+2: targeted root-cause fix
  - Each sprint atomic per §3.3.
- **Caught in:** Sprints 32-35 RC modal revival cycle. Sprint 32 added error UI; Sprint 33 widened extractor to surface "formData.X" details; Sprint 34 fixed `quickPayFeePercent` string-vs-number; Sprint 35 fixed `fuelSurchargeType` enum drift.

#### 3. Phase A0 contract audit (Sprint 36, v3.8.aao)
- **Trigger:** fix touches a feature whose end-to-end behavior crosses multiple surfaces and code paths.
- **Action:** contract audit before surface audit. Inventory: endpoints, state machine, data model relations, frontend consumption sites, cache invalidation contracts, notification fire matrix, edge cases.
- **Output:** determines atomic-commit shape (single-surface vs bundled cross-surface vs multi-sprint sequence).
- **Caught in:** Sprint 36 tender acceptance — surfaced 7 gaps before any single-surface fix shipped. Cluster of 6 (Items 51-56) shipped across Sprints 38+39 as a deliberate sequence rather than firefighting one symptom at a time.

#### 4. Phase A2 picker-FK contract audit (Sprint 36b, v3.8.aap)
- **Trigger:** UI picker returns an ID that's used as a backend FK.
- **Action:** audit must include — which backend FK that ID resolves against, what state filters apply at that backend, what ID type the picker source returns, what eligibility predicate downstream consumers enforce. Picker-as-metadata vs picker-as-FK distinction determines audit depth.
- **Caught in:** Sprint 36b — Tender modal picker had wrong ID semantics (sent `User.id` while backend FK expected `CarrierProfile.id`) AND a permissive carrier list (`/api/carrier/all` returned all approved + non-approved).

#### 5. E2E lifecycle gate + local-first discipline (Sprint 37, v3.8.aaq)
- **Trigger:** per-sprint audit-first methodology hits a ceiling (Memory #11 firing repeatedly across consecutive sessions).
- **Action:** ship a single E2E lifecycle test that retires the regression-class structurally. Each subsequent sprint validated by green CI before deploy. **Local-first discipline: run E2E locally (~30s) before push (~5min via CI).**
- **Caught in:** Sprint 38 seed `mcNumber` false-positive surfaced in <30s locally — would have shipped silently without the smoke. Sprint 39 B6.5a smoke locked Item 54 on-behalf flow before push.

#### 6. Cross-sprint precedent audit (Sprint 39, v3.8.aas)
- **Trigger:** sprint introduces or modifies behavior on a code path that prior sprints have already touched.
- **Action:** Phase A audit must explicitly check the prior sprints' wiring on the same path. Inconsistency between adjacent sprints (e.g., Sprint N fires X, Sprint N+1 doesn't fire X on same path) is silent drift unless surfaced explicitly.
- **Caught in:** Sprint 39 — Sprint 38 fired tracking-link fan-out at BOOKED on direct path; Sprint 39's on-behalf endpoint default would NOT have fired it, codifying drift. Resolved via α decision (on-behalf matches Sprint 38 normal direct, fires fan-out at BOOKED). Pattern fired again Sprint 40 (role gate ADMIN vs ADMIN+CEO discrepancy). Two-fire validation, not premature capture.

##### Pattern 6 sub-rules (canonicalized Sprint 44.5)

Pattern 6 has three named sub-rules established through prospective validation:

###### Sub-rule a — Stability green-light (Sprint 43)
- **When all canonical references show no drift since last audit, Pattern 6 contributes a fast green-light gate** rather than detailed per-canonical investigation. Time-bounded check (~30s) vs exhaustive trace.
- **Validated:** Sprint 43 Phase A (5 canonicals stable since Sprint 42 — `SlideDrawer` popstate, `ProspectDrawer` trigger-dep variant, Sprint 36b eligibility filter, whaider/Haider seed fixtures, `/auth/e2e-token` Sprint 37 endpoint).
- **How to apply:** in Phase A, list canonical references the sprint depends on. If a 30-second grep confirms each is unchanged since the last audit, log "Pattern 6 stability green-light" and move to next phase. Save the deep investigation for sprints where a canonical actually moved.

###### Sub-rule b — Spatial sub-mode (Sprint 44a)
- **Pattern 6 fires not just temporally** (cross-sprint, same code path) **but spatially** (cross-document, same point in time). When canonical reference docs disagree at a single moment, the contradiction itself is a lead.
- **Validated:** Sprint 44a Track 1 — `render.yaml` + CLAUDE.md §2.2 vs `.github/workflows/ci.yml:112-116` comment held simultaneous contradictory claims about canonical schema mutation path (`migrate deploy` vs `db push`). Only one could be true; resolving which became the central tiebreaker for Sprint 44b's branch selection (X/Y/Z).
- **How to apply:** when reviewing canonical docs, look for *current-state* contradictions across files in the same domain — not just temporal drift. Two docs that say different things at the same time are evidence that one is wrong; the wrongness is itself the audit finding.

###### Sub-rule c — Audits can be wrong / authoritative-source verification (Sprint 44b — three-fire canonical)
- **Trigger:** an audit finding will inform a prod-touching action.
- **Action:** verify the audit's broader implication against an authoritative source (direct DB query, runtime-codepath grep, CLI flag `--help`, etc.) before the action ships. The audit's narrow finding may be correct in isolation but stale or incomplete in its broader inference.
- **Validated three-fold in single Sprint 44b session** — definitive canonicalization, not premature capture:
  1. **Phase 1 (Sprint 44a Track 1)** — `ProspectVertical` grep against `backend/prisma/migrations/` correctly returned empty. The narrow finding was right. The broader inference *"this is the only drift"* was wrong. Direct `pg_type` + `information_schema` query (CSV of 87 prod enums) revealed actual scope: 81 of 87 enums drifted via `db push`. Authoritative source = the database itself.
  2. **Phase 3 (Item 72)** — Sprint 44b directive's draft buildCommand surface-looked complete; the audit said "this is the canonical." Pre-commit grep on `backend/src/` for `__dirname.*config|src/config/` surfaced runtime read at `email/builder.ts:18` loading `config/signatures/whaider.html` — load-bearing for production email signatures. Authoritative source = the runtime codepath, not the directive's surface.
  3. **Phase 4 (Item 73, hotfix)** — Sprint 44b directive's `--exit-code` flag specification surface-looked complete; flag was inherited from a Prisma 5-era convention. Render production deploy failed with `unknown or unexpected option: --exit-code`. `npx prisma migrate status --help` confirmed v6.19 exposes only `--help / --config / --schema`. Authoritative source = the CLI tool's own help output.
- **Pattern lineage:** audit findings inform prod-touching actions; the action's success requires authoritative-source verification of the broader implication, not just the audit's narrow finding.

###### Sub-rule c named sub-patterns (post-Sprint-44.5 expansion, canonicalized §19 meta-50)

Sub-rule c, originally canonicalized at Sprint 44.5 through three-fire validation lineage (Phase 1 + Phase 3 + Phase 4 across the Sprint 44a/b cluster), has accumulated **9 named sub-patterns across Sprint 45a → Sprint 50 with 17 cumulative prospective fires**. The sub-patterns extend sub-rule c's authoritative-source-verification principle into specific operational contexts: build chain failure modes, file-producing build operations, deferred risk protocols, skill-canonical vs industry-practice reconciliation, hybrid data flow verification, concurrent-sprint coordination, grep audit completeness, conditional render visual gates, and renderer-only sprint pre-push smoke. Together with the root sub-rule c principle they form **10 methodology principles** at maturity.

Naming convention: sub-patterns enumerate 1 → 9 below in chronological origin order. The root authoritative-source-verification principle is the parent canonical (already documented above as sub-rule c definition); the 9 named sub-patterns are derivative specializations.

##### Sub-pattern 1 — Fail-fast-build-chain
- **Origin:** Item 96, Sprint 46 (commit `f695eac`, v3.8.abe)
- **Trigger:** prod deploy chain or CI build chain swallows failures via `|| true`, `--ignore-errors`, or analogous suppressors.
- **Mechanic:** silent-success is worse than loud-failure on prod deploy chains. (a) silent-success normalizes ignoring build log noise; (b) failure modes propagate to runtime where they're harder to diagnose; (c) eventually shipping a "live" service that's missing assets damages user trust. Architectural fix: convert chain from fail-silent to fail-fast — tsc error → npm run build exits non-zero → cp steps don't run → deploy halts with visible failure.
- **Case study:** pre-Sprint-46 backend chain was `npm install (NODE_ENV=production skips devDeps) → (npx tsc || true) (mask errors) → cp steps (succeed unconditionally) → deploy succeeds with broken artifacts`. Sprint 44b email signature template + Sprint 45-RC compass mark placeholder both shipped under fail-silent regime; runtime fallbacks fired without anyone seeing the build-time failure.
- **Prevention value:** catches all future "missing asset at runtime" regressions at build time rather than post-deploy.

##### Sub-pattern 2 — Runtime-path-verification
- **Origin:** Item 99, Sprint 47 (commit `db077d4`, v3.8.abf)
- **Trigger:** sprint touches a file-producing build operation (`cp`, `mv`, `tar`, `cp -r`, asset bundler output path).
- **Mechanic:** for file-producing build operations, "command exited 0" is necessary but NOT sufficient verification — must also verify file landed at expected runtime path. Sub-rule c gate extends: command-success verification + file-path verification.
- **Case study:** Sprint 44b shipped `cp -r src/config dist/backend/src/config` thinking it would copy contents; POSIX `cp -r SRC DEST` when DEST exists nests SRC as CHILD → produced `dist/backend/src/config/config/signatures/whaider.html` (nested), not the expected flat path. Runtime `email/builder.ts:18` got "file not found" warning on every cold start for 6+ days until Sprint 47 surfaced the class via Sprint 45-RC compass placeholder.
- **Prevention value:** catches build-chain silent-write-to-wrong-path class regressions; complements Sub-pattern 1's command-exit-code gate.

##### Sub-pattern 3 — Deferred-but-not-missed
- **Origin:** Item 105, Sprint 47.b (commit `d0c9155`, v3.8.abg)
- **Trigger:** sprint identifies downstream risk it can't empirically validate at commit time (e.g., visual rendering needing production-equivalent deployment, environmental behavior needing live infrastructure).
- **Mechanic:** document the risk + activation criteria + planned hotfix path in the commit message itself. Future sprint has a clear handoff if the risk materializes. The protocol works as designed when (a) Sprint N flags the risk explicitly, (b) Sprint N+1 activates immediately when verification surfaces it.
- **Case study:** Sprint 47 commit message documented the deferred ligature substitution risk verbatim ("if RC PDF renders italic Playfair with ligature artifacts post-Sprint-47, same monkey-patch approach migrates into srl-chrome.ts as a separate hotfix; deferred unless surfaces visually"). When Wasi's visual verification of PDF #4 surfaced the bug as Sprint 47 had predicted, Sprint 47.b activated within a single day per the documented plan.
- **Prevention value:** distinguishes "incomplete sprint that should have shipped fix in-arc" from "sprint that correctly identified risk it couldn't empirically validate." Avoids retrospective blame on properly-deferred work.

##### Sub-pattern 4 — Skill-vs-industry-practice reconciliation
- **Origin:** Item 115, Sprint 48 (commit `22b61a7`, v3.8.abh)
- **Trigger:** skill canonical reference (e.g., `srl-brand-design/scripts/srl_chrome.ts`) contracts diverge from industry practice (e.g., CHR/Coyote/RXO RC body conventions).
- **Mechanic:** skill canonical is authoritative for SKILL CONTRACTS (function signatures, token names, render primitives) but NOT necessarily for industry practice. When the two conflict, reconcile explicitly — don't blindly defer to skill nor abandon skill for industry. Document the reconciliation decision and which case study it covers.
- **Case study:** Sprint 45-RC removed the CARRIER body section from RC PDF per too-purist skill canonical interpretation (`SKILL.md` had no body-section recipe). Industry standard (CHR / Coyote / RXO / Landstar) all surface carrier identity in a body section above signature. Sprint 48 reconciled by restoring CARRIER · ASSIGNED body section with inline rendering, keeping skill chrome library mirror clean.
- **Prevention value:** prevents single-source-of-truth over-application; surfaces that one canonical (skill) doesn't subsume another (industry).

##### Sub-pattern 5 — Audit-both-ends-of-data-flow
- **Origin:** Item 116, Sprint 48.b (commit `10a9999`, v3.8.abi)
- **Trigger:** verifying hybrid data precedence (formData primary, DB fallback, multi-tier fallback chains).
- **Mechanic:** verify BOTH the write side (frontend key names match validator) AND the read side (renderer reads those key names). Audit-first must reach both ends of the data flow; verifying only one end produces structurally-correct surface with silently-broken persistence path.
- **Case study:** Sprint 48 shipped the CARRIER · ASSIGNED body section structurally correct but rendered em-dashes for every field despite AE selecting a carrier. Root cause: 3-key mismatch — RC modal FormState wrote `carrierCompany / carrierMC / carrierDOT`, Zod validator declared `carrierName / carrierMcNumber / carrierDotNumber`. Default `z.object().strip()` silently dropped unknown keys → payload validated empty → renderer fell to em-dash. Sprint 48 Phase A audit verified renderer hybrid precedence (formData primary, Load fallback) but did NOT verify which key names RC modal actually wrote. Half-complete audit.
- **Prevention value:** catches Zod-strip class regressions where validator + frontend FormState drift; complementary to Sub-pattern 7 (grep-regex-completeness) which catches schema name variants.
- **FIRE #2 — the other end of the same pipe (2026-08-19, v3.8.asr, P0).** Sprint 48.b caught *frontend-writes vs validator*. This fire is *validator vs handler-reads*, same `z.object().strip()` mechanic, and it was worse because it broke a transition outright rather than rendering an em-dash. v3.8.aso added a 422 gate requiring `tonuFaultSide` on a TONU flip and read it off `req.body`. `validateBody` replaces `req.body` with the Zod result (`middleware/validate.ts:21`) and `updateLoadStatusSchema` declared only `status`, so the field was **always undefined** and the gate rejected EVERY TONU — including ones sending a valid fault side. **TONU became impossible to record, and it shipped.** The same stripping had been silently eating `reason`/`cancellationReason` for far longer, so every voided CarrierPay note read "no reason provided" whatever the AE typed.
- **Why the tests did not catch it:** unit tests covered `resolveTonuBilling` (the policy) and `recordTonuObligation` (the writer). Both were green and both were correct. Nothing covered the **wire between them**, and that is exactly where the field vanished. A green unit suite over both ends says nothing about the middle.
- **Trigger, extended:** any handler that reads a field off `req.body` which its `validateBody` schema does not declare. Not just frontend↔validator drift — **validator↔handler drift is the same bug wearing different clothes**, and it is quieter because there is no type error and no runtime error. The value simply is not there.
- **Going-forward check, cheap:** when adding or changing a field the handler reads, grep the route's schema for that field name before writing the handler logic. When adding a gate that rejects on a missing field, write one test that parses a body *containing* it — the test that would have caught this is four lines long.
- **Guard shipped:** [`backend/__tests__/unit/validators/updateLoadStatusSchema.test.ts`](backend/__tests__/unit/validators/updateLoadStatusSchema.test.ts) pins that the schema carries every field the handler reads, in both directions.
- **Filing note:** recorded here rather than as a new lens in §20.3. That list is scoped by §20.1 to public marketing pages and explicitly excludes internal/backend surfaces, so a Zod-stripping lens belongs to the §19 methodology library — and Sub-pattern 5 already *is* this lens. A second entry would have split one pattern across two homes, which is the cross-canonical misfiling already banked in the sub-rule c candidate list.
- **FIRE #3 — the contract crossed the network, and only one side was told (2026-08-31, v3.8.awq, P0).** The first two fires were both inside one process: frontend-writes vs validator, then validator vs handler-reads. This one is the same shape across the CORS boundary, and it was invisible in a way neither of those was. Arc 11 added `x-step-up-token` on the CLIENT — `useStepUp` replays the original write with it once a code is accepted — and `Access-Control-Allow-Headers` was never updated. The browser refused the preflight and **blocked every step-up-gated write before it was sent**: the Quick Pay election and `PATCH /carrier-compliance/insurance`, neither of which had ever worked from a browser since the gate shipped. Measured on production: `Access-Control-Request-Headers: content-type,x-step-up-token` answered `Content-Type,Authorization,X-Requested-With`.
- **Why no signal existed at all.** The request never reached the server, so there was no log line, no error rate, no failed request to count — the *absence* of a request is not something any backend instrument can observe. It surfaced only because a carrier sent a screenshot. Both of this session's production defects were found that way, and neither moved a monitor.
- **And the message named the wrong subsystem, which is what made it expensive.** `submitCode` wrapped the verify call and the replay in ONE try. A blocked preflight throws with no response, so `e.response.data.error` was undefined and the hook fell through to *"We could not confirm that code"* — telling a carrier entering a correct code that the code was wrong, on the one screen where all they can do is re-read it. **A diagnostic that points away from the defect converts a one-line fix into a production incident.** Split into two catches: past the verify call the server has accepted the code, and nothing failing afterwards may blame it.
- **What identified it before any code was read.** The step-up endpoint returns *"That code did not match…"* and `requireStepUp` returns *"Enter the code from your authenticator app…"* — both with an `error` field. The carrier saw NEITHER, only the frontend's generic fallback. That could only mean the verify succeeded and something after it failed with no response body, which points at the network layer rather than the auth layer.
- **Trigger, extended again:** any contract whose two ends live in different deployables — a custom request header and its CORS allow-list, a cookie name and its `sameSite`/domain, a field name and its serializer. The in-process fires at least fail loudly at the boundary; this class fails in the *browser*, before either side runs.
- **Guard shipped:** [`backend/__tests__/unit/middleware/corsAllowedHeaders.test.ts`](backend/__tests__/unit/middleware/corsAllowedHeaders.test.ts) walks `frontend/src` for every custom `x-*` request header and asserts each is in `ALLOWED_REQUEST_HEADERS`, deriving the requirement from source rather than a second list that would drift the same way. It also pins that BOTH CORS surfaces build from one constant — the explicit `app.options("*")` handler runs first and is what a browser reads, `cors(corsOptions)` covers the real request, and they had been separate literals agreeing only because nobody had added a header since. Paired with [`frontend/src/hooks/useStepUp.test.ts`](frontend/src/hooks/useStepUp.test.ts) for the diagnostic half. Injection-verified in both directions.

##### Sub-pattern 6 — Concurrent-sprint-coordination
- **Origin:** Item 136, Sprint 49 (commit `0f6f135`, v3.8.abk)
- **Trigger:** prior sprint shipped mid-planning of next sprint (multi-day session arcs where the planning baseline diverges from the deployed state).
- **Mechanic:** re-verify scope against latest production state before Phase B lock — not just static planning baseline. Sub-rule c extension: scope verification against latest production state, not just static planning baseline.
- **Case study:** Sprint 48.c shipped mid-Sprint-49-planning, consuming v3.8.abj. Sprint 49 directive specified `v3.8.abj → v3.8.abk` (incorrect — abj was already consumed). Phase B0 verification caught the version letter drift before commit (corrected to abk → abl post-Sprint-49.b). Also verified MC#/DOT# bug status (still unresolved post-48.c) and signature pre-fill state (live).
- **Prevention value:** catches version-letter drift, status-still-open errors, and dependency-already-shipped misalignments in directives authored before the latest production state.

##### Sub-pattern 7 — Grep-regex-completeness-gate
- **Origin:** Sprint 49 Phase B0 (commit `0f6f135`, v3.8.abk) — methodology pattern banked inline; no §13.3 backlog item per Path α canonical promotion.
- **Trigger:** verifying schema state, code state, or any structural inventory via grep.
- **Mechanic:** search multiple naming variants of the same conceptual field (e.g., `Window` vs `Time` vs `Range` vs `Slot`; `Number` vs `Num` vs `Id` vs `Reference`). When a single regex returns an empty result set, do NOT conclude "field doesn't exist" — try variants before locking the conclusion.
- **Case study:** Sprint 49 Phase A A2 grep on `pickupWindow|deliveryWindow|pickupStart|deliveryStart` returned no matches → audit concluded schema had only date fields + appointmentRequired boolean, no time-window support. Phase B0 audit re-grepped with `pickupTimeStart|pickupTimeEnd|deliveryTimeStart|deliveryTimeEnd` and surfaced the fields at schema lines 1052-1056. Schema DOES support time windows; the grep regex was incomplete on field naming variants.
- **Prevention value:** prevents "field doesn't exist" false negatives that cascade into unnecessary schema migration scoping or incorrect deferral logic.

##### Sub-pattern 8 — Conditional-render-visual-verification
- **Origin:** Item 139, Sprint 49.b (commit `723b244`, v3.8.abl)
- **Trigger:** sprint adds conditional render paths (`if (data) { render with data } else { render empty }`) where the conditional branch wasn't visually verified with populated data before commit.
- **Mechanic:** when adding a conditional render path, visual verification with the actual conditional case populated is required. Code-side review can confirm syntax + types but cannot confirm visual layout (overlap, alignment, line wrap, page break interaction). The math may look plausible until rendered output proves otherwise.
- **Case study:** Sprint 48.c placed pre-filled signature value at `fieldY+4` while label sits at `fieldY`; 6.5pt label extends ~6.5pt down and 8.5pt value starting at +4 produced ~2.5pt visible overlap on every pre-filled row. Pattern only became visible when actual carrier data arrived through Sprint 48.b → Sprint 49 flow. Sprint 49.b ratified 22→26pt row spacing + value Y +4→+10 + underline Y +14→+20 + block height 180→210pt.
- **Prevention value:** catches visual-layout class regressions invisible to type-system and code review; pairs with Sub-pattern 9 (text-extraction-pre-push-smoke) for pre-deploy assertion coverage.
- **Refinement:** see Sub-pattern 8.a (Layout-constraint-verification) in meta-51 expansion — addresses the case where new conditional content fits the rendered element but overflows the layout slot allocated to it.

##### Sub-pattern 9 — Text-extraction-pre-push-smoke
- **Origin:** Sprint 50 Phase B1 (commit `70cf791`, v3.8.abm) — methodology pattern banked inline; no §13.3 backlog item per Path α canonical promotion.
- **Trigger:** renderer-only sprint where visual layout can't be eyeballed in-environment (CLI-driven, headless, agent-mediated).
- **Mechanic:** generate sample output (PDF, image, HTML) and run text-extraction assertions on content + key phrases + page count before push. Visual layout verification still requires human eyes post-deploy, but content + structural assertions catch the cheap class (missing clauses, regex mismatches, page overflow) at commit time.
- **Case study:** Sprint 50 added a 10-clause T&C body to the RC PDF page 2. Pre-push pdf-parse smoke verified all 10 clauses present, key phrases ("fullest extent permitted by law", "30 minutes before beginning", "24-48 hours", `operations@`, `accounting@`, `· notify` suffix), and 2-page total preserved. 25/27 assertions passed; 2 false negatives confirmed via inspection script were pdf-parse line-wrap artifacts (`"freight \ncharges"`, `"hours of \ndelivery"`) — content intact, smoke pattern flagged for whitespace tolerance in future iterations.
- **Prevention value:** catches missing-content, key-phrase-typo, and page-count-overflow regressions at commit time for renderer-only sprints; cheaper than full E2E lifecycle smoke; complementary to Sub-pattern 8's visual-layout gate.

###### Cumulative fire registry (Sprint 44a → Sprint 50)

| Sprint | Fires | Origin item | Mechanic |
|---|---|---|---|
| 44a (pre-canonical) | 1 | Item 8.10 (Phase 1) | ProspectVertical narrow grep → 81-of-87 enums via `pg_type` query |
| 44b Phase 3 | 1 | Item 72 | `cp src/config` runtime grep on `__dirname` reads |
| 44b Phase 4 | 1 | Item 73 | `--exit-code` flag absent in Prisma 6.x via CLI `--help` |
| 44c | 1 | Item 74 | URL plural/singular 9-hit grep across 4 files |
| 44d | 1 | Item 78 | `expiresAt` missing from frontend mutation vs validator |
| 45a | 2 | Items 80 + 90 | Q3 carrier email 3-precedent verification + `tender.declineReason` field absence |
| 45-RC (combined arc) | 2 | Item 48 close | Phase A2 pixel verification rate breakdown page 4 + Phase B sub-phase 3 directive package.json claim |
| 46 | 2 | Items 71 + 95 | Audit + Phase B0 NODE_ENV root cause empirical reproduction |
| 47 | 1 | Item 99 | `cp -r` POSIX nesting empirical verification |
| 47.b | 1 | Item 105 activation | Ligature surface post-deploy (Sub-pattern 3 protocol firing) |
| 48 | 1 | Item 115 | Skill-vs-industry-practice CARRIER body section reconciliation |
| 48.b | 1 | Item 116 | Frontend formData key alignment (audit-both-ends fire) |
| 49 | 1 | Item 136 + grep-regex sub-pattern | Phase B0 schema grep incomplete on `Window` vs `Time` field naming |
| 49.b | 1 | Item 139 | Signature block conditional render visual verification |
| 50 | 1 | Sub-pattern 9 promotion | Pre-push text-extraction pdf-parse smoke |

**Total: 17 prospective fires.** Footnote: Sprint 45 arc partitioned conservatively — Sprint 45a counted as 2 fires (sub-rule c gates on Q3 carrier email + `declineReason` schema check), Sprint 45-RC-PRE rolled into the Sprint 45-RC arc (single combined entry), Sprint 45-RC counted as 2 fires (Phase A2 pixel verification + Phase B sub-phase 3 directive correction). Strict per-commit count would total 19; canonical count 17 per Sprint 50 closure documentation reflects the partitioning choice.

###### Sub-rule c second canonical expansion (post-Sprint-51.f, canonicalized §19 meta-51)

Sprint 47 → Sprint 51.f shipped an extended RC PDF + RC modal arc — 17 atomic commits across 9 hotfix iterations, all closing methodology gaps with zero rollbacks. The arc surfaced 5 new sub-patterns + 1 refinement to sub-pattern 8 + the methodology library's first ratification-layer sub-pattern. Sub-rule c surface now spans **14 canonical sub-patterns + 8.a refinement across 2 methodology layers** (execution + ratification), with **25 cumulative prospective fires**. Three methodologically distinct contributions: (a) introduction of the ratification layer (sub-pattern 13), (b) three-fire validation lineage parallel to sub-rule c root's Sprint 44.5 canonical promotion, (c) decision-tree reference table for sprint Phase A quick-lookup.

###### Sub-pattern methodology layers (meta-51 introduces)

Sub-patterns 1-9 + 8.a + 10, 11, 12, 14 operate at the **EXECUTION LAYER** — gates applied by Claude Code during Phase B execution after Phase A audit findings are surfaced. These sub-patterns catch errors at code write time, build time, or pre-push time.

Sub-pattern 13 (literal-vs-intent ratification) is the first methodology principle operating at the **RATIFICATION LAYER** — gates applied chat-side before a Phase B directive ships. The user's Q-ratifications lock Phase B scope; ratification-layer sub-patterns guard the framing of those Q-questions so the locked scope matches the user's actual operational intent (not just one of N technically-valid interpretations).

Layer attribution determines WHEN the sub-pattern fires in the sprint lifecycle:
- **Execution layer:** between Phase A surface and Phase B push
- **Ratification layer:** between Phase A surface and directive draft

Future sub-patterns banked into §19 must explicitly attribute layer so the methodology library's operational scope stays well-defined.

##### Sub-pattern 10 — Hydration-effect-dep-array-audit
- **Origin:** Item 147, Sprint 51.b (commit `6350918`, v3.8.abp)
- **Layer:** Execution
- **Trigger:** useEffect that syncs server→local state with form/edit-state values in the dependency array.
- **Mechanic:** ref-based reads for in-effect access to current state without triggering re-fire. Sub-pattern 10 prescribes: form/edit-state values must NOT be in the dependency array; use `useRef` to capture current value for read-only access inside the effect body. The hydration effect should fire on initial mount or server-state arrival only — not on every user keystroke.
- **Case study:** Sprint 51.b QP Override reason field overwrite bug. The hydration useEffect at `QuickPayOverridePanel.tsx:86-97` had `appliedPct` in its dependency array; user keystrokes in the applied-rate input triggered the effect to re-fire, and the `if (existing) {...}` branch overwrote user's reason/note edits back to the saved override row values. Fix: single-shot `hydrated` flag prevents re-fire after initial sync.
- **Prevention value:** catches the entire class of "user edits disappear on next keystroke" bugs in form components hydrating from server state. Particularly common in TanStack Query consumers where `data` reference is stable but the developer-author's mental model assumes one-shot population.

##### Sub-pattern 11 — CI-parity-verification
- **Origin:** Item 148, CI hotfix (commit `013883d`, v3.8.abq)
- **Layer:** Execution
- **Trigger:** local pre-commit gate is a strict subset of CI gates.
- **Mechanic:** local verification MUST run the same gates CI runs. Frontend changes touching JSX require `npx next build` (which invokes ESLint as part of the build), NOT just `tsc --noEmit` (which only checks types). Backend with eslint/vitest in CI requires equivalent local gates before push.
- **Case study #1 (origin):** Sprint 51 `verify/page.tsx:158` had `doesn't` (ASCII apostrophe) in JSX text. Next.js default ESLint has `react/no-unescaped-entities` set to `error`. Sprint 51 pre-commit ran `tsc --noEmit` clean on both backend + frontend; tsc passed. CI Lint & Build failed at 26 seconds; E2E job skipped. Required CI hotfix commit `013883d` to swap `doesn't` → `does not`.
- **Case study #2 (retrospective, banked 2026-05-24):** Sprint v3.8.ajg added `directUrl = env("DIRECT_URL")` to `backend/prisma/schema.prisma`. Updated Render dashboard env vars + local `backend/.env` + CLAUDE.md §2.2 docs — but missed `.github/workflows/ci.yml` env blocks. Backend CI job failed at `npx prisma validate` (step 4) with `P1012: Environment variable not found: DIRECT_URL` in 24 seconds; E2E job auto-skipped via `needs: [backend, frontend]`. Frontend job unaffected (doesn't touch Prisma). Reproduced locally with `unset DIRECT_URL && DATABASE_URL=... npx prisma validate` → same P1012. Hotfix commit `5504c81` added `DIRECT_URL: postgresql://ci:ci@localhost:5432/ci` to both backend job env block and e2e job env block. CI's plain Postgres container has no pooler, so DIRECT_URL and DATABASE_URL can point at the same connection string. **Banked sub-pattern extension:** when adding any `env()` reference to `schema.prisma`, the env block must be updated in FOUR locations: (1) local `backend/.env`, (2) Render dashboard env vars, (3) CI workflow env blocks for every job that runs Prisma, (4) CLAUDE.md §2.2 canonical env var list. ajg updated 1+2+4, missed 3. The four-location checklist is canonical going forward for schema env() reference additions.
- **Case study #3 (banked 2026-05-27, v3.8.alh):** Sprint v3.8.ald swapped 5 callsites in `authController.ts` from `findUnique` → `findFirst` (lines 126, 169, 258, 374, 584) for case-insensitive email lookup. Pre-commit gate ran `npx tsc --noEmit` clean + `npx next build` clean + declared green. Did NOT run `npm test`. CI's backend job runs `npm test` and failed at 10 cases in `authController.test.ts` with `TypeError: prisma.user.findFirst is not a function` because `__tests__/setup.ts:6-11` defined the `prisma.user` mock without `findFirst`. CI red across ald → alf → alg push window (~24h, 3 commits) because Render's build chain doesn't run vitest — production stayed green, CI stayed red, the divergence went unnoticed until Wasi surfaced the GitHub Actions failure notification on the alg push. v3.8.alh hotfix shape: (a) added `findFirst: vi.fn()` to setup.ts user mock (matches every other model — otpCode/shipment/invoice/loadTender all already carry both); (b) re-pointed 6 test mocks from `findUnique.mockResolvedValue(...)` → `findFirst.mockResolvedValue(...)` to match what the controller now calls. Second wave caught a mock-state-leakage subtletly — vitest's `clearAllMocks` clears call history but NOT `mockResolvedValue`, so a 7th test needed re-pointing to explicit null because the truthy user from the prior test leaked across. **Banked sub-pattern extension #2:** the four-location checklist for `env()` schema references (case study #2) extends to a parallel gate inventory — `npm test` is now part of the canonical pre-commit gate per CLAUDE.md §3.3. Local verification must include vitest for any backend change touching controllers/services/routes the test suite covers. **Banked observation #1 (Render-vs-CI gate divergence):** Render's build chain runs `npm install + tsc + check-direct-url.js + prisma migrate deploy/status + cp -r` — but NOT vitest. A passing Render deploy is NOT evidence of a passing test suite. The two surfaces are independent gates; both must be green. Going-forward implication: when CI fails on a push that Render passed, the failure is NOT necessarily about production breakage — it can be a test/mock/setup gap that production-runtime doesn't exercise. Diagnose before assuming production impact.
- **Case study #4 (banked 2026-09-01, Item 254) — reading the workflow COLOUR is not reading the GATE.** The tender-lifecycle arc pushed **fourteen** commits over a red `E2E - Full Lifecycle Smoke`. Backend, Frontend and Deploy were green on every one, and E2E is deliberately outside the deploy gate (v3.8.asv, after the Item 198 six-hour Playwright hang), so nothing in the workflow's aggregate colour, the deploy's success, or production's health reflected it. **Neither cause was a defect in the code under test.** (a) Commit 10c (v3.8.axq) added an evidence requirement to accept-on-behalf; the E2E predated that contract and sent none, so it got the 400 the contract exists to produce — a test lagging a deliberate contract change. (b) B6.5b asserted *"the override must unblock the carrier"* against a rule **v3.8.axl had retired** when it made expired insurance absolute and Arc 26 stopped blanket overrides short-circuiting — a test asserting policy the platform had intentionally changed (§13.3 Item 244.2's superseded-test shape, and it went red rather than passing vacuously, which is the good outcome). **GOING-FORWARD RULE: the per-commit gate includes reading the E2E job's OWN result BY NAME — `gh run view <id> --json jobs --jq '.jobs[] | "\(.conclusion)\t\(.name)"'` and read the `E2E - Full Lifecycle Smoke` row — never the workflow's aggregate conclusion and never the deploy job's colour.** A workflow whose deploy gate excludes a job is a workflow whose colour structurally cannot report that job: green means "everything that gates passed", which is a different claim from "everything passed". That is §19 Sub-pattern 16's shape — a signal with no discriminating power — applied to gate COMPOSITION rather than to a guard's subject. Item 254 adds pinned-issue automation as the mechanical half; **this rule is the half that does not depend on that automation working.**
- **Prevention value:** catches "passed tsc, failed CI" bugs. Local verify cost: ~30-45s per sprint. CI hotfix cycle cost: ~5 min wall-clock + E2E job re-run. Net wall-clock savings compound across sprints. Three-fire validation lineage now achieved (Sprint 51 JSX escape, v3.8.ajg env() missing in CI, v3.8.ald `findFirst` mock gap) — Sub-pattern 11 was already canonical at origin per Item 148; the three fires demonstrate distinct operational contexts where the mechanic recurs (ESLint, Prisma config, vitest mock). Fire count for next quarterly §19 review: 19 → 20 → 21. **Sub-rule c registry advances:** 32 → 33 with the v3.8.alh fire — every authoritative-source check on the failure shape (CI log → exact failing tests → exact mock definition → exact controller call site) was load-bearing for diagnosing this in <5 min without a blind fix.

##### Sub-pattern 12 — Write-read-dataflow-audit
- **Origin:** Sprint 51.c, commit `88adebb`, v3.8.abr — methodology pattern banked inline; no §13.3 backlog item per Path α canonical promotion.
- **Layer:** Execution
- **Trigger:** component writes via callback prop; receiver may not read what was written; refactor scenarios where dataflow consumers drift from producer changes.
- **Mechanic:** when verifying write/read flows, audit BOTH that the write fires AND that the receiver reads and acts on the written value. Three-layer audit pattern: write fires → state updates → receiver consumes. Not just "does the write succeed" — but "does the consumer's code path actually read what the producer wrote."
- **Case study:** Sprint 33 → 51.c (17-sprint window). QP Override panel wrote `form.quickPayFeePercent` via the `onAppliedRateChange` callback. The financials `useMemo` at `RateConfirmationModal.tsx:578-585` computed `feePercent = feePctForSpeed(speedUiKey, carrierTier)` — IGNORING `form.quickPayFeePercent`. A useEffect at line 588-592 then OVERWROTE `form.quickPayFeePercent` back to the speed-derived default. The Override panel was decorative for 17 sprints — UI looked like AE could override, but Payment Calculation never reflected the override. Sprint 51.c Item 150 fixed by rewriting the useMemo to consume the override, and removing the overwriting useEffect.
- **Prevention value:** catches "silent ignore" bugs where writes succeed but receiver path breaks. Particularly valuable in refactor scenarios where dataflow consumers drift from producer changes — the producer code keeps writing correctly, but the consumer no longer reads.

##### Sub-pattern 8.a — Layout-constraint-verification (refinement of #8)
- **Origin:** Item 152, Sprint 51.d (commit `4f5ed1e`, v3.8.abs)
- **Layer:** Execution (refinement to sub-pattern 8 conditional-render-visual-verification)
- **Trigger:** conditional render CHANGES content of a pre-existing layout element within a fixed-width constraint.
- **Mechanic:** visual verification scope must include BOTH the new conditional rendering AND the pre-existing element's layout integrity with the new content. Sub-pattern 8 verifies that the new element renders correctly; 8.a verifies that the pre-existing layout doesn't break under the new content. The distinction matters when the conditional fills a slot whose original content fit a width budget but the new content doesn't.
- **Case study:** Sprint 51 Item 134 α QP cell value `"Standard Net-30"` (15 chars at FONT_BODY 9pt ≈ 75pt) overflowed the meta strip cell width budget (~67.5pt at CONTENT_W 540pt / 8 cells); collided with the adjacent TERMS cell. Sub-pattern 8 (visual verification) would have shown the new value rendering, but the layout-overflow into the adjacent cell only became visible in side-by-side cell rendering. Sprint 51.d shortened to `"Standard"` (8 chars ≈ 40pt) — fits with 27pt margin.
- **Prevention value:** catches layout-overflow regressions that text-extraction smoke (sub-pattern 9) cannot detect. Text-extraction confirms "the content is present"; layout-constraint verifies "the content fits the slot allocated to it."

##### Sub-pattern 13 — Literal-vs-intent ratification (three-fire validated canonical)
- **Origin:** Sprint 51.c → Sprint 51.e → Sprint 51.f three-fire validated lineage
- **Layer:** **Ratification (NEW LAYER — first methodology principle operating above execution)**

**Three-fire validation lineage:**

1. **Fire 1 — Sprint 51.c Q2 ratification** (commit `88adebb`, v3.8.abr). Phase A Q-question: "should override values persist across SPEED toggles, or auto-sync to new tier default?" Answer ratified: persist. Sprint 51.c shipped literal persistence — override values stayed across speed toggles regardless of context. Result: AE toggling 7-Day (default 3%) with Override=3 to Same-Day (default 5%) kept Override at 3, surfacing as "-2pp delta vs tier default" with reason-required validation. Felt wrong to AE.

2. **Fire 2 — Sprint 51.e Phase A refinement** (commit `38a1d6b`, v3.8.abt). Phase A Q-question: "should the persist behavior distinguish intentional overrides (typed reason or value ≠ old default) from incidental ones (matched old default, no reason)?" Answer ratified: yes, refine to intentional-vs-incidental detection. Sprint 51.e shipped: auto-sync when Override matched OLD tier default AND reason empty; preserve when value differs OR reason set. Closer to user mental model. Still missing.

3. **Fire 3 — Sprint 51.f reality** (commit `f5552b9`, v3.8.abu). User clarified actual workflow: SPEED card IS the primary control; Override is a per-load-per-speed-instance adjustment; speed toggle = context reset. Sprint 51.f shipped always-reset on speed change. Three iterations of Phase A framing each refined one level closer; the third iteration matched the user's operational model.

**Mechanic:**

When ratifying behavior of a UI control whose mental model the ratifier hasn't operated, the ratification MUST be informed by user's actual workflow pattern, NOT just technical behavior options.

*Technical question framing:* "should values persist or auto-sync, with what conditions?"
- Optimizes for state-preservation invariants.
- Generates multiple valid behavioral options.
- Each is internally consistent with its own ratification.
- None necessarily match user intent.

*Workflow question framing:* "what does the user DO when they toggle this control? Is the new state a context reset or a context refinement?"
- Optimizes for user mental model match.
- Anchors ratification in operational workflow.
- Surfaces simpler answers when the user's model is simpler than refinement implied.

Sub-pattern 13 prescribes workflow-first framing in Phase A ratification drafting. Three iterations of technical-first framing (Sprint 51.c, 51.e) walked closer but kept overshooting the simpler workflow answer (Sprint 51.f).

**Prevention value:**

Catches the entire class of "shipped correctly per ratification but doesn't match user intent" bugs. Saves iteration cycles when user's mental model is simpler than technical refinement implied. Three-fire validation parallel to sub-rule c root's Sprint 44.5 canonical promotion lineage — both principles required three independent operational fires to canonicalize because the underlying methodology gap was subtle until repeated empirical surfacing made it canonical.

This is the methodology library's first principle that operates at the ratification layer (chat-side, before directive ships) rather than the execution layer (Claude Code, during Phase B). The layer distinction is methodologically significant — future sub-pattern banking must explicitly attribute which layer the principle operates at.

##### Sub-pattern 14 — Diff-disproves-hypothesis halt
- **Origin:** Sprint 51.f Phase A diagnostic
- **Layer:** Execution
- **Trigger:** regression hypothesis can be disproven by code-side audit (diff analysis, conditional render trace).
- **Mechanic:** when diff analysis or conditional render trace mathematically demonstrates that the hypothesized cause cannot produce the observed behavior, HALT for external evidence (browser state, network logs, scenario confirmation) rather than ship a speculative fix. The hypothesis itself is wrong — speculating at "fixes" wastes cycles and risks introducing real regressions.
- **Case study:** Sprint 51.f original report: "Override panel absent." Claude Code Phase A diff analysis showed Sprint 51.e changes between commit `88adebb` and `38a1d6b` were purely additive — 3 useRef declarations + 1 useEffect with `[tierDefaultPct]` dep. No conditional render gates touched, no JSX restructure, no early-return additions. Diff was mathematically incapable of removing the panel from the DOM. Halted for external evidence; user-side DevTools verification confirmed v3.8.abt was live; the real issue was Sprint 51.e's intent-detection behavior didn't match user's mental model (Sprint 51.f sub-pattern 13 territory), NOT a phantom regression.
- **Prevention value:** prevents phantom-regression fixes that address non-existent bugs. Saves rollback risk + verification cycle when actual root cause is elsewhere (user mental model, environment state, scenario confusion). Especially important after refactor sprints — the temptation to attribute next-sprint user reports to the refactor must be checked against actual diff capability.

##### Sub-pattern 15 — Backlog-row-drift vs §11-history-row (three-fire validated canonical)
- **Origin:** v3.8.akr → v3.8.akq → v3.8.akw three-fire lineage 2026-05-25
- **Layer:** Audit (NEW LAYER — operates above the execution + ratification layers; gates the *information* a sprint relies on for scoping)
- **Trigger:** sprint Phase A audit reads a §13.3 backlog row's "Fix shape" or "Sprint shape" text and treats it as the canonical statement of work.
- **Mechanic:** §13.3 backlog rows can drift out of sync with what §11 history rows + actual code shipped. When a sprint reads "Item N needs X done" from §13.3, the Phase A audit MUST cross-reference against (a) `grep "closes.*Item N\|§13\.3 Item N.*CLOSED"` in §11 history rows, AND (b) live code state at the file:line references the row cites. §13.3 row text is NOT authoritative for closure status; §11 history rows + actual code are. Banking-row maintenance has lagged behind code shipping for some items across 2026-05-08 through 2026-05-25.

**Three-fire validation lineage:**

1. **Fire 1 — v3.8.akr (Item 8.5 close, 2026-05-25 morning).** Initial CLAUDE.md grep for `AddressBook|addressBook|address-book` returned 13 files. Audit-first discipline required classifying each match (route-self / schema-self / version-history comments / archived-wiki docs) before inferring "13 references means active." Authoritative source = full classification of every match, not raw match count. Banked inline at Item 8.5 close as case-study extension to Sub-rule c — *"match-count is not consumer-count"*.

2. **Fire 2 — Item 191 backlog-row correction (2026-05-25 mid-morning).** §13.3 Item 191 row text claimed *"Priority: ELEVATED"* + *"every future schema migration is at risk until this lands"* — appeared OPEN. Cross-reference against §11 history surfaced *"(closes §13.3 Item 191)"* in the v3.8.ajg row (2026-05-24). Fix had shipped 24 hours prior; §13.3 row was never marked closed. Wasi caught the staleness when I included Item 191 as top-priority in a backlog summary. Banked at the docs-only correction commit as *"backlog-row-drift vs §11-history-row"* with the going-forward gate *"when summarizing §13.3 OPEN items, the §13.3 row text alone is NOT authoritative for closure status. §11 history rows are the source of truth."*

3. **Fire 3 — v3.8.akw (Items 51 + 52 + 53 audit, 2026-05-25 afternoon).** §13.3 Items 52 + 53 row text claimed *"wants the call wired"* (52) and *"uses Promise.all (NOT atomic)"* (53). Sub-agent Phase A audit + verbatim code reads against `tenderController.ts` + `waterfallEngineService.ts` + `loadBids.ts` confirmed Sprint 38 (v3.8.acd, 2026-05-13) already wrapped acceptTender in `prisma.$transaction` and wired `sendTrackingLinkToCrmContacts` to all five accept surfaces. §13.3 rows were ~12 days stale. Only the waterfall path's `notifyTenderAction("ACCEPTED")` was a genuine gap (closed in v3.8.akw). Two of three "bundled cleanup" items were docs-only closures retroactive to Sprint 38/39.

**Three independent fires within ~24h across three sprints validates canonical promotion per §19 sub-rule c three-fire convention.** Fire counts now: this sub-pattern is the **15th canonical methodology sub-pattern** in the §19 library and the **first audit-layer sub-pattern** (above the execution + ratification layers).

**Audit-layer distinction:** Sub-patterns 1-12 + 14 + 8.a operate at the **execution layer** (Claude Code during Phase B). Sub-pattern 13 operates at the **ratification layer** (chat-side, between Phase A surface and directive draft). Sub-pattern 15 operates at the **audit layer** — gates the *information* the Phase A audit relies on, before the audit findings even inform a directive. The three layers stack: audit → ratification → execution. A miss at the audit layer corrupts the ratification and execution layers downstream.

**Going-forward gate canonical text:** *"Sprint Phase A audits that consult §13.3 backlog row text MUST cross-reference each item against §11 history rows (grep for `closes.*Item N` or `§13\.3 Item N.*CLOSED`) AND verbatim against the file:line references in the row's text, BEFORE relying on the row's 'Fix shape' or 'Sprint shape' framing. §13.3 rows are signals, not authoritative state. The going-forward maintenance discipline: when shipping a closure, update both the §11 history row AND the §13.3 backlog row in the same commit."*


**FOURTH FIRE — a "NOT built" list, and I walked into it in the same session I cited the pattern (2026-08-31, v3.8.awr).**

The three canonical fires were all §13.3 backlog rows. This one is §21.1's
**"Ratified-pending — NOT built"** list, and the shape is worse, because of what
that kind of list is *for*.

v3.8.asb built `POST /api/carrier-auth/quickpay-pilot-request` — APPROVED-only,
idempotent, re-requestable from DECLINED or WITHDRAWN, notifying the desk — and
wired it to the carrier portal. It applied the pilot migration in the same arc.
Nobody returned to the list. For two weeks §21.1 read:

> *"There is no carrier-side request endpoint... Until
> `POST /carrier-auth/quickpay-request` lands, the portal routes those carriers
> to operations@."*

I read that as current, **quoted it to Wasi twice as a live gap**, offered to
build it, and was told to close it. The audit that should have preceded the
build found the endpoint already there, already called from
`activation/page.tsx`. One more step and I would have shipped a second endpoint
for a working feature.

Two of the three claims in that list were stale; the third — *approval alone does
not enable Quick Pay* — was verified and is still true. **Correcting a stale list
by deleting it is the opposite failure**, so the guard pins the surviving claim
as well as the retired ones.

> **A "NOT built" list is the most dangerous documentation to leave unmaintained,
> because it is read precisely when someone is deciding whether to build
> something. A stale entry there does not merely misinform — it commissions
> duplicate work.**

**Widened trigger.** Sub-pattern 15 was scoped to §13.3 rows. It covers **any
prose claim about what the code does or does not contain** — §21 ratified-pending
lists, §16 blockers, §14 ledger entries, README capability lists. All are read as
current and none is verified by anything.

**Guard shipped:**
[`quickPayPilotDocClaims.test.ts`](backend/__tests__/unit/routes/quickPayPilotDocClaims.test.ts)
turns the section's claims into assertions against source — the endpoint exists,
the portal calls it, the migration is live rather than pending, the still-true
claim is still stated, and `approve` still does not write `quickPayEnabled`.
Strikethrough spans are excluded so correction history keeps working. Injection-
verified three ways: reinstating the stale claim unstruck, deleting the true one,
and renaming the endpoint away each turn it red.

**And the cheap habit that would have saved the whole detour:** before acting on
a doc's claim that something is missing, grep for it. One command, ahead of a
sprint's worth of duplicate work.

**Prevention value:** stops sprint scope-padding from stale-row signals. Today's v3.8.akw Item 51+52+53 "bundle of three" would have been three sprints' worth of work if not caught at Phase A audit — instead it's one ~15-LOC source change + two docs-only closures. Saves multi-sprint cycle on stale signals.

##### Sub-pattern 16 — Green-check-proves-the-check-ran (three-fire validated canonical)
- **Origin:** 2026-08-19/20, three fires in two days across the Arc 7-8 incident cluster.
- **Layer:** Verification (a fourth layer — above audit, ratification and execution; it governs whether a passing signal means what its name says).
- **Trigger:** any guard, gate, assertion or safeguard reporting success.

**The principle: a green check proves the check RAN, not that it observed the thing it names.**

Three independent fires, all green in CI, none caught by CI:

1. **A migration held by position.** Item 208 recorded that a column-drop commit must not ship. Nothing enforced it — it was the unpushed tip, which is a property of ordering, not a mechanism. Two commits landed above it and `git push` carried it along. **Caught by reading the push list**, after the drop had already applied to production (Item 212).
2. **A field asserted against the wrong file.** `v3.8.atj` added `schema` to `/health` in `server.ts`; the endpoint that matters is `/api/health` in `routes/index.ts`. tsc was clean and the test was green — green *because it asserted against the same wrong file*, so the mistake was self-consistent. **Caught by curling production** (Item 213 / `v3.8.atk`).
3. **An assertion outliving the behaviour it named.** "fails when the deploy hook secret is missing" kept passing after that behaviour was deliberately removed, because it only checked the job contained `exit 1` somewhere — and a different path still did. **Caught by the user's inbox** (Item 214).

**Going-forward rule, as practice rather than aspiration:** every new guard is verified against the **real artifact** once — the production response, the actual git state, the rendered output, the actual email — before its green is trusted. A fixture proves the logic; only the artifact proves the aim. **And the standard for a guard that passes vacuously on its first injection (ratified 2026-09-19):** fix it before the commit, re-inject, and RECORD the vacuous pass and its cause in the commit message — the migration test that matched a commented-out statement and the write scanner that read a `where:` filter as a write (v3.8.bdk, v3.8.bdl) are the shape. A guard's first version is the one most likely to carry the blind spot it was written against; the record is what lets the next author check for the same one.

**Kin already in this library**, which is what makes this a pattern rather than an anecdote:
- The `\Z` regex in `deployGate.test.ts` (Arc 3) — Ruby/Python syntax in JavaScript, so the assertion matched nothing and passed vacuously.
- The false-passing adversarial injection (Arc 4) — a string replace that silently did not match, so the "verification" ran against unbroken code and reported success.
- The sub-agent completeness claim (v3.8.alm) — a delegated audit asserting "no extras" while the orchestrator's own grep found twice as many sites.

**FOURTH FIRE — a green suite on a runtime the repo says it does not support (2026-08-21, Arc 12→13).**

The frontend job failed on `webidl.util.markAsUncloneable is not a function` after a new jsdom landed. The obvious reading is a dependency problem. It was not.

All three CI jobs pinned `node-version: 20`, while `backend/package.json` had declared `engines.node: ^24.0.0` since v3.8.alg and local development ran 24. **Every green CI run since that engines bump was green on a Node the repo declares unsupported** — the check ran, and it was not checking the thing its name implied. jsdom did not cause it; jsdom was simply the first dependency with an engine floor high enough to notice.

The runner had also been saying so out loud on every run: *"actions target Node.js 20 but are being forced to run on Node.js 24"*. An annotation, not a failure, so it read as noise for weeks.

Two things make this a Sub-pattern 16 instance rather than an ordinary version bump. The green was **real but mis-aimed** — tests genuinely passed, on the wrong runtime. And the contradiction was **already written down in two files that disagreed**, which is Pattern 6 sub-rule b (spatial contradiction) feeding 16: `engines` and the CI pin could not both be right, and nobody had read them together.

**FIFTH FIRE — and the first where the guard's own subject was what broke (2026-08-21/22, Arcs 27-28).**

Arc 15 added `authenticate` to the `/carrier-auth` mount so the 2FA wall would gate. The mount-parity test asserted the STRING `authenticate` appears on each mount line. It did. **The string being present is what broke carrier login for 27 hours** — that mount is the only carrier mount holding routes deliberately written *without* `authenticate`, and a mount-level guard cannot know that.

Every prior fire was a guard failing to observe a thing that was wrong. This one is a guard **confirming the presence of the very thing that was wrong**, and reporting it as health. Naming it: **presence-as-malfunction.** The guard was not merely blind — it was pointed at the defect and green because of it.

**What made it survive 27 hours** is the part worth keeping. CI was green (the change compiled and tested). `/api/health` was 200 throughout. Error rates were flat, because **a 401 is not an error**. Every automated signal the platform owned agreed the system was healthy while its front door was locked, and a human walking the site is what found it.

**GOING-FORWARD RULE: a guard whose subject is a middleware, mount, gate or boundary must EXERCISE it — send a request and read the answer.** A text assertion over a mount line can only ever prove a string is written there, and this fire proves the string can be the bug. Arc 27's replacement builds the real chain and asserts both directions: the public routes reachable, the protected ones refused. Arc 28 extends the same principle to production with a 15-minute probe that asserts response **shape**, because the broken login and the fixed login both return 401 and only the body tells them apart.

**GOING-FORWARD RULE, now canonical: any change to a dependency or to an `engines` field re-checks the CI runtime pin IN THE SAME COMMIT.** Not afterwards, and not on the next failure. A dependency with an engine floor is a claim about the runtime, and the pin is where that claim is either honoured or silently contradicted. Cheap: one grep of `node-version` against `engines`.

**Corollary worth stating**, since it is what made this survivable: the deploy job's `needs` had frontend in it, so the failure **skipped the deploy** rather than shipping. A gate that fails loudly on the right signal is worth more than one that has been green for weeks on the wrong one.

**SIXTH FIRE — the guard measured the right thing on the wrong axis (2026-08-30, v3.8.avh).**

`font-drift.js` was built to stop typography drift and held at **zero violations** for three commits while every heading in the React app rendered Playfair at weight **600**, in **italic** — both explicitly forbidden by the skill. It was green the whole time, correctly: it asserts the FAMILY, and the family was right. Weight and style drifted freely underneath a guard whose name reads like it covers them.

**Nothing automated found it. The founder did, from a screenshot**, asking whether three highlighted headings matched the design skill.

This is the distinguishing shape in the Sub-pattern 16 family. Fires one to five were guards that failed to *observe* — a stale assertion, a text check on a mount line, a regex reading prose. This one observed perfectly and observed **one axis of a three-axis property**. Family, weight and style are independent; proving one says nothing about the others.

> **A guard proves the property it asserts, not the property you meant.**

Two corollaries worth carrying:
- **Name a guard for what it asserts, not for the goal it serves.** "Font drift" implied coverage it never had; "font FAMILY drift" would have left the gap visible in its own filename.
- **When a property decomposes, enumerate the axes before trusting a guard over it.** Typography decomposes into family / weight / style / size. Three of those were unguarded while one was.

**SEVENTH FIRE — the same blind spot, twice, in the guard written to close it (2026-08-30, v3.8.avj and the arc's close-out).**

The sixth fire's own fix carried the sixth fire's shape, in two layers, and each was found the same way — by rendering, never by the guard.

**Layer one, React.** `serif-weight-drift.js` was written to close the weight axis and it passed a heading that declared *no* weight, on the reasoning that Playfair 400 is sanctioned. True, and the wrong test: Tailwind's preflight resets headings to `font-weight: inherit`, so 46 portal page titles took the body's 400 while the skill puts page titles at 700. **The new guard was green on the very axis it was built for.** Caught by rendering `/carrier/login` after the deploy — computed 400 where a synthetic probe had returned 700.

**Layer two, static CSS.** The same check on the static side asserted weight in {400, 700} and passed `.headline { font-weight: 400 }` — the class on four homepage section heads. Caught by the homepage *control*, the probe whose whole job was to prove nothing had changed.

> **Legality of a value is not the same question as the pattern for the element.**

That sentence is the finer edge of the sixth fire's rule. Enumerating the axes is not enough; each axis then has a *legal range* and a *correct value for this element*, and a guard that checks only the range is exactly as green and exactly as blind.

Three corollaries:
- **The control is not ceremony.** It was there to prove absence of change and it produced the arc's fourth finding. A probe that can only confirm is worth less than one that can also surprise you.
- **A guard's first version is the one most likely to carry the bug it was written against** — it is authored under the same mental model that missed the thing. Injection-verify it against the *original* defect, not a synthetic one.
- **Render, then believe.** Every finding in this arc past the first came from a browser. Four separate times the build was clean, the guard was green, and production was wrong.

**EIGHTH FIRE — the probe collided with its own control (2026-08-31, e-signature audit).**

Testing whether a signed Rate Confirmation renders its signature, the fixture
used `"Jordan Probe"` as the signature name — and the carrier's person-name in
the same fixture was also *Jordan Probe*. The string appeared in the PDF, the
probe reported the signature RENDERED, and that would have shipped as a finding
contradicting the truth.

Re-run with `carrierSignature: "QQSIGNATUREQQ"` — a value that can only have
come from the field under test — every signature field came back NOT RENDERED,
while a control string from elsewhere in the same document still rendered. The
second run is the one that counts.

> **A value that also appears outside the field under test verifies nothing.**
> **The probe must use a string whose only possible source is that field.**

This is Sub-pattern 16 pointing at the fixture rather than the guard: the check
ran, it observed a real string in a real artifact, and it was measuring
something other than what its name said. Same shape as a guard satisfied by an
import line, or a text assertion matching prose in its own comment — and the
same remedy, which is to make the observation unambiguous by construction
rather than to look harder at an ambiguous one.

Corollary, since it generalises past PDFs: **when asserting that X put a value
somewhere, the value must be unique to X.** Reusing a realistic-looking name
across two roles in one fixture is the most natural way to write the test and
the most reliable way to make it lie.

**NINTH FIRE — a chained command that never ran, reported as success by the tool
that ran it (2026-08-31, same day, and also mine).**

The commit that added the Prisma target guard also routed
`package.json#prisma.seed` through it as `guard && ts-node prisma/seed.ts`. Its
test asserted `pkg.prisma.seed` **contains** `"prisma-target-guard.ts"`. It did.
CI went red on the E2E suite.

**`prisma db seed` does not run its command through a shell.** The string was
tokenised, and the guard was handed `&&`, `npx`, `ts-node`, `prisma/seed.ts` as
ARGUMENTS. It read `argv[2] === "seed"`, passed, exited 0 — and Prisma printed
*"The seed command has been executed."* The seed never ran.

**The tell was a timestamp, not an error.** Guard finished at `05:43:33.350`;
Prisma declared success at `05:43:33.375`. Twenty-five milliseconds, against
five seconds and eleven `✅ E2E fixtures:` lines on the previous green run.
Nothing failed. No fixtures existed, so `/api/auth/e2e-token` returned 404 and
every E2E test failed one layer downstream of the real cause.

> **A guard that asserts a command STRING cannot know whether the command RAN.**
> **`&&` is a shell operator; a runner that does not use a shell turns it into
> an argument, and the half after it silently disappears.**

Two further things this cost, both worth keeping:

- **The audit layer would have prevented it entirely.** `prisma/seed.ts` has had
  its own `assertNotProduction()` since v3.8.auf — fails closed, refuses the
  production host, runs before the TRUNCATE. Reading the file I was "protecting"
  would have shown the protection already existed and was stronger. Sub-pattern
  15: check whether the thing already has a guard before adding one.
- **The fix is structural, not another assertion.** The chain was deleted rather
  than tested harder. A bug class that cannot occur beats a bug class that is
  watched for — and the seed's intrinsic guard cannot be defeated by how the
  command is invoked, which is exactly the property the chain lacked.

**And the replacement test caught itself doing the same thing.** Its first draft
anchored on `indexOf("TRUNCATE")`, which matched the header comment's phrase
*"before the TRUNCATE below"* at byte 677 — prose, 2.4kB above the code it
describes. It now anchors on `$executeRawUnsafe(\`TRUNCATE TABLE`, the executed
statement. **Anchor on what runs, never on a word that also appears in a comment
about what runs.**



Closed by `serif-weight-drift.js`, which asserts the other two axes *and* the loaders themselves, so a re-added 600 fails CI upstream of any component that could use it.

**TENTH FIRE — "configured is not functional", and it was green through a public outage (2026-08-31, v3.8.awf/awg).**

Google retired `gemini-2.0-flash`. It was hardcoded in four files, so Marco Polo
(the PUBLIC homepage chatbot), the shipper portal assistant and the COI parser
all died at the same instant. `/api/health` reported `parser: {"configured": true}`
throughout, because that field asked whether `GEMINI_API_KEY` was **set**. The
credential was set. The model was gone.

**A field named for a capability was reporting a credential.** I wrote that field
myself, two arcs earlier, in the commit whose whole purpose was to make storage
and parser readiness visible.

The chatbot compounded it by failing GRACEFULLY: it caught the error and replied
*"I'm having trouble connecting right now"* — a 200, a well-formed body, flat
error rates, no alert, and a sentence a visitor reads as a transient blip. Broken
and working were indistinguishable by every signal the platform owned. **Window
unknown**, because nothing recorded a first failure — there was no failure to
record. Found only because a document-chain proof went looking at the parser.

> **A health field must observe the capability, not the credential.** Anything
> that answers by reading an env var is reporting its own configuration back to
> itself.

Now: `{ configured, functional, model, checkedAt }`, where `functional` comes
from a real call, cached with a short TTL, refreshed in the background so health
stays fast and never throws. **`functional` is `null` until checked — never
optimistically `true`**, because an optimistic default is how this happened.
Storage got the same treatment: a genuine put/read/delete round trip, since
`useS3` only says credentials existed at boot and cannot see a suspended account
or a rotated key — both of which this codebase has hit.

Proven by pinning the retired model and reading the endpoint: `configured: true`
(where the old field stopped and declared health) alongside `functional: false`
and the 404 naming its own successor.


**ELEVENTH FIRE — a signal that reads the same whether the thing exists or not (2026-08-31, docs-only close-out).**

Arc PARSER's close-out told the founder to open
`/api/monitoring/document-chain/selftest`. **That path does not exist.** The
monitoring router's sole mount is `/admin`, so the real URL is
`/api/admin/document-chain/selftest` — and the wrong one went out in a commit
message and a close-out summary.

**What makes it a Sub-pattern 16 fire is not the typo. It is that I verified
it.** I curled the wrong path, got `401 {"error":"No token provided"}`, and
wrote down "the route exists and is admin-gated". The 401 was real. It came
from somewhere else entirely.

Measured on production when the doubt was finally raised:

```
GET /api/admin/document-chain/selftest  → 401 {"error":"No token provided"}
GET /api/admin/no-such-route-xyz        → 401 {"error":"No token provided"}
GET /api/totally-made-up-namespace/x    → 401 {"error":"No token provided"}
```

Byte-identical, sharing one `etag`. The cause is a catch-all:
`router.use("/", tenderRoutes)` sits at `routes/index.ts:315`, `tenders.ts:12`
is `router.use(authenticate)`, and `/admin` is mounted at `:349`. Any tokenless
request not matched by an earlier mount falls into the tender router and is
refused there, **before routing ever reaches the admin router**.

> **A 401 proves that middleware ran. It says nothing about whether the route
> behind it exists.**

The earlier fires were guards that observed the wrong thing. The sixth measured
family while weight drifted; the seventh checked that a value was legal rather
than correct for its element. **This one is worse in a specific way: the signal
is identical in the healthy and the broken state, so it has zero discriminating
power.** No amount of reading it more carefully would have helped.

**And the instinctive fix inherits the defect.** A monitor probe that hits the
URL tokenless and asserts "JSON 401, not a plain-text `Cannot GET`" is the
obvious way to make a missing admin route an alert. On this API it would be
green whether or not the route existed — a guard written against Sub-pattern 16
that is itself a Sub-pattern 16 instance. It was specified, traced, and **not
shipped** for that reason.

The check that works is a source guard
([`selftestRouteUrls.test.ts`](backend/__tests__/unit/routes/selftestRouteUrls.test.ts)):
it reads the real mount and the real route definitions, composes the URLs, and
fails if the documentation names a path that would not resolve. Injection-verified
both ways — reintroducing `/api/monitoring/` turns it red, and moving the mount
turns it red while naming the new correct URL. It runs in CI, which is also
*earlier* than a monitor could ever be: it fails before the deploy rather than
after.

**Going-forward rule.** Before trusting a probe as an existence test, ask what
the negative case actually returns. If the healthy and broken responses are the
same bytes, the probe is decoration. Establish the discriminating signal first —
by probing a path you *know* is absent — and only then write the assertion.


**TWELFTH FIRE — the test was named for the property it did not check (2026-08-31, v3.8.awp).**

A live carrier logged in, was sent correctly to `/carrier/dashboard/security`,
and sat on a spinner reading *"Redirecting to activation…"* that would never
resolve. Reported from production with a screenshot; nothing errored, nothing
failed a request, and no monitor could have seen it.

Three gates redirect on the carrier layout — status routing, the activation
wall, and enrollment. Enrollment outranks the other two, and the redirect
EFFECT says so:

```js
if (mustEnroll) return;                    // activation effect
```

The render branch did not:

```jsx
{mustActivate && !onActivationPage ? <Redirecting to activation…> : children}
```

`mustActivate = isApproved && requiresActivation`. **No `mustEnroll` term.** So a
carrier who was APPROVED with an unsigned BCA and no authenticator was redirected
to the enrollment screen and then refused it — and that screen is the only thing
that can clear `mustEnroll`. **The deadlock was permanent**, and it was reached by
following the redirect the system itself issued.

**The guard existed and was pointed at the wrong half.**
`it("outranks the activation wall")` asserts `router.replace` was called with
SECURITY and not ACTIVATION. It mounts at `/carrier/dashboard`, never at the
destination, and passes `{null}` as children.

> **A redirect test proves where the arrow points. It cannot prove that anything
> is standing where it lands.** Arriving is not the same as being able to use it.

Injection-verified by restoring the shipped precedence: **exactly one** of the
eleven cases goes red — the new one that mounts at the destination — while the
seven originals stay green. That green is the measurement. Those seven were
written specifically about this precedence and could not see it break.

**Fixed in the VALUE, not at the consumer**: `mustActivate` now carries
`!mustEnroll`, so a consumer added later inherits the precedence instead of
having to remember it. `showOperationalChrome` already had `&& !mustEnroll` —
the chrome logic was written with enrollment in mind and the content branch was
not, which is the entire defect in one line, and precisely the shape that
"one seam, not per consumer" exists to prevent.

**Going-forward rule.** When a test asserts a redirect, mount at the destination
with real children and assert they render. A gate that sends someone somewhere
unusable has not been tested by proving where it sent them.

**Relationship to Sub-pattern 11 (CI-parity).** Sub-pattern 11 asks whether the local gate matches the CI gate. Sub-pattern 16 asks whether *either* gate observes the claim it makes. Passing 11 and failing 16 is exactly the state all six fires above were in.

###### Cumulative fire registry extension (post-Sprint-51.f, three new fires)

3 new fires extend the existing registry from 26 → 29:

| Sprint | Fire # | Origin | Mechanic | Sub-pattern |
|---|---|---|---|---|
| v3.8.akr (Item 8.5 close) | 27 | "match-count is not consumer-count" — 13 AddressBook refs but 0 active consumers | Classify every grep match before inferring active state | #15 (fire 1 of 3) |
| Item 191 backlog correction | 28 | §13.3 row "Priority: ELEVATED" was already CLOSED in §11 v3.8.ajg row 24h prior | Cross-reference §13.3 against §11 history before relying on §13.3 text | #15 (fire 2 of 3) |
| v3.8.akw (Items 51+52+53 audit) | 29 | §13.3 rows 12 days stale relative to Sprint 38/39 actual code | Verify file:line references in §13.3 row against verbatim current code | #15 (fire 3 of 3) — CANONICAL PROMOTION |

**Total post-Sprint-51.f cumulative fires: 29.** Sub-pattern 15 promotion satisfies §19 three-fire validation convention with three independent fires across three sprints in ~24h. The audit-layer distinction emerged organically from the three-fire empirical lineage — Wasi's catch of Item 191 (fire #28) explicitly framed the §13.3-vs-§11 contradiction as a different kind of methodology gap from the execution + ratification layers, which the third fire (fire #29 today) confirmed as a stable structural class.

###### Cumulative fire registry extension (meta-51)

8 new fires (post-meta-50) extend the existing registry from 17 → 25:

| Sprint | Fire # | Origin | Mechanic | Sub-pattern |
|---|---|---|---|---|
| 51.b | 18 | Item 147 | useEffect dep array overwrite on user keystroke | #10 |
| CI hotfix `013883d` | 19 | Item 148 | tsc passes locally, ESLint fails at CI in 26s | #11 |
| 51.c Phase A | 20 | Sprint 51.c | 3-layer architectural disconnect traced (label + endpoint + dataflow) | #12 |
| 51.c version-letter | 21 | Sprint 51.c | abq consumed by CI hotfix; Phase B0 caught directive's `abp → abq` drift | #6 retrospective |
| 51.d | 22 | Item 152 | QP cell `"Standard Net-30"` overflowed 8-cell meta strip width budget | #8.a |
| 51.e Phase A | 23 | Sprint 51.e | Sub-pattern 10 ref-based read pattern applied to new useEffect | #10 application |
| 51.f Phase A | 24 | Sprint 51.f diagnostic | Diff analysis disproved regression hypothesis | #14 |
| 51.f reality | 25 | Sprint 51.f | Three-fire confirmed canonical promotion | #13 third-fire |
| ci-hotfix `5504c81` | 26 | v3.8.ajg → ajh push | Schema added env("DIRECT_URL") but CI workflow env block missed; backend job P1012 in 24s | #11 case study #2 |

**Total post-ajh CI hotfix: 26 prospective fires.** Sub-pattern 11 second fire validates the canonical mechanic + extends it with the four-location checklist for env() reference additions (local .env + Render dashboard + CI workflow + CLAUDE.md §2.2). The arc convention from meta-50/meta-51 holds — case studies are appended to the sub-pattern's docs, registry count increments by 1 per genuine new prospective fire, retrospective recurrences of the same mechanic (not new gap class) bump count but don't generate new sub-patterns. Fire #26 is a recurrence of Sub-pattern 11's canonical mechanic in a new operational context (schema-env vs JSX-lint), worth banking the four-location checklist extension but not promoting to a separate sub-pattern.

###### Decision-tree reference: when to fire which sub-pattern

Quick-lookup operational artifact for sprint Phase A audits. Library size (14 + 8.a) reached the navigation-aid threshold at meta-51 — this table reduces Phase A audit cognitive cost.

| Sprint scenario | Sub-patterns to apply |
|---|---|
| New conditional render path | #8 (new content renders) + #8.a (pre-existing layout integrity) |
| useEffect syncing server → local form state | #10 (ref-based read, NO form values in deps) |
| Frontend touching JSX or new pages | #11 (run `next build` locally, NOT just `tsc`) |
| Component writes via callback prop | #12 (audit BOTH write fires AND receiver reads) |
| Phase 4 user reports regression | #14 (diff analysis first; halt if hypothesis disproven) |
| Ratifying UI control behavior | #13 (workflow-first framing, NOT technical options) |
| Renderer-only sprint (PDF, image, doc) | #9 (text-extraction smoke) + #8.a (layout integrity) |
| Schema/code audit via grep | #7 (multiple naming variants; read verbatim if regex empty) |
| Concurrent sprints in same epoch | #6 (re-verify scope against latest production state) |
| File-producing build operation | #1 (fail-fast build chain) + #2 (runtime path verification) |
| Sprint identifies downstream risk | #3 (deferred-but-not-missed protocol) |
| Skill canonical vs industry practice | #4 (reconcile when conflicts surface) |
| Hybrid data flow (formData primary, DB fallback) | #5 (audit both ends — write side + read side) |
| Authoritative source available | Root sub-rule c (verify before prod-touching action) |

###### Iterative refinement at methodology library maturity (observation)

Sprint 47 → Sprint 51.f shipped 18 atomic commits across 9 hotfix iterations (Sprint 47.b, 48.b, 48.c, 49.b, 51.b, 51.c, 51.d, 51.e, 51.f) with zero rollbacks. Each hotfix closed a methodology gap discovered via Phase 4 user verification or post-deploy user usage — NOT a regression introduced by the prior sprint.

When the methodology library is at maturity, iterative refinement IS the methodology. Hotfix cadence is not a sign of failure but the expected operational rhythm: Phase 4 user verification surfaces methodology gaps that Phase B verification gates couldn't catch in-environment (because the gap lives in user mental model, browser state, or production behavior rather than code or content).

Sprint 51 arc (51.b → 51.f, 5 hotfixes) is the canonical case study. Each iteration closed a distinct methodology gap:
- **51.b** — hydration-effect-dep-array (Sub-pattern 10)
- **51.c** — write-read-dataflow disconnect (Sub-pattern 12)
- **51.d** — layout-constraint overflow (Sub-pattern 8.a)
- **51.e** — intent-detection refinement (Sub-pattern 13 second fire)
- **51.f** — always-reset operational model (Sub-pattern 13 third-fire canonical promotion)

The hotfix arc itself produced Sub-pattern 13's three-fire validation lineage — the methodology library generated its first ratification-layer sub-pattern by operating at maturity on a single user-facing surface (QP Override panel) across five iterations.


**THIRTEENTH FIRE — three greens on one job, one of them real, and only the log tells them apart (2026-09-01, `v3.8.aws`→`awy` release).**

The deploy job reported **success** on a run where it had deployed nothing. Not
a bug — the designed behaviour from `v3.8.asv`, which quieted the absent-secret
case to a warning after seven unactionable red emails. But it means
`Deploy to Render = success` is **two different facts wearing one tick**, and
for seven weeks only the decorative one had ever occurred.

Three outcomes inside 56 minutes, all on the same job:

| Run | Deploy job | What it actually did |
|---|---|---|
| 33500745501 (11:06) | **success** | `HOOK:` empty, `present=false` — warned, deployed nothing |
| 33504788375 (11:53) | **skipped** | backend red; the secret was never even read |
| 33505366194 (12:02) | **success** | `Deploy hook secret present.` → `HTTP 200` → a real deploy id |

The first and third are indistinguishable at the API — same job name, same
conclusion string, same colour in the UI. The **only** discriminator is a log
line, and the run that mattered was 47 minutes after the one that did not.

**Counting the tick would have reported the 11:06 run as the first gated deploy.
It deployed nothing.** That is the same shape as the eleventh fire (a 401 that
reads identically whether the route exists or not): a signal with no
discriminating power, which no amount of reading it more carefully improves.

**Going-forward rule: when a job has a quieted branch and a real branch that
share a conclusion, the conclusion is not evidence. Read the line that
distinguishes them, and cite it.** Applies to any check that degrades gracefully
— a skipped upload, a no-op sync, a guard that exits 0 when its input is absent.
The graceful degradation is usually right; what it costs is the ability to tell
success from abstention, and that has to be bought back at the log.

**Corollary, from the same hour.** Production reached `9c6aabfc` while that
commit's CI backend was **failing** and its deploy job had **skipped** — Render's
auto-deploy shipping a red build, which is the residual risk `v3.8.asv` names in
its own comment. A gate that can refuse is worth nothing while a second,
ungated path to production remains open beside it.

##### Sub-pattern 17 — Verification-instrument failure (filed beside Item 230.3)

- **Origin:** Arc 34 Step 0, 2026-08-24. Three consecutive wrong reports on one question.
- **Layer:** Verification (with Sub-pattern 16 — but distinct: 16 is a guard that does not observe what it names; 17 is an *instrument* whose reach silently excludes the answer).
- **Trigger:** any grep, scanner or extractor used to establish that something does NOT exist.

**What happened.** Arc 34 asked which login paths write a `StaffSession` row. The scan was `grep -oE "staffSession\.[a-zA-Z]+"`, which requires the model and the method on the SAME LINE. This codebase's formatter wraps long Prisma chains:

```ts
await prisma.staffSession
  .upsert({ ... })
```

So the writer at `ssoAuth.ts:186` was invisible, and the report read "no writer exists anywhere". **Production had 6 rows the entire time** — which is what eventually exposed it, not any amount of re-reading.

**The corroboration was the trap.** The same broken pattern was run against `main`, `auth/sso` and `bench/carrier`. Three agreeing answers felt like confirmation; they were one blind spot counted three times. Repo-wide, 29 of 2495 Prisma call sites are wrapped — a **1.2%** blind spot that happened to contain the only site that mattered.

> **Looking harder with the wrong instrument isn't looking harder.**

**Then a second, opposite error.** With the writer found, the report became "the password path has a gap". It does not: `authController.ts:412` and `:855` carry an explicit comment saying no row is written *deliberately*, because the fail-closed branch turns an absent row into exactly the ruled 24h cap — and that *"adding a row here would be a regression, not a fix."* The absence was designed, and the design was documented inches away.

> **Absence of code is not absence of intent; the comment next to the gap may be telling you it isn't one.**

**Cost of not catching it:** Arc 34 Phase 2 was one step from silently reversing another session's documented decision, leaving their comment in place asserting that the new code was a regression — with no way for a later reader to tell which side was current.

**The fix, as a tool rather than a resolution.** [`scripts/find-prisma-calls.ts`](../../backend/scripts/find-prisma-calls.ts) matches across line breaks, strips comments so prose is not mistaken for a call, flags each site inline-vs-wrapped, and **self-tests against a fixture reproducing `ssoAuth.ts:186` verbatim**. Item 230.3 fixed this same single-line assumption in the endpoint extractor; fixing it there did not fix it in a human's hands, which is the argument for the tool.

**Going-forward gate:** a negative finding — "nothing does X", "no caller exists", "this is dead" — is only as good as the instrument's reach. Before reporting one: state the method, verify the instrument against a fixture drawn from the codebase's *actual* formatting, and check the claim against independent evidence (a row count, a live response) rather than a second run of the same pattern.

##### Sub-pattern 19 — the letter guard has a window, so re-check AFTER the commit

**The closing step of the commit ritual, added 2026-09-01 after it failed.**

`check-version-letter` reads the working tree. It cannot see a letter another
session is about to claim, only one they have already written into a file. So
there is a window between "guard says free" and "commit lands", and a concurrent
session committing inside that window produces a duplicate the guard reported as
clean.

**It happened.** `v3.8.awx` was taken twice on 2026-09-01 — `56e0db42` at 00:26
and `3dafd980` at 00:33. The guard passed for the second one because at check
time only its own files claimed the letter. Same failure family as §2.2's
`v3.8.aud` incident, which is what the guard was built for; the guard narrows the
window, it does not close it.

**Rule: run `check-version-letter <letter>` again IMMEDIATELY AFTER the commit,
while it is still HEAD.** A collision found there is cheap — amend the message to
the next free letter and bump the footer, both one command. A collision found
after the next commit lands is history-rewriting across a concurrent session, and
the honest move becomes documenting it rather than fixing it.

Corollary: the check is on the COMMITTED subject, so it also catches the case the
pre-commit run structurally cannot — the other session's commit arriving between
your check and your commit.

##### Sub-pattern 20 — a proof script runs with outbound keys explicitly EMPTY

**Absence is not neutralization** — the Arc 15 lesson (§13.3 Item 221), relearned
on the tender arc because it was nearly repeated.

Every DB-backed proof in Phase B ran with `RESEND_API_KEY` present from
`backend/.env`, and the app logged `Resend configured: true`. Nothing was sent,
verified by grepping every captured output for `[Email] Sent to` and finding
none — but that is luck about which code paths the proof happened to exercise,
not a control. A proof that touched `acceptTender`'s notification fan-out would
have emailed real carriers from a throwaway container.

**Rule: invoke every DB-backed proof with the outbound keys explicitly empty**,
not merely unset —

```
RESEND_API_KEY= QUO_API_KEY= OPENPHONE_API_KEY= npx tsx scripts/_proof.ts
```

— and **grep the captured output for `[Email] Sent to` afterwards, printing the
count**, so the claim "nothing was sent" is measured rather than assumed. An
empty string is falsy for the `configured` checks and survives `dotenv`, which an
unset variable does not: `dotenv` fills an absent key from `.env`, which is
exactly how the Arc 15 guard came to report "both absent" while holding the
production key.

##### Sub-pattern 18 — `key:` regex undercounts by shorthand and by wrapped chain

**A specialization of 17, and the one that actually fires.** 17 is the general
principle about instrument reach. This is the concrete, checkable defect that
keeps producing it in this codebase, and unlike 17 it yields an *undercount*
rather than a zero — which is worse, because a plausible non-zero answer does
not invite a second look.

**The two blind spots, both from this repo's ordinary formatting:**

1. **Object shorthand carries no colon.** `data: { status, carrierId }` assigns
   `carrierId` and a `/\bcarrierId\s*:/` pattern cannot see it. Already banked at
   §13.3 Item 218, where it moved the READ-never-WRITTEN count 237 → 164 → 149
   → 143 across successive corrections.
2. **The formatter wraps long chains.** `await prisma.load\n  .update({...})`
   defeats any pattern needing model and method on one line — Item 230.3 in the
   endpoint extractor, Sub-pattern 17 in `staffSession`.

**Fires in this arc, both mine:**

- **Tender-lifecycle Phase A.** Scanning writers of `Load.carrierId` with a
  colon-only pattern returned **nine**. Adding shorthand returned **eleven** —
  `instantBookService.ts:131` and `loadComplianceService.ts:312` were invisible.
  Nine looked like a complete answer and the audit's central invariant was built
  on it.
- **Phase B commit 1.** `grep 'v3\.8\.[a-z]+' VersionFooter.tsx | head` returned
  `awq` from a *comment header*; the actual `SRL_VERSION` constant said `awt`,
  1,600 lines down. The version letter was nearly derived from prose.

**Going-forward rule.** Any scanner used to enumerate assignments must (a) accept
`key` followed by `,` `}` or newline as well as `:`, (b) match across line
breaks, (c) strip comments so prose is not read as code, and (d) be
**self-tested against fixtures of both shapes before its output is trusted** —
the fixture is the gate, not the plausibility of the number. Commit 5's
`carrier-id-writer-drift` guard is the enforced form of this rule.

##### Sub-pattern 21 — a fixture value that is not unique to its role proves nothing

- **Origin:** the session race arc, 2026-09-01 (§13.3 Item 255.7). Two proof
  failures, both mine, both looking exactly like a code defect.
- **Layer:** Verification.
- **Trigger:** any fixture minting two values that the test believes are
  distinct.

**`jwt.sign` is deterministic.** The same payload and the same secret produce a
byte-identical token, and `iat` is floored to the second — so two mints inside
one second returned **the same token**. Two sections of a proof that believed
they held different tokens were sharing one, and a session row created for the
first silently satisfied the second.

The failures did not look like a fixture problem. They looked like the grace
window letting through a token it should have refused, which is precisely the
defect under test — so the natural next move is to go and "fix" working code.
Isolating it took an instrumented run printing the actual token age at request
time.

> **A value shared between two roles in one fixture cannot distinguish them.**

This is the eighth fire of Sub-pattern 16 pointed at the fixture rather than the
guard: the check ran, it observed a real value, and it was measuring something
other than what its name said. Same remedy as there — make the observation
unambiguous **by construction** rather than looking harder at an ambiguous one.
A monotonic nonce in the payload is one line and removes the class.

**Going-forward rule.** When a fixture mints more than one of anything that must
be distinct — a token, a hash, a reference number, a slug, an idempotency key —
vary it explicitly rather than relying on wall-clock time to do it. Any
generator whose input is a second-resolution timestamp will collide inside a
fast test, and the collision surfaces as a plausible failure of the subject.

##### Sub-pattern 22 — a patch script asserts its anchor, or it lies

- **Origin:** the same arc, 2026-09-01. Fired repeatedly in a single session.
- **Layer:** Verification.
- **Trigger:** any scripted edit — `String.replace`, `sed`, a one-shot `node -e`.

**An unguarded `String.replace` that matches nothing returns the original string
and the script then reports success.** In this arc a debug-instrumentation patch
printed `dbg on`, changed nothing, and the run that followed was read as evidence
about the code. It was evidence about an unpatched file.

The miss is rarely a typo. In this codebase it is almost always **line endings**:
a multi-line anchor written with `\n` against a CRLF file, or CRLF against a file
a heredoc just created with LF (§14.1). Both fail silently and both look like the
code has changed underneath you.

**Going-forward rule.** Every scripted edit must (a) assert the anchor is present
BEFORE replacing and `exit 1` on a miss, (b) prefer line-wise editing
(`split(/\r?\n/)`) over multi-line string anchors, so line endings cannot decide
the outcome, and (c) print what it changed, not merely that it ran.

**Two corollaries from the same arc, both cheap and both cost a cycle:**

- **Do not build a matcher inside `node -e` or `sed`.** Escapes are eaten on the
  way in — four times in this arc, turning `\n` into a real newline and `\s` into
  a bare `s`. Write the script to a file, or use `String.fromCharCode`.
- **Do not chain a state-changing command into one whose exit code you then
  read.** `node patch.js && npx tsc | head; echo ${PIPESTATUS[0]}` reports the
  FAILED PATCH's status as though it were the typecheck's. Twice in this arc that
  read as a compile error that did not exist. Same shape as §13.3 Items 228.5 and
  244.3.

#### 7. Design-system conformance audit (Sprint 40b/40c, ALWAYS-FIRE post-Sprint-44.5)
- **Trigger:** sprint introduces or modifies a UI element belonging to a multi-surface class (drawers, modals, banners, tab rails, side panels, status badges, action buttons, form inputs, **nullable-data render paths**, **deploy-pipeline classes**, **fixture classes**).
- **Action:** enumerate all surfaces in the class. Check the modification against canonical reference + skill. Document drift if found.
- **Distinct from Pattern 6:** Pattern 6 is **temporal** (Sprint N vs Sprint N+1 on a single code path). Pattern 7 is **spatial** (Surface A vs Surface B at the same time across a class).
- **ALWAYS-FIRE status promoted Sprint 44.5** based on five consecutive prospective fires across multiple domains:
  - **Sprint 41 (marginPercent)** — surfaced 4 unguarded `.toFixed()` crash sites where §13.3 Items 12.1+12.2 documented 2 of 4. Domain: code logic / nullable-data render paths.
  - **Sprint 42 (drawer enumeration)** — 6 detail-style surfaces audited; ShipmentDetailDrawer + 4 right-drawers + Load Board side panel got atomic P0+P1 hotfix bundle. Domain: UI/CSS conformance.
  - **Sprint 43 (fixture-class enumeration)** — 6 fixture extensions across Sprints 37/38/40/41/43 with no central reference; surfaced Item 67 methodology debt. Domain: testing infrastructure.
  - **Sprint 44a (deploy-pipeline-class enumeration)** — 3 schema-mutation paths existed without canonical (Render automated + manual `db push` + manual `migrate deploy`); surfaced Item 8.10's deeper root cause + drove canonical consolidation. Domain: infrastructure / deploy pipeline.
  - **Sprint 44b (drift scope quantification)** — continued Sprint 44a; converted "ProspectVertical drift" finding into "81 of 87 enums" via authoritative-source query. Domain: schema integrity.
- **Caught retroactively in:** Sprint 30 Houston-template drift (5 surfaces shared the wrong Texas-template `SRL_INFO`), Sprint 32 dropdown bg drift (5 modals had 5 different dropdown patterns), Sprint 40b drawer drift (11 findings × 6 surfaces — 1 P0, 3 P1, 3 P2, 4 P3), Sprint 40c marginPercent crash sites (4 surfaces unguarded, §13.3 Items 12.1+12.2 documented only 2 of 4). Same architectural fingerprint: render-path or component-class drift across multiple consumers without a central reference.
- **Pattern signature is grep-able.** A 30-second `grep "marginPercent.*toFixed"` surfaced all 4 crash sites at once where 2-of-4 manual catch had stood for weeks. When fixing a class member, grep the class signature first; a single-surface fix on a multi-surface defect is a partial close that ages into a backlog item.
- **Domain breadth:** Pattern 7 has now fired in CSS/UI, code logic, methodology debt, infrastructure, and schema integrity. Cross-domain applicability confirms the pattern is structural, not domain-specific.

### Per-sprint commit message convention (effective Sprint 40+)

Every sprint commit message now includes two lines near the close:

```
Patterns applied: <comma-separated list of §19 entries that fired>
Patterns emerged: <new pattern, if any — meta-commit follows to log it>
```

When new patterns surface, ship them as a separate methodology meta-commit (no version bump, no source code change — same shape as Sprint 28 audit-only and Sprint 37 lock-only). Quarterly review prunes the catalog.

### Pending review (next quarterly)
- Pattern 6 sub-rule c: **14 named sub-patterns + 8.a refinement** canonicalized across §19 meta-50 (9 sub-patterns, post-Sprint-50, v3.8.abn) + §19 meta-51 (5 new sub-patterns + 1 refinement, post-Sprint-51.f, v3.8.abv). Surface now spans **2 methodology layers**: execution (sub-patterns 1-12 + 8.a + 14) and ratification (sub-pattern 13). Cumulative fire registry shows **25 prospective fires** across Sprint 44a → Sprint 51.f.
- Next §19 quarterly review trigger: 3+ new sub-patterns banked under any active Pattern (1-7), OR a new methodology layer discovered, OR Pattern 1-5/7 sub-rule canonicalization comparable to Pattern 6's a/b/c. Current sub-rule c surface is at second-canonical-expansion maturity for the operational contexts encountered through Sprint 51.f.
- Patterns 1-5 + 7 active; no pending sub-rule canonicalizations observed outside the sub-rule c surface.
- Methodology library now produces self-documenting outputs at maturity — Sprint 47 → 51.f arc generated meta-51 organically through iterative refinement. Future arcs of comparable depth (10+ atomic commits with 5+ hotfix iterations on a single user-facing surface) likely to produce further canonical promotions; quarterly cadence may shift to triggered-by-arc-completion rather than calendar-based.
- **Sub-rule c fire candidate (NEW sub-pattern) — Cross-canonical-context migration (2026-05-20, v3.8.agm → v3.8.agn one-sprint hotfix):** v3.8.agm Phase 2 shipped /shippers trust strip lifted verbatim from §18.8 (Lead Hunter OUTREACH canonical) — "BMC-84 bonded $75K · $100K contingent cargo through Hancock & Associates". §18 is canonical for OUTREACH EMAIL context; §20 is canonical for PUBLIC PAGE context. §20.1.5 Architectural Reveal Defense bans vendor-stack reveal on public marketing surfaces. Verbatim port across canonicals shipped a Lens 1.5 live violation. Wasi visual audit on deployed v3.8.agm caught it; v3.8.agn hotfix reduced to authority-only ("BMC-84 surety bonded · Carmack-compliant BOL" — drops underwriter name + dollar specifics). Banked also as §20.1.5 banned-content extension. **Pattern:** when porting copy from canonical A to canonical B, re-vet against canonical B's constraints even if canonical A is also project-SOT. Constraint sets don't auto-migrate. **Awaits fire #2 + #3 from independent incidents** before promoting to canonical sub-pattern per sub-rule c three-fire convention. Pairs with Sub-pattern 8 fire candidate #1 (asset-file-header trap) — both are "trusted-source-A on a question that needed source-B" classes.

- **Sub-pattern 8 fire candidate #1 — Asset-file-header-vs-rendered-content + stale-canonical-naming (2026-05-20, v3.8.age → v3.8.agf → v3.8.agg three-sprint chain):** session brief named `/favicon.svg` canonical and pointed at the file's own header comment ("SRL compass mark, high-res Canva PNG export") as proof. Trusted the header without opening the file in a viewer; embedded base64 PNG inside the SVG rendered as a different glyph entirely (v3.8.age shipped wrong). v3.8.agf pivoted to `/logo-compass.png` based on CLAUDE.md §20.1.7's named-canonical reference — also wrong; that file was a stale crop superseded by Wasi's newer 1024px export at `/frontend/public/media/srl-logo-1024.png` (uploaded same day; visual still wrong on deploy). v3.8.agg landed on the actual current canonical AND surfaced that §20.1.7's reference is now stale and needs follow-up correction. Six-sprint iteration chain on a single asset (v3.8.afx → agb → agd → age → agf → agg). **Two distinct sub-rule c violations:** (a) trusted file's own header comment as authoritative; (b) trusted CLAUDE.md §20.1.7 named-canonical without checking whether the named file was current. Both miss types: "authoritative source" requires the LIVE current source, not a stale document or a self-describing header. Pattern: for brand assets specifically, the LIVE export Wasi has uploaded most recently is canonical; CLAUDE.md naming + file headers describe historical state and can drift. **Awaits fire #2 + #3 from independent incidents** before promoting to canonical sub-pattern 8.b refinement per sub-rule c three-fire convention. Banked also as user-memory `feedback_asset_file_header_not_authoritative.md`. Follow-up item: update CLAUDE.md §20.1.7 to point at `/media/srl-logo-1024.png` (queued).

---

## §20 PAGE AUDIT STANDARD (binding for public marketing surfaces)

Codified 2026-05-19 (Sprint v3.8.aet docs-only commit) after the homepage + /carriers + /about audit arc surfaced repeating patterns that should be a standing standard, not re-derived per page. User-flagged trigger: *"almost all pages had very redundant and repetitive information, which was never reviewed or replaced since the website went live. Gather all the audit manual and your audit findings and add the first one which I mentioned. Make all these as set standard for the audit and improvements also keeping in Tech, AI, Brand Identity and ancient silk road in mind."*

This section is the canonical audit reference for any future public marketing page work. It supersedes ad-hoc per-page audits.

### §20.1 — Scope

Applies to:
- Public marketing pages: `/`, `/shippers.html`, `/carriers.html`, `/about.html`, `/contact.html`, `/faq.html`, `/blog.html`, `/careers.html`, `/track`
- Public legal pages (`/terms.html`, `/privacy.html`, `/security-policy.html`) — light-touch audit; legal language has different rules per §3.12

Does NOT apply to:
- Internal AE Console, Carrier Portal, Shipper Portal surfaces (per §12 EXEMPT SURFACES)
- Lead Hunter outreach (governed by §18 standing rules — distinct domain)
- PDF document chrome (governed by `srl-brand-design` skill canonical)

### §20.2 — Workflow (mandatory)

Every page audit follows this sequence:

1. **Phase A — Read-only audit.** Read the page end-to-end. Surface findings as old/new tables per §20.3 lens. No code changes yet.
2. **Phase B — Surface to user.** Present audit findings with old/new for each action item. Get explicit GO before any source change.
3. **Phase C — Execute with atomic commits.** Per §3.3, bundle cohesive page-polish into one atomic commit when scope is single-page; split when scope spans multiple pages or distinct concerns (content vs graphics).
4. **Phase D — Pre-push gates.** `tsc --noEmit` + `npx next build` + visual smoke walkthrough per `feedback_visual_smoke_before_push.md` user memory (covers viewport proportions, layout reflow, contrast across animation phases). Sub-pattern 11 CI parity applies.
5. **Phase E — Rendered-output verification.** After deploy, verify on the live URL per §3.2 (curl + grep deployed page, not local file). Cloudflare Pages ~2-3 min deploy delay.

Per "one page at a time" user directive (2026-05-19): never audit multiple pages in a single commit. Complete a page (content + graphics + verification) before moving to the next.

### §20.3 — The audit lenses

Every page is reviewed through these lenses in sequence. Lens 1.5 (Architectural Reveal Defense) added 2026-05-20 v3.8.aeu after the live-terminal architectural-leak reversal.

#### Lens 1 — Brand canonical conformance

Cross-check against §4 (honest claims whitelist) + §5 (prohibited claims). Common violations encountered repeatedly:

- **§5 prohibited "24/7"** for human-support contexts (reserved for Marco Polo AI per §4 #12). Pattern hit: /about Leadership Card #3 "around-the-clock operations center" (fixed v3.8.aer).
- **§5 prohibited fabricated volume** — "From the ports of LA to the warehouses of New Jersey", "12K+ shippers", "$50M+ moved" — implies portfolio that doesn't exist pre-revenue. Pattern hit: /about Card #5 "Nationwide Network" (fixed v3.8.aer).
- **§5 prohibited "Asset-based" / "our fleet"** — SRL is a broker, not asset.
- **§5 prohibited blanket "100% FSC pass-through"** / "Full FSC pass-through" — overstated; tier-graduated only. Retired 2026-05-19 v3.8.ads.
- **§5 prohibited "first load within 48 hours"** / specific onboarding SLAs not operationally enforced. Retired 2026-05-19 v3.8.ads.
- **Unverifiable superlatives** — "most trusted broker", "world-class", "unmatched service". Pattern hit: /about Mission card (fixed v3.8.aer).

#### Lens 1.5 — Architectural Reveal Defense (banked 2026-05-20 v3.8.aeu)

Banking lesson from v3.8.aet → aeu reversal. Before publishing any content that describes internal operations, ask: *"If a competitor screenshots this single section, what do they learn about how we built our system?"*

The v3.8.aet "live operational terminal" hero on /about was retired one commit later because its event content exposed in one screenshot:
- Load lifecycle state machine names (AT_PICKUP, LOADED, BOOKED, DISPATCHED, IN_TRANSIT, AT_DELIVERY)
- Score-to-tier threshold mapping ("Score 94 = GOLD")
- Tier fee structure with specific math ("2% Gold · $1,127")
- Internal performance timing ("RC AUTO-GENERATED · 1.2s")
- Batch operational scale ("5,247 carriers scored")
- Onboarding workflow sequence ("MC# verified · W-9 received")
- POD-to-invoice automation trigger language
- AI query/response pattern with GPS proximity logic

This was the THIRD recurrence of the architectural-leak pattern (after v3.8.adw Section 7 bullets fixed in v3.8.aem, and the /about Section 4 cards). User-flagged: *"Doesn't it give the blueprint of our internal working and system we have built."*

**Banned content classes on public marketing surfaces:**
- Specific state machine names (AT_PICKUP, LOADED, BOOKED, DISPATCHED, IN_TRANSIT, AT_DELIVERY, etc. — these are §A.1 Appendix internals, not public-surface vocabulary)
- Specific scoring thresholds tied to tier names (e.g., "Score ≥ 95 = PLATINUM")
- Specific automation trigger language ("POD upload triggers invoice queue", "Tender accept fires RC generation")
- Specific internal performance metrics ("RC generated in 1.2s", "P99 latency", "Compass recalc in N ms")
- Specific batch operational scale that implies system maturity ("5,247 carriers scored", "1,247 loads today")
- Specific onboarding workflow sequences ("MC# verified · W-9 received · COI confirmed")
- Specific tier-payment-fee math juxtapositions ("2% Gold · $1,127 cleared")
- Concept-level architecture reveals (live operational terminals, system diagrams, dashboard screenshots showing real internal data)
- **Vendor-stack reveal — named underwriters, named insurance providers, named technology vendors, named carrier-partner counterparties.** Banked 2026-05-20 v3.8.agn after the v3.8.agm trust strip shipped "$100K contingent cargo through Hancock & Associates" verbatim from §18 outreach canonical. Public surface exposing the underwriter lets competitors map SRL's insurance vendor stack. Allowed: existence of contingent coverage. Banned: name of carrier, name of underwriter, specific dollar amount of contingent coverage (FMCSA-public bond amounts like the $75K BMC-84 are OK because they're already on SAFER).
- **Cross-canonical-context migration without re-vetting.** §18 (Lead Hunter outreach standing rules) is canonical for OUTREACH EMAIL context; §20 (public marketing audit standard) is canonical for PUBLIC PAGE context. Copy that's safe in §18 (e.g. specific underwriter naming, deal-room specifics) is NOT automatically safe in §20. Any sprint that ports copy from §18 → §20 must re-vet against §20.1.5 banned-content classes. Same principle applies in reverse: §20 public-page restraint may be too thin for §18 outreach where credibility from specifics matters.

**Allowed on public marketing surfaces:**
- Named systems on §4 honest claims whitelist (Marco Polo AI, Compass Engine, Caravan Partner Program)
- Brand-canonical commitments (tier-graduated FSC per §8, BMC-84 bonded per §1, 7-factor Compass Score per §9 — these are PUBLISHED operational claims)
- High-level capability framings ("operational documents archived per load", "branded tracking links", "in-portal dispute resolution")
- Heritage iconography and brand-anchored metaphors (Silk Road, Caravan, compass)

**Test before publishing:** if a single screenshot of the section would let a competitor reconstruct your operational pipeline, soften the content. The goal is brand positioning + customer-facing benefit framing, not engineering reference documentation.

#### Lens 1.6 — Semantic Legibility Defense (banked 2026-05-20 v3.8.aep critique)

Banking the user critique on v3.8.aep heritage photo-icons: 3 of 4 (crate / leather ledger / pocket watch) failed the **4-second scan test** despite being brand-aesthetically coherent. Only the brass thermometer passed (thermometer → temperature is a one-step inference).

Before publishing any brand-aesthetic imagery on customer-facing surfaces, run the **4-second scan test**: a typical visitor sees the icon/photo for ~4 seconds while scrolling. Can they identify the service or concept it represents WITHOUT reading the H4 title?

- **One-step inference passes:** thermometer → temperature, lightning → fast, truck → trucking, snowflake → cold.
- **Two-step inference fails:** leather ledger → "old book?" → "library?" → "dedicated capacity?". A buyer scanning 4 cards in 4 seconds will not perform a metaphor-decode step.

When brand-aesthetic coherence conflicts with semantic legibility on a feature-grid section, **comprehension wins.** Brand-aesthetic register belongs in narrative copy + subtle motifs (palette, name etymology, type), not in feature-grid imagery that must communicate service category at scan speed.

#### Lens 1.7 — Brand Modernity Alignment (banked 2026-05-20 v3.8.aep / v3.8.aen critique)

Brand aesthetic must match brand positioning. SRL positions as in-house TMS + AI-augmented + modern tech-forward broker (Marco Polo AI, Compass Engine, continuous learning cycles per §9, Sprint 59 auto-RC). Imagery that reads as "old / traditional / heritage / nostalgic" creates a positioning mismatch that procurement managers and supply-chain executives read as untrustworthy — they're sourcing optimization, not nostalgia.

The **screenshot test:** does this visual signal *"modern tech-forward operation we can trust with our optimization"* or *"traditional old-school broker"*? If the latter, the visual is fighting the brand positioning and must be replaced regardless of brand-color or heritage-narrative alignment.

**Heritage iconography belongs in:**
- Narrative copy (the Silk Road etymology, "Caravan" naming, "Marco Polo" naming, Silk Road origin story in /about Our Story section)
- Subtle brand motifs (palette: navy + gold-dark + cream + cream-2; 4-point cardinal-star derivative of the compass mark; brass + walnut color references)
- The compass mark logo asset itself — `frontend/public/brand/srl-logo-fullcolour.svg` on light surfaces, `srl-logo-white.svg` on navy, with `srl-logo-navy.svg` / `srl-logo-black.svg` for single-ink work and `srl-logo-{fullcolour,white}-2048.png` where a raster is required (email, og:image, app icons). **`frontend/public/brand/` is the canonical home and these six files are the only masters** (v3.8.bfz). The `/logo-compass.png` this line used to name was an abandoned gradient-"P" concept and never the compass at all; `/media/srl-logo-1024.png`, `/logo.png`, `/logo-full*.png`, `/logo.svg` and `/logo-icon-only.svg` were all superseded by the same correction. Do not reintroduce any of them, and do not re-trace the mark from a raster: the SVG is the master and `backend/src/lib/srlMark.ts` mirrors it for PDF rendering under a guard test.

**Heritage iconography does NOT belong in:**
- Service category imagery (FTL, Reefer, Dedicated, Expedited) where buyers must decode positioning at scan speed
- Persona cards (For Shippers, For Carriers) where the audience needs to feel tech-augmented trust, not merchant nostalgia
- Hero compositions on decision-surface pages (/shippers, /carriers) where the buyer is making the buying decision and needs to see modern operational competence

The v3.8.aep heritage photo-icons on /index Section 4 + v3.8.aen heritage photos on Section 7 + my v3.8.aet operational-terminal experiment (architectural leak per Lens 1.5) collectively represent this miss class at scale. Refactor to **tech-forward modern freight imagery with subtle technology overlay elements** (abstract per Lens 1.5 — no real product UIs):

- Modern American-cab freight equipment (Cascadia, Peterbilt, Kenworth, International — never European cabs)
- Visible technology signal — abstract route lines, data dots, gauge graphics, sensor indicators (overlay on photo or as composition element)
- Brand-palette accents (navy + gold-dark) where naturally present
- Service-specific visual semantics (Lens 1.6 compliance — thermometer for reefer, fleet-yard for dedicated, motion-blur for expedited)
- AI/tech messaging in body copy that NAMES the system (Compass Engine, Marco Polo AI) without revealing how it works (Lens 1.5)

Free stock photography (Pexels, Pixabay, Unsplash) is acceptable when curated against this standard. Per-photo brand-canon checklist:
- ☐ American cab (or no cab visible if stock can't be verified)
- ☐ No third-party fleet logos / DOT numbers / license plates legible
- ☐ No people / no driver faces (per existing D2 locked decision)
- ☐ No European-cabover styling (Scania, Volvo, Mercedes-Benz, DAF, MAN)
- ☐ Modern equipment register (not vintage/restored trucks)
- ☐ Cool blue → neutral → warm-gold color register compatible with brand palette
- ☐ Composition allows for subtle technology-overlay graphic if needed

#### Lens 2 — Voice + §18.9 sweep

§18.8 + §18.9 voice rules apply to all customer-facing surfaces, not just outreach. Standard sweep:

- **Em-dashes in body copy** — replace with periods, commas, colons, or restructure. Acceptable only in list-separator context (tier-req labels, milestone headings). Hit at every page touched so far: /carriers v3.8.adu (13 retired), /index v3.8.aek (multiple), /about v3.8.aer (3 retired).
- **Prohibited consultant-speak**: "leverage", "cutting-edge", "world-class", "best-in-class", "step-change", "synergy", "north star", "unlock value", "AI-powered" when describing capabilities (vs. naming products like Marco Polo).
- **Marketing softeners**: "unwavering commitment", "relentless focus", "operational excellence", "partner satisfaction" — generic, replace with verifiable specifics.
- **Honest hours copy** per §6 — "Business hours coverage Monday–Friday, 7:00 AM – 7:00 PM Eastern. After-hours emergency line available for active loads in transit."

#### Lens 3 — Cross-page redundancy + freshness check (NEW, user-flagged)

User observation 2026-05-19: *"almost all pages had very redundant and repetitive information, which was never reviewed or replaced since the website went live."* This is the lens that catches stale boilerplate carried from page to page without review.

For each page, check:

- **Verbatim or near-verbatim repetition** across pages. Specific phrases that have appeared on multiple pages and should be either consolidated (live in ONE place) or rewritten distinctly: "real-time tracking", "transparent pricing", "operational excellence", "48-state coverage", "Compass-vetted carriers". Each page should have a DISTINCT angle on the same fact, not a copy-paste.
- **Generic enterprise-SaaS phrases** that read identically to every other broker's marketing — "data-driven pricing", "industry-leading", "trusted partner", "end-to-end solution". Replace with operationally specific language.
- **Identical CTAs across pages** — every page using "Get a Quote" / "Learn More" without varying the context. CTAs should reflect the page's specific role in the conversion flow (operational destination per §3.10 + the v3.8.aef + aek precedent).
- **Stat repetition** — same number cited on every page ("48 states") without variation. Reserve numerical proofs for the pages where they have the most rhetorical force.
- **Persona-split sections repeated** — homepage had hero + dual-persona section both running the same Ship/Haul two-track twice (collapsed in v3.8.aeb). Other pages may have similar collapsible redundancy.

When redundancy is found, the disposition options are: (a) consolidate to one canonical page, (b) rewrite each instance with a page-specific angle, or (c) delete the weaker instance entirely.

#### Lens 4 — The four pillar lenses (Tech, AI, Brand Identity, Silk Road heritage)

Every page must visibly carry at least 3 of these 4 brand pillars. Each pillar has a canonical expression:

**Pillar 1 — Tech (in-house TMS)**
- Operational stack owned by SRL, not licensed from a third-party platform
- BOL, Rate Confirmation, POD, itemized invoice all generated in SRL chrome
- Public `/track` URLs branded to silkroutelogistics.ai
- Portal access: shippers see operational documents + dispute resolution; carriers see Compass Score + Quick Pay + tender flow
- Verifiable references: §2 architecture, §9 Compass Score backend, Sprint 59 auto-RC

**Pillar 2 — AI (lever, not replacement)**
- "AI is a lever, not a replacement" is the standing brand framing
- Named systems: Marco Polo AI (24/7 freight assistant), Compass Engine (carrier vetting), continuous learning cycles (rate intelligence, lane optimizer, compliance forecast)
- Honest boundaries — what AI does NOT decide alone (the "Where AI Stops" panel canonical pattern on /about v3.8.aer): no AI-only carrier rejection, no autonomous Quick Pay disbursement, no AI-only customer onboarding, human-confirmed dispatch
- §5 prohibited: "AI-powered" as marketing softener; allowed: AI labels on actual AI products (Marco Polo)

**Pillar 3 — Brand Identity (visual)**
- Canonical palette: navy `#0A2540`, gold `#C5A572` (structural), gold-dark `#BA7517` (CTA emphasis), cream `#FBF7F0`, cream-2 `#F5EEE0`
- Four-point cardinal star motif (SRL compass mark abstraction) — used on shipper wax seal (homepage), carrier compass face (homepage), about hero network nodes (v3.8.aes)
- Heritage editorial photography on walnut surface (homepage Section 4 service icons + Section 7 TMS icons)
- No European cabs (Cascadia / Peterbilt / Kenworth only)
- No people in marketing photography (D2 locked decision 2026-05-19)
- Lucide-style line icons OR heritage photo-icons — never stock photos

**Pillar 4 — Ancient Silk Road heritage**
- Brand name etymology: "Silk Route Logistics" pays homage to the world's first logistics network
- Heritage iconography: wax seal, brass compass, leather ledger, merchant correspondence, freight crate, pocket watch — all on walnut, all in the merchant's workshop register
- "Caravan" Partner Program naming (carriers as caravan members)
- "Marco Polo" AI naming (Silk Road explorer reference)
- Trade route metaphor — operational lanes as modern silk routes

If a page expresses fewer than 3 of these pillars, it reads as generic broker SaaS marketing. The audit must surface this gap.

#### Lens 5 — Operational CTAs + destinations

Per the v3.8.aef + aek + aer precedent — CTAs must route to operational destinations, not marketing pages:

- **"Get a Quote"** → `/shippers.html#quote-form` (anchor jump to the quote form), NOT `/shipper/register` (account signup) and NOT `/shippers.html` (page top)
- **"Join the Caravan Partner Program"** / **"Haul With Us"** → `/onboarding` (carrier application flow), NOT `/carriers.html` (program details marketing)
- **"Ship With Us"** → `/shippers.html#quote-form` (quote intent) OR `/shipper/register` (account intent) — pick based on CTA context
- **Anchor link verification** — ensure the anchor exists (`#quote` was broken on /index footer until v3.8.aek; actual anchor is `#quote-form`)

### §20.4 — Graphics audit

Three approaches available per page, ranked by brand-impact:

1. **Heritage photo-icons** — full match to homepage Section 4/7 register (walnut surface, top-down 90° crop, soft daylight, brand palette). Requires Nano Banana generation cycle. Highest brand-impact.
2. **Lucide-style line icons** with brand-color top accent + hairline divider — type-forward, no asset cycle, CSS-only. Used on homepage Section 4 pre-v3.8.aep.
3. **Animated SVG** — for hero canvases or tech-positioning sections. Brand-canonical cardinal-star motif + gold-dark trade-route lines. Pattern: `/about` hero v3.8.aes.

Stock photo prohibition: every Unsplash placeholder must be either replaced (with heritage photo-icon or brand-canonical photo) or stripped (type-forward refactor). Pattern hit repeatedly: Scania (European cab) brand-canon violation on /index v3.8.aeh; analytics-charts placeholder on Digital Tools card v3.8.aem.

### §20.5 — Pre-commit gates (mandatory checklist)

Before any commit on a public marketing page:

1. ✓ `npx tsc --noEmit` clean (backend, if touched)
2. ✓ `npx next build` clean (frontend) — Sub-pattern 11 CI parity
3. ✓ Visual smoke walkthrough — viewport proportions, layout reflow, contrast across animation phases (`feedback_visual_smoke_before_push.md`)
4. ✓ §3.2 rendered-output verification deferred to post-deploy (`silkroutelogistics.ai` curl + grep)
5. ✓ Version bump per §3.1 (unless docs-only per §3.1)
6. ✓ Commit message documents lens findings + each old/new edit

### §20.6 — Page-level audit log (where each page was last audited)

| Page | Last audit version | Lens coverage | Outstanding |
|---|---|---|---|
| `/` (homepage) | v3.8.aeq · **typography superseded 2026-08-30 (v3.8.avm)** | All 5 lenses ✓ + 4 pillars ✓ | **The editorial-register lock no longer covers typography.** Four `<h2>` section heads sat at Playfair 400 and the skill puts section heads at 700; they are now 700. The "Where Trust Travels." shimmer tagline moved to the skill's Georgia italic `--gold-dark`. **The skill is canon; this register captured a pre-skill state.** Where the two disagree on type, the skill wins and the disagreement is recorded here rather than resolved silently. Composition, colour and copy remain locked. |
| `/carriers` | v3.8.amc | **All 5 lenses ✓ + 4 pillars ✓ — FULL** | Closed this session. **alk** Lens 1/2/4 sweep (body em-dashes, `#C8963E` gold drift, "Six milestones"→"One ladder", `#faf9f7`→cream, 10→9-days arithmetic). **all** /index Lens 3 redundancy (Option A) + removed live §5 "safety bonuses". **aln** tier-icon brass medallion treatment (refined-SVG path; heritage-photo option held). **Compass Score honesty arc alw→amc** made ALL 7 published factors genuinely measured backend-side — "seven measurable factors" + 97/98% gates + "recalculated weekly" + "automatic advancement" now backed end-to-end (built, not softened). FSC tile verified accurate (carrier-side RC, EIA-indexed engine). "GPS compliance"→"Tracking compliance" (telematics-activated, neutral-until-ELD). Optional: heritage photo-icons, Compass min-loads confidence floor. |
| `/about` | v3.8.amq | All 5 lenses ✓ + 4 pillars ✓ (kinetic-type + brass-medallion hero locks Tech/AI/Brand/Silk Road) | **Full sweep closed (amq).** §5 PROHIBITED FIX: the retired "tier-graduated FSC pass-through" claim was still live in 3 places (Our Story §3, Mission card, "Published Before Asked" card) — retired site-wide in v3.8.aib but /about never updated → all 3 to "fuel surcharge itemized on every rate confirmation" (§4 #1). `#C8963E` gold drift in 6 inline SVG icon strokes → `#BA7517`. Meta description em-dash (×3) → comma. "Records stay on SRL servers" → "under SRL's control" (cloud, not physical servers). **Deferred heritage photo-icons CLOSED as keep-Lucide** — per Lens 1.6/1.7 the Lucide icons are the correct register (heritage photo-icons failed the 4-second-scan + brand-modernity tests on /index); the deferral was based on pre-Lens-1.6/1.7 thinking. |
| `/shippers` | v3.8.aha | All 5 lenses ✓ + 4 pillars ✓ (Tech / AI / Brand / Silk Road) | Full §20 audit closed via 9-sprint cycle (agl Phase 1 voice → agm Phase 2 pillars → agn vendor-stack hotfix → ago Phase 3 A2 differentiation → agp Carmack drop → agq Phase 5 flip cards → agr Phase 4 ops-loop animation → ags-agy ops-loop refinement → agz hero rewrite + Section 3 artifact reframe → aha Section 2 deletion). Page structure: Hero (4-pillar) → trust strip → ops-loop (5-phase animation, real service names) → What You Receive (6 flip cards, artifact angle) → quote form. Pillar coverage 4/4. Cross-page redundancy resolved (Section 2 dropped in aha). Methodology debt banked at §20.8 + §19 sub-rule c surface. |
| `/contact` | v3.8.amd | Lenses 1 / 1.5 / 1.7 / 2 / 4 (4 pillars) / 5 ✓; Lens 1.6 + 3 minor | Audited + swept this session: softened "15-minute quote" SLA → "fast quotes during business hours, one click or email" (§5 unenforced-SLA class); "transit twice daily"→"daily" (matched `shipperLoadNotifyService`); added "18+ months" FMCSA authority (Item 182 parity); `#C8963E`→`#BA7517` gold drift ×2; body em-dash sweep; **added Marco Polo AI contact channel** (closed the AI pillar gap → 4/4); CTAs Get-a-Quote→`/shippers.html#quote-form`, Join-Network→`/onboarding`. Minor optional left: quick-link icons (scales/anchor weak 4-sec scan), 6-item FAQ overlaps `/faq.html`, `/tracking.html`→`/track` canonical. |
| `/faq` | v3.8.ame | Lenses 1 / 1.5 / 2 / 4 / 5 ✓; Lens 1.6 minor | **Major honesty correction** — page was pre-v3.7 stale, carrying live retired claims. Rewrote Carriers + Technology sections to §8/§10/§4 canonical: killed the retired tier model (180d/75-loads, 360d/150-loads, **$150/$300-mo safety bonuses**, **referral** + **"3 lanes"** gates), the **"24-48 hour" onboarding SLA**, the **"live GPS"/ELD-live/EDI (204/990/214/210)** capability overclaims, "GPS compliance"→"tracking compliance", **LTL** (not in services whitelist), the **"15-minute" quote SLA ×3**, and the non-canonical **billing@**→accounting@ alias. Gold drift `#C8963E`→`#BA7517` ×~20 + full em-dash sweep. Honest answers kept (double-brokering, factoring, QP-vs-factoring, the honest 7-day-vs-2-day Quick-Pay answer). Honest defaults applied on the 3 open decisions (drop LTL, soften mobile-app/GPS/ELD/EDI to real, keep standalone /faq) — Wasi to flag if any should change. Minor optional left: FAQ-icon "+" glyph semantics. |
| `/blog` | v3.8.amf | All applicable lenses ✓ (news-aggregator shell) | "The Freight Insider" — a JS news-aggregator shell; aggregated articles are third-party RSS (exempt, like splash quotes). Shell was already clean (zero gold drift, zero em-dashes, zero stale claims). One fix: hero subhead "curated daily **by AI**" → "from across the industry, updated throughout the day" — `newsAggregatorService` is RSS + keyword categorization (**no AI/LLM**) on a 4-hour cron, so "by AI" + "daily" were both overclaims (§18.8 no-AI-framing-when-not-AI class). |
| `/careers` | v3.8.amg | All applicable lenses ✓ | Mostly honest already (no fabricated team-size stats; honest "no open positions listed right now"; em-dashes clean). Rewrote the "Tech-Forward Environment" value card — dropped "EDI systems" (not operational), "machine learning" (unconfirmed), "cutting-edge" (§18.8 consultant-speak), "changing the industry" (hyperbole) → names real systems (Marco Polo AI, Compass Engine, in-house TMS). Gold drift `#C8963E`→`#BA7517` ×7. `careers@` alias kept (Wasi directive) + documented in §1 routing to `whaider@`. |
| `/track` | v3.8.amp · **typography superseded 2026-08-30 (v3.8.avm)** | All applicable lenses ✓ + AI pillar added · page title and section head moved 400 → 700 per the skill; see the homepage row for the rule | **Reveal fixed (amh):** "How updates reach you" genericized from a competitor-blueprint pipeline (EDI 214, 15-min ELD cadence, geofence, 60s SLA — none operational) to customer-benefit-only; bulleted (ami). **Full sweep (amp):** Lens 1 honesty — hero "Real-time status on every load" → "The latest status…" + meta dropped "in real time"/"live status" (page's own reveal shows updates are carrier check-ins + SRL check calls + telematics *where available*, not real-time on every load); Lens 4 — added the Marco Polo widget (was the only public page without it → AI pillar + chrome parity); Lens 5 — "shipper portal above" → direct `/shipper/login` link; bullet symmetry `.explainer-sources` `·` → `›`; Lens 1.5 — JS status fallback `replace(/_/g,' ')` (echoed raw enum) → generic "In progress"; `.search-btn:hover` `#8f5a11` → `#854F0B`. track.css already canonical. |
| `/privacy` | v3.8.amk | Lens 1 / 1.5 ✓ + voice/gold ✓ (legal scope) | **Over-disclosure audit (amk).** Removed the "secure **data centers**" FALSEHOOD (SRL is cloud-hosted, runs none) + collapsed §3's detailed security checklist → 1-line summary + link to `/security-policy.html` (which NDA-gates implementation detail). Fixed §1 "credit card numbers" (contradicted Security Policy §3 "no card data stored") → "payment & banking info via our payment partners". Trimmed §4 Cookies + §1/§5 to **essential-only** (grep confirmed ZERO analytics tooling site-wide — banner already says essential-only, so §4 was over-claiming analytics/preference cookies that don't exist). §8 email `privacy@` → `compliance@` (non-routed alias). No vendor/infra/employee/schema leaks anywhere. |
| `/terms` | v3.8.amk | Lens 1 ✓ + voice/gold ✓ (legal scope) | **Over-disclosure audit (amk).** Dropped "less-than-truckload (**LTL**)" from §2 services (SRL doesn't broker LTL; matches shippers/faq sweep). Tidied "AI-powered tools…Marco Polo platform" → "AI tools…Marco Polo, our freight assistant". §11 email `legal@` → `compliance@` (non-routed alias). Kept all required TOS sections (limitation-of-liability + Carmack, indemnity, Michigan law ✓, AAA arbitration / Kalamazoo ✓, change notice). No leaks. |
| `/security-policy` | v3.8.amo | Lens 1 / 1.5 ✓ — **the model**; chrome + body match privacy/terms | **Content audit (amk): clean** — capabilities public, implementation "available under NDA," "Classification: Public" intentional; §5 `privacy@` → `compliance@`. **Chrome aligned (aml):** replaced the one-off `.nav-bar` (custom sticky bar + non-canonical text wordmark + gold `#c8a951`) with the canonical logo-only INCLUDE:nav + added the missing INCLUDE:footer; wrapped doc in `<main>` + skip-link; nav JS + Marco Polo widget; `srl-logo.css` linked; nav-layout CSS added to its page-CSS (hardcoded `#C5A572`/`#BA7517`); `.doc-container` top-pad 40→112px to clear the fixed nav; doc-header recolored canonical; dead `.nav-bar`/`.toc`/`.download-bar`/`.highlight-box`/`.back-link` CSS removed. **Shared-CSS gold drift CLOSED (amm):** `utilities.css` `--gold` `#C8963E`→`#C5A572`, `--gold-light` `#D4A84E`→`#DAC39C`, 6 hardcoded `#C8963E`→`var(--gold)`, dead `.login-dropdown` block deleted (§13.3 Item 26). Cascade audit found every marketing page-CSS already overrides `--gold` to `#C5A572`, so the drift only rendered on `/security-policy` itself (no page-CSS override) — now canonical. Residual `#C8963E` on `tracking.css` (1 legacy page) + auth login/register **closed in amn** (→ canonical). **Body rebuilt (amo):** swapped the bespoke navy doc-header/`.section` register for the canonical legal-page template shared by privacy/terms — cream `.hero` ("Legal" eyebrow + Playfair `Information <em>Security Policy</em>` italic-gold + divider) → `.legal-section` > `.legal-block`s; procurement metadata (Document ID / Version / Effective / Classification) folded into the `.legal-updated` line; §1 em-dash → colon (§18.9). Now the same register as privacy/terms. Privacy + Terms "Last Updated" refreshed Feb 1 → Jun 1 2026 (reflects the amk content edits). |
| Cookies (banner + Privacy §4) | v3.8.amk | Reconciled | No standalone cookies page needed. SRL sets only essential cookies (auth token + consent flag); grep confirmed zero analytics tooling. Banner ("essential only") accurate + GDPR-compliant (notice suffices). Privacy §4 trimmed to match. `cookie-consent.js` gold drift `#c8a951`/`#b8963e` + navy `#0D1B2A` → canonical `#C5A572`/`#BA7517` + `#0A2540`. |

Update this table at the close of every page audit commit.

### §20.7 — Cross-page redundancy registry (seed entries from this audit arc)

These are confirmed redundancy patterns surfaced during 2026-05-19 audit work. They are seeds for the cross-page sweep when each remaining page is audited:

- **"Real-time tracking"** — verbatim or near-verbatim on /index hero card, /shippers, /about Card #1. Should have a SINGLE canonical home (recommendation: /shippers feature section) and not repeat.
- **"Compass-vetted carriers"** — used on /index Section 4 Card 1 + /about Card #1 (post-aer) + /carriers M-step cards. Each instance can stand alone but the phrasing repeats. Vary the angle per page.
- **"48-state coverage"** — used as section title on /index + /about + /carriers Coverage section. Verifiable claim; acceptable to repeat but should not be the ENTIRE rhetorical anchor of more than one page.
- **"Operational excellence" / "partner satisfaction"** — generic enterprise-SaaS softeners. Should not appear on any page going forward.
- **Generic "We" sentences** — "We leverage technology", "We deliver", "We move freight". Replace with the specific operational system that does the work.
- **Service-category cards duplicated across pages.** Surfaced 2026-05-20 during /shippers Phase 2 audit (v3.8.agm) — /shippers Services Detail section presents 4 cards (Dry Van, Reefer, Dedicated, Expedited) that mirror the same categories on /index Section 4. Audit-first did not flag this because each page's cards were Lens-1-clean in isolation. Wasi visual audit caught the cross-page duplication. **Rule:** when a service-category set appears on multiple pages, exactly ONE page is the canonical home; other pages either (a) drop the section entirely, (b) reference the canonical page ("see all services →"), OR (c) present a meaningfully different angle on the same categories (e.g., homepage shows them as "what we move," /shippers shows them as "which equipment fits your freight profile"). Verbatim duplication is a registry violation. **Resolution 2026-05-21 v3.8.aha:** /shippers chose path (c) at v3.8.ago — reframed to icons + buying-criterion + SRL system names. Wasi visual audit on deployed v3.8.agz showed the differentiation was tenuous (same 4 categories, same buyer question, twice). Escalated to path (a) — Section 2 deleted from /shippers entirely. /index Section 4 stays canonical for service catalog. Equipment categories still surfaced on /shippers via quote form dropdown + ops-loop status cards + What You Receive system names. **Methodology lesson:** path (c) "differentiate the angle" only works when the angle shift is large enough to feel like distinct content. Same content set + format variation alone reads as duplication. Default to path (a) when the alternative page can absorb the content's purpose via other means (quote form, ops narrative, system surfacing).
- **Ops bullets / section-internals inconsistency across pages.** Surfaced 2026-05-20 same audit — /shippers ops section has 3 bullets (Pickup verification / In-transit visibility / Documented delivery) that don't match what the homepage's equivalent section presents. Either intentional differentiation (each page emphasizes a different operational angle) or a sync miss. Either way, audit must verify and document the intent. **Rule:** when two pages cover the same operational concept, the bullet sets must be either (a) identical (single canonical), or (b) explicitly different with documented intent in the audit log. Drift accumulation without intent is what the registry catches.

When auditing the next page, run a verbatim-phrase grep against the already-audited pages to surface fresh redundancies, and add findings to this registry.

---

### §20.8 — Sunday-onward foundation (2026-05-17 → 2026-05-21 arc, canonical for web design + content writing going forward)

Codified 2026-05-21 (v3.8.ags docs-only commit) per Wasi directive: *"make this part of project history all the upgrades that we have been doing since Sunday as the foundation of the web designing - Content writting."*

The 2026-05-17 → 2026-05-21 sprint arc (v3.8.afv through v3.8.agr — homepage Section 5 capabilities-wall tile cycle + center logo saga + tagline shimmer + complete /shippers audit cycle across 5 phases) **proved a working canonical for SRL web design and content writing.** The patterns, components, and principles below are binding for future page work. Future sprints reference this section as foundation rather than re-deriving lessons per audit.

#### §20.8.1 — Proven canonical patterns (validated across this arc)

These were active hypotheses before the arc; the arc validated them under multi-page operational use. They are now **binding canonical** for all public marketing surfaces:

1. **§20.2 audit-first workflow (Phase A → B → C → D → E)** — validated across /shippers Phase 1 / 2 / 3 / 4 / 5. Each phase had Phase A read-only audit, Phase B surface to user + GO, Phase C atomic execute, Phase D pre-commit gates (`tsc --noEmit` + `next build`), Phase E post-deploy verification. Zero rollbacks during the arc. Cumulative: ~1,700 LOC across 5 atomic + hotfix commits, every commit clean.
2. **Four pillar lenses (§20.3 Lens 4 — Tech / AI / Brand / Silk Road)** — minimum 3 of 4 floor enforced. /shippers Phase 2 (v3.8.agm) closed the gap from 1.5/4 to 4/4 by naming Khotan-less generic shipper portal + Marco Polo AI + Compass Engine + heritage lead-in.
3. **§18.9 em-dash + consultant-speak sweep** — Phase 1 (v3.8.agl) cleaned 6 em-dashes + "comprehensive freight solutions" + "optimal shipping strategy" + "no surprises" + "personal service" in one atomic; sweep is reproducible per page.
4. **Lens 1.5 Architectural Reveal Defense + vendor-stack reveal extension** — caught the v3.8.agm trust-strip Hancock & Associates leak, hotfixed in v3.8.agn within hours.
5. **Lens 1.6 semantic-legibility + Lens 1.7 brand-modernity** — guided the Section 5 wall-tile register choice over heritage photo-icons for the homepage capabilities grid + /shippers system-aspects grid.
6. **Real-service-name grounding (NEW canonical)** — content writing must name REAL built services from the internal dashboards (Lane Optimizer / Carrier Intelligence / Rate Intelligence / Compliance Forecast / Customer Intelligence / Compass Engine / Marco Polo AI) NOT invented service names. Validated 2026-05-21 when Wasi shared the AI Insights dashboard screenshot and v3.8.agr operational-loop animation grounded all 4 status cards × 5 phases on real services. **Rule:** before naming a system in marketing copy, verify it exists in the actual built stack (internal dashboards, CLAUDE.md §A.5, or product surface). Invented names are §5 prohibited-class even when they sound plausible.

#### §20.8.2 — Canonical UI components (banked as reusable patterns)

These were custom-built during the arc and are now reusable patterns for any future page:

1. **Section 5 capabilities-wall tile cycle** (v3.8.aga origin) — 16 tiles in 4×4 grid rotating through capabilities every ~4s, center brand card. Inline SVG icon registry (no Lucide CDN). Pattern documented at `frontend/public/js/wall-icons.js`. **Rule:** any future "capabilities grid" surface uses this register; do not reintroduce a Lucide CDN.
2. ~~**Brand mark shimmer tagline** (v3.8.agk pattern) — Playfair italic bold 17px with gold gradient `linear-gradient(90deg, #BA7517 → #F2D89C → #BA7517)` background-clip:text sweeping left-to-right via background-position animation.~~ **SUPERSEDED 2026-08-30 (v3.8.avm).** The tagline is now the skill's pattern: **Georgia italic, `--gold-dark`, tracked +0.02em**, solid colour, no gradient.

   Two reasons, and the first is the one that matters. **This spec named a face that has never been loaded.** Neither loader has ever carried Playfair 700 italic, so every render of it since v3.8.agk was a browser-synthesised bold-italic — *nobody has ever approved how this actually looked*, because what shipped was never what the pattern described. A pattern whose own render was an accident is not a pattern to defend against the skill. Second, the gradient requires `color: transparent`, which cannot be reconciled with a spec that names a colour.

   Applied to `.srl-tagline` (homepage) and `.ops-chip-tagline` (/shippers).

3. **Hero-title italic emphasis** (`.hero h1 em` on /about, /blog, /careers, /faq, /privacy, /security-policy, /terms) — **SUPERSEDED 2026-08-30 (v3.8.avn).** The device set the second half of each page title in italic gold ("Information *Security Policy*"). It is now **roman, gold retained**.

   Same argument as the shimmer, and it is not a preference. `.hero h1` declares no weight, and static pages have no Tailwind preflight, so the UA default made those ems **Playfair 700 italic** — a face neither loader has ever carried. Every render since v3.8.agk was a browser-synthesised slant, so **nobody had approved how it actually looked**. The skill sanctions Playfair italic for the document-tagline pattern only, and a page title is not a tagline.

   Colour was always what carried the emphasis; the slant was an accident of a missing face.

   **Consequence worth recording:** with this retired, no element anywhere requests an italic Playfair face, which is what finally permitted pruning the `ital` axis from the shared Google Fonts link (`0,400;0,700;1,400;1,500` → `400;700`). The prune had been correctly refused one arc earlier, when seven pages still requested it.
3. **Scroll-drawn SVG connector** (v3.8.ago pattern, since superseded by ops-loop animation) — dashed gold-dark stroke-dasharray path that progressively draws via `stroke-dashoffset` animation triggered by IntersectionObserver. Reusable for any process timeline. CSS reference: `.steps-connector` class still in `shippers.css` (the markup is gone but the styling pattern is documented).
4. **Card-flip pattern** (v3.8.agq) — CSS 3D `transform-style: preserve-3d` + `rotateY(180deg)` on `.is-flipped`, front/back faces with `backface-visibility:hidden`. Click + keyboard (Enter/Space) toggle. `prefers-reduced-motion` honored. Reusable for any "image reveals detail" surface. Reference: `.system-card-flip` in `shippers.css`.
5. **Operational lifecycle animation** (v3.8.agr) — 5-phase tab strip + central brand chip with radial pulse + 4 status cards cycling per phase + cross-fading narrative below. JS-driven (IntersectionObserver-triggered, hover-to-pause, click-tab-to-jump, 8s resume after manual interaction, `prefers-reduced-motion` skips auto-play). Reusable for any "system in motion" surface. Reference: `.ops-loop-section` in `shippers.css`.

#### §20.8.3 — Methodology banking (§19 sub-pattern fires validated)

Two sub-pattern fire candidates banked during this arc (each awaits fire #2 + #3 for canonical promotion per sub-rule c three-fire convention):

1. **Sub-pattern 8 fire candidate #1 — Asset-file-header-vs-rendered-content** (v3.8.age → agf → agg three-sprint chain). File headers describe intent; visual viewer-verification authenticates content. Six-sprint logo iteration before landing on `/media/srl-logo-1024.png`. Banked also as user-memory `feedback_asset_file_header_not_authoritative.md`.
2. **Sub-rule c fire candidate — Cross-canonical-context migration** (v3.8.agm → agn one-sprint hotfix). §18 outreach canonical is NOT auto-canonical for §20 public marketing surface. Constraint sets are context-specific. Banked also as user-memory `feedback_cross_canonical_context_migration.md`.

#### §20.8.4 — Binding effect

For all future page work on `/shippers`, `/carriers`, `/about`, `/contact`, `/faq`, `/blog`, `/careers`, `/track`, and any new public marketing surface, this §20.8 foundation is the implicit starting state. Sprints reference §20.8 by name in their Phase A audit rather than re-deriving the lessons. New canonical patterns surfaced in future sprints are appended to §20.8 (banking model, not replace model).

#### §20.8.5 — Marco Polo chatbot governed by the disclosure ceiling (added 2026-05-25, v3.8.akx)

The Marco Polo chatbot (homepage widget at `frontend/public/shared/js/marco-polo.js` + server prompts at `backend/src/controllers/chatController.ts`) is a **public surface** governed by the same §20 audit standard as `/index`, `/shippers`, `/carriers`, and `/about`. Two canonical principles bind any future chatbot prompt rewrite:

**Principle 1 — Two-source binding.** Chatbot accuracy is sourced from CLAUDE.md (§1, §4, §6, §7, §8, §9, §10, §14, §18.8). Chatbot DISCLOSURE is bounded by what the three deployed public pages (`/index`, `/shippers`, `/carriers`) already publish. The chatbot may never state a number, threshold, percentage, rate, weight, tenure, vendor name, or fact that does not already appear on a deployed page — even when that figure is correct per CLAUDE.md. CLAUDE.md governs whether a statement is TRUE; deployed pages govern whether the chatbot is ALLOWED to say it.

**Principle 2 — §20.1.5 reveal defense extends with two carve-outs for the chatbot specifically:**
- **Tier ADVANCEMENT GATE values** (specific load counts, on-time percentages, tenure days, service-score floors) are banned even though `/carriers` publishes them. The chatbot may name the DIMENSIONS that drive advancement (load volume, on-time performance, tenure) but not the specific gate numbers. Route to `/carriers.html` for specifics. The carrier-facing page is a one-time disclosure to a self-selecting reader; the chatbot is a continuous conversational surface that competitors can query repeatedly. Same fact, different reveal blast radius.
- **Internal state machine names** (load statuses DRAFT/POSTED/TENDERED/BOOKED/DISPATCHED/AT_PICKUP/etc., carrier onboarding states PENDING/INFO_REQUESTED/etc.) are banned on the public chatbot but ALLOWED on the authenticated SYSTEM_PROMPT path because AE users operationally need them.

**Sprint origin.** v3.8.akx canonical refresh 2026-05-25 — prior `PUBLIC_SYSTEM_PROMPT` was last touched pre-v3.8.aib (so pre-2026-05-21 Sprint 1 honesty pass) and was leaking retired claims to live prospects on `/index`: "Caravan Loyalty Program" (§7 prohibited variant), "Guest" tier (retired), LTL + EDI + US-Mexico cross-border services (not on deployed pages), "small fee" vague Quick Pay framing (vs published Silver 3% / Gold 2% / Platinum 1%). The prompt also had zero reveal-defense guardrails — no ban on vendor-stack reveal, no ban on fabricated metrics, no §6 honest-hours qualifier on "24/7".

**Halt-and-report fire on PFA Protects (banked Sub-pattern 15 fire #5):** the v3.8.akx directive author asked to include "PFA surety" in the chatbot authority chain; Phase A audit confirmed PFA Protects appears NOWHERE on the three deployed public pages (only mention in the entire codebase is an internal development comment on `/index.html` line 438 explaining why the surety name was REMOVED per the v3.8.aga directive). §20.1.5 explicitly bans named-underwriter reveal as a vendor-stack reveal class. The directive's own articulated rules ("never reveal... the vendor stack", "never state a figure not on a deployed public page") contradicted the literal "PFA surety" mention; Sub-pattern 13 ratification-layer principle (workflow-first over literal-text) resolved to exclude PFA from the chatbot prompt. Disclosure ceiling > directive literal text when the directive contradicts itself.

**Going-forward gate:** any future chatbot system-prompt edit must include a Phase A audit of the three deployed public pages alongside the CLAUDE.md sections. Adding a new fact to the chatbot prompt requires either: (a) the fact already appears on a deployed page, OR (b) the fact is added to a deployed page in the same atomic sprint. The chatbot is downstream of public-page canonical, not upstream of it.

---

## §21 QUICK PAY PILOT + DOCUMENT NUMBERING (ratified 2026-08-16)

Two principal decisions, both ratified 2026-08-16. This section states what was
decided and, separately, what is actually built — those are not the same list,
and the difference is the point of writing it down.

### §21.1 — Quick Pay is a limited pilot (request, then approve)

**Ratified.** Quick Pay is no longer generally available on request of the
carrier alone. It is a **limited pilot**:

1. The carrier **asks** — a tick on the carrier application (`/onboarding`).
2. The request lands for an AE as **pending**.
3. An AE **approves or declines**, with a reason on decline.
4. Once approved, the enrolment rides the tender-sending process.
5. The carrier receives the Rate Confirmation, which states the option applied
   to that load.

The pilot is **withdrawable by SRL on notice**. Withdrawal is forward-only: it
never affects a load already funded under Quick Pay.

**What the carrier picks, and when.** Onboarding is a yes/no request to join.
**Speed is per load**, because same-day is a +2% premium under §8 and cash need
is per load, not permanent. Default is 7-day. The RC prints the speed and the
fee percentage applied **to that load**, not the tier ladder.

**A pilot changes availability, never economics.** The §8 ladder is untouched
and stays LOCKED: Silver Net-30 / 3% / 5%, Gold Net-21 / 2% / 4%, Platinum
Net-14 / 1% / 3%; same-day is a universal +2% premium and is never tier-gated;
auto-approve $2,000 / $4,000 / $6,000; monthly $15,000 / $40,000 / $80,000. Do
not weaken any of these on the theory that a pilot is provisional. Standard tier
pay is free, always available, and never depends on the pilot.

**Two decline paths, deliberately distinct.** Declining a carrier's request to
JOIN (QP Agreement §3) is not the same event as declining ONE LOAD over an
approval ceiling (QP Agreement §6). Both end at standard tier terms at no fee.
Keep them separate — collapsing them loses the fact that a carrier inside the
pilot can still have a single load declined. The same distinction holds between
**declined** (refused; nothing was ever switched on) and **withdrawn** (was in,
taken out; funded loads may sit behind it). No surface may render those two as
one status.

**Built.** `QuickPayEnrollment` model + `QuickPayEnrollmentStatus`; the
`requestQuickPayPilot` tick on registration; AE `GET /carriers/quickpay-enrollments`
and `POST /carriers/:id/quickpay/{approve,decline,withdraw}` (ADMIN / CEO /
**OPERATIONS** — wider than the ADMIN+CEO carrier-approval pair on purpose, since
this decides fee-bearing payment timing on loads the carrier is already cleared
to haul, and Operations runs the pilot); the pilot fields on
`GET /carrier-auth/activation-status`; the four-code 403 gate on the enable path
of `POST /carrier-auth/quickpay-election`; Caravan Quick Pay Agreement
**v2026-08-16-v4** carrying the pilot in its preamble, §3 and §10; and the
surfaces — onboarding request, AE pending queue + per-carrier tab, carrier
activation, carrier payments, `/carriers`, `/faq`.

**Ratified-pending — and TWO of these were stale for two weeks.** Corrected
2026-08-31 after this list was read as current, quoted to Wasi as a live gap,
and very nearly used to justify rebuilding an endpoint that already exists:

- ~~**The migration is authored but NOT applied.**~~ **APPLIED.**
  `20260816120000_document_numbers_quickpay_pilot_accessorial_uniqueness` sits in
  the live `prisma/migrations/` directory, not `_pending_migrations/`, and
  production reports a later migration as applied — Prisma applies in order, so
  this one landed with it. Enrolment reads return real rows.
- ~~**There is no carrier-side request endpoint.**~~ **BUILT, AND WIRED.**
  `POST /api/carrier-auth/quickpay-pilot-request` shipped in v3.8.asb
  ([`routes/carrierAuth.ts`](backend/src/routes/carrierAuth.ts)) — APPROVED-only,
  idempotent while a request is open, allows a fresh request from DECLINED or
  WITHDRAWN, and notifies the desk. The carrier portal calls it from
  [`activation/page.tsx`](frontend/src/app/carrier/dashboard/activation/page.tsx).
  The enable-path 403's `action.href` and the approve-path 409's "they can
  request it from their portal" both now describe a control that exists.
- **Approval does not switch Quick Pay on.** STILL TRUE, verified.
  `POST /carriers/:id/quickpay/approve` sets `QuickPayEnrollment.status` and
  nothing else; the only writer of `quickPayEnabled: true` is the signature path
  at [`carrierAuth.ts`](backend/src/routes/carrierAuth.ts) `quickpay-election`.
  Approval admits; the carrier still signs the Caravan Quick Pay Agreement. An AE
  reading "approved" is looking at a half-done state, and the AE tab says so.
- **`CarrierProfile.quickPayEnabled` is a denormalised mirror** of "has an
  APPROVED enrolment", not an independent switch. It stays the read-gate every
  charge path already checks. Write it only in the same transaction as an
  enrolment transition. Anything else re-opens the drift this model closed.

**Why this went stale, and what now catches it.** v3.8.asb built the endpoint and
applied the migration; nobody came back to this list. A "NOT built" list is the
most dangerous kind of documentation to leave unmaintained, because it is read
precisely when somebody is deciding whether to build something — so a stale entry
does not merely misinform, it commissions duplicate work.
[`quickPayPilotDocClaims.test.ts`](backend/__tests__/unit/routes/quickPayPilotDocClaims.test.ts)
now fails if this section claims a route is missing while that route exists in
the source. §19 Sub-pattern 15.

### §21.2 — Document numbering: suffix on a shared stem

**Ratified.** Document references are a **SUFFIX on a shared stem, never a
prefix.** The stem is the existing load number, so every document for one load
sorts together in any system that sorts a text column — which is the whole
point, and what a prefix scheme (`BOL-…`, `RC-…`) destroys.

| Document | Number |
|---|---|
| Load | `SRL-121485` — the anchor, already generated today |
| BOL | `SRL-121485B` |
| Rate confirmation | `SRL-121485R` |
| Invoice | `SRL-121485I` |
| Supplemental invoice (accessorial-only) | `SRL-121485S` |
| Settlement / carrier pay | `SRL-121485P` — P for pay, so it cannot collide with S |

This is the Bison Transport convention (load 5789854, invoice 5789854A,
accessorials 5789854S) carried onto the SRL stem. The `SRL-` prefix stays so a
carrier hauling for several brokers can tell whose paper they are holding.

**Re-issues take a numeric revision suffix** — `SRL-121485R2`, `SRL-121485R3`.
Revision 1 carries no digit so the common case reads clean. **Original numbers
are NEVER reused:** `rateConNumber` is `@unique`, so reuse throws on a normal
re-issue, and in a dispute the document has to say on its face which version the
carrier signed.

**`Load.bolNumber` is NOT this.** That column is the **shipper-supplied** BOL
reference their AP department searches on. SRL's own BOL number is
`Load.srlBolNumber`. They are different things and must stay different — do not
overload either.

**Built.** The anchor (`generateLoadNumber`, Postgres sequence `load_number_seq`)
already existed. The suffix scheme, the allocator and the re-issue rule live in
`backend/src/lib/documentNumber.ts`; the persisted columns (`Load.srlBolNumber`,
`RateConfirmation.rateConNumber`, `Invoice.srlDocNumber`, `CarrierPay.srlDocNumber`)
are in the schema and the migration.

**Ratified-pending — NOT built.** Same caveat: the migration is authored, not
applied. Two load creators still bypass `generateLoadNumber`
(`shipperPortalController.ts`, `emailToLoadService.ts`), so a portal-created or
email-created load has a null `loadNumber` and therefore **no stem to suffix
from** — its documents have nothing to hang off. Closing that is a prerequisite
for the scheme being true of every load rather than most of them.

---

Preserved from the pre-consolidation CLAUDE.md. These are patterns and roadmap items that didn't fit cleanly into §1–§18 but remain valid tracking material. Time-bound metrics have been stripped (e.g. "currently 21 refs", "Plan for Q2", "Install when doing daily SRL sessions").

### A.1 State Machines for Load & Carrier Lifecycle (claw-code pattern)

- Every entity with a lifecycle (Load, Carrier, Invoice, Sequence) has defined states and valid transitions.
- **Load:** `DRAFT → POSTED → TENDERED → BOOKED → DISPATCHED → AT_PICKUP → LOADED → IN_TRANSIT → AT_DELIVERY → DELIVERED → COMPLETED`
- **Carrier:** `PROSPECT → CONTACTED → INTERESTED → REGISTERED → PENDING → APPROVED` (or `REJECTED`)
- **Invoice:** `DRAFT → SUBMITTED → SENT → UNDER_REVIEW → APPROVED → FUNDED → PAID`
- **Sequence:** `ACTIVE → PAUSED → COMPLETED → STOPPED`
- Invalid transitions should be rejected (e.g., can't go from POSTED directly to DELIVERED).
- State changes should be observable — log every transition with timestamp and actor.

### A.2 Lane-Based Development (claw-codes pattern)

- For features touching multiple systems (e.g., carrier vetting has FMCSA, OFAC, identity, docs, scoring), split into independent lanes.
- Each lane has its own scope, can be built/tested/merged independently.
- Track lane status in commit messages: `[Lane 3/5] OFAC screening integration`.
- Lanes reduce merge conflicts and enable parallel work across sessions.
- Document active lanes in the relevant wiki page's "Open Threads" section.

### A.3 Event-Based State Transitions (claw-code roadmap pattern)

- State changes on Load, Carrier, Invoice, Sequence should emit structured events, not just update a DB field.
- Log every transition: `{ entity, id, from, to, actor, timestamp, metadata }` in `SystemLog`.
- Enables: audit trail, webhook triggers, external monitoring, undo capability.
- Example: `Load SRL-121483: POSTED → BOOKED by userId=xyz at 2026-04-08T10:30:00Z`.

### A.4 Knowledge Graph Awareness (Graphify pattern)

- The wiki tracks "god nodes" — concepts referenced by 10+ pages.
- Surprising connections between topics should be documented in `outputs/` when discovered.
- Every factual claim carries `EXTRACTED` / `INFERRED` / `AMBIGUOUS` confidence tags (already implemented in KB v2).

### A.5 Future Patterns (documented, not yet implemented)

- **Hook system (claude-brain):** PreToolUse / PostToolUse interceptors for permission gates and compliance checks.
- **Cost tracker modularization (src-repo):** split token counting, cost calculation, and analytics into separate modules.
- **Feature flags:** currently using env vars. Consider build-time elimination when/if migrating to Bun.
- **Centralized command registry (Hermes):** single registry auto-generates CLI help, Slack menus, API docs. Plan when multi-platform.
- **Print-mode automation (Hermes):** one-shot CLI mode for CI/testing without trust dialogs.
- **MemPalace conversation persistence:** local AI memory system (ChromaDB) that stores every session verbatim and makes it searchable. Auto-save hooks fire every 15 messages. Command: `pip install mempalace && mempalace init`.
