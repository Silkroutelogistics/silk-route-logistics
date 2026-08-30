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

---

# PART II — The correction, and what it proved (2026-08-30)

Shipped as **v3.8.avd → v3.8.ave → v3.8.avf**. Three commits rather than one, because the after-sweep found the first fix insufficient and the third found something neither the audit nor the guard had seen. That sequence is the finding, not an embarrassment to tidy away.

## 7. Root causes — proven vs the audit's hypotheses

The audit marked every root cause UNVERIFIED. Each was checked against source before anything was changed. **One was wrong, and one was incomplete in a way that mattered.**

| # | Audit hypothesis | Verdict |
|---|---|---|
| 1 | React: `globals.css:382-383` declares `--font-family-*` inside Tailwind v4 `@theme`, where the namespace is `--font-*` | **CORRECT** — but **INCOMPLETE**; see 7.1 |
| 2 | Static footer: `utilities.css` predates the token migration | **CORRECT** — confirmed at `utilities.css:350`, and the file's own comment dates the additive rule |
| 3 | Backend pages: written before `srl-tokens.css` existed and never revisited | **WRONG** — see 7.2 |

### 7.1 The namespace was real, and fixing it was not enough

Renaming the three keys produced a compiled bundle that was, by inspection, correct: `--font-serif: var(--font-playfair), Georgia, "Times New Roman", serif`, the `.font-serif` utility emitted, the retired names gone, the Playfair variable referenced by a rule for the first time. tsc clean, build clean, guard green.

**Every heading in production still rendered the wrong face.**

`next/font` puts `--font-playfair` and `--font-dm-sans` on whatever element carries its `.variable` class — that was `<body>`. Tailwind's `@theme` declares `--font-serif` on `:root`, which is `<html>`, one level up. **A `var()` inside a custom property is substituted where the property is DECLARED, not where it is used.** So at `:root`, `--font-playfair` did not exist, `--font-serif` resolved to the guaranteed-invalid value, and *the invalid value is what inherited* into `<body>` and everything below. `font-family: var(--font-serif)` then had nothing to apply and fell back to the inherited face.

Measured in the browser before changing anything:

| Element | `--font-playfair` | `--font-serif` |
|---|---|---|
| `<html>` | **EMPTY** | **EMPTY** |
| `<body>` | `"Playfair Display", …` | **EMPTY** — already poisoned upstream |

Fixed in **v3.8.ave** by moving the `.variable` classes to `<html>`; `.className` stays on `<body>` as the inherited base face.

**This is the whole argument for proof-by-render.** Every artifact-level check passed while the page was wrong. The audit named this exact limit on itself — *"no headless browser here; resolution is traced through the served cascade"* — and that is precisely the gap this fell through. A browser was launched for the after-sweep and caught it on the first probe.

### 7.2 The backend pages were not off-brand. They were unstyled.

Hypothesis 3 was wrong, and the truth is worse than the audit reported.

`tenderAction.ts` and `driverPing.ts` emit their CSS in an inline `<style>` block. The backend's CSP sets `style-src-elem 'self' https://fonts.googleapis.com` — **no `'unsafe-inline'`**, removed on **2026-02-23** (`e89ce0bd`, "Remove unsafe-inline from CSP style-src by extracting all embedded styles to external CSS"). `tenderAction.ts` was written **2026-05-30**, three months later; `driverPing.ts` on **2026-08-21**, six months later. **Both were born blocked.**

Confirmed in a browser against live production, not inferred from the policy text:

| Probe | Result |
|---|---|
| `<style>` elements in the HTML | **1** |
| Stylesheets in the CSSOM | **0** |
| CSS rules applied | **0** |
| `body` background | `rgba(0,0,0,0)` — transparent, not the cream the CSS specifies |
| `body` / `h1` font | **`"Times New Roman"`** — the browser default |
| `.card` border-radius | `0px` — the card styling is entirely absent |

