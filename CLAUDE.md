# Silk Route Logistics — Project Context (CLAUDE.md)

This file is the single binding source of truth for any Claude Code session working in this repo. Read it at session start. Rules below override all defaults. Follow them exactly.

Last consolidated: Phase 6.2 close (v3.8.ee, sprint span `7c74bb1`–`df3545f`).

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
  - `operations@silkroutelogistics.ai` — customer-facing operations contact. Used on BOL, Rate Confirmation, Invoice, and other shipper/carrier-facing documents generated via the `srl-brand-design` skill. Routes to `whaider@` until the Pakistan-based AE/Compliance hire (Oct 2026), at which point routing flips to that inbox without requiring document reissue. The forward-looking aliasing avoids a future BOL-template churn when the hire lands.

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
| v3.7.j | `9418464` | **Phase 5B documentation consolidation** — §2 AE Console inventory (64 live routes categorized), §2.1 Design System (hybrid color tokens per §3.13 + Legal document reference to BOL v2.8 as canonical brand expression), §11 historical backfill (v3.5.e through v3.6.i), §13 Phase 5E track-and-trace verification gaps |
| v3.7.k | `76d19a9` | **Phase 5E.a foundation** — public `/tracking?token=...` route scaffolded with token-based access (no auth required), token generation tied to Load record at dispatch, PII scope defined (carrier name + rate + internal refs stripped), 4-stage progress strip + 9-stage milestone timeline UI, manual-update integration with `Load.trackingEvents` via AE Console |
| v3.7.l | `68d1c8b` | Hotfix: TOTP login verify race-condition + JWT-issue ordering fix (regression from v3.7.j) |
| v3.7.m | `f95bb65` | Hotfix: reset-password flow token consumption ordering — peek/consume split + `prisma.$transaction` atomic update; 9-test resetPassword regression suite |
| v3.7.n.1 – v3.7.n.9 | various | **Regression sweep** (9 commits): Sign-In dropdown visibility, Shippers nav regression, Track logo placement, Carrier home CTA, Maps iframe rendering, Portal access regression (2-month dashboard breakage from Feb security hardening — restored without weakening security headers), Lead Hunter modal close, Load Board button regression, Lane Analytics crash on empty data |
| v3.7.o-build-prep | `c90170b` | Build environment cleanup staging the v3.8 multi-line BOL pivot. v3.7.p was preserved as wip ref but never merged (intentional pivot to v3.8 epic) |
| v3.8.a | `d1dab7b` | **Multi-line BOL foundation** — new `LoadLineItem` Prisma model + `PackageType` enum (10 values) + per-line hazmat flag + `@@unique([loadId, lineNumber])`; full-replace update semantics; migration applied to Neon prod via `prisma migrate deploy` |
| v3.8.b | `cf16609` | **BOL v2.9 template + ligature fix** — template rebuilt to v2.9 reference style; PDFKit ligature suppression via Option β monkey-patch (`features: { liga: false, clig: false, rlig: false, dlig: false, kern: true }`); 9 TTF fonts staged at `backend/src/assets/fonts/bol-v2.9/`; clean RGBA logo; new utilities `htmlEntities.ts` + `qrGenerator.ts`; +1,263 / −252 across 18 files |
| v3.8.c | `b13eddd` | **Order Builder dynamic line-item UI + 3-layer freight fix** — new `LineItemsSection.tsx`; L1 sync save before convert-to-load, L2 button disable on incomplete lines, L3 backend `400 INVALID_LOAD_NO_FREIGHT`; `isHotLoad` Boolean coercion bug fixed; `/api/orders` exempted from sanitizeInput (bandaid for HTML encoding bug — full fix in v3.8.d.2); `buildLineItems` exported; verification load L2228322560 |
| v3.8.d | `c2e49d7` | **Multi-line BOL rendering + /tracking decode** — pdfService freight table iterates `load.lineItems[]`, 10-row cap with overflow footer, totals strip aggregates full array, dashed-horizontal row separators; `/tracking` serializer applies `decodeHtmlEntities` at boundary on equipment/commodity/origin+dest city/state/shipperName/carrierFirstName/lastLocation/stops/checkCalls; closes `Dry Van 53&#x27;` rendering bug; 4 files / +206 / −49 |
| v3.8.d.1 | `7e439b3` | **BOL template field bindings fix** — diagnosed via direct DB query of L2228322560: BOL was reading customer record for Shipper section instead of `load.originCompany`/`originContactName`, AND rendering literal placeholder strings. Fix: Shipper reads `originCompany`/`originContactName`/`originContactPhone` (customer fallback retained); Consignee reads `destCompany`/`destContactName`/`destContactPhone` (no placeholder fallback); Shipper Ref renders `poNumbers[0]` with cascading fallback to `shipperReference` → `shipperPoNumber` → `customerRef`; Special Instructions renders raw or empty (no placeholder). **Merges previously-specced v3.8.c.1** (poNumbers wiring) into this sprint — same diagnostic root cause |
| v3.8.d.2 | `bed4ac7` | **sanitizeInput middleware rework + data decode script** — architectural fix for HTML encoding bug surfaced in v3.8.d. `middleware/security.ts` rewritten: no more `escapeHtml` on string inputs, replaced with trim + length-cap + null-byte strip; sanitizeInput re-enabled on `/api/orders` (v3.8.c bandaid removed); `scripts/decode-encoded-load-fields.ts` one-time idempotent migration for legacy encoded data; `/tracking decodeHtmlEntities` retained as defensive fallback for one sprint cycle |
| v3.8.d.3 | `afecc43` | **Order Builder converted-order gate + multi-pass decode** — drafts list filters `loadId !== null`; direct-navigate to converted order URL renders amber "already converted" banner with View loads → button + disables Create load; auto-redirect to `/dashboard/waterfall` after 1.5s on successful convert (state machine + gate prevents double-conversion); decode script updated to be multi-pass-safe (handles double/triple-encoded values like `&amp;#x27;`) |
| v3.8.d.4 | `8837263` | **Multi-PO BOL render** — Shipper Ref cell renders `poNumbers[]` as comma-joined list (e.g. `PO#1472, PO1476`); 3+ POs render first 2 + `+N more` suffix; em-dash fallback; maintains 4-field PO chain. Verified with L9756795914 (Kehe → Unfi). Closes the v3.8 multi-line BOL epic |
| v3.8.e | `108e18e` | **Phase 6.1 — T&T status advancement controls** — new shared helper `frontend/src/lib/loadStatusActions.ts` (single source of truth for `NEXT_STATUS` + `STATUS_ACTIONS` + `getNextStatusAction()`); Load Board imports from shared module; T&T `LoadDetailDrawer` header gets advance button next to close button; cross-query invalidation refreshes both `tt-load-detail` and `loads`; inline error state on mutation failure; 5 files / +179 / −25 |
| v3.8.e.1 | `ccfde90` | **Phase 6.1 — SHIPPER approval gate (S-2 backend)** — security gap closed: `Customer.onboardingStatus` now enforced on auth path. New `checkShipperApproval(user, email, req)` helper in `authController.ts`, SHIPPER role only, status-specific friendly messages, defense-in-depth gating at BOTH `handleVerifyOtp` (pre-TOTP) AND `handleTotpLoginVerify` (pre-JWT). AE Console + CARRIER flows unaffected. Build issue caught mid-session: `LogSeverity` enum is `WARNING` not `WARN`. Verified end-to-end with PENDING fixture (`shipper@acmemfg.com`) |
| v3.8.e.2 | `adefc84` | **Phase 6.1 — ShipperSidebar Back-to-Website link** — repointed sidebar `href` from `/shipper` (divergent legacy prospect-landing page) to `/` (homepage), mirroring CarrierSidebar pattern. Surfaced during v3.8.e.1 smoke. The `/shipper` page itself remains untouched — visual alignment is a separate Phase 6 sprint |
| v3.8.ee | `7c74bb1`–`df3545f` | **Phase 6.2 — Lead Hunter / CRM separation** — four-commit sprint closing audit `39de1ad` (Pattern A: unified `customers` table, no read filter, no APPROVED-flip path). (1) `7c74bb1` `feat(backend)` — `customerQuerySchema.context: "crm" \| "prospects"` filter on `GET /customers` partitions on `onboardingStatus`; omitted preserves legacy callers. 6 vitest cases covering crm/prospects/omitted/invalid/coexistence/findMany–count parity. (2) `2fb5279` `feat(backend)` — `POST /customers/:id/approve` (ADMIN/CEO only) with required-checks gate over `taxId`, `creditStatus IN (APPROVED, CONDITIONAL) AND creditCheckDate IS NOT NULL`, `contractUrl`. Returns 422 with `{ missing: [{ field, label, reason }] }` on unmet preconditions. Idempotent on already-APPROVED. Schema migration `20260504000000_add_customer_approval_fields` adds nullable `approvedAt` + `approvedById` (no FK, additive). `updateCustomerSchema` deliberately excludes `onboardingStatus` so PATCH cannot bypass the gate. 9 vitest cases. (3) `0b53cf6` `feat(frontend)` — `/dashboard/crm` passes `?context=crm`, removes `statusOf()` segmentation + four-pill filter bar + per-row status badge + duplicate "Active" StatCard. Inactive (REJECTED/SUSPENDED) view dropped from CRM by design — flagged for Item 8.1 (v3.8.l) to restore in its own context. (4) `df3545f` `feat(frontend)` — new `OnboardingActionBar` mounted in `CustomerDrawer`. Approve mutation, inline missing-checks rendering with brand-tokened palette (success #2F7A4F, warning #B07A1A, danger #9B2C2C). Suspend/Reject open TODO modals (no transitions exist; pairs to v3.8.l). Header status badge rebased off `onboardingStatus` (canonical) instead of free-form `status` text. Note: brand-sweep `22fc84c` (v3.8.dd) interleaved between Phase 4 and Phase 5 — unrelated to this sprint, picked up the next available letter; this sprint shipped under v3.8.ee at close-out |

**Phase 6.1 closed** at v3.8.e.2 (T&T status controls + SHIPPER gate + sidebar link). Total Phase 6.1: 8 files / +342 / −26 across three commits.

**Phase 6.2 closed** at v3.8.ee (Lead Hunter / CRM separation). Total Phase 6.2: 13 files / +634 / −95 across four code commits + this docs commit. Closes audit `39de1ad` and §13.3 Item 6.

**Explicitly excluded from §11** (do not backfill, do not exist in git): v3.4.c, v3.4.k, v3.4.s, standalone v3.5, v3.5.d, standalone v3.6.

### §11 — Architectural finding (cross-cutting, surfaced during v3.8.d sprint, 2026-04-28)

`sanitizeInput` middleware at `backend/src/middleware/security.ts` (registered at `server.ts:150`) was HTML-escaping all `req.body` string values at write time, causing values to be stored encoded in the database (e.g., `equipmentType: 'Dry Van 53&#x27;'` instead of `'Dry Van 53''`). Every human-facing read path required compensating decode logic at the output boundary. Worse, repeated re-saves through the same middleware would multi-encode (`&amp;#x27;`, `&amp;amp;#x27;`, etc.) which one-pass decoders couldn't fully reverse.

**Tactical fix at v3.8.d:** scoped `decodeHtmlEntities` at `/tracking` public serializer; PDFKit's `safe()` already handled PDF rendering.

**Architectural fix at v3.8.d.2:** middleware rewritten to do proper INPUT hygiene only — trim, length-cap, null-byte strip — without OUTPUT encoding. Output-layer escaping moved to where it belongs:
- HTML rendering → React's automatic JSX escaping
- PDF rendering → PDFKit's `safe()` decode at the boundary
- JSON APIs → JSON-encoding handles its own char-set; no HTML escaping needed

**Pattern for new surfaces:** any new customer-facing surface that reads from the database must NOT assume strings are clean if any pre-v3.8.d.2 data may be present. Use `decodeHtmlEntities` defensively until a full data audit confirms clean. v3.8.d.2 included a one-time decode script at `backend/scripts/decode-encoded-load-fields.ts` (idempotent, multi-pass-safe per v3.8.d.3 update) for cleanup of legacy encoded data.

**Lesson for future architectural decisions:** input-time HTML escaping is double-escape on output anyway (templating engines auto-escape). Defense-in-depth is good; doing the same defense twice in different layers is corruption.

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

Sequenced backlog. Ordering is deliberate: items earlier in the list should be done before items later.

### §13.1 Active state

Phase 6.2 closed at v3.8.ee (Lead Hunter / CRM separation). No active sprint. Phase 6.3 awaiting scoping.

### §13.2 Pre-Phase-6.2 housekeeping

Should complete before next sprint kickoff:

1. **Migration script run against prod** — `backend/scripts/decode-encoded-load-fields.ts`. Idempotent, multi-pass-safe. Walks 19 fields on loads table, decodes pre-v3.8.d.2 encoded values in place. Run once and confirmed clean (4 loads decoded incl. one 6-times-encoded outlier) on 2026-04-29; **rerun if any pre-v3.8.d.2 data is still suspected** in surfaces beyond the loads table.

2. ~~**Phase 5E.c — T&T source-of-truth scoping decision**~~ — **CLOSED 2026-04-30** at "current-state documented; future-state explicitly deferred with named triggers" level. See [`docs/architecture/track-and-trace-source-of-truth.md`](docs/architecture/track-and-trace-source-of-truth.md) v1.0. Documents canonical source (`Load.trackingEvents[]`), write paths, auth boundaries, PII scope on public /tracking, display granularity vs. industry public-tracker patterns (RXO/Coyote Camp 2 vs. C.H. Robinson Camp 1), 5 deferred future-state decisions with named reopen triggers, 3 risks with mitigations, 4 implicit architectural decisions surfaced for searchability. Phase 5E gaps #1 + #2 already closed via the live `/tracking` page discovered during v3.8.c verification; gap #3 closed by this document. Phase 5E now fully closed.

### §13.3 Phase 6.2 sprint candidates

Each is a discrete sprint. Mix of operational, security, UX, and technical debt. Pick deliberately.

**Operational (impacts daily AE workflow):**

3. **EditLoadModal — post-conversion load edit UI.** Backend has the capability via `PUT /loads/:id` (authorized BROKER/ADMIN/CEO/DISPATCH); frontend has zero callers. The Order Builder's converted-order banner (v3.8.d.3) warns "Editing here will not change the dispatched load" — true, because the form writes to `order.formData`, never to the live Load. When customers change PO/weight/window/commodity post-conversion, ops staff has no UI path to update — only cancel+recreate, dev-tools API call, or DB edit. **Pre-sprint scoping required:** status-by-field permission matrix (e.g., can origin/dest change at BOOKED? can pickup time change at DISPATCHED? what's locked at IN_TRANSIT?). Effort: 100–200 lines, single sprint.

