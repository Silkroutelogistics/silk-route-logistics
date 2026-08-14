# Rate Confirmation: Decisions Taken and Questions for Counsel

**To:** Dirk Beckwith, Foster Swift Collins & Smith PC
**From:** Silk Route Logistics Inc. (USDOT 4526880, MC# 1794414)
**Date:** August 14, 2026
**Re:** Broker-Carrier Agreement and Rate Confirmation, open covenant questions

**Purpose.** This brief asks you to decide seven covenant questions. It is written so
you can decide them without reading source code or a rate confirmation. Every factual
claim about industry practice is sourced to a specific document that SRL holds on
disk, quoted exactly, and named. Nothing here proposes contract language. Each
question ends with the decision SRL needs, not a recommendation dressed as one.

**The evidence base.** SRL holds sixteen genuine broker rate confirmations from
fifteen brokers, transcribed at `docs/rc-references/`. They are Allen Lund, Schneider
National, Scotlynn USA, Greatwide Dallas Mavis, MoLo Solutions (two separate loads,
2021 and 2023), Steam Logistics, Transervice Integrated Solutions, C.H. Robinson,
J.B. Hunt, GlobalTranz, Nolan Transportation Group, RND Logistics, Echo Global,
Arrive Logistics, and TQL. They span 2019 to 2025. Frequencies below are stated over
those sixteen documents and no others. Where a count is over brokers rather than
documents, that is said explicitly.

---

## 1. Where things stand

The architecture you established holds and has not been disturbed. Substantive
covenants live in the Broker-Carrier Agreement. The Rate Confirmation is a per-load
operational form that incorporates the BCA by reference and states, on its face,
"This Rate Confirmation is governed by the Broker-Carrier Agreement between Silk
Route Logistics Inc. and Carrier (the 'BCA'). In the event of conflict, the BCA
controls." The principal re-affirmed that ordering on August 14, 2026: the BCA is the
foundation and the Rate Confirmation is second and subordinate. The standalone
executable BCA remains an open item and is the first-carrier onboarding blocker
recorded in SRL's internal register. SRL is pre-revenue, onboarding its first carrier
and its first customer, a refrigerated CPG shipper moving into grocery distribution
centers. The current BCA text in production is version `2026-06-27-v1`, rendered from
a single backend source so the carrier portal, the click-through, and the executed
PDF cannot diverge. Your attorney-final body replaces that text with a version bump
and no code change.

---

## 2. Decided, for the record. No action needed.

These are settled. They are listed so the record is complete and so you can object if
any of them reads differently to you than it did to us.

**BCA-primary precedence.** The BCA controls on conflict. Re-affirmed August 14, 2026.
Question 6 below asks you to confirm this survives the period during which the
standalone BCA is unsigned, which is a narrower question than the ordering itself.

**Detention.** Two hours free per stop, then $50 per hour, capped at $250 per stop.
At the cap the charge converts to layover. Detention and layover do not stack at the
same stop. The conversion mechanic matches two documents in the corpus. J.B. Hunt:
"If Duration exceeds 5 hours, the charge becomes Layover" and "Will not be paid
detention at same stop." Scotlynn: "DETENTION WILL START 3 HOURS AFTER APPOINTMENT
TIME AT $50/HR OR UNTIL LAYOVER OR $300 IS HIT."

**TONU.** $200 flat, payable only if SRL gave the carrier the pickup number and
shipper address and cleared the carrier to head to pickup, and SRL or the shipper
then cancelled. Not payable if the carrier cancels or if the trailer is rejected as
non-compliant. The gating structure follows TQL, which drafts TONU as an exclusion:
"IF LOAD IS CHANGED OR CANCELED BY TQL, NO 'TRUCK ORDER NOT USED' WILL BE PAID UNLESS
TQL HAS PROVIDED THE CARRIER WITH LOAD DETAILS (PICK-UP NUMBER, SHIPPER NAME/ADDRESS
AND DRIVER INFORMATION SHEET) AND APPROVED THE CARRIER TO BEGIN DRIVING TOWARDS THE
PICK-UP LOCATION." J.B. Hunt is the only other document with TONU qualification
criteria and prices it at "Location Services: $200" and "No Location Services: $150."

**Layover.** $250 per day. Matches J.B. Hunt's automated rate and TQL's "250 layover."

**Paperwork.** Signed BOL, POD, and supporting paperwork due within 24 hours of
delivery. This aligns the Rate Confirmation to BCA section 5, which already said 24
hours, and to SRL's published carrier performance score, which grades document
timeliness on a 24-hour window. Corpus support: TQL puts "WITHIN 24 HOURS OF DELIVERY"
in the first line of its document, above the rate. There is no industry standard here.
The corpus runs from Scotlynn's "ALL PAPERWORK MUST BE EMAILED BY END OF DAY ON
DELIVERY DATE" to Greatwide's 180 days, with Transervice at 30 days, Schneider at 90,
MoLo at 24 hours for accessorials, and Allen Lund stating no deadline at all.

**Lumpers.** Reimbursed on presentation of the original receipt, with the carrier
fronting the cost. Worth noting that two large brokers run the opposite model and
forbid the carrier from paying. J.B. Hunt: "Do not pay out of pocket as you will not
be reimbursed for Load or Unload costs" and "J.B. Hunt will pay all Load and Unload
events directly to the Load or Unload service." TQL: "DO NOT pay for lumpers at
receiver. You are not to be charged any fees. Call TQL if asked to pay. If payment is
made for a lumper, you are liable for payment and wont be reimbursed." SRL's model is
the majority one in the corpus and is not being reopened.

**No payout for electronic tracking.** SRL requires tracking before dispatch and pays
nothing for it. Three documents pay or fine for the same behavior. Transervice carries
"MacroPoint Acceptance: $200.00" as a rate line on a $1,650 linehaul. NTG carries
"$50.00 MACROPOINT ACCEPTED" and "$150.00 POD UPON DELIVERY" as rate lines totalling
14% of the load. MoLo imposes "a $150 fine" for dropping compliance mid-load.
GlobalTranz takes the opposite position entirely: "participation is voluntary and not
required." SRL is not paying for tracking.

---

## 3. Questions for counsel

### Question 1. Repower and cross-dock consent

**What the corpus does.** One document of sixteen grants the broker an express right
to repower or cross-dock the trailer when the carrier cannot perform. That document is
Scotlynn, and it states the right twice in the same block, both times in capitals.
Two other documents run the same subject in the opposite direction, restricting the
carrier rather than empowering the broker. Arrive Operational Rule 9: "Freight must
not be handled or trans loaded by Carrier without approval from Arrive." Schneider
Additional Requirement 5: "Carrier shall not break the seal, partial the Shipment, or
move the Shipment via rail without written consent from Schneider." Neither of those
gives the broker a right to move its own freight onto another truck.

**Verbatim, Scotlynn Rate Confirmation 1495595:**

> \*\*\*\*IF YOUR DRIVER IS FOR WHATEVER REASON, UNABLE TO MAKE ON TIME DELIVERY
> (BREAKDOWN, DRIVER IS SICK, OUT OF HOURS, ETC.) YOU MUST GIVE US PERMISSION TO
> REPOWER THE TRAILER\*\*\*

and, later in the same comments block:

> IF THERE IS A BREAKDOWN OR A DRIVER ISSUE(FAMILY ISSUE, DRIVER SICK, NOT ENOUGH
> HOURS) CARRIER MUST ALLOW SCOTLYNN TO REPOWER THE TRAILER OR CROSS DOCK IN ORDER
> TO MAKE ON TIME DELIVERY

**What SRL does today.** Nothing. Neither the Rate Confirmation nor BCA version
`2026-06-27-v1` mentions repower, relay, cross-dock, or trans-loading in any form.

**Why it matters commercially.** SRL's first customer is refrigerated CPG delivering
into grocery distribution centers. A missed delivery appointment at a grocery DC is
not a rescheduling inconvenience. It is a rejected load, a spoiled-product exposure,
and a lost account. If a carrier breaks down mid-lane and SRL has no contractual
right to move the trailer, SRL must ask permission from the party that just failed,
at the moment that party has the least incentive to cooperate and may be holding the
freight as leverage in a payment dispute. RND Logistics writes the leverage risk into
its own form: "Carrier forfeits its right to be paid in the event Broker's freight is
held hostage." Without a consent term, SRL's remedy for a breakdown is a damages
claim after the customer is already lost.

**Decision needed.** Whether the BCA should include a pre-granted consent permitting
SRL to arrange repower or cross-dock when the carrier cannot perform, and if so, on
what conditions. The practical sub-questions are whether consent is automatic or
requires notice first, who bears the repower cost as between the carrier and SRL, what
happens to the original carrier's linehaul, and how cargo liability transfers at the
moment the freight moves to the second truck. That last point is the reason this is
your question and not an operational one.

---

### Question 2. Exclusive use of the trailer

**What the corpus does.** Six of sixteen documents, across five brokers, require the
trailer to be dedicated to that broker's freight. Three of the six attach forfeiture
of the entire freight bill as liquidated damages: MoLo on both of its loads and
C.H. Robinson, in near-identical wording that suggests a shared template. Two state
the requirement with no remedy at all: Steam and NTG. One folds co-loading into a
withholding trigger alongside double-brokering: Echo.

**Verbatim, MoLo Solutions Rate Confirmation 2000957370:**

> Carrier's motor vehicle equipment shall be **dedicated to Broker's exclusive use**
> while transporting the freight tendered pursuant to MoLo Solutions's Broker Carrier
> Agreement and this Load Confirmation. **Carrier's violation of this requirement shall
> result in Carrier's forfeiting its right to be paid for the transportation services
> contemplated by this Load Confirmation as liquidated damages, and may result in a
> claim.**

MoLo's 2021 load, number 760821, carries the same clause with the additional formula
"not as penalty, but as liquidated damages," which is also the wording in
C.H. Robinson Additional Term 1.

**Verbatim, Steam Logistics Load 2030381,** the most recent document in the corpus:

> This load requires exclusive use of the Motor Carrier's trailer space unless
> otherwise agreed in writing.

That is the entire clause. No remedy follows it.

**Verbatim, Echo Global Order 34405981:**

> COMPENSATION MAY BE WITHHELD IF THIS SHIPMENT IS DOUBLE-BROKERED, MOVED BY RAIL,
> CONSOLIDATED WITH ANY OTHER FREIGHT OR IF THE AGREED SERVICES ARE NOT FULFILLED.

**What SRL does today.** Nothing. Neither document requires exclusive use or addresses
co-loading.

**Why it matters commercially.** Refrigerated CPG co-loaded with an incompatible
commodity is a contamination and odor-transfer claim, and under the Food Safety
Modernization Act it is also a compliance exposure for the shipper who tendered the
freight. SRL sells trust as its differentiator. A carrier that co-loads SRL's
temperature-controlled freight with something else is running an operation SRL cannot
see and cannot audit. The corpus shows the covenant and its remedy are separable
choices: Steam requires exclusive use and says nothing about consequences, while MoLo
and C.H. Robinson attach forfeiture of the whole freight bill.

**Decision needed.** First, whether SRL adopts an exclusive-use covenant at all.
Second, if it does, whether the remedy is forfeiture as liquidated damages, a
withholding right, or silence. SRL's BCA already uses liquidated damages in section 8,
at "fifteen percent (15%) of the gross revenue on any improperly solicited shipment,"
so the drafting device is not new to the agreement. Whether a full-freight-bill
forfeiture is enforceable in Michigan against a small carrier, and whether the
"not as penalty, but as liquidated damages" formulation is doing real work or is
merely customary, are both yours.

---

### Question 3. Double-brokering remedy

**What the corpus does.** Ten of sixteen documents carry an express prohibition on
double-brokering, co-brokering, or subcontracting. They differ sharply on remedy.

- Pay the delivering carrier directly: Allen Lund and RND Logistics.
- A monetary investigation charge: Allen Lund alone, and it is the only priced
  investigation remedy in the corpus.
- Void or forfeit the payment obligation: Schneider, Echo, NTG, GlobalTranz, Arrive.
- Defer to the master agreement: Transervice.
- Prohibition with no remedy stated on the rate confirmation: Steam and Greatwide.

**Verbatim, Allen Lund Carrier Load Confirmation 8426497, provision 9:**

> The carrier agrees that it will not double-broker the load or change the specified
> mode of transportation. If this agreement is breached and another carrier's MC# or
> name is on the tractor, trailer, or bill of lading, or if other facts convincingly
> show that another carrier transported the load, ALC will exercise its contractual
> right to pay the delivering carrier directly. Additionally, ALC reserves the right
> to charge the booking carrier up to $5,000 for the time and resources ALC must spend
> in investigating the carrier-delivery or mode-of-transportation issue.

**Verbatim, Schneider Rate Confirmation 4010206867,** which states the remedy twice.
Additional Requirement 3: "Brokerage of this Shipment by Carrier is prohibited. Any
brokerage will void Schneider's obligation to pay Carrier." And on page 4:
"COBROKERAGE OF THIS SHIPMENT, WITHOUT SCHNEIDER NATIONAL'S PRIOR WRITTEN
AUTHORIZATION, WILL VOID TO PAY YOUR FREIGHT BILL."

**Verbatim, Transervice Rate Confirmation TIS20078,** the entire clause:

> **ABSOLUTELY NO DOUBLE BROKERING:** Section 13 of the CBC shall govern.

**Verbatim, RND Logistics Load 5024:**

> Carrier is prohibited from subcontracting this Load to any other Carrier or broker.
> Broker reserves the right to pay the delivering carrier directly and Carrier named
> below shall remain primarily liable as provided herein.

**What SRL does today.** BCA section 4 carries the covenant with no remedy attached:
"Carrier shall not double-broker, co-broker, re-broker, assign, interline, or
subcontract any load to a third party without Broker's prior written consent." The
Rate Confirmation carries no double-brokering clause. It carries an instruction
addressed to the driver, which is a different control aimed at a different threat:
"Check in at both stops as Silk Route Logistics, load SRL-121488. The BOL must name
SRL as broker. If it names another company or MC number, do not load." That line
tells an honest driver what to do when a third party attempts identity theft on the
load. It does nothing about SRL's own carrier re-brokering the freight.

**Why it matters commercially.** Double-brokering is the mechanism behind most cargo
theft and most double-payment exposure in truckload brokerage. When the booked carrier
re-brokers and the delivering carrier is never paid, the delivering carrier asserts a
lien or sues the broker, and the broker frequently pays twice. Transervice's approach
is the cleanest fit for SRL's architecture, because it puts the remedy in the master
agreement and lets the per-load form simply point at it. That only works if the master
agreement actually contains a remedy. Today SRL's does not.

**Decision needed.** What remedy attaches to the BCA section 4 covenant. The options
the corpus demonstrates are a direct-pay right to the delivering carrier with the
booking carrier remaining primarily liable, forfeiture of the freight bill, a priced
investigation charge, or some combination. Related and yours: whether SRL can
contractually secure a direct-pay right that is good against the delivering carrier's
claim, which is the point of the exercise and not something the clause alone
accomplishes.

---

### Question 4. Pay-when-paid

**What the corpus does.** One document of sixteen conditions carrier payment on the
broker being paid. That document is Greatwide, and it states the condition three
separate ways on a single page.

**Verbatim, Greatwide Dallas Mavis Order G3730946:**

> Accessorials will not be paid until Greatwide Dallas Mavis, LLC is paid.

> No payment will be made to carriers on detention, truck order not used, or damaged
> claims until Greatwide Dallas Mavis, LLC is paid.

> Carrier will not be paid if Greatwide Dallas Mavis, LLC's customer refuses to pay
> Greatwide Dallas Mavis, LLC due to missing or illegible paperwork. If carrier
> provides paperwork more than 180 days after date of delivery, carrier will only be
> paid if the customer pays Greatwide Dallas Mavis, LLC.

One adjacent line appears elsewhere. Allen Lund writes "Detention must be reported at
time of occurrence or will not be paid by the customer," which identifies the customer
as the ultimate payer but does not condition the carrier's right to payment on
collection.

**What SRL does today.** SRL has deliberately not adopted pay-when-paid. The reasoning
is recorded and is presented here so you can weigh it rather than rediscover it. SRL's
TONU triggers include broker-fault causes: a wrong pickup number, a wrong shipper
address, a cancellation SRL originates. Those are never reimbursable from the shipper,
because the shipper did not cause them. A pay-when-paid clause applied to TONU would
therefore leave the carrier unpaid for SRL's own error, with no path to recovery. The
same reasoning applies with less force to detention, which is sometimes shipper-caused
and sometimes not.

**Why it matters commercially.** Pay-when-paid moves customer credit risk onto the
carrier. For a pre-revenue broker onboarding its first carriers, that is a recruiting
liability. SRL's public positioning is transparent, prompt carrier pay, including a
published quick-pay ladder, and pay-when-paid sits badly beside it. Against that,
Greatwide is proof that real brokers do this and carriers sign it, and SRL is
currently absorbing the full credit risk on every accessorial with no offsetting term.

**Decision needed.** Whether to leave pay-when-paid out entirely, which is the current
posture, or to adopt a narrowed version limited to charges that are genuinely
pass-through from the shipper, such as lumper reimbursements and shipper-caused
detention, while expressly excluding broker-fault TONU. SRL is presenting this as
revisitable rather than closed, with the reasoning above attached, because the
reasoning is about a subset of charges and not about the whole device.

---

### Question 5. Signed rate confirmation as a payment condition

**What the corpus does.** Ten of sixteen documents require the rate confirmation to
come back with the invoice. Five of those make a signed copy a hard payment gate:
Allen Lund, NTG, Arrive, RND, and Echo. One document expressly waives return, and it
is the most operationally prescriptive document in the corpus.

**Verbatim, Allen Lund provision 3,** the hardest formulation in the corpus:

> FINAL PAYMENT CANNOT BE MADE WITHOUT A SIGNED COPY OF THE BILL OF LADING AND A
> SIGNED COPY OF THE RATE CONFIRMATION.

Allen Lund states it again in provision 4 and a third time in its invoicing block,
which lists the required paperwork as "copy of this load confirmation, customer signed
Bill of Lading, and lumper receipts (if applicable)."

**Verbatim, Schneider,** which requires the document with the invoice without making
signature the gate:

> Must attach and send in this tender sheet/rate contract with invoice.

**Verbatim, MoLo Solutions 2000957370:**

> Please sign and return to MoLo

**Verbatim, NTG Load 4374644:**

> THIS CONFIRMATION MUST BE SIGNED BY CARRIER AND RECEIVED BACK BY OUR BOOKING OFFICE
> FOR PAYMENT.

**Verbatim, Arrive Operational Rule 8:**

> Payment will be made within thirty (30) days after receipt of invoice, original BOL,
> and signed Load-Rate Confirmation unless Arrive disputes the invoice or any part
> thereof.

**Verbatim, J.B. Hunt,** the sole waiver:

> You are not required to send the J.B. Hunt Load Confirmation.

**What SRL does today.** SRL prints a full carrier acceptance block: carrier legal
name, MC number, DOT number, authorized signatory printed, title, signature, and date.
It never tells the carrier where to send it. SRL's invoicing block asks for "the signed
BOL, a clean POD, and original receipts for any approved lumper or accessorial charge"
and does not list the rate confirmation among the required documents. Greatwide, by
contrast, prints an explicit return channel: "Carrier must sign load confirmation and
fax back to agency at: (512) 628-3403."

**Why it matters commercially.** SRL's acceptance clause makes conduct sufficient, so
a signature is not needed to form the contract. But a returned signature is the
cheapest available evidence in a later dispute about what the carrier agreed to, and
it is the document a court will ask for. A signature block with no return instruction
produces the worst of both outcomes: it looks like a requirement, so a diligent carrier
signs it and does not know where to send it, and SRL accumulates no executed copies.

**Decision needed.** Whether the signed rate confirmation becomes a stated condition of
payment, a requested-but-not-required return, or is dropped in favor of relying solely
on acceptance by conduct. If it becomes a condition, that is a payment term and needs
to sit consistently in the BCA and on the form. If it stays a request, the form needs a
return address, which is an operational fix SRL can make once you decide the status.

---

### Question 6. Precedence, and what happens while the BCA is unsigned

**What the corpus does.** Only four of sixteen documents state an express conflict
rule. Two resolve in favor of the master agreement: J.B. Hunt and GlobalTranz. Two
resolve in favor of the rate confirmation: Transervice and Arrive. The remaining
twelve incorporate a master agreement or style themselves an addendum without ever
saying which instrument wins. Separately, two documents incorporate the master
agreement whether or not the carrier ever signed it: Transervice and J.B. Hunt.

**Verbatim, Transervice, which runs opposite to SRL and is the reason this question
is here:**

> The terms and conditions set forth in the CBC, whether or not executed by Carrier,
> are incorporated by reference into this Rate Confirmation ... By executing this Rate
> Confirmation or by actual acceptance of the tendered shipment, Carrier hereby
> confirms and acknowledges that Carrier remains fully subject to all such terms and
> conditions when performing services with respect to this load ... If any terms of
> the CBC are found to be inconsistent with any terms in this Confirmation, the terms
> of this Confirmation shall prevail.

**Verbatim, Arrive Operational Rule 12:**

> In the event of a conflict between this Rate Confirmation and any Broker Carrier
> Agreement between Arrive and Carrier, this Load-Rate Confirmation shall govern as to
> the provisions in conflict.

**Verbatim, J.B. Hunt,** on the same side as SRL:

> All loads tendered pursuant to this Carrier Load Confirmation ("Tender") shall be
> subject and subordinate to the current terms, conditions and provisions of J.B.
> Hunt's Outsourcing Carriage Agreement ... whether or not previously executed by
> Carrier. The terms and conditions of the OCA are hereby incorporated by reference.

and:

> Except as otherwise expressly stated in the OCA, in the event the terms and
> conditions of this Tender conflict with the OCA, the terms, conditions and
> provisions of the OCA shall prevail and take precedence.

**Verbatim, GlobalTranz,** which states a two-step order:

> In the event of any conflict between the Agreement or the Carrier Rate Confirmation,
> the Agreement shall govern and then any terms as set forth in this Carrier Rate
> Confirmation shall apply.

**What SRL does today.** The Rate Confirmation says the BCA controls on conflict. The
principal re-affirmed that on August 14, 2026, and SRL is not asking you to revisit
the ordering.

**Why it matters commercially.** SRL is not asking whether the ordering is right. It
is asking what the ordering means during the window SRL is currently in, where the
standalone BCA is not yet executed with any carrier. SRL's own drafting history shows
the practical hazard. The Rate Confirmation once printed a 48-hour paperwork deadline
while BCA section 5 said 24 hours, and because the Rate Confirmation made the BCA
control, the carrier was bound to a deadline it could not read on the document in
front of it. That defect has been corrected by moving the Rate Confirmation to 24
hours. The structural risk it exposed has not been addressed. A precedence clause that
points at an unsigned master, containing terms the carrier has not seen, is a weaker
instrument than a self-contained form, and Transervice and J.B. Hunt have both drafted
around exactly that by binding the master "whether or not executed."

**Decision needed.** Whether the BCA and the Rate Confirmation should carry an express
statement that the BCA binds whether or not the carrier has executed it, on the
Transervice and J.B. Hunt model, so that incorporation survives the pre-execution
period. If the answer is no, then a second question follows: whether terms that exist
only in the BCA should be restated on the Rate Confirmation for the duration of that
period, and if so, which ones.

---

### Question 7. Acceptance mechanics

**What the corpus does.** Three mechanisms appear, and several documents carry more
than one.

Acceptance by conduct, expressly sufficient without any signature: SRL, Schneider,
J.B. Hunt, Transervice, GlobalTranz, Echo, and Arrive Rule 2. Schneider, C.H.
Robinson, MoLo on both loads, and J.B. Hunt print no signature block at all.

Acceptance by silence on a clock: C.H. Robinson and both MoLo documents at 24 hours,
Arrive at 48 hours.

A returned signature stated as the operative mechanism: Greatwide, Allen Lund, NTG.

**Verbatim, Schneider, on conduct:**

> Carrier has read this entire Shipment tender. By accepting this Shipment Tender and
> transporting the Shipment (even without a signature on this Shipment Tender),
> Carrier agrees it is bound to, and agrees to comply with, all statements, special
> services, work assignments, terms and conditions, and other requirements contained
> herein.

**Verbatim, MoLo Solutions 2000957370, on silence:**

> UNLESS ORAL AND WRITTEN FAX OBJECTIONS ARE MADE TO ITS TERMS, AT THE EARLIER OF
> WITHIN TWENTY-FOUR (24) HOURS OF RECEIPT OR PRIOR TO WORK BEING INITIATED, YOU HAVE
> AGREED TO THESE TERMS.

That sentence appears word for word in C.H. Robinson's document as well, including a
"TWENTY-FOURS" typo in both MoLo's 2021 load and C.H. Robinson's, which indicates a
shared industry template rather than independent drafting.

**Verbatim, Arrive Operational Rules 1 and 2:**

> 1. This Rate Confirmation is deemed accepted by Carrier unless it is rejected within
> 48 hours of receipt.
> 2. Receipt of shipment by Carrier constitutes acceptance of and agreement to the
> terms of this Rate Confirmation.

**Verbatim, Greatwide, on signature:**

> Carrier must sign load confirmation and fax back to agency at: (512) 628-3403

Greatwide is the only executed copy in the corpus. It is signed by the carrier.

**What SRL does today.** SRL uses conduct: "Carrier's signature below, or Carrier's
dispatch of a unit, arrival at the pickup location, or commencement of transport,
whichever occurs first, constitutes binding acceptance of this Rate Confirmation and
the BCA."

**Why it matters commercially.** Conduct-based acceptance is the fastest mechanism and
removes a step from dispatch, which matters when SRL is competing for capacity.
Silence-based acceptance is stronger evidentially, because it converts the carrier's
failure to object into an affirmative record, but it requires SRL to prove receipt and
to have a channel for objections that it actually monitors. The mechanisms are not
mutually exclusive. Arrive runs both.

**Decision needed.** Whether SRL keeps conduct alone, or adds a silence-with-objection
window alongside it. If a window is added, its length and the required form of
objection. The corpus offers 24 hours at C.H. Robinson and MoLo and 48 hours at Arrive.
Also whether "whichever occurs first" is the right trigger ordering, given that
dispatch of a unit can occur before a carrier's authorized signatory has read the
document.

---

## 4. What an engineer shipped without counsel, and why it was judged safe

The rate confirmation was revised on August 14, 2026 without legal review. The changes
below were treated as operational instructions rather than covenants, on the reasoning
that they tell a driver or a dispatcher what to do and do not allocate risk, change
when SRL pays money, or create a new obligation on either party. They are listed here
so you can object to any that you read differently.

**Temperature control block on refrigerated loads.** Prints the setpoint and range,
directs continuous run mode rather than cycle, directs pre-cooling before loading, and
directs the driver to download the reefer at delivery and send it with the paperwork.
Judged safe as an operating instruction. It matches the corpus default. Scotlynn
prints "Reefer Mode: Continuous Required" as a labelled field, MoLo states "Run all
reefers on continuous unless specific written instructions are given to do otherwise,"
and Transervice states "at no time during transit of this load shall Carrier run its
reefer on cycle mode."

**One element of that block may not be purely operational, and is flagged.** The
document tells the driver that if the bill of lading shows a different temperature than
the rate confirmation, do not sign it and call SRL before loading. That asserts the
rate confirmation as the controlling temperature authority. Transervice does the
opposite and makes the bill of lading control: "Always refer to BOL for the required
reefer temperature ... If no temperature is stated on the BOL or conflicting
temperatures are given in a single or multiple documents, Carrier shall obtain written
confirmation of the correct temperature from the shipper and immediately notify TIS in
writing of such temperature for verification." GlobalTranz places the duty on the
carrier to verify the two match. Which document governs the setpoint is arguably a risk
allocation on a cold-chain claim, and SRL is not asserting it was an engineering call.

**Driver, cell, truck, and trailer capture line.** A fill-in line before pickup. Judged
safe as a data-capture field. It appears as ruled fields on Transervice, NTG, and
Arrive, and as populated data on TQL.

**Seal handling instruction.** Record the number on the bill of lading at pickup, the
receiver removes it rather than the driver, and call before the doors open if the seal
is broken or missing at delivery. Judged safe as an operating instruction. Every
comparable document in the corpus carries seal language.

**Check-call schedule.** By 8:00 AM Eastern daily in transit and on arrival at each
stop, and call before the appointment if running late. Judged safe as a scheduling
instruction. C.H. Robinson specifies "one check call per day, prior to 10:00am" and
Scotlynn specifies "0900AM AND 1600 EST."

**Dock check-in identity line.** Instructs the driver to check in as Silk Route
Logistics, and not to load if the bill of lading names another company or MC number.
Judged safe because it is an instruction to SRL's own driver about a third party's
conduct, not a covenant binding the carrier. It is a fraud control aimed at identity
theft on the load. Only one document in the corpus carries anything comparable as a
field, RND Logistics, which prints "Check in As: Bag arts."

**Fraud notice and verification URL.** States that SRL sends rate confirmations only
from its own domain, will never change remit-to or banking details by email, and gives
a URL and a phone number to verify the document. Judged safe as a notice. It creates no
obligation on the carrier.

**Invoicing instructions.** Where to send, required subject line, one invoice per load,
and a statement that payment terms run from receipt of a complete packet. Judged safe
as a billing instruction, and the corpus is nearly unanimous on the substance. Arrive
and TQL both start the payment clock on packet completeness rather than on delivery.

**Two changes in this arc were not operational, and were ratified by the principal
rather than by counsel.** They are called out separately because the reasoning above
does not cover them. First, the paperwork deadline on the rate confirmation moved from
48 hours to 24 hours. That is a contractual deadline, but it was a correction rather
than a new term: BCA section 5 already said 24 hours, and the rate confirmation's own
precedence clause meant the carrier was already bound to 24 while reading 48. Second,
the detention cap was set, and the canonical figure ratified on August 14, 2026 is $250
per stop converting to layover. The printed document is being brought into line with
that figure. Both are money or contract terms and both are noted here for completeness
rather than defended as engineering decisions.

---

## Appendix: source documents

All sixteen are transcribed at `docs/rc-references/`. Provenance and retrieval method
for each are recorded in `docs/rc-references/README.md`. Seven were supplied by the
principal; nine were retrieved from carriers' own open document archives, claims
recovery hosts, and an insurance submission directory, where carriers file their rate
confirmations as claim support.

| Broker | Reference | Pages | Dated |
|---|---|---|---|
| Allen Lund Company | 8426497 | 4 | 2026 |
| Schneider National | 4010206867 | 5 | 2026 |
| Scotlynn USA | 1495595 | 2 | 2026 |
| Greatwide Dallas Mavis | G3730946 | 1 | 2023, signed |
| MoLo Solutions | 2000957370 | 4 | 2023 |
| MoLo Solutions | 760821 | 3 | 2021 |
| Steam Logistics | 2030381 | 2 | 2025 |
| Transervice Integrated Solutions | TIS20078 | 2 | 2022 |
| C.H. Robinson | 400126857 | 3 | 2022 |
| J.B. Hunt Transport | 7H33283 | 3 | 2022 |
| GlobalTranz | 24779211 | 1 | 2022 |
| Nolan Transportation Group | 4374644 | 2 | 2021 |
| RND Logistics | 5024 | 1 | 2022 |
| Echo Global Logistics | 34405981 | 2 | 2019 |
| Arrive Logistics | 535700 | 2 | 2018 |
| TQL | 33614902 | 5 | 2025 |

SRL's current Broker-Carrier Agreement text, version `2026-06-27-v1`, is at
`backend/src/data/agreements.ts`. It is the single source rendered into the executed
PDF, the carrier portal review pane, and the onboarding click-through.
