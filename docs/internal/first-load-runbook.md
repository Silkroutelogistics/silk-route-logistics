# First load — runbook

For the person running load one with a truck waiting. Read the stage you are at, not the whole thing.

**Escalation, before anything else goes wrong:**

| Situation | Who | Contact |
|---|---|---|
| Insurance, COI questions, certificate wrong | Sandy — Hancock & Associates | (agency line on the COI) |
| Anything legal — agreement wording, a carrier disputing terms | Dirk Beckwith — Foster Swift | (firm line) |
| Carrier says they were not paid, or a Quick Pay dispute | accounting@silkroutelogistics.ai |
| Fraud, double-brokering suspicion, identity doubt | compliance@silkroutelogistics.ai |
| Anything operational, mid-load | operations@silkroutelogistics.ai |

**If you are unsure whether to stop the truck: stop the truck.** A delayed load costs a conversation. A load moving on a carrier who should not have it costs the bond.

---

## Stage 1 — Before the carrier exists

**Screen:** `/dashboard/carriers`

The carrier registers themselves at `/onboarding`. You do not create them.

What they will hit, in this order, so you can answer the phone when they call:

1. **MC/DOT lookup** — pulls FMCSA. If it says the authority is under 18 months, that is the age gate, not a bug.
2. **Email verification** — they must click a link. If they say it never came, resend from the carrier record; do not skip it.
3. **Two-factor setup — this is mandatory and it is a wall.** They cannot reach any part of the portal until an authenticator app is paired. Backup codes are shown **once** and cannot be recovered, by design. If they lose their phone and their codes, they email operations@ and we verify them before resetting. **Never reset 2FA on a phone call alone.**
4. Application, then W-9 and COI upload.

**Before you approve — check, in the compliance tab:**
- FMCSA authority active, and 18+ months old
- COI: cargo and auto liability meet minimums, **and the expiry date is in the future**
- W-9 present
- Compass vetting ran and you have read the output — not just the grade

**Do not approve to unblock a load.** An approval is a statement that this carrier can be trusted with someone else's freight.

---

## Stage 2 — Agreement

**Screen:** carrier record → agreements

The carrier signs the Broker-Carrier Agreement in their portal. Until that row exists and reads SIGNED, **tendering is hard-blocked** and you will not be able to work around it from the AE side. That block is deliberate.

**Verify:** open the executed BCA PDF. It should show their typed name, title, timestamp, IP, and the agreement version. If any of those are blank, stop and raise it — that document is the evidence if this ever goes to a claim.

---

## Stage 3 — The load and the rate confirmation

**Screen:** `/dashboard/loads` → New Load, or the Order Builder

**Before you send the rate confirmation, open the PDF and read it.** Not the preview — the PDF. Check, in this order:

1. **The pay figure is what you agreed with the carrier.** Read the Linehaul line and the Total Carrier Pay line and confirm both against your own note of the deal. This is the number that binds SRL.
2. Pickup and delivery facilities named, with cities — not just the billing customer
3. If reefer: setpoint and continuous-run shown, and not cut off
4. Detention, TONU and layover terms present
5. Carrier acceptance block on the last page

**Why step 1 is first:** the rate confirmation is a binding document. A wrong number on it is not a typo you can correct later by explaining — the carrier has a signed page that says otherwise.

Send it. The carrier gets an email with the PDF and accepts in their portal with a countdown running. If they let it expire, the tender lapses and the load returns to the board.

---

## Stage 4 — Quick Pay, if they ask

Quick Pay is a **limited pilot**: the carrier requests it, we approve or decline. Reaching a tier does not grant it.

The carrier will be asked for an authenticator code to turn it on. That is step-up verification, not a fault. Same on any insurance update.

---

## Stage 5 — The BOL, before the truck arrives

**This is the document the driver hands the shipper at the Lebanon dock. If it is not in the driver's hands, the freight does not move.**

Generate it from the load, open it, and confirm:
- Shipper and consignee blocks correct
- Commodity, weight, piece count match what BKN told you
- Seal line present
- One page

Then **get it to the driver yourself — email it.**

**There is no carrier-portal download for the BOL.** Verified Arc 15: `GET /api/pdf/bol-load/:loadId` is gated to ADMIN, CEO, BROKER, DISPATCH and OPERATIONS; CARRIER is not on that list, the carrier load-detail response does not return `bolUrl`, and nothing populates that column. You are the only route this document has to the dock.

Confirm the driver has it before pickup day. Do not assume.

---

## Stage 6 — In transit

Advance status as it happens: dispatched → at pickup → loaded → in transit → at delivery → delivered.

**Check calls:** when the carrier reports in through the portal, the scheduled call closes itself. If they text or phone you instead, log it — an uncleared schedule row will chase them and then count against their score for a call they actually made.

---

## Stage 7 — POD and money

POD is due **within 24 hours of delivery**. That is what the rate confirmation promises them and what their score is graded on.

When it lands, the load moves to POD received and an invoice is generated automatically.

**Verify the invoice exists.** Do not assume — invoice generation is non-fatal in that path, meaning if it fails, nothing shouts. Open `/accounting/invoices` and confirm the row is there.

**Then open the invoice PDF and check it against the rate confirmation, side by side:**
- The load reference is the same on both
- Accessorials on the invoice match what was actually authorised
- **The carrier's pay does not appear anywhere on the customer's invoice.** BKN's AP department must never see what we pay the carrier.

Then the settlement: confirm the carrier payable exists, and that any Quick Pay fee matches the rate elected at the time — not today's tier.

---

## If the load dies before it moves

TONU. Record the fault side when you cancel — you will be asked, and it is required. You know whose failure it was at that moment; nobody can reconstruct it a week later.

---

## The one-line version

Read every PDF before it leaves. Approve nobody to unblock a load. Get the BOL into the driver's hands before pickup day. Confirm the invoice exists rather than assuming it did.
