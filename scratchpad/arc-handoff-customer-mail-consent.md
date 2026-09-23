# ARC HANDOFF — customer-mail-consent (Item 8.3.b pulled forward)

**Branch** `arc/customer-mail-consent` · **worktree** `srl-wt-mail-consent`
**Base** `53a6a576` (origin/main at arc start) · **13 commits** `v3.8.bhb` → `v3.8.bhn`
**Scope** 27 files, +1368 / −103 · **Not pushed.**

Fired in production on BKN `SRL-121494`. Source: the audit of 2026-09-23.

---

## 1 — What was wrong

`receivesTrackingLink` never governed operational mail. Eligibility was
`isPrimary OR receivesTrackingLink`, so **the tracking tag an AE reached for
governed nothing**, and a contact who was merely *primary* received pickup,
transit, delivery, milestone and delay mail with no consent of any kind.

Ten operational emails reached `logistics@beekeepersnaturals.com` for
`SRL-121494` — a load whose tracking link had never been sent. The contact was
deleted between 12:00 and 13:53 on 2026-09-23 **with no audit trail**, because
the DELETE audit the route declared had never once fired (see §6, Item 305).

## 2 — The rulings, as built

**R1 — consent is its own column.** `CustomerContact.receivesOperationalUpdates`,
`@default(false)`, backfilled false. Governs pickup / transit / delivery /
milestone / delay mail and nothing else.

**R2 — two independent consents.** Turning a tracking link off must not silence
operational mail, and being the primary *contact* is not consent to be *mailed*.
The resolver predicate is now
`opts.requireTrackingLink ? c.receivesTrackingLink : c.receivesOperationalUpdates`.
`isPrimary` is inert for mail. Tier-1 `load.contactEmail` is removed entirely as
an operational source, and `"load-contact-email"` is gone from the
`RecipientSource` union.

**R3 — located evidence required.** A customer-facing delay mail now requires a
*located* report inside `NO_DATA_LOOKBACK_HOURS` (6). Absence of data is not a
delay and is never reported to a customer as one.

**R4 — LATE and NO_TRACKING_DATA are different events.** The internal alert
reports a gap as a gap: `TRACKING GAP: Shipment <n> — no location report`, body
states plainly that it is *not* a confirmed delay. Dedup 12h.

## 3 — AE ACTION REQUIRED: the 8 contacts

Every contact below was eligible under the **old** rule (`isPrimary`) and is
**not** eligible after the backfill. **No data was written.** Each must be
ticked by an AE in the CRM contact panel ("Send load updates") if that customer
should keep receiving operational mail.

```
CUSTOMER                  CONTACT            EMAIL                          PRIMARY  LAST OPS EMAIL     ACTIVE LOADS
Acme Manufacturing        Robert Mitchell    rmitchell@acmemfg.com          yes      never              0
American Furukawa Inc.    Wasi Haider        wasihaider3089@gmail.com       yes      never              0
Gail &amp; Rice           Gail &amp; Rice    qsmolinski@gail-rice.com       yes      2026-07-07T14:37   0
Graphic Packaging         Graphic Packaging  rs2649089@gmail.com            yes      never              0
Great Lakes Foods         Linda Kowalski     lkowalski@greatlakesfoods.com  yes      never              0
Lone Star Chemicals       William Brooks     wbrooks@lonestarchemicals.com  yes      never              0
Pacific Distributors      David Park         dpark@pacificdist.com          yes      never              0
Southern Paper Co         James Calloway     jcalloway@southernpaper.com    yes      never              0

total contacts: 13  |  eligible today: 8  |  eligible after backfill: 0
```

**Every one has 0 active loads, so nothing is in flight behind this.** Seven of
the eight have never received an operational email at all — the tick is a
forward-looking decision, not a restoration.

**Observed, not fixed:** `Gail &amp; Rice` is stored HTML-encoded — legacy
`sanitizeInput` data from before v3.8.d.2. The decode script
(`scripts/decode-encoded-load-fields.ts`) walks loads, not customers.

**No BKN contact was created and `SRL-121494` data was not modified**, per the
arc's explicit prohibitions.

## 4 — Ruling 6: local `main` divergence (READ-ONLY, complete)

The main checkout was **not** touched: no reset, stash, checkout or commit.

```
local main   b4aa9c80        origin/main  a71915bb
divergence   46 ahead / 34 behind
git cherry origin/main main  ->  6 +   28 -
git cherry main origin/main  -> 18 +   28 -
```

**Nothing is stranded.** All 6 local-unique commits exist on origin under the
identical subject, as small-delta duplicates (version letters / item renumbers):