4. **Order Builder origin/destContactName + Phone capture.** Closes the `Contact: — · —` gap visible on every BOL printed this week. Order Builder doesn't capture facility-level contact info today; BOL template renders em-dash fallback. 4 new form fields, wire to existing schema fields, BOL renders correctly via existing v3.8.d.1 binding. Effort: ~30–50 lines.

5. ~~**BOL page-1 footer collision**~~ — **CLOSED 2026-04-30 in v3.8.h**. Single-line `fyLine` coordinate fix (755 → 770) in `pdfService.ts`. Page-2 footer shifted identically since both reuse the same constant. All 9 signature fields preserved at original column positions.

**Security / Portal completeness:**

6. ~~**Portal Approval UI S-3**~~ — **CLOSED 2026-05-04 in v3.8.ee** (Phase 6.2 Lead Hunter / CRM separation sprint). Scope expanded mid-sprint to bundle the CRM read-filter gap from audit 39de1ad: (a) `?context=crm` filter on `GET /customers` so prospects no longer appear in CRM (commit `7c74bb1`); (b) `POST /customers/:id/approve` endpoint with required-checks gate over TIN, credit, contract preconditions, returns 422 with missing-checks payload (commit `2fb5279`, includes additive `approvedAt` + `approvedById` schema migration); (c) CRM page passes `?context=crm`, removes redundant client-side `statusOf()` segmentation and the four-pill filter bar (commit `0b53cf6`); (d) AE Console `OnboardingActionBar` mounted in `CustomerDrawer` — Approve / Suspend / Reject buttons with inline missing-checks rendering, brand-token styled (commit `df3545f`). Approve UI lives on the existing `/dashboard/crm` customer detail surface rather than a new `/dashboard/shippers` surface — the Drawer pattern is the AE-facing customer detail today. Suspend / Reject open TODO modals because no backend transitions exist yet — wires to Item 8.1 (v3.8.l customer inactivation). "Shipper application under review" UX page paired requirement is still open and tracked separately. The original §13.3 Item 6 scope (approve button only) was extended to the four-commit sprint after the audit surfaced the read-filter half of the bug.

