# RC 404 · Permissions · Info-Request Affordance · Drawer Rail · Print Conformance

Read-only audit, 2026-08-31. Five domains, five sub-agents, orchestrator-verified.
Baseline `243a16ed` (v3.8.awq), clean tree, in sync with origin.

**No source was changed. This document is the only artifact.**

---

## 0. How to read this — what the audit did and did not do

**Did.** Traced source for all five domains. Ran production HTTP probes against both
hosts. Ran read-only `SELECT`/`count` queries against the production database
(pooled Neon endpoint) to size defects and separate *live* from *latent*. Read the
brand skill in full before assessing print conformance. Re-executed every failure
claim and at least two pass claims from each agent against the real artifact.

**Did not.** Change any code. Render a PDF and look at it — print conformance here
is read from the generator source and from the production data that feeds it, which
is conclusive for fonts, colours, citations and structure and is **not** conclusive
for optical spacing or overprint. Open a browser — drawer geometry is computed from
Tailwind classes with the arithmetic shown, not measured from a live render. Test any
role by logging in as it — the permission matrix is read from `authorize()` and JSX
gates. Nothing here is ratified: **the role model and the brand decisions await Wasi.**

**One method note that shaped the findings.** A `401` from `api.silkroutelogistics.ai`
does **not** prove a route exists. Verified this run:

```
/api/rate-confirmations/testid/pdf         -> 401 {"error":"No token provided"}
/api/totally-made-up-namespace-xyz/nothing -> 401 {"error":"No token provided"}
```

Byte-identical, same `etag` `W/"1d-TdeScqFQy+dbnhB6tfnSArDhevg"`. This is §13.3 Item
249.7's catch-all (`router.use("/", tenderRoutes)` sitting above `/admin`), still live.
Route existence below is therefore established from **source**, never from a 401.

---

## 1. Agent claims the orchestrator rejected or corrected

Recorded first, because an audit that only reports what agents said is a transcription.

