# Carried follow-ups — most recent arc first

Each section is one arc's findings that were deliberately NOT built in it.
Nothing below is a regression introduced by the arc it sits under.

---

## Notifications arc — v3.8.bkk / bkl / bkm (2026-09-26), `fix/notifications-r3`, NOT pushed

Five commits on `9d41c997`: `954b5920` bkk (320), `02bc3f4a` bkl (321),
`cc0c6438` bkm (322 code), `f2d921d8` (the data-step script, unversioned), and this
docs commit. **The original build, `fix/notifications` at `61f21332`, is kept as the
backup.** It was built as bjz/bka/bkb on `2434c765`.

**Why it was rebuilt, twice.** origin/main moved twice before the push. First it went
to `985e43c5`, where another session landed lift suspension as v3.8.bke and bkf and
took Item 323. Then it went to `9d41c997`, v3.8.bkj (the auto-reversal fix), which
closed Item 323 and added 324-325. That session and this one agreed by message: it
took bkj, and this arc took **bkk/bkl/bkm and Item 326**. Two other unpushed
worktrees hold more letters (`arc/invoicing-audit`: bjz, bka, bkb, bkd, bkh;
`fix/crm-history-outbound`: bkc, bkg, bki). Each rebuild cherry-picked the commits
and rebuilt the footer on origin's with the asserted-anchor helper. Each code commit
is identical to its original apart from the footer marker; the script differs by
one letter in its header comment. `fix/notifications-r2` (`87aa0db5`, on `985e43c5`)
is superseded, and is kept only until this lands. The duplicate claim with
`arc/invoicing-audit` is gone: this arc no longer holds bjz/bka/bkb.

**Size — the 100-LOC halt rule.** By files, every commit is within 4 (3/4/3/2). By
lines, counting tests and the footer: bkk +140/−15, bkl +51/−11, bkm +90/−25, script
+143. Source alone, bkk is +41/−14. The script is 141 lines of source, over the
threshold, and I did not halt on it. **Ruled 2026-09-26: accepted as a one-off,
because the script is not deployed. The halt rule stands for app code.**

**Phase A, as measured (production, `srl_readonly`).**
- 320: `L9180992591` has 320 alerts and 319 notifications (181 + 138, one per
  severity title). Real loads: SRL-121494 ×20, SRL-121497 ×9, SRL-121489 ×5.
- 321: 519 of 630 notifications disagree between `read` and `readAt`, all on AE
  accounts. **0 portal rows are stuck**, so the JETEX claim in Item 321 was wrong
  and is corrected there.
- 322: the old read branch deletes 0 today and the new one 5; the unread branch
  deletes 0 either way.

**Data step.** Dry-run before the push, 2026-09-26: 351 alerts and 350 notifications
to delete, 0 `readAt` backfilled, 2 alerts resolved. The credential copy was removed
afterwards. `--commit` is Wasi's run, from his own terminal, after the fix is live
and a post-deploy dry-run shows no increase. **Ruled: the reason `record deleted or
test` stays in SystemLog (kept 90 days, Item 270). No column, no migration.**

**Gates at the rebuilt tip (`6dd74bff`, r3)** — logs under `.logs/` in the worktree.
- btsc 0; ftsc 0; build ok.
- Backend 3195/3199 with 1 failure: `executionEvidence`, timed out. **It also fails
  alone**, and fails alone on `2434c765` too, so it is pre-existing (recorded in the
  Item 300.1 addendum). CI's Linux runner passes it. **Under the push rule it halts
  the push.**
- Frontend 378/378.
- E2E: 2 passed on a FRESH container (`srl-e2e-notif3`, PG 55499), 0 sends, no
  retries.
- r2 (`985e43c5`), for the record: E2E failed 1 of 2 on the reused container
  `srl-e2e-notif`. The accept-on-behalf 500 was `Unique constraint failed on
  shipmentNumber`, and the retry got `SESSION_REPLACED`. The fresh container passed,
  which is the Item 304.1 rule firing a fourth time.
E2E runs on **3120/4120**. :3110 is still held by PID 23976 (a stale `ts-node-dev`
from the main checkout); it was not touched.