The tender magic-link landing — the page a carrier reaches from an Accept/Decline email — renders as **raw unstyled HTML**. Screenshot on file.

Their font declarations are now canon-correct so the next pass need not redo them, but **these two rows are NOT claimed as render-fixed**, and the delivery question is deliberately left open (§9).

## 8. After — every row re-swept against production, cache-busted

Method upgraded from the audit's: real Chrome via CDP, `await document.fonts.ready`, `getComputedStyle`, plus a synthetic `.font-serif` probe so a result never depends on a page happening to use the class. `PLAYFAIR-CANON` below is the literal `"Playfair Display", "Playfair Display Fallback", Georgia, "Times New Roman", serif`.

### 8.1 Static marketing pages (14)

| Page | Headings | Body | Footer col headings | Off-brand families in HTML | Conforms |
|---|---|---|---|---|---|
| all 14 | Playfair ✅ | DM Sans ✅ | **DM Sans ✅** *(was browser-default sans)* | **0** ✅ | **YES** |

Verified per page by curl: font link present on 14/14, zero occurrences of Plus Jakarta / DM Serif / Montserrat. Shared chrome confirmed on tokens — `utilities.css` `.footer-col h5` → `var(--font-body)`, `srl-logo.css` `.srl-logo-text` → `var(--font-body)`.

Browser-verified on `/carriers`: fraud-banner heading `"Playfair Display", Georgia, "Times New Roman", serif` (**was** `"DM Serif Display", serif` → Times New Roman); footer heading `"DM Sans", sans-serif` (**was** `"Plus Jakarta Sans", sans-serif` → default sans); cookie banner `"DM Sans", sans-serif` (**was** Inter/Plus Jakarta → system-ui). Loaded face set: **only DM Sans and Playfair Display**.

### 8.2 React app

| Route | Before | After | Conforms |
|---|---|---|---|
| `/onboarding` — "Carrier Registration", "Welcome to the Caravan.", "Company Information" | Georgia | **PLAYFAIR-CANON** ✅ | YES |
| `/auth/login` — "Employee Sign In" | Georgia | **PLAYFAIR-CANON** ✅ | YES |
| `/carrier/login` — "Carrier Sign In" | Georgia | **PLAYFAIR-CANON** ✅ | YES |
| `/driver/login` — "SRL Driver Academy" | Georgia | **PLAYFAIR-CANON** ✅ | YES |
| `/shipper/register` — wordmark + "Company Information" | Georgia | **PLAYFAIR-CANON** ✅ | YES |
| body face, all routes | DM Sans | DM Sans ✅ | YES |
| `--font-serif` at `:root` | `ui-serif, Georgia, Cambria…` | **`"Playfair Display", …`** ✅ | YES |

Whole-DOM sweep on `/shipper/register`: **zero** elements resolve to any of Plus Jakarta / DM Serif / Inter / Montserrat / Arial.

**Portal interiors could not be rendered** — they need credentials this environment does not have. The inheritance claim rests on three verified legs rather than a direct render, and is stated as such: the root layout carries the variables (confirmed in the served HTML of every route sampled), the guard asserts no nested layout overrides a font, and the synthetic `.font-serif` probe returns PLAYFAIR-CANON on routes under each layout tree's parent — including `/carrier/dashboard/my-loads`, which redirects to `/carrier/login` unauthenticated.

### 8.3 The Marco Polo widget — found by the after-sweep, missed by the audit

Sweeping the deployed homepage element-by-element rather than trusting the scan found **32 elements resolving to Arial**. They were the Marco Polo assistant widget, injected on 12 marketing pages, asking for `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial`. A system stack on the AI surface the brand is named for. `marco-polo.css` was in the audit's §5 list and was not in any failing *page* row, which is how it was passed over.

Now `var(--font-body)`, with its mono row on `var(--font-mono)`. Shipped in **v3.8.avf**.

### 8.4 The homepage, counted by winning family