| Claim | Agent | Verdict |
|---|---|---|
| "401 = route exists, auth-gated — correct target" (curl table, repeated) | 1 | **Inference rejected.** The conclusion (frontend host is wrong) is right; the stated reason is unsound — see §0. Route existence re-established from `routes/rateConfirmations.ts:24`. |
| POD email links "**already delivered to customers**", ranked P0 | 1 | **Severity corrected → LATENT.** Production: `Load.podUrl` non-null = **0**, `Document` with `docType:"POD"` = **0**. `sendShipperPODEmail` has never been called with a real POD. The defect is real; the delivery is not. |
| "the carriers page runs its own inline rail at 66px" (my prompt's premise) | 4 | **Premise was stale; agent correct.** The inline rail was deleted in `760ffd47` (v3.8.awa). `carriers/page.tsx:5,1217` uses the shared `IconTabs`. |
| "the BOL header carries `whaider@` where `operations@` is canonical" (my prompt's premise) | 5 | **Premise half-wrong; agent correct.** The **PDF** path is correct *today* (`pdfService.ts:104` → `authority.ts:85` = `operations@`) but was wrong before 2026-05-25. `whaider@` is hardcoded in a **second, live HTML renderer**. Which one produced the reported BOL is settled by its issue date — see §6.1. |
| "akg touched `BOLTemplate.tsx` and **missed** the email" (my own first draft, repeating agent 5) | 5 → self | **Corrected on the agent's addendum.** akg's frontend scope was MC#/DOT# only (`VersionFooter.tsx:10508-10510`); the email was never in scope. A scoped deferral, not an oversight. The agent also disclosed that its original sweep truncated at `head -40` and never reached `frontend/` — re-run exhaustively here, finding intact. |

Everything else each agent reported and I re-executed held.

---

## 2. DOMAIN 1 — the Rate Confirmation 404 (P0, carrier-blocking, live)

### 2.1 Root cause — not where the brief expected

The URL is **not built in the frontend**. The backend writes a root-relative path
**into the database**, and the carrier portal renders it verbatim.

`backend/src/controllers/rateConfirmationController.ts:301`
```ts
rateConfirmationPdfUrl: `/api/rate-confirmations/${rc.id}/pdf`,
```

The comment above it (`:292-294`) states the assumption that fails — *"carrier's
httpOnly cookie auths it automatically when the link is clicked from the portal"* —
which holds only if portal and API share an origin. They do not: the portal is
Cloudflare Pages on `silkroutelogistics.ai`, the API is Render on
`api.silkroutelogistics.ai`.

Production, on the real load `SRL-121488`:
```
rateConfirmationPdfUrl = "/api/rate-confirmations/cmsq1x405000xmo2d4xvmpzbi/pdf"
```

**Because the value is persisted, fixing the code forward does not repair existing
rows.** Production count: **20 loads total, 1 carries a `rateConfirmationPdfUrl`, and
that 1 is root-relative.** The backfill is one row today and grows by one per RC sent
until `:301` changes.

### 2.2 Confirmed against production

| URL | status | reading |
|---|---|---|
| `https://silkroutelogistics.ai/api/rate-confirmations/{id}/pdf` | **404** | Next.js HTML 404 page returned where a PDF belongs |
| `https://api.silkroutelogistics.ai/api/rate-confirmations/{id}/pdf` | 401 | non-discriminating (§0); existence proven from source instead |

Route exists and admits carriers — `backend/src/routes/rateConfirmations.ts:24`:
```ts
router.get("/:id/pdf", authorize("BROKER","ADMIN","CEO","DISPATCH","OPERATIONS","ACCOUNTING","CARRIER"), downloadRateConfirmationPdf);
```
mounted `routes/index.ts:337`. **The backend is correct. Only the link's host is wrong.**

### 2.3 Blast radius — three link sites, two carrier pages, one stored value

| file:line | surface |
|---|---|
| `frontend/src/app/carrier/dashboard/my-loads/page.tsx:185` | "View Rate Confirmation" — the reported P0 |
| `frontend/src/app/carrier/dashboard/documents/page.tsx:298` | Documents page, View |
| `frontend/src/app/carrier/dashboard/documents/page.tsx:301` | Documents page, Download |

`documents/page.tsx:93-94` copies the same stored string into `fileUrl`. **Fixing only
`my-loads` leaves the Documents page 404ing.**

### 2.4 Two-surface check — the AE side works

`frontend/src/components/loads/RateConfirmationModal.tsx:771`
```ts
const pdfRes = await api.get(`/rate-confirmations/${rcId}/pdf`, { responseType: "blob" });
```
Through the axios client (`lib/api.ts:4-16`), which prepends `NEXT_PUBLIC_API_URL` and
sends the cookie; the resulting `a.href` is a `blob:` URL, so no host resolution occurs.
**The AE never reads `Load.rateConfirmationPdfUrl`** — it holds the `rcId` and re-derives
the path. The stored string is a carrier-only payload, which is why this survived on the
AE surface.

### 2.5 The wider class — this is not one bug

Sweep of browser-facing targets. `frontend/public/**` is **clean** (every `/api/` hit is
`fetch(BASE + …)`, never an `href`). The shipper portal is **clean** (blob downloads).

**(a) Unanchored `.replace("/api", "")` — verified by execution:**
```
"https://api.silkroutelogistics.ai/api".replace("/api","")   ->  "https:/.silkroutelogistics.ai/api"
"http://localhost:4000/api".replace("/api","")               ->  "http://localhost:4000"   <- masked in dev
"https://api.silkroutelogistics.ai/api".replace(/\/api$/,"") ->  "https://api.silkroutelogistics.ai"
```
The first `/api` matched is inside `https://api`. Sites: `dashboard/documents/page.tsx:110`,
`dashboard/sops/page.tsx:85` (consumed `:182,:183,:189`). AE document and SOP downloads are
**wholly non-functional in production**. `sops:189` carries a second, independent defect —
`${baseUrl}/sops/{id}/pdf` omits the `/api` prefix even with a correct base. The correct
anchored idiom already exists at `auth/login/page.tsx:65`.

**(b) Raw `s3://` used as a browser target.** `storageService.ts:93` returns
`s3://bucket/key` in production (and refuses local disk, `:99-103`). Seven render sites
pass it straight to `href`/`src`. **Live now: 7 documents in production carry `s3://`
fileUrls.** The fix exists — `dashboard/carriers/page.tsx:473-479` presigns, and its comment
names the bug exactly: *"fileUrl is `s3://bucket/key`, which a browser cannot load — so the
moment storage started working, the first stored document rendered as a broken-file icon."*
It was never propagated to `InfoRequestThread.tsx:193`, `track-trace/tabs/DocsTab.tsx:75,77`,
`PhotosTab.tsx:65,87`, `crm/tabs/DocsTab.tsx:69,71`, `dashboard/loads/page.tsx:1444`,
`my-loads/page.tsx:237`.

**(c) Customer-inbox POD links — LATENT, corrected from Agent 1's P0.**
`shipperNotificationService.ts:183` has no separator guard at all:
```ts
const fullPodUrl = `https://silkroutelogistics.ai${podUrl}`;   // -> "…ais3://bucket/key"
```
`shipperLoadNotifyService.ts:207,234` do guard, yielding `…ai/s3://…` (404, well-formed).
**Production: 0 PODs exist, so none of these has ever been sent.** Real defect, zero
delivered instances. Fix before the first POD upload, not before the first customer email.

### 2.6 Why the existing guard missed it

`backend/__tests__/unit/routes/emailActionUrls.test.ts` (Arc 33) is correctly scoped to a
**different axis** — app-router path correctness — and cannot express host selection:

- `:118` `if (h.startsWith("/api/")) continue;  // backend, not the router` — the one filter
  that would have seen it drops it by design.
- `:50-70` `realRoutes()` is built from `page.tsx` files and `public/*.html`. Express routes
  are never enumerated, so the guard has no vocabulary for API routes.
- `:105` scans `BACKEND_SRC` only — `frontend/src/**` was never in scope — and `:114` skips
  template literals, which `rateConfirmationController.ts:301` is.

The file is honest about its reach (`:14-17`, and it prints its skipped count). **This is a
gap in coverage, not a broken guard.** A guard for this class must assert: no browser-facing
target on the static-export frontend may begin with `/api/`; any `*Url` DB field rendered
into an `href` is absolute-with-API-host or resolved through `lib/api.ts` (this one rule also
covers the `s3://` class); and base derivation must be anchored (`/\/api$/`).

---

## 3. DOMAIN 2 — who can do what to a carrier

### 3.1 The headline for the first hire

`frontend/src/app/dashboard/carriers/page.tsx:421`
```ts
const isAdmin = user?.role === "ADMIN" || user?.role === "CEO";
```
One boolean gates ~20 of ~22 carrier-lifecycle controls. It excludes OPERATIONS. The
backend admits OPERATIONS on 15+ carrier-mutating routes. **An OPERATIONS employee sees
almost nothing and can curl a great deal.**

Blast radius is two roles, not one: `middleware/auth.ts:466`
`AE_INHERITED_ROLES = ["BROKER","OPERATIONS"]` — every OPERATIONS grant is also an
`ACCOUNT_EXECUTIVE` grant.

### 3.2 THE FIVE ABSOLUTES HOLD — verified three-deep

**This is the most important result in the domain, and it is negative.** No role —
OPERATIONS, BROKER, DISPATCH, and not CEO either — can waive `AUTHORITY_TOO_YOUNG` (<12mo),
`AGREEMENT_TERMINATED`, `OFAC_MATCH`, `FMCSA_REVOKED`, or `OUT_OF_SERVICE`.

1. **One mint endpoint, ADMIN/CEO only.** `routes/compliance.ts:54`
   `router.post("/carrier/:carrierId/override-block", authorize("ADMIN","CEO"), overrideBlock)`.
   `prisma.complianceOverride.create` appears exactly once repo-wide
   (`complianceController.ts:575`). No second writer.
2. **Minting refused for the five.** `complianceController.ts:418-425`
   `NEVER_OVERRIDABLE_CHECK_CODES` lists all five (409 `HARD_FLOOR_NOT_OVERRIDABLE`).
3. **Honouring refused at the gate.** `complianceMonitorService.ts:574`
   `const keptCodes = blanketActive ? blocked_codes.filter(c => !c.overridable) : blocked_codes;`
   — even a legacy row would not release them. The `<12mo` branch never consults an override
   at all (`:305-312`).

The **inputs** are gated too: `authorityGrantedDate` is writable only via
`carrier.ts:424` (`ADMIN`,`CEO`). OPERATIONS cannot backdate authority.

**Not a P0. The gate is doing its job.**

### 3.3 P0 — three compliance routes have no `authorize()` at all

`backend/src/routes/compliance.ts:35-37`, verbatim:
```ts
router.patch("/alerts/:id/dismiss", auditLog("DISMISS","ComplianceAlert"), dismissAlert);
router.patch("/alerts/:id/resolve", auditLog("RESOLVE","ComplianceAlert"), resolveAlert);
router.get("/stats", getComplianceStats);
```
Only the file-level `router.use(authenticate)` (`:31`) gates them. **Every sibling route on
both sides carries an explicit `authorize(...)`**, which makes the omission conspicuous
rather than deliberate.

**A CARRIER can reach them.** `/api/compliance` is not a carrier-portal mount, and
`resolveCookieCandidates` (`middleware/auth.ts:226`) falls back for non-portal mounts:
```ts
ordered = [cookies.srl_token_ae, cookies.srl_token_carrier, cookies.srl_token_shipper];
```
A carrier holding only `srl_token_carrier` validates on the second candidate and
`authenticate` passes with `role: "CARRIER"`. The resolver's own comment (`:185-188`) says
the safety net is *"Role gating still enforced by `authorize()` downstream"* — **which is
precisely what these three routes lack.** A carrier can dismiss and resolve the compliance
alert raised against itself.

### 3.4 UI-shows / backend-refuses

| Control | file:line | Backend |
|---|---|---|
| **Invite Carrier** (empty state) | `carriers/page.tsx:1177` — bare `<button>`; the header twin at `:986` **is** `isAdmin`-wrapped | `carriers.ts:311` `("ADMIN","CEO")` → 403 for the first non-admin hire |
| **SMS-suppression override** | `SecuritySignalsCard.tsx:163` posts `checkCode:"UNUSUAL_OTP_SMS_DISABLE"` | `complianceController.ts:426` `SCOPED_CHECK_CODES = ["AUTHORITY_TOO_YOUNG","CHAMELEON_UNREVIEWED"]`; `:488` returns 400. **Dead for every role including CEO.** (`carriers.ts:598` is only a *read* surfacing an override this button can never mint.) |
| **Admin Console** link | `Sidebar.tsx:305` shows for ADMIN∪CEO | `app/admin/layout.tsx:19` and `admin.ts:14` are ADMIN-only → **CEO gets a dead-end link** |
| **Delete document** | `dashboard/documents/page.tsx:210` — no JSX role gate | `documents.ts:82` `("ADMIN","CEO")` → 403 |

### 3.5 Backend-permits / UI-hides (latent permission, curl-reachable, no UI trace)

`start-review`, `full-vet`, `identity-check`, `chameleon-check`, `grace-period`,
`ofac-screen`, `facial-verify`, `eld-validate`, `tin-verify`, `fraud-reports`,
`agreements` (create), **`agreements/:id/sign`**, `csa-update`, `ucr`, `read-coi`,
document upload + verify/reject, `vet`, `import-from-dat`, `promote-to-bronze`, plus six
compliance routes. All admit OPERATIONS; none renders a control for it.

**The one to close first:** `carriers.ts:410` `POST /:id/agreements/:agreementId/sign`
admits OPERATIONS. A new signed agreement is what clears `AGREEMENT_TERMINATED`
(`complianceMonitorService.ts:447-452`). That is not an override — it changes the underlying
fact, which §14 names as the legitimate remedy — but **OPERATIONS can un-terminate a carrier
it cannot terminate, through a route nobody can see.** Close the asymmetry.

Also note `carriers.ts:363` `grace-period` is `("ADMIN","OPERATIONS")` — **CEO excluded** —
and lets OPERATIONS grant a 1-7 day insurance waiver with no UI. Insurance-expired is a
waivable block, not one of the five, so this is a policy question, not a §14 breach.

### 3.6 The view toggle is not a permission

`frontend/src/hooks/useViewMode.ts:11-23` is a zustand store over one `localStorage` key.
No `user`, no `role`, no token. It is consulted only for nav shape (`Sidebar.tsx:178-182`)
and which overview component renders (`overview/page.tsx:16`). It gates **zero** API calls.
An ADMIN in "Carrier View" retains full approve/reject/terminate authority, because
`page.tsx:421` still reads `user.role`. Anyone can set `localStorage.viewMode`.

### 3.7 Recommendation only — "Carrier Reviewer"

**Include** (all reversible, all audited): approve, decline, request-info, cancel-info,
re-vet, start-review, document verify/reject. Approve and decline are both undoable from the
same seat (`lift-rejection`, `carriers.ts:819`) — that reversibility is what makes the set
safe to delegate. It is a queue-working capability, not a policy capability.

**Exclude, by name:** terminate agreement; **sign/create agreement** (narrow this *out* of
OPERATIONS — §3.5); blanket override; scoped override; anything touching the five absolutes
*including their inputs* (`authority-grant-date`); Quick Pay **fee** override
(`loads.ts:123` — note Quick Pay *enrolment* at `carriers.ts:792/799/806` is already
OPERATIONS-appropriate and is a different thing); insurance grace period; suspend;
soft-delete/restore; emergency-approve; test-account flag.

**Roles only — there is no permission layer.** No `Permission`/`Capability` model in
`schema.prisma`; no `hasPermission`/`can()` helper; `authorize()` is
`roles.includes(req.user.role)` (`auth.ts:558`). Measured surface: **522** `authorize(`
call sites across **79** route files, 33 inline backend `.role ===` checks, 43 frontend role
checks.

One precedent matters for sizing: `ACCOUNT_EXECUTIVE` is deliberately **not** enumerated at
call sites — it resolves centrally in `auth.ts:443-495` as `(BROKER ∪ OPERATIONS) − deny`,
a ~55-LOC path-regex ACL that already ships.

| Option | Cost | Blast radius |
|---|---|---|
| **(i-a) new role, central allow-list** (ACCOUNT_EXECUTIVE pattern) | ~100 LOC, 5-6 files, 1 enum migration | small; the role's full reach readable in one file |
| (i-b) new role, enumerate at call sites | ~12 LOC, 2 files | reach becomes un-greppable and drifts — the failure `auth.ts:454-457` exists to prevent |
| **(ii) permission layer** | ~1,500-2,000 LOC, 100+ files, seed + admin UI + capability resolver with request caching | every one of 522 sites is a 403-vs-200 behaviour change; two auth systems live during migration |

Right *shape* for a 20-person company; wrong *cost* for a 1-person one. **(i-a) is the size
that fits a first hire.** Ratification is Wasi's.

---

## 4. DOMAIN 3 — the "Request Info" affordance

**The control exists and works. The copy is wrong about where it is.**

`components/carriers/InfoRequestThread.tsx:115` — *"Use the "Request Info" button above…"*
`app/dashboard/carriers/page.tsx:1323` — the button.

The button's full render condition is **four** terms, not the three written on `:1322`:

| # | Term | Source | Requires |
|---|---|---|---|
| 1 | `selectedCarrier` | `:1199` | drawer open |
| 2 | **`panelTab === "profile"`** | **`:1239`, block closes `:1417`** | **reader is on the Profile tab** |
| 3 | `isAdmin` | `:421` | ADMIN or CEO exactly |
| 4 | status ∉ {APPROVED, REJECTED, SUSPENDED} | `:1322` | PENDING / REVIEWING / INFO_REQUESTED |

The copy mounts under `{panelTab === "info-requests" && …}` (`:2377`). `panelTab` is a
single-value `useState` (`:435`). **Term 2 is false by construction whenever the copy is on
screen** — verified: block opens 1239, closes 1417, info-requests mounts 2377.

**All 30 role × status cells are N.** The button renders for no role in any status on the
surface where the message appears. And "above" refers to nothing: the drawer is
`flex flex-row` with the rail as a **left** sibling; above the empty state is only the
panel header.

Two secondary points: the copy is **not role-aware** (`InfoRequestThread` already receives
`isAdmin` as a prop, `:83`, and uses it for Cancel at `:220`), so OPERATIONS/BROKER/DISPATCH
are told to use a control they could never see. And the APPROVED/REJECTED/SUSPENDED
exclusion is **UI-only** — `routes/infoRequests.ts:50-69` performs no status check.

**Sibling sweep — one failure in eight.** The other seven empty states that name a control
(`ai-insights:637`, `NotesTab:47`, `communications:264`, `training-courses:114`,
`tagging-rules:350`, `accounting/reports:186`, `carriers:2333`) all check out.

The structural reason, which generalizes: **the working empty states own their
call-to-action; the broken one delegates to a control in a sibling branch it cannot see.**
`InfoRequestThread` has no access to `setInfoRequestModalOpen` or `panelTab`, so its copy had
to describe the button by position — and the position it guessed was never true.

---

## 5. DOMAIN 4 — drawer rail scale (a design decision, not a conformance failure)

### 5.1 What the skill says, and does not

`references/tokens.md:220-225` specifies library (Lucide only), **stroke** (1.75 default,
**2 for buttons**, 1.5 marketing), `currentColor`, baseline alignment. It specifies **no
icon size** and **no touch-target rule** (searched: zero hits for touch target / hit area /
44px / tap target). **Rail scale is therefore a decision to be made, not a rule to conform
to.** What *is* binding: the 2026-08-31 UI type scale, `--fs-label` 11px, hard floor 11px,
*"labels are the only thing that may use it."*

### 5.2 Current geometry — `components/ui/IconTabs.tsx`

Rail `w-[68px]` `py-4` `gap-2` **`overflow-y-auto`** (`:48`) · button `w-full py-1`
`gap-0.5` (`:55`) · chip `w-9 h-9` = 36px (`:65`) · glyph `w-[18px] h-[18px]` (`:70`) ·
stroke `2.5 / 1.5` (`:73`) · label `text-[11px] font-medium`, **no uppercase, no tracking,
no truncate** (`:76`).

Per-tab height = 4 + 36 + 2 + (11 × 1.5) + 4 = **62.5px**.

### 5.3 Findings

1. **11px floor: clean numerically, violated in shape.** No sub-11px text remains (swept
   `v3.8.awd`). But the labels are sentence-case and untracked — the floor *size* in the
   non-floor *shape*, which `tokens.md:158-161` explicitly distinguishes. The guard cannot
   see this: `typeScale.test.ts:65` matches `/text-\[(\d+)px\]/` and has no notion of case
   or tracking — a limit its own header admits (*"proves a class name is absent, not that
   anything is legible"*).
2. **Stroke is off-spec.** These glyphs are inside `<button>`; the spec value is **2**.
   Neither 2.5 (not on the scale) nor 1.5 (the *marketing* value) is it.
3. **The glyph is 50% of its chip.** 18px inside 36px — 9px clear per side. **Growing
   18 → 24px costs zero height and zero width**, up to ~28px. This is the highest-leverage
   number here: *"the icons are too small"* is fixable at no geometric cost.
4. **The published measurement is stale by 18px.** `drawer-conformance-audit.md:264-266`
   publishes 852px. That back-solves exactly to a 10px label (`16 + 12×61 + 88 + 16 = 852`);
   `v3.8.awd` raised it to 11px and nobody re-measured. **Current is 870px.** (This
   reproduction also validates the 1.5 line-height model non-circularly — it lands on an
   independently published figure.)
5. **`leading-none` was silently dropped in the migration** — the removed inline rail had it.
   Restoring it reclaims 5.5 × 12 = **66px** (870 → 804) with no other change.
6. **The comment citing a proof is false in all three clauses.** `IconTabs.tsx:44-46` claims
   the rail is *"a scroll-free column, so its ceiling is the tab count times ~54px… verified
   against the drawer floor height, see the arc's render proof."* But `:48` sets
   `overflow-y-auto` (contradicted one line later), actual per-tab is 62.5px not 54, and
   `e2e/render-proof.mjs` hardcodes `height: 1000` at widths 1440/1920/2560 (`:32`,`:136`) —
   it never runs at 768 and never measures rail height. §19 Sub-pattern 16.

### 5.4 Viewport math

`--drawer-detail: clamp(640px, 60vw, 1100px)` (`globals.css:27`). Rail is a fixed 68px at
every viewport; content is `flex-1 min-w-0` less `p-5`.

| Viewport | drawer | content | readable | rail % |
|---|---|---|---|---|
| 1024 | 640 (floor) | 572 | 532 | 10.6% |
| 1366 | 819.6 | 751.6 | 711.6 | 8.3% |
| 1440 | 864 | 796 | 756 | 7.9% |
| 1920 | 1100 (ceiling) | 1032 | 992 | 6.2% |

### 5.5 The constraint — 12 tabs at 1366×768

12 tabs (11 without Quick Pay, role-filtered `:1218`). Usable height ≈ 640px with a
bookmarks bar, ≈ 660 without.

```
16 (py-4) + 12 × 62.5 + 11 × 8 (gap-2) + 16 = 870px    ->  overflows 640 by 230px
11 tabs:  16 + 11×62.5 + 10×8 + 16          = 799.5px  ->  still overflows by 159.5px
```
`overflow-y-auto` is present, so the 12th tab **scrolls, not clips**. Visible without
scrolling at 640px: **tabs 1-8; tab 9 cut; tabs 10-12 below the fold — 33% of the
navigation invisible on first paint.**

**Latent compounding:** there is no scroll affordance and no `scrollbar-gutter`
(zero `scrollbar` rules in `globals.css`). Windows Chrome paints a ~15px classic scrollbar
that consumes layout — 68px becomes 53px exactly when it scrolls — and "Compliance" at 11px
DM Sans 500 measures ≈57px with **no `truncate`**, so it wraps to a second line and
desynchronises the rhythm. The break fires only on the viewport that already fails.

**Largest set that fits 12 tabs in 640px** (glyph 24 · chip 32 · label 11 `leading-none` ·
button pad-Y 0 · inner gap 2 · tab gap 4 · rail pad-Y 8, width unchanged):
`8 + 12×45 + 11×4 + 8 = 600px` ✓ — glyph **+33%** *and* 270px reclaimed, no scroll, no
content lost. Hit area is unaffected by chip size: the button is `w-full` (68 × 45 = 3060px²).

### 5.6 Four options, priced — no recommendation

| | Buys | Costs | Fails first at |
|---|---|---|---|
| **(a) grow icons in-rail** | glyph 18→24 free, →28 max | stroke delta was tuned for 18px and is already off-spec; **does not touch the overflow** — makes hidden tabs bigger, not reachable | nowhere new |
| **(b) widen rail** | label room; absorbs the 15px scrollbar | 1:1 content loss at every viewport (drawer pinned by clamp): 96px rail → 683.6 readable at 1366 | **1024×700** — content 504px vs `--doc-preview-h` 480px, so the document preview scrolls again, undoing `v3.8.awb` |
| **(c) overflow affordance** | 0px vertical for a fade | ~15px horizontal for a gutter → "Compliance" wraps (needs a truncate guard first); signals *that* more exists, not *which*. **33% of nav** behind a gesture; Quick Pay is last *and* role-filtered, so the roles who can act on it are likeliest never to find it | 1024×700 |
| **(d) group tabs** | solves vertical outright (5 groups = 376.5px, 263px spare) | **7 of 12 destinations become 2 clicks**; ≈2-3 extra clicks per carrier review, 80-120/day at 40 carriers. Code: 12 render branches + 2 query `enabled` gates = 14 call sites, plus an `activeGroup` dimension that must survive the drawer's popstate wiring | no viewport failure; fails the *task* if it separates Insurance from Compliance |

---

## 6. DOMAIN 5 — print brand conformance

### 6.1 Version archaeology — TWO live BOL renderers

**Production PDF:** `routes/pdf.ts:9` → `pdfController.ts:165` →
**`services/pdfService.ts:301 generateBOLFromLoad`** (~1000 lines, fully inline PDFKit).
`generateBOL` (`:182`) is a thin adapter onto the same function — one PDF renderer.

**Structural finding: the production BOL does not use the chrome library.**
`pdfService.ts:20-60` imports `drawHeaderFirstPage`, `drawMetaStrip`, `drawPartiesBlock`,
`drawShipmentTable`, `drawSignatureBlock`, `drawFooter` — and `generateBOLFromLoad` calls
**zero** of them (verified by count over lines 301-1311). It re-declares its own token
literals at `:386-390`. Every other document in the repo goes through `srl-chrome.ts`; the
BOL is the sole holdout. **This is the root cause of most of §6.2.**

**CRITICAL — a second, live, off-brand HTML BOL renderer exists.**
`frontend/src/components/templates/BOLTemplate.tsx` (468 lines, own `window.print()`
pipeline) is reachable from the **carrier portal**:
`my-loads/page.tsx:191-195` "Print Bill of Lading" → mounted `:313`.

This is the exact class retired for the Rate Confirmation in §13.3 Item 249.5 — except the
RC's twin was killed because it was *dead*, and **this one survived because it is reachable.**
It carries: hardcoded `whaider@` (`:207`), non-canonical navy `#0F1A22`
(`:409,413,428,437,441,467`), non-canonical gold `#C9A24D` (`:180,414,467`), no Playfair
anywhere (`:399`), and its own banner admitting *"Preview reflects pre-v2.9 design"* (`:193`).

**The `whaider@` is a scoped deferral, not an oversight — and it dates the artifact.**
Corrected after the initial draft, which said akg "touched this file and missed the email."
The changelog is more precise (`VersionFooter.tsx:10508-10510`): akg's frontend scope was
*"BOLTemplate.tsx — header + footer **MC#/DOT#** sourced from authority."* The email was
never in that scope. A bounded migration with a known owner, not an accident — which makes
the finding cleaner, not weaker.

The same entry (`:10511-10514`) records what the PDF path used to do:

> *"Side-effect behavior change: pdfService.ts COMPANY.email flipped from `whaider@` to
> `operations@` per §3.10 canonical for shipping documents. Pre-akg drift:
> BOL/RC/Invoice/Settlement PDFs displayed whaider@."*

akg is `8ea1a38f`, **2026-05-25**. So the reported BOL resolves to a clean either/or you can
settle from its issue date alone:

- **Issued before 2026-05-25** → it came from the **PDF** path, which was genuinely wrong at
  the time and is **already fixed**. No action.
- **Issued on/after 2026-05-25** → the PDF path could not have produced `whaider@`, so it
  came from the carrier portal's **"Print Bill of Lading"** button. Action required, and it
  is the CRITICAL renderer above.

*(Caveat worth carrying: that changelog says "in the footer of every printout," but the email
has always been in the **header** company block — `pdfService.ts:494` prints
`phone | email | website`, while the footer at `:1269-1273` prints `MC# · DOT# · domain` and
no email. The substance is right; the location detail is not. Anyone reading that entry to
find the email will look in the wrong place.)*

Exhaustively swept: `whaider@` appears in the frontend in exactly four non-changelog places —
`BOLTemplate.tsx:207` (the defect) and three Lead Hunter outreach signatures
(`lead-hunter/page.tsx:118,127,137`), which are **canonical** per §3.10 and §12-exempt. No
PDF generator carries it.

Also: `backend/src/templates/bol-v2.9` is a **0-byte regular file**, not a directory — there
is no template-file BOL renderer. And `pdfService.ts:1325 generateRateConfirmation` is a
**dead** legacy generator (zero importers; only comments reference it) that still ships
default-Helvetica chrome.

### 6.2 BOL conformance — 20 conformant / 17 not

**Correct, and worth stating:** white canvas · QR present (BOL-only rule honoured) · meta
field set exactly right (6 cells, `DATE ISSUED / LOAD REF / EQUIPMENT / PRO# / SHIPPER REF /
FREIGHT CHARGES`) · 8-column table in canonical order · navy header band · **white body rows
with no alternating fill** · cream-2 totals as sole accent · three signature blocks ·
`Where Trust Travels.` in both canonical positions · Carmack `49 U.S.C. § 14706` at `:1067`
and `:1260`, with **`49 CFR § 1035` appearing nowhere in the repository** · header email is
`operations@` via `authority.ts:85`.

**Non-conformant, by severity:**

| Sev | Element | Skill | Renders | file:line |
|---|---|---|---|---|
| **HIGH** | Meta strip rules | 0.5pt `--gold` above **and** below | **1pt `BORDER_1`, top only; no bottom rule**, plus unspecified vertical dividers | `:630`, `:634-635` |
| **HIGH** | Parties block | **two** cream-2 panels, 12pt gap | **one** full-width rect with two text columns inside | `:666` |
| **HIGH** | (architectural) | use the chrome library | 0 chrome calls; hand-drawn throughout | `:301-1311` |
| MED | QR frame | `--gold` 0.75pt | `CREAM` fill + `BORDER_2` stroke — gold role dropped at the skill's canonical structural-gold example | `:503-505` |
| MED | Taglines (header + footer) | **Playfair**-Italic | DMSans-Italic | `:499-500`, `:1274-1277` |
| MED | Load ID under QR | `FONT_MONO_BOLD` | DMSans-Bold | `:516-521` |
| MED | Signature dividers | **vertical** 0.5pt `--gold-dark` | **horizontal** 1pt `--gold` | `:1216` |
| MED | RC special-instructions label | registered face | literal `doc.font("Helvetica-Bold", 7)` | `:2410` |
| LOW | Company name | DMSans-Bold 13 | Playfair-Bold 14 | `:489-490` |
| LOW | Compass mark | 55×55 | 84×84, and `logo-transparent.png` not `drawCompassMark` | `:483` |
| LOW | Top rule | 1pt | 3pt full-bleed bar + 1.75pt rule | `:476`, `:562` |
| LOW | Footer page count | computed | hardcoded `"Page 1 of 1"` — latent: a second page would silently lie | `:1279` |

### 6.3 Siblings

- **Rate Confirmation** — conformant but for one literal `Helvetica-Bold` (`:2410`). No QR
  (`includeQr:false`), 1-block `RATE_CON_SIGNATURE_ROLES`, footer on every page via
  `bufferedPageRange()`.
- **Invoice** — **fully conformant.** Zero signature blocks (verified by count),
  `includeQr:false` explicit, 6-cell meta strip through the chrome.
- **BCA / Quick Pay** (`agreementPdfService.ts`) — **fully conformant.** No QR, 2-block
  `MASTER_AGREEMENT_SIGNATURE_ROLES`, registered faces only, footer every page, Carmack
  correct in `data/agreements.ts:234`.
- Note `certificatePdfService.ts` carries a verification QR — a distinct document class,
  outside the BOL-only rule as written; flag only if the rule is read strictly.

### 6.4 The typo — order data, settled from production

`"Liposomal Suppliments"` is the literal `commodity` value on `SRL-121488` in the production
database. `Suppliment` appears **nowhere** in `backend/src`, `frontend/src`, or the seed —
its only occurrences are four dev fixtures under `backend/scripts/` that copied the real
load. Exactly **1** load carries it.

**No validation exists anywhere on this field.** `validators/load.ts:43` is
`z.string().optional().nullable()` — no constraints. Order Builder checks non-empty only
(`loadController.ts:99-102`). Email-to-load regex-scrapes and stores raw
(`emailToLoadService.ts:365-373`), so it propagates sender typos verbatim. The repo has
`emailNormalization.ts` and `phoneNormalization.ts`; there is no commodity equivalent.
Second-order effect: `nmfcCatalog.ts` substring-matches the description to auto-suggest a
freight class, so a misspelling can silently miss its alias. **Report only — data entry.**

---

## 7. SEAMS — findings no single domain owns

**7.1 One RC renderer serves both the working AE link and the blocked carrier link.**
`downloadRateConfirmationPdf` (`rateConfirmationController.ts:382`) and the send path
(`:243`) both call `generateEnhancedRateConfirmation`. Identical bytes. So §6.3's RC finding
(the `Helvetica-Bold` label) applies to the document the carrier currently cannot reach —
fixing the 404 does not create the defect, it **exposes** it to the carrier for the first
time on that surface.

**7.2 Fixing the 404 reveals a 403 — the carrier still does not get the document.**
The RC endpoint has a second carrier gate (ARC 19): `403 DRIVER_NOT_VERIFIED` unless the
driver phone is verified for that load. On `SRL-121488` production shows
`driverPhoneVerified: null`, `driverPhone: null`, `driverName: null`. **The 404 is masking a
403.** A host-only fix moves the carrier from "page not found" to "confirm the driver mobile
number" — actionable, but not the PDF, and unsatisfiable until a driver is assigned. Scope
the P0 fix accordingly. (The ownership gate, v3.8.ajv C1, is present and correct at `:357`.)

**7.3 Both carrier-portal document defects live in one component, six lines apart.**
`my-loads/page.tsx:185` is the 404 RC link; `:191` is the button that opens the off-brand
HTML BOL. A carrier on a booked load meets both in the same panel.

**7.4 And the correct BOL is role-excluded from carriers.** `routes/pdf.ts:8-9` gates both
BOL routes to `ADMIN, CEO, BROKER, DISPATCH, OPERATIONS` — no CARRIER (the seam banked at
§13.3 Item 221). So the carrier's **only** BOL is the stale `whaider@` HTML one, whose own
banner tells them the "downloaded PDF uses the current v2.9 visual" — a PDF they cannot
obtain. Domains 1 and 5 compound: the carrier's rate confirmation is unreachable and their
bill of lading is the wrong document.

**7.5 The `authorize()`-everywhere assumption is load-bearing and violated in three places.**
`resolveCookieCandidates` deliberately falls back across portal cookies and documents that
`authorize()` downstream is what stops a wrong-portal token. `compliance.ts:35-37` have no
`authorize()`. The resolver's safety net and the routes' gap meet exactly there (§3.3).

**7.6 Two guards cite verifications their artifacts do not perform.** `IconTabs.tsx:46`
cites a render proof that never measures rail height (§5.3-6), and
`emailActionUrls.test.ts:118` skips `/api/` by design (§2.6). Neither is dishonest; both are
scoped to a different axis than the defect that reached production. §19 Sub-pattern 16.

---

## 8. Severity roll-up

### P0
| # | Finding | Evidence |
|---|---|---|
| 1 | Carrier RC link resolves to the frontend host → 404. Persisted value; 3 link sites, 2 pages | `rateConfirmationController.ts:301`; `my-loads:185`, `documents:298,301`; prod 404 |
| 2 | `compliance.ts:35-37` have **no `authorize()`** — any authenticated principal **including a CARRIER** can dismiss/resolve compliance alerts | `compliance.ts:35-37` + `auth.ts:226` fallback chain |
| 3 | Live parallel HTML BOL renderer, carrier-reachable, off-brand, hardcoded `whaider@`. (P0 on the *renderer*; whether it produced the reported BOL depends on that BOL's issue date vs 2026-05-25 — §6.1) | `BOLTemplate.tsx` + `my-loads:191` |

*Not P0, stated explicitly:* the five absolutes hold; no role can waive them (§3.2).

### P1
| # | Finding | Evidence |
|---|---|---|
| 4 | Unanchored `.replace("/api","")` → `https:/.silkroutelogistics.ai` — AE document + SOP downloads non-functional in prod | `documents:110`, `sops:85,182,183,189` |
| 5 | Raw `s3://` in 7 browser targets; **7 such documents live now**; presign fix exists and was not propagated | `carriers:473-479` vs `InfoRequestThread:193` +6 |
| 6 | BOL meta strip has no gold and no bottom rule; parties is one panel not two; BOL bypasses the chrome library entirely | `pdfService.ts:630`, `:666`, `:301-1311` |
| 7 | OPERATIONS can `sign` an agreement (clears `AGREEMENT_TERMINATED`) but cannot terminate — via a route with no UI | `carriers.ts:410` |
| 8 | "Request Info" copy names a control that is unmounted in 100% of the states the copy renders in | `InfoRequestThread:115` vs `page.tsx:1239/1322/2377` |
| 9 | Invite Carrier button ungated at `:1177` (twin at `:986` is gated) → 403 for the first non-admin hire | `carriers/page.tsx:1177` |
| 10 | SMS-suppression override posts a `checkCode` the allow-list rejects — 400 for every role | `SecuritySignalsCard:163` vs `complianceController:426,488` |

### P2
| # | Finding | Evidence |
|---|---|---|
| 11 | POD email URL concatenation broken (`…ais3://…`) — **latent, 0 PODs exist** | `shipperNotificationService:183`; `shipperLoadNotifyService:207,234` |
| 12 | 12 tabs need 870px in ≈640px — 33% of nav below the fold; no scroll cue; label wraps when the scrollbar appears | `IconTabs.tsx:48,76` |
| 13 | Rail labels are 11px sentence-case — floor size without floor permission; stroke 2.5/1.5 where the button spec is 2 | `IconTabs.tsx:73,76` vs `tokens.md:158-161,223` |
| 14 | Published rail height 852px stale → 870px; `leading-none` dropped in migration (66px reclaimable); `IconTabs.tsx:46` cites a proof that never measures it | `drawer-conformance-audit.md:264-266` |
| 15 | RC label uses literal `Helvetica-Bold`; BOL taglines DMSans not Playfair; load ID not mono; signature dividers wrong orientation and gold role | `pdfService.ts:2410,499,1274,516,1216` |
| 16 | CEO sees an Admin Console link that dead-ends (client + server are ADMIN-only) | `Sidebar:305` vs `admin/layout:19`, `admin.ts:14` |
| 17 | Dead legacy RC generator still exported with default-Helvetica chrome; `templates/bol-v2.9` is a 0-byte file | `pdfService.ts:1325` |
| 18 | No validation or normalization on `commodity` / `LoadLineItem.description` on any of six creation paths | `validators/load.ts:43` |
| 19 | Guard-coverage gap: no check asserts host-correctness of browser-facing `/api/` targets | `emailActionUrls.test.ts:118` |

---

## 9. Conditionals

- **Deploy-hook secret — still unset.** `gh` is on PATH; `gh secret list` returns empty at
  exit 0, and `ci.yml:308` still runs the warn-on-absent branch. Render auto-deploy continues
  to ship commits ungated (§13.3 Items 209/214/215).
- **`GOOGLE_*` — absent.** No carrier-OAuth credentials in the environment or `backend/.env`.
  Item 238 remains blocked, not deferred.
- **Counsel `.docx` — absent, eighth consecutive attempt.** No `.docx` anywhere in the tree
  and no `my-knowledge-base/raw/counsel/`. Item 203 unchanged; §16 #1 and #2 stay open.

---

## 10. What awaits ratification

Nothing in this document is decided. Specifically Wasi's to call:

1. **The role model** — "Carrier Reviewer" as (i-a) a new role with a central allow-list
   (~100 LOC), or (ii) a permission layer (~1,500-2,000 LOC). §3.7 prices both.
2. **Rail scale** — the skill is silent on icon size and touch targets, so §5.6's four
   options are a design choice. The free 18→24px glyph growth is available under any of them.
3. **The HTML BOL** — retire it (matching the Item 249.5 precedent) or bring it onto the
   chrome library. It is currently the only BOL a carrier can obtain.
4. **Whether the driver-verification gate should fire on a load with no driver assigned**
   (§7.2) — it is what the carrier meets after the P0 fix.
