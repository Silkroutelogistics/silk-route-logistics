# Scotlynn USA Division — Rate Confirmation 1495595

Supplied by Wasi 2026-08-14. Live TMS output (V24.2), 2 pages. Carrier contact
details redacted. Reefer load — the most directly comparable of the three to
SRL's Beekeepers cold-chain freight.

Distinct from the other two: Scotlynn separates **Operations Contact** from
**Billing Contact** in the letterhead, each with its own phone, fax and email.
Billing goes to usa-accounting@scotlynn.com; operations to the named rep.

---

## Header fields (page 1)

Carrier, Contact, Phone, Fax, Date.

Then the freight spine:

> **Commodity:** Chilled Food   **Trailer:** Reefer
> **Temp:** 65.0 to 70.0        **Driver(s)?**
> **Reefer Mode: Continuous Required**   **Hazmat?** No

Temperature is a **range**, and run mode is its own labelled field reading
"Continuous Required" — not buried in an instructions paragraph.

## Stop Details

Per stop: PU/SO sequence number, Name, Address, **Arrive Between** (date + time,
with a second "And:" field for the window close), Contact, Phone, **Pallets: IN:
/ OUT:**, Cases, Weight. Then reference rows: `Ref: PU 209909612`,
`Ref: PO 31100309` each carrying Pcs / Weight / Desc.

"Pallets IN / OUT" captures pallet exchange, which neither of the other two
documents tracks.

## Pay

> Carrier Freight Pay: $2,200.00
> Total Carrier Pay: $2,200.00

---

## Comments block (page 2, verbatim — this is where all the operating terms live)

> \*\*\*\*\*\*\*\*WALMART LOADS ARE NEVER TO DELIVER EARLY EVER\*\*\*\*\*\*\*\*\*\*\*

> \*\*\*\*\*YOU CAN NOT DELIVER ANY DATE BESIDES WHAT IS ON YOUR RATE CONFIRMATION NO MATTER WHAT RECEIVING AT WALMART/SAMS/COSTCO SAYS IF YOU DO YOU WILL BE NO LOADED\*\*\*\*\*

> \*\*\*\*IF YOU ARE ON LACOMBE, LA TO SUMNER, WA YOU MUST TAKE THE SOUTHERN ROUTE VIA I-10 OR I-40 TO CALIFORNIA I-5 UP NORTH TO WASHINGTON OR THERE WILL BE FINES AND THE RISK OF A CLAIM\*\*\*

> **\*\*ALL PAPERWORK MUST BE EMAILED BY END OF DAY ON DELIVERY DATE\*\***

> LUMPER RECEIPTS NEED TO BE SUBMITTED TO WITHIN 72 HOURS OF DELIVERY DATE OR THEY MAY NOT BE REIMBURSED

> \*\*\*\*IF YOUR DRIVER IS FOR WHATEVER REASON, UNABLE TO MAKE ON TIME DELIVERY (BREAKDOWN, DRIVER IS SICK, OUT OF HOURS, ETC.) YOU MUST GIVE US PERMISSION TO REPOWER THE TRAILER\*\*\*

> **-DETENTION WILL START 3 HOURS AFTER APPOINTMENT TIME AT $50/HR OR UNTIL LAYOVER OR $300 IS HIT.**

> -LOCATION UPDATES ARE TO BE PROVIDED BY 0900AM AND 1600 EST

> -DRIVERS ARE REQUIRED TO SECURE FREIGHT WITH A MINIUMUM OF 2 LOAD LOCKS AND/OR STRAPS AT THE BACK OF THE TRAILER AFTER THE AIRBAG IS IN PLACE.

> -LOADING AND UNLOADING UPDATES ARE DUE WITHIN 2 HOURS OF LOADING/UNLOADING

> -LUMPER RECEIPTS NEED TO BE SUBMITTED WITHIN 72 HOURS OF DELIVERY DATE OR THEY MAY NOT BE REIMBURSED

> - IF THERE IS A BREAKDOWN OR A DRIVER ISSUE(FAMILY ISSUE, DRIVER SICK, NOT ENOUGH HOURS) CARRIER MUST ALLOW SCOTLYNN TO REPOWER THE TRAILER OR CROSS DOCK IN ORDER TO MAKE ON TIME DELIVERY

Note the repower requirement is stated **twice** in the same block, and the
lumper 72-hour rule is also stated twice — emphasis by repetition rather than by
typography.

---

## Structural observations

- **No signature block.** No acceptance clause. No incorporation-by-reference
  clause. No insurance representation. No double-brokering prohibition. No
  liability language of any kind. The entire document is a freight spine plus a
  free-text comments field.
- The detention term, the paperwork deadline, the check-call schedule, the
  securement requirement and the repower right are all **unstructured text in a
  comments box**, not fields. They are therefore not queryable, not enforceable
  by the TMS, and easy for a dispatcher to omit on the next load.
- Two pages total — the leanest of the three, and the closest in length to SRL's
  current Rate Confirmation.