The strongest single check available without a human eye: for every element on the deployed homepage, which family actually *wins* its stack.

| Winning family | Elements | Verdict |
|---|---|---|
| **DM Sans** | 463 | canonical body ✅ |
| **Playfair Display** | 26 | canonical display ✅ |
| **SF Mono** | 16 | canonical mono ✅ |
| **Georgia** | 1 | canonical tagline ✅ |
| Times New Roman | 32 | `html`, `head`, `meta`, `link`, `script`, `title` — non-rendering elements inheriting the browser default. Inert. |

**Zero visible elements win with a non-canonical family.** Before this correction the same sweep returned 32 elements winning with Arial (the Marco Polo widget).

Two things checked rather than assumed, both non-findings worth recording so nobody re-raises them:

- **"Segoe UI" appears on 395 elements** — as the *fourth* entry in `body`'s stack (`"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`). DM Sans wins; Segoe UI is an unreached fallback. An ad-hoc regex matching anywhere in the stack flagged it; the scanner's first-named-family rule correctly does not. A reminder that *contains* and *wins* are different questions.
- **21 `Inter` FontFace entries exist in `document.fonts`** — all with `status: "unloaded"`, sourced from no `@import`, no `@font-face`, no `<style>` tag and no stylesheet link on the page. They render on nothing. Environmental (the headless browser), not page-origin.

### 8.5 Not claimed

| Surface | Status |
|---|---|
| Tender magic-link landing | ~~Source canon-correct; still renders unstyled — CSP (§7.2)~~ **CLOSED 2026-08-30, v3.8.avg — see §12** |
| Driver location-ping page | ~~Same~~ **CLOSED 2026-08-30, v3.8.avg — see §12** |
| Legacy Rate-Con HTML view | Arial → DM Sans in source; artifact is uploaded to S3, not API-served, so not render-verified |
| AE Console / Accounting / Admin headings | **Deliberately unchanged** — §9 |

## 9. What was deliberately not fixed, and why

**The AE Console, Accounting and Admin headings (65 of 114 routes) still inherit the body face.** The audit flagged this as a decision; it now has a measurement behind it.

The only token-level repair available is a global `h1–h6 { font-family: var(--font-serif) }` rule, since those routes carry no font class to fix. Counting the heading elements first:

| Scale | Count |
|---|---|
| Label-scale (`text-xs`, `text-sm`, `text-[10px]`) | **160** |
| `text-lg` / `text-base` | 45 |
| Display-scale (`text-xl`, `text-2xl`) | 64 |
| **Total headings with a className** | **317** |

Half of them are 12–14px or smaller. Playfair Display is a high-contrast display serif; at label scale in dense internal tables it is the wrong instrument, and a global rule would be a downgrade dressed as a fix. The 64 display-scale titles genuinely should be Playfair — but reaching only those requires per-element edits, which is exactly the per-page declaration this correction forbids.

**So no token-level fix exists here that is not a regression.** Two honest options remain, both Wasi's call: accept serif-free headings as house style for dense internal tooling, or spend a sprint adding `font-serif` to the ~64 display-scale titles individually.

*(An earlier count of 118 was from a narrower grep over `h1`–`h4` only; 160 is the correct figure over `h1`–`h6` across all three trees.)*

**`global-error.tsx` keeps its system font** — it replaces the whole document when React itself fails, when webfonts may not have loaded. Allowlisted with that reason.

**The backend CSP delivery is surfaced, not answered.** Making those two pages render styled means choosing between serving their CSS from `'self'`, adding a CSP hash, or converting to inline `style` attributes (which the deployed policy already permits via `style-src-attr 'unsafe-inline'`). That is a security-adjacent architecture decision on a deliberately hardened surface, and it is not a typography choice.

## 10. The guard

`backend/scripts/font-drift.js` + `backend/__tests__/unit/ci/typographyTokens.test.ts`, 11 assertions, in the backend suite CI already runs.

