# Un-cancel — Phase A scoping (read-only)

**Status:** scoping only. No code written. Produced 2026-09-23 from the SRL-121495
reversal, which had to be done by one-off script because no un-cancel exists.

**DECIDED 2026-09-23 by Wasi.** Four rulings, binding on the build:

1. **Q4 — refuse un-cancel when a TONU has been billed** (v1). The ledger has no
   inverse; reversing a billed TONU is its own decision, not a side effect of
   this one.
2. **Q6 — ADMIN/CEO only, 72-hour window** from `cancelledAt`.
3. **The un-cancel must emit a carrier reinstatement notice** — not optional, and
   not an email: in-app, through the existing notification service. The
   SRL-121495 repair proved the shape (`createNotification`, `LOAD_UPDATE`, keyed
   on its `actionUrl` so a re-run cannot send a second).
4. **Q1 — cancel must EXPIRE `trackingToken`, never NULL it.**

Q2 (before-image snapshot) and Q3 (single Load→Shipment mapper) stand as written
below; nothing in the rulings contradicts them.

**The gap in one line.** `CANCELLED: []` is terminal in both the AE and AUTO maps
of [`lib/loadStateMachine.ts`](../../backend/src/lib/loadStateMachine.ts), and
`updateLoadStatus` enforces it with a hard `400 TERMINAL_NOT_ALLOWED`. The only
endpoint named "restore" — `PUT /loads/:id/restore` — un-*archives* (clears
`deletedAt`) and deliberately leaves `status` alone; its own audit row records
`previous.status === new.status`. So there is no path back, and the frequency is
not trivial: **5 of 29 production loads are `CANCELLED`, plus one `TONU`.**

---

## 1. The cascade, write by write

Three call sites fire on a cancel: the shipment sync inside `updateLoadStatus`,
`cascadeLoadCancellation`, and the fire-and-forget `onLoadCancelledOrTONU`.

| # | Column / row | Before → after | Recoverable today | Inverse + existing function | The inverse must NOT fire |
|---|---|---|---|---|---|
| 1 | `Load.status` | prior → `CANCELLED` | **Yes** — prior status is in the `AuditTrail` CANCEL row (`changedFields.previous.status`) | Write prior status. No function; `updateLoadStatus` refuses from terminal | Forward side effects: `onLoadDispatched` on DISPATCHED, and on DELIVERED `autoGenerateInvoice` + `onLoadDelivered` |
| 2 | `Load.cancellationReasonCode` / `cancellationReason` | null → code + note | **Yes** — same audit row | Null both | — |
| 3 | `Load.tonuFaultSide` (TONU only) | null → CUSTOMER/CARRIER/BROKER | **Yes** | Null it | Must not silently drop a raised TONU obligation — see Q4 |
| 4 | `Shipment.status` | prior → `CANCELLED` | **No.** The sync overwrites in place and the prior value is recorded nowhere | Map from restored `Load.status` — see **Q3** | — |
| 5 | `Load.trackingToken` | uuid → **NULL** | **NO — permanently lost.** See §2 | None possible. `@default(uuid())` applies only at INSERT | — |
| 6 | `ShipperTrackingToken.expiresAt` | future → `now()` | **Yes** — row is expired, never deleted | Push `expiresAt` forward. `refreshBOLTrackingTokenExpiry` exists and never shortens | Must not mint a second token; the carrier/shipper already hold this link |
| 7 | `RateConfirmation.status` + `signTokenHash` | DRAFT/SENT → `VOID`, token nulled | **Partially.** Status is recoverable; the signing token is a hash and is unrecoverable | Re-issue through the RC issuance path, not an un-void | **Never touch SIGNED or FINALIZED.** `voidLiveRateConfirmations` already excludes them — that exclusion is why SRL-121495 survived |
| 8 | `LoadTender.status` + `deletedAt` | OFFERED/COUNTERED → `WITHDRAWN` + soft-deleted | **Yes** — `statusReason: "load_cancelled"` identifies exactly this set | Clear `deletedAt`, restore prior state via `tenderTransitionService` | **Never write `DECLINED`.** §9 scores acceptance at 10% of Compass; these carriers never answered. `withdrawLiveTenders` scopes to `LIVE = OFFERED \| COUNTERED`, so ACCEPTED/RC_SENT/CONFIRMED were never touched |
| 9 | `ShipperCredit.currentUtilized` | n → n − invoiceAmount | **Yes**, arithmetically | Re-increment by the same amount | Only fires if the load had been delivered. Re-incrementing an undelivered load would double-count |
| 10 | `CarrierPay.status` | not PAID/VOID → `VOID` | **Yes** | Restore prior status | Must not un-void a `PAID` row — the guard already excludes PAID |
| 11 | `ApprovalQueue` entries | open → cancelled | Yes | Re-open | — |
| 12 | `Invoice.deletedAt` (archive path only) | null → set | **Yes** — `restoreLoad` already does this | `restoreLoad` | — |
| 13 | `LoadActivity` / `AuditTrail` / `AuditLog` | rows appended | n/a — append-only | None. The inverse ADDS a row, never removes one | — |
| 14 | Carrier notifications | 2 rows written | n/a | None. Add a reversal notice — see §3 | — |