7. **Credit check integration** — service TBD (Experian Business, D&B, manual SOP). Once picked, wire into S-2 gate as prerequisite for APPROVED status. Decision needed before implementation.

8. **Carrier self-service onboarding UI** — upload COI / W9 / Authority letter, view application status. Schema supports flags (`w9Uploaded`, `insuranceCertUploaded`, `authorityDocUploaded`) but no carrier-facing UI exists. Required to move from carrier "under review" dead-end to actionable workflow.

**Dispatch lifecycle controls — pairs with v3.8.j (post-conversion):**

8.1. **v3.8.l — Customer inactivation workflow.** Surfaced 2026-05-01. Today there are FOUR orthogonal "status-like" fields on Customer (`status` free-form string default "Active", `onboardingStatus` enum with SUSPENDED option, `creditStatus`, plus linked `User.isActive`) — none of which combine into a canonical "Inactivate Customer" action. CRM Profile editor lets AE type any string into `customer.status` but it's a label only, not a gate; flipping `onboardingStatus` to SUSPENDED is the actual SHIPPER-portal login gate (v3.8.e.1) but no CRM UI exposes that flip; soft-delete via `DELETE /customers/:id` works but is heavier than "inactive." Critical gap: **no path prevents AE from creating new loads against an inactive customer.** Order Builder + convert-to-load do not check any customer status field. Sprint shape: new schema fields `customer.isActive: Boolean` + `inactivationReason: String?` + `inactivatedAt: DateTime?` + `inactivatedById: String?`; single canonical "Inactivate Customer" UI action that (a) blocks new load creation for inactive customers (with ADMIN/CEO override), (b) silences notification services, (c) optionally cascades to `User.isActive=false` and/or `onboardingStatus=SUSPENDED`, (d) renders a visible CRM banner with reason, (e) writes audit log entry. ~150-200 lines + 1 schema migration. Pairs naturally with Item 6 (Portal Approval UI S-3) since both touch customer-status workflow.