**The canon is read out of the skill's own token stylesheet at run time**, never hardcoded — rename a face in `srl-brand-design` and the guard follows. It throws rather than defaulting if the skill is unreadable, because a guard that silently falls back to a guessed canon is worse than none.

Two halves: the **token contract** (theme keys under the names Tailwind reads, carrying the brand faces; the font variables on `<html>` where `:root` sees them; no nested layout overriding the inherited font, so a new route inherits or fails; the injector shipping the font link and token stylesheet) and the **drift lint** (no `font-family` naming a family the skill does not name). Vacuity tripwires throughout — the scan asserts it reached 300+ files and 100+ declarations, the layout walk asserts it found the six nested layouts, and every allowlist entry must carry a reason of real length.

### Injection-verified, four directions, each executed

| Injection | Result |
|---|---|
| Restore the `--font-family-*` namespace defect | **2 failed / 9 passed** — exactly the token contract |
| Add a hardcoded `Comic Sans MS` declaration | **1 failed** — the drift lint, naming file and line |
| Override the font in a nested layout | **1 failed** — naming `dashboard/layout.tsx` |
| Move the font variables back to `<body>` | **1 failed** — naming the `<html lang="en">` it found without them |

All four reverted clean; the suite returns to 11/11.

### The guard failed three times before it was right

Recorded because the pattern matters more than the fixes.

1. **It passed while production was broken.** The first version asserted the `.variable` classes appeared on `<body>` — which is exactly the arrangement that caused §7.1. It now asserts `<html>` specifically.
2. **Its regex read prose instead of code.** The `<html>` assertion matched the word `<html>` inside the explanatory comment above the JSX and failed against correct code. Comments are stripped before matching now.
3. **Its value terminator truncated the stacks it was meant to read.** It cut from the first quote to end of line unconditionally — right for the JSX form `fontFamily: "Arial, sans-serif"`, silently wrong for every CSS stack whose first family is unquoted. `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` became `-apple-system, BlinkMacSystemFont, `, both generic, so it reported **nothing on a file with four violations** — and that is the commonest shape a non-brand family hides in. Closing it surfaced the opposite defect (HTML `style="…"` attributes running past their closing quote, reporting families like `monospace">${valueHash}`), fixed by cutting family tokens at the first character that cannot appear in a family name.

The scan reported **0 violations before that third fix and 7 after it, all real.** Four in the Marco Polo widget, one in an orphan, two in email.

## 11. What programmatic checks still cannot certify

Stated plainly, because the gates above are stronger than the audit's and still do not cover this.

- **Colour fidelity.** Nothing here checks a single hex against the brand palette. Tokens were consumed, not colours verified.
- **Print and PDF output.** The PDF chrome, its borders, the BOL and Rate Confirmation as they land on a carrier's printer — untouched and unverified. `BOLTemplate.tsx` gained the DM Sans stack its `InvoiceTemplate` sibling already had; whether the printed page is right is a separate question.
- **Optical judgement.** Whether Playfair at these sizes and weights looks *right* — leading, tracking, the italic display headings against the cream — is not a thing a computed style can answer.
- **Portal interiors.** No credentials here; §8.2 states what the claim rests on instead.
- **Every route individually.** 114 React routes share one root layout and one utility. Representative routes from each tree were rendered; the rest inherit by a mechanism now guarded, not by inspection.

**The human eye-pass remains Wasi's and is not claimed.**

---

# PART III — the two CSP-blocked rows, closed (2026-08-30, v3.8.avg)

§8.5 left two rows open: the tender magic-link landing and the driver location-ping page were canon-correct in source and still rendered unstyled, because a CSP that dropped `'unsafe-inline'` from `style-src` on 2026-02-23 discarded their inline `<style>` blocks. Both are now fixed and **proven by render**, not by build.

## 12.1 Fixed within the policy, not by widening it

