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
the DELETE audit the route declared had never once fired (see §6, Item 306).

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
CUSTOMER                CONTACT           EMAIL                           PRIMARY  LAST OPS EMAIL     ACTIVE LOADS
Acme Manufacturing      Robert Mitchell   rmitchell@acmemfg.com           yes      never              0
American Furukawa Inc.  Wasi Haider       wasihaider3089@gmail.com        yes      2026-08-30 17:00   0
Gail &amp; Rice         Gail &amp; Rice   qsmolinski@gail-rice.com        yes      never              0
Graphic Packaging       Graphic Packaging rs2649089@gmail.com             yes      2026-07-07 14:37   0
Great Lakes Foods       Linda Kowalski    lkowalski@greatlakesfoods.com   yes      never              0
Lone Star Chemicals     William Brooks    wbrooks@lonestarchemicals.com   yes      never              0
Pacific Distributors    David Park        dpark@pacificdist.com           yes      never              0
Southern Paper Co       James Calloway    jcalloway@southernpaper.com     yes      never              0

13 contacts total | opted-in 0 | opted-out 13 | eligible under old rule 8 | eligible now 0
total active loads behind these 8: 0
```

**Read as `srl_readonly` against production at 2026-09-23T18:40Z, after the
deploy** (`sha 5c3d43d6`, migration `20260923150000` applied 18:36:30Z) — not
carried over from the pre-deploy census. It corrects one figure: American
Furukawa's last operational email is **2026-08-30 17:00**, which the earlier
reading had as "never".

**"never" is bounded, and the bound matters.** `email_logs` begins
**2026-06-19T02:37Z** (the table landed in v3.8.anl), so a send before that
date leaves no row. "never" therefore means *no operational email since
2026-06-19*, not *never emailed*. Six of the eight are "never" under that
bound.

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

**CAUSE — and it is already documented.** This divergence is not drift. It is
the exact, deliberate consequence described in **§13.3 Item 305** (landed on
origin as `a71915bb` while this arc was in flight): a peer session could not
rebase in the shared worktree because §2.2 forbids touching another session's
uncommitted files, so it rebased in a throwaway worktree and pushed the result
as a ref. **A ref push does not read the working tree**, so local `main` was
left pointing at the pre-rebase SHA while `origin/main` carries the rebased
commits — *the same content under new SHAs*, which is precisely why all 6 read
as "local-unique" with an origin twin under an identical subject.

**The correct close is theirs, not this arc's:** the peer commits or stashes
their own work and runs an ordinary `git pull --rebase`, where patch-id drops
the already-upstream commits and replays only their own. **Do not** `git reset`
or `git update-ref` the local ref — under a dirty tree that makes every
differently-resolved file show as spuriously modified, and `reset --hard` would
destroy their work outright.

**Standing hazard:** a stale local `main` looks like an ordinary branch, and
work started from it re-parents onto the pre-rebase base, which duplicates an
entire arc on push. Compare `git rev-parse main` against `git rev-parse
origin/main` before committing in any worktree whose branch may be stale.
**This arc is not exposed** — its base `53a6a576` is a verified true ancestor of
`origin/main`, and it has been rebased onto `a71915bb` cleanly.

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

**Item 306 — `auditLog` cannot see a non-`res.json` response.** The middleware
wraps `res.json` only, so a handler answering `res.send` / `sendStatus` / `end`
is invisible to it. `deleteCustomerContact` answers `204 .send()`, so its
declared DELETE audit had **never fired** — which is why the BKN contact
vanished without a record. Census of the **67 mutation routes** classified on
the **success path** (not "does it ever call res.json"): **66 audited, exactly 1
silently unaudited**, now closed by the handler writing its own `AuditTrail` row
(bhg) carrying actor *and* the consent the contact held — strictly more than the
middleware could. Fixing the middleware itself is Item 306.

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

## 8 — Shipped, and what the deploy verified

**Pushed** `5c3d43d6` — branch `arc/customer-mail-consent`, then `origin/main`
fast-forwarded `a71915bb..5c3d43d6` **from the worktree**, never from local
`main` (which is still on its stale pre-rebase ref per §4 and was not touched).

**CI green on that SHA, all four jobs read by name** (§19 SP11 case study #4 —
never the workflow's aggregate): Backend, Frontend, **E2E - Full Lifecycle
Smoke**, Deploy to Render. The deploy job took the **real** branch, not the
quieted absent-secret one: `HOOK: ***`, `HTTP 200`, `dep-daq1nvfavr4c73em1ftg`.

**Deploy ordering, textbook Item 213:** migration applied **18:36:30.306Z**,
new process booted **18:37:10.285Z** — the schema changed 40s before the SHA
flipped, which is exactly why `/api/health` reports `schema` and why the app's
SHA is not evidence a migration landed.

### P5 — verified read-only as `srl_readonly`

Connected through the Item 303 rail: credential from
`backend/.env.production.readonly`, owner role refused by construction, and
`SET default_transaction_read_only = on` before the first query so a write is
refused by Postgres rather than by discipline.

| check | result |
|---|---|
| Render live at pushed SHA | **`5c3d43d6`** |
| migration applied | `20260923150000_customer_contact_operational_consent` |
| column | present, `boolean NOT NULL DEFAULT false`, index present |
| rows | 13 contacts — **0 opted-in, 13 opted-out** |
| resolver | **0 eligible across all customers**; 8 customers with contacts, **0 resolving non-empty** |
| `/api/health` | clean — `unexpected_cumulative` 1, the known `BOOKED → AT_PICKUP`, last seen 2026-09-22 **pre-arc** |
| customer operational email since deploy | **0 rows, 0 to any customer** |

Scripts are committed rather than left untracked, so the next reader can re-run
the same reading instead of reconstructing it (the Item 303.7 hazard):
`backend/scripts/_readonly-p5-mail-consent-verify.ts` and
`_readonly-p6-eight-table.ts`.

### Still open

- **The 8 contacts above need an AE tick each.** Until then customer
  operational mail reaches nobody — ratified as the intended live state, not a
  defect.
- **Item 306** — the middleware fix, plus a census of all 89 `auditLog(`
  declarations against their actual success-path response shape. Only 67 were
  censused (this arc's blast radius), so the rest are unchecked and any one
  answering `res.send` records nothing today.
- **Item 301** (Load Board render race, 3rd occurrence recorded) and the
  `run-local.mjs` exit-0 defect — both queued as their own arc after the Item
  194 observer arc.
- **§5 above** — the skill-file deletion in the shared main checkout. Not this
  arc's to fix; report only.