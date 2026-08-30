# Typography Audit — what font actually renders, everywhere

**Date:** 2026-08-30 · **Scope:** every public route + all four portals · **Method:** live production, cache-busted · **Source changes: none.** This is a read-only audit; every root cause below is UNVERIFIED and belongs to a correction command.

---

## 1. Ground truth — what the brand skill mandates

From `.claude/skills/srl-brand-design/references/tokens.md` §8, mirrored verbatim in `scripts/srl_tokens.css:82-85`:

| Layer | Canonical stack |
|---|---|
| **Display / headings** | `'Playfair Display', Georgia, 'Times New Roman', serif` |
| **Body / UI** | `'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif` |
| **Tagline only** | `Georgia, 'Times New Roman', serif` |
| **Mono** | `'SF Mono', Menlo, Consolas, monospace` |

Per-layer application, from the same section:

- Hero / page title → **Playfair 700**
- Section heads → **Playfair 700**
- Body → **DM Sans 400**
- Small-caps labels → **DM Sans 500**
- Tagline → **Georgia italic** (reserved: "Where Trust Travels." and ceremonial moments only)
- Load IDs / MC# / PRO# → **SF Mono**

Allowed weights: Playfair 400/700 only (italic permitted for taglines); DM Sans 400/500/700. **No other family is in the canon.** Georgia is tagline-only — it is not a general-purpose serif.

---

## 2. Page-count reconciliation

Both numbers, as instructed. They differ, and the difference is itself a finding.

| Count | Value | Basis |
|---|---|---|
| App-router source routes | **114** | `find src/app -name page.tsx` |
| Exported HTML in build output | **131** | `find out -name '*.html'` |
| `public/` HTML pages | **17** | 14 marketing + 3 auth orphans (`_partials/` excluded — fragments, not pages) |

131 = 17 overlapping names + 114 React-only exports. **There is no `src/app/page.tsx`** — `/` is not a Next.js route at all; it is `public/index.html`, on a completely separate font chain (§4.1 vs §4.2).

**Shadow finding.** `public/auth/login.html`, `public/auth/forgot-password.html`, and `public/auth/reset-password.html` share paths with React routes. Verified in the build output — `out/auth/login.html` carries `<body class="__variable_0d7163 __variable_6b3ed8 __className_0d7163">`, i.e. the React build overwrote the static file. All three static orphans are **dead** (§3.6 route shadowing). They carry no Google Fonts link and only `font-family:monospace`; they render nowhere.

---

## 3. Method, and its limits

Every fetch cache-busted (`?cb=$(date +%s)` plus `Cache-Control: no-cache`) against `https://silkroutelogistics.ai`. Fonts resolved by reading the served CSS and tracing the cascade, not from recollection.

**Emails are out of scope** — inline-styled, separate system. A scoping decision, not an omission: the ~20 `font-family` declarations across `emailService.ts`, `emailTemplates.ts`, and the onboarding lifecycle mails were seen and deliberately excluded.

**Two limits, stated because they bound the verdict:**

1. **No headless browser here.** "Resolved font" is derived from the served CSS cascade, not `getComputedStyle`. The chain is short and fully quoted below, but a browser pass would be strictly stronger evidence.
2. **Prerendered HTML undercounts client-rendered routes.** Counting `font-serif` in served HTML returns 0 for every dashboard — because those headings live in the JS bundle, not the SSG'd shell. Reporting that as clean would have been a false negative. Source counts are used for those routes instead, and the two are labelled separately below.

**An instrument failure worth recording (§19 Sub-pattern 17).** My first CSS sweep used a single-line regex — `[^{}]*{[^{}]*font-family:[^{}]*}` — and reported **zero** `font-family` rules in `utilities.css`. There is one, at line 350, formatted across multiple lines. The negative was an artifact of the pattern's reach, and it surfaced only on a second read with a different method. Every negative in this report was re-checked with a plain line-grep.

---

## 4. The table — page × layer × resolved font × conforms

### 4.1 Static marketing pages (14) — served from `public/`

All 14 carry the identical injected block (`scripts/inject-chrome.mjs:49-54`): two preconnects, `fonts.googleapis.com/css2?family=Playfair+Display:...&family=DM+Sans:...`, and `/shared/css/srl-tokens.css`. Verified live: **14/14 present, HTTP 200, Google CSS reachable.** `srl-tokens.css` is deployed and defines all four canonical vars correctly.

