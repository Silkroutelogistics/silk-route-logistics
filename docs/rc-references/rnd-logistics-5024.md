# RND Logistics (APY Enterprises, Inc. dba) — Rate & Load Confirmation, Load #5024

Retrieved 2026-08-14 from
`https://www.grouprac.com/Documents/5024Rate%20Confirmation.pdf`
(claims-recovery host; the carrier's own copy). Live TMS output, **1 page**.
Load dated 2022-03-14 → 2022-03-15, Rahway NJ → Newville PA, paper bags,
30 pallets / 40,000 lbs, agreed amount $950.00 USD.
Carrier R A C Transport LLC. Individual contact details redacted; company names
retained.

Included deliberately as the **small-broker contrast case**. Load number 5024
against C.H. Robinson's 400126857 and TQL's 33614902 is a fair proxy for
lifetime volume. The interest is in what a small brokerage chooses to put on one
page when it cannot rely on a negotiated master agreement being on file.

---

## Header structure

> RND LOGISTICS
> 19 Cotters Ln, East Brunswick, NJ, USA 08816
> Dispatcher: [name] · LOAD #5024 · Ship Date · Today's Date · W/O:
> Rate & Load Confirmation

Single-row carrier table: Carrier | Phone # | Fax # | Equipment | **Agreed
Amount** | **Load Status**.

`Load Status: Open` — a live workflow-state field printed on the document. No
other confirmation in the corpus exposes its own TMS status to the carrier.
"Agreed Amount" rather than "Rate" is also distinctive phrasing.

## Stop structure

`Shipper 1` / `Consignee 1` blocks, each with Date, Purchase Order #,
**Check in As**, address, Phone, Time, **Major Intersection**, Type, Shipping /
Receiving Hours, Quantity, **Appointment: Yes**, Weight, Description, Notes.

> Check in As: Bag arts

A **check-in identity field** — the name the driver gives at the gate. This is
the only document in the corpus that carries it as a structured field, and it is
the exact control SRL's README records as absent from all 18 previously
retrieved artefacts:

> The dock-identity line appears in none of the retrieved documents, yet every
> fraud source in the corpus names check-in identity as the highest-signal tell.

**That statement now needs qualifying.** It appears here, as a field, on a
small broker's one-page form. SRL's `DOCK & DISPATCH` anti-fraud line is still
a stronger construction — it tells the driver what to do when someone *else*
attempts identity theft — but the corpus can no longer say the field appears
nowhere.

`Major Intersection` as a routing aid is also unique here.

> Notes: Pick up till 3 pm
> Notes: Delivery by appointment

---

## Terms body (verbatim — single unbroken paragraph, reproduced in full)

> Carrier warrants that it is duly and legally qualified to provide the transportation services herein and **holds at least $1,000,000 in auto liability and cargo insurance of at least $100,000.** Any or all accessorial charges must be stated above or agreed to in a subsequent signed rate confirmation between Broker and Carrier. Carrier must submit signed rate confirmation(s) with Carrier's invoice, a legible copy or original proof of delivery. Unauthorized delayed service shall be charged to Carrier, not to exceed the actual charges assessed against Broker for which Carrier's actions are at fault. **A minimum charge of $100 shall apply to missed appointments. In the case of detention, detention only applies for appointment loads and not for FCFS. If detentions are being applied, they will be paid only after 2 hours from appointment time. In order to apply detention, Carrier must notify Broker 15 minutes prior to start, and Broker will compensate with $25.00 per hour after 2 hours from appointment time. Detentions are not applicable to missed appointments.** Carrier is prohibited from subcontracting this Load to any other Carrier or broker. **Broker reserves the right to pay the delivering carrier directly and Carrier named below shall remain primarily liable as provided herein.** Carrier shall defend, indemnify and hold harmless Broker, its shipper customer, and the bill of lading parties from any claims, actions or damages, arising out of Carrier's performance hereunder, including damages of any kind asserted against Broker for **negligent hiring of Carrier**, cargo loss and damage, theft, delay, damage to property, and personal injury or death. **Carrier represents it has adequate coverage for towing and any towing invoice in excess of coverage shall be Carrier's sole responsibility.** Broker shall be permitted to offset carrier payables for any loss, delay, shortage or damage. **Carrier agrees that any loss or damage to customer's food grade cargo shall be considered a total loss. Carrier forfeits its right to be paid in the event Broker's freight is held hostage.** Carrier payment terms are **net 30 days** from the date Broker receives Carrier's invoice, a legible copy or original proof of delivery, matching confirmation(s), and reimbursable receipts. **If Fuel Surcharge is not separately stated, then Flat Rate is all inclusive.** The Carrier, and any connecting Carrier, shall not receive for transport any freight that shall be excluded from coverage under its primary cargo policy. Delivery and pick-up dates and hours will not require the driver to violate hours of service regulations. **Carrier agrees that Broker's charges to its customers are confidential and need not be disclosed to Carrier.**

## Submission routing (verbatim)

> Rate confirmations must be signed and submitted to OPERATIONS@RANDDLOGISTICS.COM
> Invoices must be submitted to ACCOUNTS@RANDDLOGISTICS.COM with load number on the invoice or mail invoices to APY Enterprises, Inc dba RND Logisitcs PO BOX 8359, Jersey CIty, NJ 07308

> Carrier Pay: Line Haul: $950.00, TOTAL: $950.00 USD

## Signature block (verbatim)

> Accepted By: ______ Date: ______ Signature: ______
> Driver Name: ______ Cell #: ______ Truck #: ______ Trailer #: ______

---

## Structural observations

- **The most complete detention definition in the corpus, on the smallest
  document.** In four sentences it settles: eligibility (appointment loads only,
  never FCFS), clock start (2 hours from appointment time), notice (15 minutes
  prior), rate ($25/hr), and disqualification (missed appointments void it).
  SRL's open question — *"the document says '2 hrs free' without saying free from
  what"* — is answered here in five words: **"from appointment time."** A broker
  with a four-digit load counter has drafted this more precisely than
  C.H. Robinson, which states no detention terms at all.
- **"Detention only applies for appointment loads and not for FCFS"** is the
  opposite of TQL's rule (which gives FCFS *more* free time, 4 hours vs 3).
  Two defensible answers to the same problem; SRL has neither.
- **"Any loss or damage to customer's food grade cargo shall be considered a
  total loss."** A contractual total-loss deeming clause for food freight —
  aggressive, and directly relevant to SRL's cold-chain exposure. It converts a
  partial-damage argument into a full-value claim by agreement.
- **"Carrier forfeits its right to be paid in the event Broker's freight is held
  hostage."** Note the Coyote/Witherspoon dispute in this corpus's court-exhibit
  material turned on exactly this accusation. Small brokers have written the
  remedy into the form.
- **"Broker's charges to its customers are confidential and need not be
  disclosed to Carrier"** — an explicit contracting-out of rate transparency.
  Worth reading against the FMCSA broker-transparency rulemaking (docket
  FMCSA-2023-0257), where carriers submitted documents like this one as evidence.
  It is also the precise opposite of SRL's positioning.
- **Indemnity expressly covers negligent hiring of the carrier** — the broker
  shifting its own selection liability onto the selected party. Present in no
  other document in this corpus.
- One page, no master agreement referenced anywhere, no incorporation clause.
  The form has to carry everything because there is nothing behind it. That is
  why it is the most self-contained document in the corpus.