Both files now load from `'self'`, which the deployed CSP already permitted. **The CSP is byte-for-byte unchanged** — verified on the live response after the deploy:

```
script-src      'self' https://browser.sentry-cdn.com https://cdn.jsdelivr.net
style-src       'self' https://fonts.googleapis.com
style-src-elem  'self' https://fonts.googleapis.com
style-src-attr  'unsafe-inline'
script-src-attr 'none'
```

No new directive, no hash or nonce machinery, and `'unsafe-inline'` stays gone from both `style-src-elem` and `script-src`.

`backend/src/routes/publicAssets.ts` serves `/api/public-assets/brand.css` and `/driver-ping.js` from the public mount zone. The content is string constants rather than files on disk, deliberately: an asset under `src/` must be copied into `dist/` by the build chain, and this repo has shipped a missing-asset-at-runtime defect twice that way (§2.2, the `cp -r` trailing-dot lesson). A constant cannot be left behind by a build step.

The one genuinely per-page value — the tender page's accent colour — rides on a `--accent` custom property set through an inline style **attribute**, which `style-src-attr` allows.

## 12.2 A second defect found while tracing, worse than the styling

The ping page also carried an inline `<script>`, and `script-src` has no `'unsafe-inline'` either. Its **"Share my location once" button had no handler attached** — the whole Arc 19 consented-location feature was inert in a browser, not merely unstyled. That was not in the work order. Fixing the CSS and leaving it would have shipped a page that looks right and does nothing. The handler was token-agnostic already (it POSTs to `location.pathname`), so one external file serves every ping link.

## 12.3 Proof by render

Headless Chrome against production, cache-busted, after deploy.

| Measure | Before | After — driverPing | After — tenderAction |
|---|---|---|---|
| inline `<style>` elements | 1 | 0 | 0 |
| stylesheets in the CSSOM | **0** | **1** (`brand.css`) | **1** (`brand.css`) |
| CSS rules applied | **0** | **24** | **24** |
| `body` background | `rgba(0,0,0,0)` | `rgb(251,247,240)` = `#FBF7F0` ✅ | `rgb(251,247,240)` ✅ |
| `body` font | **Times New Roman** | `"DM Sans", -apple-system, …` ✅ | `"DM Sans", …` ✅ |
| `h1` font | **Times New Roman** | `"Playfair Display", Georgia, "Times New Roman", serif` ✅ | same ✅ |
| `.card` border-radius | `0px` | `12px` ✅ | `12px` ✅ |
| accent | — | `.rule` `rgb(197,165,114)` = `#C5A572` ✅ | `--accent` on the card resolves `#9B2C2C`, bar and heading follow ✅ |

Assets serve `200 text/css` and `200 application/javascript`. That last row is the one worth noting: the custom property carried the per-page dynamic value through an inline attribute, so the page keeps its accent without `unsafe-inline` on `style-src-elem`.

**A green build was never the proof here.** The typography arc's own lesson (§7.1) was a correct compiled bundle that still rendered the wrong face; these two rows stayed open specifically because nothing short of a browser could close them.

---

# Part III — serif conformance: weights, styles, loaders (v3.8.avh + v3.8.avj)

Part II made every heading render Playfair. It never checked *which* Playfair.
The skill is narrow — 400 and 700 only, no medium, no semibold — and sanctions
italic solely for the document-tagline pattern. Every heading on `/onboarding`
was rendering 600 in italic. Wasi caught it from a screenshot.

## 13. The per-element walk

The "89 hits" that opened this arc was a grep-shape estimate. Classifying
properly gives **90 real elements** (comments excluded, each element counted
once): 83 headings and 7 non-heading.

| Class | Count | Verdict | Action |
|---|---:|---|---|
| HEADING-CLASS, already 700 | 15 | conformant | untouched |
| HEADING-CLASS, italic and/or 600 | 22 | non-conformant | to `font-bold`, italic removed |
| HEADING-CLASS, inherited 400 | 46 | **non-conformant** (see 13.1) | to `font-bold` in v3.8.avj |
| BODY-SERIF, no weight (stat numerals, wordmarks) | 6 | allowed | untouched |
| OTHER — BCA pane document *title* at `onboarding:1935` | 1 | non-conformant | to `font-bold`, italic removed |