### Carried, deliberately not built

1. **Item 326:** overbooking-check, ai-compliance-forecast and ofac-rescan notify
   with no dedupe key. Ruled to stay in the backlog; the entry carries a size
   estimate. Their `link` targets are not covered by the `actionUrl` guard.
2. **`read` is deprecated, not dropped.** Dropping it is a `hold/` migration. The
   unread retention branch still keys on `read: false`, which stays correct for as
   long as nothing writes `read`.
3. **The frontend contention failures** (`browserTargetHosts`, `FacilitiesTab`) match
   the Item 300.1 pattern and are recorded in its addendum, not as a new item.
4. **Cleanup after landing:** containers `srl-e2e-290` and `srl-e2e-notif`, the
   worktrees `srl-290` and `srl-notif`, and the branches `fix/notifications` and
   `fix/notifications-r2`.
5. **`/clear` and `/compact` are user commands** and were not run.
6. **`nextShipmentNumber` can collide, and not only in tests.** It takes the most
   recently *created* shipment (`orderBy: createdAt desc`), not the highest number,
   adds 1, and keeps a module-level counter (`shipmentController.ts:8-17`). Rows that
   share a `createdAt`, or two accepts at once, can produce a number already taken
   — and `shipmentNumber` is unique, so the accept path 500s (`tenderController.ts:288`).
   It surfaced in the r2 E2E. It is not banked with a number yet, because item numbers
   collided twice today; assign one when it is banked.

---

## Item 290 arc — v3.8.bjy (2026-09-26), pushed `4e8b1e1a` + docs `2434c765`, live (backend sha 2434c765, Pages check PASS)

Customer credits are priced from the stamped invoice's own lines keyed to the row
(the document as issued), never the carrier amount and never today's rate card. No
billed line → REFUSED, logged at warn, row left stamped. The carrier-amount `> 0`
filter that made a $0-carrier billed row uncreditable went with it. Source change is
one file (`invoiceService.ts`, +50/−9).

**Phase A, as measured.** One credit writer (`creditRejectedAccessorials` →
`creditLine`); the other negative-amount sites are carrier-pay/factoring ledger
entries, not customer credits. Every surface that shows a credit reads the stored
invoice lines; T&T `FinanceTab.tsx:98` sums rejected CLAIMS at carrier cost and
labels them as claim value — unchanged, not a credit surface. Production
(`srl_readonly`): 0 credit lines, 0 credit memos ever; 0 stamped rows without a keyed
line; 1 customer with a rate card (0 on 09-21).

**Gates (tip after rebase onto `6000ed3f`)** — see the HALT card; logs under `.logs/`
in the worktree. E2E ran on **3120/4120** (container `srl-e2e-290`, PG 55496), not
3110/4100: :3110 was held by PID 23976, a `ts-node-dev` backend started 07:29 from the
MAIN checkout (186 behind). Not started by this arc; not touched. The runner's
`reuseExistingServer` would have adopted it and tested a stale backend. Whoever owns
it should stop it; if nobody does, it is an orphan.

**Letter.** Built as bjx; a concurrent session pushed **v3.8.bjx** (`6000ed3f`, CRM
Loads tab) mid-arc. Re-lettered to **bjy**, committed, rebased. The first conflict
resolution corrupted the footer: `String.replace` read `$225`/`$150` in the
REPLACEMENT text as capture-group references. Rebuilt from origin's footer with a
function replacer, verified +8/−1, amended. §19 Sub-pattern 22, new variant: a
replacement string is code too.

### Carried, deliberately not built

1. **Items 320–322 (new).** Load-compliance scan: no deleted/test fence, no dedup —
   320 repeats on deleted `L9180992591`, 20 on SRL-121494. Notification `read`/`readAt`
   split — carrier and shipper badges can never clear (519/619 disagree). Retention
   exists but its read branch keys on the dead field; duplicate removal is a separate
   gated step AFTER 320's fix. **Deviation from the brief:** it said "there is no
   notification retention or cleanup"; `cron/index.ts:381-386` shows there is. Item 322
   records the accurate version.