| local | origin twin | subject |
|---|---|---|
| `eacca21b` | `1f322448` | v3.8.bfy C1 — RC gains the countersign columns |
| `6e0ce6c6` | `d45ce446` | both states of the RC are pinned |
| `91e4879b` | `b3c2d5b3` | v3.8.bgb C3 — return instruction vs Acceptance clause |
| `7ebec6b7` | `eeb27176` | v3.8.bgh C3a — return address restored |
| `cc9467b8` | `20f11cf6` | Item 302 — the rotation and the claim it disproved |
| `11cb4d56` | `288c66fb` | §13.3 renumber 302 -> 303 |

**17 modified files traced:** 14 × `srl-brand-design` skill (logo-final arc),
1 × `backend/src/controllers/pdfController.ts` (last v3.8.bgs C4b, RC/BOL arc),
1 × `scratchpad/arc-handoff.md` (RC countersign arc), 1 ×
`.claude/settings.local.json` (machine-local).

**Letters: no collision.** Origin claims only `bha`; this arc runs `bhb`–`bhn`.

## 5 — OPEN FINDING: uncommitted deletion of a CLAUDE.md-cited canon

In the **shared main checkout**, the uncommitted `srl-brand-design` edits are
**244 insertions / 1310 deletions across 14 files**, and the EOL-insensitive
diff (`--ignore-cr-at-eol`) returns the **same** numbers — so this is real
content deletion, not Item 268 line-ending churn.

`references/tokens.md` is **225 lines at HEAD, 197 in the working copy**, and
the **"UI type scale"** section is present at HEAD (count 1) and **gone from the
working copy (count 0)**.

CLAUDE.md §2.1 names that exact section as the ratified canonical home:
*"The UI type scale is ratified and lives in the brand skill (references/tokens.md §8 'UI type scale')"*.

It is uncommitted, in a shared checkout, **one `git add -A` from landing**.
Untouched here per ruling 6 — it is the logo-final arc's work and theirs to
resolve. Flagged rather than reverted.

## 6 — Banked

**Item 305 — `auditLog` cannot see a non-`res.json` response.** The middleware
wraps `res.json` only, so a handler answering `res.send` / `sendStatus` / `end`
is invisible to it. `deleteCustomerContact` answers `204 .send()`, so its
declared DELETE audit had **never fired** — which is why the BKN contact
vanished without a record. Census of the **67 mutation routes** classified on
the **success path** (not "does it ever call res.json"): **66 audited, exactly 1
silently unaudited**, now closed by the handler writing its own `AuditTrail` row
(bhg) carrying actor *and* the consent the contact held — strictly more than the
middleware could. Fixing the middleware itself is Item 305.

*Census v1 reported 0 and was wrong*: it asked whether a handler ever calls
`res.json`, and `deleteCustomerContact` answers 404 with json and 204 with send,
while `auditLog` fires only on 2xx.

**`run-local.mjs` exits 0 on a launch failure.** The first E2E run failed
`MODULE_NOT_FOUND` because the worktree had no root `node_modules`, and the
runner still exited 0. A green with no evidence is §19 Sub-pattern 16 — pairs
with **Item 269(b)**, where the runner exited 0 printing the Playwright header
and nothing after it. The runner must assert it saw a result line.

**Item 301 — third occurrence.** The AE Load Board `getByText(<reference>)`
render race fired again during this arc's E2E. Item 301 says a third occurrence
stops being noise and gets the fix: locate the row by a stable test-id and await
the board's query settling, rather than text-matching a list mid-swap.

## 7 — Gates (P1, on `57100402`)

```
backend tsc     0 errors
backend suite   2705 passed | 1 skipped | 0 failed  (267 files: 265 passed, 2 failed at load)
frontend tsc    0 errors
frontend build  clean
```

The **2 load failures are environmental and pre-existing**, identical to the
pre-P1 baseline (`gate2-suite.log`), so P1 introduced none:

- `marcoPoloProbe.test.ts` — **Item 268 verbatim.** `core.autocrlf=true` gives
  the worktree a **CRLF** `probe-public-surfaces.mjs`; the main checkout's is
  LF. The `.mjs` import fails to parse. CI (Linux, LF) never sees it.
- `ssoSessionRow.test.ts` — `config/env` ZodError. The worktree's `backend/.env`
  is 193 bytes against the main checkout's 1277; it lacks the SSO vars.

## 8 — Remaining

- **P2** `git fetch`; origin/main has moved `53a6a576` → `a71915bb`, which is
  **exactly one commit and it touches only `CLAUDE.md`** — zero overlap with
  this arc's 27 files, so the rebase is trivial. (The "34 behind" figure is
  *local main* vs origin, a different divergence — see §4.) Rebase, rerun the
  full gate order **including E2E**, then HALT before push.
- **P3** push the branch, then fast-forward `origin/main`. **Never push from
  local main.**
- **P4** migration runs **only** through the normal Render deploy path. No local
  `prisma` or `psql` write against Neon.
- **P5** read-only verification as `srl_readonly`.
- **Ruling 7** remove containers `srl-mailconsent` (:55492) and
  `srl-e2e-mailconsent` (:55493) after P5 passes.