The one OTHER: a `<p>` in `--fg-1`, not the sanctioned `--gold-dark` document
tagline. It is a title wearing a tagline's clothes, so it takes the title's rule.

### 13.1 The 46, and why v3.8.avh got them wrong

v3.8.avh classified an inherited-400 heading as **conformant**, reasoning that
400 is a sanctioned Playfair weight. True, and the wrong test. Tailwind's
preflight resets headings to `font-weight: inherit`, so a heading declaring no
weight takes the body's 400 rather than the browser's bold — and the skill is
explicit that heroes, page titles and section heads are 700.

**Legality of the weight is not the same question as the pattern for the
element.** 46 portal page titles were rendering light. Fixed in v3.8.avj; the
guard now fails a serif heading that declares no weight at all.

Caught by rendering `/carrier/login` after the avh deploy — "Carrier Sign In"
computed 400 where a synthetic probe had returned 700. Proof-by-render again,
finding what the build could not.

## 14. The static layer was not clean either

The homepage spot-check had implied it was. That check was accurate for the
homepage and unrepresentative of the site: **77 Playfair blocks** across the
shared CSS carried 11 at weight 600, one at 500, and five italic. Pruning the
shared Google Fonts link without finding those would have left fifteen rules
requesting faces that no longer load. Twelve corrected to 700.

## 15. Loaders, both, to the same canon

Their divergence was its own finding.

| Loader | Before | After |
|---|---|---|
| `next/font` (React, 114 routes) | `["400","500","600","700"]` | `["400","700"]` |
| Google Fonts link (14 static pages) | `0,400;0,500;0,600;0,700;1,400;1,500` | `0,400;0,700;1,400;1,500` |

**One face above the "0,400;0,700;1,400 at most" specified, deliberately.**
`1,500` is the nearest loaded italic the two halted taglines synthesise their
700 from; dropping it changes how halted elements render, which is what halting
them was meant to prevent. It goes when the halt resolves.

Verified after: no page requests a face the link no longer carries.

## 16. Proof by render — production, cache disabled, post-avj

| Surface | Element | Family | Style | Weight | Verdict |
|---|---|---|---|---|---|
| `/onboarding` | `<h1>` "Carrier Registration" | Playfair Display | normal | 700 | CONFORMANT |
| `/onboarding` | `<h2>` "Welcome to the Caravan." | Playfair Display | normal | 700 | CONFORMANT |
| `/onboarding` | `<h3>` "Company Information" | Playfair Display | normal | 700 | CONFORMANT |
| `/onboarding/verify` | `<h1>` | Playfair Display | normal | 700 | CONFORMANT |
| `/auth/login` | `<h2>` "Employee Sign In" | Playfair Display | normal | 700 | CONFORMANT |
| `/carrier/login` | `<h2>` "Carrier Sign In" | Playfair Display | normal | 700 | CONFORMANT |
| `/shipper/login` | `<h2>` "Shipper Sign In" | Playfair Display | normal | 700 | CONFORMANT |
| `/driver/login` | `<h1>` "SRL Driver Academy" | Playfair Display | normal | 700 | CONFORMANT |
| `/` (control) | 15 Playfair headings | Playfair Display | normal | 11 at 700, 4 at 400 | see §17 |

**23 Playfair headings rendered across the seven surfaces; every React heading
conformant.** One page per portal layout is covered — AE, carrier, shipper and
Driver University each answer through their own nested layout, and all four
inherit correctly.

### 16.1 Scope limit, stated rather than glossed

