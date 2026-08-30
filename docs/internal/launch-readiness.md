# SRL Launch Readiness

**Supersedes `go-live-readiness.md`** (Arc 14, 2026-08-21), which was scoped to the
document chain alone and contained one claim later proved false. This is the single
source. Dated **2026-08-28**, against `main` at the SHA recorded in §2.

---

## 1. The verdict

> **SRL can run its first real load today, and a carrier can now get all the way
> through the door to be run for. The platform's money, compliance and document
> paths are built and proved; what stands between here and launch is not
> engineering but five inputs SRL does not yet hold, and two human passes nobody
> has done.**

The second clause is new as of **2026-08-30** and is the only change to this
verdict since it was written. The acquisition funnel carried two defects when
this report was first published, both found by a real person attempting a real
onboarding rather than by any gate: a rejection that named no field, and a
mailbox proved twice where the second proof was the one Compass auto-approve
waited on. Both are closed (`v3.8.ava`, `v3.8.avb`). **"Last KNOWN defect" is
doing real work in that sentence** — the funnel has still never been walked end
to end by a human, which is exactly how both of these were found and why §3 still
lists that walk as owed.

That sentence is earned by §2 and is only as good as §3, which states plainly what
was NOT re-verified in this session and why. Read both before acting on the first.

---

## 2. The foundation

Every row is artifact evidence gathered in this session unless marked otherwise.

| # | Row | Result | Evidence |
|---|---|---|---|
| a | Reachability gate | **PASS** — `ALL REACHABLE` | 4 checked, 0 dead, 0 test-only |
| a | Schema-drift gate | **PASS** — `NO UNDECLARED READS` | 3 advisory declared-unread routes listed, none undeclared |
| a | `find-prisma-calls` self-test | **PASS** | wrapped `.upsert` found, commented mention ignored |
| a | Version-letter guard | **PASS, and it fired for real** | refused `auy` (held by their `722b1cec`); took `auz` |
| b | Backend tsc | **PASS** | exit 0 |
| b | Backend vitest | **1207 / 1208** | one known red, below |
| b | Frontend tsc | **PASS** | exit 0 |
| b | Frontend build | **PASS** | `Compiled successfully`, warnings pre-existing |
| c | Production `/api/health` | **PASS** | `sha 722b1cec`, `schema 20260824190000_add_session_portal` |
| c | Public surfaces | **PASS — 17/17** | monitor's own probe list, shape-asserted |
| c | Cache-busted bundle | **PASS** | `200`, 45,411 b |
| d | Live migrations dir | **PASS — P0 rule holds** | zero stray files |
| d | Held-work ledger | **PASS** | 5 holds listed; #5 correctly marked RELEASED |
| g | Compass count guard | **PASS — 34 pinned** | 5/5, every public surface held to the code |

**The one known red: `urlSafety > allows public hostnames`.** It is a 5-second
timeout on a live network call to `hooks.slack.com`, red on a clean tree in this
sandbox and **green in CI** — verified green on CI runs of `d9afae62` and earlier.
Environmental, not a defect. An earlier session of mine mis-attributed a second red
(`loadController`) to the concurrent session; CI proved it green, so that
attribution was wrong and is corrected here.

### Rows NOT re-run this session — say so rather than imply a pass

The Docker daemon was not running, so every container-backed proof was unavailable.
These stand on their last recorded run, with the arc that produced them:

| Row | Last result | When |
|---|---|---|
| e — Session harness | **16/16** | Arc 34, `9e30d784` |
| f — Money path (per-creation-path rate proof) | **14/14** | Arc 16, re-run in Arc 21 |
| g — Five absolutes un-waivable under a blanket | **32/32** | Arc 27 |
| g — Chameleon block exit | **9/9** | Arc 24 |
| h — Acquisition loop (invite → verify → wizard → approve) | **21/21** | Arc 33 |

None was re-run today. Each was injection-verified when written, and the code paths
they cover are unchanged since — but "unchanged since" is an inference from the diff,
not a fresh execution, and it is recorded as such.

**Session census, last taken 2026-08-26:** `staff_sessions` 6 rows, **0 sign-ins
within 7 days**. The one-time policy rollout signed out nobody.

---

## 3. Carve-outs — what is genuinely not done

### Two human passes nobody has performed

