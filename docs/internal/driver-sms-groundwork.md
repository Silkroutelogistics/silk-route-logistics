# Driver SMS + location pings — what Wasi has to do

**Arc 19 · 2026-08-21 · v3.8.atz**

The platform side is built and proved. Everything below is a person-shaped task
that code cannot do: a carrier registration, a counsel review, an IRS form, and
one product decision. Ordered by what blocks what.

---

## 1. A2P 10DLC registration — BLOCKS ALL DRIVER SMS AT VOLUME

**What it is.** US carriers (AT&T, Verizon, T-Mobile) require every business
sending application-to-person SMS to a 10-digit number to register the brand and
the campaign. Unregistered traffic is filtered — not bounced, *filtered*, which
means it looks like it sent and the driver never sees it. **That failure is
indistinguishable from a driver ignoring us**, which is exactly the ambiguity
this whole feature exists to remove.

**Where.** OpenPhone is the sender (`OPENPHONE_API_KEY`,
`OPENPHONE_PHONE_NUMBER_ID` on Render). Registration goes through OpenPhone's
console, which submits to The Campaign Registry on our behalf.

**What they will ask for, and what to answer:**

| Field | Answer |
|---|---|
| Legal entity name | Silk Route Logistics Inc. |
| Entity type | Private for-profit corporation |
| Country / State | US / Michigan |
| EIN | On the W-9 — see §3 if the IRS letter is needed |
| Address | 2317 S 35th St, Galesburg, MI 49053 |
| Website | https://silkroutelogistics.ai |
| Vertical | Transportation / Logistics |
| Support email | operations@silkroutelogistics.ai |
| Support phone | (269) 220-6760 |

**Campaign use case: "Customer Care" or "Mixed", NOT "Marketing".** Every driver
message is operational — a check call, a code, a pickup reminder, a location
link. Registering as Marketing invites tighter filtering and a worse throughput
tier for messages that are not marketing.

**Sample messages to submit.** Give them the real ones, verbatim: a mismatch
between registered samples and live traffic is itself a filtering trigger.

    Silk Route Logistics: your code is 123456. It expires in 10 minutes.
    This confirms you are the driver on load SRL-121485.

    SRL Check-Call: Load #SRL-121485 (Lebanon, NH -> North Lake, TX).
    Reply: 1=At Pickup, 2=Loaded, 3=In Transit, 4=At Delivery, 5=Delivered
    Or tap to share your location once: https://silkroutelogistics.ai/api/ping/TOKEN

**Opt-in description — this is the field applications fail on.** Ours is
genuinely strong and should be described exactly as it works: *the carrier enters
the driver's mobile in the SRL carrier portal; SRL texts a one-time code to that
number; the driver reads the code back to their carrier, who enters it; the
consent language is displayed and recorded with a timestamp before verification
completes.* Double opt-in, logged, per load. Attach the consent text from §2.

**Expect** a few business days, and occasionally a rejection for a vague opt-in
description. If rejected, the fix is almost always more specific opt-in wording,
not a different campaign type.

---

## 2. TCPA consent text — FOR THE COUNSEL PILE (§16)