2. **`/clear` was not run** — it is a user command. Origin's CLAUDE.md was read from
   the worktree instead (§2.5, §2.6, §3.3, §14.1).
3. **This checkout's `node_modules` and Prisma client were installed/generated fresh**
   (`npm ci` ×3, `prisma generate`); a fresh worktree has neither, and 907 tsc errors
   were the missing client, not the change.

---

## followups arc — v3.8.bjc / bjf / bjg (2026-09-24), deployed `8d296be5`

Shipped C1 (pre-tracing keys on Load.status), C2 (Item 317 AT_PICKUP remap), C3
(observer gains a CARRIER lens). C4 pruned worktrees; R1 reported only, NOT merged.

**THE ENFORCEMENT GATE CLOSED IN PRODUCTION.** `status_machine.unexpected_cumulative`
went **1 -> 0** and `unexpected_edges` is now `[]`, while `violations_cumulative` stays **1**
and `cumulative_since` is unchanged — the row is preserved verbatim
(`BOOKED -> AT_PICKUP count=1 first=2026-09-22T21:37:47.651Z`, read back as `srl_readonly`
with the read-only session proven by a refused write, SQLSTATE 25006). Only the derivation
moved. **§13.3 Item 194's step (ii) — switching enforcement on — is now unblocked on this
criterion for the first time**, subject to its own "zero across a full deploy cycle" soak.

### Carried, deliberately not built

1. **Five suites still call `vi.restoreAllMocks()`** — `credentialGuards`,
   `uncancelLoadHandler`, `authEvents`, `documentIntake`, `fmcsaService`. It wipes the
   `vi.fn()` defaults in `setup.ts`'s prisma double and kills whichever file shares the
   worker NEXT, which is Item 318's `ERR_IPC_CHANNEL_CLOSED`. Census and mechanism are
   banked on Item 318. Wants its own commit and its own verification.

2. **R1 — `housekeeping/eol-normalize` must not be merged as-is.** It CONFLICTS with
   origin/main today, two ways: **add/add on `.gitattributes`** (main took a deliberately
   one-file version on 2026-09-23 whose own comment defers the repo-wide job to this
   branch), and a content conflict in `docs/regression-log.md` (both sides appended; 4
   commits on main touched it since the base). `CLAUDE.md` auto-merges clean. **Blast
   radius: 2,288 of 3,239 tracked files are `i/lf w/crlf`**, so merging rewrites their
   working copies in **every one of the 17 worktrees**, 9 of which hold uncommitted work.
   The index is already LF-clean, so **committed history is unaffected** — the risk is
   entirely working-tree churn across concurrent sessions, which is exactly what main's
   scoped version was written to avoid. Also surfaced: **16 files are `i/lf w/mixed`**.
   Resolution when taken up is easy — the branch's `*.mjs text eol=lf` already covers
   main's single line — but it should land when few worktrees are live.

3. **`arc/finding-b-retendered`'s worktree was NOT pruned** though it is clean and merged.
   Its head was 16 minutes old at prune time: that session is live, and a clean tree right
   after a push is the normal state of an active session between commits. Removing it
   would have broken a running session's context. Re-check before pruning it later.

4. **Letters bjc/bjd/bje/bjf/bjg interleave two sessions** and are continuous with no
   duplicates. The footer was resolved MONOTONIC during the rebase (bje kept at the C1
   step) because a footer that regresses reports a wrong version in the UI; bjc is still
   claimed via its commit subject, which the guard reads.


## cleanup arc (`v3.8.bjb`) — C1/C2/C3/C4/C5 + R1

Branch `arc/cleanup`, based on `origin/main` `7b799bad`. Commits `4f82d966`,
`91c31c7c`, `b5dfeebb`.

### C3 — the single BOOKED→AT_PICKUP edge is an instrument artifact, not a defect

Traced per the brief: which load, which actor, which code path, and whether
DISPATCHED was skipped by the UI or by the API. **No code path was found that
lets a load skip DISPATCHED.** The AE map does not allow `BOOKED → AT_PICKUP`;
the CARRIER map does (`loadStateMachine.ts:51`), deliberately, because a
carrier reporting arrival is not making an AE's dispatch decision. The edge the
transition observer recorded is therefore a legitimate carrier-side move that
the AE-actor lens tags `expected:false` — the observer judges AE then AUTO and
has no CARRIER branch, so a carrier's own legal transition reads as unexpected.