| Page | Headings | Body | Footer col headings | Mono | Conforms |
|---|---|---|---|---|---|
| `/` | Playfair ✅ | DM Sans ✅ | **generic sans-serif** ❌ | SF Mono ✅ | **NO** |
| `/shippers` | Playfair ✅ | DM Sans ✅ | **generic sans-serif** ❌ | — | **NO** |
| `/carriers` | Playfair ✅ *(one exception ↓)* | DM Sans ✅ | **generic sans-serif** ❌ | — | **NO** |
| `/about` | Playfair ✅ | DM Sans ✅ | **generic sans-serif** ❌ | — | **NO** |
| `/contact` | Playfair ✅ | DM Sans ✅ | **generic sans-serif** ❌ | — | **NO** |
| `/faq` | Playfair ✅ | DM Sans ✅ | **generic sans-serif** ❌ | — | **NO** |
| `/blog` | Playfair ✅ | DM Sans ✅ | **generic sans-serif** ❌ | — | **NO** |
| `/careers` | Playfair ✅ | DM Sans ✅ | **generic sans-serif** ❌ | — | **NO** |
| `/track` | Playfair ✅ | DM Sans ✅ | **generic sans-serif** ❌ | — | **NO** |
| `/terms` | Playfair ✅ | DM Sans ✅ | **generic sans-serif** ❌ | — | **NO** |
| `/privacy` | Playfair ✅ | DM Sans ✅ | **generic sans-serif** ❌ | — | **NO** |
| `/security-policy` | Playfair ✅ | DM Sans ✅ | **generic sans-serif** ❌ | — | **NO** |
| `/verify` | Playfair ✅ | DM Sans ✅ | **generic sans-serif** ❌ | SF Mono ✅ | **NO** |
| `/verify-cert` | Playfair ✅ | DM Sans ✅ | **generic sans-serif** ❌ | — | **NO** |

**The footer failure is site-wide and live.** `public/shared/css/utilities.css:350` sets `.footer-col h5 { font-family: 'Plus Jakarta Sans', sans-serif; }`. Plus Jakarta Sans is requested by **no** Google Fonts link anywhere in the repo, so it falls through to the generic `sans-serif` keyword — the browser default, typically Arial or Helvetica. `.footer-col` renders **3× on every one of the 14 pages** (verified live on `/`, `/shippers`, `/carriers`, `/about`, `/track`).

**`/carriers` carries a second, worse failure.** `carriers.html:166` — the CarrierFraudBanner `<h2>` ("Protecting carriers from double-brokering fraud.") has an inline `style="font-family:'DM Serif Display',serif"`. DM Serif Display is never loaded, and that inline stack has no Playfair fallback, so it degrades to generic `serif` → **Times New Roman**. Verified live in the served HTML. A trust-signal heading rendering in the browser's default serif. Distinguish from `carriers.css:2014/2033/2053`, which declare `'DM Serif Display', 'Playfair Display', Georgia, serif` — those degrade gracefully to Playfair and are cosmetic drift, not breakage.

**Token-shadow drift (renders correctly, but off-canon).** Four page stylesheets define local font vars instead of consuming `srl-tokens.css`: `index.css:53-54`, `carriers.css:25-26`, `contact.css:24-25`, `track.css:31-32`. They use the non-canonical name `--font-headline` (canon: `--font-display`) and a truncated `--font-body: 'DM Sans', sans-serif` (canon includes `-apple-system, BlinkMacSystemFont`). Values are functionally right; the naming is a second, competing token layer. `carriers.css` is the worst case — it *defines* both local tokens at `:25-26` and then never uses them, hardcoding all 28 of its declarations literally.

### 4.2 React app — all four portals + onboarding + auth (114 routes)

Font loading is `next/font/google` (`src/app/layout.tsx:7-8`), self-hosted. **No Google Fonts link on any React route** — by design, not a defect. All four woff2 files verified HTTP 200, no 404s: DM Sans 18KB + 37KB, Playfair 21KB + 38KB.

The served `<body>` is identical on every React route:

```html
<body class="__variable_0d7163 __variable_6b3ed8 __className_0d7163">
```

Resolved from the production font bundle (`/_next/static/css/faba2d16ffff210c.css`):