Live in code as `DRIVER_SMS_CONSENT_VERSION = "2026-08-21-v1"` in
[`driverVerificationService.ts`](../../backend/src/services/driverVerificationService.ts).
It is drafted to the shape TCPA asks for and **has not been reviewed by counsel.**
Send it with the Broker-Carrier Agreement and the Quick Pay Agreement as one
package (§16 #1 and #2) rather than as a third separate ask.

> Silk Route Logistics Inc. will text this number about the load you are hauling
> for us: check calls, pickup and delivery reminders, and a link you can tap to
> share your location. Message frequency depends on the load. Message and data
> rates may apply. Reply STOP to stop. Reply HELP for help. Consent is not a
> condition of being dispatched.

**Three things to raise with counsel specifically:**

1. **The consenting party is the driver, but the number is entered by the
   carrier.** We prove possession of the handset before consent is recorded,
   which is the strongest form available without giving drivers portal accounts —
   but counsel should say whether the carrier should also attest they have the
   driver's permission to hand us the number.
2. **"Consent is not a condition of being dispatched" is a deliberate promise,
   and the platform keeps it.** A driver who never verifies still hauls the load.
   What is withheld is the rate-confirmation download, which is a *carrier* gate,
   not a driver one. Counsel should confirm that distinction holds as written.
3. **Every consent is stored verbatim with its own version stamp**, so a dispute
   can name exactly what that driver agreed to on that date rather than what the
   current build says. Changing the constant does not rewrite history.

**STOP and HELP are promised in that text and are NOT yet implemented.** The
inbound webhook exists (`/api/webhooks/openphone-checkcall`) and currently routes
digits to check-call responses; STOP/HELP is a small addition to that handler,
banked in §13.3 Item 225. **It must ship before the first real driver message
goes out** — promising STOP and not honouring it is the specific thing TCPA
penalises, and it is worse than never having promised it.

---

## 3. CNAM + IRS 147C — the dependency restated

**CNAM** is the name that appears on a recipient's handset, set per outbound
number through the carrier of record. Without it an SRL text arrives as a bare
number — and a driver asked to tap a location link from an unknown number is a
driver who reasonably does not tap. This directly suppresses the response rate of
everything built in Phase 2.

**The 147C dependency.** CNAM registration and some A2P brand verifications want
EIN documentation matching the legal name character-for-character. If there is
any doubt the EIN on file matches "Silk Route Logistics Inc." exactly, request
IRS Letter 147C by phone (Business & Specialty Tax Line, 800-829-4933) — it is
free and reissues EIN confirmation. **Order it before starting §1**, because a
name mismatch discovered mid-application means resubmitting rather than editing.

---

## 4. Tier 2 — ELD consent, sketched for the §13.3 bank

Not built, and correctly so: it needs credentials that do not exist. What exists
is real code behind an env gate — `motiveService` and `samsaraService` both call
live APIs and write `LoadTrackingEvent` with `locationSource: ELD`, gated on
`MOTIVE_API_KEY` / `SAMSARA_API_KEY`, which are unset. The integration is written
and dark, not absent.

**The shape when it comes:**

1. **The consent is the carrier's, not the driver's.** A carrier connects their
   own ELD account and authorises SRL to read positions for loads that carrier is
   hauling. That is a commercial agreement between two businesses — a different
   legal object from a driver consenting to be texted, and it must not be
   collected in the same flow or with the same words.
2. **Scope it to the load, not the truck.** The technical temptation is to poll
   every vehicle a carrier has connected. The defensible position is that SRL
   reads positions only for trucks on SRL loads, only while those loads are in
   flight — which is also what a carrier expects when they read the permission
   screen.
3. **It changes Compass, and that has to be said out loud.** The tracking factor
   is telematics-activated: neutral at 100 until `CarrierProfile.eldEnabled`,
   then measured. Connecting an ELD therefore begins scoring a carrier on
   something that previously could not count against them. If the connect screen
   does not say so plainly, it is a trap.
4. **Driver pings and ELD are complementary, not redundant.** A ping is
   consented, precise and occasional; ELD is continuous and passive. A carrier
   with ELD still gets check calls, because a position is not a status.

---

## Order of operations

1. **Order 147C now** if the EIN letter is not to hand (§3) — it gates the rest and takes longest.
2. **Ship STOP/HELP handling** (§13.3 Item 225) — must precede the first real driver message.
3. **Register A2P 10DLC** on OpenPhone (§1), attaching the consent text.
4. **Send the consent text to counsel** with the BCA + QP package (§2).
5. **Set CNAM** once the brand is verified (§3).
6. **Tier 2 ELD** when a carrier asks for it (§4) — demand-driven, not speculative.
