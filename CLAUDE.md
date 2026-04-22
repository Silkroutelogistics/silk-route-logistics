# Silk Route Logistics — Project Context (CLAUDE.md)

This file is the single binding source of truth for any Claude Code session working in this repo. Read it at session start. Rules below override all defaults. Follow them exactly.

Last consolidated: Phase 4 close (v3.7.h, commit `3ea7539`).

---

## §1 PROJECT IDENTITY

- **Legal entity:** Silk Route Logistics Inc. (Michigan C-Corp)
- **Principal address:** 2317 S 35th St, Galesburg, MI 49053. Filed with FMCSA, listed on BMC-84 bond paperwork, and appears on the filed Bill of Lading. Galesburg is inside Kalamazoo County, so county-level venue references (§14 and Caravan Quick Pay Agreement v2 Article 18) remain correct as "Kalamazoo County". Correction history: earlier CLAUDE.md revisions listed Kalamazoo as principal city — that was a session-memory error corrected in v3.7.i; see §3.13 for the rule it codified.
- **FMCSA authority:** USDOT 4526880, MC 01794414, active property broker
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

### AE Console modules

Served at `/dashboard/*`, `/accounting/*`, `/admin/*` via Next.js app router. Static HTML at `frontend/public/ae/*` is **legacy scaffolding**; React routes are authoritative.

**Live React routes: 47 dashboard + 13 accounting + 4 admin = 64 live routes.** (Counts exclude Next.js convention files — `layout.tsx`, `error.tsx`, `loading.tsx`.) Grouped by function:

- **Operations (daily-use):** `lead-hunter` · `crm` · `carriers` · `loads` · `orders` · `dispatch` · `track-trace` · `loads-calendar` · `dock-scheduling` · `tender` · `drivers` · `fleet`
- **Financial operations:** `finance` · `invoices` · `payables` · `settlements` · `factoring` · `quick-pay` (dashboard) + `/accounting/*`: `aging` · `analytics` · `approvals` · `credit` · `disputes` · `export` · `fund` · `invoices` · `payments` · `pnl` · `quick-pay` · `quickpay-revenue` · `reports`
- **Intelligence + analytics:** `overview` · `scorecard` · `revenue` · `waterfall` · `market` · `lane-analytics` · `geo-spend` · `backhaul-discovery` · `variance-reports` · `ai-costs` · `ai-insights`
- **Compliance + documents:** `compliance` · `claims` · `documents` · `audit` · `violations` · `fuel-tables`
- **Configuration + rules:** `rfp` · `routing-guide` · `exception-config` · `contract-rates` · `shipper-defaults` · `tagging-rules` · `sops` · `settings`
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
- **Type scale, line-height, letter-spacing tokens** — deferred alongside typography reconciliation.

---

### §2.2 Render deployment authority (dashboard, not render.yaml)

**The silk-route-backend Render service is not Blueprint-managed.** It was created manually in the Render dashboard. Render reads its buildCommand, startCommand, env vars, and runtime config from the dashboard UI — `render.yaml` in this repo is cosmetic / documentation-only. Edits to `render.yaml` alone will deploy without effect.

**Dashboard URL:** https://dashboard.render.com/web/srv-d64iqtffte5s73894h8g

**Current authoritative buildCommand** (as set in the dashboard on 2026-04-22, kept in sync with `render.yaml` for reference):

```
npm install && npx prisma generate && npx prisma migrate deploy && (npx tsc || true) && cp -r src/assets dist/backend/src/assets && cp -r src/config dist/backend/src/config
```

**Rule for any future session (human or AI):**
If you need to change what runs during a Render build, make the edit in the dashboard UI, NOT by editing render.yaml. An edit to render.yaml alone will deploy without effect, then silently fail when the expected build behavior doesn't occur.

This divergence was discovered on 2026-04-22 during v3.7.o-build-prep, after a 45-minute debugging session where a missing-asset bug (compass logo not rendering on production BOLs) was traced from "cp step in render.yaml didn't run" to "Render isn't reading render.yaml at all."