**Verified on SRL-121495** (production, read-only): rows 5, 6, 8 and 14 all fired;
row 7 correctly did **not** (the RC was SIGNED); rows 9, 10, 11 were no-ops (no
invoice, no carrier pay, never delivered); row 4 fired via the sync, which is why
the cascade logged `0 shipment(s) cancelled`.

---

## 2. `Load.trackingToken` is destroyed, not expired

The sharpest finding, and it answers **Q1**.

```prisma
trackingToken String? @unique @default(uuid())
```

`cascadeLoadCancellation` sets it to `NULL`. A Prisma `@default` applies **only at
INSERT**, so the ORM can never regenerate it — and a census of `backend/src`
confirms **no code anywhere writes this column**. The only writer is the cascade
nulling it. The value is gone for good.

**Production:** 23 of 29 loads hold one; the 6 without are the cancelled ones.

**Who actually depends on it** (traced, not assumed):

- **Driver tracking / check-calls: NO dependency.** `driverPingToken`,
  `driverPingService` and `checkCallAutomation` contain zero references;
  `CheckCallSchedule` keys off `carrierPhone`.
- **BOL QR: NO dependency.** `pdfController` mints from `ShipperTrackingToken`.
- **Shipper email tracking links: YES.**
  [`shipperLoadNotifyService.ts:51`](../../backend/src/services/shipperLoadNotifyService.ts#L51)
  omits the "Track Shipment" button entirely when it is null, and `:235` falls
  back to `shipperCode`, which is **null on all 29 production loads**.
- **Public `/track`: fallback only.** `trackingController` resolves
  `ShipperTrackingToken` first, so the primary path is unaffected.

**Q1 — expire rather than NULL: DECIDED YES (Wasi, 2026-09-23).** Add
`trackingTokenRevokedAt DateTime?`, leave the uuid in place, and have the two
readers treat a revoked token as absent. Callers to change are exactly three:
`trackingController:146` (fallback lookup), `shipperLoadNotifyService:51` and
`:235`. This makes the cancel reversible instead of destructive and costs one
nullable column.

**Consequence for SRL-121495, unresolved:** when it reaches DELIVERED the shipper
delivery email will carry **no Track Shipment button**. Not fixed here — there is
no generation function to call, and inventing a uuid by hand is the one thing the
brief forbids. Q1 is the fix.

---

## 3. The carrier was told it was cancelled, and never told otherwise

Production, verified: JETEX FREIGHT LLC (`trucks@jetexfreight.com`, APPROVED,
active) received **two** notifications at 19:50:47Z — `LOAD_UPDATE` *"Load
Cancelled … Please check your dashboard"* and `LOAD_STATUS` *"… is now
CANCELLED."* No reversal notice exists, because nothing can issue one.

Their portal now shows the load at `AT_DELIVERY` while their notification history
says it was cancelled. **Any un-cancel must notify the same recipients the cancel
did**, or it leaves the carrier holding a contradiction.

**Carrier-portal visibility needs no repair.** Simulating `/my-loads` against
production returns SRL-121495 at `AT_DELIVERY`; every filter passes — `carrierId`
matches the User id, `deletedAt` is null, `AT_DELIVERY` is in the chip list,
`ownTenders` matches on `carrier.userId`, and the BOL gate
(`carrierAcceptedAt OR signed RC`) passes on the signed RC.

---

## 4. Open questions

**Q2 — before-image snapshot at cancel time: YES, and it subsumes most of §1.**
Rows 1, 2, 3, 4, 8, 9, 10 are only recoverable today because they happen to be
reconstructible from audit rows, and row 4 already is not. A
`cancellationSnapshot Json?` written inside the cancel transaction makes the
inverse a replay rather than a reconstruction. **This is the highest-value single
change in the arc** — without it every future column added to the cascade is
silently unrecoverable.

**Q3 — single Load→Shipment mapper: YES. This already bit.** `ShipmentStatus` is
an 8-value billing projection with no `AT_PICKUP`, `LOADED`, `AT_DELIVERY`,
`POD_RECEIVED`, `INVOICED` or `TONU`. §13.3 Item 160 banked it as latent,
predicting it would fire the first time a flow read `Load.status` and wrote it to
`Shipment.status`. **The reactivation script was that flow** and threw on
`AT_DELIVERY` until a local mapping was added. That mapping must move into
`lib/` and be used by every writer — `updateLoadStatus`'s sync, the cascade, and
the inverse — or the third copy drifts.

**Q4 — TONU billed: DECIDED — refuse un-cancel entirely in v1 (Wasi, 2026-09-23).** The inverse would have to reverse the ledger row, and cannot today.
`recordTonuObligation` writes one `LoadAccessorial` row, and
`raiseTonuCarrierPayable` / `raiseTonuCustomerCharge` raise both legs. Nothing
reverses them. An un-cancel from TONU that leaves the obligation standing bills a
customer for a truck that then ran. **Recommendation: refuse un-cancel from TONU
in v1** and handle it as a separate, later decision (§13.3 Item 277 is already
open on the TONU/cancel vocabulary).

**Q5 — carrier released or re-tendered: NEITHER, and that is correct.** The
cancel deliberately does not touch `Load.carrierId`
(`cascadeLoadCancellation`'s own header says so), and `withdrawLiveTenders` scopes
to `OFFERED | COUNTERED`, so an ACCEPTED/CONFIRMED carrier keeps both the
assignment and the tender. SRL-121495 confirms it: tender still `CONFIRMED`,
`carrierId` intact. **The inverse must not re-tender** — that would issue a second
offer to a carrier who already holds the load. If the tender *was* withdrawn
(load cancelled while still out for offer), restoring it is right; if it was
never touched, doing nothing is right.

**Q6 — time window and role gate: DECIDED — ADMIN/CEO only, 72-hour window (Wasi, 2026-09-23).**
**ADMIN + CEO**, matching the carrier-approval-class authority already used for
agreement termination, since an un-cancel re-commits a carrier and can re-raise
money. **72-hour window** from `cancelledAt`, because the recoverable set decays:
the signing token is gone immediately, and beyond a few days a carrier has
re-planned. Past the window, the honest answer is a new load, not a resurrection.
A reason is required, as with every other lifecycle act.

---

## 5. Size and commit sequence

Each commit under 4 files / 100 LOC.

| # | Commit | Files | ~LOC | Why this order |
|---|---|---|---|---|
| 1 | `Load.cancellationSnapshot` + `trackingTokenRevokedAt` columns, additive migration | schema, migration | 30 | Column before code (§13.3 Item 213) |
| 2 | `lib/shipmentStatusFor.ts` — the one mapper, plus a census test freezing its writers | 2 new | 60 | Q3. Independent; closes Item 160 whether or not the rest lands |
| 3 | Cancel writes the snapshot; token is revoked rather than nulled | `cancelCascade.ts`, 1 test | 70 | Makes the cancel reversible. Ships alone safely — nothing reads either field yet |
| 4 | Three `trackingToken` readers honour `revokedAt` | `trackingController`, `shipperLoadNotifyService`, 1 test | 50 | Q1's read half |
| 5 | `uncancelLoad` service — replays the snapshot, fires no forward side effects | 1 new, 1 test | 90 | The inverse. Refuses TONU (Q4); never re-tenders (Q5) |
| 6 | `POST /loads/:id/uncancel` — ADMIN/CEO, 72h, reason, audit row, carrier notified | `routes/loads.ts`, `loadController.ts`, 1 test | 80 | Q6 |
| 7 | Console affordance on the cancelled-loads view | 1–2 frontend | 60 | Pairs with §13.3 Item 8.2's cancelled tab |

**Remaining deviations.** Q1, Q4 and Q6 are DECIDED (see the header) and the
commit sequence above already reflects them. What is still unchosen is commit 7:
it assumes §13.3 Item 8.2's cancelled-loads tab exists or ships with it, and
today there is no console surface that lists a cancelled load at all — which is
why the button has nowhere to go. Q2 and Q3 remain recommendations.