1. **A human eye-pass over the four rendered PDFs.** Text extraction is conclusive
   for wording, citation, figures and footers; it cannot see colour, overprint, a
   wrong-hue border, or a mark landing a few points off. Arc 14 walked the document
   chain by extraction and explicitly did not do this.
2. **A production portal walk as a real carrier.** Every session, compliance and
   approval guard is proved at unit and container level; nobody has signed in to
   production as a carrier and driven onboarding → tender → POD end to end. The
   surfaces most exercised by automation are the ones least walked by a person.

### Five inputs SRL does not hold, and exactly what each releases

| Input | Releases |
|---|---|
| **PITR connection string** | **CLOSED — window expired 2026-08-27.** Item 212's forensic question is unanswerable. Circumstantial evidence accepted: zero repo references and `git log -S` empty across all three dropped columns for all history. Off the ledger; appears in no future command. |
| **`RENDER_DEPLOY_HOOK_URL`** | Four destructive holds merge (`retire-load-rate`, `retire-fleet-module`, `retire-asset-drivers`, `drop_dead_load_ref_fallbacks`) **and** closes the red-CI-to-production path — today a commit deploys whether CI passes or not. Highest-leverage single input. |
| **Google Cloud consoles** | Staff SSO wakes (built, dormant, credential-less) and carrier OAuth becomes buildable. Item 238 records why building it dark was refused. |
| **Counsel `.docx` package** | Item 203, plus §16 blockers #1 and #2 — the Broker-Carrier Agreement and Caravan Quick Pay Agreement are signed by carriers today and have never been through a Michigan commercial attorney. |
| **147C letter chain** | A2P 10DLC registration, CNAM, and Tipalti. Driver SMS is legally shippable (STOP/HELP honoured) but unregistered. |

### Ratified but not implemented — do not describe as live

- **TONU two-sided billing** — the ledger obligation is recorded on both sides; no
  settlement path posts it. §14 carries the detail.
- **The 4-hour carrier release window** — printed on the Rate Confirmation, enforced
  by nothing, and the grid does not yet name the releasing party.
- **Quick Pay §8 ineligibility conditions** — stated as a right Broker may exercise,
  not an automatic state, precisely because no charge path checks them.

---

## 4. Post-launch register

Each carries an owner and a trigger, so nothing becomes forgotten by default.

| Item | Owner | Trigger |
|---|---|---|
| ~40 unmarked `refetchInterval` polls | Platform | A user reports a session that never times out |
| Shipper's divergent warning modal | Design | Any visual refresh of the shipper portal |
| Driver portal outside the session policy | Product | **Any non-training write on the driver surface** — accepting a load, POD upload, HOS entry (trigger stated in code) |
| `Load.rate` column meaning | Platform | Merging `hold/retire-load-rate` |
| Fleet module retirement | Business | Decision on whether an equipment register is wanted at all |
| Chameleon HIGH hard-block scope | Compliance | First false positive on a real carrier |
| Compass VIN/HOS checks | Compliance | Only if a carrier-owned equipment model is built |
| Item 240 review-flow affirmative walk | Ops | Before the second carrier is approved |
| Mid-wizard survival proof (Arc 34 1e) | Platform | Any change to the onboarding draft or the session policy |

---

## 5. First-load runbook

[`first-load-runbook.md`](first-load-runbook.md) remains accurate for the document
chain and the dispatch sequence. **One screen it describes has changed since it was
written:** the AE carrier panel no longer synthesizes a Compass check list when
vetting is unavailable — an absent verdict now renders as an amber "vetting did not
run" panel with no score, grade or recommendation. The runbook's instruction to read
the Compass verdict before approving is unchanged and is now literally true; there is
no longer a fallback display that could be mistaken for one.

The runbook's standing caveat also holds: **the BOL has no carrier-portal path.** The
generator works and the AE can produce it; a driver cannot fetch it themselves.

---

## 6. What would change this verdict

State it plainly so the verdict cannot quietly rot:

- A **failed human PDF pass** — a mis-rendered legal document is a launch blocker.
- A **failed production carrier walk** — the one path never driven by a person.
- **Counsel returning material changes** to either agreement.
- Any **non-training write** landing on the driver surface without re-ratifying the
  session exception.

Absent those, the engineering foundation is launch-ready and the remaining work is
procurement, legal, and two afternoons of human verification.