**Nothing was allow-listed, per the brief.** The edge is not widened and no map
changed. What this says about the Item 194 A1 enforcement gate is the useful
part: `unexpected_cumulative` counts carrier-legal moves alongside genuine
surprises, so the gate's "zero across a full deploy cycle" condition is
measuring a number that cannot reach zero while carriers report arrivals.
**Before enforcement is decided, the observer needs a CARRIER branch** — that is
a change to the instrument, not to the machine, and it should land before
anybody reads the counter as a defect count.

The per-row identifiers came from a read-only production query run in-session
and since deleted; they are in the session transcript rather than reproduced
here, because re-deriving them needs another production read and the
conclusion does not depend on them.

### C4 — HALT. The Item 317 remap is NOT shipped, and the reason is one consumer

The ruling: a load at the pickup dock is not picked up, so `AT_PICKUP` should
map to the nearest PRE-pickup `ShipmentStatus`, and `PICKED_UP` should come
only from Load `PICKED_UP` or later. The brief's own gate was: list every
trigger, email or billing step keyed on Shipment `PICKED_UP`, and HALT if any
would fire differently.

**One would, and it is the one that reaches a human.** `runPreTracing`
(`schedulerService.ts:75-77`) selects `status IN ("BOOKED","DISPATCHED")` with
a pickup date inside 48 hours and emails the carrier to confirm they are on
schedule. Remapping `AT_PICKUP` to the nearest pre-pickup status puts it in
that set — so the platform would email a carrier who is **standing at the dock**
asking whether they will make the pickup. That is worse than the mislabel the
change was meant to fix, because the mislabel is internal and the email is not.

**Every other consumer is unaffected, checked individually:** `runLateDetection`
selects `IN_TRANSIT` only; `Shipment.actualPickup` has no reader;
billing aggregates filter on `customerId` and never on shipment status; the
shipper portal's `mapLoadStatus` reads the LOAD status, not the shipment's.
`shipmentStatusFor.ts` is unchanged (`AT_PICKUP: "PICKED_UP"`, and
`setActualPickup` on AT_PICKUP/LOADED/PICKED_UP).

**What unblocks it:** gate `runPreTracing` on something that cannot include a
load already at the dock — exclude `AT_PICKUP` explicitly, or key the sweep on
the load rather than the shipment — and then the remap is safe. That is a
separate commit with its own proof, and it is a decision about who gets
emailed, which is why it was not folded in here.

### C5 — what shipped, and the one thing deliberately not built

Shipped: `stamp-build.mjs` (postbuild → `out/build-info.json`), a `_headers`
no-store rule for that path, `check-pages-deploy.mjs`, a 7-case guard, and the
CLAUDE.md §2.5 rule that frontend deploy verification is this script rather
than an Actions job name.

**NOT built: Cloudflare API mode.** No credential exists anywhere — `git grep`
finds none in the repo, `env` has none, `gh secret list` holds only
`RENDER_DEPLOY_HOOK_URL`, and the Cloudflare MCP server needs an authorization
no non-interactive session can perform. It would have shipped unexercisable.
The stronger reason is that the API reports what Cloudflare RECORDED while the
marker reports what a browser RECEIVES, and only the second is what a halt card
claims. If it is ever wanted it is additive, behind
`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_PAGES_PROJECT`,
reporting the deployment stage ALONGSIDE the served check and never instead of
it.