Two specific assets require the cp step: `src/assets/` (logo.png, future font files for BOL v2.9) and `src/config/` (email signature templates). Any future `__dirname`-relative asset under `backend/src/` must either live under one of those two directories, or the dashboard buildCommand must be extended to cp it.

If the service is ever recreated, reconfigured, or migrated, the dashboard buildCommand must be manually re-entered using the value quoted above.

(Optional future cleanup: convert the service to Blueprint-managed so `render.yaml` becomes authoritative. Not scheduled — requires service recreation, downtime, and env var re-entry. Defer until there's explicit bandwidth for infrastructure cleanup.)

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
- Pre-commit: `npx tsc --noEmit` from `backend/` + `npx next build` from `frontend/` must both pass clean.

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

1. 100% fuel surcharge pass-through
2. Itemized quotes, no post-booking clipping
3. No factoring contract required to use Quick Pay
4. Performance-based tier advancement via Milestones M1–M6 (advancement independent of fleet size)
5. Published Quick Pay fees: Silver 3% / Gold 2% / Platinum 1% at 7-day standard; +2% for same-day at any tier
6. Free standard pay by tier: Silver Net-30, Gold Net-21, Platinum Net-14
7. Tier-based quarterly safety bonuses at Gold ($450/qtr) and Platinum ($900/qtr)
8. Tier-based referral bonuses ($250 / $500 / $750)
9. Tier-based detention pay
10. Property broker registered under FMCSA authority (USDOT 4526880, MC 01794414), BMC-84 bond on file
11. 7-factor transparent Compass Score (published on /carriers)
12. Marco Polo AI assistant is 24/7 (AI software is always on)

---

## §5 PROHIBITED CLAIMS (must not appear on marketing pages)

- Volume stats without real numbers (carrier counts, load counts, on-time percentages)
- Named customer testimonials unless a real carrier/shipper provided one in writing
- "Asset-based" / "our fleet" / "our trucks" / "we own"
- "Zero dispatch commission" / "$0 Commission" / "Zero Commission" (retired positioning)
- "Zero factoring fees" (misleading — replaced by no-contract framing)
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

### Silver (1–4 trucks, Day-1 entry)
- Net-30 free · 7-day QP 3% · same-day 5% (3%+2%)
- Auto-approve $2,000/load · monthly limit $15K
- Detention $50/hr after 2hr
- Referral $250
- FSC pass-through: loaded miles

### Gold (5–10 trucks OR M4 milestone)
- Net-21 free · 7-day QP 2% · same-day 4% (2%+2%)
- Auto-approve $4,000/load · monthly limit $40K
- Detention $65/hr after 2hr
- Referral $500 · Safety bonus $150/mo ($450/qtr)
- FSC pass-through: loaded + empty miles

### Platinum (11+ trucks OR M5 milestone)
- Net-14 free · 7-day QP 1% · same-day 3% (1%+2%)
- Auto-approve $6,000/load · monthly limit $80K
- Detention $75/hr after 1.5hr
- Referral $750 · Safety bonus $300/mo ($900/qtr)
- FSC pass-through: all miles
- Priority freight access

### Critical rule
Same-day Quick Pay is UNIVERSAL +2% premium on tier fee. **Not tier-gated.** Every tier can elect same-day on any load.

---

## §9 COMPASS SCORE (7-factor, published on /carriers)

| Factor | Weight |
|---|---|
| On-time pickup | 20% |
| On-time delivery | 20% |
| GPS compliance | 15% |
| Claims ratio | 15% |
| Communication | 10% |
| Document timeliness | 10% |
| Acceptance rate | 10% |

---

## §10 MILESTONES M1–M6 (performance-based advancement)

| Milestone | Requirements | Outcome |
|---|---|---|
| M1 | First Caravan Partner Program load | Silver tier active |
| M2 | 30 days, 10+ loads, 95%+ on-time | Silver confirmed, Compass tracking eligible |
| M3 | 90 days, 30+ loads, 96%+ on-time | Silver established, referral bonuses unlock |
| M4 | 180 days, 75+ loads, 97%+ on-time, 1 referral | → Gold (fleet-size-independent) |
| M5 | 360 days, 150+ loads, 98%+ on-time, 3 active lanes | → Platinum |
| M6 | 720 days, 300+ loads | Locked 1% QP permanently, advisory voice on CPP evolution |

---

## §11 PHASES SHIPPED (chronological, all on main)

| Version | Commit | Description |
|---|---|---|
| v3.5.e | `e85e3a6` | Lead Hunter: atomic bulk-stage + email-keyed import + server-side stats + drop localStorage |
| v3.5.f | `a4c12a5` | Lead Hunter: audit gap closure + Replies quick actions + merged Activity feed |
| v3.6.a | `4668f67` | Lead Hunter: right-side `ProspectDrawer` (720px) + row polish + activity enhancements (origin of the current drawer pattern) |
| v3.6.b | `e8af6a1` | Contact taxonomy: `salesRole` enum, `introducedVia`, Do Not Contact flag, shared panel |
| v3.6.c | `8fe73b3` | Mass email overhaul: plain-text + Gmail signature, stage-aware templates, Resend webhook tracking, follow-up sequencer + Queue, engagement scoring |
| v3.6.d | `6eaa667` | "Not Interested" pipeline stage + idempotent mark flow |
| v3.6.e | `36e5636` | Forgot-password wired across carrier/shipper/AE logins; seed test carrier decommissioned |
| v3.6.f | `7c3dd81` | Shared site chrome (nav + footer) via `inject-chrome.mjs` |
| v3.6.g | `7aefbde` | Forgot/reset-password pages adopt login split-screen brand aesthetic |
| v3.6.h | `f304729` | Chrome hotfix: orphan HTML cleanup, legacy nav IDs, integrity guard + `verify-chrome` |
| v3.6.i | `1924bf9` | Penguin nav variant + Marco Polo widget parity + 11 logos clickable |
| v3.7.a | `cdf1f3b` | BRONZE→SILVER enum migration, Caravan Partner Program rebrand, v3 QP pricing, 7-factor Compass, QP override backend, `getEffectiveTier` PLATINUM identity fix |
| v3.7.b | `c6744d1` | AE Console QP override UI, variance cron, `caravanService.test.ts`, rate-con PDF cleanup |
| v3.7.c | `635aa46` + `ed3d321` | /carriers tier cards grid fix (v3.7.a miss — caught in visual audit) |
| v3.7.d | `2a9ae08` | **Phase 4A** — truth-up cleanup: removed fabricated stats, testimonials, asset-based mischaracterization, retired $0 Commission, human-support 24/7 |
| v3.7.e | `9fe2ef6` | **Phase 4B** — CarrierFraudBanner on /carriers (FMCSA verification, BMC-84 bond reference, `compliance@` mailto) |
| v3.7.f | `42f443c` | Chrome CSS fix — nav-login CSS migrated from `pages/index.css` to shared `utilities.css`, "Sign In" artifact resolved across 12 non-homepage pages |
| v3.7.g | `630219f` | **Phase 4C** — positioning rewrite: homepage hero, /carriers three commitments, honest math box, Milestones M1–M6, "What's coming" roadmap, closing CTA; `contact.html` FAQ v3 alignment |
| v3.7.g.1 | `1ac3802` | Mobile responsive hotfix — tier cards + math box at ≤768px (bug since v3.7.a + new in 4C); pure CSS, no `!important`; also fixed pre-existing `repeat(4,1fr)` BRONZE-era stale grid |
| v3.7.h | `3ea7539` | **Phase 4D close** — 5 FAQ entries, supporting page sweep, onboarding email verified on v3 (closes Phase 3 Gap 3), MEMORY.md deferred items logged |
| v3.7.i | `e5def51` | Principal-address correction Kalamazoo → Galesburg across marketing + backend + CLAUDE.md §1; new §3.13 address/legal-identity verification rule |
| v3.7.j | (this commit) | **Phase 5B documentation consolidation** — §2 AE Console inventory (64 live routes categorized), §2.1 Design System (hybrid color tokens per §3.13 + Legal document reference to BOL v2.8 as canonical brand expression), §11 historical backfill (v3.5.e through v3.6.i), §13 Phase 5E track-and-trace verification gaps |

**Explicitly excluded from §11** (do not backfill, do not exist in git): v3.4.c, v3.4.k, v3.4.s, standalone v3.5, v3.5.d, standalone v3.6.

---

## §12 EXEMPT SURFACES (internal tools — different rules)

Marketing content rules (§4, §5) do **NOT** apply to these surfaces:

- `frontend/src/app/dashboard/lead-hunter/**` — email signatures intentionally sign as Wasi per earlier decision (§3.10)
- `frontend/src/app/ae/**`, `frontend/src/app/accounting/**`, `frontend/src/app/admin/**` — internal tools, fabricated fixture data allowed (see §13 deferred cleanup)
- `frontend/src/data/splashQuotes.ts` — ATRI/NIOSH-sourced industry facts, employee audience
- Internal dashboards may reference "Wasi" or "Sales (Wasih)" labels
- `frontend/public/security-policy.html` — technical rate-limiting documentation, not marketing
- `frontend/public/ae/**` — internal AE console HTML, fixture data OK

---

## §13 DEFERRED POLISH / CLEANUP QUEUE (non-blocking)

- **Internal AE dashboard fixture personas** — `ae/financials.html:137` contains "Michael Reeves" and possibly other fabricated persona names. Replace with generic labels (Customer #1, Customer #2) before any public demo, investor presentation, or external screen-share. Internal tooling only, not marketing surface.
- **v3.6.j sidebar logo clickability** — 31 portal/AE sidebar logos to be made clickable to dashboards. Non-critical polish.
- **Phase 5 CSS variable consolidation** — Option C from v3.7.f. Consolidate shared CSS variables into a proper variables file instead of `:root` injections in `utilities.css`.
- **Phase 5 visual rebalance** — /carriers and site-wide over-dark color palette; cream/off-white section backgrounds needed; typography audit for mobile readability. Includes BOL / rate confirmation visual redesign (design asset staged in Google Drive by Wasi, slots into Phase 5).
- **README.md fix** — `README.md:3` uses "Asset-based carrier management and freight brokerage platform" — same mischaracterization removed from marketing in v3.7.d. README is dev-facing (internal), not marketing (external), so Phase 4 rules don't strictly apply. Fix as a separate micro-commit before Phase 6 external demos.
- **MEMORY.md cleanup** — after CLAUDE.md §2 (Architecture) and §13 (Deferred Queue) ship, MEMORY.md has duplicated content. Trim MEMORY.md to only session-specific notes. Do NOT do in same commit as CLAUDE.md consolidation (atomic commits rule, §3.3).
- **Phase 5E — BOL QR + `/track` + source-of-truth verification.** BOL v2.8 (`BOLTemplate.tsx`) renders a QR code labeled "TRACK" encoding a `/track/<bolId>` destination. Three verification gaps before a real dispatched BOL:
  1. Confirm `pdfService.ts` / `BOLTemplate.tsx` QR generation actually encodes the correct production URL (not `localhost`, not a placeholder).
  2. Confirm `/track/:bolId` route exists, renders publicly on `silkroutelogistics.ai`, and degrades gracefully for unknown IDs.
  3. Confirm `/track` data source of truth is the Track & Trace AE Console module — specifically that public `/track` renders the most recent check-call note OR GPS ping from the T&T service, not a stale cache or fixture. Verify read-only projection is correctly scoped (no PII leak: driver names / phone numbers must NOT appear on public `/track`).

  Execute as Phase 5E with its own audit-first command.
- **F5 — Marketing nav "Track" link flip.** `site-chrome.json` `navItems` currently points "Track" to `/tracking.html` (legacy static page). After Phase 5E.c confirms `/track` flat route is stable with real token-based lookups, flip the nav link to `/track`. Not in 5E scope strictly — marketing page edit requires its own smoke test (`inject-chrome.mjs` regeneration across 13 pages).

---

## §14 LEGAL / COMPLIANCE STATUS

- Property broker under 49 U.S.C. §§ 13904, 13906
- **Carmack Amendment:** SRL is NOT liable as a motor carrier. Carriers sign the bill of lading and assume Carmack liability per the Broker-Carrier Agreement.
- BMC-84 bond provisions documented in Caravan Quick Pay Agreement v2 (Article 20). Surety: PFA Protects (CA# 0M18074).
- Michigan governing law, Kalamazoo County venue for disputes.
- Non-solicitation 12 months post-termination, 15% liquidated damages (Flock pattern).
- **Caravan Quick Pay Agreement v2:** DRAFTED. 22 articles, 3 exhibits, 513 paragraphs, 42.6 KB. Covers anti-assignment, re-brokering prohibition, non-solicitation with liquidated damages, 14 regulatory compliance covenants, full Carmack framework, minimum insurance ($1M auto / $100K cargo / $1M–$2M GL), indemnification, confidentiality, damages cap, Michigan governing law, arbitration election, jury trial waiver, BMC-84 provisions, force majeure. **REQUIRES** Michigan commercial attorney review before first carrier signs. Budget: $400–$800.
- **Broker-Carrier Agreement (base):** Research complete (Cowtown, Flock, Seaton & Husk templates reviewed, FMCSA regulations cross-referenced). Draft not yet created as standalone document. Quick Pay Agreement v2 assumes this base exists — **first carrier onboarding blocker**.
- **Public `/track` PII scope** (decision locked v3.7.k): `shipperName` is intentionally visible on public `/track` lookups. Rationale: the BOL document itself is the source of the scan and already prints shipper name adjacent to the QR; redacting on `/track` creates no privacy benefit for the recipient of the BOL while creating a confusing UX discrepancy between paper and digital. BOL v2.8 §14 confidentiality clause governs third-party disclosure (carrier cannot sell shipper list to competitor or post shipper identities on a job board) and does not require redaction from parties who already hold the BOL. Do NOT "fix" `shipperName` to be hidden on `/track` without explicit reversal of this decision.

---

## §15 TOOL PREFERENCES (this Claude Code environment)

- **`bash grep` is reliable; the Grep tool has a known quirk on `/tmp` paths** — use `bash grep` for verification via the Bash tool. Lesson origin: v3.7.d smoke test, Grep tool returned zero matches while `bash grep` found the hits.
- **Rendered-output verification requires deployed URL** (not local file reads) — smoke tests use `curl` on `silkroutelogistics.ai`, not local file reads. Cloudflare Pages takes ~2–3 min to deploy after push; use a single background Bash task with `sleep 180` + `curl` + `grep` chain.
- **Visual confirmation requires the user** — no headless browser available. Claude Code can verify HTML structure + deployed content via curl/grep, but pixel-level checks require screenshots from the user.
- **VS Code Claude Code extension** is the primary surface; commits via bash `git` in the integrated terminal.
- **Shell working directory persists** between Bash calls (e.g. `cd backend` sticks). Use absolute paths (`git -C "c:/Users/..."`) or explicit `cd` at the start of each command if the state matters.
- **Exit code 1 from `grep -c` returning zero matches** — this is expected and healthy (grep conventions). If a background Bash ends with a regression-grep that returns zero prohibited-string hits, the whole pipeline "fails" with exit 1 even though the result is a PASS. Read the output, not just the status.

---

## §16 FIRST-CARRIER ONBOARDING BLOCKERS (pre-launch, must resolve before first carrier signs)

1. **Broker-Carrier Agreement base document** — create as standalone `.docx` referenced by Quick Pay Agreement v2
2. **Michigan commercial attorney review of Caravan Quick Pay Agreement v2** ($400–$800 budget)
3. **DAT load board registration** activation
4. **Carrier onboarding welcome email final verification** before first real carrier touches it (v3 language confirmed at `routes/carriers.ts:614` in v3.7.h; re-verify before go-live)
5. **`compliance@silkroutelogistics.ai` alias monitoring cadence** confirmed (published on CarrierFraudBanner since v3.7.e)
6. **Insurance verification** — contingent broker coverage via PFA Protects + LOGISTIQ Broker Shield. Confirm policies active, not just in application state.

---

## Appendix: Legacy / Custom Sections

Preserved from the pre-consolidation CLAUDE.md. These are patterns and roadmap items that didn't fit cleanly into §1–§16 but remain valid tracking material. Time-bound metrics have been stripped (e.g. "currently 21 refs", "Plan for Q2", "Install when doing daily SRL sessions").

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