```css
__className_0d7163{font-family:DM Sans,DM Sans Fallback}      /* applied to body  */
__className_6b3ed8{font-family:Playfair Display,...}          /* applied NOWHERE  */
__variable_0d7163{--font-dm-sans:"DM Sans",...}
__variable_6b3ed8{--font-playfair:"Playfair Display",...}
```

And from the app bundle (`/_next/static/css/bc7d79f231d8e6ef.css`):

```css
--font-sans:ui-sans-serif,system-ui,sans-serif,"Apple Color Emoji",…
--font-serif:ui-serif,Georgia,Cambria,"Times New Roman",Times,serif
.font-sans{font-family:var(--font-sans)}
.font-serif{font-family:var(--font-serif)}
```

**Three production greps settle it:**

| Check | Result |
|---|---|
| `grep -c 'font-playfair'` in app bundle | **0** — no rule references the Playfair variable |
| `grep -c '__className_6b3ed8'` in served HTML (6 portals sampled) | **0 on every one** |
| `grep -c -- '--font-family-serif'` in app bundle | **0** — tree-shaken; nothing consumes it |

**Playfair Display is downloaded on all 114 React routes and rendered on none of them.** Roughly 59KB of font payload, paid for on every page load, never drawn.

| Portal / area | Routes | Headings | Body | Mono | Conforms |
|---|---|---|---|---|---|
| **AE Console** (`/dashboard/*`) | 48 | **DM Sans** ❌ *(no font class at all)* | DM Sans ✅ | ≈SF Mono ⚠️ | **NO** |
| **Accounting** (`/accounting/*`) | 13 | **DM Sans** ❌ | DM Sans ✅ | ≈SF Mono ⚠️ | **NO** |
| **Admin** (`/admin/*`) | 4 | **DM Sans** ❌ | DM Sans ✅ | ≈SF Mono ⚠️ | **NO** |
| **Carrier portal** (`/carrier/dashboard/*`) | 17 | **Georgia** ❌ *(22 `font-serif` sites)* | DM Sans ✅ | ≈SF Mono ⚠️ | **NO** |
| **Shipper portal** (`/shipper/dashboard/*`) | 11 | **Georgia** ❌ *(19 sites)* | DM Sans ✅ | ≈SF Mono ⚠️ | **NO** |
| **Driver University** (`/driver/dashboard/*`) | 2 | **Georgia** ❌ *(8 sites)* | DM Sans ✅ | ≈SF Mono ⚠️ | **NO** |
| **Onboarding** (`/onboarding`, `/onboarding/verify`) | 2 | **Georgia** ❌ *(16 sites)* | DM Sans ✅ | ≈SF Mono ⚠️ | **NO** |
| **Auth / pre-auth** (19 root-only routes) | 19 | **Georgia** ❌ | DM Sans ✅ | ≈SF Mono ⚠️ | **NO** |

`≈SF Mono` — `.font-mono` resolves to `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, …`. Named differently from canon but resolves to the same faces (SFMono-Regular *is* SF Mono; Menlo and Consolas both present). **Effectively conforming**; flagged for naming only.

**Login screens, audited separately as instructed.** All 19 auth/pre-auth routes are governed by the root layout only — there is no `src/app/auth/layout.tsx`. They therefore inherit the same DM Sans body as everything else and are *not* at extra risk from the layout dimension. They are, however, the highest-visibility victims. Verified live in served HTML: `<h2 class="font-serif">Employee Sign In</h2>` on `/auth/login`, `Shipper Sign In` on `/shipper/login`, `SRL Driver Academy` on `/driver/login`, `Carrier Registration` ×3 on `/onboarding`, `Company Information` ×2 on `/shipper/register` — every one rendering **Georgia**.

**Static export dropped nothing.** `/onboarding/verify` was flagged in the command as a suspect. It serves 200, 15,229 bytes, with both font variables and both CSS bundles present. Same for `/quote/approve` and every other root-only route checked. The export-dropped-the-link failure mode does not exist here.

### 4.3 Three distinct React failure modes

They are not one bug, and a fix addressing only the first leaves the other two live.

