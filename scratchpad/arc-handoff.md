# RC countersign + acceptance arc — carried follow-ups

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
