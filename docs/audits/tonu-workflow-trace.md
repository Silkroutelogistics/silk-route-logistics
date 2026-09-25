# R1 — why issuing a TONU on a cancelled load required an un-cancel

**Report only. Nothing here was built.** Traced 2026-09-25 against
`arc/writepath-repair` at `5536266d`, with production state read read-only as
`srl_readonly`.

The question: SRL-121496 was cancelled, and issuing its truck-order-not-used
charge required un-cancelling it first. Why, and is there a path to add a TONU to
an already-cancelled load?

---

## 1. The answer: three independent walls, any one of which is enough

**(a) The state machine gives CANCELLED no exit at all.**
[`lib/loadStateMachine.ts:92`](../../backend/src/lib/loadStateMachine.ts) is
`CANCELLED: []` — not "a narrow set", but empty. TONU is reachable only from
`BOOKED`, `DISPATCHED` and `AT_PICKUP` (lines 80–82), and `TONU: []` is terminal
too. So `CANCELLED -> TONU` is not a transition the validator will pass, under
the AE map or the AUTO one.

**(b) The money is welded to the status flip.** `recordTonuObligation` has
**exactly one call site** in the whole of `src/`:
[`loadController.ts:901`](../../backend/src/controllers/loadController.ts),
inside the `status === "TONU"` branch of the status-update handler. Everything
downstream hangs off the ledger row it writes — `raiseTonuCarrierPayable` and
`raiseTonuCustomerCharge` fire from `onLoadCancelledOrTONU`, and both read that
row rather than a literal.

There is no "issue a TONU" action. There is only "move this load to TONU", which
happens to bill.

**(c) And the reverse is guarded too.**
[`uncancelPolicy.ts:171`](../../backend/src/lib/uncancelPolicy.ts) refuses to
un-cancel any load carrying a non-rejected TONU ledger row (`TONU_BILLED`), so
the two states cannot be made to overlap from the other direction either. Its own
comment calls this "defensive rather than currently reachable" — correct today,
precisely because of (a) and (b).

**So the only route from a cancelled load to a billed TONU is the one that was
taken:** un-cancel back to the pre-cancel status, then flip to TONU.

---

## 2. What that route costs

It works, and the audit trail it leaves is honest in the sense that every row is
true: a `CANCEL`, an `UNCANCEL`, then a `LOAD_TONU`. Three real events.

Two problems with it, in increasing order of seriousness.

**It records something that did not happen.** The load was never un-cancelled in
any operational sense. It was a truck ordered and not used from the moment the
cancellation was raised; the un-cancel is a manoeuvre to reach a state the
machine will accept, and the record cannot distinguish that from a genuine
reversal that was later re-decided.

**There is a cliff, and it is the real finding.** `uncancelPolicy` enforces
`UNCANCEL_WINDOW_HOURS` from `cancelledAt`. A cancellation that is only
*recognised* as a TONU after that window has closed cannot be converted at all
through supported paths — not because anyone decided a late TONU should be
refused, but because the only route to it happens to run through a reversal that
times out. The carrier is owed $200 either way (§5: SRL or the shipper cancelled;
the carrier was dispatched). Today, past the window, paying them needs a script.

---

## 3. Corroborating detail: 121496 is clean, 121495 is not

Production, 2026-09-25:

| | SRL-121495 | SRL-121496 |
|---|---|---|
| status | `POD_RECEIVED` | `TONU` |
| `cancelledAt` | 2026-09-23T19:50:47.334Z | `null` |
| `cancellationFaultParty` | `SHIPPER` | `null` |
| `tonuFaultSide` | `null` | `CUSTOMER` |

121496 went through the canonical reversal (`services/uncancelLoad.ts`), which
clears **all six** cancellation columns, and its row carries no residue.
121495 went through arc 1's `reactivate-load-121495.ts`, which predates that
endpoint and cleared **two**, which is why C3 exists.

That contrast is the argument for routing this kind of correction through one
named operation rather than a script per incident: the canonical path left
nothing to clean up, and the bespoke one left three columns that took a separate
arc to find.

---

## 4. Proposals — not built, and the recommendation is B

### Option A — allow `CANCELLED -> TONU` in the transition map

One array entry. **Rejected.**

Terminal states being terminal is a property the enforcement gate rests on
(§13.3 Item 194): the observer tags a transition unexpected by checking it
against the map, and widening the map to admit an exit from CANCELLED would
admit it for every cancelled load, not just the ones anyone means. It would also
land on a load whose `cancelCascade` has already voided the rate confirmation,
expired the tracking tokens and cancelled the shipments — so the TONU flip would
have to know not to re-raise any of that, which is knowledge the status handler
does not have and should not acquire.

### Option B — a named "convert this cancellation to a TONU" operation ← recommended

An endpoint in the shape of `uncancelLoad`: ADMIN/CEO, reason required, one
transaction that records the TONU obligation against the cancelled load, moves
the status `CANCELLED -> TONU`, and writes its own lifecycle audit row naming
what it did.

Why this is the right shape:

- **The transition stays illegal for everyone else.** The map is untouched; a
  named operation performs it deliberately, exactly as `uncancelLoad` performs a
  reversal that the map also forbids. Authority and audit ride with the
  operation rather than with the map.
- **The record stops lying.** One event — "this cancellation was a TONU" —
  instead of a reversal that never happened followed by a re-flip.
- **The cliff goes.** It is not a reversal, so `UNCANCEL_WINDOW_HOURS` does not
  apply. Whether a *different* window should apply to a late TONU conversion is
  a policy question worth asking, but it would then be asked on its own terms.
- **It does not fight the existing guard.** `uncancelPolicy`'s `TONU_BILLED`
  check assumes a CANCELLED load carries no TONU row. After this operation the
  load is `TONU`, not `CANCELLED`, and un-cancel refuses on status first
  (`LOAD_NOT_CANCELLED`, `uncancelPolicy.ts:110`) — so the two never meet.
  The only genuinely new state is the instant inside the transaction, which is
  why it must be one transaction.

Open questions it would have to answer, none of them blocking the design:
whether the cascade's already-voided artifacts need any re-statement on a TONU
(probably not — a TONU load has no live paper either), and what the operation is
called on the AE surface so nobody reads it as "undo".

### Option C — decouple `recordTonuObligation` from the status flip

Make the obligation writable by its own action, independent of status.
**Rejected.** It would allow a TONU charge against a load in any status, which
is two doors to one act — the drift this codebase keeps unpicking — and it
separates the charge from the state that justifies it. The charge should remain
a consequence of the load being a TONU, not a thing that can be true beside it.

---

## 5. Related, already banked

- **§13.3 Item 277** — TONU and cancellation are two vocabularies for one event
  (`tonuFaultSide` CUSTOMER/CARRIER/BROKER vs `FaultParty` SHIPPER/…), and
  unifying them is banked. Option B does not depend on that, but both are "TONU
  as a first-class act" work and would read better designed together.
- **§13.3 Item 284** — the TONU Confirmation document. Option B is the operation
  that would issue one for a converted cancellation.
- **§13.3 Item 282** — the customer leg's draft-invoice re-pricing. Unrelated to
  reachability, but it is the other half of TONU billing being trustworthy.