**ANSWERED BY OBSERVATION, and it was the one thing that decided whether the
check could ever pass.** Cloudflare's build command is dashboard state and
could not be read from here; if it were not `npm run build`, the `postbuild`
hook would never fire and no marker would ever be served. The deploy of
`e5e53834` settles it: Cloudflare serves
`{"sha":"e5e53834...","source":"CF_PAGES_COMMIT_SHA","ref":"main"}` with
`Cache-Control: no-cache, no-store, must-revalidate` and no `cf-cache-status`.
The stamp ran, so `npm run build` ran. **`source` is the load-bearing field**:
it says Cloudflare's own env var supplied the sha, not a fallback — all three
branches of `resolveSha()` are now exercised on their real platforms (`git`
locally, `GITHUB_SHA` in CI's frontend job, `CF_PAGES_COMMIT_SHA` here).

The exit-2 path stays as the diagnostic for the day this stops being true,
and it names that cause. **One cause it does NOT name:** Cloudflare Pages
auto-deploy being switched off for the project would also produce exit 2, and
the message points only at the build command. If it ever fires, check both.

### R1 — the CRLF census (report only; nothing executed)

Full text in `docs/claude/backlog-open.md` Item 268. The headline: **the brief's
premise is falsified — 0 tracked files carry CRLF in the index**, so there is
nothing to renormalize. The defect is checkout smudging from SYSTEM-scope
`core.autocrlf=true`, and the complete fix has sat unmerged on
`housekeeping/eol-normalize` (`9006bbb3`) for 16 days while `origin/main`
carries a one-rule subset of it.

### OPEN — the repository state that outlives this arc

1. **Local `main` and `origin/main` have DIVERGED: 163 behind, 34 ahead.**
   Local `main` (`b4aa9c80`) is not a descendant of `origin/main` (`7b799bad`)
   and carries 34 unpushed commits of real feature work (`v3.8.bfy`→`bha`: RC
   countersign, settlements, BOL gating) plus Items 302-304. **Its CLAUDE.md is
   5,978 lines; `origin/main`'s is 1,203** — origin/main holds a consolidation
   that moved §13.3's items into `docs/claude/backlog-open.md`, and local main
   predates it. A session reading the main checkout's CLAUDE.md is reading the
   stale document. **Not this arc's to resolve**, and nothing here touched local
   `main`. Whoever owns those 34 commits needs to rebase them onto the
   consolidation before they can land.
2. **The transition observer has no CARRIER branch** — see C3. Blocks a
   meaningful reading of `unexpected_cumulative`, and therefore blocks the
   Item 194 A1 enforcement decision.
3. **`runPreTracing` must stop reaching loads at the dock** before the C4 remap
   can ship.
4. **`housekeeping/eol-normalize` is a decision, not a design** — merge it when
   the dirty-worktree count is lowest (today 12 of 19).
5. **`inject-chrome.mjs` dirties two tracked files on every Windows build** with
   an empty content diff. Merging (4) fixes it; until then they must never be
   staged.

---

## RC countersign + acceptance arc — carried follow-ups

Four findings surfaced during the C4/C5/C6/C7 arc and **deliberately not built
in it**. Each is real, each was verified against the code at the line cited,
and each needs a decision before it needs a commit. Recorded here so the next
session does not re-derive them (§19 Sub-pattern 15: a stale or absent backlog
row is read exactly when somebody is deciding whether to build something).

Arc range: `v3.8.bgl` → `v3.8.bgy`. Nothing below is a regression introduced by
that arc.

---

## 1. Acceptance-rate scoring cannot see an accept-on-behalf

**Where.** [`backend/src/lib/tenderScoring.ts:117`](../backend/src/lib/tenderScoring.ts#L117)
— `acceptanceRate: judged > 0 ? (accepted / judged) * 100 : null`, where
`accepted` counts `LoadTender.status === "ACCEPTED"`.

**The finding.** `LoadTender` has **no `onBehalf` column** — confirmed against
`schema.prisma`, the model carries no actor field of any kind. So a tender an
AE accepted on the carrier's behalf is indistinguishable, at scoring time,
from one the carrier accepted themselves. §9 weights acceptance rate at 10% of
the Compass composite, so an AE's administrative act moves a carrier's score.

**It cuts both ways, which is why it needs a decision rather than a patch.**
Crediting a carrier for an accept they did not make inflates the score;
refusing to credit it deflates a carrier who agreed by phone and had an AE
record it. Neither is obviously right, and the answer is a policy about what
acceptance rate is *measuring* — responsiveness to tenders, or commitment to
loads.

**What the arc changed that makes this newly fixable.** C4a put the actor on
the LOAD: `carrierAcceptedVia` and `carrierAcceptedByUserId` now record which
act produced the stamp and who performed it (R8b), and the waterfall's
`acceptPosition` already computes an `onBehalf` boolean it then discards. The
evidence exists; the scorer reads a different table.

**Shape.** Either persist the actor on `LoadTender` at accept time and have
`tenderScoring` partition on it, or have the scorer join `Load` and read the
C4a columns. The second needs no migration and is the reason to prefer it;
the first is cheaper to query. Decide the policy first.

---

## 2. `STATUS_CONFIRMED` and `STATUS_BOOKED` have no reachable writer

**Where.** [`frontend/src/lib/acceptanceVia.ts`](../frontend/src/lib/acceptanceVia.ts)
carries both as labels; nothing in `backend/src` stamps either.

**The finding.** `carrierUpdateStatus` was deleted in v3.8.akc, and the
surviving carrier status route admits `AT_PICKUP..DELIVERED` only. The CARRIER
transition map has CONFIRMED and BOOKED as *source* states, never targets a
carrier can write. So no live path can produce either via value.

**Deliberately left in place.** They are kept as labels, not as writers: if a
row ever did carry one — a backfill, a data fix, a path added later — the UI
would otherwise render the raw enum to an AE. Two dead entries cost nothing;
an unlabelled stamp on a surface used to decide whether to pay costs something.

**Decision needed.** Either (a) confirm they are permanently unreachable and
drop them from the `via` vocabulary entirely, or (b) leave them and say so in
R8b so the next reader does not mistake their presence for a live path. Do NOT
build a writer for them — that is the dead-field pattern this codebase keeps
unpicking.

---

## 3. The typography guard's `SURFACES` list is incomplete by construction

**Where.** [`frontend/src/components/ui/typeScale.test.ts`](../frontend/src/components/ui/typeScale.test.ts)
— the guard walks an enumerated `SURFACES` list.

**The finding.** A file outside that list is not checked at all. This was
found the hard way in the arc: `ExecutionEvidencePanel.tsx` shipped with
`text-[10px]` eyebrows, below §2.1's hard 11px floor, and the guard was green
— not because the type was right but because the file was not in its list. The
file was added and the reach-count went 12 → 13.

**Why this is the dangerous shape.** The guard's name implies coverage of the
type scale; its assertion covers the type scale *of twelve named files*. That
is §19 Sub-pattern 16 exactly — the check ran, and it was not checking the
thing its name implied. Every new component is unguarded until somebody
remembers to add it, and nothing makes them remember.

**Shape.** Invert it: walk every `.tsx` under `src/` and allow-list the
exceptions, so a new file is covered by default and an exemption has to be
written down with a reason. Same shape as the census guards this arc used
(`carrierPickerCensus`, the writer-drift guards) — those freeze a population
and fail on growth, which is the property a list-based guard lacks. Cheap, and
it retires a whole class rather than one file.

---

## 4. Orphaned E2E backend holds port 3110 (§13.3 Item 291.13)

**Symptom.** `test:e2e:local` refuses on 3110 already in use, or a run adopts a
backend from a *different worktree* and the two suites race one database.

**Cause.** `playwright.config.ts` pins 3110/4100 for every worktree and
`reuseExistingServer` is on outside CI, so ownership is decided by which
process got there first rather than by which tree it belongs to. Item 291.13
records a run that killed a concurrent session's backend under the rule
"anything that started after preflight is ours".

**The discriminator that works** (used repeatedly in this arc): 4100 free and
no Playwright browser running ⇒ the 3110 listener is a leftover, not an active
run. **Verify the process command line points at THIS tree before stopping
it** — that is the step Item 291.13's incident skipped.

**Shape.** Per-worktree port pairs derived from the worktree path, or an env
pair that both `run-local.mjs` and `playwright.config.ts` read — the way
`E2E_LOCAL_CONTAINER` / `E2E_LOCAL_PG_PORT` already scope the database. Plus a
cleanup that checks the pid's command line before killing. Until then, run with
explicit ports and do not trust the default.

---

*Recorded 2026-09-23, end of the C6/C7 close-out.*
