# J.B. Hunt Transport — Carrier Confirmation for Load 7H33283

Retrieved 2026-08-14 from
`https://www.grouprac.com/Documents/7H33283Rate%20Confirmation.pdf`
(claims-recovery host; the carrier's own copy). Live TMS output.
Load dated 06/23/2022 – 06/24/2022, Auburn MA → Flanders NJ, Polar Beverages
freight, 210 miles, flat $625.00. Carrier R A C Transport LLC. Individual
contact details redacted; company names retained.

**This is the most operationally complete document in the corpus.** It is the
only one that publishes a full accessorial schedule with prices, and the only
one that prices the same accessorial differently depending on how it was
recorded.

Opening line establishes the brokered posture explicitly:

> J.B. Hunt Transport, Inc. ("J.B. Hunt"), as a licensed Property Broker, hereby arranges for [Carrier] to transport this load as a licensed Motor Carrier. [Carrier] must call [rep] for information and ask for load # 7H33283.

---

## Header structure (page 1)

`Total Rate: $625.00` printed at the top, above everything else including the
stops. J.B. Hunt Contact / Carrier Contact blocks. Then **Load Details**
(miles), **Equipment** (Trailer, size, Hazmat, Temperature Controlled), and
**Requirements** (Driver Load/Unload, Driver Count) as labelled boolean fields.

`Temperature Controlled: No` and `Hazmat: No` print as explicit negatives rather
than being omitted — the same always-print pattern Schneider uses.

## Comments (page 1, verbatim)

> All appointments must be met. If driver is late, they will either be refused or worked in with no detention paid. On time service is critical on this load!

> 1. If Shipper and Receiver addresses on the Bill of Lading do not match the tender, your J.B. Hunt representative must be notified!

> \* Call 800–UNLOAD1 (800–865–6231) to be issued a Comchek number for all Load and Unload services.
> \* Please have a blank Comchek with you prior to arrival.
> \* J.B. Hunt will pay all Load and Unload events directly to the Load or Unload service.
> \* Do not pay out of pocket as you will not be reimbursed for Load or Unload costs.
> \* Send a copy of the lumper receipt with BOL upon load completion.

Lateness forfeits detention. That conditional — arriving late voids your right
to be paid for waiting — is stated in three separate documents in this corpus
(J.B. Hunt, TQL, RND) and is absent from SRL's.

---

## Detention Payment (page 2, verbatim)

> J.B. Hunt no longer requires a separate notification for detention. Please be on-time and follow the process outlined below in order to qualify for detention payment.
> 1. Report your arrival time immediately upon arriving using one of the following methods.
> a. Carrier 360 by J.B. Hunt
> b. Automated Notification System – Call (877) 977-7427
> c. Email: [rep email]
> d. Call:
> 2. Report your departure time before departing using one of the following methods.
> a. Carrier 360 by J.B. Hunt
> b. Automated Notification System – Call (877) 977-7427
> c. Email: [rep email]
> d. Call:
> 3. Record the arrival and departure time for each event on the Bill of Lading.
> 4. Submit the signed Bill of Lading with original invoice.

"J.B. Hunt no longer requires a separate notification" is a deliberate reversal
of the industry-standard call-before-detention rule that TQL, Arrive, GlobalTranz
and RND all still impose. J.B. Hunt replaced the notification duty with a
reporting duty — arrival and departure, through a channel that timestamps them.

## Information for Carrier's Driver (page 2, verbatim)

> \* Do NOT pay out of pocket for Load or Unload - Call 800–UNLOAD1 (800–865–6231).
> \* J.B. Hunt will not reimburse carrier for any Load or Unload payments paid directly by Carrier/Driver.
> \* If Cash Advance is needed, call your J.B. Hunt representative.
> \* Scale load prior to departure from shipper location.
> \* For any safety or claims related issues, call 800–723–9029, 24 hours a day.
> \* All loads must remain sealed with all old and new seal numbers recorded on the Bill of Lading/Delivery Receipt.
> \* Driver must notify J.B. Hunt of any accessorials at time of occurrence or payment will be denied.

---

## Accessorials (page 3, verbatim — the published schedule)

> Accessorials listed apply to domestic over the road 3rd party carriers and are not valid for drayage.
>
> 1. Detention with Power
>      a. Loads with set appointments: time accrual will begin at the time of scheduled appointment
>      b. Time accrues in 15 minute increments
>      c. 5 hour maximum of detention per load
>           i. First 2 hours Free
>                1. No detention provided
>           ii. Eligible Detention Hours
>                1. **$50 per hour if automated**
>                2. **$40 per hour if manually recorded**
>           iii. If Duration exceeds 5 hours, the charge becomes Layover
> 2. Layover
>      a. **Automated $250 per day**
>           i. **$150 per day if manually recorded**
>      b. Will not be paid detention at same stop
> 3. Truck Ordered Not Used
>      a. Load must be either:
>           i. Dispatched & driver enroute/arrived
>           ii. Tendered >30 minutes lead time day of pickup
>      b. **Location Services: $200**
>      c. **No Location Services: $150**
> 4. Stop-off
>      a. Post Tender: $50 + Out of Route Miles (OOR)
>           i. OOR Dollar per Mile (DPM) would match DPM on load
> 5. Reconsignment
>      a. $75 + OOR
>           i. OOR DPM would match DPM on load
> 6. Driver Assist
>      a. $50 per stop
>           i. Tailgating only

> IF YOU HAVE ANY QUESTIONS REGARDING ACCESSORIALS, PLEASE REACH OUT TO YOUR JBH CONTACT LISTED ON PAGE 1 OR ICSSS@JBHUNT.COM

**The automated/manual price split is the finding.** J.B. Hunt pays a 25%
premium on detention ($50 vs $40), a 67% premium on layover ($250 vs $150), and
a 33% premium on TONU ($200 vs $150) purely for the event having been captured
by a system rather than asserted by a human. This is the clearest expression in
the corpus of a broker paying carriers to generate structured data.

Note also that TONU has **qualification criteria** — dispatched with driver
enroute, or tendered with >30 minutes lead time on the day of pickup. This is
the only TONU qualification definition in the corpus.

---

## Rate Agreement (page 3, verbatim)

> This agreement is entered into by [Carrier] and J.B. Hunt. The rates and charges contained in this agreement shall supersede all conflicting rate and charges in the tariff on file by Carrier and all prior letter agreements. This is confirmation of a verbal rate contract between Carrier and J.B. Hunt. Carrier must notify at time of occurrence of any accessorials or payment will be denied.

Rate table: Type | Rate | Total. Single row `TRANSIT 625.0 625.0`.

## Terms and Conditions (page 3, verbatim)

> J.B. Hunt, as a licensed Property Broker, hereby arranges for Carrier to transport this load as a licensed Motor Carrier. All loads tendered pursuant to this Carrier Load Confirmation ("Tender") shall be subject and subordinate to the current terms, conditions and provisions of J.B. Hunt's Outsourcing Carriage Agreement and any applicable amendments thereto, including, but not limited to, J.B. Hunt's Independent Contractor Services Amendment and J.B. Hunt's Drayage and DCS Outsource Carriage Amendment (hereinafter referred to collectively as "OCA"), **whether or not previously executed by Carrier.** The terms and conditions of the OCA are hereby incorporated by reference.

"Whether or not previously executed by Carrier" binds the carrier to a master
agreement it may never have signed. No other document in the corpus reaches
that far.

## Carrier Acceptance (verbatim)

> Carrier's acceptance of this Tender and these terms and conditions shall be made either by Carrier's signature and return of the Tender or by actual acceptance of the tendered shipment. By doing so, the person acting on behalf of Carrier represents and warrants that he/she has been or is specifically authorized to accept this Tender on behalf of Carrier and to legally bind the Carrier to the terms and conditions of this Tender.

## FMCSA Regulations (verbatim)

> Carrier and its drivers shall adhere to all applicable FMCSA regulations, including drivers' hours-of-service limits, the commercial driver's license (cdl) regulations, and the prohibiting coercion of commercial motor vehicle drivers (coercion rule).
> Carrier agrees that such regulations shall supersede any conflicting service instructions stated in this tender or any comments made by J.B. Hunt's employees.

## Shipments traveling in or through California (verbatim)

> Your company must be in compliance with the regulations promulgated by the California Air Resources Board (CARB) regarding refrigerated equipment (TRU regulations), the truck and bus equipment regulations (engine and particulate matter filter requirements), and greenhouse gas regulations, effective on January 1, 2013.
> If your company is not able to timely comply with these regulations, you must inform J.B. Hunt immediately that you are not able to comply with them. By accepting this load tender, you represent and warrant that your company is in compliance with these regulations and requirements.

## Food Safety (verbatim)

> Carrier is responsible for sanitary conditions during the transportation of commodities tendered to it. Carrier must be in compliance with the Food and Safety Modernization Act ("FSMA") and all other Food and Drug Administration ("FDA") rules and directives. Carrier must provide adequate training to its personnel regarding sanitary transportation practices and **maintain records documenting such training as required by 21 C.F.R. Part 1, Subpart O, § 1.910.** Carrier must also comply with any specific shipper instructions provided by J.B. Hunt, as authorized by the FSMA, including, but not limited to, sanitary specifications and cleaning procedures for Carrier's vehicles and transportation equipment as well as appropriate operating temperature. If Carrier is not able to timely comply with these regulations and the provided shipper instructions, Carrier must inform J.B. Hunt immediately that it is not able to comply with them. By accepting this Load Tender, Carrier represents and warrants that it is in compliance with these regulations and any shipper instructions.

This load is **not** temperature-controlled (`Temperature Controlled: No`) and
the FSMA clause prints anyway, with a specific CFR citation to the
training-records requirement.

## Safe Driving (verbatim)

> J.B. Hunt does not condone coercion of any driver to operate a commercial motor vehicle, when the driver reports that he/she would not be able to drive safely due to illness, fatigue, equipment inspection, repair and maintenance regulations, intermodal roadability regulations, load securement regulations, or due to not having hours available under applicable regulations.

## Rates (verbatim)

> The rate shown above is the agreed individually determined rate between the parties.
> \* Except as otherwise expressly stated in the OCA, in the event the terms and conditions of this Tender conflict with the OCA, the terms, conditions and provisions of the OCA shall prevail and take precedence.
> \* No modifications or amendments to this Tender shall be binding upon J.B. Hunt unless initiated and signed by a J.B. Hunt authorized representative **who holds a position of Director or higher.**

## Driving Directions (verbatim)

> Any directions communicated via this load tender, by a customer or J.B. Hunt orally or written are for informational purposes only.
> \* Carrier is solely responsible for routing and delivering the load tendered and it is the carrier's sole responsibility to ensure the directions are appropriate.
> \* J.B. Hunt makes no guarantee with respect to specified routes or the compatibility of those routes with regard to any type of equipment.
> \* The carrier is solely responsible for operating lawfully and safely over any road or highway, bridge or route.
> \* Carrier is responsible for any fines, citations or penalties that may be issued as a result of operating in any way that can be deemed a violation of any ordinance, law or regulation.

## Paperwork (page 3, verbatim)

> In order for Carrier to be paid, and invoice and all paperwork must be submitted with a J.B. Hunt Load Number present on each page:
> \* Customer signed Bill of Lading.
> \* Lumper Receipt(s) / Pallet Exchange Receipt(s).
> \* All other load specific documents. **You are not required to send the J.B. Hunt Load Confirmation.**

The only document in the corpus that explicitly *waives* return of the rate
confirmation. Allen Lund, Schneider, Echo, NTG and MoLo all require it back.

## QuickPay / Cash Advances (verbatim)

> QuickPay processing time will be 2 business days from receipt of paperwork with a fixed 1.5% processing fee deducted from each settlement.
> If you would like more information about becoming a quick pay carrier, please contact our carrier relations department at (866) 646-7729 or email quickpay@jbhunt.

> Cash advance fee is $10.00 for each cash advance issued.

1.5% at 2 business days is the cheapest quick-pay in the corpus. Flat $10 cash
advance — the only flat advance fee; every other document uses a percentage with
a floor.

**No paperwork deadline is stated anywhere in this document**, and there is no
signature block.

---

## Structural observations

- **Accessorials are a published schedule, not a negotiation.** Every other
  broker in the corpus says "must be pre-approved." J.B. Hunt prints the price
  list. That converts detention from a discretionary favour into a contractual
  entitlement with defined qualification steps.
- **Paying more for automated capture is a data-acquisition strategy.** The
  premium is not for the waiting; it is for the waiting being machine-recorded.
  Any broker running a scoring engine has the same incentive.
- **Detention has a hard 5-hour ceiling that converts to layover** rather than
  running unbounded. This is a cleaner answer than a bare per-stop cap.
- **TONU has qualification criteria** — the only ones in the corpus.
- The document waives its own return, has no signature block, and has no
  paperwork deadline, yet is the most prescriptive document here. Prescriptive
  and burdensome are not the same axis.