1. **`font-serif` → Georgia.** 80 occurrences across 47 files. Intended Playfair; renders Tailwind's stock serif.
2. **No font class at all → DM Sans.** The entire AE Console, Accounting, and Admin (65 of 114 routes) contains **zero** `font-serif`. Their headings inherit the body font. Wrong in a different direction — the body face used for display type. This is the mode a served-HTML count would have scored as "clean."
3. **Inline-style workarounds → Playfair.** 14 occurrences across 5 files use `style={{ fontFamily: "Playfair Display, Georgia, serif" }}`, bypassing the broken utility. **These are the only places Playfair renders anywhere in the React app.** They read as someone hitting mode 1 and routing around it per-page rather than fixing the cause. All 14 omit the canonical `'Times New Roman'` fallback, and `dashboard/orders/page.tsx:848` quotes the family differently from the other 13.

A fourth, smaller mode: `font-sans` (1 site — `carrier/dashboard/activation/page.tsx:422`) resolves to `ui-sans-serif, system-ui` and therefore *actively overrides* the body's DM Sans with the OS default.

### 4.4 Backend-rendered browser pages — in scope, and off-brand

Not React, not `public/`, but real pages a carrier or driver lands on. The command names the tender magic-link landing explicitly.

| Page | Source | Body font | Font link | Conforms |
|---|---|---|---|---|
| Tender magic-link landing | `backend/src/routes/tenderAction.ts:47` | `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif` | **none** | **NO** |
| Driver location-ping page | `backend/src/routes/driverPing.ts:56` | `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` | **none** | **NO** |
| Legacy Rate-Con HTML view | `backend/src/controllers/documentController.ts:408` | `Arial, sans-serif` | **none** | **NO** |

The tender landing is the page a carrier reaches from an Accept/Decline email — a branded moment rendering in the OS default sans. Its mono (`"SF Mono", ui-monospace, Menlo, monospace`, `:53`) *is* canonical. The legacy Rate-Con view additionally carries legacy navy `#0D1B2A` and legacy gold `#C8963E`, both retired per §2.1.

### 4.5 Error and 404 pages

| Page | Resolved | Conforms |
|---|---|---|
| `src/app/not-found.tsx` → `out/404.html` | DM Sans body, no heading font | NO — headings not Playfair |
| `src/app/error.tsx` + 8 nested `error.tsx` | DM Sans body | NO — same |
| `src/app/global-error.tsx:18` | **`system-ui, -apple-system, sans-serif`** inline | NO |

`global-error.tsx` replaces the whole document when React itself fails. A system font there is arguably deliberate — webfonts may not have loaded at that point. **Recorded as a decision to ratify, not a defect to fix.**

---

## 5. Hardcoded declarations — the drift list

231 `font-family` declarations across 27 CSS files in `public/`; 154 are literal stacks. The load-bearing ones:

**Families referenced but never loaded** — each silently falls back to a generic keyword:

| Family | Where | Loaded? |
|---|---|---|
| **Plus Jakarta Sans** | `utilities.css:350` (live, all 14 pages) · `srl-logo.css:28` · `auth/root-login.css:4,90,144` · `auth/root-register.css:4,90,155` · `tracking.css:5,21,242` | ❌ never |
| **DM Serif Display** | `carriers.html:166` (live) · `carriers.css:2014,2033,2053` · `auth/root-login.css:13` · `auth/root-register.css:13` · `tracking.css:20` | ❌ never |
| **Inter** | `@import` in 5 `auth/*.css` files | ✅ via own `@import`, but off-canon |
| **Montserrat** | `public/logo.svg` ×2 | ❌ never |

`srl-logo.css:28` (`.srl-logo-text`) is drift but **not rendering** — verified live, the class appears 0× on all 14 marketing pages (the logo is an `<img>`). Recorded so nobody "fixes" a rule that draws nothing.

**Auth CSS is a separate, undeclared font pipeline.** Five stylesheets `@import` Inter from Google Fonts directly (`auth/login.css:1`, `forgot-password.css:1`, `reset-password.css:1`, `carrier-login.css:1`, `carrier-forgot-password.css:1`). Inter is in no brand document. These attach to the three shadowed orphan HTML pages (§2) and are therefore dead — but they are the only files in the repo pulling a fifth font family from the network.

