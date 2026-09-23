# Tender accept and dispatch — the BOOKED / DISPATCHED divergence

Moved out of `CLAUDE.md` on 2026-09-23. **Load this for tender accept paths, load
status transitions, or the dispatched-today analytics.**

It is here because it is repeatedly re-derived by work that touches tender accept, and
by nothing else. Two things in it are load-bearing and are the reason it was never
"tidied up" into consistency:

- **The direct path books and the bulk paths dispatch, deliberately.** Direct accept is
  AE-curated and BOOKED is a checkpoint a broker reviews before committing dispatch.
  Waterfall and loadboard-bid accept are auto-pilot, where accept *is* dispatch.
- **`routes/waterfalls.ts` queries `dispatchedAt`** for the dispatched-today and
  last-7-days dashboards. Aligning all three paths to BOOKED would silently drop every
  bulk dispatch out of those queries until an explicit advance fired — a real product
  break, which is why P3 (document the divergence, change no code) was chosen.

The retired accounts are kept: the Sprint 39 α resolution and commit 11e's asymmetry
were each correct when written, and the record of why they stopped being correct is
what stops them being reintroduced.

Section numbers unchanged; see `README.md`.

---

### Tender accept → status flip: BOOKED vs DISPATCHED is intentional (Sprint 39 P3 decision)

Three accept paths exist; **DIRECT path produces `BOOKED`, both bulk paths produce `DISPATCHED`.** This divergence is deliberate, not a bug. Documented here so future sprints don't try to "fix" it without considering the operational reasoning + analytics dependency.

| Path | Code site | Status flip | `dispatchedAt` |
|---|---|---|---|
| Direct tender accept (carrier accepts in portal) | `tenderController.acceptTender` | **BOOKED** | not set |
| Direct tender accept-on-behalf (AE override) | `tenderController.acceptTenderOnBehalf` | **BOOKED** | not set |
| Waterfall accept (auto-pilot scoring engine) | `waterfallEngineService.acceptPosition` | DISPATCHED | set |
| Loadboard bid accept (carrier-bid → AE accepts) | `routes/loadBids.ts` accept handler | DISPATCHED | set |

**Operational philosophy:**
- **Direct path → BOOKED:** AE-curated path. Broker manually picked the carrier and intends a separate "send dispatch order" step (rate confirm, BOL, carrier readiness verification). The intermediate BOOKED state is a load-bearing checkpoint where AE can review before committing dispatch. Advance to DISPATCHED is explicit via the "Advance status" button.
- **Bulk paths → DISPATCHED:** Auto-pilot. Waterfall scoring + loadboard bidding are designed for hands-off dispatch where the next operational moment is not a broker decision. Accept = dispatch. Skipping BOOKED matches that semantic.

**Analytics dependency:** `routes/waterfalls.ts:39, 83, 110` queries `dispatchedAt` for "loads dispatched today / last 7 days" dashboards. Aligning all three paths to BOOKED (P1) would silently exclude bulk dispatches from those queries until an explicit advance fires — a real product break, not a theoretical concern.

**Sprint 39 alternatives considered:** P1 (all → BOOKED, breaks analytics + 2-of-3 surfaces touched), P2 (all → DISPATCHED, removes broker checkpoint on direct path), P3 (document divergence, zero code change). Audit-first surfaced the third path (loadbid) and the analytics dependency that flipped the recommendation away from P1. P3 chosen.

**Tracking-link fan-out timing — the customer is told at the SIGNATURE, on every path. Settled 2026-09-01 (v3.8 commit 12c); supersedes the Sprint 39 α resolution and the 11e asymmetry.**

**Sprint 39 α (retired):** `sendTrackingLinkToCrmContacts` fired at the accept moment on every path. The reasoning was to tie the fan-out to the *event* that means committed rather than to a later *state* — and that reasoning still holds. What changed is which event that is. Sprint 39 chose accept because it was the latest signal available; RC_SENT and CONFIRMED did not exist.

**Commit 11e's asymmetry (also retired, after one commit):** direct paths moved to CONFIRMED while the auto-dispatch paths stayed at accept. That was correct at the time and for a specific reason — the auto paths could not reach CONFIRMED, because **the waterfall issued no rate confirmation at all and the loadboard-bid path drafted one and stopped.** No signing link reached those carriers, so a signature was not late, it was impossible. Moving the announcement alone would have stranded every auto-dispatched customer.

**Current rule, uniform:** every accept path issues the rate confirmation, and the customer is told when the carrier signs.

| Path | Issues the RC at accept | Customer told at |
|---|---|---|
| Direct tender accept (`tenderController.acceptTender`) | auto-RC drafted; AE sends | CONFIRMED |
| Load-and-tender drawer (`withTenderController`) | auto-RC drafted; AE sends | CONFIRMED |
| Waterfall auto-pilot (`waterfallEngineService.acceptPosition`) | **drafted AND issued** | CONFIRMED |
| Loadboard bid accept (`routes/loadBids.ts`) | **drafted AND issued** | CONFIRMED |

**Where the signature is obtained differs, and only that.** A carrier who accepted in their own session can be shown the signing step inline. A loadboard bid is accepted by an **AE**, often hours after the bid was placed, so there is no carrier session to show anything in — the emailed link is the whole mechanism there, which is why *issuing* rather than *drafting* is the load-bearing change on that path.

**A carrier who never signs is not a stalled load.** The tender sits at RC_SENT and Needs Attention chases it on `RC_SIGN_SLA_HOURS`, exactly as on the direct path. That is a visible, chaseable state rather than a load that looks finished and is not.

**The fan-out is idempotent** on `Load.trackingLinkSent` (11e). `Load.trackingLinkAutoSend` still governs whether it happens at all.