8.2. **Cancelled loads tab on Load Board.** Surfaced 2026-05-01. Today cancelled loads are excluded from the default Load Board via `activeOnly=true` filter (`status notIn ['DELIVERED', 'POD_RECEIVED', 'INVOICED', 'COMPLETED', 'TONU', 'CANCELLED']` at `loadController.ts:365`) AND `StatusTab` enum doesn't include `"CANCELLED"`. Loads still exist in DB (not soft-deleted) but UI doesn't expose them — common ops questions like "what was the cancellation reason for L1234?" require API/DB access. Sprint shape: extend `StatusTab` to include `"CANCELLED"`, add tab button with count, when active pass `?status=CANCELLED&include_deleted=false` to backend (drop `activeOnly=true` for that case). Bonus: surface `cancellationReason` field on the row. ~30-50 lines, single file (loads/page.tsx). No backend changes needed.

8.2.1. **Document `sales@silkroutelogistics.ai` alias in §1 (small docs sprint).** Surfaced 2026-05-02 during v3.8.m crawlability audit. Reference exists in [`frontend/public/ae/communications.html:71`](frontend/public/ae/communications.html#L71) — labeled as the inbound prospect/lead reply address — but `sales@` isn't documented in CLAUDE.md §1's canonical email list (which has `whaider@`, `accounting@`, `compliance@`, `noreply@`, `operations@`). Same pattern as the 2026-05-01 `operations@` documentation gap. Decision needed: (a) document `sales@` as a canonical alias parallel to `operations@` with explicit current-routing-target (likely `→ whaider@` until first hire); OR (b) replace with `operations@` and remove the standalone `sales@` references; OR (c) replace with `whaider@` for pre-revenue clarity. Sprint shape: ~5 lines in CLAUDE.md §1, possibly +1 line in /ae/communications.html if option (b) or (c). Deferred per directive — not rolled into v3.8.m or v3.8.n. Tiny sprint, slot whenever convenient.

8.2.2. **CRM facility form missing operating-hours inputs.** Surfaced 2026-05-02 from CRM walkthrough screenshot. `CustomerFacility.operatingHours: Json?` exists in schema ([prisma/schema.prisma:2053](backend/prisma/schema.prisma#L2053), keyed by weekday with `{open, close}` per day) but the CRM facility-creation form ([frontend/src/app/dashboard/crm/tabs/FacilitiesTab.tsx](frontend/src/app/dashboard/crm/tabs/FacilitiesTab.tsx)) has zero references — operatingHours is never written. AE creates facilities with name, address, contact, dock info, primary flag, lumper info, special instructions — but no hours. **Prerequisite for §13.3 Item 20 (Order Builder G facility-hours auto-populate)** — that item reads `operatingHours` to auto-fill PU/DEL window times, but the field is null on every existing facility because the form doesn't capture it. Same architectural pattern as v3.8.j and 8.3 (data plumbing exists, UI doesn't connect). Sprint shape: 7-day input grid (Mon-Sun) with open/close time inputs per day, "Closed" toggle per weekday, optional "24/7" toggle for distribution centers; serialize to JSON `{ monday: { open: "08:00", close: "17:00", closed: false }, ... }`; read existing JSON in edit mode. ~80-120 lines, single file (FacilitiesTab.tsx). Pairs naturally with Item 20 — could ship as a duo (this sprint captures the data, Item 20 uses it). **See also 8.2.3** (facility row missing Edit action) — recommend shipping 8.2.2 + 8.2.3 as ONE combined sprint since both touch the same component + form, ~120-180 lines combined.

8.2.3. **CRM facility row missing Edit action.** Surfaced 2026-05-02 from CRM walkthrough — facility row in customer profile shows ONLY a "Remove" button. No way to update name, address, contact, dock info, primary flag, lumper info, special instructions, or load type once the facility is created. Backend is fully wired: `PUT /customers/:id/facilities/:facilityId` exists at [`backend/src/routes/crmCustomer.ts:138`](backend/src/routes/crmCustomer.ts#L138) with 404-guard via `findUnique` then `prisma.customerFacility.update`. Frontend [`FacilitiesTab.tsx`](frontend/src/app/dashboard/crm/tabs/FacilitiesTab.tsx) only wires `useQuery` for read, `del` mutation for DELETE, and the Add form for CREATE. **Zero update mutation, zero edit-mode UI.** Same architectural pattern as 8.2.2 (operating-hours form gap), §13.3 Item 8.3 (notification routing), v3.8.j (tender workflow): backend complete, UI incomplete. **Tightly coupled with 8.2.2** — both touch the same component (FacilitiesTab.tsx) and both need the form to be shared between create + edit modes (e.g. `editingFacilityId: string | null` state + form-mode prop). Sprint shape: ship 8.2.2 + 8.2.3 as ONE combined sprint — refactor the existing add-facility form into a Create/Edit shared form, wire `PUT /customers/:id/facilities/:facilityId` mutation, add Edit button alongside the existing Remove on each row, support pre-populating fields from the existing JSON (including the new operatingHours inputs from 8.2.2). Combined effort: ~120-180 lines, single file. Splitting them risks two passes through the same component.

8.3. **Wire shipper notifications through `CustomerContact[]` with role-based routing.** Surfaced 2026-05-01 during BKN email recipient audit. Today both `shipperLoadNotifyService` (pickup/transit/arrived/delivered) and `shipperNotificationService` (milestone/pickup/delivery/POD) bypass the `CustomerContact[]` relation entirely — they read from `Load.contactEmail` (priority) then `Customer.email` (fallback), both single-field columns. The CRM contact list (with role tags like AP/Logistics/Procurement and `doNotContact` flag) is decoupled from the actual notification path. Net effect: AE can carefully maintain a multi-contact CRM list and **none of those rows affect who actually receives shipment notifications**. Same class of architecture bug as v3.8.j (data plumbing exists but UI/code don't connect). Sprint shape: add a contact-resolution helper that routes by role tag — pickup/transit/delivery → `OPERATIONS`/`LOGISTICS`-tagged contacts, invoice → `AP`/`BILLING` contacts, quote/RFP → `PROCUREMENT` contacts; fall back to `Customer.email` only when no role-tagged contact exists; honor `doNotContact` flag per row. Touches both notification service files + 1 helper. ~150-200 lines, single sprint.

**Dispatch lifecycle controls — pairs with v3.8.j (post-conversion):**

8.4. **v3.8.k — Dispatch method switching UI.** Surfaced 2026-04-30 alongside v3.8.j tender-workflow audit. Backend has the plumbing: `Load.dispatchMethod` is a writable field (`waterfall` / `loadboard` / `direct_tender` / `dat`), `PUT /loads/:id` accepts `createLoadSchema.partial()` so the field can be patched, and a `dispatch_method_changed` event type already exists in `waterfallEventService.ts:26`. Frontend has zero callers — once a load is created via Order Builder's 4-button picker, dispatch method is locked for the load's lifetime with no UI to change it. Operations gap: when the chosen method isn't producing results (e.g., waterfall has no eligible carriers, or a direct-tender carrier declined), AE has no UI path to switch dispatch method without DB edit or full cancel+recreate. **Sprint shape:** add a "Change dispatch" dropdown on Load Board row (or in load detail drawer) with confirmation dialog ("This will cancel 3 pending tenders. Continue?"); backend handles atomic side effects per direction:
   - **Loadboard → Waterfall:** set `dispatchMethod='waterfall'` + `visibility='waterfall'` (hides from open loadboard) + `buildWaterfall(loadId, { mode: 'full_auto' })` + `startWaterfall(wf.id)`. Decision needed: cancel any OFFERED/COUNTERED tenders from the loadboard era OR leave them?
   - **Waterfall → Loadboard:** set `dispatchMethod='loadboard'` + `visibility='open'` + halt active waterfall (mark WaterfallRun halted, cancel pending OFFERED tenders to stop their 20-min windows ticking). Now visible on open Load Board to all approved carriers.
   - Same shape for direct_tender ↔ any, and dat ↔ any. ~150-200 lines, single sprint. Naturally pairs with v3.8.j (tender-workflow consolidation) since both are post-conversion dispatch lifecycle controls — could ship as a paired duo.

**Tier A reclassifications from `audit-completeness.ts` orphan-endpoint triage (2026-05-02):**

8.5. **Frequent-addresses wire-up — `PATCH /address-book/:id/use`.** Surfaced 2026-05-02 from `audit-completeness.ts` Phase A verification of Tier C orphan endpoints. Backend endpoint at [`backend/src/routes/addressBook.ts:133`](backend/src/routes/addressBook.ts#L133) increments `usageCount` and updates `lastUsedAt` on an address book entry — fields that exist in schema but stay zero forever because nothing calls the endpoint. Originally triaged Tier C on the assumption that an autocomplete/picker called it on selection; Phase A grep across `frontend/src/` returned zero hits. Reclassified Tier A — needs deliberate UI integration. Sprint shape: (a) decide which surface owns the address-book picker (Order Builder origin/dest fields are the obvious candidate); (b) on selection, fire `PATCH /address-book/:id/use` to bump usage; (c) sort picker results `usageCount DESC, lastUsedAt DESC` so frequent picks float to top. Without this wire-up, the schema fields remain dormant and the "frequent" UX value never materializes. ~30-50 lines, single sprint.

8.6. **Carrier preference manual override admin UI — `PUT /ai/preferences/:carrierId`.** Surfaced 2026-05-02 from `audit-completeness.ts` Phase A verification. Backend endpoint at [`backend/src/routes/ai.ts:335`](backend/src/routes/ai.ts#L335) is the manual override path for carrier preferences (operations correcting an auto-learned preference, e.g., "carrier won't take refrigerated despite history" or seeding initial preferences before the auto-learner has data). Originally triaged Tier C on the assumption that an admin tool fired it. Phase A grep returned zero callers. Critically, the auto-learner at [`carrierPreferenceService.ts:188`](backend/src/services/carrierPreferenceService.ts#L188) writes Prisma directly and bypasses the HTTP endpoint entirely — so the endpoint is purely the manual-override path, not the auto-write path, which is exactly why it has zero auto-callers AND zero UI callers. Reclassified Tier A. Sprint shape: small admin-only panel under `/admin/*` (or carrier detail view) exposing the writable preference fields (preferred lanes, equipment types, blackout regions, etc.) with a "Save manual override" action calling the existing endpoint. Must NOT touch the auto-learner — manual override should override auto-learned values, with timestamp/actor audit-log entry per change. ~80-120 lines, single sprint.

8.7. **Manual tag-management UI — `POST` + `DELETE /tags/assign`.** Surfaced 2026-05-02 from `audit-completeness.ts` Phase A verification. Backend endpoint pair at [`backend/src/routes/tags.ts:44,49`](backend/src/routes/tags.ts#L44) calls into [`tagService.ts`](backend/src/services/tagService.ts) — `assignTag()` at line 33 and `removeTagAssignment()` at line 41. Originally triaged Tier C on the assumption that some internal caller exercised the HTTP path. Phase A verification: HTTP endpoints have zero frontend callers; HOWEVER `assignTag()` IS called internally at [`tagService.ts:80`](backend/src/services/tagService.ts#L80) by the `autoTagEntity` rule engine via an apply-all path — so the underlying service functions are alive even though the HTTP endpoint pair is dead from a UI perspective. Decision locked (Option A): keep both endpoints AND build the missing manual tag-management UI. Rationale: the auto-tagger is a rules engine; manual override (add a tag the rules missed, remove a tag the rules misfired on) is a load-bearing operations capability. Sprint shape: small tag-management panel surfaced wherever tag-bearing entities render (load detail, customer detail, carrier detail) with "Add tag" + "Remove" actions; POST hits `/tags/assign`, DELETE hits `/tags/assign`. **Critical:** do NOT remove `assignTag()` or `removeTagAssignment()` service functions even if the HTTP endpoints stay dormant — the auto-tag rule engine depends on them. ~80-120 lines, single sprint across one shared component.

**Triage correction note (2026-05-02).** The initial Tier S/A/B/C/D bucketing of the 27 orphan endpoints surfaced by [`backend/scripts/audit-completeness.ts`](backend/scripts/audit-completeness.ts) classified four endpoints as Tier C ("internal-only fired, no UI needed") on the hypothesis that they had non-frontend callers somewhere in the codebase. Phase A read-only verification falsified that hypothesis for all four: `PATCH /address-book/:id/use` (Item 8.5 above), `PATCH /shipments/:id/location` (covered by existing Phase 5E.c Decision 4.1, no new entry), `PUT /ai/preferences/:carrierId` (Item 8.6 above), and `POST` + `DELETE /tags/assign` (Item 8.7 above) all returned zero callers across `backend/src/` and `frontend/src/`. The endpoints are dormant, not internally-fired. Reclassified to Tier A. Total orphan count remains 27 (no audit suppression comments applied). Lesson recorded for future `audit-completeness.ts` runs: "no caller found" is a triage signal, not an auto-classification — every finding requires human verification of caller intent before bucketing. The two service functions in tagService.ts (`assignTag`, `removeTagAssignment`) must NOT be removed as part of any future cleanup — `autoTagEntity` depends on them.

**Authority-block hygiene (surfaced 2026-05-04 during v3.8.x Lead Hunter MC# correction):**

8.8. **MC# leading-zero correction across all SRL surfaces.** Surfaced 2026-05-04. The canonical FMCSA authority is **MC# 1794414** (per brand-skill `voice.md:98`); the propagated typo `MC# 01794414` appears in 17 files outside the Lead Hunter outreach SOT (which was corrected in v3.8.x). Audit-confirmed surfaces: 10 public HTML pages ([about](frontend/public/about.html), [blog](frontend/public/blog.html), [careers](frontend/public/careers.html), [carriers](frontend/public/carriers.html), [contact](frontend/public/contact.html), [faq](frontend/public/faq.html), [index](frontend/public/index.html), [privacy](frontend/public/privacy.html), [shippers](frontend/public/shippers.html), [terms](frontend/public/terms.html)) + 2 chrome assets ([_partials/footer.html](frontend/public/_partials/footer.html), [site-chrome.json](frontend/src/lib/site-chrome.json)) + 4 backend PDF services ([compassPdfService](backend/src/services/compassPdfService.ts), [pdfService](backend/src/services/pdfService.ts), [sopPdfService](backend/src/services/sopPdfService.ts), [insuranceVerificationService](backend/src/services/insuranceVerificationService.ts) — `insuranceVerificationService` carrier-email body separately from the carrier-fraud-banner copy) + [BOLTemplate.tsx](frontend/src/components/templates/BOLTemplate.tsx) + CLAUDE.md §1 self-reference. **Audit-first per §3.13** — verify against FMCSA SAFER record before sweep, even though `voice.md` is internal canonical. Rendered-output verification per §3.2 required on each public page after sweep (curl + grep deployed `silkroutelogistics.ai`, not local files). DOT# 4526880 verified clean — no leading-zero variant exists. Sprint shape: pairs naturally with Item 8.9 (authority-block centralization) — could ship as one sprint. Effort: ~30 surgical edits + curl/grep verification on 10 public pages + 1 docs-only commit for CLAUDE.md §1. Single sprint, 60-90 min including verification.

8.9. **Signature/authority block centralization.** Surfaced 2026-05-04 alongside Item 8.8. Today MC#/DOT#/bond/contingent-cargo/contact info is hard-coded inline at every print surface (PDF services, BOL template, public-page footers, carrier-fraud banner, insurance verification email body, internal AE Console). v3.8.w established `CEO_NAME` + `CEO_EMAIL` SOT in [`backend/src/email/builder.ts`](backend/src/email/builder.ts) for outbound email; the same pattern should cover the full authority block. Sprint shape: new shared module (e.g. `backend/src/config/authority.ts` exporting `MC_NUMBER`, `DOT_NUMBER`, `BOND_AMOUNT`, `BOND_SURETY`, `CONTINGENT_CARGO`, `PHONE`, `OPERATIONS_HOURS_LONG`, `OPERATIONS_HOURS_SHORT`); analogous `frontend/src/lib/authority.ts` for non-public client surfaces; chrome partial reads from `site-chrome.json` (already structured). Public HTML pages can reference the chrome-partial-injected values rather than hard-coded copies. Pairs with Item 8.8 — sweep + centralization is one architectural step, then any future MC# correction is one-edit. Out-of-scope but worth noting: the §1 CLAUDE.md authority list and `voice.md:98` are documentation SOTs (intentional, not code-consumed) — those stay as-is and are themselves the verification source. Effort: medium sprint, ~150-250 lines + the file-by-file replacement of inline strings with imports. Suggested timing: bundle with Item 8.8 to avoid two passes.

8.10. **Backfill prisma/migrations file for ProspectVertical schema change.** Surfaced 2026-05-04 during v3.8.v–v3.8.cc Lead Hunter sprint Step 4 verification. v3.8.aa (C4 commit [`6e2e6d9`](commit/6e2e6d9)) applied the `ProspectVertical` enum + `Customer.vertical` column via `prisma db push` directly to Neon. No migration file exists in [`backend/prisma/migrations/`](backend/prisma/migrations/). Production currently works because the live Neon DB matches the regenerated Prisma client — but a fresh DB clone (staging branch, dev workstation reset, disaster-recovery rebuild) will not pick up the enum + column from `migrate deploy` because there is no migration file to apply. **Risk profile: recovery-time gap, not runtime.** The Render `buildCommand` runs `npx prisma migrate deploy` on every deploy, which will be a no-op for this change because Neon already has it; the runtime `@prisma/client` is regenerated from the schema file and matches. Failure mode is invisible until someone resets a database from migrations alone, at which point the new enum + column will be missing and the type-system promise the client exports will diverge from the live schema. **Fix shape:** generate the missing migration file from the current schema diff using `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` (or against a baseline that excludes only the C4 change), place the resulting SQL in `backend/prisma/migrations/<timestamp>_add_prospect_vertical/migration.sql`, commit docs-only. **Test:** clone Neon to a staging branch, run `npx prisma migrate deploy` against it from scratch, confirm `ProspectVertical` enum exists and `customers.vertical` column exists with default `UNKNOWN`. Render's next prod build should be a no-op because Neon already has the schema. **Pairs with Items 8.6/8.7 audit hygiene** — both are recovery-time-gap issues that don't surface until you actually need to recover. Effort: small (~15-30 min including staging-clone test). Tracked here so the gap is closed in a dedicated mini-sprint, not silently absorbed. **Future-proofing:** the broader CLAUDE.md §2 directive to "avoid `prisma migrate dev`" because migration history has drift is itself a long-term risk; consolidating to a single baseline migration + going-forward migrate-deploy discipline is a separate architectural sprint outside Item 8.10's scope.

**UX / Visual:**

9. **`/shipper` landing page divergence** — page diverges from marketing-site visual system (dark theme vs cream, separate brand expression). Two options: redesign to match, OR delete entirely if homepage `/shippers.html` covers same intent. v3.8.e.2 fixed the sidebar link so authenticated shippers don't land here accidentally; this is the underlying page itself. Tracked in `regression-log.md` under "Phase 6 — Portal + Public Page Visual Alignment".

10. **Theme system root fix** — `[data-mode="light"] .text-slate-*` `!important` overrides in `globals.css` (lines 162–173). Current scheme remaps dark-mode Tailwind text classes in light mode, which backfires on modals/panels with hardcoded dark backgrounds. Options: scope overrides to exclude dark-surface containers, OR remove global remap and theme components explicitly, OR adopt `.dark-surface` opt-in class. Affects 14+ surfaces.

**Production reliability (added during v3.8.e.1 verification):**

11. **CSP allowlist completeness** — multiple CSP violations observed: `script-src` blocks Sentry inline scripts; `worker-src` not explicitly set, blocking blob: workers; `connect-src` doesn't include `*.ingest.sentry.io` (errors in production SHIPPER sessions go uncaptured by Sentry). Phase 6 fix: audit and update CSP allowlist in `securityHeaders` config.

12. **React #418 hydration mismatch on `/auth/login`** — observed in console: "Hydration failed because the initial UI does not match what was rendered on the server." Server/client render divergence. Production-reliability concern.

**Architectural debt (defer until ops stable):**

13. **Load Board "New Load" modal vs. Order Builder overlap** — Load Board `+ New Load` (`CreateLoadModal`, 4-step wizard, ~15 fields) duplicates Order Builder (~40 fields with facility lookups, PU/DEL windows, dispatch method, pricing intelligence, tender configuration). Two surfaces for one task. Flagged in regression-log.

14. **Convert-to-load architectural refactor** — `routes/orders.ts:242-338` writes directly via `prisma.load.create` instead of calling controller. v3.8.c added `buildLineItems` export as bandaid; long-term refactor would route through `loadController.createLoad`. Also affects `shipperPortalController:816` and `emailToLoadService:470` (other Load write paths with same bypass pattern).

15. **`carrierAuth.ts` duplication with shared `authController.ts`** — password-expiry, TOTP, session registration are duplicated. Only the approval gate is carrier-specific. Refactor candidate once portal patterns stabilize.

16. **`CarrierProfile.onboardingStatus` vs. `status` enum redundancy** — two overlapping status enums on same model. Only `onboardingStatus` gates login. Consolidate or document the divide.

17. **BOL multi-line page-2 dynamic rendering** — v3.8.d caps page-1 at 10 rows with overflow footer. For loads exceeding cap, page 2+ should render the overflow with proper pagination (header/footer carried, totals on final page). Apollo-shipped loads will be 1–3 lines in practice so cap is defensive only.

**Smaller cleanups:**

18. **NMFC catalog + density-based class auto-suggest** — Order Builder enhancement. Lookup table for NMFC numbers by commodity. Density calculation from L×W×H + weight → suggest freight class.

19. **Order Builder F: PU/DEL window time inline with dates** — current Route section renders pickup-date + window across two rows; AE requested date + window on one row.

20. **Order Builder G: CRM facility operating-hours auto-populate** — when origin/dest facility is picked via `FacilityPicker`, read `CustomerFacility.operatingHours` for the pickup/delivery weekday and auto-fill window times. Partial implementation observed during v3.8.c testing; needs full coverage + edge cases. **Prerequisite: §13.3 Item 8.2.2** (CRM facility form must capture `operatingHours` first — today the field exists in schema but is never written, so Item 20's auto-populate has nothing to read).

21. **Load number sequence reformatting (start at L10012)** — Wasi-requested during v3.8 epic, deferred. Affects all existing references, purely cosmetic. Phase 6 cleanup if at all.

22. **Working tree noise** — multiple `package-lock.json` modifications, `my-knowledge-base/**` mods, `.claude/settings.local.json`, IDE 0-byte placeholders. Pre-existing noise. `git stash` before each new feature commit. Add to `.gitignore` where appropriate.

23. **AE Console "super dark" tabs (S6 family P1)** — UI track, separate from BOL/tracking. Open since pre-v3.7. Either resurrect and finish, or formally retire.

24. **`/accounting/approvals` naming collision** — route is for carrier payment-settlement approvals (AR), but "approvals" reads as portal approval. Rename to `/accounting/payment-approvals` when next touched.

25. **Orphan marketing pages in `frontend/public/`** — `login.html` + `register.html` at root alongside `auth/login.html` and `auth/register.html`. Decide canonical, redirect duplicates.

26. **Dead `.login-dropdown` CSS block** in `utilities.css` (lines 191–238). Likely abandoned redesign remnant. Remove once confirmed unused.

27. **MEMORY.md** — audit existence + currency, update or formally retire. Per §13 historical reference.

**CI / Testing gaps:**

28. **E2E smoke tests for SHIPPER/CARRIER portal login flows** — the 2026-02-23 → 2026-04-23 regression went undetected for 2 months because no such test exists. Cypress or Playwright. Min coverage: valid creds → OTP → reach dashboard; invalid creds rejected; OTP expiry. The v3.8.e.1 SHIPPER gate is now an additional case requiring coverage (PENDING blocked, APPROVED passes).

29. **CI regression assertion on auth store usage** — unit test asserting `useAuthStore.token` and `useCarrierAuth.token` are never used as auth guards in dashboard layouts (grep-based lint). Would have caught the 172d6f3b regression at commit time.

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
- **`LogSeverity` enum uses `WARNING`, not `WARN`** — non-standard naming. Caught during v3.8.e.1 build (TS2322 error: `'WARN' is not assignable to LogSeverity`). Most observability platforms (Datadog, Sentry, Pino, Winston) use `WARN`. If logging infrastructure is migrated, the enum mismatch will resurface — worth normalizing during any logging refactor. Today: always write `WARNING` when constructing SystemLog records.

---

## §16 FIRST-CARRIER ONBOARDING BLOCKERS (pre-launch, must resolve before first carrier signs)

1. **Broker-Carrier Agreement base document** — create as standalone `.docx` referenced by Quick Pay Agreement v2
2. **Michigan commercial attorney review of Caravan Quick Pay Agreement v2** ($400–$800 budget)
3. **DAT load board registration** activation
4. **Carrier onboarding welcome email final verification** before first real carrier touches it (v3 language confirmed at `routes/carriers.ts:614` in v3.7.h; re-verify before go-live)
5. **`compliance@silkroutelogistics.ai` alias monitoring cadence** confirmed (published on CarrierFraudBanner since v3.7.e)
6. **Insurance verification** — contingent broker coverage via PFA Protects + LOGISTIQ Broker Shield. Confirm policies active, not just in application state.

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
- Compass Engine is a **35-point carrier vetting system**. Never describe as "AI-powered market intelligence" (per voice.md line 25 prohibition).
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
  - Compass Engine described correctly (35-point carrier vetting), never "AI-powered market intelligence".

Implementation guidance for Lead Hunter system prompts (touch1ColdChainTemplate, touch1WellnessTemplate, fallback): the system prompt must explicitly enumerate the banned constructions in §18.9 above and instruct the model to self-check before output. The audit is also applied at the test/preview stage — Little Spoon and MERIT preview render must pass §18.9 audit, not just §18.8 honest-framing.

For manual outreach (founder-drafted in Gmail, not Lead Hunter generated): same audit applies. Run it mentally before send. The discipline is the writer's, not the platform's.

---

## Appendix: Legacy / Custom Sections

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