**The injector's stated blind spot** (`inject-chrome.mjs:181-201`, its own comment): a page with neither an `INCLUDE:design-system` marker nor a pre-existing Google Fonts link is skipped, because there is no integrity-safe insertion anchor. That is why `public/auth/*.html` never received the canonical block. `MARKETING_PAGES` (`:403-416`) also lists `login.html`, `register.html`, and `tracking.html`, none of which exist in `public/` — a stale set worth pruning.

**Non-brand inline fonts in `src/`:**

- `components/driver/TrainingFigure.tsx` — **48× `fontFamily="Arial, sans-serif"`** in SVG training diagrams. Arial appears nowhere in the canon. These are student-facing Driver Academy figures.
- `components/auth/LoginSplash.tsx:117` — `fontFamily="system-ui"` (SVG).
- `components/templates/BOLTemplate.tsx:399` — `body { font-family: -apple-system, … }`, **no brand font at all**, sitting beside `InvoiceTemplate.tsx:375,383,388` which correctly uses DM Sans + Playfair. Two print templates, two different answers.
- `public/js/session-timeout.js:84,85,87,88` — injects `font-family:Inter,system-ui,sans-serif` into the session-expiry modal. That file is marked ORPHANED at its top per §13.3 — nothing loads it — so this is latent, not live.
- `public/auth/login.html:157` — TOTP secret display uses bare `monospace`, not the canonical mono stack.

**SVG assets** carry their own font attributes and cannot inherit page fonts (rendered as `<img>`). Most are canonical (Playfair + DM Sans, Georgia for taglines); `logo.svg` is the exception, with Montserrat.

---

## 6. Verdict

**Not one page in the audited surface fully conforms to the brand skill's typography canon.**

The single most consequential finding: **Playfair Display renders on zero of the 114 React routes.** It is downloaded on every one of them. The brand's display face is absent from all four portals, the onboarding wizard, and every login screen — while the marketing site renders it correctly, which is almost certainly why this went unnoticed. The homepage looks right.

Every page is non-conforming, by area:

- **14 static marketing pages** — headings and body correct; footer column headings render the browser default sans on all 14 (`utilities.css:350`). `/carriers` additionally renders its fraud-banner heading in Times New Roman.
- **48 AE Console + 13 Accounting + 4 Admin routes** — headings render DM Sans instead of Playfair.
- **17 carrier + 11 shipper + 2 driver portal routes** — headings render Georgia instead of Playfair.
- **19 auth / pre-auth routes and 2 onboarding routes** — headings render Georgia. Highest visibility: `/auth/login`, `/carrier/login`, `/shipper/login`, `/driver/login`, `/onboarding`, `/shipper/register`.
- **3 error/404 surfaces** — no display font; `global-error.tsx` fully off-brand by a possibly-deliberate choice.
- **3 backend-rendered pages** — tender magic-link landing, driver ping page, legacy Rate-Con view: all system or Arial stacks, no font link.
- **3 shadowed static auth orphans** — dead, but carrying a fifth font family (Inter).

**Root-cause hypotheses — all UNVERIFIED, for a correction command to prove:**

1. *React (modes 1–4):* `globals.css:382-383` declares `--font-family-serif` / `--font-family-sans` inside Tailwind v4's `@theme`. v4 derives `font-serif` / `font-sans` from the `--font-*` namespace, so these generate no utilities and the stock stacks survive. Consistent with all three production greps, and with `--font-family-serif` being absent from the compiled bundle while `--font-family-sans` survives solely because `.pac-container` (`globals.css:443`) references it directly. **That consumer must move in the same change, or it breaks when the old name stops being emitted.**
2. *Static footer:* `utilities.css` predates the token migration; the v3.8.amm sweep corrected its colors and not its font.
3. *Backend pages:* written before `srl-tokens.css` existed as a shared asset, and never revisited.

**Two things a correction command must not assume.** Fixing the Tailwind namespace repairs mode 1 (80 sites → Playfair) and neutralizes mode 4, but does **nothing** for mode 2 — the 65 AE Console / Accounting / Admin routes have no font class to fix and will still render DM Sans headings. And the 14 inline-style workarounds (mode 3) then become redundant duplicates of a working utility, worth collapsing so the two do not drift apart later.

**Also open, for a decision rather than a fix:** whether `global-error.tsx` should keep its system font, and whether the AE Console's serif-free heading treatment is deliberate house style for dense internal tooling or an oversight. This audit does not assume either way.