Wizard steps 2-5 are client-side state behind form validation and were **not
individually rendered**. Their headings were corrected in source and the
classifier reports zero violations across all 90 elements, so they are covered
by the guard — but they are covered by source and CI, not by a browser. Step 1,
the verify page and the success page were rendered.

## 17. The homepage control surfaced a fourth finding

The control was supposed to prove nothing had moved, and it did — the same four
`<h2>`s sat at 400 before and after. But rendering them made visible what source
review had passed: **`.headline { font-weight: 400 }`** is the static
section-head class, and the skill puts section heads at 700.

This is §13.1 one layer over. The static half of the guard checked weight in
{400, 700} and passed 400 happily — the identical blind spot the React half had
before avj.

Four blocks, three live: `index.css .headline` (4 homepage section heads),
`track.css .hero h1`, `track.css .explainer-text h2`. `contact.css .headline` is
dead — `contact.html` carries zero `.headline` elements.

**All four HALTED, not fixed.** CLAUDE.md §20.6 records the homepage editorial
register as locked (v3.8.aeq) and `/track` as swept clean (v3.8.amp). The skill
says 700; a ratified page-lock has them at 400. Two canons disagree about the
weight of the headline on the most-reviewed brand surface there is, which is the
same shape as the shimmer-tagline conflict and the same answer: Wasi's call, not
a cleanup.

The guard now flags the class, with each halt carrying its reason, so it cannot
hide again.

## 18. Five italic blocks halted

Two are the "Where Trust Travels." shimmer (`.srl-tagline`,
`.ops-chip-tagline`). CLAUDE.md §20.8.2 ratifies that treatment as "Playfair
italic bold with gold gradient" — a named, reusable project pattern. The skill
says that exact sentence is "Georgia italic, `--gold-dark`, tracked +0.02em".
Two canons disagree about one sentence.

The other three (`.commitment-teaser`, `.tms-result`, `.heritage-line`) are
editorial italic lines no sanctioned pattern covers in either direction.

**What did not wait:** all three sat at weight 500, forbidden under either
outcome, and 400 is the only sanctioned Playfair-italic weight. Moved to 400 as
the interim.

Worth knowing about the two taglines: they ask for **700 italic, which the link
has never loaded**. They have been synthesised bold-italic all along.

## 19. Out of scope, flagged not fixed

**DM Sans 600.** The skill allows 400, 500 and 700 — not 600 — and the static
link requests it. Roughly **1,077 uses** (140 in static CSS, 937 `font-semibold`
in React). That is the dominant UI weight in the app; removing it is a change of
a wholly different size and is not a serif question.

**The section-head gold rule.** The skill pairs every section head with a thin
gold rule. The site has none. Site-wide visual addition, its own arc.

## 20. The guard learns two axes it was blind to

`font-drift.js` held at **zero violations** throughout, because it asserts the
FAMILY. Family was right; weight and style drifted freely underneath it.

> **A guard proves the property it asserts, not the property you meant.**

New `serif-weight-drift.js` asserts the other two axes and the loaders
themselves, so a re-added 600 fails CI before any component can reach for it.
Its allowlists require each entry to say HALTED and why, so a halt cannot be
forgotten quietly.

### Injection-verified, six directions, each executed

| Injection | Expected | Result |
|---|---|---|
| italic back onto a serif heading | red | red — "italic on a serif element" |
| `font-semibold` on a serif element | red | red, naming the class |
| 600 back into the `next/font` loader | red | red, naming the loader |
| remove `font-bold` from a serif heading | red | red — "declares no weight" |
| drop a halted heading from the allowlist | red | red — `index.css [.headline]` |
| a new 400-weight section head in static CSS | red | red — `carriers.css [.injected-section-title h2]` |

Clean on every restore.

## 21. Still not claimed

The human eye-pass remains Wasi's. Nothing here certifies colour fidelity,
optical weight at real display sizes, or whether a 700 section head *looks*
right where a 400 one has stood since launch. The four halted heading blocks are
exactly that question, which is why they are halted rather than decided.
