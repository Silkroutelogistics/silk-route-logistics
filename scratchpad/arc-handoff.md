# Carried follow-ups — most recent arc first

Each section is one arc's findings that were deliberately NOT built in it.
Nothing below is a regression introduced by the arc it sits under.

---

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
