// v3.8.anf — SRL Driver Academy curriculum expansion (driver-focused build-out).
//
// Authored inline (the parallel authoring+fact-check workflow was rate-limited by
// a sustained platform throttle; same fallback the T3 starter curriculum used).
// Conservative, reg-cited, "verify current" where a figure can change. Per the
// §13.3 Item 193 locked decision the content is a FIRST DRAFT for Wasi review;
// when the throttle clears, the adversarial regulatory fact-check workflow can be
// run over this content as a verification pass.
//
// Driver-focused per the recalibration: these teach what a working CDL driver
// does/encounters (not dispatch/office tasks). The dispatch-oriented IFTA + IRP
// courses are archived; their driver-relevant slices (cab card, registered
// weight, fuel + mileage records) fold into "Weigh Stations, Size & Weight".

import type { CurriculumCourse } from "./trainingCurriculum";

const DISCLAIMER =
  "This course is general educational guidance, not legal or compliance advice. Regulations change and vary by jurisdiction. Always verify against current FMCSA, OSHA, Transport Canada, and your carrier's policies before you rely on it.";

export const EXPANSION: CurriculumCourse[] = [
  // ─────────────────────────────────────────────────────────
  {
    slug: "driver-qualification",
    title: "CDL, Medical Card & the Clearinghouse",
    category: "Driver Qualification & Health",
    summary: "Keeping your CDL and medical card valid, the notifications you owe your employer, how the drug & alcohol program and Clearinghouse work, and the offenses that disqualify you.",
    version: "5",
    estMinutes: 26,
    passThreshold: 80,
    validityMonths: 12,
    sortOrder: 2,
    disclaimer: DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "Your CDL and keeping it valid",
        estMinutes: 5,
        bodyMarkdown:
          "Your commercial driver's license is your authority to operate. Keeping it valid is on you, not just your carrier.\n\n**Class and endorsements.** Class A covers a combination over 26,001 lb GCWR towing a unit over 10,000 lb. **Class B** is a single vehicle of 26,001 lb or more (or towing a unit under 10,000 lb); **Class C** is a smaller vehicle used to haul placarded hazmat or carry 16 or more passengers. Most over-the-road freight runs on a Class A. Endorsements add privileges: **H** (hazmat), **N** (tank), **X** (tank + hazmat), **T** (doubles/triples), **P** (passenger). Only carry what your operation needs, and only haul what your endorsements cover.\n\n**The notifications you owe (49 CFR 383.31, 383.33).** You must notify your employer within **30 days** of a conviction for any traffic violation (in any vehicle, in any state, except parking). If your license is suspended, revoked, canceled, or you are disqualified or lose the right to operate, you must tell your employer by the **end of the next business day**.\n\n**One driver, one license.** You may hold only one CDL, from your home state.\n\n[[figure:cdl-classes-endorsements]]\n\n> " + DISCLAIMER,
      },
      {
        order: 2,
        title: "Your DOT medical card",
        estMinutes: 6,
        bodyMarkdown:
          "To drive a commercial vehicle in interstate commerce you must be medically certified. A certified medical examiner from the FMCSA National Registry performs the DOT physical, which checks vision (at least **20/40 in each eye**, with or without correction), hearing, blood pressure, blood sugar, and any condition that affects safe driving. A typical certification is valid up to **24 months**, less if a condition needs monitoring (verify your own expiration).\n\n**How your certification reaches your state changed in 2025.** Under the National Registry rule that took effect **June 23, 2025**, your examiner now reports your result to your state licensing agency **electronically** in most states, and a paper card is being phased out as proof. You still must pass the exam and know your own expiration date; some states are still catching up, so confirm how yours handles it and keep your own copy.\n\n**Self-certification: which of the four categories you operate in.** When you get or renew your CDL you tell your state licensing agency how you operate, and that decides whether you must keep a med card on file:\n\n- **Non-excepted interstate (NI)** — you cross state lines or haul interstate freight under the full federal safety rules. **You must keep a current med card on file with your state.** Most SRL drivers are here.\n- **Excepted interstate (EI)** — interstate, but only certain excepted operations the FMCSA exempts from the medical rules. No med card filed.\n- **Non-excepted intrastate (NA)** — you drive only within one state and must meet **that state's** medical rules.\n- **Excepted intrastate (EA)** — intrastate operations your state has excepted from its medical rules.\n\nDriving in a category other than the one you self-certified to can get your commercial privileges **suspended or revoked** — so certify honestly and update it if your operation changes.\n\nIf your med card **lapses**, you are not medically qualified to drive a CMV, and your CDL can be **downgraded** by your state until you recertify. Track the expiration the same way you track your CDL and registration; do not let it surprise you on the road.",
      },
      {
        order: 3,
        title: "Drugs, alcohol, and the Clearinghouse",
        estMinutes: 6,
        bodyMarkdown:
          "The federal drug & alcohol program (49 CFR Part 382) sets hard rules for safety-sensitive (driving) functions.\n\n**Prohibited conduct** includes a blood alcohol concentration of **0.04 or higher**, using alcohol within 4 hours of going on duty, and any prohibited-drug use. **Refusing a required test counts as a positive.**\n\n**What the drug test covers.** The DOT panel screens five drug classes: **marijuana, cocaine, amphetamines (including methamphetamine), opioids, and PCP.** The specimen is **urine** (oral-fluid testing is authorized in the DOT rule but is not yet in use, because no HHS-certified oral-fluid laboratories exist yet). A prescription does *not* automatically clear a positive: if you test positive, a **Medical Review Officer (MRO)** interviews you, and only a verified, valid prescription is reported as negative. Report any prescription or over-the-counter medicine that could affect safe driving to your medical examiner, and never drive impaired by it. Marijuana is **not** compatible with safety-sensitive driving under federal rules, even where state law allows it — and **rescheduling marijuana to Schedule III does not change the DOT rules (49 CFR Part 40): it is still tested for and still prohibited** for safety-sensitive drivers.\n\n**Six test types:** pre-employment, random, reasonable-suspicion, post-accident, return-to-duty, and follow-up.\n\n**The FMCSA Drug & Alcohol Clearinghouse** is the federal database of violations. You consent to a query, and a recorded violation **bars you from driving** until you complete the return-to-duty process. **Since November 18, 2024, a \"prohibited\" Clearinghouse status also triggers your state licensing agency to downgrade your CDL itself within 60 days (49 CFR 383.73)** — so a violation now costs you the physical license, not just the right to perform safety-sensitive functions, until you complete return-to-duty. A violation does not quietly disappear.\n\n**What return-to-duty actually involves:**\n\n1. The violation is recorded and you are **prohibited** from safety-sensitive (driving) functions.\n2. You are evaluated by a **Substance Abuse Professional (SAP)**, who prescribes education and/or treatment.\n3. You complete what the SAP prescribes, and the SAP reassesses you.\n4. You take and **pass a return-to-duty test** (a negative result). At that point you are **no longer prohibited** and may drive again.\n5. The SAP sets a **follow-up testing plan** — a minimum of **6 unannounced tests in the first 12 months**, which can run up to **5 years**. Your violation stays **unresolved** in the Clearinghouse until you finish that follow-up plan.\n\nThe process is generally at your expense. The point: a violation is recoverable, but only by doing the SAP / return-to-duty work — there is no shortcut and no waiting it out.\n\n[[figure:clearinghouse-return-to-duty-cycle]]",
      },
      {
        order: 4,
        title: "Disqualifying offenses (awareness)",
        estMinutes: 4,
        bodyMarkdown: `Some offenses cost you the CDL. The disqualification periods are set in **49 CFR 383.51**.

**Major offenses** (DUI in any vehicle, refusing a test, leaving the scene, using a CMV in a felony, driving a CMV on a revoked/suspended CDL, causing a fatality by negligent operation): at least a **1-year disqualification** — **3 years** if you were hauling placarded hazmat. A **second** major offense is a **lifetime** disqualification.

**Serious traffic violations** (15+ mph over, reckless driving, erratic lane changes, following too closely, texting or hand-held phone use in a CMV, no CDL in your possession, a traffic violation tied to a fatal accident): a **single** one is not disqualifying, but a **second within 3 years = 60 days**, and a **third within 3 years = 120 days**.

**Out-of-service-order violations:** a first conviction is **90 days to 1 year** (longer — 180 days to 2 years — if you were hauling hazmat or 15+ passengers); repeat violations run into multiple years.

**Railroad-grade-crossing violations:** **at least 60 days** for a first, **at least 120 days** for a second within 3 years, and **at least 1 year** for a third within 3 years.

The takeaway: your driving record, on and off the clock, is your livelihood.

[[figure:disqualification-offense-matrix]]`,
      },
      {
        order: 5,
        title: "Three ways you can lose the wheel — and how each comes back",
        estMinutes: 5,
        bodyMarkdown:
          "Not every \"you can't drive\" is the same thing, and each one comes back a different way. Know which is which.\n\n**1. Medical downgrade — administrative, reversible.** If your med card lapses and you're in a category that needs one, your state **downgrades** your CDL to a regular license. This is not a punishment, it's a status. You fix it by getting a new DOT physical; in most states the examiner now reports the result to your state **electronically** (states still on the older paper process may need you to submit it), and your CDL is restored. Fast to fix — if you don't let it lapse in the first place.\n\n**2. Disqualification — a penalty for an offense.** A 49 CFR 383.51 offense (DUI, repeat serious violations, an out-of-service violation, and so on) **disqualifies** you for a set period: 90 days, a year, three years, or life. When the period ends, reinstatement is **not automatic** — you go through your state to reinstate, pay any fees, and meet its conditions, and a long disqualification may require **retaking the CDL tests**.\n\n**3. Clearinghouse prohibition — a drug/alcohol stop.** A recorded drug or alcohol violation puts you in **prohibited** status until you complete the return-to-duty process with a SAP (previous lesson). Since **November 18, 2024**, a prohibited status also makes your state **downgrade your CDL within 60 days** (49 CFR 383.73) — so it now costs you the license too, reversed only by completing return-to-duty. This is separate from a medical downgrade and from a 383.51 disqualification: different cause, different fix.\n\nThe practical takeaway: keep your med card current (avoids #1), protect your driving record on and off the clock (avoids #2), and stay clean (avoids #3). Each one is recoverable, but each costs you time and money you would rather keep.\n\n[[figure:cdl-medical-disqualification-paths]]",
      },
    ],
    questions: [
      { order: 1, question: "Within how long must you notify your employer of a traffic conviction?", options: ["by the end of the next business day", "within 30 days", "within 90 days", "only if the conviction was in your CMV"], correctIndex: 1, explanation: "49 CFR 383.31 requires notifying your employer within 30 days of a conviction for any traffic violation in ANY vehicle, in any state, except parking. (A license suspension or disqualification is a faster notice — by the next business day.)" },
      { order: 2, question: "What is the maximum blood alcohol concentration allowed while performing safety-sensitive functions?", options: ["0.02", "0.04", "0.08", "Anything under 0.10"], correctIndex: 1, explanation: "Part 382 prohibits performing safety-sensitive functions at 0.04 BAC or higher." },
      { order: 3, question: "Refusing a required DOT drug or alcohol test is treated as:", options: ["No consequence", "A positive test / violation", "A warning only", "Allowed once per year"], correctIndex: 1, explanation: "Under Part 382 a refusal is treated the same as a positive result." },
      { order: 4, question: "A driver with an unresolved Clearinghouse drug/alcohol violation may:", options: ["Keep driving normally", "Not perform safety-sensitive functions until return-to-duty is complete", "Drive only locally", "Drive with a co-driver"], correctIndex: 1, explanation: "A recorded violation bars safety-sensitive functions until the return-to-duty process is completed." },
      { order: 5, question: "Your DOT medical certificate has expired with no valid card on file. You:", options: ["Can drive 30 more days", "Are not medically qualified to drive a CMV until you recertify", "Only need it for hazmat", "Are fine for short hauls"], correctIndex: 1, explanation: "Without a current medical certificate you are not medically qualified, and your CDL can be downgraded until you recertify." },
      { order: 6, question: "A first conviction for violating an out-of-service order disqualifies a driver for:", options: ["a written warning only", "90 days to 1 year", "exactly 30 days", "a lifetime"], correctIndex: 1, explanation: "Per 49 CFR 383.51, a first out-of-service-order violation is 90 days to 1 year (longer if hauling hazmat or 15+ passengers). A lifetime ban is reserved for a second major offense such as DUI." },
      { order: 7, question: "You run interstate freight under the full federal safety rules. You self-certify as:", options: ["excepted interstate — no med card needed", "non-excepted interstate, and keep a current med card on file with your state", "non-excepted intrastate", "whichever category is easiest"], correctIndex: 1, explanation: "Crossing state lines under the full federal rules is non-excepted interstate (NI) — you must keep a current med card on file with your state licensing agency. Driving in a category other than the one you self-certified to can suspend or revoke your commercial privileges." },
      { order: 8, question: "Your med card lapsed and your state downgraded your CDL. To restore it you:", options: ["wait out a disqualification period", "get a new DOT physical so your certification is on file with your state", "complete a return-to-duty test with a SAP", "reapply for a brand-new CDL from scratch"], correctIndex: 1, explanation: "A medical downgrade is administrative, not a penalty — recertify with a new DOT physical (the examiner reports the result to your state, electronically in most states since June 2025) and your CDL is restored. That's different from a 383.51 disqualification (an offense penalty) and from a Clearinghouse return-to-duty test (a drug/alcohol stop)." },
      { order: 9, question: "You take a legally prescribed medication and your DOT drug test flags it. What happens?", options: ["the positive is automatically excused because you have a prescription", "a Medical Review Officer reviews it, and only a verified valid prescription is reported as negative", "you are disqualified for life", "prescriptions are never detected by the test"], correctIndex: 1, explanation: "A prescription does not auto-clear a positive. A Medical Review Officer (MRO) interviews you and verifies the prescription before a result is reported negative. Report any medicine that could affect safe driving to your medical examiner, and note that marijuana is never compatible with safety-sensitive driving under federal rules (49 CFR Part 40)." },
      { order: 10, question: "You're assigned a placarded hazmat load in a tanker. Which endorsement covers you?", options: ["P (passenger)", "X — the combined tank + hazmat endorsement (or N plus H)", "T (doubles/triples) only", "no endorsement; a Class A covers it"], correctIndex: 1, explanation: "Endorsements add privileges: H = hazmat, N = tank, X = tank + hazmat combined, T = doubles/triples, P = passenger. A placarded load in a tank needs both the tank and hazmat privileges — the X endorsement covers both (or N plus H). Your Class A alone does not, and you only carry the endorsements your operation needs." },
      { order: 11, question: "You land in \"prohibited\" status in the Drug & Alcohol Clearinghouse. Besides barring you from safety-sensitive driving, since November 18, 2024 it also:", options: ["has no effect on your actual license", "makes your state downgrade your CDL within 60 days until you complete return-to-duty", "only applies if you drive interstate", "is erased automatically after one year"], correctIndex: 1, explanation: "Under the Clearinghouse-II rule (effective Nov 18, 2024), a prohibited status triggers your State Driver Licensing Agency to downgrade your CDL itself within 60 days (49 CFR 383.73) — so it now costs you the physical license, not just the right to perform safety-sensitive functions. Completing the SAP / return-to-duty process reverses it." },
    ],
  },

  // ─────────────────────────────────────────────────────────
  {
    slug: "hazmat-awareness",
    title: "Hazmat & Dangerous Goods Awareness",
    category: "Hazardous Materials",
    summary: "Recognize the 9 hazard classes and their placards, read the shipping paper, keep incompatible loads apart, follow the on-road route and parking rules, know what an H endorsement covers, and what to do at a spill.",
    version: "6",
    estMinutes: 26,
    passThreshold: 80,
    validityMonths: 12,
    sortOrder: 3,
    disclaimer: DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "Recognizing dangerous goods",
        estMinutes: 5,
        bodyMarkdown: `Hazardous materials (hazmat in the US, dangerous goods in Canada) are substances that can harm people, property, or the environment in transport. The US rules are the Hazardous Materials Regulations, **49 CFR Parts 100-185**.

**The 9 hazard classes — and their divisions.** The shipper classifies the material; your job is to recognize it. The classes split into divisions you will see on placards:

- **1** Explosives (divisions 1.1-1.6 by blast hazard)
- **2** Gases: **2.1** flammable, **2.2** non-flammable, **2.3** gas poisonous by inhalation (a PIH/TIH gas, deadly to breathe, placarded in **any amount**)
- **3** Flammable liquids
- **4** Flammable solids: **4.1** flammable solid, **4.2** spontaneously combustible, **4.3** dangerous when wet
- **5** **5.1** oxidizers, **5.2** organic peroxides
- **6** **6.1** toxic, **6.2** infectious substances
- **7** Radioactive
- **8** Corrosives
- **9** Miscellaneous

**What a placard looks like.** A placard is a **diamond** (a square on its point), **color-coded** to the hazard — **red** = flammable, **green** = non-flammable gas, **orange** = explosive, **yellow** = oxidizer, **white** = poison, **blue** = dangerous when wet, **black and white** = corrosive. The **hazard-class number sits in the bottom corner**, a **symbol sits at the top**, and a **four-digit UN ID number** shows either across the center of the placard or on an **orange panel** beside it. Read the color, the class number, and the UN ID at a glance.

[[figure:dot-placard-classes]]

If the paperwork and the placards do not match the freight, **stop and ask** before you move.`,
      },
      {
        order: 2,
        title: "Placards, papers, and keeping loads apart",
        estMinutes: 6,
        bodyMarkdown: `**When placards are required (49 CFR 172.504).** Most hazmat must be placarded once the aggregate gross weight reaches **1,001 lb** (the Table 2 threshold). The most dangerous materials — **Table 1** (certain explosives, poison gas, and the like) — require placards in **any amount**. A material with a second hazard may also carry a **subsidiary placard** (the same diamond, with no class number). **Bulk packagings** (a portable tank, cargo tank, or other bulk container) are **always placarded regardless of weight** — the 1,001-lb Table 2 threshold does not apply to bulk.

[[figure:hazmat-table1-vs-table2-decision-tree]]

[[figure:placard-anatomy]]

**The shipping paper and the basic description.** It must be within reach while you drive and easy to find in an emergency (on top of other papers, or tabbed). The **basic description** lists, in order, the **UN ID number, proper shipping name, hazard class, and packing group**, plus the quantity, an emergency-response phone number, and the **shipper's certification** that the load is correctly classified, packed, marked, and labeled. The **Emergency Response Guidebook (ERG)** rides in the cab and gives isolation and protective actions by UN number.

**Read the UN ID and packing group — they are not decoration.** The **four-digit UN ID** (for example, *UN 1203* gasoline, *UN 1830* sulfuric acid) is the **key to every hazmat resource**: look the number up in the orange-bordered section of the ERG and it gives you the response guide, the isolation distances, and the evacuation actions for exactly that material. The **packing group** ranks how dangerous the material is: **PG I** = high danger, **PG II** = medium, **PG III** = low. Higher danger means stricter packaging and handling. When you read a shipping paper, find the UN number first — it is what you will quote to 911, CHEMTREC, and responders.

[[figure:hazmat-shipping-paper-anatomy]]

**Do not load incompatible hazards together.** The **segregation table (49 CFR 177.848)** forbids loading certain classes in the same vehicle — oxidizers away from flammables, acids away from cyanides, and so on. **A concrete example:** a **cyanide** (a Class 6.1 poison) and an **acid** (Class 8) are marked as prohibited together, because if the acid contacts the cyanide it releases deadly hydrogen-cyanide gas — the table's "X" means they may not ride in the same vehicle even when both are correctly packaged. If a shipper hands you two classes that don't mix, that is a stop-and-verify.

To haul a **placarded** amount you need a **hazmat (H) endorsement** on your CDL (with a TSA security threat assessment), and the carrier must be **registered with PHMSA**. Hauling a placardable load without the endorsement is a serious violation.

**This awareness course is not your hazmat training.** Federal law (**49 CFR 172.704**) requires every hazmat employee — including the driver — to complete documented hazmat training, and to **renew it at least every 3 years**. The carrier keeps the training record as a DOT compliance item. If your hazmat training has lapsed, you cannot legally haul hazmat until you re-train.

**You can refuse a load that doesn't add up.** If the placards, the shipping paper, and the freight don't match — or the paperwork is missing — you have the right and the duty to **refuse the load** and tell dispatch why. Refusing an unsafe or improperly documented hazmat load is not grounds for discipline; it protects you, the carrier, and the public. Accepting it puts the violation on your CDL.`,
      },
      {
        order: 3,
        title: "On the road with a hazmat load",
        estMinutes: 4,
        bodyMarkdown: `Once the load is on, the driving and parking rules in **49 CFR Part 397** apply for the whole trip.

**Routes and tunnels.** Operate over routes that avoid heavily populated areas, crowds, tunnels, narrow streets, and alleys unless there is no practical alternative. Many states and cities post **designated hazmat routes** and **tunnel restrictions** — follow them. Explosives in Division 1.1, 1.2, or 1.3 require a **written route plan**.

**Attendance and parking (397.5, 397.7).** A placarded vehicle carrying **Division 1.1/1.2/1.3 explosives must be attended at all times.** No placarded hazmat parks on or within **5 feet** of the traveled part of the road except for brief operational needs. Explosives must not park within **300 feet** of a bridge, tunnel, dwelling, or a place where people gather, except briefly when the job requires it. **No hazmat** parks within **300 feet of an open fire.**

**Smoking, flares, and fueling.** No smoking within **25 feet** of a vehicle carrying explosives, oxidizers, or flammables. To mark a stop near explosives or flammables, use **reflective triangles**, never burning flares or fusees. Shut the engine off and stay at the nozzle while fueling.

[[figure:hazmat-parking-distances]]

These are awareness points; your full hazmat training and the ERG carry the details. When in doubt, slow down and verify before you pick a route or park.`,
      },
      {
        order: 4,
        title: "If something goes wrong",
        estMinutes: 4,
        bodyMarkdown:
          "At a leak, spill, or crash involving hazmat, the order is **protect, isolate, call**.\n\n**Protect yourself first.** Stop, stay **upwind** (if upwind and uphill conflict, *upwind wins* — vapor travels with the wind), and do not walk through or touch spilled material or vapor. You cannot help anyone if you are down.\n\n**Isolate.** Keep people back and look the **UN number** up in the orange section of the ERG. It gives you two distances: the **initial isolation distance** (a circle around the spill that *nobody* enters) and the **protective-action distance** (how far downwind people must **evacuate or shelter in place**). For a small spill these are tens of feet; for a large spill or a PIH gas they can be hundreds of feet to over a mile. Quote the UN number to responders so they pull the right guide.\n\n**Call.** Dial **911** and **CHEMTREC at 1-800-424-9300** for chemical emergency guidance, then notify your carrier and SRL. You are not the cleanup crew — your job is to protect yourself, keep others back, and get the experts moving. Let trained responders handle containment.\n\nHazmat also carries a **security awareness** duty: watch for and report tampering, theft, or anyone showing unusual interest in your load. A hazmat load is a target. Certain higher-risk hazmat also require the carrier to have a **written security plan (49 CFR 172.800-172.804)** covering personnel security, unauthorized access, and en-route security — ask your carrier whether the load you're hauling falls under one.",
      },
      {
        order: 5,
        title: "Crossing into Canada: TDG basics",
        estMinutes: 4,
        bodyMarkdown:
          "If your hazmat load crosses into Canada, the **Transportation of Dangerous Goods (TDG) Act and Regulations** apply and parallel the US system.\n\nYou will see the same idea in Canadian dress: the **DG classes**, a **shipping document**, **safety marks** (placards and labels), and for certain higher-risk goods an **Emergency Response Assistance Plan (ERAP)** must be referenced on the document. Drivers handling dangerous goods need TDG **training certification**.\n\nThe class system is harmonized, so the hazards translate, but the paperwork, training certificate, and some thresholds differ. Verify the current TDG requirements (and your training certification) before you run a cross-border DG load.",
      },
    ],
    questions: [
      { order: 1, question: "A green diamond placard with a 2 in the bottom corner tells you the trailer is carrying:", options: ["a flammable liquid", "a non-flammable gas", "a corrosive", "an oxidizer"], correctIndex: 1, explanation: "Green = Class 2.2, a non-flammable, non-toxic gas. Red is flammable, white is poison, yellow is oxidizer — the color plus the class number identify the hazard at a glance." },
      { order: 2, question: "A load has 400 lb of a Table 2 hazmat plus 1 lb of a Table 1 material. Placards are required because:", options: ["the combined weight is over 1,001 lb", "the Table 1 material must be placarded in any amount", "all hazmat is always placarded", "no placards are needed under 1,001 lb"], correctIndex: 1, explanation: "Table 2 materials only need a placard at 1,001 lb aggregate (172.504), so the 400 lb alone would not. But Table 1 materials require placards in ANY amount — the 1 lb triggers it." },
      { order: 3, question: "To drive a placarded load of hazmat, the driver must hold:", options: ["a clean CDL with no endorsements", "a hazmat (H) endorsement plus a TSA security threat assessment", "a tanker (N) endorsement", "a doubles/triples (T) endorsement"], correctIndex: 1, explanation: "A placardable quantity requires the hazmat (H) endorsement, which includes a TSA background check; the carrier must also be PHMSA-registered. Tanker and doubles/triples are different endorsements." },
      { order: 4, question: "A shipper wants you to load an oxidizer (5.1) and a flammable liquid (3) together in one trailer. You should:", options: ["load them — any classes can ride together", "check the segregation table (177.848); these may be incompatible", "load them only if both are placarded", "load the heavier one toward the nose"], correctIndex: 1, explanation: "The segregation table in 49 CFR 177.848 prohibits loading certain hazard classes together. Oxidizers and flammables are a classic do-not-mix pair — verify before you load." },
      { order: 5, question: "At a hazmat leak, your first action is to:", options: ["start cleaning up the spilled material", "stop, stay upwind and uphill, and keep clear of the vapor", "drive the load away from the scene", "open the trailer to inspect the packages"], correctIndex: 1, explanation: "Protect yourself first — stop, stay upwind and uphill, and avoid contact with the material or vapor. You cannot help anyone if you go down. Then isolate and call 911 / CHEMTREC." },
      { order: 6, question: "For chemical-emergency guidance during a hazmat incident, you call:", options: ["the National Response Center for response advice", "CHEMTREC at 1-800-424-9300", "your insurance company", "the shipper's sales line"], correctIndex: 1, explanation: "CHEMTREC (1-800-424-9300) gives 24/7 chemical emergency response information. Call 911 first for life safety; the National Response Center (1-800-424-8802) is for required federal spill reporting, a different purpose." },
      { order: 7, question: "Dispatch asks you to take a placardable load of Class 3 (flammable liquid), but you don't hold a hazmat (H) endorsement. You should:", options: ["load it but stay off populated routes", "refuse the load and tell dispatch why", "get trained on the way to the shipper", "load it if the shipper signs a waiver"], correctIndex: 1, explanation: "Hauling a placardable load without the H endorsement is a serious violation that lands on YOUR CDL — no waiver or careful routing makes it legal. Refusing and reporting to dispatch is the right and protected call." },
      { order: 8, question: "At a spill, the fastest way to get the correct isolation and evacuation distances is to:", options: ["guess based on how the chemical smells", "look up the four-digit UN ID number in the ERG", "wait for the shipper to call back", "read the back of the placard"], correctIndex: 1, explanation: "The UN ID number is the key to the ERG — look it up in the orange-bordered section and it gives you the response guide plus the initial isolation distance and the downwind protective-action distance. Quote that number to 911 and CHEMTREC." },
      { order: 9, question: "You're hauling a placarded load of Division 1.1 explosives and need to stop. Under 49 CFR Part 397 you must:", options: ["leave it at a rest area and grab a meal", "keep it attended at all times and away from bridges, tunnels, and dwellings", "park within 5 feet of the road so it stays visible", "mark the truck with a lit flare"], correctIndex: 1, explanation: "Division 1.1/1.2/1.3 explosives must be attended at all times (397.5) and may not park within 300 feet of a bridge, tunnel, dwelling, or crowd except briefly for operational needs (397.7). Mark a stop with reflective triangles, never burning flares (397.15)." },
    ],
  },

  // ─────────────────────────────────────────────────────────
  {
    slug: "hazard-communication",
    title: "Hazard Communication: WHMIS & HazCom",
    category: "Hazardous Materials",
    summary: "Workplace chemical safety on the dock and in the warehouse: the GHS labels and pictograms, the Safety Data Sheet, the NFPA 704 facility diamond, and your right to know. (Not the transport placards.)",
    version: "6",
    estMinutes: 20,
    passThreshold: 80,
    validityMonths: 12,
    sortOrder: 4,
    disclaimer: DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "Two different systems",
        estMinutes: 4,
        bodyMarkdown:
          "Hazard communication is about the chemicals you handle or work around at a dock, warehouse, or shop, not the freight in the trailer.\n\nIn the US it is **OSHA's Hazard Communication Standard (HazCom), 29 CFR 1910.1200**. In Canada it is **WHMIS 2015** (Workplace Hazardous Materials Information System). Both are aligned to the **Globally Harmonized System (GHS)**, so the labels and data sheets look the same in either country.\n\nThis is **different** from the placards and shipping papers on a dangerous-goods load, which are governed by the transport rules (HMR / TDG) covered in the other course. A drum with a GHS label sitting on a dock is a workplace-safety matter; the same drum placarded on a trailer is a transport matter.\n\nThe core principle is **right to know**: you are entitled to know the hazards of the chemicals you work near, and how to protect yourself.\n\n[[figure:hazard-communication-systems-comparison]]\n\n> " + DISCLAIMER,
      },
      {
        order: 2,
        title: "Labels and pictograms",
        estMinutes: 4,
        bodyMarkdown:
          "A **GHS supplier label** (placed on the container by the manufacturer) carries: the product identifier, a **signal word**, hazard and precautionary statements, the **pictograms**, and the supplier's information.\n\nThe **signal word** ranks severity: **Danger** is the more severe hazard, **Warning** the less severe. Only **one** signal word appears on a label.\n\n**OSHA requires 8 pictograms** on US workplace labels — red-bordered diamonds: flame (flammable), corrosion (corrosives), exclamation mark (irritant/harmful), health hazard (serious/long-term effects), skull and crossbones (acute toxicity), gas cylinder (gases under pressure), exploding bomb (explosives), and flame over circle (oxidizers). The full GHS has a **9th** — the **environmental** pictogram (a dead fish and tree) — but **OSHA does not require it**, because environmental hazards are outside OSHA's scope. Canada's **WHMIS 2015 uses the same 8** for workplace labels (you may still see the environmental one on a full-GHS or Canadian label).\n\n[[figure:ghs-pictograms]]\n\n**Labels on containers you fill.** You may also see a simpler **workplace label** on a container a worker filled. If you pour a chemical into another container, it must be labeled too — the only exception is a container for **your own immediate use** that never leaves your hands. Filling an unlabeled container for someone else is a violation. And never use product from an unlabeled container; report it.",
      },
      {
        order: 3,
        title: "The Safety Data Sheet (SDS)",
        estMinutes: 4,
        bodyMarkdown:
          "Every hazardous workplace chemical has a **Safety Data Sheet (SDS)** with a standardized **16 sections** in a fixed order.\n\nThe sections a driver or dock worker reaches for first:\n\n- **Section 1 Identification** (what it is, supplier, emergency phone)\n- **Section 2 Hazards** (what it can do)\n- **Section 4 First-aid measures** (skin, eye, inhalation, ingestion)\n- **Section 6 Accidental release** (what to do for a spill)\n- **Section 7 Handling and storage**\n- **Section 8 Exposure controls / PPE**\n\n**Section 8 is where you pick your protection.** It names the gloves, eye protection, and respirator that fit *that specific* chemical — so before you handle something you don't know, read Section 8 and wear exactly the PPE it calls for (a splash goggle and nitrile gloves for one product, a face shield and a respirator for another).\n\nSections 9-16 cover physical properties, stability, toxicology, and the ecological, disposal, transport, and regulatory details. All 16 must be present and in order; OSHA enforces the content of sections 1-11 and 16, since 12-15 fall under other agencies. The facility must keep SDSs accessible to workers. If you are asked to handle a chemical you do not know, find its SDS first.\n\n**Finding it fast matters in an emergency.** SDSs live in a binder, a posted sheet, or an electronic system (a computer, a QR code on the label, or a facility app). At an unfamiliar dock the quickest path is to **ask the supervisor or safety officer where the SDS station is** — know where to look before you need it, not during a spill.\n\n[[figure:sds-sections-quick-reference]]",
      },
      {
        order: 4,
        title: "Your rights and what to do",
        estMinutes: 5,
        bodyMarkdown:
          "Hazard communication gives you concrete rights: to be **trained** (your employer is legally required to train you on the chemicals you work around, 29 CFR 1910.1200(h)), and to **access** the labels and SDSs. That training must happen **before you are assigned to work with a hazardous chemical**, and **again whenever a new chemical hazard — a new product, label, or SDS — is introduced** into your work area. Canada's WHMIS pairs with a **right to refuse unsafe work** — though that right actually comes from the **Canada Labour Code Part II**, not WHMIS itself. In the US the right to refuse varies by state and employer.\n\nIf a chemical contacts your skin or eyes, go to the **SDS first-aid section** and act on it (most call for flushing with water); get medical help for anything serious.\n\nA **damaged, worn, or missing container label** is the facility's legal duty to fix — don't guess at what's inside or move it unsafely. **Report it to the supervisor** and let them restore the label.\n\n**A third marking you'll see at facilities: NFPA 704.** On tanks, building walls, and storage rooms you will often see a four-color diamond — the **NFPA 704 fire diamond**, meant for firefighters and emergency responders. **Blue** (left) rates health, **red** (top) flammability, **yellow** (right) instability, each on a **0 (minimal) to 4 (severe)** scale; the **white** bottom box flags special hazards (**OX** oxidizer, **W** water-reactive). A bar-style cousin, **HMIS**, does the same for some workplaces. These rate a chemical's hazard for response; they are not GHS labels and not DOT placards.\n\n[[figure:nfpa-704-diamond]]\n\nKeep the systems straight: the GHS pictograms on a drum are **workplace** hazard communication, the NFPA 704 diamond on a tank is a **fixed-facility** responder rating, and the placards on a trailer are **transport** marking. Knowing which is which keeps you from misreading a load or a dock.",
      },
    ],
    questions: [
      { order: 1, question: "WHMIS (Canada) and OSHA HazCom (US) govern:", options: ["the placards and shipping papers on a dangerous-goods trailer", "the safe handling of chemicals you work around at a dock, shop, or warehouse", "the apportioned registration of the truck", "the driver's hours-of-service limits"], correctIndex: 1, explanation: "WHMIS and HazCom are WORKPLACE chemical hazard communication — the chemicals you handle on the dock or in the shop. The trailer's placards and papers are a separate transport system (HMR/TDG)." },
      { order: 2, question: "You're asked to handle a cleaning solvent you don't know. Where do you find its hazards, first-aid, and spill steps?", options: ["its Safety Data Sheet (SDS)", "the Emergency Response Guidebook (ERG)", "the bill of lading", "the product's sales brochure"], correctIndex: 0, explanation: "The Safety Data Sheet gives standardized hazard, first-aid, handling, and spill information for a workplace chemical. The ERG is for transport emergencies — a different system." },
      { order: 3, question: "A label reads the signal word \"Warning.\" Compared with a label reading \"Danger,\" this product's hazard is:", options: ["more severe", "less severe", "exactly the same", "not regulated"], correctIndex: 1, explanation: "GHS uses exactly two signal words: Danger (more severe) and Warning (less severe). \"Warning\" signals the lower hazard level." },
      { order: 4, question: "A red-bordered diamond with a flame-over-a-circle symbol on a drum marks:", options: ["a flammable liquid", "an oxidizer", "a corrosive", "an environmental hazard"], correctIndex: 1, explanation: "The flame-over-circle pictogram means an OXIDIZER (it makes fires burn hotter). A plain flame is flammable; a liquid eating a hand/surface is corrosion; a dead tree and fish is the environment pictogram." },
      { order: 5, question: "A solvent splashes in a coworker's eyes. Which SDS section do you go to first?", options: ["Section 1, Identification", "Section 4, First-aid measures", "Section 9, Physical properties", "Section 14, Transport information"], correctIndex: 1, explanation: "Section 4 (First-aid measures) gives the immediate steps for eye, skin, inhalation, and ingestion exposure. The 16 SDS sections sit in a fixed order so you can find first-aid fast." },
      { order: 6, question: "A drum on a warehouse rack shows a GHS pictogram diamond. That labeling is governed by:", options: ["the DOT Hazardous Materials Regulations (transport placarding)", "the OSHA HazCom / WHMIS workplace standard", "the rate confirmation", "the IFTA agreement"], correctIndex: 1, explanation: "A drum sitting in a workplace is governed by OSHA HazCom (US) / WHMIS (Canada). The same drum, once placarded on a trailer, falls under the DOT transport rules — two different systems." },
      { order: 7, question: "How many hazard pictograms does OSHA require on US workplace labels?", options: ["7, since OSHA drops one symbol", "8", "9, the full harmonized GHS set", "as many as the chemical carries"], correctIndex: 1, explanation: "OSHA HazCom (29 CFR 1910.1200) mandates 8 pictograms; the environmental/aquatic pictogram is the 9th in the full GHS (and appears on some Canadian/WHMIS labels) but is outside OSHA's jurisdiction. WHMIS 2015 also uses the same 8 for workplace labels." },
      { order: 8, question: "At an unfamiliar dock you need the SDS for a cleaner to check the PPE, but it isn't where you expect. You:", options: ["use it without checking the PPE section first", "ask where the SDS station is", "assume the container label tells you everything", "skip the whole job and move on"], correctIndex: 1, explanation: "The facility must keep SDSs accessible — ask the supervisor or safety officer where the SDS station is. The label alone doesn't give the full PPE, first-aid, and spill guidance the SDS does." },
      { order: 9, question: "On a storage tank you see a four-color diamond (blue, red, yellow, white) with numbers. That marking is:", options: ["a DOT transport placard", "a GHS workplace label", "an NFPA 704 fixed-facility rating for emergency responders", "an apportioned-registration decal"], correctIndex: 2, explanation: "The four-color NFPA 704 fire diamond rates a chemical for responders at a fixed facility: blue health, red flammability, yellow instability (0-4 each), plus a white special-hazard box (OX, W). It is not a GHS workplace label and not a DOT transport placard — three different systems." },
    ],
  },

  // ─────────────────────────────────────────────────────────
  {
    slug: "pre-post-trip-inspection",
    title: "Pre-Trip & Post-Trip Inspection + DVIR",
    category: "Vehicle & Cargo Safety",
    summary: "The legal duty to inspect, a systematic pre-trip (under the hood, in the cab, and the walk-around), the air-brake test by the numbers, the post-trip DVIR, and what to do when a defect shows up en route.",
    version: "5",
    estMinutes: 23,
    passThreshold: 80,
    validityMonths: 12,
    sortOrder: 5,
    disclaimer: DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "Why you inspect, and the law",
        estMinutes: 4,
        bodyMarkdown:
          "Inspecting your truck is not a formality. Under **49 CFR 392.7** you may not drive unless you are **satisfied the vehicle is in safe operating condition**, and under **49 CFR 396.13** you must **review the last driver's vehicle inspection report (DVIR)** before driving and confirm any noted defects were corrected.\n\nA missed brake or tire defect is your problem at 65 mph and your carrier's problem on its CSA Vehicle Maintenance score. A clean, deliberate inspection protects you, the load, and the carrier you run under.\n\nDriving a vehicle you know is unsafe is a violation and, more importantly, a way to get hurt. If it is not right, it does not roll.\n\n> " + DISCLAIMER,
      },
      {
        order: 2,
        title: "The pre-trip walk-around",
        estMinutes: 8,
        bodyMarkdown:
          "Walk it the **same direction every time** so you never skip a side: start at the driver's door, work forward and down that side, around the back (and the trailer), up the passenger side, then into the cab. Same order, every truck.\n\n**Under the hood (engine off).** Before you start it: oil and coolant levels, power-steering and washer fluid, belts and hoses (no frays, cracks, or looseness), the steering box and linkage, and the ground under the engine for fresh leaks. A belt or hose that lets go on the road strands you or cooks the engine.\n\n**In the cab (start-up).** Start the engine and confirm the gauges come alive: **oil pressure rises within seconds, air pressure builds, the ammeter or voltmeter reads normal, coolant temperature climbs to its normal range.** The **ABS and warning lights should flash on, then go out** — if the ABS lamp stays lit, the system has a fault. Check the horn, wipers, washers, defroster, and mirrors, and confirm **steering free-play** is within limits (a common guide is no more than about 10 degrees, roughly 2 inches at the rim of a 20-inch wheel).\n\n**The air-brake check (if equipped) — by the numbers.** Build the system to governor cut-out, shut the engine off, then:\n\n- **Static leak-down** (brakes released, system charged): pressure loss under **2 psi/min** for a single vehicle, **3 psi/min** for a combination.\n- **Applied leak-down** (fully apply and hold the foot brake one minute): loss under **3 psi/min** single, **4 psi/min** combination.\n- **Low-air warning:** fan the brakes down; the light/buzzer must come on **before pressure drops below ~60 psi** (the CDL-manual teaching figure). The regulation, **49 CFR 393.51**, actually sets it at **55 psi, or ½ the governor cutout, whichever is less** — so ~60 psi is a conservative practical trigger.\n- **Spring-brake pop-out:** keep fanning; the parking and tractor-protection valves should pop out between **~20 and 45 psi**.\n- **Governor:** restart and let air build — the compressor should **cut in around 100 psi and cut out around 120-125 psi**.\n- **Air build-up rate:** at operating rpm, pressure should build **from about 85 to 100 psi within roughly 45 seconds**. A slow build points to a weak compressor or a leak.\n- **Parking-brake holds test:** with the system charged, set the **parking brake**, put the truck in **low gear**, and gently tug against it — **the truck must not move**. Then release, roll at walking speed, and confirm the service brakes stop you straight and firm.\n- Finish with a **brake-applied roll test** at walking speed: the truck must stop straight and firm, no pull or sponginess.\n\n[[figure:pre-trip-air-brake-gauges]]\n\n**Walk the truck:**\n\n- **Tires** — tread depth (**steer tires at least 4/32\\\", all other tires at least 2/32\\\"**, per 49 CFR 393.75), correct inflation, no cuts, bulges, or exposed cord, no flat duals\n- **Wheels and lugs** (no missing or loose lug nuts, no cracks, no rust streaks)\n- **Brakes** (lining thickness, drums/rotors, slack-adjuster travel, air lines and chambers)\n- **Steering and suspension** (linkage, springs, mounts, no leaks)\n- **Coupling** — the fifth wheel **fully locked on the kingpin with no gap between the trailer and the fifth-wheel plate**, locking jaws closed, release handle seated, safety latch engaged, glad-hands sealed\n- **Lights and reflectors**, **mirrors**, **glass and wipers**\n- **Leaks** under the truck (oil, coolant, fuel, air)\n- **Cargo securement** and **emergency equipment** (fire extinguisher charged, 3 reflective triangles, spare fuses if used)\n\n[[figure:pre-trip-walk-sequence]]\n\n**The inspection doesn't end at the gate.** Re-check your **cargo securement within the first 50 miles** and again at every duty change, fuel stop, or every 3 hours / 150 miles (**49 CFR 392.9**). If a warning light, new noise, or pressure drop shows up en route, your duty to keep the vehicle safe (392.7) still applies — get to a safe stop and deal with it, don't drive on hoping.",
      },
      {
        order: 3,
        title: "Defects, the DVIR, and out-of-service",
        estMinutes: 4,
        bodyMarkdown:
          "**Stop-now or drive-to-repair?** Sort every defect by one question: *does it affect braking, steering, visibility, or coupling?* If yes — failed brakes, steering play, a steer tire below tread, no headlights, a loose fifth wheel — the truck **does not move** until it's fixed. If no — a burned-out marker light in daylight, a slow non-safety drip — you may be able to **drive to a repair point** under your carrier's policy. When in doubt, treat it as stop-now.\n\nThe **post-trip DVIR** (49 CFR 396.11) documents any defect found at the end of the day so the next driver and the shop know. On a multi-day trip you file a DVIR **each day**, not one at the end. If nothing is wrong, many operations still log a no-defect report. Paper and electronic (e-DVIR / ELD app) reports carry the **same legal weight** — know how to flag a defect in your carrier's app.\n\n**Your signature is a legal statement.** If you note a defect and someone pressures you to sign it off as repaired when it wasn't, **don't** — a false DVIR puts the liability on *you*. You have the right to refuse an unsafe vehicle, and that refusal is protected; it is not grounds for discipline.\n\nCommon **out-of-service** conditions roadside include (but are not limited to): brakes out of adjustment or defective, a flat or below-minimum-tread tire, steering problems, inoperative required lights, fluid leaks, and inadequate cargo securement. Your thorough pre-trip is your **first line of defense** against a roadside violation — and a clean Vehicle Maintenance BASIC score protects your carrier's rates, customers, and your job.",
      },
    ],
    questions: [
      { order: 1, question: "Before you drive, 49 CFR 396.13 requires you to:", options: ["review the previous DVIR and confirm any noted defects were repaired", "complete a fresh post-trip DVIR for the last driver", "weigh the truck at the nearest certified scale", "re-torque all the wheel lug nuts"], correctIndex: 0, explanation: "396.13 requires reviewing the LAST driver's DVIR and being satisfied any noted defects were corrected before driving. The post-trip DVIR (396.11) is a separate, end-of-day duty." },
      { order: 2, question: "The in-cab air-brake portion of a pre-trip checks the:", options: ["low-air warning, governor cut-in/out, leak-down, and parking brake", "engine oil, coolant, and belt tension", "trailer weight and axle distribution", "ELD, GPS, and dash-cam connections"], correctIndex: 0, explanation: "The air-brake check confirms the low-air warning activates, the governor cuts in/out in range, the applied-pressure leak-down is within limits, and the parking/tractor-protection holds." },
      { order: 3, question: "Your walk-around reveals a steer-axle tire below 4/32\\\" tread depth (or with exposed cord). You:", options: ["air it up to spec and drive to the next shop", "do not drive — a steer tire under 4/32\\\" is an out-of-service condition", "log it on tonight's DVIR and finish the run", "move it to a trailer position and roll"], correctIndex: 1, explanation: "Steer tires must have at least 4/32\\\" tread (49 CFR 393.75); below that — or exposed cord — is out-of-service. The truck doesn't move until it's corrected. Other tires have a 2/32\\\" minimum." },
      { order: 4, question: "A post-trip Driver Vehicle Inspection Report (DVIR) must be completed when:", options: ["the truck is refueled at the end of a shift", "a defect affecting safe operation is found", "the odometer reaches a scheduled service interval", "a different trailer is hooked for the next load"], correctIndex: 1, explanation: "Under 49 CFR 396.11 the post-trip DVIR documents any defect or deficiency affecting safe operation. Many fleets also log a no-defect report by policy." },
      { order: 5, question: "Your legal duty to be satisfied the vehicle is safe before driving comes from:", options: ["the shipper's bill of lading", "49 CFR 392.7", "the truck's owner's manual", "your dispatcher's instructions"], correctIndex: 1, explanation: "49 CFR 392.7 prohibits driving unless the driver is satisfied the vehicle and its equipment are in safe operating condition." },
      { order: 6, question: "During the in-cab air-brake check, the low-air warning (light or buzzer) must come on:", options: ["only after the brakes lock up", "before pressure drops below about 60 psi", "exactly at 30 psi", "after the spring brakes pop out"], correctIndex: 1, explanation: "The CDL manual teaches ~60 psi as the practical trigger; the regulation (49 CFR 393.51) sets it at 55 psi, or ½ the governor cutout, whichever is less. Either figure is well before the spring brakes pop out (around 20-45 psi) — fan the brakes down during the test and confirm it triggers in time." },
      { order: 7, question: "En route you notice a burned-out rear marker light in daylight. The fastest correct read is:", options: ["stop immediately, the truck is out of service", "it doesn't affect braking, steering, visibility, or coupling — you may continue to a repair point per carrier policy, then log it", "ignore it entirely, lights don't matter", "swap the trailer at the next yard"], correctIndex: 1, explanation: "Sort every defect by whether it affects braking, steering, visibility, or coupling. A single burned-out marker in daylight is a drive-to-repair item under carrier policy — but log it on the DVIR. A headlight or brake-light defect would be a different call." },
      { order: 8, question: "At engine start-up during your pre-trip, the ABS malfunction lamp comes on and then stays lit. This means:", options: ["normal — the lamp is supposed to stay on", "the anti-lock brake system has a fault that needs attention", "the parking brake is still set", "the air pressure is too high"], correctIndex: 1, explanation: "At start-up the ABS lamp should flash on and then go out. If it stays lit, the ABS has a fault. The in-cab start-up check also confirms oil pressure rises within seconds, air builds, the gauges read normal, and steering free-play is within limits." },
      { order: 9, question: "The parking-brake holds test is done by:", options: ["setting the parking brake, putting the truck in low gear, and gently tugging against it — the truck must not move", "revving the engine to build maximum air pressure", "applying the service brake and counting the leak-down", "rolling at highway speed and stabbing the brakes"], correctIndex: 0, explanation: "With the system charged, set the parking brake, select low gear, and gently tug — the truck must not move, proving the spring brakes hold. Then release and do a service-brake roll test at walking speed to confirm the truck stops straight and firm." },
    ],
  },

  // ─────────────────────────────────────────────────────────
  {
    slug: "cargo-securement",
    title: "Cargo Securement",
    category: "Vehicle & Cargo Safety",
    summary: "The FMCSA securement rules: the forces your system must hold, the working-load-limit 50% rule and how each tiedown counts, the minimum-tiedown count, a worked example you can run at the dock, spotting weak securement, and when to re-check.",
    version: "6",
    estMinutes: 24,
    passThreshold: 80,
    validityMonths: 12,
    sortOrder: 6,
    disclaimer: DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "The rules and the goal",
        estMinutes: 4,
        bodyMarkdown: `Cargo securement is governed by **49 CFR 393, Subpart I**. The goal: cargo must not shift, spill, leak, blow off, or fall during normal driving, including hard braking and hard steering.

**The forces your system must hold (49 CFR 393.102).** Under **§393.102(a)** your securement must withstand at least **0.8 g forward** (a hard stop), **0.5 g rearward**, and **0.5 g to each side**. Separately, under **§393.102(b)**, for cargo that is not fully contained by walls, a headboard, or other structure, the tiedowns must provide a **downward force of at least 20% of the article's weight**. In plain terms: the freight has to stay put when you brake hard, accelerate, or swerve, and be held down so it can't bounce free.

**It is on you.** The driver is responsible for knowing the cargo is properly distributed and secured before moving, and for keeping it that way en route. "The shipper loaded it" is not a defense if the load comes loose on your truck.`,
      },
      {
        order: 2,
        title: "Working load limit and the 50% rule",
        estMinutes: 6,
        bodyMarkdown: `**Working Load Limit (WLL)** is the maximum load a strap, chain, or anchor point is rated to hold. Use the **WLL marked on the device**; if it is unmarked, use the FMCSA default values in **49 CFR 393.108**. A tiedown's real WLL is its **lowest-rated part** — the strap, the hook, the winch, and the anchor point all count, and the weakest one wins.

[[figure:cargo-wll-weakest-link]]

**The 50% aggregate rule (393.106).** The combined WLL of all the tiedowns on an article must be **at least one-half (50%) of the weight of that article**.

**How a tiedown counts toward that 50% (393.106(d)).** A strap or chain thrown over the load from an anchor on **one side to an anchor on the opposite side** counts its **full** WLL. One that runs from a vehicle anchor to a point **on the cargo**, or over the load and back to an anchor on the **same** side, counts only **half**. The everyday over-the-top strap, rub-rail to opposite rub-rail, is a full-WLL tiedown — know the difference when you add up your aggregate WLL.

[[figure:tiedown-wll-counting]]

**Minimum number of tiedowns (393.110)** — a separate rule you must ALSO meet:

- **5 ft or shorter AND 1,100 lb or lighter:** at least **1** tiedown.
- **5 ft or shorter but over 1,100 lb:** at least **2** tiedowns.
- **Longer than 5 ft, up to 10 ft** (any weight): at least **2** tiedowns.
- **Longer than 10 ft:** **2 tiedowns for the first 10 ft, plus 1 more for each additional 10 ft** or part of it.

You must satisfy **both** the 50% rule and the tiedown count — whichever requires more straps is the one you follow.`,
      },
      {
        order: 3,
        title: "Securing it and keeping it secure",
        estMinutes: 4,
        bodyMarkdown: `Match the method to the freight: **chains and binders** for steel and heavy machinery, **straps** for palletized and general freight, with **dunnage, blocking, and bracing** to fill voids and stop movement. Use **edge protectors** so straps are not cut on sharp corners, **friction mats** to keep the load from sliding, and a **headboard or bulkhead** to protect you from a forward shift.

**Securement is not set-and-forget (49 CFR 392.9).** Re-check the load and its securement:

- Within the **first 50 miles** after you begin the trip, and
- After that, at least every **150 miles, every 3 hours, or each change of duty status** — whichever comes first.

Straps loosen and loads settle, so that first 50-mile check catches the most problems.

**Some commodities have their own rules** in Subpart I — logs, metal coils, paper rolls, concrete pipe, intermodal containers, vehicles, and large boulders each have specific tiedown requirements. A quick primer on the ones SRL hauls:

- **Metal coils (49 CFR 393.120)** — how you secure a coil depends on how it sits: a coil with its **eye crosswise** (eye-to-the-side) follows different tiedown rules than one with its **eye lengthwise or eye vertical** (eye-to-the-rear / eye-up). Coils are extremely high-density and deadly if they shift, so the section spells out the timbers, chocks, and tiedown counts for each orientation.
- **Vehicles & machinery (49 CFR 393.128)** — secure by the **chassis or the wheels** per the method the section requires; **light vehicles (10,000 lb or less) need at least 2 tiedowns**, and heavier tracked or wheeled equipment needs more, with booms and blades restrained separately.
- **Logs (49 CFR 393.116)** — hauled on a rig with **bunks, stakes, or standards** to contain the stack, plus **wrapper tiedowns** over it.

If you haul one, learn its section before you load.`,
      },
      {
        order: 4,
        title: "Doing the math at the dock",
        estMinutes: 5,
        bodyMarkdown: `Run both rules every time, then follow whichever is stricter.

**Step 1 — the 50% rule.** Halve the article weight. That is the minimum **aggregate WLL** your straps must add up to.

**Step 2 — the tiedown count.** Measure the article and apply 393.110.

**Worked example.** A **9,000 lb** steel rack, **12 ft** long, not blocked against forward movement. Each strap is marked **WLL 3,335 lb** and is thrown rub-rail to opposite rub-rail, so each counts its full WLL.

- 50% rule: half of 9,000 = **4,500 lb** of aggregate WLL needed. Two straps give 6,670 lb, which clears it.
- Tiedown count: a 12-ft article needs **2 tiedowns for the first 10 ft, plus 1 more** for the extra 2 ft = **3 tiedowns**.

So two straps **pass** the weight rule but **fail** the count. You need **at least 3 straps** here. Three straps give 10,005 lb of aggregate WLL — well over the 4,500 lb minimum — and meet the count.

**The takeaway:** never stop at the 50% math. Count tiedowns by length too, and add edge protection and blocking so nothing slides.`,
      },
      {
        order: 5,
        title: "At the dock: accepting the load and spotting weak securement",
        estMinutes: 5,
        bodyMarkdown: `Most loads are secured by the dock crew. **You verify it before you roll** — once the truck moves, the load is your legal responsibility, not theirs.

**Void space is the silent killer.** A pallet sitting two feet behind the headboard doesn't just need straps — it needs the **gap filled** with dunnage or blocking. In a hard stop the freight slides forward through that empty space, building speed and force *before* the straps catch it, and arrives with far more energy than the tiedowns were rated to absorb. That is how a "strapped" load still punches through a headboard. **Block and brace tight against forward movement, and fill the voids.** A load braced solid against the headboard can also legally need fewer tiedowns under 393.110 than the same load floating in the middle of the deck.

[[figure:cargo-void-space-dynamics]]

**Spot the weak link — WLL is only real if the hardware is sound.** Before you accept the securement, look for:

- **Twisted straps or chains.** A twisted tiedown is weakened — tightening it gives false confidence. Keep every strap and chain **flat and straight**.
- **Cut, frayed, or knotted webbing**; **burned or melted** synthetic straps (UV and heat degrade them).
- **Bent or cracked hooks, broken or stretched chain links, cracked winch welds.**
- **Anchor points** — cracked welds, enlarged bolt holes, a rub rail starting to tear. If one anchor lets go, the rest overload in a chain reaction.
- **Missing edge protectors** where a strap crosses a sharp corner.

**Match the device to the freight.** Chains and binders for steel and heavy machinery (they resist cutting and slipping); synthetic straps for palletized and general freight (lighter, faster, kinder to the product). If the dock hands you the wrong device for the load, say so.

**You can refuse an undersecured load.** If it isn't right, you don't move it — you tell the shipper and dispatch what's wrong and get it corrected. Pressure to clear the dock is not a reason to roll an unsafe load; the violation and the wreck both land on you.`,
      },
    ],
    questions: [
      { order: 1, question: "The combined working load limit of the tiedowns on an article must be at least:", options: ["one-quarter of the article's weight", "one-half of the article's weight", "equal to the article's weight", "twice the article's weight"], correctIndex: 1, explanation: "49 CFR 393.106 requires the aggregate WLL of the tiedowns to be at least 50% (one-half) of the weight of the secured article." },
      { order: 2, question: "After starting a trip with a freshly loaded trailer, you must first re-check securement within:", options: ["25 miles or 1 hour", "50 miles", "150 miles or 3 hours", "the first fuel stop"], correctIndex: 1, explanation: "Per 49 CFR 392.9, the first securement check is required within the first 50 miles, where loads settle and straps loosen most." },
      { order: 3, question: "After the first check, securement must be re-examined at least every:", options: ["600 miles or once per shift", "150 miles, 3 hours, or change of duty status", "300 miles or 6 hours", "state line you cross"], correctIndex: 1, explanation: "After the first 50-mile check, 49 CFR 392.9 requires re-examining the load at least every 150 miles, every 3 hours, or at each change of duty status — whichever comes first." },
      { order: 4, question: "A 12-ft article weighs 9,000 lb and is not blocked against forward movement. Each strap is rated WLL 3,335 lb. The minimum that legally secures it is:", options: ["two straps — that meets the 50% weight rule", "three straps — to meet both the 50% rule and the 393.110 count for a 12-ft article", "one strap rated over 4,500 lb", "four straps, one at each corner"], correctIndex: 1, explanation: "Half of 9,000 lb = 4,500 lb aggregate WLL, which two straps clear. But 393.110 needs 2 tiedowns for the first 10 ft plus 1 for the extra 2 ft = 3 for a 12-ft article. You must meet both rules, so the count governs: at least three straps." },
      { order: 5, question: "A tiedown assembly's working load limit is governed by:", options: ["the heaviest load it has ever held", "its lowest-rated part — strap, hook, winch, or anchor point", "the trailer's gross weight rating", "how tightly you ratchet it"], correctIndex: 1, explanation: "A tiedown's WLL is set by its weakest link — the lowest-rated of the strap/chain, the hardware, and the anchor point. Use the marked value, or the 393.108 defaults if it is unmarked." },
      { order: 6, question: "An 8-ft article weighing 1,400 lb (not blocked forward) requires at minimum:", options: ["1 tiedown", "2 tiedowns", "3 tiedowns", "no tiedowns if it is centered"], correctIndex: 1, explanation: "Under 393.110, an article longer than 5 ft (or heavier than 1,100 lb) needs at least 2 tiedowns. An 8-ft, 1,400-lb article exceeds both thresholds, so 2 is the minimum." },
      { order: 7, question: "You notice one of the straps over the load has a twist in it. You should:", options: ["leave it — a twist makes a strap grip better", "straighten it so the strap lies flat; a twisted tiedown is weakened", "add two more twists to tighten it", "ignore it if the ratchet is tight"], correctIndex: 1, explanation: "A twisted strap or chain loses strength, and tightening it gives false confidence in the securement. Keep every tiedown flat and straight so it carries its full rated working load limit." },
      { order: 8, question: "A pallet is strapped but sits two feet behind the headboard with an open gap in front of it. The danger is:", options: ["nothing — the straps are all that matter", "in a hard stop it slides through the gap, building force before the straps catch it, and can break through", "the gap improves airflow", "the load is too far back to need straps"], correctIndex: 1, explanation: "Void space lets the freight accelerate forward in a panic stop and hit the straps (and headboard) with far more energy than they're rated for. Fill the gap with dunnage and block tight against forward movement — straps alone don't stop a sliding load." },
      { order: 9, question: "A strap runs from the left rub rail, over the load, to a fitting bolted on top of the cargo — it does not cross to the right side. Toward the 50% aggregate WLL it counts:", options: ["its full working load limit", "one-half of its working load limit", "double its working load limit", "nothing at all"], correctIndex: 1, explanation: "Under 393.106(d), a tiedown from a vehicle anchor to a point on the cargo (or over the load and back to the same side) counts only HALF its WLL. Only a tiedown that crosses to an anchor on the opposite side counts its full WLL." },
      { order: 10, question: "A single steel beam is 30 ft long. Under the 393.110 minimum-tiedown count it needs at least:", options: ["2 tiedowns", "3 tiedowns", "4 tiedowns", "6 tiedowns"], correctIndex: 2, explanation: "The rule is 2 tiedowns for the first 10 ft, plus 1 more for each additional 10 ft (or part of it). A 30-ft article is 2 (first 10 ft) + 1 (11–20 ft) + 1 (21–30 ft) = 4 tiedowns — and you still must also clear the 50% aggregate-WLL rule, whichever is stricter." },
    ],
  },

  // ─────────────────────────────────────────────────────────
  {
    slug: "reefer-cold-chain",
    title: "Reefer & Cold-Chain Protocols",
    category: "Vehicle & Cargo Safety",
    summary: "Pre-tripping the reefer unit, pre-cooling, setting to the shipper's spec, proving the temperature with pulping and logs, airflow, sanitation, a breakdown decision tree, the receiver's right to reject, and the FSMA food-transport rule. (Your role in transport, under FSMA.)",
    version: "5",
    estMinutes: 22,
    passThreshold: 80,
    validityMonths: 12,
    sortOrder: 7,
    disclaimer: DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "Pre-cool and set to spec",
        estMinutes: 5,
        bodyMarkdown:
          "This course covers **your role in transport** under the food-safety rule, not the shipper's prep or the receiver's acceptance.\n\n**Pre-trip the reefer unit, not just the trailer.** Before anything else, confirm the unit will run the whole way: check the **reefer fuel level** (a reefer that runs dry mid-route is a breakdown), look for **alarm or fault codes**, make sure it **starts and runs in the mode you'll need**, and that **defrost** cycles. A low reefer fuel tank or an ignored alarm code will not hold your load to the receiver.\n\nA reefer holds temperature; it does not pull a warm load down quickly. So **pre-cool the trailer** to the required temperature **before** you load. Loading product into a warm box is how a cold-chain claim starts.\n\nSet the reefer to the temperature the **shipper specifies on the rate confirmation or Bill of Lading (BOL)**. The setpoint is the shipper's specification, **not your judgment** and not a round number you like.\n\nRun the **mode** the load calls for: **continuous** (the unit runs steadily — used for **fresh produce and temperature-sensitive product** that need constant airflow to remove respiration and field heat) or **cycle-sentry / start-stop** (the unit cycles on and off — used for **thermally-stable, solidly frozen product**, where the small temperature swing is fine and it saves fuel). **Always run the mode the BOL specifies** no matter what the box seems to be doing. Confirm both the setpoint and the mode before you pull from the dock.\n\n**If the spec looks wrong, flag it before you load.** If a setpoint seems likely to freeze or spoil the product, **call dispatch before loading** — don't quietly override it, and don't load against your gut without raising it. The call protects the load and keeps the liability off you.\n\n[[figure:reefer-pre-cool-timeline]]\n\n> " + DISCLAIMER,
      },
      {
        order: 2,
        title: "Prove the temperature: pulping and logs",
        estMinutes: 4,
        bodyMarkdown:
          "Your defense on a temperature claim is **proof**.\n\n**Pulp the product** at pickup and at delivery: slide a probe thermometer between cases or into the designated spot and read the actual product temperature, then note it. Pulping shows the product was in spec at the two moments you had control of it — when you took it and when you delivered it.\n\n**Keep the temperature record.** Modern reefers log a continuous temperature trace you can download or print. That trace is evidence the cold chain held *the whole run* — it fills the gap between the two pulp readings.\n\n**When pulp and log disagree, the continuous log usually wins.** A clean pulp at pickup tells you the starting condition; the continuous trace tells you what actually happened mile-by-mile. If a dispute turns on a mid-route spike, the log is the stronger evidence — so don't rely on pulp readings alone.\n\nIf the receiver rejects a load on temperature, a clean pulp at pickup plus a continuous in-spec trace is what helps the **carrier** defend the load (under FSMA the carrier carries the compliance burden, not you personally). No record, no defense.",
      },
      {
        order: 3,
        title: "Airflow, breakdowns, and FSMA",
        estMinutes: 6,
        bodyMarkdown:
          "**Airflow** keeps the whole load in spec. Do not block the **return-air bulkhead** at the front (a blocked bulkhead starves the cargo space of circulation and creates dead zones — hot spots — where product warms faster than the thermostat can respond), use the **floor channels** (do not floor-load solid product directly over the air chute), and leave room for air to move around and through the load.\n\n[[figure:reefer-airflow-circulation]]\n\n**If the reefer breaks down — work the decision tree:**\n\n1. **Recognize and log.** Note the time, the setpoint, and the box temperature the moment you catch it.\n2. **Call dispatch immediately** — before you do anything else. They start a repair and loop in the shipper/receiver. You do not carry the salvage-or-scrap call alone.\n3. **Protect the load.** Keep the doors closed, find the nearest repair, and keep logging temperature. A transload may be ordered if repair will take too long.\n4. **Know the danger zone.** For refrigerated food, **40°F to 140°F** is where bacteria multiply fast (the FDA \"danger zone\"). Once a fresh load climbs above its spec and into that range, every minute counts — which is why step 2 is *call now*, not *call after you find a shop*.\n\n[[figure:reefer-danger-zone]]\n\n**A clean, odor-free box is part of the job.** FSMA's sanitary rule (**21 CFR 1.906**) requires the trailer to be in adequate sanitary condition for food. Before you load, check for residue, debris, standing water, pest signs, or off odors, and **wash out** when you switch between incompatible loads — a meat load before produce, or any non-food load before food. A dirty box can contaminate the product even when the temperature is perfect.\n\n**At delivery, the receiver has a duty too.** Under FSMA (**21 CFR 1.908**), the receiver must **assess whether the load suffered significant temperature abuse** — they may measure product temperature, check the box and the setpoint, and inspect by sight and smell, and they can **reject** the load. A rejection isn't personal; it's their legal checkpoint in the cold chain. Your clean pulp readings and continuous log are what answer it.\n\nUnder the FDA's **FSMA Sanitary Transportation of Human and Animal Food rule (21 CFR Part 1, Subpart O)**, the carrier and driver must **follow the shipper's written temperature and sanitary requirements** and be able to show they did. **The shipper must provide the written temperature and sanitary specs; your duty is to follow and document them.** The carrier must also **train its drivers in food safety and keep a record of it** (21 CFR 1.910) — but that training duty applies **when the carrier is contractually responsible for the sanitary conditions of transport**, and **very small carriers (less than $500,000 in average annual revenue) are exempt** from the rule. Clean equipment, the right setpoint, and the temperature record together meet that duty.",
      },
    ],
    questions: [
      { order: 1, question: "Before loading a reefer, you:", options: ["load first, then bring the box down to temp", "pre-cool the trailer to the required temperature", "run the unit warm to save fuel", "leave the doors open to vent"], correctIndex: 1, explanation: "Pre-cool the trailer before loading. A reefer holds temperature; it does not rapidly pull a warm load down — loading into a warm box is how a cold-chain claim starts." },
      { order: 2, question: "The reefer setpoint should be:", options: ["a safe round number like 34°F", "the temperature the shipper specifies on the rate con / BOL", "whatever holds the box steady", "matched to the outside air"], correctIndex: 1, explanation: "Even if a round number like 34°F is an industry standard, the shipper's written specification takes precedence. Load the spec you're given, not a number that merely seems safe — and if the spec looks wrong, call dispatch before loading." },
      { order: 3, question: "\"Pulping\" a load means:", options: ["reading product temperature with a probe thermometer", "weighing each pallet", "checking the trailer's air-temp display", "counting the cases"], correctIndex: 0, explanation: "Pulping uses a probe thermometer to read ACTUAL product temperature at pickup and delivery — the trailer's air-temp display is not the same as product temp." },
      { order: 4, question: "To keep cold air moving through the load, you:", options: ["leave the return-air bulkhead clear and use the floor channels", "floor-load solid product over the air chute", "block the bulkhead to hold the cold in", "pack the load tight against the front wall"], correctIndex: 0, explanation: "Keep the return-air bulkhead clear and use the floor channels. Blocking the bulkhead or floor-loading solid over the chute starves airflow and creates hot spots." },
      { order: 5, question: "The federal rule governing temperature and sanitary transport of food is:", options: ["the Carmack Amendment", "the FSMA Sanitary Transportation rule", "IFTA", "the hours-of-service rules"], correctIndex: 1, explanation: "FSMA's Sanitary Transportation rule (21 CFR Part 1, Subpart O) requires carriers and drivers to follow and document the shipper's temperature and sanitary requirements." },
      { order: 6, question: "Your reefer breaks down mid-route on a fresh load. Your first move is to:", options: ["wait and see if it restarts on its own", "note the time and temperature, then call dispatch immediately", "decide yourself whether to dump or deliver the load", "open the doors to check the product"], correctIndex: 1, explanation: "Recognize and log (time + temp), then call dispatch right away — they start a repair and loop in the shipper/receiver. You don't carry the salvage-or-scrap call alone, and opening the doors just lets more cold out. Above 40°F a fresh load is entering the danger zone, so every minute counts." },
      { order: 7, question: "At delivery the receiver measures the product, checks your setpoint, and rejects the load for temperature abuse. This is:", options: ["the receiver overstepping — only the carrier can reject", "the receiver's legal duty under FSMA to assess significant temperature abuse", "always the driver's personal fault", "something you should argue them out of"], correctIndex: 1, explanation: "Under 21 CFR 1.908 the receiver must assess whether the load suffered significant temperature abuse and may reject it. It's their checkpoint in the cold chain, not a personal judgment of you — your clean pulp readings and continuous log are what answer it." },
      { order: 8, question: "Pre-tripping a reefer load adds a step that tractor pre-trip doesn't cover:", options: ["checking the trailer tires", "the reefer's own fuel level, alarm codes, mode, and defrost", "weighing the load", "reviewing the previous DVIR"], correctIndex: 1, explanation: "The reefer is a separate diesel unit — check its fuel level (a reefer that runs dry mid-route is a breakdown), look for alarm or fault codes, and confirm it runs in the mode you need and that defrost cycles. The setpoint and mode themselves come from the shipper's spec." },
      { order: 9, question: "Before loading a food shipment, the trailer box should be:", options: ["any condition as long as the temperature is right", "clean, dry, odor-free, and free of pests and residue", "freshly painted inside", "loaded only by the shipper's crew"], correctIndex: 1, explanation: "FSMA's sanitary rule (21 CFR 1.906) requires the trailer to be in adequate sanitary condition for food. Wash out between incompatible loads and check for residue, standing water, pests, and off odors — a dirty box contaminates product even at a perfect temperature." },
      { order: 10, question: "Which mode fits which load?", options: ["continuous for solidly frozen product; cycle-sentry for fresh produce", "continuous for fresh produce and temperature-sensitive product; cycle-sentry for thermally-stable, solidly frozen product", "always run cycle-sentry to save fuel", "the mode doesn't matter as long as the setpoint is right"], correctIndex: 1, explanation: "Continuous runs steadily to pull respiration and field heat off fresh produce and temperature-sensitive product; cycle-sentry (start-stop) suits thermally-stable, solidly frozen product where the small swing is fine and it saves fuel. Either way, run the mode the BOL specifies." },
    ],
  },

  // ─────────────────────────────────────────────────────────
  {
    slug: "accident-procedures",
    title: "Accident Procedures & Emergency Response",
    category: "On-Road Safety",
    summary: "The first minutes at a crash, staying safe from secondary crashes, placing warning devices, when a post-accident test is required and the no-alcohol rule, preserving evidence, and the hazmat-release report.",
    version: "5",
    estMinutes: 20,
    passThreshold: 80,
    validityMonths: 12,
    sortOrder: 8,
    disclaimer: DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "The first minutes at a crash",
        estMinutes: 4,
        bodyMarkdown:
          "When you are in or come upon a crash, the first minutes matter most.\n\n**Stop.** Leaving the scene of an accident you were involved in is a **major offense** that can disqualify your CDL. Pull clear only as far as safety requires.\n\n**Secure the scene.** Turn on your hazards, and protect the area from a secondary crash. Check for injuries and call **911**. Do not move a seriously injured person unless there is fire or immediate danger.\n\n**Mind your own safety first — secondary crashes kill people at scenes.** On a **high-speed highway**, the most dangerous place to stand is on the roadway behind or in front of the wreck. Unless there is fire or immediate danger, it is often safer to **stay in the cab with your seatbelt on, doors closed, and hazards running** until law enforcement arrives. The **number-one reason to stay inside is a downed, energized power line** across or near your truck — if a line is down, the ground and the cab-exit path can be lethally charged, so stay in the cab and wait for the utility crew unless fire forces you out. Only step out to place triangles if you can do it safely — clear sight lines, traffic that can see you, off the live lane. At night or in fog the risk of being struck is highest; don't become the second casualty.\n\nStay calm, stay safe, and get help moving. Everything else (paperwork, calls to dispatch) comes after life safety.\n\n> " + DISCLAIMER,
      },
      {
        order: 2,
        title: "Warning devices and emergency equipment",
        estMinutes: 5,
        bodyMarkdown:
          "Stopped on or beside a roadway, you must put out **warning devices within 10 minutes** (49 CFR 392.22).\n\n**Put on your high-visibility vest before you step out.** Any time you leave the cab to place triangles or work near traffic, wear a high-visibility (reflective) vest — at a roadside scene it's what lets an approaching driver pick you out in time to move over.\n\n**Placement of your 3 reflective triangles:**\n\n- **Two-way highway** (traffic moving in both directions): one about **10 ft** from the truck toward approaching traffic, one about **100 ft** behind, and one about **100 ft** ahead of the truck.\n- **One-way or divided highway** (physical median or one-directional flow): place all three to the rear at about **10 ft, 100 ft, and 200 ft** toward approaching traffic.\n- **Hills, curves, or obstructions:** move the farthest device back **100 to 500 ft** so traffic sees the warning before it crests or rounds.\n\n[[figure:warning-device-placement-highway]]\n\n**Required emergency equipment (49 CFR 393.95):** a charged and rated **fire extinguisher**, **spare fuses** (if your vehicle uses them), and **3 bidirectional reflective triangles**. Check them on your pre-trip so they are there when you need them.",
      },
      {
        order: 3,
        title: "Testing, documentation, and notifying",
        estMinutes: 5,
        bodyMarkdown:
          "**Post-accident drug & alcohol testing (49 CFR 382.303).** A DOT test for **both** alcohol and controlled substances is required when:\n\n- there is a **fatality** (always — test regardless of citation), or\n- the driver gets a **citation for a moving violation** from the crash **AND** either someone got **medical treatment away from the scene** **OR** a vehicle was **towed** for disabling damage.\n\nThe injury and tow conditions trigger **both** tests — the difference is the clock: the **alcohol test must begin within 8 hours** (and the employer documents it if it slips past 2 hours), and the **controlled-substance test must begin within 32 hours**. Past those windows the employer stops trying and records why.\n\n[[figure:post-accident-test-decision-tree]]\n\n**Do not drink after a qualifying accident.** Under **49 CFR 382.209**, if you are subject to a post-accident alcohol test you may not use alcohol for **8 hours** after the accident or until you have been tested, whichever comes first. A beer to settle your nerves before the test is itself a violation, separate from whatever the test shows. **Refusing a required post-accident test is treated the same as a positive result** — it lands you in the FMCSA Clearinghouse, prohibited from driving until you complete return-to-duty.\n\n**Preserve evidence before anything is moved.** Photograph the vehicles, final positions, skid marks, debris, road, and weather **before** the truck is towed — once it's gone, that evidence is gone, and it's often what clears you on fault or crash-preventability. Get names and contact info for other parties and witnesses. Exchange information, but **do not admit fault**; let the facts speak.\n\n**If you're hauling hazmat and there's a release,** a hazmat incident triggers a separate, parallel duty: call the **National Response Center at 1-800-424-8802** as soon as possible (within 12 hours), in addition to 911 and your carrier.\n\n**What counts as a \"recordable accident\" (49 CFR 390.5).** The FMCSA definition is a crash involving a commercial motor vehicle on a highway that results in **(1) a fatality, (2) bodily injury to a person who then needs immediate medical treatment away from the scene, or (3) disabling damage to any vehicle requiring it to be towed** from the scene. It **excludes** an event involving **only** boarding or alighting from a stationary vehicle, or **only** the loading or unloading of cargo. This same definition drives **both** the post-accident testing decision and what goes in the accident register — a crash that meets it is a different animal from a parking-lot scuff.\n\n**Notify** your carrier and SRL promptly — fast notification is what lets the carrier meet the 8-hour testing window. The carrier records **qualifying crashes** (any tow-away, injury, or fatality) in its **accident register** (49 CFR 390.15); a minor fender-bender with no tow and no injury is not register-reportable.",
      },
    ],
    questions: [
      { order: 1, question: "Within how many minutes of stopping on a roadway must warning devices be placed?", options: ["5 minutes", "10 minutes", "30 minutes", "60 minutes"], correctIndex: 1, explanation: "49 CFR 392.22 requires warning devices within 10 minutes of stopping on or beside the roadway." },
      { order: 2, question: "How many reflective warning triangles are required emergency equipment?", options: ["1", "2", "3", "6"], correctIndex: 2, explanation: "49 CFR 393.95 requires 3 bidirectional reflective triangles (plus a fire extinguisher and spare fuses if used)." },
      { order: 3, question: "A post-accident DOT drug & alcohol test is ALWAYS required when:", options: ["Any fender-bender occurs", "There is a fatality", "Damage exceeds $1,000", "Only if you are at fault"], correctIndex: 1, explanation: "Under 382.303 a fatality always triggers testing for both alcohol and controlled substances. The other triggers (citation + injury treated away, or citation + tow for disabling damage) also require both tests — but a fatality is the unconditional one." },
      { order: 4, question: "After a crash, your immediate priority is to:", options: ["drive on if the damage looks minor", "secure the scene, check for injuries, and call 911", "exchange insurance and admit fault to speed the claim", "move every injured person off the road"], correctIndex: 1, explanation: "Secure the scene, render aid and call 911, then document — and do not admit fault. Only move the seriously injured if there is fire or immediate danger." },
      { order: 5, question: "Leaving the scene of a crash you were involved in is:", options: ["acceptable if the damage is minor", "a major offense that can disqualify your CDL", "allowed when no one is injured", "only a citation, not a CDL matter"], correctIndex: 1, explanation: "Leaving the scene is a major offense that carries CDL disqualification — regardless of how minor it looks or whether anyone was hurt." },
      { order: 6, question: "Refusing a required post-accident drug or alcohol test is treated as:", options: ["a minor paperwork issue", "the same as a positive result — Clearinghouse prohibition until return-to-duty", "acceptable if you feel fine", "allowed once the 2-hour mark passes"], correctIndex: 1, explanation: "A refusal counts the same as a positive test under Part 382 — you're entered in the FMCSA Clearinghouse and prohibited from safety-sensitive driving until you complete the return-to-duty process. (Alcohol testing begins within 8 hours, controlled-substance within 32.)" },
      { order: 7, question: "On a two-way highway, you place your three triangles at about:", options: ["10 ft, 100 ft, and 200 ft all behind the truck", "10 ft toward traffic, 100 ft behind, and 100 ft ahead of the truck", "one at the bumper only", "200 ft and 500 ft behind"], correctIndex: 1, explanation: "On a two-way highway: ~10 ft from the truck toward approaching traffic, ~100 ft behind, and ~100 ft ahead. The 10/100/200-all-behind pattern is for a one-way or divided highway." },
      { order: 8, question: "After a crash that requires a post-accident test, when may you have a drink?", options: ["right away, to calm your nerves", "not for 8 hours after the accident, or until you've been tested, whichever comes first", "as soon as you leave the scene", "anytime — drinking doesn't affect the test"], correctIndex: 1, explanation: "Under 49 CFR 382.209, a driver subject to post-accident testing may not use alcohol for 8 hours after the accident or until tested, whichever comes first. Drinking before the test is itself a violation, separate from the test result." },
      { order: 9, question: "Under 49 CFR 390.5, a crash counts as a 'recordable accident' when it involves a CMV on a highway and results in:", options: ["any contact between two vehicles, no matter how minor", "a fatality, an injury needing immediate treatment away from the scene, or disabling damage requiring a tow", "only damage over $10,000", "loading or unloading cargo without incident"], correctIndex: 1, explanation: "390.5 defines a recordable accident as a highway crash involving a CMV that causes a fatality, bodily injury needing immediate treatment away from the scene, or disabling damage requiring a vehicle to be towed. It excludes events involving only boarding/alighting or only loading/unloading cargo. This definition drives both post-accident testing and the accident register." },
    ],
  },

  // ─────────────────────────────────────────────────────────
  {
    slug: "adverse-weather-defensive",
    title: "Adverse-Weather & Defensive Driving",
    category: "On-Road Safety",
    summary: "The hazardous-conditions rule and when to stop, how much to cut speed on wet/snow/ice, real stopping-distance numbers, matching speed to what you can see, brake-fade and runaway ramps on grades, tire chains, and handling ice, fog, wind, jackknife, and traction loss.",
    version: "5",
    estMinutes: 22,
    passThreshold: 80,
    validityMonths: 12,
    sortOrder: 9,
    disclaimer: DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "The hazardous-conditions rule",
        estMinutes: 5,
        bodyMarkdown:
          "Federal rule **49 CFR 392.14** is direct: when conditions such as snow, ice, sleet, fog, mist, rain, dust, or smoke reduce visibility or traction, you must use **extreme caution** and **reduce speed**. When conditions become **sufficiently dangerous**, you must **discontinue** driving and stop until it is safe.\n\nPosted speed limits are set for **ideal** conditions, not bad ones. \"I was under the limit\" is no defense for driving too fast for ice or fog.\n\n**How much to slow — a rule of thumb.** On a **wet** road, cut your speed by about **a third** (roughly 55 down to 35). On **packed snow**, cut it by **half or more**. On **ice**, slow to a **crawl** and get stopped as soon as you safely can. These are starting points, not permission to run that fast if it still feels wrong.\n\n[[figure:adverse-weather-speed-reduction]]\n\n**A practical way to draw the line:** *slow* when visibility or traction starts dropping, and *stop* when you can no longer (a) see far enough ahead to stop within your sight distance, or (b) keep the truck tracking straight. If you can't read road signs or see taillights until they're right on top of you, you're past the point of slowing — get off at the next safe exit, ramp, or lot and shut down.\n\n**SRL backs the decision to stop in hazardous weather.** Don't run marginal conditions because of schedule pressure. Call dispatch with your **decision**, not a request — \"I'm shutting down at exit 142 for ice, I'll roll when it's safe\" — and **log the time and reason**. A late load is recoverable; a weather wreck is not. Your judgment on the scene governs.\n\n> " + DISCLAIMER,
      },
      {
        order: 2,
        title: "Space and stopping",
        estMinutes: 6,
        bodyMarkdown: `A loaded combination is heavy and does not stop like a car. Three things add up to your **total stopping distance**:

- **Perception distance** — how far you roll while you notice the hazard (about **1.75 seconds**, roughly **140 ft at 55 mph**).
- **Reaction distance** — how far you roll while your foot moves to the brake (about **0.75-1 second**, roughly **60 ft at 55 mph**).
- **Braking distance** — how far the truck travels once the brakes grab (over **200 ft** for a loaded rig at 55 mph).

Add them up: a loaded truck at **55 mph needs about 400+ feet to stop** — **longer than a football field** — and at higher highway speed a fully loaded rig can take **nearly two football fields**. Here is the part that surprises new drivers: **an empty truck needs MORE braking distance, not less**. With less weight, the tires press less hard into the pavement (less friction) and the brakes lock more easily, causing skids. Counterintuitive, but real — don't assume an empty trailer stops quicker.

[[figure:stopping-distance-55mph-breakdown]]

**Match your speed to what you can see.** Your stopping distance has to fit inside your sight distance. If a fog bank or hard rain cuts your view to a couple hundred feet, you cannot safely run a speed that needs 400+ feet to stop — slow down until you could stop within the distance you can actually see. \"Don't overdrive your headlights\" is the same rule at night.

[[figure:visibility-speed-matching-fog]]

**Following distance (CDL-manual rule of thumb).** Leave **one second for every 10 ft of vehicle length below 40 mph, plus one more second above 40 mph**. A 70-75 ft combination needs about **7-8 seconds** in good conditions — and **more** in rain, snow, or fog. Treat it as a floor, not a target.

Look **far ahead**, keep an **escape path** to the side, and never let a four-wheeler crowd you into having no room. Space is the cushion that turns an emergency into a near miss.`,
      },
      {
        order: 3,
        title: "Specific hazards",
        estMinutes: 6,
        bodyMarkdown:
          "**Black ice:** bridges and overpasses freeze first because cold air reaches them from above and below. Suspect ice near 32°F even when the road looks wet. **Two tells that the road has turned to ice:** the **spray flying off the tires of vehicles ahead suddenly stops** (the water has frozen), and **ice starts forming on your mirror arms, antenna, and wiper blades.** When you see either, treat the whole road as ice.\n\n**When traction goes, stay smooth.** The first sign is subtle — the steering feels light, the trailer drifts a hair on a curve, the truck doesn't respond right away. **Ease off the throttle, steer steadily, and do NOT brake hard or jerk the wheel.** Most slick-road wrecks come from overcorrecting after that first slip. If the trailer is sliding on curves, find a safe place to stop and wait it out.\n\n**Jackknife** is the worst-case skid: brake too hard on a slick road and the drive wheels (or the trailer wheels) lock and slide, swinging the trailer out of line with the tractor. The fix is prevention — slow down before you need the brakes, brake gently and early, and if you feel a skid starting, ease off the brake rather than stab it.\n\n**Hydroplaning:** in standing water, tires can ride up on a film and lose contact. It can **begin around 30 mph** — lower with **worn or underinflated tires**, or in as little as **1/10 inch of standing water** — and above roughly **50 mph** the tires can lose contact entirely. Ease off the throttle, hold the wheel steady, and avoid hard braking until you feel grip return. **After you drive through deep water, dry the brakes** with light, steady pressure while rolling slowly.\n\n**Fog:** use **low beams** — **high beams reflect off the fog droplets straight back at you** and make it worse. Slow to a speed where you can stop within your sight distance, and never overdrive it.\n\n**High wind:** a high-sided trailer can roll, and the risk is **worst when the trailer is light or empty**. In strong sustained wind or hard gusts, slow down — and on exposed bridges or open grades where a canyon or valley funnels the gusts, be ready for a sudden side shove. If it's bad enough that you're fighting the wheel, get off and wait.\n\n**Tire chains.** Many mountain states require chains on certain passes in winter — watch for posted chain-law signs and electronic warnings. Carry the chains your routes demand, know how to install them on your drive and trailer positions, and chain up *before* you're stuck, not after.\n\n**Mountain grades — protect your brakes.** Select a **safe low gear BEFORE** you start down (it's very hard to downshift once you're rolling fast), and use **engine braking** to save your service brakes — **but switch the engine brake / retarder OFF on wet, icy, or snow-covered roads.** On a slick surface the retarder can break the drive wheels loose and jackknife you (see the Railroad Crossings & Emergency Maneuvers course). **Brake fade is the killer:** if the pedal goes soft, the truck stops slowing, or you smell hot brakes, your brakes are overheating and about to quit. Do **not** pump them harder — get into a lower gear, slow with the engine, and if they're going, **take the runaway ramp.**\n\n**Runaway-truck ramps are there to save your life — use them, don't fear them.** They're long beds of soft sand or gravel (often uphill) built to stop a truck with failed brakes. **Aim straight in, stay in it, and don't try to steer back out.** It's a controlled crash: the truck gets stuck, you walk away. Hesitating because you'll damage the truck is how drivers die at the bottom of a grade.\n\n**Work zones:** expect sudden slowdowns and workers near the lane. And wear your **seat belt** (49 CFR 392.16) — in a skid, gust, or hard stop it keeps you in the seat and at the wheel, where you can still steer; thrown across the cab, you've lost all control.",
      },
    ],
    questions: [
      { order: 1, question: "Under 49 CFR 392.14, when weather makes the road sufficiently dangerous you must:", options: ["hold the posted limit to stay with traffic", "reduce speed, and stop driving until it is safe again", "turn on your flashers and keep rolling", "move to the shoulder and continue slowly"], correctIndex: 1, explanation: "392.14 requires extreme caution and reduced speed in hazardous conditions, and discontinuing driving until conditions are safe when they become sufficiently dangerous." },
      { order: 2, question: "A loaded truck at 55 mph on dry pavement needs roughly how much total distance to stop?", options: ["about 100 feet", "about 200 feet", "about 400 feet", "about 1,000 feet"], correctIndex: 2, explanation: "Total stopping distance = perception (~140 ft) + reaction (~60 ft) + braking (200+ ft) ≈ 400+ ft at 55 mph for a loaded rig — longer than a football field, and far more on a slick surface." },
      { order: 3, question: "Compared with a loaded truck, an empty truck's braking distance is generally:", options: ["shorter, because it weighs less", "longer, because less weight means less tire traction", "the same in every condition", "shorter only on dry roads"], correctIndex: 1, explanation: "Empty trucks often need MORE braking distance — less weight pressing the tires into the road means less traction, and brakes lock more easily. Don't assume an empty truck stops quicker." },
      { order: 4, question: "Your combination is about 70 ft long and you're running 55 mph in clear weather. The rule-of-thumb minimum following distance is about:", options: ["3 seconds", "5 seconds", "8 seconds", "12 seconds"], correctIndex: 2, explanation: "The CDL-manual rule of thumb: 1 second per 10 ft of length below 40 mph (70 ft = 7 seconds), plus 1 more above 40 mph = about 8 seconds. Add more in rain, snow, or fog." },
      { order: 5, question: "Which surface freezes first and is the classic black-ice trap?", options: ["the middle of a long straightaway", "bridges and overpasses", "freshly paved asphalt", "the inside of a tunnel"], correctIndex: 1, explanation: "Bridges and overpasses lose heat from above and below, so they freeze before the surrounding road. Suspect ice near 32°F even when the road just looks wet." },
      { order: 6, question: "Before a long, steep downgrade, the right move is to:", options: ["build speed early so you can coast the bottom", "select a safe low gear before you start down and use engine braking", "ride the service brakes steadily the whole way", "shift to neutral to save fuel"], correctIndex: 1, explanation: "Pick a safe low gear BEFORE the descent and use engine braking; riding the service brakes overheats and fades them, and coasting in neutral is unsafe and illegal for a CMV on a downgrade." },
      { order: 7, question: "Mid-grade your brake pedal goes soft, the truck stops slowing, and you smell hot brakes. You should:", options: ["pump the brakes hard and fast to build pressure", "recognize brake fade — get into a lower gear, slow with the engine, and take the runaway ramp if they're failing", "speed up to get to the bottom faster", "shift to neutral and steer"], correctIndex: 1, explanation: "Those are the signs of brake fade — overheated brakes about to quit. Pumping makes it worse. Drop to a lower gear and use engine braking; if the brakes are going, aim straight into the runaway ramp. It's a controlled crash that saves your life — don't hesitate over truck damage." },
      { order: 8, question: "A fog bank cuts your visibility to about 200 feet. Your safe speed is one where:", options: ["you can hold the posted limit since it's legal", "you can stop within the distance you can see", "you use high beams to see farther", "you follow the truck ahead closely to use its lights"], correctIndex: 1, explanation: "Match speed to sight distance — your stopping distance has to fit inside what you can see. At ~200 ft of visibility you can't safely run a speed that needs 400+ ft to stop. Use low beams (high beams reflect back off fog) and slow down." },
      { order: 9, question: "A rough CDL rule of thumb for cutting speed as the road gets worse is:", options: ["wet: cut by about a third; packed snow: cut by half; ice: crawl and stop", "hold the posted limit in every condition", "cut exactly 5 mph no matter the surface", "speed up to clear the bad stretch faster"], correctIndex: 0, explanation: "The CDL-manual guide: on a wet road reduce speed by about one-third (e.g., 55 to ~35), on packed snow cut it by half or more, and on ice slow to a crawl and stop as soon as you safely can." },
      { order: 10, question: "Hydroplaning in standing water can begin at speeds as low as about:", options: ["5 mph", "30 mph — and lower with worn or underinflated tires", "65 mph only", "it can't happen below highway speed"], correctIndex: 1, explanation: "Hydroplaning can start around 30 mph, lower with worn or underinflated tires or as little as ~1/10 inch of standing water, and above roughly 50 mph the tires can lose contact entirely. Ease off the throttle, hold the wheel steady, avoid hard braking — and dry your brakes with light pressure after driving through deep water." },
    ],
  },

  // ─────────────────────────────────────────────────────────
  {
    slug: "roadside-inspections-csa",
    title: "Roadside Inspections & CSA",
    category: "On-Road Safety",
    summary: "The CVSA inspection levels, out-of-service criteria, the 7 CSA BASICs, how your record follows you through the PSP, your obligations and rights at an inspection, and how a clean inspection (or a DataQs challenge) protects the carrier's score.",
    version: "5",
    estMinutes: 20,
    passThreshold: 80,
    validityMonths: 12,
    sortOrder: 10,
    disclaimer: DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "The inspection levels",
        estMinutes: 4,
        bodyMarkdown:
          "Roadside inspections follow the **CVSA North American Standard** levels. The ones you will meet most:\n\n- **Level I — full inspection:** driver credentials **and** a complete vehicle inspection, including underneath.\n- **Level II — walk-around:** driver and vehicle, but only what can be checked without going under the truck.\n- **Level III — driver-only:** license, medical card, hours of service / ELD, and shipping papers, no vehicle component.\n\nOther levels also exist: **Level IV** (a one-time special inspection, often a study), **Level V** (vehicle-only, no driver present), **Level VI** (radioactive/enhanced hazmat), **Level VII** (jurisdictional — school buses, intrastate specialty), and **Level VIII** (electronic, in-motion inspection of your data). You are most likely to meet Levels I-III.\n\nWhatever the level, the officer is checking the same things you checked on your pre-trip: your **CDL and med card**, your **HOS/ELD**, your **shipping papers**, and the truck's **brakes, tires, lights, steering, and securement**. Being ready makes it quick.\n\n[[figure:inspection-levels-cvsa-scope]]\n\n> " + DISCLAIMER,
      },
      {
        order: 2,
        title: "Out-of-service and the BASICs",
        estMinutes: 6,
        bodyMarkdown:
          "An inspection can place a **driver** out of service (an HOS violation, no valid license or medical card, or **signs of impairment** — bloodshot or glassy eyes, an odor of alcohol, slurred speech, poor balance, slow responses) or the **vehicle** out of service. Vehicle out-of-service examples from the CVSA criteria: **20% or more of the brakes defective**, a **flat or worn tire** (below the 2/32\\\" / 4/32\\\"-steer minimums), steering play beyond limits, or inoperative required lights. An out-of-service order **stops the truck until the problem is fixed** — it cannot move under its own power until then.\n\nViolations feed the carrier's **CSA Safety Measurement System**, scored across **7 BASICs**:\n\n- **Unsafe Driving**\n- **Hours-of-Service Compliance**\n- **Driver Fitness**\n- **Controlled Substances / Alcohol**\n- **Vehicle Maintenance**\n- **Hazardous Materials Compliance**\n- **Crash Indicator**\n\n[[figure:csa-7-basics]]\n\nViolations land in the FMCSA database within about **24-72 hours**, and CSA scores are **recalculated monthly**. Your conduct and your truck's condition score against the **carrier you run under**, affecting its inspection odds, insurance rates, and freight access — so one driver's bad stop touches the whole operation.\n\n**A note on what's changing.** FMCSA has proposed an overhaul of the CSA / Safety Measurement System scoring methodology, but the **current 7 BASICs remain in force until FMCSA announces a launch date** — so learn the 7 BASICs as they stand today.\n\n**And it follows you, too.** Your own roadside record — a **3-year inspection history and 5-year crash history** — lives in the FMCSA **Pre-Employment Screening Program (PSP)**, which your next prospective employer can pull (with your written consent) when you apply. A clean record is your own career asset, not just the carrier's.",
      },
      {
        order: 3,
        title: "Clean inspections and DataQs",
        estMinutes: 3,
        bodyMarkdown:
          "A **clean inspection helps** the carrier's safety record, so it is worth doing the small things: be courteous, have your license, med card, and papers ready, and keep the ELD current and the truck in shape. Readiness removes the officer's excuses for a violation and keeps the stop short and on good terms.\n\nIf you receive a violation you believe is **inaccurate** (wrong driver, an already-corrected defect, a mistaken citation), the carrier can challenge it through **DataQs**, the FMCSA's online Request for Data Review. It works only with evidence, and that evidence is gathered **at the roadside**: keep your copy of the inspection report, and add **photos, timestamps, and a few notes** on exactly what you dispute (for example, a photo of the lug nut that was cited as loose, or your pre-trip log). Hand it all to the office so they can file the RDR with proof.\n\nThe roadside is where the carrier's safety reputation is built one stop at a time. Treat every inspection as a chance to put a clean one on the board.",
      },
      {
        order: 4,
        title: "Your obligations and your rights",
        estMinutes: 4,
        bodyMarkdown: `An inspection is not optional, and how you handle it matters.\n\n**You must stop and submit.** When you're signaled into a scale or pulled for an inspection, you are legally required to stop and cooperate. The officer can ask for your **CDL, medical card, HOS/ELD records, and shipping papers**, and inspect the truck. **Refusing or obstructing a lawful inspection** carries serious legal, CSA, and career consequences — it is never the move.\n\n**Get the report, and get it to your carrier.** You're entitled to a **copy of the inspection report** — take it. Then deliver it to the carrier promptly: by the **next terminal**, or, if you won't reach one within 24 hours, get it to the office right away (a phone photo to dispatch the same day is the practical standard). The office may have repair or DataQs deadlines that depend on seeing it fast — don't leave it on the seat until Monday.\n\n**Stay professional even if you disagree.** If you think a citation is wrong, **don't argue at the roadside** and don't refuse to sign — **signing is acknowledgment, not an admission of fault.** Document it instead (photos, notes, timestamps) and challenge it later through DataQs. Arguing escalates the stop and can earn you a closer look.\n\n**An out-of-service vehicle cannot move under its own power — period.** If you're placed OOS far from a shop, the truck **stays put** until the defect is repaired. Call dispatch to arrange roadside repair, a tow, or a trailer swap. Driving an out-of-service truck "just to the next exit" is a serious violation and a liability trap. The same goes for a driver OOS order (for example, out of hours): you rest or get relief, you don't roll.`,
      },
    ],
    questions: [
      { order: 1, question: "A CVSA Level III inspection covers:", options: ["the full vehicle, including underneath", "the driver's credentials and documents only", "cargo weight and axle limits", "the engine and drivetrain"], correctIndex: 1, explanation: "Level III is the driver-credential inspection: license, medical card, hours of service/ELD, and shipping papers — no vehicle component. (The full-vehicle check is Level I.)" },
      { order: 2, question: "How many BASICs does the CSA Safety Measurement System use?", options: ["5", "6", "7", "9"], correctIndex: 2, explanation: "There are 7 BASICs, from Unsafe Driving through the Crash Indicator." },
      { order: 3, question: "A clean roadside inspection:", options: ["raises the carrier's risk score", "improves the carrier's safety record", "has no effect on CSA", "matters only for hazmat loads"], correctIndex: 1, explanation: "Clean inspections improve the carrier's CSA standing — which affects its inspection odds, insurance, and freight access. They are worth doing well." },
      { order: 4, question: "An inspection violation you believe is inaccurate is challenged through:", options: ["a DataQs Request for Data Review", "the bill of lading", "an IFTA filing", "a court lawsuit"], correctIndex: 0, explanation: "DataQs is the FMCSA's online system for challenging inaccurate inspection or crash data with supporting evidence." },
      { order: 5, question: "A CVSA Level I inspection is:", options: ["a driver-credentials check only", "a walk-around without going underneath", "the full driver-and-vehicle inspection, including underneath", "a hazmat-only inspection"], correctIndex: 2, explanation: "Level I is the complete inspection of both driver credentials and the full vehicle, including underneath. (A walk-around without going under is Level II.)" },
      { order: 6, question: "You're placed out of service for a brake defect 30 miles from the nearest shop. You:", options: ["drive carefully to the shop since it's close", "the truck cannot move under its own power — call dispatch for repair, a tow, or a trailer swap", "drive only on surface streets to avoid the interstate", "wait until dark and then drive in"], correctIndex: 1, explanation: "An out-of-service vehicle cannot move under its own power until the defect is fixed — distance to the shop doesn't change that. Call dispatch to arrange roadside repair, a tow, or a trailer swap. Driving an OOS truck is a serious violation and a liability trap." },
      { order: 7, question: "An officer cites you for a defect you're sure you fixed. The right move at the roadside is:", options: ["argue until the officer changes it", "refuse to sign the report", "stay professional, accept the report, document it with photos and notes, and challenge it later via DataQs", "ignore it and don't tell your carrier"], correctIndex: 2, explanation: "Don't argue and don't refuse to sign — signing is acknowledgment, not an admission. Take your copy, photograph/note what you dispute, get it to the office promptly, and let them file a DataQs Request for Data Review with the evidence." },
      { order: 8, question: "Beyond your current carrier's CSA score, your own roadside inspection record:", options: ["disappears when you change employers", "follows you in the FMCSA PSP — a 3-year inspection and 5-year crash history a prospective employer can pull with your consent", "is sealed and never shared", "only matters for hazmat drivers"], correctIndex: 1, explanation: "The FMCSA Pre-Employment Screening Program (PSP) holds your 3-year inspection history and 5-year crash history. A prospective carrier can request it (with your written consent) when you apply — so a clean record is your own career asset." },
      { order: 9, question: "Under the CVSA out-of-service criteria, a vehicle is placed out of service for brakes when:", options: ["any single brake shows light wear", "20% or more of its brakes are defective or out of adjustment", "the brakes are more than one year old", "the parking brake squeaks"], correctIndex: 1, explanation: "The CVSA criteria place the whole vehicle out of service when 20% or more of its brakes are defective or out of adjustment. An out-of-service order stops the truck until the defect is fixed — it can't move under its own power." },
    ],
  },

  // ─────────────────────────────────────────────────────────
  {
    slug: "weigh-stations-size-weight",
    title: "Weigh Stations, Size & Weight & Your Registration",
    category: "On-Road Safety",
    summary: "Federal weight limits and the bridge formula, seasonal frost-law restrictions, reading a CAT ticket and sliding tandems the right way, the registered-weight trap, plus the cab card and the fuel-and-mileage records you keep so the office can file.",
    version: "5",
    estMinutes: 20,
    passThreshold: 80,
    validityMonths: 12,
    sortOrder: 11,
    disclaimer: DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "Federal weight limits and the bridge formula",
        estMinutes: 6,
        bodyMarkdown:
          "On the Interstate system the federal limits are **80,000 lb** gross weight, **20,000 lb** on a single axle, and **34,000 lb** on a tandem-axle group, all subject to the **Federal Bridge Formula**, which limits how much weight you can carry based on the **spacing between axles** (axles closer together can carry less). Verify state-specific limits, which can differ.\n\nStates also set **size** limits: width is generally **8 feet 6 inches**, and height commonly around **13 feet 6 inches** (it varies by state, so check your route).\n\nIf you are **over** a legal weight or dimension, you need an **oversize/overweight permit**, and you must **carry it** and follow its route and time restrictions. Running overweight without a permit means fines and a stop. Oversize loads may also require **pilot / escort vehicles**, and you must observe state **kingpin-to-rear-axle (KPRA, the \"California bridge\") limits** that cap the distance from the kingpin to the center of the rear trailer axle group.\n\n**Seasonal weight restrictions (frost laws).** In northern states and provinces — including Michigan — roads soften during the spring thaw, so highway and county agencies post **reduced weight limits** for weeks at a time (commonly a 25 to 35 percent cut on posted routes). A load that is perfectly legal in July can be **overweight on a frost-law road in March**. Watch for posted seasonal-restriction signs and check the state's current restrictions before you run a heavy load north in late winter or spring.\n\n[[figure:bridge-formula-axle-spacing]]\n\n> " + DISCLAIMER,
      },
      {
        order: 2,
        title: "Scaling and weigh stations",
        estMinutes: 4,
        bodyMarkdown:
          "Before you trust your axle weights, **scale the truck**. A CAT scale ticket gives you three platform weights — **steer, drive, and trailer-tandem** — plus the gross. Check each against its limit:\n\n- **Steer axle:** at or under **20,000 lb** federal — but the **practical steer-axle limit is often ~12,000-13,200 lb**, set by the steer tires and axle rating (well below the 20,000 lb federal single-axle figure)\n- **Drive axles (tandem):** at or under **34,000 lb**\n- **Trailer tandems:** at or under **34,000 lb**\n- **Gross:** at or under **80,000 lb**\n\n[[figure:cat-scale-ticket-reading]]\n\n**If a group is over, shift weight — the right direction matters:**\n\n- **Slide the trailer tandems** to move weight between the **drives and the trailer tandems**. Tandems too heavy? Slide them **back** (toward the rear) to put weight on the drives. Drives too heavy? Slide tandems **forward** to pull weight back onto the trailer tandems. Figure roughly **250-400 lb per hole**. Remember: sliding the tandems also changes your **axle spacing**, so re-check the **bridge formula** and any state kingpin-distance limit.\n- **Slide the fifth wheel** to move weight between the **steer and drive** axles — forward puts more on the **steer**, back puts more on the **drives** (about **500 lb per hole**).\n\nMoving cargo into the sleeper or letting air out of the tires does **not** make an axle group legal.\n\n[[figure:tandem-slider-weight-shift]]\n\nAt a **weigh station**, follow the signs. Many trucks use a bypass service (**PrePass** or **Drivewyze**) that signals whether to pull in or bypass — but if you are **directed in**, you pull in, every time. Blowing past an open scale you were directed into is a serious violation that hits your CSA record.\n\n**Overweight after you've left the shipper?** If you scale heavy down the road and can't redistribute it legal, **don't run the scale hoping** — find a safe spot and call dispatch to adjust, re-load, or transload. Getting legal before you roll beats a fine and an out-of-service at the next station.",
      },
      {
        order: 3,
        title: "Your registration: the cab card and the records you keep",
        estMinutes: 5,
        bodyMarkdown:
          "Two registration programs touch the driver, even though the **office files them**.\n\n**Your cab card (IRP).** Carry it. \"Apportioned\" means the truck is registered across **several states/provinces under one cab card** instead of a separate plate per state; the card lists those **jurisdictions** and your **registered weight**.\n\n**Watch the registered-weight trap.** This catches small carriers constantly: you can be **legal on the scale** — under 80,000 lb gross and every axle in limits — and **still be over your IRP registered weight**, and that's a citation. Registered weight is a *separate* limit you bought when you plated the truck, not the same thing as the federal 80,000 lb ceiling. Know your cab-card number and stay at or below it.\n\n[[figure:registered-vs-legal-weight-trap]]\n\n**The records you keep (IFTA).** So the office can file the quarterly fuel-tax return, **you** capture the source data: keep every **fuel receipt** showing the **date, location (state of purchase), fuel type, and gallons** (an audit can reject a receipt missing those), and record accurate **odometer readings and miles by state**. Modern ELDs/GPS capture much of the mileage, but the fuel receipts are on you.\n\nThe split is clean: **filing IFTA and IRP is the carrier office's job; the driver carries the cab card, stays within the registered weight, and keeps the fuel and mileage records.**",
      },
    ],
    questions: [
      { order: 1, question: "The standard maximum gross weight on the Interstate system is:", options: ["60,000 lb", "73,280 lb", "80,000 lb", "100,000 lb"], correctIndex: 2, explanation: "Federal limit is 80,000 lb gross, subject to axle limits and the bridge formula (state limits may differ)." },
      { order: 2, question: "The maximum weight on a tandem-axle group under federal limits is:", options: ["20,000 lb", "34,000 lb", "40,000 lb", "48,000 lb"], correctIndex: 1, explanation: "The federal tandem-axle limit is a hard ceiling of 34,000 lb; a single axle is 20,000 lb. (State limits on non-Interstate roads can be lower.)" },
      { order: 3, question: "To shift weight off an overweight drive axle, you can:", options: ["slide the trailer tandems or shift the fifth wheel", "let air out of the drive tires", "move cargo into the sleeper", "nothing can be done at the scale"], correctIndex: 0, explanation: "Sliding the tandems or moving the fifth wheel redistributes weight between axle groups, within bridge-formula spacing. (Deflating tires or moving cargo into the cab doesn't make an axle group legal.)" },
      { order: 4, question: "Your apportioned cab card tells you:", options: ["the jurisdictions you're registered in and your registered weight", "your hours-of-service limits", "the IFTA tax you owe this quarter", "your medical-card expiration"], correctIndex: 0, explanation: "The IRP cab card lists the registered jurisdictions and the registered weight you may not exceed — it's not your HOS clock, your tax bill, or your med card." },
      { order: 5, question: "Filing the quarterly IFTA fuel-tax return is:", options: ["the driver's job each quarter", "the carrier office's job", "fully automatic from the ELD", "not required if you stay in one state"], correctIndex: 1, explanation: "The office files IFTA and IRP. The driver's role is to carry the cab card, obey the registered weight, and keep the fuel receipts and mileage records the office files from." },
      { order: 6, question: "Your CAT ticket shows the drive axles over 34,000 lb but the trailer tandems light. To get legal you slide the:", options: ["trailer tandems forward to pull weight back onto them", "trailer tandems back to put more on the drives", "fifth wheel back to load the drives more", "steer axle"], correctIndex: 0, explanation: "Sliding the trailer tandems FORWARD shifts weight off the drives and onto the trailer tandems (~250-400 lb per hole). Re-check the bridge formula afterward, since sliding the tandems also changes your axle spacing." },
      { order: 7, question: "You scale at 78,000 lb gross with every axle in limits, but your cab card's registered weight is 76,000 lb. You are:", options: ["legal — you're under 80,000 lb", "over your IRP registered weight and subject to a citation", "fine as long as no axle is over", "only a problem if a permit is required"], correctIndex: 1, explanation: "Registered weight is a separate limit from the federal 80,000 lb ceiling. You can be legal on the scale and still be over your cab-card registered weight — a common and expensive small-carrier citation." },
      { order: 8, question: "It's late March and your normally-legal load is routed over posted seasonal roads in a northern state. You should expect:", options: ["the same 80,000 lb limits as any other month", "reduced weight limits (frost laws) — your summer-legal load may be overweight", "no scales operating in spring", "weight limits that apply only to hazmat"], correctIndex: 1, explanation: "Northern states and counties post spring weight restrictions ('frost laws') during the thaw, cutting legal weights (commonly 25-35%) to protect softened roads. A load that's legal in summer can be overweight on a frost-law route in spring — check the current restrictions before you run." },
    ],
  },

  // ─────────────────────────────────────────────────────────
  {
    slug: "tracking-check-calls",
    title: "Tracking & Check-Call Compliance",
    category: "SRL Operational Excellence",
    summary: "Why load visibility is part of the job, how to stay visible on an SRL load (including connecting ELD/telematics and any shipper-required app), what to do when tracking drops, and how tracking and check calls feed your carrier's SRL Compass Score.",
    version: "5",
    estMinutes: 17,
    passThreshold: 80,
    validityMonths: null,
    sortOrder: 13,
    disclaimer: DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "Why visibility is the job",
        estMinutes: 3,
        bodyMarkdown:
          "When a shipper books a load through SRL, they are buying more than a truck. They are buying **visibility**: knowing where the freight is and when it will deliver. SRL gives the customer a branded tracking link so they can watch the load move.\n\nWhen a load goes **dark**, the shipper calls the broker, the broker scrambles to reach the driver, and the customer's trust drops, even if the freight is perfectly fine. Silence reads as a problem.\n\nKeeping the load visible is not extra work on top of hauling it. It **is** part of hauling it on an SRL load.\n\n> " + DISCLAIMER,
      },
      {
        order: 2,
        title: "How to stay visible on an SRL load",
        estMinutes: 5,
        bodyMarkdown:
          "Two habits keep a load visible.\n\n**Let the technology see you.** Accept **tracking** when you take the load, use the **Carvan** mobile app and **The Caravan** carrier portal, and allow location sharing (ELD or geofence updates) where it is available. (Note the spelling: **Carvan** is the app, **The Caravan** is the portal.)\n\n**Connecting your ELD or telematics is the strongest visibility.** When your carrier links its ELD/telematics provider to SRL, your location updates **automatically and continuously** — you don't have to remember to open the app, and the tracking factor on the Compass Score reflects real coverage. Manual check calls still matter for the human picture (your ETA and any issue), but automatic telematics is what keeps the load from ever looking dark.\n\n**Some shippers require their own tracking app, too.** On certain loads the customer mandates a third-party visibility app — **Macropoint, FourKites, Trucker Tools, or project44** — *in addition to* Carvan. If a load says so, download it and enable location sharing; refusing it can cost the load. **What it shares is limited to the load:** these apps report your truck's location while you're on the shipment, not your personal life or your movements when you're off duty. Keeping them on during the load is part of the job, not surveillance of your day off.\n\n**Make the check calls.** Confirm at **pickup**, give a **daily** update while in transit, confirm at **delivery**, and call **immediately** on any delay, breakdown, detention, or exception. A good check call gives three things: your **location**, your **ETA**, and the **issue** if there is one. **While waiting at a dock** for a long load/unload, a quick call at the start and again when you're released keeps the picture clear — you don't need to call every hour unless dispatch asks.\n\n**If the load goes dark, don't wait for dispatch to chase you.** Dead zones, an ELD glitch, or the app crashing can stop your location from updating even when you're rolling fine. The moment you notice (or come back into signal), **reopen the app and make a manual check call** — your location, ETA, and that tracking dropped. A proactive 'I lost signal in the mountains, here's where I am' protects the record; going silent reads as a problem even when nothing's wrong.\n\nIf you need help at any hour, **Marco Polo AI** is available 24/7 in the app.\n\n[[figure:check-call-cadence]]",
      },
      {
        order: 3,
        title: "Tracking, on-time, and your Compass score",
        estMinutes: 4,
        bodyMarkdown:
          "SRL rates every carrier with the **Compass Score** — **SRL's own 7-factor carrier rating**, not a federal or FMCSA score. (Don't confuse it with the government's CSA/Safety Measurement System; Compass is how *Silk Route Logistics* grades the carriers it works with.) **Tracking compliance is 15%** of that score, sitting right alongside on-time pickup, on-time delivery, and communication.\n\nIt's a **carrier-level** score, and the way you run feeds it: keep the load visible and report early, and you **raise your carrier's Compass Score** — which earns the carrier access to **better, higher-paying freight**. Run dark and silent, and you drag it down for everyone under that authority.\n\nThe single best habit: **report a delay early.** A heads-up two hours out lets SRL manage the customer (and a pre-notified customer is far more forgiving of a late arrival); a silent late delivery damages the carrier's record. Early and visible is how a professional driver protects the load, the customer relationship, and the carrier's standing.\n\n[[figure:compass-score-factors]]",
      },
    ],
    questions: [
      { order: 1, question: "On an SRL load, the check-call cadence is:", options: ["at pickup and at delivery only", "at pickup, daily in transit, at delivery, and on any delay", "once every 24 hours regardless of events", "whenever it's convenient"], correctIndex: 1, explanation: "Confirm at pickup, give a daily in-transit update, confirm at delivery, and call immediately on any delay or exception — with your location, ETA, and the issue." },
      { order: 2, question: "A shipper requires you to run its own tracking app (say, FourKites or Macropoint) in addition to Carvan for this load. You should:", options: ["refuse — one tracking app is enough", "download it and enable location sharing for the load", "run it but leave location off", "only use it if the load pays extra"], correctIndex: 1, explanation: "Some customers mandate a third-party visibility app (Macropoint, FourKites, Trucker Tools, project44) on top of Carvan; download it and turn on location sharing — refusing can cost the load. It shares only your location during the shipment, not your personal life or off-duty movements." },
      { order: 3, question: "Tracking compliance is what share of the Compass score?", options: ["5%", "10%", "15%", "50%"], correctIndex: 2, explanation: "Tracking compliance is 15% of SRL's 7-factor Compass score." },
      { order: 4, question: "When you hit a delay, the right move is to:", options: ["wait and explain it after delivery", "stay quiet if you can still make the window", "report it early with your location, ETA, and the issue", "tell only the receiver"], correctIndex: 2, explanation: "Report it early — a heads-up lets SRL manage the customer; a silent late delivery hurts the carrier's record." },
      { order: 5, question: "Keeping your SRL load visible:", options: ["has no real effect on you", "raises your carrier's Compass score and freight access", "matters only on reefer loads", "lowers your settlement"], correctIndex: 1, explanation: "Visibility feeds the Compass score (tracking is 15%), and a higher score earns the carrier access to better, higher-paying freight." },
      { order: 6, question: "You roll through a long dead zone and your location stops updating. You should:", options: ["do nothing — dispatch will figure it out", "reopen the app and make a manual check call (location, ETA, that tracking dropped) as soon as you can", "turn off tracking for the rest of the trip", "wait until delivery to mention it"], correctIndex: 1, explanation: "A dropped signal makes the load look dark even when you're fine. Proactively reopen the app and call in your location and ETA — 'lost signal in the mountains, here's where I am' protects the record; silence reads as a problem." },
      { order: 7, question: "The SRL Compass Score is:", options: ["a federal FMCSA safety score for drivers", "SRL's own 7-factor rating of the carriers it works with", "the same as the government's CSA system", "your personal credit score"], correctIndex: 1, explanation: "Compass is Silk Route Logistics' proprietary 7-factor CARRIER rating — not a federal/FMCSA score and not the CSA system. Your performance feeds the carrier's Compass Score, which drives the carrier's access to better freight." },
      { order: 8, question: "The strongest way to keep an SRL load continuously visible is:", options: ["calling dispatch once a day", "having your carrier connect its ELD/telematics so location updates automatically", "texting the receiver your location", "posting on a load board"], correctIndex: 1, explanation: "Automatic ELD/telematics location updates continuously without you remembering to open the app, and it reflects real coverage on the Compass tracking factor. Manual check calls still add the human picture (ETA, issues), but telematics keeps the load from ever looking dark." },
    ],
  },

  // ═════════════════════════════════════════════════════════
  // v3.8.ang — research-driven additions (ELDT-theory + insurer
  // loss-prevention + TAT gaps the first batch did not cover).
  // Same inline-authored FIRST-DRAFT posture; verify on the
  // fact-check pass when the throttle clears.
  // ═════════════════════════════════════════════════════════

  {
    slug: "backing-docking-coupling",
    title: "Backing, Docking & Coupling",
    category: "Vehicle & Cargo Safety",
    summary: "A leading source of preventable accidents: how to set up and back to a dock, couple and uncouple without dropping a trailer (including soft-ground landing gear), and what to do when a kingpin won't lock or the equipment looks wrong.",
    version: "5",
    estMinutes: 22,
    passThreshold: 80,
    validityMonths: 12,
    sortOrder: 15,
    disclaimer: DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "Backing is where accidents happen",
        estMinutes: 5,
        bodyMarkdown:
          "Backing is a **leading source of preventable accidents**. Most are low-speed property damage, but they are almost all avoidable — and they happen backing *away* from a dock just as often as backing in.\n\n**G.O.A.L. — Get Out And Look.** Before you back, and again partway through if anything changed, stop, get out, and walk the path. Clearance overhead, behind, and on both sides changes by the foot. Do it on departure too — don't let an empty dock and a tight schedule talk you out of it. A **backup camera or sensors help but don't replace G.O.A.L.** — they have blind spots and a flat view that hides overhead clearance and the far corner.\n\n**Back to the driver's side when you can.** A driver-side (left) back lets you see down the length of the trailer out your window. A **blind-side back is to the RIGHT (passenger) side**, where your mirror coverage is poorest and the danger zone is hidden — avoid it, or get a spotter.\n\n[[figure:backing-driver-vs-blind-side]]\n\n**Signal and go slow.** Sound the horn before backing, use four-ways, idle speed only, and keep steering corrections small. When backing, the trailer goes the opposite way you turn the wheel — small input, then straighten.\n\n**Use a spotter** when one is available. Agree on signals first: a **flat raised palm = STOP**, hands held a set distance apart = how much room is left, a directional point = which way to bring it. **The instant you lose sight of the spotter, stop.** If the signals get confused mid-back, don't guess — stop, pull forward to reset, and start the back clean.\n\n[[figure:backing-spotter-signals]]\n\n> " + DISCLAIMER,
      },
      {
        order: 2,
        title: "Setting up and working the dock",
        estMinutes: 4,
        bodyMarkdown:
          "A good back starts with a good setup. A **90° (perpendicular) dock** is the tightest and needs the most precise steering; a **45° alley dock** lets the trailer swing in wider but uses more space. Either way, position the truck so the trailer can swing into the hole with room to straighten; **pull forward to reset if the angle goes wrong** rather than forcing it.\n\n**Watch the surface.** Ice, slope, potholes, and gravel change how the trailer tracks and how your drives grip. On a slick or sloped lot, go slower, expect the trailer to drift, and chock early. The same back you nail on dry flat concrete can get away from you on ice.\n\nUse your mirrors constantly and make small corrections. If you can't see, stop and G.O.A.L. again.\n\n**At the dock:** set the trailer brakes, chock the wheels, and engage the dock lock or wheel restraint if the facility has one — this stops trailer creep and a truck pulling away early while a forklift is still inside. **The dock-plate gap is a real hazard:** a mismatch between trailer-floor height and the dock leaves a gap that can swallow a foot or trap a pallet-jack wheel. If the trailer and dock don't line up, tell dock staff before anyone loads across it — and don't load over a gap you can see is unsafe.\n\nFollow the facility's red-light / green-light signals and their staff's direction — you are a guest at their dock. But **safe backing beats facility pressure.** If staff tell you to skip a spotter, back faster than you can see, or ignore G.O.A.L., decline politely and explain the safety requirement; if they insist, call dispatch and SRL compliance before proceeding.",
      },
      {
        order: 3,
        title: "Coupling and uncoupling",
        estMinutes: 5,
        bodyMarkdown:
          "**Couple in order — mechanical first, then the lines.**\n\n1. **Chock the trailer wheels** so the trailer can't roll while you back under it, then set the trailer height so the kingpin will enter the middle of the fifth wheel (the trailer should ride **up** onto the fifth wheel a little — never down into it).\n2. Line up the tractor **squarely** (the trailer centered over the fifth wheel, not crabbed off to one side) and back slowly until the fifth wheel just contacts the trailer, then continue under the kingpin until it locks.\n3. **Confirm the lock three ways:** a **tug test** (low gear, pull forward firmly against the set trailer brakes — it must not separate; the trailer's **spring (parking) brakes hold it in place for this test even before the air lines are connected**, which is exactly why the mechanical coupling and tug test come first), a **visual check** under the trailer that the **jaws are fully closed around the shank of the kingpin** (not just catching the head), and that the trailer **rode fully up onto the fifth-wheel plate with no gap** between them. An incomplete ride-up — a visible gap — means it is **not** locked; pull out and re-do it.\n4. **Now** connect the glad-hand air lines and the electrical cord (do this after the mechanical coupling so loose lines can't catch or tear), checking for kinks, crimps, or twisted hoses. This mechanical-first, air-second sequence is a **valid, common order variation** — because the trailer's spring brakes held it for the tug test, you never needed trailer air to verify the lock.\n5. Raise the landing gear all the way up and stow the crank handle securely.\n\n[[figure:backing-fifth-wheel-coupling]]\n\n**Uncoupling — order protects the trailer:**\n\n1. Park on solid, level ground, set the brakes, and chock the wheels. **On soft ground** (dirt, gravel, mud, or hot asphalt) put a **board or trailer dunnage under the landing-gear feet** so they don't sink or punch through — a sinking leg tips or drops the trailer.\n2. Lower the landing gear **slowly until it just takes the weight** — you'll feel the tractor suspension settle as the load shifts off the fifth wheel. Stop the moment it's carrying the trailer; **do not keep cranking and lift the tractor** (that bends the gear screw and strips gears).\n3. Disconnect the air and electrical lines, and **close the tractor air-line shutoff valves or cap the glad-hands (dummy them)** to keep dirt and moisture out of the lines.\n4. **Then** pull the fifth-wheel release handle and ease forward slowly. **Never raise the landing gear before pulling the release** — that drops the trailer onto the coupling.\n\nA dropped trailer or an unlocked fifth wheel that lets the trailer come off in transit is a catastrophic, career-defining failure — never skip the tug test.",
      },
      {
        order: 4,
        title: "When coupling fights back",
        estMinutes: 4,
        bodyMarkdown: `Equipment doesn't always cooperate. The wrong move under pressure damages gear or strands you — here's the right one.\n\n**The kingpin won't lock after a try or two.** Do **not** force it, drive on a partial lock, or beat the fifth wheel with anything. Pull forward, check that you're **square** and the trailer height is right (riding up, not down), clear any ice or debris from the fifth-wheel plate, and back in clean again. If it still won't lock after a couple of honest attempts, **stop and call dispatch / a mechanic** — a non-locking kingpin is a repair, not a workaround. A trailer driven on a partial lock comes off.\n\n**Inspect before you trust it — refuse damaged coupling gear.** Before you couple, and any time the lock feels wrong, look for:\n\n- **Fifth wheel:** bent or cracked jaws, a missing or broken locking pawl, cracked mounting welds, no grease on the plate.\n- **Kingpin:** bent, gouged, or worn at the shank.\n- **Landing gear:** cracked welds, a bent leg, a stripped crank, a missing pin.\n\nAny of that and you **don't couple to it** — report it and get it fixed. Small carriers sometimes run equipment that should be in the shop; a fifth wheel that fails on the road doesn't give a warning.\n\n**The trailer won't release from the dock or the gear is frozen.** A stuck dock lock or a rusted, frozen fifth wheel is the facility's or the shop's problem, not yours to force. Don't pry, don't power out against a restraint. Tell dock staff, call dispatch, document it, and let it be released properly. Forcing a stuck connection is how people and equipment get hurt.`,
      },
    ],
    questions: [
      { order: 1, question: "Backing accidents are best described as:", options: ["rare and unavoidable", "a leading source of preventable accidents, nearly all avoidable with G.O.A.L. and a spotter", "only a problem for new drivers", "impossible to prevent without a backup camera"], correctIndex: 1, explanation: "Backing is a leading source of preventable accidents — most are low-speed and almost all are avoidable by getting out and looking (G.O.A.L.) and using a spotter. They happen backing away from a dock as often as backing in." },
      { order: 2, question: "\"G.O.A.L.\" means:", options: ["Go Or Aim Low", "Gear, Oil, Air, Lights", "Get Out And Look", "Grip On And Lean"], correctIndex: 2, explanation: "Get Out And Look — walk the path before and during a back; clearance changes by the foot." },
      { order: 3, question: "When you have a choice, you back toward:", options: ["the driver's (left) side", "the blind (right) side", "whichever side is quicker", "downhill"], correctIndex: 0, explanation: "A driver-side back lets you see down the length of the trailer out your window; a blind-side (right) back hides the danger zone — avoid it or use a spotter." },
      { order: 4, question: "After coupling, you confirm the fifth wheel is locked by:", options: ["the sound of it clicking", "a tug test and a visual check of the jaws", "weighing the trailer", "honking twice"], correctIndex: 1, explanation: "Tug-test forward against the locked trailer AND visually confirm the jaws are fully closed around the kingpin with no gap — sound alone is not proof." },
      { order: 5, question: "Before pulling the fifth-wheel release to uncouple, you:", options: ["just pull the pin and ease forward", "fully raise the landing gear first", "park level, chock the wheels, and set the landing gear on the weight", "leave it in gear with the engine running"], correctIndex: 2, explanation: "Order: park level, chock the wheels, lower the landing gear until it takes the full weight, disconnect the lines, THEN pull the release and ease forward. Raising the gear before pulling the release drops the trailer onto the coupling." },
      { order: 6, question: "The kingpin won't lock after two careful attempts. You should:", options: ["drive on the partial lock to the next stop", "tap the fifth wheel with a hammer until it catches", "stop and call dispatch / a mechanic — a non-locking kingpin is a repair, not a workaround", "raise the landing gear and go; the weight will hold it"], correctIndex: 2, explanation: "Never force it or drive on a partial lock — a trailer on a partial lock comes off. Re-check that you're square and at the right height, clear any debris, try once more clean; if it still won't lock, it's a repair. Call dispatch." },
      { order: 7, question: "The correct coupling order is:", options: ["connect air and electrical first, then back under the kingpin", "couple mechanically (lock + tug test + visual) first, THEN connect air and electrical", "raise the landing gear before testing the lock", "skip the tug test if the jaws look closed"], correctIndex: 1, explanation: "Couple mechanically first and confirm the lock three ways (tug test, jaws closed on the shank, full ride-up with no gap) — then connect the lines, so loose air hoses can't catch or tear during the coupling. Raise the gear last." },
      { order: 8, question: "You're dropping a trailer on a soft gravel and dirt lot. To keep the landing gear from sinking, you:", options: ["crank it down as fast as possible", "set boards or trailer dunnage under the landing-gear feet", "leave the gear up and rely on the kingpin", "park on the steepest part so it drains"], correctIndex: 1, explanation: "On soft ground (dirt, gravel, hot asphalt, mud) the landing-gear feet can sink or punch through, tipping or dropping the trailer. Set boards or dunnage under the feet to spread the load, park as level as you can, and chock the wheels." },
      { order: 9, question: "At the dock, the dock lock (wheel restraint) and chocking the trailer wheels exist mainly to prevent:", options: ["fuel theft", "trailer creep — the trailer easing away from the dock (or the tractor pulling out early) while a forklift is loading across the gap", "the trailer freezing to the dock", "overloading the axle"], correctIndex: 1, explanation: "Set the trailer brakes, chock the wheels, and engage the dock lock or wheel restraint to stop trailer creep and an early pull-away while a forklift is still loading across the dock plate. Also watch the dock-plate gap — a height mismatch can swallow a foot or a pallet-jack wheel, so flag it before anyone loads over it." },
    ],
  },

  {
    slug: "distracted-fatigued-driving",
    title: "Distracted & Fatigued Driving",
    category: "On-Road Safety",
    summary: "The federal phone rules and what a violation actually costs, doing check calls legally, the three kinds of distraction (and why hands-free is still cognitive), medications that make you drowsy, circadian low points, and why fatigue is an impairment that only sleep fixes.",
    version: "5",
    estMinutes: 20,
    passThreshold: 80,
    validityMonths: 12,
    sortOrder: 16,
    disclaimer: DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "The phone rules",
        estMinutes: 4,
        bodyMarkdown:
          "Federal rules ban texting (49 CFR 392.80) and hand-held phone use (49 CFR 392.82) while driving a commercial vehicle. **The regulation requires a hands-free, mounted device.** Best practice on top of that: pre-program your frequent contacts and keep the phone in a single-touch spot, **dialed before you roll**, so you're never tempted to reach for it moving.\n\n**What a violation actually costs.** Texting and hand-held phone use are both **serious traffic violations**. Beyond the fine and a hit to the CSA Unsafe Driving BASIC, a **second** serious violation within 3 years is a **60-day CDL disqualification**, and a **third** within 3 years is **120 days** (49 CFR 383.51). That's two months off the wheel with no income — the math never favors the call.\n\n**Check calls don't override the phone ban.** If SRL needs a check call or a Carvan update, that's a job task to do **at a stop**, or **hands-free with the phone mounted** — dialing or typing while rolling is illegal *even when the call is work*. Schedule check calls at fuel and rest stops; nobody at SRL is asking you to break 392.82.\n\nThe physics: at 55 mph you cover about **81 feet every second**, so a **5-second** glance is roughly **400 feet** — longer than a football field — traveled essentially blind. No message is worth that.\n\n> " + DISCLAIMER,
      },
      {
        order: 2,
        title: "The three kinds of distraction",
        estMinutes: 5,
        bodyMarkdown:
          "Distraction comes in three forms, and the worst tasks combine all three:\n\n- **Visual** — eyes off the road (reading a message, a GPS screen, paperwork).\n- **Manual** — hands off the wheel (eating, reaching, handling a device).\n- **Cognitive** — mind off the drive (a stressful call, daydreaming).\n\n[[figure:distraction-three-types-venn]]\n\n**Hands-free is legal, not risk-free.** A mounted, hands-free call clears the *visual* and *manual* distraction but not the *cognitive* one — your mind is still partly on the conversation. Keep work calls short, and skip them entirely in heavy traffic, work zones, or bad weather where you need your full attention. And remember that **voice-to-text or fiddling with the fleet app is still distraction** — even with your hands technically 'free,' composing a message or hunting through an app pulls your eyes and mind off the road. Voice commands are not a free pass.\n\nProgramming the GPS, reviewing dispatch instructions, and eating are all things to do **stopped**, not rolling. Pre-program your route and read your messages before you put it in gear. If something needs your attention on the road, find a safe place and stop.",
      },
      {
        order: 3,
        title: "Fatigue is an impairment",
        estMinutes: 5,
        bodyMarkdown:
          "Drowsy driving impairs reaction and judgment much like alcohol. Hours-of-Service gives you the legal framework, but **you** manage your rest inside it — and being **legal on HOS is not the same as being rested.** Running back-to-back short loads for three or four days can keep you legal on the logbook while you never get the deep, full sleep that resets you. The **34-hour restart** exists partly to let your body recover; use it.\n\n**Warning signs — and an honest self-check.** Heavy eyelids, drifting in the lane, missing exits or signs, repeated yawning, tailgating without meaning to, or **not remembering the last few miles**. If you can't clearly recall the last several miles, you've already been micro-sleeping — that's not 'almost tired,' that's impaired. Stop now.\n\n**Only sleep fixes fatigue.** Coffee, loud music, an open window, and cranking the AC buy minutes, not safety. If you're fighting to stay awake, get to a safe place and rest.\n\n**Strategic napping is a real tool.** A planned **~20-minute nap** is an evidence-based countermeasure for building drowsiness — long enough to restore alertness, short enough to avoid the deep-sleep grogginess of a longer nap. A **'caffeine nap'** (drink coffee, then nap ~20 minutes while it kicks in) can give an even better short-term boost. But a nap is a patch, not a fix: **you cannot 'bank' sleep**, and back-to-back short rests build a **sleep deficit** that only real, full sleep pays off.\n\n**Your body has low points.** Fatigue hits hardest in the **pre-dawn hours (roughly 2 to 6 a.m.)** and again in the **mid-afternoon** — your internal clock dips then even if you slept well. Plan your hardest driving away from those windows when you can.\n\n**Medications make it worse.** Many over-the-counter and prescription drugs cause drowsiness — antihistamines (the 'PM' and allergy meds with diphenhydramine), cold and cough remedies, some pain and anti-anxiety medications. **Read the label**, don't take a 'may cause drowsiness' med before or during a shift, and **disclose your medications to your DOT medical examiner.**\n\n**Sleep apnea** is when your breathing repeatedly stops and starts in your sleep, starving your brain of oxygen so you wake up tired no matter how long you were down. Signs: loud snoring, someone telling you that you stop breathing, daytime sleepiness after a full night. If that's you, **ask your DOT examiner for an OSA screening** — it's common, it's treatable, and treated drivers feel like new.\n\n**The pressure to push tired is real — and SRL backs the stop.** Parking fills up, windows are tight, and it's tempting to run one more hour. Plan parking before your clock runs out, and if dispatch or a delivery window is pushing you to drive impaired by fatigue, that's **coercion** under 49 CFR 390.6 (see the *Coercion & Professional Conduct* course). A late load is recoverable; a fatigue crash, and the negligence liability that lands on **you**, is not.",
      },
    ],
    questions: [
      { order: 1, question: "Federal rules on a hand-held phone while driving a CMV:", options: ["allow it anytime", "ban hand-held use and texting — hands-free and mounted only", "allow texting only at red lights", "don't apply to trucks"], correctIndex: 1, explanation: "49 CFR 392.80 bans texting and 392.82 bans hand-held use; the rule requires a hands-free, mounted device. Best practice on top of that: pre-dial and keep it single-touch so you never reach for it rolling." },
      { order: 2, question: "The three types of driving distraction are:", options: ["Visual, manual, cognitive", "Loud, bright, cold", "Phone, food, radio", "Day, night, dusk"], correctIndex: 0, explanation: "Visual (eyes off), manual (hands off), and cognitive (mind off) — the worst tasks combine all three." },
      { order: 3, question: "At 55 mph, looking away for about 5 seconds means traveling roughly:", options: ["10 feet", "The length of a football field", "One mile", "Half a block"], correctIndex: 1, explanation: "About a football field, essentially blind — no message is worth it." },
      { order: 4, question: "The only real cure for fatigue is:", options: ["Coffee", "Fresh air", "Sleep", "Loud music"], correctIndex: 2, explanation: "Stimulants and air buy minutes, not safety; only sleep restores you." },
      { order: 5, question: "You feel yourself nodding off mid-shift. The right move is:", options: ["Push to the next planned stop", "Get to a safe place and rest", "Open the window and speed up", "Drink an energy drink and continue"], correctIndex: 1, explanation: "Stop and rest — a late delivery is recoverable; a fatigue crash is not. If schedule pressure is forcing you to drive tired, that's coercion under 49 CFR 390.6." },
      { order: 6, question: "Dispatch needs a check call while you're rolling. The legal way to handle it is:", options: ["pick up the hand-held quickly since it's a work call", "do it at a stop, or hands-free with the phone mounted", "text the update at the next red light", "any phone use is fine for work calls"], correctIndex: 1, explanation: "The phone ban doesn't have a 'work call' exception. Dialing or typing while driving a CMV is illegal even for a check call — do it at a stop or fully hands-free with a mounted phone. A second serious violation in 3 years costs a 60-day disqualification." },
      { order: 7, question: "Before a shift you reach for an over-the-counter allergy or cold medicine. You should:", options: ["take it — OTC meds are always safe to drive on", "read the label for 'may cause drowsiness' and avoid it before/during driving, and disclose meds to your DOT examiner", "take a double dose to be sure it works", "only worry about prescription drugs"], correctIndex: 1, explanation: "Many OTC antihistamines and cold remedies (and some prescriptions) cause drowsiness — read the label, skip the drowsy ones before and during a shift, and disclose your medications to your DOT medical examiner." },
      { order: 8, question: "A legal hands-free phone call while driving:", options: ["carries no distraction risk at all", "removes the visual and manual distraction but leaves you cognitively distracted, so keep it short", "is illegal, just like a hand-held call", "is fine for long calls even in heavy traffic"], correctIndex: 1, explanation: "Hands-free is legal and clears the eyes-off and hands-off distraction, but your mind is still partly on the conversation (cognitive distraction). Keep work calls short and skip them in heavy traffic, work zones, or bad weather." },
      { order: 9, question: "Under 49 CFR 383.51, repeat texting or hand-held phone violations cost a CDL driver:", options: ["nothing beyond the fine", "a 60-day disqualification for a second serious violation in 3 years, and 120 days for a third", "a permanent lifetime ban on the first offense", "only a warning letter"], correctIndex: 1, explanation: "Texting and hand-held use are serious traffic violations. A second within 3 years is a 60-day CDL disqualification and a third within 3 years is 120 days — months off the wheel with no income. The math never favors the call." },
      { order: 10, question: "Your internal body clock makes fatigue hit hardest during:", options: ["only right after lunch", "the pre-dawn / early-morning hours and again in mid-afternoon", "only late evening", "there is no predictable pattern"], correctIndex: 1, explanation: "The circadian low points fall in the pre-dawn / early-morning hours (roughly 2–6 a.m., after midnight) and again in mid-afternoon — your clock dips then even if you slept well. Plan your hardest driving away from those windows, and watch for sleep apnea, which leaves you tired no matter how long you were down." },
    ],
  },

  {
    slug: "railroad-crossings-emergencies",
    title: "Railroad Crossings & Emergency Maneuvers",
    category: "On-Road Safety",
    summary: "Crossing tracks safely (clearing the far side, watching for a second train, the 45-degree escape if you stall), and handling brake failure, a jammed transmission, blowouts, and skids.",
    version: "5",
    estMinutes: 20,
    passThreshold: 80,
    validityMonths: 12,
    sortOrder: 17,
    disclaimer: DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "Railroad crossings",
        estMinutes: 6,
        bodyMarkdown:
          "A loaded truck against a train is never a contest you win.\n\n**Never start across until you can clear.** Make sure there is room for your **entire** vehicle on the far side before you enter — never stop on the tracks waiting for traffic ahead. **Don't trust a hood check:** scan along the *whole length* of your rig at eye level — your **rear overhang** (sleeper, reefer box, flatbed tail) is the last thing to clear, and on a humped crossing it's exactly what catches under the rail.\n\n**Expect a second train.** After a train passes, do **not** pull forward on the first glimpse of open track — look **both ways again**. A second train can be coming the other direction or on a parallel track, hidden by the one that just cleared, and many crossing deaths happen exactly this way. A train's speed and distance are deceptive too: it's closer and faster than it looks, and a loaded train can take a mile or more to stop — never try to beat it.\n\n**Don't shift on the tracks.** A missed gear can leave you stalled on the rails — pick your gear before you cross and hold it.\n\n**Know who must stop (49 CFR 392.10).** Placarded hazmat loads and certain vehicles (buses, cargo-tank vehicles) are **required to stop** at crossings; most other CMVs do not stop unless signed or signaled — know your load and obey the signs. When you must stop, stop **15 to 50 feet before the nearest rail**, **look and listen** in both directions, and then cross **without shifting gears.**\n\n**Mind your clearance.** Long-wheelbase and low-clearance combinations can **hang up** on a raised crossing — if in doubt, find another route. A hung trailer with the rails under it is a fire risk; don't sit there working it.\n\n**If you stall or hang up on the tracks:** get everyone **out and away immediately** — don't try to restart, and don't get out to push. Then call the **Emergency Notification System (ENS) number on the blue sign at the crossing** (or 911) so the railroad can stop trains. If a crossing ahead is **blocked by a stalled vehicle**, back away and call — never try to push it clear.\n\n**If a train is coming, run toward it at a 45-degree angle.** Move **toward the oncoming train and away from the tracks at about 45 degrees** — when the train hits your truck, debris flies the way the train is going, so running away from the train puts you in the debris path. Toward-the-train-at-45 keeps you behind it. Your life is worth more than the truck.\n\n[[figure:railroad-crossing-45-degree-evacuation]]\n\n> " + DISCLAIMER,
      },
      {
        order: 2,
        title: "Emergency maneuvers",
        estMinutes: 5,
        bodyMarkdown:
          "When something goes wrong, trained responses beat panic.\n\n**Steer, don't always brake.** It usually takes less distance to steer around a hazard than to stop for it. Counter-steer — turn to miss, then turn back — and stay off hard braking that could put you into a skid.\n\n**Brake failure — and air brakes are NOT handled like hydraulic.** **Air brakes (most tractors):** do **NOT** pump — pumping only bleeds down your air reservoirs and makes it worse. Downshift, use the **engine brake / retarder**, apply **steady (or stab) braking**, and aim for a runaway-truck **escape ramp**. **Hydraulic brakes (some medium-duty trucks):** **pump** the pedal to try to build pressure. Either way, look for the escape ramp. On a long grade, the time to manage your speed is at the **top**, not halfway down — by the time you're halfway down you've lost the momentum and engine-braking power to slow, and you may overshoot the ramp (which is why ramps sit in the first mile of a descent).\n\n**Can't downshift? Don't burn seconds fighting it.** If the transmission is jammed and won't take a lower gear, *skip the downshift* — go straight to the **parking/emergency brake (use it firmly but steadily, not a panic yank)** and the **escape ramp**. Wasting ten seconds trying to find a gear on a steep grade can be the difference.\n\n**Retarder caution:** use the engine brake / retarder to save your service brakes on a **dry** grade, and engage it early before heat builds — but **never use a retarder on wet, icy, or snowy roads.** It can break the drive wheels loose and jackknife you. Switch it off when the road is slick.\n\n**Tire blowout:** hold the wheel firmly with both hands, **stay off the brake**, ease off the throttle, let the rig slow on its own, then steer gently to the shoulder. Braking hard on a blowout is how you lose control.\n\n[[figure:brake-failure-vs-transmission-failure-decision-tree]]",
      },
      {
        order: 3,
        title: "Skid control and recovery",
        estMinutes: 4,
        bodyMarkdown:
          "Skids come from doing too much — too much brake, steering, throttle, or speed for the conditions.\n\n**Drive-wheel skid** (rear tires spin/slide): ease off the accelerator and counter-steer in the direction you want to go.\n\n**Front-wheel skid:** you can't steer until the front tires regain grip — ease off and let them slow.\n\n**Trailer skid / jackknife:** watch your mirrors for the trailer swinging out; ease off the brake and throttle so the trailer can fall back in line. **Your instinct will scream to brake harder — resist it.** More brake tightens the jackknife; getting off the brake is what lets the trailer come back behind you.\n\n**ABS:** in a hard stop, keep firm, steady pressure — the system pulses the brakes for you. Don't pump an ABS pedal.\n\nThe best skid is the one you prevent: slow down for rain, ice, curves, and grades before they force the issue.",
      },
    ],
    questions: [
      { order: 1, question: "Before crossing railroad tracks you must be sure:", options: ["your whole vehicle can clear the far side", "the gate arm is down", "no train is scheduled", "the crossing is paved"], correctIndex: 0, explanation: "Never enter unless your entire vehicle can clear the far side, and never stop on the tracks waiting for traffic ahead." },
      { order: 2, question: "Your truck stalls on the tracks and a train is coming. After getting out, you move:", options: ["straight away from the tracks, the same direction the train is going", "toward the oncoming train at about a 45-degree angle, away from the tracks", "back to the truck to grab your paperwork", "perpendicular, straight off the side"], correctIndex: 1, explanation: "Move toward the oncoming train at about 45 degrees, away from the tracks. Debris flies the direction the train travels, so running away from the train puts you in its path — toward-the-train-at-45 keeps you behind the debris. Then call the ENS number on the blue sign or 911." },
      { order: 3, question: "With a tire blowout, you:", options: ["brake hard immediately", "hold the wheel firmly, stay off the brake, ease off the throttle", "swerve sharply to the shoulder", "accelerate through it"], correctIndex: 1, explanation: "Hard braking or sharp swerving on a blowout causes loss of control — hold firm, stay off the brake, let the rig slow, then steer gently to the shoulder." },
      { order: 4, question: "To avoid a sudden hazard it is usually:", options: ["always better to hard-brake", "safer to steer around it than to hard-brake", "best to close the gap", "best to speed up"], correctIndex: 1, explanation: "Steering around a hazard usually takes less distance than stopping for it; counter-steer to miss, then straighten." },
      { order: 5, question: "In a hard stop with ABS you:", options: ["pump the pedal", "keep firm, steady pressure on the brake", "brake then fully release", "use only the trailer brake"], correctIndex: 1, explanation: "Hold firm, steady pressure — ABS pulses the brakes for you. Pumping an ABS pedal defeats the system." },
      { order: 6, question: "Confirming you can fully clear a railroad crossing means:", options: ["the front of the truck is past the far rail", "scanning the entire length of your rig — the rear overhang clears last", "the gate is up", "you're moving faster than 5 mph"], correctIndex: 1, explanation: "A hood check fools you. Scan along the whole rig at eye level — the rear overhang (sleeper, reefer box, flatbed tail) is the last thing across and is exactly what hangs up on a humped crossing. Never enter unless the WHOLE vehicle can clear." },
      { order: 7, question: "On a steep grade your brakes are failing and the transmission won't take a lower gear. You should:", options: ["keep trying to find the gear no matter how long it takes", "stop wasting seconds on the downshift — go to the parking brake (firm, steady) and the escape ramp", "shift to neutral and coast", "pump the brakes until they come back"], correctIndex: 1, explanation: "If the transmission is jammed, don't burn critical seconds fighting for a gear — go straight to the emergency/parking brake (apply it firmly but steadily, not a panic yank) and aim for the runaway ramp. On a steep grade those seconds are the margin." },
      { order: 8, question: "A train just cleared the crossing and you see open track ahead. Before you pull forward you:", options: ["go immediately — the track is clear now", "look both ways again; a second train can be coming the other way or on a parallel track", "honk and proceed without looking", "assume no second train comes within 10 minutes"], correctIndex: 1, explanation: "Never pull forward on the first glimpse of open track. Look both ways again — a second train can be coming from the other direction or on a parallel track, hidden by the one that just passed. A train's speed is deceptive: it's closer and faster than it looks." },
      { order: 9, question: "Under 49 CFR 392.10, which vehicles must ALWAYS stop at a railroad crossing?", options: ["every commercial truck, loaded or empty", "placarded hazmat loads and certain vehicles like buses and cargo-tank (tanker) vehicles", "only trucks over 80,000 lb", "none — trucks stop only when the gate is down"], correctIndex: 1, explanation: "Under 392.10, placarded hazmat loads and certain vehicles (buses, cargo-tank/tanker vehicles) must stop 15 to 50 feet before the nearest rail, look and listen, and cross without shifting gears. Most other CMVs do not stop unless a sign or signal requires it." },
    ],
  },

  {
    slug: "trip-planning-routing",
    title: "Trip Planning & Truck-Legal Routing",
    category: "On-Road Safety",
    summary: "Planning a truck-legal route before you roll, finding your real height, checking 511 road conditions, avoiding low bridges and restrictions, who shares the liability, and mapping the trip against your hours and fuel.",
    version: "5",
    estMinutes: 20,
    passThreshold: 80,
    validityMonths: 12,
    sortOrder: 18,
    disclaimer: DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "Plan the route before you roll",
        estMinutes: 5,
        bodyMarkdown:
          "A few minutes of planning prevents the worst days.\n\n**As the professional driver you are responsible for operating a safe vehicle that fits its height, weight, length, and width** — and meeting that duty means using a **truck-specific** GPS or map (CoPilot, Trucker Path, your fleet's Samsara/Verizon routing) that accounts for those numbers. A consumer app (Google Maps, Waze, Apple Maps) does **not** know your truck and will route you under a 12-foot bridge or down a no-truck parkway. Truck-specific routing **isn't a single federal mandate by itself** — it's simply how you keep the truck legal and out of a bridge strike or a restricted road.\n\n[[figure:truck-vs-consumer-gps-routing]]\n\n**Know your real numbers — don't guess your height.** A standard dry van/reefer runs about **13'6\\\", but it varies (roughly 13'6\\\" to 14')** with the trailer and the tractor under it, and **state height limits differ** (federal law sets width at 8'6\\\" but does NOT set a national height limit). Look up your **actual** height — the door placard, the dispatch/equipment sheet, or by measuring — and know your gross weight and length. Check the route for low bridges, weight-limited bridges, restricted or prohibited truck routes, and city no-truck zones. **Check road conditions before you roll** — dial **511** or pull up the state DOT site for closures, construction, chain laws, and weather along your route, and check again if conditions change.\n\n[[figure:state-height-limits-variance]]\n\nLay out fuel, scales, and rest stops along the way, and line the trip up against your appointment times so you aren't forced into a bad decision late.\n\n> " + DISCLAIMER,
      },
      {
        order: 2,
        title: "Low clearance, restrictions, and permits",
        estMinutes: 4,
        bodyMarkdown:
          "Bridge strikes are among the most expensive and most preventable incidents in trucking. **You hold the primary duty** to verify clearance before you attempt a crossing — but the liability can be **shared**: if dispatch or a shipper routes you into a known low clearance, they can be on the hook too under negligence. That's exactly why you **escalate instead of obey** — if a route puts you under a posted clearance near your height, notify SRL and **do not proceed on a dispatcher's say-so alone.**\n\n**Know your height and verify posted clearances.** If a posted clearance is anywhere near your height, or there's no posted sign and you're unsure, **stop and verify** — do not guess and do not \"try it slow.\"\n\n**At the bridge with no room:** don't ease into it. **Brake, stop, and don't cross** — pull into the right lane or shoulder, or back up if it's safe and legal, and call SRL/dispatch (or 911 if you're blocking traffic) to reroute. A delay and an awkward turnaround beat a peeled-back trailer and a closed bridge.\n\n**Oversize / overweight loads** move under a permit that specifies the **route and the times** you may travel. Follow the permit exactly; deviating voids it. **Hazmat** has its own routing under **49 CFR 397** — required routes, and prohibited tunnels and city cores. A load that is *both* placarded and oversize has to satisfy **both** rule sets at once; when they conflict, call dispatch, don't improvise.\n\n[[figure:bridge-clearance-decision-tree]]",
      },
      {
        order: 3,
        title: "Hours, fuel, and rest planning",
        estMinutes: 4,
        bodyMarkdown:
          "Map the trip against your **Hours-of-Service clock**, not just the miles: your remaining drive time, your **14-hour** window, and your **30-minute break** (required after **8 hours of driving** — it pauses your drive clock but still burns clock against your 14-hour window, so plan it).\n\n[[figure:hos-constrained-trip-timeline]]\n\n**Plan parking before you need it.** Running out of legal hours with no safe place to park is a common, avoidable trap — identify parking ahead of your limit, not at the last minute. Use parking resources to find spots in advance: apps like **Trucker Path** show truck-stop and rest-area capacity, and many states now run **Truck Parking Information & Management Systems (TPIMS)** that post real-time available spaces along the corridor. Where you can, choose well-lit, secure parking early in the trip when the load is freshest and the theft risk highest.\n\n**Build the appointment into the math, and escalate impossible windows.** If a 2 p.m. appointment can't be made legally — the drive time plus stops won't fit your hours — that's a conversation with SRL **before** you roll, not a reason to run over hours. **The log is the legal record; you never falsify it to make a window.** A late load is recoverable; a logbook violation or a fatigue crash is not.\n\n**Plans change mid-trip.** If you discover a routed path violates a truck restriction (no-truck zone, low bridge, weight-limited bridge), or a mountain pass closes for weather, **stop somewhere safe and call SRL/dispatch to reroute** — don't push blindly down a bad route. Keep your fuel receipts (the carrier's fuel-tax records depend on them), and build slack for weather and traffic so a delay doesn't push you into a violation.",
      },
    ],
    questions: [
      { order: 1, question: "For routing a truck you should use:", options: ["a truck-specific tool set to your height, weight, and length", "any passenger-car GPS app", "memory and road signs only", "whatever the shipper used"], correctIndex: 0, explanation: "A car app will route you under a low bridge or down a no-truck road. Use a truck-specific tool that knows your dimensions and weight." },
      { order: 2, question: "A standard dry van/reefer height to plan clearances around is:", options: ["a fixed 11'0\" everywhere", "typically about 13'6\", but it varies (13'6\"-14') and state limits differ — verify your actual height", "always exactly 15'0\"", "10'0\""], correctIndex: 1, explanation: "Typical is around 13'6\", but it varies with the equipment (up to ~14') and state height limits differ (federal law sets width at 8'6\" but no national height). Know your ACTUAL height and verify posted clearances against it." },
      { order: 3, question: "You're unsure a bridge has enough clearance. You:", options: ["stop and verify — don't guess", "take it slowly", "follow the car ahead", "let some air out of the tires"], correctIndex: 0, explanation: "You hold the primary duty to verify clearance — never guess or \"try it slow.\" (If dispatch routed you into a known low clearance, they share liability — but you still don't proceed; you escalate.)" },
      { order: 4, question: "Safe parking should be planned:", options: ["at the last minute", "ahead of your hours limit, before you run out", "only at familiar truck stops", "never — just keep driving"], correctIndex: 1, explanation: "Running out of legal hours with nowhere safe to park is an avoidable trap — identify parking ahead of your 11/14-hour limits." },
      { order: 5, question: "An oversize/overweight permit typically comes with:", options: ["no conditions", "a higher speed limit", "specific route and travel-time restrictions you must follow", "only a fee"], correctIndex: 2, explanation: "The permit dictates the route and the times you may travel; deviating from it voids the permit." },
      { order: 6, question: "Dispatch routes you under a bridge posted at 13'4\" and your truck is 13'6\". You:", options: ["follow dispatch — it's their route", "do not proceed; notify SRL and reroute — escalating beats a strike", "try it slowly since it's only 2 inches", "let air out of the tires to lower the trailer"], correctIndex: 1, explanation: "A posted clearance below your height means you do NOT cross, even on a dispatcher's instruction. You hold the primary duty; notify SRL and get a safe reroute. Dispatch shares liability for a bad route, but the strike still lands on your truck." },
      { order: 7, question: "Your 2 p.m. appointment can't be made legally on your remaining hours. You:", options: ["drive over your hours and fix the log later", "contact SRL before you roll to adjust the window — you never falsify the log to make an appointment", "skip the 30-minute break to save time", "speed to make up the difference"], correctIndex: 1, explanation: "The log is the legal record and is never manipulated to meet a window. An impossible appointment is a conversation with SRL in advance — a late load is recoverable; an HOS violation or a fatigue crash is not." },
      { order: 8, question: "Before a winter run over a mountain route, a quick way to check for closures, chain laws, and construction is:", options: ["assume the road is open", "dial 511 or check the state DOT road-conditions site", "ask the next driver you pass", "only check if it's already snowing where you are"], correctIndex: 1, explanation: "511 (the national traveler-information line) and the state DOT road-conditions site show closures, construction, chain laws, and weather along your route. Check before you roll and again if conditions change — it's part of planning a truck-legal trip." },
      { order: 9, question: "A placarded hazmat load has its own routing rules under:", options: ["49 CFR 397 — required routes, with prohibited tunnels and city cores", "the shipper's preference", "whatever your truck GPS picks", "no special rules — any legal truck route works"], correctIndex: 0, explanation: "Hazmat routing is governed by 49 CFR 397: placarded loads must use designated/required routes and avoid prohibited tunnels and dense city cores. A load that is both placarded and oversize has to satisfy both rule sets at once — when they conflict, call dispatch rather than improvise." },
    ],
  },

  {
    slug: "cargo-theft-security",
    title: "Cargo Theft & Security Awareness",
    category: "SRL Operational Excellence",
    summary: "Why your load is a target (and the holiday spike), how to park and lock to protect it, how seals catch tampering, how thieves use fictitious pickups, and exactly what to do if a load is stolen (without confronting anyone).",
    version: "5",
    estMinutes: 20,
    passThreshold: 80,
    validityMonths: null,
    sortOrder: 19,
    disclaimer: DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "Why your load is a target",
        estMinutes: 5,
        bodyMarkdown:
          "Cargo theft is a multi-billion-dollar problem, and thieves are professionals who study freight.\n\n**High-value, high-demand goods are targeted** — food and beverage, household and consumer-packaged goods, electronics, and pharmaceuticals top the lists. A lot of SRL freight (refrigerated CPG, wellness products) is exactly what thieves want, because it's easy to resell and hard to trace.\n\n**The risky window is right after pickup.** A large share of thefts happen at unsecured parking and within the first hours and roughly first 200 miles after pickup — the \"red zone\" — when a tired driver stops close to the origin.\n\n**Long weekends and holidays spike the risk.** Freight left sitting in a yard or a lot over a three-day weekend or a holiday is a prime target. Plan deliveries and secure parking around those breaks instead of leaving a loaded trailer unattended.\n\n**Theft comes in two modes.** **At-rest (straight) theft** takes a parked, unattended trailer — the broken-lock, opportunistic kind. **Strategic (fictitious) theft** takes the load through **fraud** — a thief posing as a legitimate carrier, with fake identity and paperwork, drives it right off the dock. Straight theft is what parking and locks defend against; **strategic theft — now the dominant vector — is defended by verifying the pickup** (Lesson 4).\n\nKnowing you're a target is the first defense.\n\n[[figure:cargo-theft-red-zone]]\n\n> " + DISCLAIMER,
      },
      {
        order: 2,
        title: "Park and protect",
        estMinutes: 4,
        bodyMarkdown:
          "Most theft is opportunity. Remove the opportunity:\n\n- **Get out of the red zone before your first long stop** — fuel and stage so you aren't parking a fresh load right next to the shipper.\n- **Park in secure, well-lit, reputable locations.** Back up to a wall or another trailer so the doors can't be opened.\n- **Lock it.** A kingpin lock, glad-hand/air-cuff lock, and a high-security rear door lock all raise the effort for a thief.\n- **Never leave the truck running and unattended.** A running, loaded, unlocked truck is the easiest theft there is.\n- **Keep your load quiet.** Don't post what you're hauling or your route on social media, and don't broadcast it on an open CB. Information is what lets a theft be planned.",
      },
      {
        order: 3,
        title: "Seals: your tamper-evident proof",
        estMinutes: 4,
        bodyMarkdown:
          "A **seal** is a numbered, single-use lock the shipper puts on the trailer doors after loading. It's your tamper-evident proof that no one got into the load between pickup and delivery.\n\n**At pickup:** confirm the doors are sealed, **read the seal number, and check it matches the number written on the BOL.** If they don't match — or the load went out unsealed when it should have been sealed — note it on the BOL before you sign. You're attesting to the seal; don't attest to one you didn't verify.\n\n**On the road:** check the seal is intact and the number unchanged at every stop, and again right before you back into the receiver. A seal that's **broken, cut, missing, or showing a different number** means possible tampering.\n\n**If the seal is compromised:** do **not** keep delivering as if nothing happened. **Stop, photograph the seal and doors, note it on the paperwork, and call dispatch / SRL** before the load is opened or signed for. A documented seal break is what protects you and supports any recovery or claim; an unreported one makes the loss look like it happened on your watch.",
      },
      {
        order: 4,
        title: "Fictitious pickups and what to do if it's stolen",
        estMinutes: 5,
        bodyMarkdown:
          "**Strategic (fictitious) theft is now the dominant cargo-theft vector** — thieves increasingly steal loads by **fraud, not by force**, using a fake identity and paperwork to take the freight straight from the shipper. Not all theft is a broken lock. In a **fictitious** or **strategic** pickup, a thief poses as a legitimate carrier or driver — using a stolen or fake identity — and simply drives the load away from the shipper. It's the same identity-fraud and double-brokering problem you learned about, aimed at the cargo.\n\n**Verify before the freight moves.** Confirm the load is really yours: your **dispatch reference and SRL paperwork should match** what the shipper has on the manifest, and the **broker/carrier authority** on the rate con should check out on **FMCSA SAFER** (the same verify-the-authority habit from the fraud course). Good questions at the dock: *'Is this load on your manifest under [my carrier / dispatch ref]? Who verified this BOL?'* **Watch the red flags:** last-minute changes to the pickup, destination, or who's collecting; a BOL that doesn't match your dispatch; pressure to hurry. If anything feels off, **stop and document it, and contact SRL at compliance@silkroutelogistics.ai (and dispatch) before you move the freight.**\n\n**If a load is stolen:** report it **immediately** — call **police (911 / local) first**, then **SRL (dispatch + compliance@silkroutelogistics.ai)** and the **broker**. Gather what you have — last-seen location and time, photos, the BOL, descriptions — because recovery odds drop sharply by the hour. Speed matters more than anything else.\n\n**Never confront or chase a thief.** If you catch a theft in progress, your safety comes first — do **not** try to stop them, block them in, or follow them. Get to a safe place, be a good witness (descriptions, plate, direction of travel), and call **911**. Cargo is replaceable; you are not.",
      },
    ],
    questions: [
      { order: 1, question: "The highest-risk window for cargo theft is often:", options: ["at delivery", "the first hours and ~200 miles after pickup (the \"red zone\")", "only overnight on weekends", "there is no real pattern"], correctIndex: 1, explanation: "A large share of thefts happen close to origin soon after pickup — clear the red zone before your first long stop." },
      { order: 2, question: "A common cargo-theft target is:", options: ["gravel and sand", "empty trailers", "high-value goods — food, CPG, electronics, pharma", "outbound mail only"], correctIndex: 2, explanation: "Easy-to-resell, hard-to-trace goods — exactly what a lot of SRL freight (reefer CPG, wellness) is." },
      { order: 3, question: "A good anti-theft practice is to:", options: ["park in secure lit lots and use a kingpin / high-security lock", "leave it running to deter thieves", "post your route so people can find you", "hide a spare key on a tire"], correctIndex: 0, explanation: "Secure, lit parking plus real locks removes the opportunity most thefts depend on. Leaving it running or broadcasting your route does the opposite." },
      { order: 4, question: "A \"fictitious pickup\" is when:", options: ["the shipper cancels the load", "a thief poses as a legit carrier to take the load at pickup", "the receiver is closed on arrival", "the BOL has a typo"], correctIndex: 1, explanation: "It's identity fraud aimed at the cargo — confirm the pickup is really yours and watch for last-minute changes before you move freight." },
      { order: 5, question: "If your loaded trailer is stolen, you:", options: ["report it immediately to police, SRL, and the broker", "wait a day to see if it turns up", "handle it quietly yourself", "tell only the receiver"], correctIndex: 0, explanation: "Recovery odds drop sharply by the hour — call police (911) first, then SRL (dispatch + compliance@) and the broker, and gather last-seen location, time, and photos." },
      { order: 6, question: "At pickup you read the seal number and it doesn't match the number on the BOL. You:", options: ["sign anyway — the doors are closed", "note the mismatch on the BOL before signing and confirm with the shipper/dispatch", "swap in your own lock and go", "ignore it; seal numbers don't matter"], correctIndex: 1, explanation: "The seal number on the trailer must match the BOL — a mismatch (or an unsealed load that should be sealed) is a tampering/loading flag. Note it before you sign; don't attest to a seal you didn't verify." },
      { order: 7, question: "Before a load leaves the shipper, the best defense against a fictitious pickup is to:", options: ["trust whoever hands you the paperwork", "confirm your dispatch ref + SRL paperwork match the shipper's manifest and the authority checks out on FMCSA SAFER", "skip verification to save time on a tight window", "only worry about it at delivery"], correctIndex: 1, explanation: "Fictitious pickups are identity fraud aimed at the cargo. Match your dispatch reference and paperwork to the shipper's manifest, verify the authority on SAFER, and treat last-minute changes or pressure as red flags — verify before the freight moves." },
      { order: 8, question: "You return to your truck and catch someone breaking into your loaded trailer. You:", options: ["confront them and try to stop the theft", "block them in with your truck and hold them", "stay safe, be a good witness (descriptions, plate, direction), and call 911", "chase them to recover the load"], correctIndex: 2, explanation: "Never confront or chase a cargo thief — your safety comes first. Get to a safe place, note descriptions, the plate, and direction of travel, and call 911. Cargo is replaceable; you are not." },
      { order: 9, question: "Posting your load and route on social media or broadcasting it on an open CB is:", options: ["good marketing for your carrier", "a security risk — it gives thieves the information to plan a theft, so keep it quiet", "required so dispatch can track you", "fine as long as you don't name the shipper"], correctIndex: 1, explanation: "Information is what lets a theft be planned. Don't post what you're hauling or your route on social media, and don't broadcast it on an open CB — keep your load quiet so you don't hand thieves the plan." },
    ],
  },

  {
    slug: "human-trafficking-awareness",
    title: "Human Trafficking Awareness",
    category: "Driver Qualification & Health",
    summary: "What trafficking is (both sex and labor trafficking), why drivers are a key line of defense, how to recognize the signs, and how to report safely without intervening.",
    version: "5",
    estMinutes: 18,
    passThreshold: 80,
    validityMonths: null,
    sortOrder: 20,
    disclaimer: DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "What it is and why drivers matter",
        estMinutes: 3,
        bodyMarkdown:
          "Human trafficking — forced labor and sex trafficking — happens along the same highways, truck stops, motels, and rest areas drivers use every day. Victims are often hidden in plain sight.\n\n**The legal definition:** trafficking is a **commercial sex act, OR labor or services, obtained through force, fraud, or coercion.** And **any commercial sex act involving a minor is trafficking** — regardless of whether force, fraud, or coercion is present.\n\n**Trafficking is not smuggling.** Smuggling is a border or transport crime — moving someone across a line illegally, usually with their consent. **Trafficking is ongoing exploitation** through force, fraud, or coercion, and can happen to anyone regardless of immigration status. A person can be **smuggled first and then trafficked.**\n\nDrivers are the **eyes of the highway** and a recognized line of defense; the organization **Truckers Against Trafficking (TAT)** trains drivers exactly for this. Your role is not to be a hero or run a rescue — it is to **recognize and report**. A single call has freed people.\n\nThis training is increasingly **expected**: a number of states now require human-trafficking awareness for CDL drivers, and major carriers train to the TAT standard. More important than any mandate, you are often the only person positioned to notice. You do **not** have to be certain — your job is to notice and report, and let trained responders sort out the rest.\n\n> " + DISCLAIMER,
      },
      {
        order: 2,
        title: "Recognizing the signs",
        estMinutes: 5,
        bodyMarkdown:
          "No single sign proves trafficking, but patterns matter. Watch for someone who:\n\n- **Is not free to come and go** or is clearly controlled by another person.\n- **Lacks their own ID or documents** — someone else holds them.\n- **Appears coached, fearful, or isn't allowed to speak** for themselves.\n- Shows signs of abuse, malnourishment, or branding tattoos.\n- **Doesn't know what city or state they're in**, or where they're headed.\n- **Their story doesn't add up** — inconsistent details, or a rehearsed-sounding account.\n- Is a **minor** involved in commercial sex (always trafficking).\n\n[[figure:trafficking-warning-signs-pattern]]\n\nAt truck stops, watch for activity around the trucks — CB chatter offering \"commercial company,\" people moving between trucks at night, or knocks on cab doors. Trust your instincts; if it feels wrong, it may be.\n\n**\"Controlled by another person\" — what that really looks like.** A couple or family traveling together is normal. Control is different: one person **answers for** another, holds **all** their documents and money, and won't let them speak, be alone, or leave; the other looks fearful, coached, or is watched constantly. A minor involved in commercial sex is **always** trafficking.\n\n**Labor trafficking looks different from sex trafficking.** It's forced work under threat, debt, or coercion, and you might see it at a **shipper, farm, plant, or even another trucking operation**: workers who can't leave, are housed and guarded on-site, had their pay or documents withheld, or are 'working off a debt' they can never clear. Same rule: recognize the pattern, don't engage, and report it.\n\n**When you're not sure, you still report.** You are not the investigator and you don't need proof. If the pattern feels wrong, make the call and let trained responders assess it. A wrong hunch costs a phone call; a missed one can cost a life.",
      },
      {
        order: 3,
        title: "Report — don't engage",
        estMinutes: 3,
        bodyMarkdown:
          "**Do not confront a trafficker or attempt a rescue.** It's dangerous for you and for the victim.\n\n**Know what \"don't engage\" means.** Reporting is your job; *intervening* is not. Trying to talk to the victim, offering them a ride, food, or money, confronting the controller, taking close-up photos, or following the vehicle are all **intervening** — they can tip off a trafficker, put the victim in worse danger, and put you at risk. Stay back, stay safe, and let the professionals act.\n\nInstead, quietly note what you can — descriptions, a vehicle and plate, the location and time — and call:\n\n- **National Human Trafficking Hotline: 1-888-373-7888**, or **text HELP to 233733** (texting the number alone does not reach a responder — include the keyword), or\n- **911** if someone is in immediate danger.\n\nMake the call from a safe spot, and let trained responders take it from there. Recognizing and reporting is the whole job.\n\n[[figure:trafficking-reporting-workflow]]",
      },
      {
        order: 4,
        title: "Reporting on an SRL load",
        estMinutes: 4,
        bodyMarkdown:
          "You might spot trafficking anywhere you run — a truck stop or rest area, but also at a **shipper or receiver, during a detention wait, or at a motel** on a layover. The rule is the same everywhere: note it, report it, don't engage.\n\n**On an SRL load, here is the path:**\n\n1. If someone is in immediate danger, call **911** first.\n2. Call or text the **National Human Trafficking Hotline — 1-888-373-7888, or text HELP to 233733**.\n3. Then notify SRL: **call dispatch / operations**, and **email both compliance@silkroutelogistics.ai and operations@silkroutelogistics.ai** with what you saw.\n\n**SRL has your back on this.** SRL supports drivers who report, and you will **not** be penalized for a delay caused by doing the right thing. SRL takes the necessary measures under the law and communicates with the authorities. Reporting is never the wrong call.\n\n> " + DISCLAIMER,
      },
    ],
    questions: [
      { order: 1, question: "A truck driver's role against human trafficking is to:", options: ["recognize the signs and report — not intervene", "run a rescue yourself", "question the trafficker directly", "ignore it and move on"], correctIndex: 0, explanation: "Recognize and report. Confronting traffickers or attempting a rescue is dangerous for you and the victim — your job is the call." },
      { order: 2, question: "A warning sign of trafficking is someone who:", options: ["looks tired after a long shift", "isn't free to leave or lacks their own ID", "is shopping at a busy truck stop", "is waiting at a closed dock"], correctIndex: 1, explanation: "Being controlled, lacking documents, and appearing coached or fearful are classic indicators — ordinary fatigue or a busy stop is not." },
      { order: 3, question: "The National Human Trafficking Hotline number is:", options: ["411", "1-888-373-7888", "CHEMTREC", "your dispatcher only"], correctIndex: 1, explanation: "Call 1-888-373-7888, or text HELP to 233733 (the keyword is required — texting the number alone won't reach a responder), or 911 for immediate danger." },
      { order: 4, question: "If you suspect trafficking, you:", options: ["confront the people involved", "follow the vehicle to get more detail", "note details and call the hotline or 911 — don't confront anyone", "post what you saw online"], correctIndex: 2, explanation: "Quietly note descriptions, vehicle, plate, location, and time, then call trained responders. Don't engage or follow." },
      { order: 5, question: "The organization that trains drivers to spot trafficking is:", options: ["FMCSA", "Truckers Against Trafficking (TAT)", "CHEMTREC", "OSHA"], correctIndex: 1, explanation: "Truckers Against Trafficking (TAT) trains drivers to recognize and report." },
      { order: 6, question: "You suspect a victim at a truck stop. Offering them a ride or some money to help is:", options: ["the right way to help", "still intervening — it can be dangerous; note it and report instead", "fine as long as you call afterward", "required by TAT"], correctIndex: 1, explanation: "Offering a ride, food, or money, talking to the victim, or following the vehicle are all intervening — they can tip off a trafficker and put you and the victim in danger. Stay back, note details, and report." },
      { order: 7, question: "On an SRL load, after calling 911 or the hotline, you also:", options: ["keep it to yourself", "call SRL dispatch/operations and email compliance@ and operations@", "wait until the load delivers", "post it on a driver forum"], correctIndex: 1, explanation: "Notify SRL — call dispatch/operations and email compliance@silkroutelogistics.ai and operations@silkroutelogistics.ai. SRL supports reporting and won't penalize a delay from doing the right thing." },
      { order: 8, question: "Human trafficking includes:", options: ["only sex trafficking at truck stops", "both sex trafficking and labor trafficking (forced work under threat, debt, or coercion) — which you might see at a shipper, farm, or plant", "only crimes involving minors", "only situations with physical restraints"], correctIndex: 1, explanation: "Trafficking is forced sex OR forced labor. Labor trafficking — workers who can't leave, are guarded, had pay or documents withheld, or are 'working off a debt' — can appear at facilities you visit. Same rule: recognize, don't engage, report." },
      { order: 9, question: "Legally, human trafficking is:", options: ["only when someone is physically chained or locked up", "a commercial sex act or labor/services obtained through force, fraud, or coercion — and any commercial sex act involving a minor, regardless of force, fraud, or coercion", "the same thing as smuggling someone across a border", "only a crime if the victim asks for help"], correctIndex: 1, explanation: "Trafficking is a commercial sex act, OR labor or services, obtained through force, fraud, or coercion. Any commercial sex act involving a minor is trafficking regardless of force/fraud/coercion. It differs from smuggling (a consensual border/transport crime) — a person can be smuggled and then trafficked." },
    ],
  },

  {
    slug: "workplace-dock-safety",
    title: "Workplace & Dock Safety",
    category: "Vehicle & Cargo Safety",
    summary: "Three-point contact and the falls that injure drivers, the overexertion injuries that end careers, hand and pinch-point injuries, heat and cold stress, what to do if you're hurt on someone else's dock, and staying safe around the dock, forklifts, doors, and engine exhaust.",
    version: "5",
    estMinutes: 18,
    passThreshold: 80,
    validityMonths: 12,
    sortOrder: 21,
    disclaimer: DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "Slips, trips, falls, and three-point contact",
        estMinutes: 5,
        bodyMarkdown:
          "Driver injuries cluster in two places: **overexertion** from lifting and handling (the single largest category — covered in the next lesson) and **slips, trips, and falls** getting into and out of the cab and trailer (one of the most common injuries, and one of the most preventable). A bad fall ends with a wrenched knee, a broken wrist, or worse.\n\n**Always use three points of contact:** two hands and one foot, or two feet and one hand, in contact with the truck at all times when climbing in or out. **Face the equipment** — climb down like a ladder, never step off facing out, and **never jump down.** Jumping loads your knees, ankles, and back with your full weight plus momentum.\n\nKeep steps and grab handles clean and clear, and watch your footing for ice, fuel and oil spills, hoses, and uneven dock surfaces.\n\n**Mind heat and cold.** Loading, unloading, tarping, or inspecting in extreme weather is real physical work. In **heat**, drink water before you're thirsty, take shade breaks, and know the signs of heat exhaustion (heavy sweating, dizziness, nausea) and heat stroke (confusion, hot dry skin — a 911 emergency). In **cold**, layer up, keep dry, and watch for numbness or shivering you can't stop. Don't power through either one.\n\n> " + DISCLAIMER,
      },
      {
        order: 2,
        title: "Lifting and material handling",
        estMinutes: 4,
        bodyMarkdown:
          "Back injuries from poor lifting end careers slowly.\n\n**Lift with your legs, not your back:** feet planted, squat down, keep the load close to your body, and stand up with your legs. **Don't twist** while lifting — turn your feet instead. For anything heavy, awkward, or high, get help or use equipment (pallet jack, hand truck, or a lumper where that's the arrangement).\n\nKnow the basics of a pallet jack and hand truck, don't overreach or overload them, and pace repetitive handling so you don't grind down your back and shoulders. If touching the freight isn't your job, don't let yourself get talked into it unsafely.\n\n**Watch your hands — pinch points are everywhere.** Trailer doors, load bars, ratchet binders and strap ratchets, the fifth-wheel release, and the gap between a dock plate and the trailer all crush and pinch fingers. Keep your hands off the pinch line, work each handle or bar the way it's designed, and never put a finger where a door, ratchet, or load bar can slam it. Wear gloves when you handle straps, chains, and binders.",
      },
      {
        order: 3,
        title: "On the dock",
        estMinutes: 4,
        bodyMarkdown:
          "The dock is someone else's workplace full of moving equipment.\n\n**Stop the trailer from moving while it's worked.** Set the brakes, **chock the wheels**, and engage the **dock lock / wheel restraint.** Two things have killed people here: a truck **pulled away early** while a forklift was still inside, and **trailer creep** — each time a heavy forklift drives in and slams its load down, it nudges the trailer a fraction forward, until a gap opens between the trailer and the dock and the forklift drops into it. **Verify the dock lock is actually engaged** — a green light isn't proof; the restraint has to be on the bumper. Glad-hands stay connected, keys in your pocket, and don't pull until the dock signals you're clear.\n\n**Forklifts:** stay out of their path and **make eye contact with the operator before you cross** — never assume they see you. A **raised or oversized load blocks the operator's view**, so the front is a blind spot; give a lifted load a wide berth. Watch the dock-plate gap.\n\n**Watch the air and the doors.** In an **enclosed or underground dock**, idling trucks, reefer units, and propane forklifts build up **carbon monoxide** — a colorless, odorless gas. Headache, dizziness, or nausea on a closed dock means **get to fresh air**; don't let your truck or reefer idle in a sealed space. And never stand or walk **under a moving overhead dock door** — sensors and interlocks fail.\n\n**Wear the required PPE** — high-visibility vest, steel-toe boots, hard hat where the facility requires — and follow their rules. You're a guest; their safety program governs while you're on site.\n\n**If you get hurt on someone else's dock, report it right away** — tell the facility (they must document an incident that happens on their site) **and** call your dispatch/carrier. Get first aid or medical care for anything beyond minor. An injury you 'walk off' and don't report can be denied later by workers' comp and leaves no record if it worsens — a written report on both sides protects you.\n\n[[figure:dock-safety-hazards]]",
      },
    ],
    questions: [
      { order: 1, question: "Getting into or out of the cab, you always use:", options: ["three points of contact", "one hand on the wheel", "a quick jump down", "the door handle only"], correctIndex: 0, explanation: "Two hands and a foot, or two feet and a hand, at all times — face the equipment like a ladder and never jump down." },
      { order: 2, question: "The correct way to lift a heavy object is:", options: ["bend at the back and pull", "with your legs, load held close, no twisting", "as fast as possible", "one-handed to save time"], correctIndex: 1, explanation: "Squat, keep the load close, stand with your legs, and turn your feet instead of twisting. Get help or equipment for anything heavy or awkward." },
      { order: 3, question: "To keep a trailer from pulling away from the dock during loading, use:", options: ["wheel chocks and a dock lock / wheel restraint", "the parking brake alone", "nothing — the forklift weight holds it", "the trailer marker lights"], correctIndex: 0, explanation: "Chocks plus a dock restraint stop trailer creep and an early pull-away while a forklift is still inside — that scenario has killed people." },
      { order: 4, question: "Around a forklift on the dock you:", options: ["assume the operator sees you", "stay out of its path and make eye contact", "walk close behind it", "stand in the main aisle"], correctIndex: 1, explanation: "Never assume you're seen — stay clear of its path and make eye contact with the operator." },
      { order: 5, question: "Falls from the cab or trailer are:", options: ["rare and unavoidable", "only a winter problem", "one of the most common driver injuries, and highly preventable", "not your responsibility"], correctIndex: 2, explanation: "Slips, trips, and falls are among the top driver injuries (overexertion from lifting/handling is the single largest category) — and falls are almost entirely preventable with three-point contact and never jumping down." },
      { order: 6, question: "\"Trailer creep\" at a dock is when:", options: ["the trailer rusts over time", "repeated forklift entries nudge the trailer forward until a gap opens at the dock", "the reefer cycles on and off", "the driver naps in the sleeper"], correctIndex: 1, explanation: "Each forklift entry shoves the trailer a fraction forward; without a dock lock and chocks a gap opens and the forklift can drop into it. Verify the restraint is actually engaged — a green light isn't proof." },
      { order: 7, question: "On an enclosed dock you start to feel a headache and dizziness. The likely hazard and right move:", options: ["low blood sugar — keep working", "carbon-monoxide buildup from idling engines/forklifts — get to fresh air", "the load is too cold — ignore it", "normal dock fatigue — push through"], correctIndex: 1, explanation: "Idling trucks, reefers, and propane forklifts build colorless, odorless carbon monoxide in an enclosed space. Headache, dizziness, or nausea means get to fresh air and don't idle in a sealed dock." },
      { order: 8, question: "Tarping a flatbed on a 98-degree afternoon, you feel dizzy and nauseated with heavy sweating. This is:", options: ["normal — push through to finish", "a sign of heat exhaustion — stop, get to shade or AC, and drink water", "a reason to skip your next break", "only a problem for new drivers"], correctIndex: 1, explanation: "Heavy sweating, dizziness, and nausea are heat exhaustion. Stop, get to shade or AC, and rehydrate. If it progresses to confusion or hot, dry skin (heat stroke), that's a 911 emergency. Hydrate before you're thirsty and take breaks in extreme heat or cold." },
      { order: 9, question: "You strain your back lifting on a customer's dock. The right move is to:", options: ["walk it off and say nothing so you don't look weak", "report it to both the facility and your dispatch/carrier and get it documented", "only mention it to the facility", "wait until it gets worse before reporting it"], correctIndex: 1, explanation: "Report a dock injury right away to BOTH the facility (they must document an incident on their site) and your dispatch/carrier, and get first aid or medical care for anything beyond minor. An unreported injury can be denied later by workers' comp and leaves no record if it worsens." },
    ],
  },

  {
    slug: "coercion-professional-conduct",
    title: "Coercion, Whistleblower Protection & Professional Conduct",
    category: "SRL Operational Excellence",
    summary: "How to recognize coercion when you hear it (across all the safety rules, not just hours), your right to refuse unsafe or illegal driving, how and where to file, the whistleblower protection that backs you, and the professionalism that earns repeat freight.",
    version: "5",
    estMinutes: 19,
    passThreshold: 80,
    validityMonths: null,
    sortOrder: 22,
    disclaimer: DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "The coercion rule",
        estMinutes: 5,
        bodyMarkdown:
          "Federal law protects your right to drive legally. The FMCSA **coercion rule (49 CFR 390.6)** prohibits motor carriers, shippers, receivers, and brokers from coercing a driver to violate the safety regulations — Hours-of-Service, CDL rules, drug & alcohol rules, hazmat, and securement among them.\n\n**Learn to recognize it — coercion has a sound.** It's rarely the word 'coercion.' It's:\n\n- *\"You won't get another load from us if you don't roll tonight.\"*\n- *\"Other drivers make this run, what's your problem?\"*\n- *\"If you log it that way, we lose the customer.\"*\n- *\"Just tell them you're empty so we can load you again faster.\"*\n- *\"It's only a little overweight, just take the back roads around the scale.\"*\n- *\"Skip the brake write-up and run it, you're already late.\"*\n\nIf anyone threatens your pay, your job, or your future loads to push you to drive over your hours or operate unsafely — overweight, unsecured, with a known defect, or off your hazmat route — that's **coercion**, and it's illegal. It covers **all** the safety rules, not just your hours.\n\n**How to file.** You file a coercion complaint with FMCSA through the **National Consumer Complaint Database (nccdb.fmcsa.dot.gov)**, generally **within 90 days** of the incident. Include **your name and contact info, the name and contact of whoever coerced you, the specific regulation they pushed you to violate, and what was said** — so write it down while it's fresh. You have the right to refuse to break the law, and SRL backs that right.\n\n[[figure:coercion-recognition]]\n\n> " + DISCLAIMER,
      },
      {
        order: 2,
        title: "Whistleblower protection",
        estMinutes: 3,
        bodyMarkdown:
          "Your refusal is protected. Under the **Surface Transportation Assistance Act (STAA)**, you cannot lawfully be fired, disciplined, or retaliated against for **refusing to operate** a vehicle when (a) doing so would **actually violate a safety regulation**, or (b) you have a **reasonable apprehension of serious injury** from an unsafe condition — for this reasonable-apprehension refusal, the protection generally requires that you **sought to have the condition corrected by the employer and were unable to get it corrected** — or for **reporting** a safety violation. You don't have to refuse in writing, but **document it** (what you were asked, what you said, when) so the refusal is on record.\n\nA threat like \"run these hours or lose the account\" has no legal teeth. The law is on the side of the driver who refuses to drive illegally.\n\n**Retaliation isn't always getting fired.** Being given worse lanes, longer waits at shippers, or quietly cut out of the good freight after you refused or reported is also retaliation — it's just harder to see and to prove, which is why documentation matters.\n\n**If you face retaliation, file with OSHA, which administers STAA complaints, within 180 days of the retaliatory act.** Keep the two clocks straight — they're **separate, not a sequence**:\n\n- The **coercion** complaint (someone pressuring you to violate the rules) goes to **FMCSA within 90 days** of the pressure.\n- The **STAA retaliation** complaint (being fired, disciplined, or punished after you refused or reported) goes to **OSHA within 180 days of the retaliatory act** — that clock starts from the discipline, not from the original coercion.\n\n**After you file,** OSHA investigates (it takes time, not days) and can order you **reinstated with back pay** if retaliation is found. Internally, raise coercion or retaliation with **SRL operations/compliance** first — SRL would rather fix it than have you carry it alone. Knowing your protection, and the clock on it, is what lets you hold the line when you're pressured.",
      },
      {
        order: 3,
        title: "Professional conduct on an SRL load",
        estMinutes: 4,
        bodyMarkdown:
          "On an SRL load you represent both your carrier and SRL to the shipper and receiver. Professionalism is what turns one load into a lane.\n\n**Be on time, communicate, and be courteous.** Show up clean, follow each facility's rules, and don't argue at the dock — if there's a problem, work it through **dispatch and SRL**, not a confrontation with the staff in front of you.\n\n**Integrity:** accurate logs, honest paperwork, no shortcuts. The freight world is small and your record follows you.\n\nYour professionalism — and how it feeds your carrier's **SRL Compass Score** (SRL's own 7-factor carrier rating, not a federal score) — is what earns access to repeat, better freight. Drivers who are easy to work with and consistently deliver lift that score, and the carriers who score well get called first.",
      },
    ],
    questions: [
      { order: 1, question: "The FMCSA coercion rule (49 CFR 390.6) prohibits:", options: ["a carrier, shipper, receiver, or broker forcing you to violate safety rules", "speeding tickets", "parking at a rest area", "using a fuel card"], correctIndex: 0, explanation: "390.6 bans coercing a driver to break the safety regulations — HOS, CDL, drug/alcohol, hazmat, securement — under threat to pay, job, or future loads." },
      { order: 2, question: "A broker threatens to pull your loads unless you run past your legal hours. That is:", options: ["normal business", "your problem to solve", "coercion — reportable to FMCSA within 90 days", "required of you"], correctIndex: 2, explanation: "Threatening your livelihood to force a violation is coercion under 390.6 — file the coercion complaint with FMCSA within 90 days." },
      { order: 3, question: "You refuse to drive over your hours and are threatened with firing. You are:", options: ["out of luck", "protected from retaliation under the STAA (file with OSHA within 180 days)", "required to comply", "subject to a fine"], correctIndex: 1, explanation: "STAA protects you from retaliation for refusing to violate safety regs or for reporting them — the OSHA complaint deadline is 180 days (vs. 90 days for the FMCSA coercion complaint)." },
      { order: 4, question: "A problem with facility staff at the dock is handled by:", options: ["arguing it out on the spot", "contacting dispatch and SRL, not confronting staff", "leaving without telling anyone", "posting about it online"], correctIndex: 1, explanation: "Work problems through dispatch and SRL — don't confront facility staff in front of the dock." },
      { order: 5, question: "Your professionalism and tracked performance most directly affect:", options: ["nothing measurable", "your carrier's SRL Compass Score and its access to repeat, better freight", "only the weather", "the fuel price"], correctIndex: 1, explanation: "Compass is SRL's own 7-factor carrier rating (not a federal score). Reliable, easy-to-work-with carriers who score well get called first for the better loads." },
      { order: 6, question: "A dispatcher says 'other drivers make this run, what's your problem?' to push you past your hours. To report the coercion you:", options: ["post about it on social media", "file with FMCSA's National Consumer Complaint Database (nccdb.fmcsa.dot.gov) within 90 days, with the names, the rule, and what was said", "just run the load", "wait 6 months and see if it happens again"], correctIndex: 1, explanation: "That's coercion under 390.6. File through FMCSA's NCCDB within 90 days; include your info, the coercer's info, the specific regulation, and what was said — so document it while it's fresh." },
      { order: 7, question: "After you refuse an unsafe load you're not fired, but you start getting only the worst lanes and longest waits. This is:", options: ["just bad luck, nothing to do", "possible retaliation under STAA — document it; the OSHA complaint window is 180 days from the retaliatory act", "perfectly legal punishment", "a reason to quit quietly"], correctIndex: 1, explanation: "Retaliation isn't only firing — worse lanes, longer waits, or being cut out of good freight after a protected refusal can count. Document it and know the STAA/OSHA clock is 180 days from the retaliatory act (separate from the 90-day FMCSA coercion clock)." },
      { order: 8, question: "A shipper says 'it's only a little overweight, just avoid the scales.' This is:", options: ["smart routing advice", "coercion to violate the rules — the same protections apply as being pushed past your hours", "fine as long as you don't get caught", "only the shipper's problem, not yours"], correctIndex: 1, explanation: "Coercion under 390.6 isn't only about hours — being pushed to run overweight, skip a securement or brake check, or drive a truck with a known defect counts too. The same right to refuse and the same reporting protections apply." },
    ],
  },

  // ───────────────────────────────────────────────────────── D1
  {
    slug: "space-speed-hazard-management",
    title: "Space & Speed Management + Hazard Perception",
    category: "On-Road Safety",
    summary: "The core of defensive driving: search far enough ahead to see trouble early, keep enough following distance and space on all sides, manage speed to the real stopping physics of a loaded truck, and read hazards before they become emergencies.",
    version: "2",
    estMinutes: 26,
    passThreshold: 80,
    validityMonths: 12,
    sortOrder: 23,
    disclaimer: DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "See the whole picture",
        estMinutes: 5,
        bodyMarkdown: `Most crashes are lost in the seconds before they happen — because the driver was looking too close to the front of the truck. Defensive driving starts with **where you look**.

**Look 12 to 15 seconds ahead.** That is about a **quarter mile** at highway speed, or about **one and a half blocks** in town. Aiming that far down the road gives you time to see a problem, decide, and act smoothly instead of reacting at the last second. If all you can see is the bumper ahead of you, you are driving blind.

**Keep your eyes moving.** Scan — near, far, both mirrors — don't fix on one point. Check your **mirrors every 5 to 8 seconds** and before every lane change, hill, and curve so you always know what is beside and behind you. A stare is how you miss the car drifting into your lane.

**Get the big picture.** Watch the traffic two, three, four vehicles ahead, not just the car in front of you. Brake lights way up the line are your early warning; by the time the car directly ahead lights up, you have already lost your cushion.

These are the first three of the **Smith System 5 Keys** — *Aim High in Steering, Get the Big Picture, Keep Your Eyes Moving.* The last two, *Leave Yourself an Out* and *Make Sure They See You*, come later in this course.

[[figure:visual-lead-time-quarter-mile]]

> ` + DISCLAIMER,
      },
      {
        order: 2,
        title: "Following distance — the space ahead",
        estMinutes: 5,
        bodyMarkdown: `The space in front of you is the one you control, and it is the space that keeps you out of the rear-end crash.

**The rule (CDL manual).** Under **40 mph**, keep at least **one second of following distance for every 10 feet of vehicle length**. **Above 40 mph, add one more second.** A typical **60-foot** tractor-trailer needs about **6 seconds** below 40 mph and **7 seconds** at highway speed.

**How to count it.** Pick a fixed object ahead — a sign, an overpass shadow, a paint mark. When the vehicle in front passes it, count *"one-thousand-one, one-thousand-two…"* until your front bumper reaches the same spot. Fewer seconds than the rule says means **drop back**.

**Add space when it's not ideal:** rain, snow, or ice; darkness; fog; heavy or fast traffic; being tailgated (yes — *more* room, so you can brake gently and not get hit from behind); a heavy load; or when you're tired. When in doubt, open it up. Space is free; a crash is not.

[[figure:following-distance-seconds-rule]]

The driver who tailgates has given away the one thing that could have saved the load — time.`,
      },
      {
        order: 3,
        title: "Space on all six sides",
        estMinutes: 5,
        bodyMarkdown: `You manage space in every direction, not just ahead.

**Behind.** Directly behind the trailer is your **largest blind spot** — one lane wide and up to **200 feet** back. Tap the brakes early to warn a tailgater and be ready to increase your following distance so you can stop gently.

**To the sides.** Trucks have blind spots along both sides — the **"No-Zone."** The right side is the worst. Before any lane change or turn, check the mirror **and** account for the spot the mirror can't show, signal early, and change lanes slowly so a vehicle hidden there has time to clear. Remember that your **convex ("West Coast") mirrors** give a wider view but **make following vehicles look smaller and farther away than they really are** — a car that looks a couple lengths back is closer than it appears, so give it extra room before you move over.

**Above.** Know your **real loaded height** (not the legal max — the actual number on today's trailer). Watch for low bridges, canopies, wires, and tree limbs. "It looked like it would fit" is how trailers get peeled open.

**Below.** Watch for high railroad crossings, dips, and soft or low ground that can trap a trailer's tandems or drag the underride. On a **highway-rail grade crossing**, never start across unless you're sure you can clear the far side without stopping.

**Ahead and to the front corners.** There's a blind spot directly in front of the hood — roughly **20 feet** — where a small car or a person can disappear. Leave room and look before you roll from a stop.

[[figure:truck-no-zone-six-sides]]

Managing space on all six sides is how you always have somewhere to go — the fourth Smith key, **Leave Yourself an Out.**`,
      },
      {
        order: 4,
        title: "Speed management and the real stopping physics",
        estMinutes: 6,
        bodyMarkdown: `A loaded truck does not stop like a car, and the numbers are not intuitive. Manage speed to the physics, not to the flow of traffic.

**Total stopping distance = perception + reaction + braking.** From the moment a hazard appears: you have to *see* it (perception), *move your foot* (reaction), then the *brakes have to do the work* (braking). At **55 mph on dry pavement** the pieces add up to roughly **perception ~142 ft + reaction ~61 ft + braking ~216 ft ≈ 419 ft total** — about **a football field and a half** to get a loaded combination stopped. Wet, snow, or ice can **easily double or triple** that.

**Braking distance grows with the SQUARE of speed.** Double your speed and your braking distance is about **four times** as long. That is why 5 mph over "to make up time" costs far more stopping distance than it feels like.

**Empty can be worse than loaded.** With little weight over the drive tires, an empty or lightly loaded truck has **less traction** and can bounce, so it may take **longer** to stop and is easier to skid or jackknife than you'd expect. Don't assume light means safe.

**Slow before the curve, not in it.** Braking hard in a curve invites a skid or a rollover. Get your speed down on the straight approach, then power gently through. **Posted advisory (yellow) curve and ramp speeds are set for passenger cars** — a loaded truck should be **well below** them, and on a **tight or looping interchange ramp** FMCSA guidance is to cut to roughly **one-third to one-half below the posted advisory**.

**Speed on grades.** Pick a safe, low gear **before** a long downgrade and let the engine brake / retarder hold you; don't ride the service brakes down a mountain or they'll fade to nothing. Know where the runaway ramps are.

[[figure:stopping-distance-vs-speed-square]]`,
      },
      {
        order: 5,
        title: "Read hazards early — and always keep an out",
        estMinutes: 5,
        bodyMarkdown: `A **hazard** is anything that could become an emergency — a ball rolling into the street (a child may follow), brake lights cresting a hill, a car weaving, a merge lane ending, a driver on a phone, a wet shine on the road. **Hazard perception** is spotting these early and adjusting *before* you have to react.

**Cover the brake and open space** when you see a hazard developing: ease off the throttle, move your foot over the brake, and create room. Most of the time nothing happens — and that's the point. You bought yourself margin for free.

**Watch the drivers, not just the cars.** A tilted head (phone), no eye contact at a stop, drifting within a lane, brake lights that don't quite make sense — these tell you what a vehicle is about to do before it does it.

**Make sure they see you** — the fifth Smith key. Use your signals early, your lights in low visibility, your horn when needed, and your position on the road so a car merging or turning across your path has every chance to notice the truck. Assume the small vehicle *hasn't* seen you until it proves otherwise.

**Always leave yourself an out.** Position the truck so that if the worst happens you have somewhere to go — a shoulder, an open lane, a gap. Boxing yourself in beside another truck or riding in a car's blind spot takes your options away.

Speed and space management, done early and every mile, is what keeps a hazard from ever becoming a crash — and it's a direct input to your carrier's **SRL Compass Score** through your safety and claims record.`,
      },
    ],
    questions: [
      { order: 1, question: "How far ahead should you be looking while driving?", options: ["Just past the hood", "About 1–2 seconds ahead", "12–15 seconds ahead (about a quarter mile at highway speed)", "As far as the next town"], correctIndex: 2, explanation: "Aiming 12–15 seconds ahead (roughly a quarter mile at highway speed, about a block and a half in town) gives you time to see, decide, and act smoothly instead of reacting late." },
      { order: 2, question: "A 60-foot combination at 55 mph should keep a following distance of about:", options: ["2 seconds", "4 seconds", "7 seconds", "1 truck length"], correctIndex: 2, explanation: "The rule is 1 second per 10 feet of length under 40 mph, plus 1 more second above 40 mph — a 60-ft truck needs ~6 seconds under 40 and ~7 seconds at highway speed." },
      { order: 3, question: "You are being tailgated by a car. You should:", options: ["Speed up to lose them", "Brake-check them", "Increase your following distance ahead so you can brake gently", "Move onto the shoulder"], correctIndex: 2, explanation: "Open MORE room ahead so you can slow gradually and never need a hard stop that the tailgater can't match — a hard stop is how you get rear-ended." },
      { order: 4, question: "If you double your speed, your braking distance increases by about:", options: ["2 times", "3 times", "4 times", "It stays the same"], correctIndex: 2, explanation: "Braking distance grows with the square of speed — double the speed is roughly four times the braking distance. That's why small increases in speed cost far more stopping distance than they feel like." },
      { order: 5, question: "A posted yellow advisory speed for a highway ramp is set for:", options: ["Loaded trucks", "Passenger cars — a loaded truck should be well below it", "Empty trucks only", "Wet conditions"], correctIndex: 1, explanation: "Advisory curve/ramp speeds are calculated for passenger cars. A high-center-of-gravity loaded truck should take them well below the posted number, and should slow BEFORE the curve, not in it." },
      { order: 6, question: "Compared with a loaded truck, an empty truck:", options: ["Always stops much shorter", "Can take LONGER to stop and is easier to skid — less traction over the drive tires", "Cannot skid", "Handles exactly the same"], correctIndex: 1, explanation: "With little weight over the drive axles, an empty/lightly loaded truck has less traction and can bounce, so it may take longer to stop and is easier to skid or jackknife. Light does not mean safe." },
      { order: 7, question: "Your largest blind spot is:", options: ["Directly in front of the hood", "Directly behind the trailer (up to ~200 ft)", "The left mirror", "Above the cab"], correctIndex: 1, explanation: "The area directly behind the trailer is the biggest No-Zone — one lane wide and up to about 200 feet back. Tap the brakes early to warn a tailgater and keep extra room to stop gently." },
      { order: 8, question: "A ball rolls into the street ahead. The defensive response is to:", options: ["Hold your speed — it's just a ball", "Cover the brake, ease off, and open space in case a child follows", "Swerve immediately into the next lane", "Honk and keep going"], correctIndex: 1, explanation: "A ball is a hazard cue — a child may follow. Cover the brake, reduce speed, and create room BEFORE it becomes an emergency. Most of the time nothing happens, and that's the point." },
      { order: 9, question: "\"Leave yourself an out\" means:", options: ["Always drive in the left lane", "Position the truck so you have somewhere to go if something goes wrong — avoid boxing yourself in", "Exit the highway at every chance", "Keep the doors unlocked"], correctIndex: 1, explanation: "The 4th Smith Key — keep an escape path (a shoulder, an open lane, a gap). Riding in a blind spot or trapped beside another truck takes your options away." },
    ],
  },

  // ───────────────────────────────────────────────────────── D2
  {
    slug: "intersections-turning-offtracking",
    title: "Intersections, Turning & Off-Tracking",
    category: "On-Road Safety",
    summary: "Where trucks and other road users collide most: why your trailer cuts the corner (off-tracking), how to make right and left turns without the squeeze, and how to read intersections, lane changes, merges, and roundabouts in a long vehicle.",
    version: "2",
    estMinutes: 22,
    passThreshold: 80,
    validityMonths: 12,
    sortOrder: 24,
    disclaimer: DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "Off-tracking — why the trailer cuts the corner",
        estMinutes: 5,
        bodyMarkdown: `In a turn, your trailer's rear wheels **do not follow the same path** as your steer tires — they track a **shorter, tighter arc, toward the inside of the turn.** This is **off-tracking**, and it is the single fact that explains almost every turning crash a truck is in.

**The tighter and slower the turn, the more the rear off-tracks inward.** Turn a corner the way a car does and your trailer tandems will climb the inside curb, crush whatever is on it, or sweep across the space where a cyclist or pedestrian is standing.

**So you turn wide — but wide *correctly*.** You keep the rear of the trailer near the curb or lane line you're turning around, and you let the tractor swing out only as much as needed to bring the trailer through. Swinging the *front* out early to "set up" is what invites a car up the inside — the exact spot the trailer is about to occupy.

**Tail swing.** As the tractor turns, the very back of the trailer can **swing the opposite way** — out toward the vehicle or object beside you. Check that your tail isn't about to strike a car, a pole, or a pump before you commit.

[[figure:offtracking-inside-arc]]

Off-tracking never goes away — every turn you make, plan for the trailer to cut inside your front wheels.`,
      },
      {
        order: 2,
        title: "Right turns without the squeeze",
        estMinutes: 6,
        bodyMarkdown: `The **right turn** is the most dangerous turn a truck makes, because of the **"right-turn squeeze"**: a driver swings wide-left first to make room, a car or cyclist slips up the open right side, and the trailer off-tracks back into them.

**Do it right:**

1. **Approach in the right lane**, as far right as is safe, so no one can get between your trailer and the curb.
2. **Keep the rear of the trailer close to the curb** as you begin the turn.
3. **Turn wide as you *complete* the turn**, not as you start it — swing out with the tractor only enough to bring the trailer around the corner.
4. If the corner is too tight to make from the right lane, it's better to **take up part of the next lane through the turn** (button-hook) than to leave a gap on your right. Don't create the gap that invites a squeeze.

**Before and during:** signal early, check your right mirror repeatedly for anyone trying to pass on the right, and go **slow** — off-tracking is worst in a tight, slow turn, so give yourself time to watch the tandems and the tail. **Before AND during the turn, clear the right-side crosswalk and bike lane** for a cyclist or pedestrian — the **right-hook** (a truck turning right across a cyclist or walker going straight) is the fatal urban-truck scenario.

[[figure:right-turn-button-hook-vs-squeeze]]

The rule of thumb: **never leave room on your right that a car or bike can dive into.** That gap is where the squeeze happens.`,
      },
      {
        order: 3,
        title: "Left turns, lane changes & merging",
        estMinutes: 5,
        bodyMarkdown: `**Left turns.** The mistake here is turning **too soon**: cut the corner early and your trailer's rear wheels off-track over the inside — clipping the curb, a median, or a car stopped in the opposing left-turn lane. **Reach the center of the intersection before you begin to turn**, so the trailer swings through the intersection, not over the corner. If there are two left-turn lanes, take the one that lets your trailer track through cleanly and stay in your lane on exit.

**Lane changes.** Signal **early** (long vehicles need more warning), check the mirror **and** the blind spot you can't see, and move over **slowly and smoothly** so a vehicle hidden in the No-Zone has time to react or clear. Remember **tail swing** — on a sharp move the back of the trailer sweeps the opposite way.

**Merging onto a highway.** Use the whole on-ramp to build speed toward the flow — a slow, heavy truck forcing into fast traffic is a crash setup. Signal, find your gap early, and merge at a matched speed. When *you* are the through traffic and a vehicle is merging, adjust — open space or move over one lane if it's clear — rather than holding your ground and forcing the squeeze.

[[figure:left-turn-reach-center]]

Every one of these is an off-tracking + blind-spot problem. Turn late enough, signal early enough, and go slow enough that the trailer has room to follow.`,
      },
      {
        order: 4,
        title: "Intersections & roundabouts",
        estMinutes: 5,
        bodyMarkdown: `Intersections are where paths cross, and a long, slow-to-stop truck has to be the careful one.

**Approaching an intersection:** cover the brake, **look left–right–left**, and watch for **red-light runners** — don't launch the instant your light turns green; make sure cross traffic has actually stopped. On a **stale green** (one that's been green a while), expect it to change and be ready to stop smoothly, remembering your stopping distance. Never enter an intersection you're not sure you can clear.

**Blocked or gridlocked:** don't pull into an intersection you can't get all the way across — a truck stopped across the box blocks everyone and can be caught by a changing light or a train at a nearby crossing. (For crossing railroad tracks safely, see the Railroad Crossings & Emergency Maneuvers course.)

**Roundabouts.** Take them **slow.** A truck may need to **straddle both lanes or use the paved truck apron** in the center to get the trailer around — that's what the apron is for. Signal your exit, watch for cars trying to squeeze alongside, and let the trailer track through. Other drivers should give a truck room in a roundabout; don't assume they will.

**Left turn across traffic** (no signal): you need a **much larger gap** than a car does, because you accelerate slowly and clear the intersection slowly. Wait for the big gap; don't take the car-sized one.

[[figure:roundabout-truck-apron]]`,
      },
    ],
    questions: [
      { order: 1, question: "\"Off-tracking\" means that in a turn, the trailer's rear wheels:", options: ["Follow the exact same path as the steer tires", "Track a tighter path toward the INSIDE of the turn", "Swing wide to the outside", "Lift off the ground"], correctIndex: 1, explanation: "The rear wheels follow a shorter, tighter arc toward the inside of the turn. The tighter and slower the turn, the more the rear cuts inward — which is why you must turn wide (correctly) and watch the tandems." },
      { order: 2, question: "The \"right-turn squeeze\" happens when a truck driver:", options: ["Approaches in the right lane and keeps the trailer near the curb", "Swings wide LEFT first, leaving a gap a car or cyclist fills on the right", "Turns too slowly", "Uses the truck apron"], correctIndex: 1, explanation: "Swinging left to 'set up' opens the right side; a car or cyclist slips in, then the trailer off-tracks back into them. Approach right, keep the rear near the curb, and turn wide as you COMPLETE the turn." },
      { order: 3, question: "To avoid off-tracking over the inside corner on a LEFT turn, you should:", options: ["Turn as soon as you enter the intersection", "Reach the center of the intersection before beginning the turn", "Turn from the right lane", "Accelerate hard through it"], correctIndex: 1, explanation: "Turning too soon lets the trailer's rear wheels cut over the inside curb/median. Reach the center of the intersection first so the trailer tracks through, not over the corner." },
      { order: 4, question: "Your light just turned green at a busy intersection. You should:", options: ["Accelerate immediately to clear it fast", "Look left–right–left and make sure cross traffic has stopped before proceeding", "Assume all cross traffic has stopped", "Honk and go"], correctIndex: 1, explanation: "Watch for red-light runners — confirm cross traffic has actually stopped before you commit a slow-starting, slow-stopping truck into the intersection." },
      { order: 5, question: "In a roundabout, a truck may need to:", options: ["Fit entirely in one narrow lane", "Straddle both lanes or use the center truck apron to bring the trailer around", "Stop in the middle", "Reverse if it doesn't fit"], correctIndex: 1, explanation: "The paved apron in the center exists for exactly this — a truck often has to straddle lanes / use the apron so the trailer tracks around. Go slow, signal your exit, and watch for cars alongside." },
      { order: 6, question: "The back of the trailer swinging OUT toward a vehicle beside you as the tractor turns is called:", options: ["Off-tracking", "Tail swing", "Jackknifing", "Understeer"], correctIndex: 1, explanation: "Tail swing — as the tractor turns, the rear of the trailer can sweep the opposite way, out toward whatever is beside you. Check that your tail won't strike a car, pole, or pump before committing." },
      { order: 7, question: "You're turning left across oncoming traffic (no green arrow). Compared to a car, you need:", options: ["The same size gap", "A smaller gap because you're more visible", "A much larger gap — you accelerate and clear slowly", "No gap if you signal"], correctIndex: 2, explanation: "A heavy truck accelerates slowly and takes longer to clear the intersection, so it needs a much bigger gap than a car. Wait for the large gap; don't take the car-sized one." },
      { order: 8, question: "The corner is too tight to complete a right turn from the right lane alone. The better choice is to:", options: ["Swing wide left first to set up", "Take up part of the next lane through the turn (button-hook) rather than leave a gap on your right", "Skip the turn", "Turn fast to get it over with"], correctIndex: 1, explanation: "Button-hooking into part of the adjacent lane is safer than creating a right-side gap that invites the squeeze. Never leave room on your right that a car or bike can dive into." },
    ],
  },

  // ───────────────────────────────────────────────────────── D3
  {
    slug: "rollover-prevention",
    title: "Rollover Prevention & Load Stability",
    category: "On-Road Safety",
    summary: "Why loaded trucks roll — a high center of gravity, curve and ramp speed, and load height/shift — and how to prevent it: slow before the curve, keep the load low and secure, and never trust a posted advisory speed made for cars.",
    version: "2",
    estMinutes: 20,
    passThreshold: 80,
    validityMonths: 12,
    sortOrder: 25,
    disclaimer: DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "Why trucks roll",
        estMinutes: 5,
        bodyMarkdown: `A rollover is one of the most survivable-to-prevent, hardest-to-recover crashes a truck has — and the cause is usually the driver, not the truck.

**Most rollovers are driver error.** FMCSA's rollover research finds that **over 78% of truck rollovers involve driver behavior** — most often **too fast for a curve or ramp**, and **over-steering / over-correcting.** These are choices, which means they're preventable.

**A truck has a high center of gravity (CG).** A loaded van or reefer carries weight **up high**, so it takes far **less sideways force to tip a truck than a car.** You can be at a speed that feels fine to your hands and still be close to the point where the trailer lifts a wheel — and by the time you feel it, it's often too late to stop it.

**You may not feel it coming.** In many rollovers the trailer starts to go over **before the tractor gives the driver a clear warning.** That is why rollover control is about **prevention**, not reaction — you set your speed before the curve, because in the curve there may be no save.

**Belt up.** Roughly **half of the truck drivers killed in rollovers were not wearing a seat belt.** The belt is your last line of defense when everything else has failed — wear it every mile.

[[figure:high-cg-tip-threshold]]

> ` + DISCLAIMER,
      },
      {
        order: 2,
        title: "Curves and ramps — the speed that flips you",
        estMinutes: 5,
        bodyMarkdown: `The classic rollover is a loaded truck on a **highway exit ramp** or a **curve**, taken a few miles per hour too fast.

**The posted advisory (yellow) speed is for cars.** That number is calculated for a passenger vehicle with a low center of gravity. A loaded truck should be **well below** it — often **5 to 15 mph slower** for a gentle curve. On a **tight, downhill, or decreasing-radius ramp**, FMCSA guidance is to cut to roughly **one-third to one-half below the posted advisory**.

**Slow down BEFORE the curve, on the straight.** Braking hard *in* the curve shifts weight and can trip the rollover or start a skid. Get your speed down on the approach, then hold a steady, gentle throttle through the arc.

**A curved ramp tightens.** Many exit ramps **decrease in radius** as they go — it gets tighter after you've committed. Enter slow enough that you still have margin if the curve keeps tightening; you can always add a little speed, but you can't un-roll a trailer.

**Don't over-steer or jerk the wheel.** A sudden swerve — for a merging car, a pothole, a wandering wheel onto the shoulder — can start a rollover on its own, **even on flat, straight road: a hard enough steer or counter-steer will tip a high-CG truck with no ramp or curve involved.** Ease back on smoothly; a quick correction at speed is how a recoverable drift becomes a rollover.

[[figure:ramp-decreasing-radius]]

The margin that saves you is set **before** the curve. Once you're in it too fast, there may be nothing left to do.`,
      },
      {
        order: 3,
        title: "Load height, distribution & shift",
        estMinutes: 5,
        bodyMarkdown: `Your rollover risk is packed at the dock, before you ever turn a wheel.

**Keep the center of gravity low.** Load **heavy items low and light items high**, not the other way around. A tall, top-heavy load — or a light load stacked high — raises the CG and lowers the speed at which the truck will tip.

**Center and balance the load.** Weight shoved to one side raises the rollover risk toward that side and can also overload one set of tires. Balance side-to-side and keep it within your axle limits.

**Secure it so it can't move.** A load that **shifts** in a curve suddenly moves the CG at the worst possible moment. Securement (its own course) isn't just about the load blowing off — a shifting load is a rollover cause. Block, brace, and tie so nothing moves.

**Liquid surge.** If you ever move a tank or a partially filled liquid load, the liquid **sloshes** — surging forward under braking and side-to-side in a turn, shoving the truck around. Partial loads surge the most. Treat any liquid or partial-liquid load with extra following distance and much slower, smoother inputs.

**Know it's higher today.** A high, dense reefer or dry-van load rolls more easily than an empty or a low, dense one. A **fully loaded high trailer is roughly 10 times more likely to roll than an empty one** — but an **empty truck takes LONGER to stop** (less weight over the tires means less traction). Different failure, same lesson: **match your speed to the load you're carrying today** — don't drive every load the same.

[[figure:load-cg-low-vs-high]]`,
      },
      {
        order: 4,
        title: "If it starts to go — and how to build the habit",
        estMinutes: 4,
        bodyMarkdown: `**Prevention is the only reliable control** — but know the response and build the habits that keep you out of it.

**If a wheel drops onto a soft shoulder,** don't jerk it back onto the pavement at speed — that abrupt steer is a classic rollover/loss-of-control trigger. **Ease off** the throttle, hold the wheel straight, let the truck slow, then steer back gently when speeds are low and it's safe.

**If the trailer begins to tip or you feel it going light,** avoid a hard, sudden counter-steer. Smooth is survival; a violent correction usually makes it worse. But understand the honest truth from Lesson 1: in a real rollover the window to react is often gone — which is why the save is the speed you chose *before* the curve.

**The habits that prevent rollovers:**

- Enter every ramp and curve **below** the posted advisory speed, braking on the approach.
- Keep the load **low, centered, and secured.**
- Add margin for a **high or shifting load**, for **wet or windy** conditions, and for **partial liquid** loads.
- **No sudden steering** at speed — ease, don't jerk.
- **Wear your belt** every mile.

Every rollover you never have protects the driver, the freight, and your carrier's safety and claims record — which feeds the **SRL Compass Score** and the freight it unlocks.`,
      },
    ],
    questions: [
      { order: 1, question: "The large majority of truck rollovers are caused by:", options: ["Mechanical failure", "Driver behavior — most often too fast for a curve/ramp and over-steering", "Other drivers", "Tire blowouts"], correctIndex: 1, explanation: "FMCSA's research finds most rollovers involve driver error — chiefly excess speed for a curve or ramp and over-correcting. That makes them preventable choices." },
      { order: 2, question: "A yellow advisory speed posted for a curve or exit ramp is set for:", options: ["Loaded trucks", "A passenger car — a loaded truck should be well below it", "Empty trucks", "Wet roads"], correctIndex: 1, explanation: "Advisory speeds assume a low-CG passenger car. A loaded truck's high center of gravity means it should take the curve/ramp well below that number — often 5–15 mph slower." },
      { order: 3, question: "Compared with a car, a loaded truck tips over:", options: ["With much more sideways force", "With far LESS sideways force — its center of gravity is high", "Only when empty", "Never on a paved road"], correctIndex: 1, explanation: "A loaded truck carries weight high, so it takes far less lateral force to tip than a car. You can be near the tip point at a speed that still feels fine at the wheel." },
      { order: 4, question: "The right time to reduce speed for a curve is:", options: ["In the middle of the curve", "Before the curve, on the straight approach", "After you exit the curve", "Only if it feels tight"], correctIndex: 1, explanation: "Braking hard IN the curve shifts weight and can trip a rollover or skid. Set your speed on the straight approach, then hold a steady, gentle throttle through the arc." },
      { order: 5, question: "To keep the center of gravity low, you load:", options: ["Heavy items high, light items low", "Heavy items low, light items high", "Everything on one side", "Everything as high as it fits"], correctIndex: 1, explanation: "Heavy low, light high keeps the CG down. A tall or top-heavy load — even a light load stacked high — raises the CG and lowers the speed at which the truck will tip." },
      { order: 6, question: "Your right wheels drop onto a soft shoulder at highway speed. You should:", options: ["Jerk the wheel hard back onto the pavement", "Ease off the throttle, hold straight, slow down, then steer back gently", "Brake hard immediately", "Accelerate to pull out"], correctIndex: 1, explanation: "A hard, abrupt steer back onto the pavement at speed is a classic rollover/loss-of-control trigger. Ease off, keep it straight, let it slow, then ease back on when it's safe." },
      { order: 7, question: "A partially filled liquid load is more dangerous because it:", options: ["Is lighter", "Surges — sloshing forward under braking and side-to-side in turns, shoving the truck", "Can't shift", "Lowers the center of gravity"], correctIndex: 1, explanation: "Liquid surge shoves the truck around, and partial loads surge the most. Add following distance and use much slower, smoother inputs with any liquid or partial-liquid load." },
      { order: 8, question: "Roughly what share of truck drivers killed in rollovers were NOT belted?", options: ["Almost none", "About half", "All of them", "Only new drivers"], correctIndex: 1, explanation: "About half of the truck drivers killed in rollovers weren't wearing a seat belt. The belt is your last defense when prevention has failed — wear it every mile." },
    ],
  },

  // ───────────────────────────────────────────────────────── D4
  {
    slug: "vehicle-systems-malfunctions",
    title: "Vehicle Systems & Diagnosing Malfunctions",
    category: "Vehicle & Cargo Safety",
    summary: "The knowledge under the pre-trip: how air brakes, tires, the drivetrain, steering, and coupling actually work — and how to recognize a malfunction by its warning light, sound, smell, or feel before it strands you or causes a crash.",
    version: "2",
    estMinutes: 24,
    passThreshold: 80,
    validityMonths: 12,
    sortOrder: 26,
    disclaimer: DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "Air brakes — how they actually work",
        estMinutes: 6,
        bodyMarkdown: `Almost every heavy truck stops on **air brakes**, and understanding them is what turns your pre-trip from a ritual into real safety.

**The basics.** An engine-driven compressor pushes air into storage tanks. A **governor** controls it: the compressor stops pumping at the **cut-out** pressure (about **125 psi**) and starts again at the **cut-in** (about **100 psi**). When you press the pedal, air applies the brakes; release, and it lets them off.

**The warnings and the fail-safe.** A **low-air warning** (light and buzzer) must activate **at or before 55 psi (49 CFR 393.51 — 55 psi, or ½ the governor cutout, whichever is less)**; the CDL manual teaches **~60 psi** as the practical trigger. If it comes on, stop safely now, because you are running out of braking air. Trucks carry **spring brakes** for parking and emergency: as air pressure falls (typically somewhere around **20–45 psi**), the springs **apply the brakes automatically** — so a total loss of air stops the truck rather than leaving it with none. That's the fail-safe, not a normal way to stop.

**ABS — anti-lock braking.** ABS keeps the wheels from locking up so you keep **steering control** in hard or slick braking. With ABS you **brake firmly and HOLD — do not pump.** An **ABS lamp that stays lit** means the ABS isn't working: you still have your normal brakes, but get the fault fixed.

**Two things that get drivers killed:**
- **Brake fade on long downgrades.** Riding the service brakes overheats them until they stop working. Use a **low gear and the engine brake/retarder** to hold your speed; save the service brakes for real slowing.
- **Water/oil in the tanks.** Drain the tanks (or trust the automatic dryer) so moisture doesn't freeze a valve or foul the system.

**Adjustment.** Brakes work through **slack adjusters**; over-travel of the pushrod means the brakes are out of adjustment and won't deliver full force. As a reference, a standard **Type 30 clamp-type brake chamber's pushrod stroke limit is 2 inches**, and a **long-stroke Type 30 is 2.5 inches** — past that the brake is out of adjustment. And under the CVSA out-of-service criteria, if **20% of a vehicle's brakes are defective or out of adjustment, the whole vehicle is placed out of service.** That's why the pre-trip brake checks and the CVSA inspection look hard at brake adjustment — see the Pre-Trip and Roadside Inspections courses for the step-by-step checks.

[[figure:air-brake-system-flow]]

> ` + DISCLAIMER,
      },
      {
        order: 2,
        title: "Tires, wheels & the drivetrain",
        estMinutes: 6,
        bodyMarkdown: `**Tires** are the only thing between you and the road, and a tire failure at speed is violent.

- **Tread depth:** at least **4/32 inch** on the **steer** tires and **2/32 inch** on all others. Less than that is out of service.
- **Inflation:** run the pressure on the tire/placard. **Under-inflation** builds heat and is the leading cause of blowouts; check with a **gauge**, not a thumb or a boot.
- **Condition:** no cuts, bulges, exposed cords, or mismatched sizes/types on the same axle.
- **A blowout:** hold the wheel firmly, **stay off the brake**, let off the throttle, keep straight, and slow gradually — braking hard on a blown tire can spin you.

**Wheels and rims:** watch for cracks, missing or loose lug nuts (rust streaks or shiny threads are a tell), and bent rims. A wheel that comes off is a projectile.

**Drivetrain.** The **engine** turns the wheels through the **clutch, transmission, driveshaft, and axles.** You don't repair these on the road, but you must recognize trouble: slipping or grabbing clutch, hard shifting or grinding, a vibration or clunk in the driveline, low power, or overheating on the gauge. A coolant or oil temperature climbing toward the red, or oil pressure dropping, means **shut it down before you destroy the engine.**

[[figure:tire-tread-min-depths]]`,
      },
      {
        order: 3,
        title: "Steering, suspension & coupling",
        estMinutes: 5,
        bodyMarkdown: `**Steering.** Excess **play** at the wheel (more than about **10 degrees**, roughly 2 inches at the rim of a 20-inch wheel, before the front wheels move) means worn linkage — get it checked. Watch for a truck that wanders, pulls to one side, or shimmies.

**Suspension.** Cracked or shifted **leaf springs**, a broken **spring hanger**, loose **U-bolts**, or a leaking **air bag/shock** change how the truck handles and can drop an axle. Look under the truck at the pre-trip.

**The coupling — where the trailer meets the tractor.** This connection is life-or-death:
- The **fifth wheel** locks around the trailer's **kingpin**; the locking jaws must be **fully closed** around the pin, not on the "lip."
- After coupling, do a **tug test** (pull gently forward against the locked trailer brakes) to confirm the lock. Then look at the connection: the jaws closed, the release handle in the locked position, **no gap** between the fifth wheel and the trailer apron.
- **Air lines (glad hands)** and the **electrical cord** must be connected, and the lines routed so they can't be crushed or dragged. The **tractor protection valve** and **trailer air supply** keep the tractor's air if the trailer breaks away.

[[figure:fifth-wheel-kingpin-lock]]

A trailer that drops or comes uncoupled is one of the worst outcomes on the road — the tug test and the visual under the fifth wheel are non-negotiable.`,
      },
      {
        order: 4,
        title: "Recognizing a malfunction on the road",
        estMinutes: 5,
        bodyMarkdown: `Between inspections, the truck talks to you — through your **gauges, warning lights, sounds, smells, and the feel of the controls.** Knowing the language is how you catch a failure before it becomes a breakdown or a crash.

**Gauges and lights:** a **low-air warning**, a climbing **coolant or oil temperature**, a **dropping oil pressure**, an **ABS light** that stays on, a **check-engine/stop-engine** lamp, or a **charging** fault — each is the truck telling you something is wrong. A **stop-engine** light means stop and shut down.

**Sounds:** a new squeal, grinding, knocking, hissing air (a leak), or a rhythmic thump (a tire) — investigate, don't ignore.

**Smells:** hot rubber or burning (overheated brakes or an electrical fault), coolant (sweet), or fuel/oil — pull over and look.

**Feel:** a soft or fading brake pedal, a pull, a shimmy, a wander, a vibration that wasn't there this morning. Your hands and the seat feel a problem before a gauge does.

**When in doubt, stop safely and check.** If it's a defect that affects safe operation, the truck is **out of service** until it's fixed — and you record it on your **DVIR** (post-trip inspection report) so it gets repaired and the next driver knows. "It was making that noise all day" is never a good thing to say after a breakdown or a crash.

[[figure:dash-warning-lights]]`,
      },
    ],
    questions: [
      { order: 1, question: "The low-air-pressure warning must come on at or before:", options: ["85 psi", "55 psi", "20 psi", "125 psi"], correctIndex: 1, explanation: "The low-air warning (light + buzzer) must activate at or before 55 psi. If it comes on, stop safely — you're running out of braking air. (Governor cut-out is ~125 psi, cut-in ~100 psi.)" },
      { order: 2, question: "As air pressure falls toward ~20–45 psi, the spring (parking/emergency) brakes:", options: ["Release completely", "Apply automatically — the fail-safe", "Stay exactly where they are", "Only work if you pull the valve"], correctIndex: 1, explanation: "Spring brakes apply automatically as air drops into that range, so a total loss of air stops the truck instead of leaving it with no brakes. It's a fail-safe, not a normal stopping method." },
      { order: 3, question: "Minimum tread depth is:", options: ["2/32\" on all tires", "4/32\" on the steer axle, 2/32\" on all others", "6/32\" everywhere", "There is no minimum"], correctIndex: 1, explanation: "At least 4/32\" on the steer (front) tires and 2/32\" on all others; below that is out of service. Check with a gauge and watch inflation — underinflation builds heat and causes blowouts." },
      { order: 4, question: "You have a front-tire blowout at highway speed. You should:", options: ["Brake hard immediately", "Hold the wheel firmly, stay off the brake, ease off the throttle, and slow gradually", "Steer sharply onto the shoulder", "Accelerate to keep control"], correctIndex: 1, explanation: "Hard braking on a blown tire can spin the truck. Grip the wheel, keep straight, get off the throttle, and let it slow before easing off the road." },
      { order: 5, question: "To hold your speed on a long downgrade and avoid brake fade, you:", options: ["Ride the service brakes steadily", "Use a low gear and the engine brake/retarder, saving the service brakes", "Coast in neutral", "Pump the brakes hard the whole way"], correctIndex: 1, explanation: "Riding the service brakes overheats them until they fade to nothing. Select a safe low gear before the grade and let the engine brake/retarder hold you; use the service brakes only for extra slowing." },
      { order: 6, question: "After coupling to a trailer, the tug test is:", options: ["Optional if the trailer looks connected", "Pulling gently forward against the locked trailer brakes to confirm the fifth wheel is locked on the kingpin", "Slamming the trailer to seat it", "Checking the tire pressure"], correctIndex: 1, explanation: "A gentle forward pull against the locked trailer brakes confirms the fifth-wheel jaws are locked around the kingpin (not on the lip). Then look under: jaws closed, handle locked, no gap between the fifth wheel and the trailer apron." },
      { order: 7, question: "A stop-engine warning light comes on. You should:", options: ["Keep driving to the next stop", "Stop safely and shut the engine down", "Ignore it if the truck still runs", "Rev the engine to clear it"], correctIndex: 1, explanation: "A stop-engine lamp means shut it down before you destroy the engine (e.g., low oil pressure or overheating). Don't try to nurse it down the road." },
      { order: 8, question: "You find a defect that affects safe operation during your trip. You:", options: ["Finish the load and mention it later", "Take the truck out of service until it's repaired and record it on your DVIR", "Only note it if a cop stops you", "Fix it yourself at the next exit"], correctIndex: 1, explanation: "A safety-affecting defect makes the truck out of service until repaired, and it goes on your post-trip DVIR so it's fixed and the next driver is warned. Never run a known safety defect." },
      { order: 9, question: "Under the CVSA out-of-service criteria, a whole vehicle is placed out of service when:", options: ["a single marker light is burned out", "20% of its brakes are defective or out of adjustment", "the fuel tank is under a quarter full", "one tire is dirty"], correctIndex: 1, explanation: "If 20% of a vehicle's brakes are defective or out of adjustment, the entire vehicle is placed out of service. Pushrod stroke is the tell: a standard Type 30 chamber's limit is 2 inches (2.5 inches for a long-stroke Type 30) — past that the brake is out of adjustment." },
    ],
  },

  // ───────────────────────────────────────────────────────── D5
  {
    slug: "driver-wellness-health",
    title: "Driver Wellness & Health",
    category: "Driver Qualification & Health",
    summary: "Staying healthy enough to keep your medical card and your career: eating and moving on the road, managing blood pressure and blood sugar, protecting your mental health, and avoiding the injuries and chronic disease the job is known for.",
    version: "2",
    estMinutes: 20,
    passThreshold: 80,
    validityMonths: 12,
    sortOrder: 27,
    disclaimer: DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "Your health is your license",
        estMinutes: 5,
        bodyMarkdown: `Your **DOT medical card** — and therefore your ability to work — depends on your health. The lifestyle of the job (long hours seated, truck-stop food, disrupted sleep, stress) drives the exact conditions the physical checks: **high blood pressure, high blood sugar/diabetes, obesity, heart disease, and sleep apnea.** Managing them isn't optional wellness advice; it's how you keep passing the exam and stay in the seat.

**Blood pressure.** Hypertension is common in drivers and directly affects certification. Well-controlled pressure can mean a normal certification cycle; uncontrolled can **shorten your card or disqualify you** until it's managed. As a general guide, **higher stages of hypertension shorten your certification period** (often to a year or less), and severe, uncontrolled pressure can disqualify you until it's brought down — but **the medical examiner makes the certification decision, and these thresholds are advisory guidelines, not a hard pass/fail table.** Know your numbers, take prescribed medication consistently, and cut back on the salt and energy drinks that spike it.

**Blood sugar / diabetes.** Diabetes can be managed and still allow certification, but it must be **under control and documented.** **Insulin-treated diabetes no longer requires a federal exemption** — a stable driver is certifiable when the **treating clinician completes the MCSA-5870 form** confirming the diabetes is well controlled. Watch for the warning signs of a blood-sugar low / **hypoglycemia** (shakiness, confusion, sweating) — never drive through one. Keep it controlled and documented.

**Weight and heart health.** Carrying extra weight raises blood pressure, blood sugar, apnea risk, and heart-attack risk — the leading medical causes of a driver losing certification. Small, sustained changes beat crash diets.

**Tobacco and vaping.** Smoking and vaping **raise your blood pressure** and drive **COPD and cardiovascular disease** — two of the biggest long-term threats to both your health and your medical card. If you use tobacco, **quitting is the single most impactful health change** you can make; ask your doctor about help.

**And know what the DOT physical is not.** The DOT exam is a **fitness-for-duty screen, not your check-up** — it decides whether you can safely hold the wheel, not whether you're actually healthy. See a **primary-care doctor between physicals** for real preventive care: routine bloodwork, screenings, and catching problems early, before they ever threaten your card.

The theme: the conditions that end driving careers are largely **preventable and manageable.** Treat your health the way you treat your CDL and your logs — as a thing you protect on purpose.

[[figure:med-card-health-drivers]]

> ` + DISCLAIMER,
      },
      {
        order: 2,
        title: "Eating and moving on the road",
        estMinutes: 5,
        bodyMarkdown: `You can eat and move well from a truck — it just takes a plan, because the default (fried food, sodas, energy drinks, and 11 hours in the seat) works against you.

**Eating:**
- Keep a **cooler** with real food — fruit, nuts, jerky, yogurt, pre-made meals — so you're not at the mercy of the fried counter.
- **Water first.** Dehydration causes fatigue, headaches, and poor focus; energy drinks and constant soda spike blood sugar and blood pressure. Aim to keep water in reach and sip through the day.
- Watch **portion size** and the late-night heavy meal that wrecks your sleep.

**Moving:**
- You lose ground sitting all day. Build in **short movement** — a brisk walk around the lot at fuel and rest stops, stretching, bodyweight exercises, a resistance band you keep in the cab.
- Even **10–15 minutes** of walking a few times a day meaningfully offsets the seated hours and helps blood pressure, weight, mood, and alertness.
- Prolonged sitting also raises your risk of a **deep-vein thrombosis (DVT)** — a blood clot in the leg that can become life-threatening if it breaks loose and travels. **Move your legs, hydrate, and don't sit motionless for hours** on end; the walk at every stop protects more than your waistline.

None of this requires a gym. It requires a **cooler, a water bottle, and the decision to walk instead of sit** at every stop. Done for months, it's the difference between passing your physical and losing it.

[[figure:cooler-and-walk-plan]]`,
      },
      {
        order: 3,
        title: "Sleep, stress & mental health",
        estMinutes: 5,
        bodyMarkdown: `**Sleep is the foundation.** Fatigue is covered in depth in the Distracted & Fatigued Driving course — the wellness angle is: protect your sleep like a health asset. Get real, dark, quiet rest; treat **sleep apnea** (loud snoring, gasping, waking unrefreshed, daytime sleepiness) because untreated apnea both wrecks your health and can affect your medical certification. If you suspect it, get evaluated — it's treatable.

**Mental health is real health.** The job is **isolating** — long stretches alone, missed family time, financial and schedule stress. Chronic stress raises blood pressure and drives poor eating, drinking, and sleep. Depression and anxiety are common and treatable.

- **Stay connected** — regular calls home, a routine, contact with other drivers.
- **Recognize the warning signs** in yourself: persistent low mood, hopelessness, sleeplessness, heavy drinking, or thoughts of self-harm. These are medical issues, not weakness.
- **Reach out.** Talk to family, a doctor, your carrier's resources, or the **988 Suicide & Crisis Lifeline** (call or text **988**) if you're in crisis. And remember the drug/alcohol rules — self-medicating with alcohol or drugs risks your career on top of your health.

Taking care of your head keeps you safe on the road and in the seat for the long run.

[[figure:driver-mental-health-connect]]`,
      },
      {
        order: 4,
        title: "Staying injury-free",
        estMinutes: 4,
        bodyMarkdown: `The job's day-to-day injuries are mostly preventable — and they're covered hands-on in the Workplace & Dock Safety course. The wellness habits that keep you off the injured list:

- **Lift with your legs, not your back**, keep the load close, and don't twist — most driver back injuries come from securing freight, handling tarps/chains, or grabbing a heavy bag, not from a crash.
- **Three points of contact** getting in and out of the cab and trailer — a slip off the steps is one of the most common driver injuries.
- **Hydrate and manage heat and cold** — heat exhaustion in a hot trailer or on a summer dock, and cold injury in winter, both sneak up on you.
- **Stretch** before and after long stints in the seat to protect your back, hips, and shoulders.
- **Wear the seat belt** — the single biggest thing you can do to survive a crash.

Your body is your equipment. Maintain it the way you maintain the truck, and it'll keep you earning for decades instead of ending the career early.`,
      },
    ],
    questions: [
      { order: 1, question: "Why does driver health directly affect your career?", options: ["It doesn't — only driving record matters", "The DOT medical card depends on it; conditions like high blood pressure, diabetes, apnea, and heart disease can shorten or end certification", "Only if you drive hazmat", "Only after age 65"], correctIndex: 1, explanation: "The DOT physical checks blood pressure, blood sugar, weight, heart, and apnea — the very conditions the job's lifestyle drives. Managing them is how you keep passing the exam and stay in the seat." },
      { order: 2, question: "The best default beverage to keep in reach on the road is:", options: ["Energy drinks", "Soda", "Water", "Coffee only"], correctIndex: 2, explanation: "Dehydration causes fatigue, headaches, and poor focus; energy drinks and soda spike blood sugar and blood pressure. Keep water in reach and sip through the day." },
      { order: 3, question: "Untreated sleep apnea is a concern because it:", options: ["Has no health effect", "Wrecks your health AND can affect your medical certification — and it's treatable", "Only matters for team drivers", "Improves alertness"], correctIndex: 1, explanation: "Signs include loud snoring, gasping, and daytime sleepiness. Untreated apnea harms your health and can affect certification — get evaluated, because it's treatable." },
      { order: 4, question: "You notice persistent low mood, sleeplessness, and heavy drinking creeping in. This is:", options: ["Weakness to push through alone", "A medical issue — reach out to family, a doctor, or 988; self-medicating with alcohol/drugs risks your career too", "Normal, ignore it", "Only a problem if you crash"], correctIndex: 1, explanation: "Mental health is real health. The job is isolating and stressful; depression/anxiety are common and treatable. Stay connected, watch the warning signs, and reach out — the 988 Suicide & Crisis Lifeline is call-or-text 988. Self-medicating also risks the drug/alcohol rules." },
      { order: 5, question: "Most driver back injuries come from:", options: ["Crashes only", "Securing freight, handling tarps/chains, and lifting — so lift with your legs, keep the load close, don't twist", "Sitting still", "Nothing preventable"], correctIndex: 1, explanation: "The everyday injuries are from handling freight and gear, not crashes. Lift with your legs, keep the load close, avoid twisting, and use three points of contact getting in and out." },
      { order: 6, question: "Realistically, staying active on the road looks like:", options: ["Nothing is possible from a truck", "Short walks around the lot at every stop, stretching, bodyweight/band exercises — 10–15 min a few times a day", "A full gym workout daily", "Only on home time"], correctIndex: 1, explanation: "No gym required — a cooler, a water bottle, and walking instead of sitting at every stop, a few times a day, meaningfully offsets the seated hours." },
      { order: 7, question: "Well-controlled high blood pressure vs. uncontrolled, for your medical card:", options: ["Makes no difference", "Controlled can mean a normal certification cycle; uncontrolled can shorten your card or disqualify you until managed", "Always disqualifies you either way", "Only matters over age 70"], correctIndex: 1, explanation: "Blood pressure directly affects certification length. Know your numbers, take medication consistently, and cut the salt and energy drinks that spike it." },
      { order: 8, question: "The single biggest thing you can do to survive a crash is:", options: ["Drive a newer truck", "Wear your seat belt", "Carry more insurance", "Drive slower only in town"], correctIndex: 1, explanation: "The seat belt is your last and best defense in any crash or rollover — wear it every mile." },
      { order: 9, question: "For a driver who treats diabetes with insulin, federal medical certification now:", options: ["is permanently barred", "no longer requires a federal exemption — a stable driver is certifiable when the treating clinician completes the MCSA-5870 form", "requires a separate CDL endorsement", "is decided only by the state, not the DOT exam"], correctIndex: 1, explanation: "Insulin-treated diabetes no longer needs a federal exemption. A driver whose diabetes is well controlled is certifiable when the treating clinician completes the MCSA-5870 confirming control. Keep it documented and watch for hypoglycemia — never drive through a blood-sugar low." },
      { order: 10, question: "How should you think about your DOT physical vs. seeing a regular doctor?", options: ["the DOT physical is a full check-up, so a regular doctor is unnecessary", "the DOT physical is a fitness-for-duty screen, not a check-up — see a primary-care doctor between physicals for real preventive care", "you only need a doctor if you fail the DOT physical", "regular doctor visits can disqualify your medical card"], correctIndex: 1, explanation: "The DOT exam decides whether you can safely hold the wheel — it is not your check-up. See a primary-care doctor between physicals for bloodwork, screenings, and early detection, so problems are caught before they ever threaten your card." },
    ],
  },

  // ───────────────────────────────────────────────────────── D6
  {
    slug: "night-reduced-visibility",
    title: "Night Operation & Reduced Visibility",
    category: "On-Road Safety",
    summary: "Driving when you can't see well: night vision and not overdriving your headlights, glare and the circadian low, fog/rain/snow/dust, and the night hazards — animals, pedestrians, impaired drivers — plus keeping your own truck visible.",
    version: "2",
    estMinutes: 18,
    passThreshold: 80,
    validityMonths: 12,
    sortOrder: 28,
    disclaimer: DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "Night vision and your headlights",
        estMinutes: 5,
        bodyMarkdown: `At night you can see far **less** than in daylight, yet the road looks deceptively calm. The single most important night rule handles that gap.

**Don't overdrive your headlights.** You must be able to **stop within the distance you can see ahead.** Low beams light roughly **250 feet**; high beams roughly **350–500 feet**. Here's the sobering math: a loaded truck's **~400+ ft stopping distance at 55 mph exceeds even the low end of the high-beam range** — so on a dark road at highway speed you can **outrun even your high beams**, and your **speed, not your headlights, is the real limit.** The fix: **use your high beams whenever it's legal and there's no oncoming traffic**, and when you can't (oncoming cars, fog, close following), **slow down** to match the distance you can actually see.

**Use high beams correctly.** Switch to high beams on dark open road; drop to **low beams** when you meet oncoming traffic (about **500 feet** away) or come up **behind** another vehicle (about **500 feet**), so you don't blind them. Dirty or misaimed headlights cut your seeing distance — keep the lenses clean.

**Give your eyes time.** It takes several minutes for your eyes to adapt to the dark, and a bright light resets it. Dim your dash, and don't stare into oncoming lights.

[[figure:overdriving-headlights]]

> ` + DISCLAIMER,
      },
      {
        order: 2,
        title: "Glare, fatigue & the circadian low",
        estMinutes: 4,
        bodyMarkdown: `**Glare recovery.** A blast of oncoming high beams can blind you for **several seconds** — long enough to cover the length of a football field at highway speed without really seeing. Don't look directly at oncoming lights; **glance toward the right edge of your lane** and use the lane line to steer until your eyes recover. If you're blinded, slow down.

**Low-angle sun at dawn and dusk** is its own blinding glare. Drop the **visor**, wear **sunglasses**, add following distance, and keep the **windshield clean inside and out** — a dirty windshield turns low sun into an opaque smear you can't see through at all.

**Night is fatigue's home turf.** Your body clock has a **window of circadian low (WOCL)**, roughly **midnight to 6 a.m.** (and a smaller dip mid-afternoon), when alertness bottoms out no matter how much you slept. Driving through the WOCL is when microsleeps and drift-offs happen. The Distracted & Fatigued Driving course covers the response — the night-specific version: if you're fighting your eyes at 3 a.m., the road is dark, and you're leaning on the rumble strip to stay awake, **that is the signal to stop**, not to push the last hour.

**Boredom and monotony** on an empty night highway also dull you. Keep your eyes moving, keep the cab cool, and don't rely on caffeine to replace sleep — it delays the crash, it doesn't prevent it.

[[figure:wocl-alertness-curve]]`,
      },
      {
        order: 3,
        title: "Fog, rain, snow and dust",
        estMinutes: 5,
        bodyMarkdown: `Reduced visibility isn't only night — weather can drop your sight to a few truck lengths in daylight.

**Fog (and smoke, heavy dust):**
- Use **low beams**, never high — high beams **reflect back off the fog** and blind you.
- **Slow way down** so you can stop within what you can see, and increase following distance.
- Use fog lights if equipped; turn on your **wipers/defroster**.
- If it's too thick to see safely, **get completely off the road** — all the way into a rest area or off the shoulder with lights and 4-ways on. A truck stopped on the fog line is a pile-up waiting to happen; drivers behind fixate on your taillights and drive right into you.

**Rain:** the first rain lifts oil to a slick surface; watch for **hydroplaning** (at speed on standing water the tires ride up and you lose steering and braking) — slow down, avoid puddles and ruts, and after a deep puddle, **dry your brakes** with light pressure.

**Snow/ice:** slow down long before you need to, no sudden inputs, watch for **black ice** on bridges and shaded spots (bridges freeze first). If the road is beating you, the professional call is to **shut down safely** rather than roll the truck into a ditch or a chain-reaction crash.

[[figure:fog-low-beams-pull-off]]`,
      },
      {
        order: 4,
        title: "Night hazards and being seen",
        estMinutes: 4,
        bodyMarkdown: `The dark hides specific threats — anticipate them.

- **Animals.** Dawn, dusk, and night are peak wildlife hours. Watch the road edges for **eye-shine**, slow near woods and crossing signs, and don't swerve violently for an animal — a controlled hit is usually safer than a rollover or a head-on.
- **Pedestrians and cyclists** are far harder to see at night, especially in dark clothing near shoulders, rural roads, and truck stops. Scan the edges, especially around lots and towns.
- **Impaired and drowsy drivers** cluster **late night**, especially weekends and bar-closing hours. A car weaving, drifting, or with no lights is a screaming hazard — give it room and don't be next to it.
- **Work zones at night** are common and dangerous — reduced lighting, shifted lanes, workers close to traffic. Slow down and expect the unexpected.

**Be seen.** Your conspicuity is your protection: keep all **lights, reflectors, and reflective tape clean** — a road-grimed trailer is nearly invisible at night, and the car that "came out of nowhere" often just never saw the dark trailer. **A night pre-trip must confirm that every marker, clearance, tail, and brake light actually works** — walk the rig with the lights on, and check the brake lights against a wall or reflection (or have someone press the pedal) before you roll; a single dead trailer light is a hole in your outline a car can drive into. Use your lights, signal early, and make sure the small vehicle can see the truck.

[[figure:night-conspicuity-reflectors]]`,
      },
    ],
    questions: [
      { order: 1, question: "\"Don't overdrive your headlights\" means:", options: ["Always use high beams", "Drive so you can stop within the distance your headlights let you see — slow down when you can't use high beams", "Drive faster at night", "Turn your lights off to see better"], correctIndex: 1, explanation: "Low beams light ~250 ft, and at 55 mph a loaded truck may need more than that to stop. Use high beams when legal and clear; when you can't (oncoming, fog, following), slow to match the distance you can actually see." },
      { order: 2, question: "In fog you should use:", options: ["High beams", "Low beams — high beams reflect back and blind you", "No lights", "Hazards only, no headlights"], correctIndex: 1, explanation: "High beams bounce off the fog and worsen your vision. Use low beams (and fog lights if equipped), slow way down, and if it's too thick to see, get completely off the road." },
      { order: 3, question: "You're blinded by oncoming high beams. You should:", options: ["Stare at their lights", "Look toward the right edge of your lane and use the lane line until your eyes recover; slow if needed", "Flash your high beams and speed up", "Close your eyes briefly"], correctIndex: 1, explanation: "Glare can blind you for several seconds. Don't look into the lights — glance to the right edge and steer by the lane line, and slow down while your eyes recover." },
      { order: 4, question: "The Window of Circadian Low (WOCL) — when alertness bottoms out — is roughly:", options: ["Noon to 2 p.m.", "Midnight to 6 a.m.", "6 p.m. to 9 p.m.", "There's no such window"], correctIndex: 1, explanation: "Your body clock hits its low from about midnight to 6 a.m. (with a smaller mid-afternoon dip). Microsleeps cluster here regardless of prior sleep — if you're fighting your eyes at 3 a.m., that's the signal to stop." },
      { order: 5, question: "A truck stopped on the fog line with taillights on is dangerous because:", options: ["It's perfectly safe", "Following drivers fixate on the taillights and drive right into it — get completely off the road", "It uses too much fuel", "It's illegal to stop anywhere"], correctIndex: 1, explanation: "In fog, drivers behind lock onto your taillights and follow them into you. If it's too thick to drive, get all the way off the road (into a rest area or well off the shoulder) with your 4-ways on." },
      { order: 6, question: "A deer runs into the road at night. The safer response is usually to:", options: ["Swerve hard to miss it", "Brake in a controlled way and take a controlled hit if needed, rather than swerve into a rollover or head-on", "Speed up", "Turn off your lights"], correctIndex: 1, explanation: "Violent swerving in a high-CG truck risks a rollover or crossing into oncoming traffic. Slow in a controlled way; a controlled hit is usually safer than losing the truck. Watch road edges for eye-shine near woods." },
      { order: 7, question: "Late-night, a car ahead is weaving and drifting across the lane. You should:", options: ["Pass close alongside it", "Assume it's an impaired/drowsy driver — give it lots of room and don't ride beside it", "Tailgate to hurry it up", "Flash your brights repeatedly"], correctIndex: 1, explanation: "Weaving, drifting, or no-lights cars cluster late night/weekends and are a major hazard. Give room, don't sit beside it, and keep your out." },
      { order: 8, question: "The best protection against \"the car that came out of nowhere\" at night is:", options: ["Driving faster to get ahead of traffic", "Keeping your lights, reflectors, and reflective tape clean so the truck is visible", "Using only low beams", "Nothing — it's unavoidable"], correctIndex: 1, explanation: "A road-grimed trailer is nearly invisible at night. Clean lights/reflectors/tape, early signals, and good lane position are your conspicuity — make sure the small vehicle can see the truck." },
    ],
  },

  // ───────────────────────────────────────────────────────── D7
  {
    slug: "external-communications-customer-service",
    title: "External Communications & Customer Service",
    category: "SRL Operational Excellence",
    summary: "You are the face of your carrier and SRL to everyone you meet: how you communicate with other drivers on the road, keep your cool when others don't (road rage), and represent the load professionally at the shipper and receiver.",
    version: "2",
    estMinutes: 16,
    passThreshold: 80,
    validityMonths: 12,
    sortOrder: 29,
    disclaimer: DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "Communicating with the road around you",
        estMinutes: 5,
        bodyMarkdown: `You "talk" to every driver near you without a word — through signals, lights, horn, and position. Clear communication prevents crashes; mixed signals cause them.

**Signal early and clearly.** A long vehicle needs more warning, so signal well before a turn, lane change, or merge, and make sure the signal is off after you complete it. A courtesy flash of the trailer lights (where customary) to let a passing truck know it's clear to move back in keeps traffic flowing and earns the same in return.

**Use the horn and lights right.** A light **tap** to alert someone drifting into you; the **horn** is a warning tool, not an insult. Hazards for a slow-down or a stop. High/low beams as covered in the night course.

**Position communicates intent.** Being in the correct lane early, holding a steady speed, and not weaving tells other drivers what you'll do. Erratic speed or lane wandering makes you unpredictable — and a truck's unpredictability scares the cars around it into bad moves.

**Be courteous.** Let merging traffic in when you safely can, don't block others in, and give room. Professional courtesy from a truck lowers everyone's stress and, honestly, changes how the public sees trucks.

[[figure:road-communication-signals]]

> ` + DISCLAIMER,
      },
      {
        order: 2,
        title: "Keeping your cool — road rage",
        estMinutes: 5,
        bodyMarkdown: `You drive an 80,000-pound vehicle. You cannot afford to lose your temper, and you can't control what other drivers do — only what you do.

**Don't take it personally, don't engage.** Cut off, tailgated, honked at, gestured at — let it go. Do **not** retaliate: no brake-checking, no blocking, no rolling coal, no gestures, no chasing. Escalating with a truck can turn a rude moment into a fatal crash or a lawsuit, and it's your career on the line, not theirs.

**De-escalate:** ease off, create space, and let the aggressive driver get away from you. If someone is raging at you, **avoid eye contact, keep your distance, and do not exit the vehicle.** If you feel genuinely threatened, drive to a public place (a truck stop, a police station) and call **911** — don't drive home or somewhere isolated.

**You represent more than yourself.** Your truck likely carries your carrier's name and DOT number, and it's moving an SRL load. One video of a truck driving aggressively does damage far beyond the moment. The professional move — every time — is to be the calm one.

**If you witness dangerous driving** (an impaired or reckless driver, a crash), you can report it safely: note the vehicle and location, and call it in when you can do so without adding to the danger.

[[figure:de-escalate-road-rage]]`,
      },
      {
        order: 3,
        title: "At the shipper, the receiver, and representing SRL",
        estMinutes: 4,
        bodyMarkdown: `At every dock you are the visible representative of your carrier **and** of SRL. The relationship that gets your carrier the next load is built here.

**Follow the facility's rules.** Every shipper and receiver has its own check-in, PPE, parking, and dock procedures — follow them without argument. Sign in, be where you're told, wear what's required, and stay out of restricted areas.

**Be professional and patient.** Show up clean and on time. Detention and long waits are frustrating, but the dock staff usually didn't cause them — stay courteous. If there's a real problem (a documentation issue, a refused load, an unsafe request), work it through **dispatch and SRL**, not a confrontation with the person at the window. (Being *forced* to do something unsafe is coercion — see that course.)

**Represent the brand.** How you treat the guard, the lumper, and the dock worker is how the shipper remembers "the SRL carrier." Courtesy and reliability turn a one-time load into a lane, and that consistency feeds your carrier's **SRL Compass Score** and its access to better, repeat freight.

**Don't discuss rates or business with facility or dock staff.** What you're paid, what the load is worth, or SRL's arrangement with the shipper is not dock conversation — keep it between you, your carrier, and SRL.

**Keep written communication professional.** Texts and messages to dispatch should be **factual and professional** — no venting, no all-caps rants. These messages are a **permanent record** that can end up in a dispute, a claim, or a file; write them like someone will read them back later, because someone might.

**Watch what you post.** Don't post rants, complaints about a shipper, or photos of your loads and routes on social media — you represent your carrier and SRL, and a public post (or a broadcast route) can do real damage or hand a thief the information to plan a theft (see the Cargo Theft & Security course).

**Communicate proactively.** Keep dispatch informed — arrival, delays, issues — so SRL can keep the shipper informed. Good communication is most of good customer service.`,
      },
    ],
    questions: [
      { order: 1, question: "The professional response to being cut off and honked at is to:", options: ["Brake-check them", "Let it go, create space, and not engage or retaliate", "Chase them down", "Block them from merging"], correctIndex: 1, explanation: "You can't control other drivers, only yourself. Retaliating with an 80,000-lb truck can turn a rude moment into a fatal crash or lawsuit — de-escalate, give room, and stay the calm one." },
      { order: 2, question: "Someone is enraged and following you aggressively. You should:", options: ["Pull over and confront them", "Drive home so they know where you live", "Avoid eye contact, keep distance, don't exit, and if threatened drive to a public place and call 911", "Speed up and outrun them"], correctIndex: 2, explanation: "Don't engage or go somewhere isolated. Keep distance, stay in the vehicle, and if you feel threatened head to a truck stop or police station and call 911." },
      { order: 3, question: "At a shipper or receiver, their check-in, PPE, and dock rules are:", options: ["Suggestions you can skip", "Rules you follow without arguing", "Only for new drivers", "Negotiable at the window"], correctIndex: 1, explanation: "Every facility has its own procedures — follow them. Sign in, wear required PPE, park and dock where told, and stay out of restricted areas." },
      { order: 4, question: "You should signal a turn or lane change:", options: ["At the last second", "Early and clearly, because a long vehicle needs more warning — and cancel it after", "Only if police are nearby", "Never, to avoid confusing others"], correctIndex: 1, explanation: "Signal well ahead so drivers have time to react to a long, slow-to-maneuver vehicle, and make sure it cancels after the maneuver. Predictable communication prevents crashes." },
      { order: 5, question: "A documentation problem comes up at the dock. You:", options: ["Argue it out with the dock worker", "Work it through dispatch and SRL", "Leave without telling anyone", "Refuse and drive off angry"], correctIndex: 1, explanation: "Handle real problems through dispatch and SRL, not a confrontation at the window. (If you're being forced to do something unsafe, that's coercion — a separate protection.)" },
      { order: 6, question: "How you treat the guard, lumper, and dock staff matters because:", options: ["It doesn't", "You're the face of your carrier and SRL — courtesy and reliability turn one load into a lane and feed the Compass Score", "Only the driver sees it", "Tips are expected"], correctIndex: 1, explanation: "At the dock you represent your carrier and SRL. Professionalism builds the shipper relationship and repeat freight — which feeds your carrier's SRL Compass Score." },
      { order: 7, question: "Erratic speed and lane wandering are dangerous partly because they:", options: ["Save fuel", "Make you unpredictable, so the cars around a big truck make bad moves", "Are required in traffic", "Help other drivers"], correctIndex: 1, explanation: "Steady speed and correct lane position communicate your intent. Unpredictability from a large truck scares surrounding drivers into panic moves." },
      { order: 8, question: "The best 'customer service' from the road is mostly:", options: ["Driving faster to arrive early", "Proactive communication — keeping dispatch informed of arrival, delays, and issues so SRL can keep the shipper informed", "Never calling in", "Handling everything yourself"], correctIndex: 1, explanation: "Good communication is most of good service. Keep dispatch in the loop so SRL can keep the shipper updated; surprises are what damage the relationship." },
    ],
  },

  // ───────────────────────────────────────────────────────── D8
  {
    slug: "eco-driving-environmental",
    title: "Fuel-Efficient Driving & Environmental Compliance",
    category: "SRL Operational Excellence",
    summary: "Driving that saves fuel and protects the environment: smooth speed and shifting, cutting idle time, managing speed and following distance for MPG, plus idle laws, DEF/emissions systems, and preventing fuel and fluid spills.",
    version: "2",
    estMinutes: 18,
    passThreshold: 80,
    validityMonths: 12,
    sortOrder: 30,
    disclaimer: DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "Driving for fuel economy",
        estMinutes: 5,
        bodyMarkdown: `Fuel is one of the biggest costs in trucking, and **how you drive** can swing MPG by a large margin. Smooth is efficient.

**Smooth and steady wins.** Hard acceleration and hard braking waste the fuel you just burned to build speed. Accelerate gently, anticipate so you can coast instead of brake, and hold a **steady speed** — use cruise control on flat, open road.

**Slow down.** Aerodynamic drag rises sharply with speed — every few mph over about **60 mph** noticeably cuts your MPG. A slightly slower steady pace saves real fuel over a day.

**Manage following distance for MPG, not just safety.** Tailgating forces the brake-then-accelerate cycle that murders fuel economy. The big following distance that keeps you safe also lets you roll steadily and burn less.

**Shift smart.** Use **progressive/block shifting** — shift up before the engine winds out, keep the engine in its efficient rpm band, and don't over-rev. On rolling terrain, let the truck **use its momentum**: build a little speed going downhill to carry you up the next rise instead of flooring it at the top.

**Keep tires inflated.** Under-inflated tires add rolling resistance and cost fuel (and cause blowouts). Correct pressure is a free MPG gain.

[[figure:mpg-smooth-driving]]

> ` + DISCLAIMER,
      },
      {
        order: 2,
        title: "Idle reduction and idle laws",
        estMinutes: 4,
        bodyMarkdown: `A truck idling burns roughly **three-quarters of a gallon to a gallon of fuel per hour** while going nowhere, adds engine wear and emissions, and — in many places — **breaks the law.**

**Idle laws.** Many states and cities limit idling, commonly to about **5 minutes**, with fines for exceeding it; **California (CARB)** and others are especially strict. The limits vary by jurisdiction, so know the rule where you park and sleep.

**Reduce idling:**
- Use the truck's **bunk heater / APU (auxiliary power unit)** or shore power at a truck stop for cab comfort instead of idling the main engine.
- Don't idle to "warm up" longer than the manual calls for, and don't idle just for the radio or AC when you can avoid it.
- Exceptions exist (extreme temperatures, safety) — but the default is: **if you're not moving and don't need the engine, shut it off.**

Less idling saves fuel and the engine, cuts emissions, and keeps you legal where idling is restricted.

[[figure:idle-reduction-apu]]`,
      },
      {
        order: 3,
        title: "Emissions systems and spill prevention",
        estMinutes: 4,
        bodyMarkdown: `Modern diesels have emissions systems you must keep working, and you handle fuel and fluids that can pollute if spilled.

**DEF and the emissions system.** Most modern trucks use **Diesel Exhaust Fluid (DEF)** in a **Selective Catalytic Reduction (SCR)** system, plus a **Diesel Particulate Filter (DPF)** that periodically **regenerates** (burns off soot). Keep the **DEF tank filled** (running out will derate the engine to a crawl), let regens complete, and **never tamper with or delete** emissions controls — it's illegal and can put the truck out of service.

**Know the three kinds of DPF regen.** **Passive regen** happens on its own at highway speed and temperature — you never notice it. **Active (in-motion) regen** is when the engine's computer injects a little extra fuel to raise exhaust temperature and burn off soot **while you drive** — you may see a light or hear a change, so **keep driving and let it finish.** **Parked (forced) regen** is a stationary regen you initiate when the filter is too clogged for the others. **Interrupting or ignoring a regen request** leads to a clogged DPF, a **power derate**, and eventually a **tow** — so when the truck asks for a regen, give it what it needs.

**California — CARB Clean Truck Check.** If you run into California, **CARB's Clean Truck Check** requires periodic **emissions / OBD compliance testing** for heavy trucks and uses **roadside remote-OBD screening** to flag non-compliant trucks. Verify the current requirements before you run into CA.

**Fuel and fluid spills.** When you fuel, **stay with the nozzle**, don't top off past the click, and watch for overflow — a spill is an environmental and safety hazard and can bring a fine. Report and contain leaks of fuel, oil, coolant, or DEF. Dispose of used fluids and filters properly, never on the ground or down a drain.

**Hazmat is different.** A spill of a hazardous material is a regulated release — that's covered in the Hazmat course (stop, secure, ERG, report). For ordinary fluids, the rule is still: **don't let it reach the ground or water**, and clean up what you can safely.

Keeping the emissions system healthy and preventing spills protects the environment, the truck, and your record.`,
      },
    ],
    questions: [
      { order: 1, question: "The biggest driver-controlled factor in fuel economy is:", options: ["The color of the truck", "Smooth, steady driving — gentle acceleration, anticipation, steady speed", "Idling to keep the engine warm", "Driving faster to finish sooner"], correctIndex: 1, explanation: "Hard acceleration and braking waste fuel; smooth, anticipatory, steady-speed driving (cruise on flat road) is the biggest lever a driver controls." },
      { order: 2, question: "As speed rises above ~60 mph, fuel economy:", options: ["Improves", "Drops noticeably — aerodynamic drag rises sharply with speed", "Stays the same", "Only matters when empty"], correctIndex: 1, explanation: "Drag increases sharply with speed, so every few mph over ~60 cuts MPG. A slightly slower steady pace saves real fuel over a day." },
      { order: 3, question: "A truck idling burns roughly how much fuel per hour, going nowhere?", options: ["A few ounces", "About 3/4 to 1 gallon", "5 gallons", "None — idling is free"], correctIndex: 1, explanation: "Idling burns roughly 0.75–1 gallon/hour plus engine wear and emissions — and many places limit idling (often ~5 minutes; CARB is strict). Use an APU/bunk heater or shut it off." },
      { order: 4, question: "Many jurisdictions limit idling to about:", options: ["1 hour", "5 minutes, with fines for exceeding it", "There's never a limit", "8 hours"], correctIndex: 1, explanation: "A common limit is around 5 minutes, and California/CARB and others are strict, with fines. Limits vary — know the rule where you park." },
      { order: 5, question: "If your DEF (Diesel Exhaust Fluid) tank runs empty, the truck will:", options: ["Run normally", "Derate to a crawl — keep the DEF tank filled", "Shut off the brakes", "Burn less fuel"], correctIndex: 1, explanation: "Running out of DEF derates the engine to very low power. Keep the DEF filled, let DPF regens complete, and never tamper with or delete emissions controls (illegal + OOS)." },
      { order: 6, question: "When fueling, to prevent a spill you should:", options: ["Set the nozzle and walk away", "Stay with the nozzle, don't top off past the click, and watch for overflow", "Top it off as full as possible", "Fuel with the engine at high idle"], correctIndex: 1, explanation: "Stay with the nozzle and don't overfill — a fuel spill is an environmental + safety hazard and can bring a fine. Contain and report leaks; dispose of fluids/filters properly." },
      { order: 7, question: "On rolling hills, the fuel-smart technique is to:", options: ["Floor it at the top of each hill", "Use the truck's momentum — build a little speed downhill to carry up the next rise, staying in the efficient rpm band", "Brake on every downhill", "Idle over the crest"], correctIndex: 1, explanation: "Let momentum work — carry speed downhill to help climb the next rise, and use progressive shifting to keep the engine in its efficient band rather than over-revving." },
      { order: 8, question: "Deleting or tampering with the truck's emissions controls is:", options: ["A smart fuel upgrade", "Illegal and can put the truck out of service", "Required for regens", "Recommended for old trucks"], correctIndex: 1, explanation: "Tampering with or deleting emissions systems (SCR/DEF/DPF) is illegal and can put the truck out of service. Keep them working and let regens complete." },
      { order: 9, question: "Your dash shows an active (in-motion) DPF regeneration is running. You should:", options: ["stop and shut the engine off immediately", "keep driving and let the regen finish", "delete the DPF to avoid the hassle", "add more DEF to cancel it"], correctIndex: 1, explanation: "During an active regen the engine injects extra fuel to burn off soot while you drive — keep driving and let it complete. Interrupting or ignoring a regen request clogs the DPF and leads to a power derate and eventually a tow. (Passive regen happens automatically at highway temperature; a parked/forced regen is stationary when the filter is badly clogged.)" },
    ],
  },

  // ───────────────────────────────────────────────────────── D9
  {
    slug: "in-cab-safety-technology",
    title: "In-Cab Safety Technology (ADAS)",
    category: "On-Road Safety",
    summary: "How to use — and not over-trust — the safety technology in modern trucks: collision-mitigation/automatic emergency braking, adaptive cruise, lane-departure warning, stability control, blind-spot alerts, speed limiters, and dashcams.",
    version: "2",
    estMinutes: 16,
    passThreshold: 80,
    validityMonths: 12,
    sortOrder: 31,
    disclaimer: DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "What the systems do",
        estMinutes: 5,
        bodyMarkdown: `Modern trucks carry **Advanced Driver Assistance Systems (ADAS)** — a set of aids that watch the road and help you avoid crashes. Know what yours has and what each one does.

- **Forward Collision Warning (FCW) + Automatic Emergency Braking (AEB / collision mitigation):** radar/camera senses a slower or stopped vehicle ahead, warns you, and if you don't act, applies the brakes to reduce or avoid the impact.
- **Adaptive Cruise Control (ACC):** cruise that automatically keeps a set following distance from the vehicle ahead, slowing and resuming with traffic.
- **Lane Departure Warning (LDW):** alerts you (a sound or seat/wheel vibration) if you drift out of your lane without signaling. Some trucks add **Lane-Keeping Assist (LKA)**, which goes further with an **active steering nudge** back toward center — LDW only *warns*, LKA actually *steers a little*, and neither one drives the truck for you.
- **Electronic Stability Control (ESC) / Roll Stability:** senses an impending skid or rollover and can cut throttle and apply individual brakes to help keep the truck stable — a big help against the rollover physics in that course.
- **Blind-Spot Detection:** warns when a vehicle is in your side No-Zone.
- **Speed limiter:** caps the truck's top speed.
- **Dashcam / event recorder:** records road and sometimes driver-facing video, usually saving clips around hard braking or a collision.

These are genuinely life-saving tools — the point of this course is how to work *with* them.

**This tech is becoming standard, not optional.** Factory **AEB paired with ESC is being federally mandated on new Class 7/8 trucks** (target ~2027), and **ESC is already required on new tractors under FMVSS 136** — expect to find these systems on more and more of the trucks you drive.

[[figure:adas-systems-overview]]

> ` + DISCLAIMER,
      },
      {
        order: 2,
        title: "Assist, don't replace — the golden rule",
        estMinutes: 5,
        bodyMarkdown: `ADAS is a **safety net, not a driver.** The most dangerous thing you can do with it is trust it to do your job.

- **Automatic emergency braking may not catch everything.** It's tuned to reduce crashes, not guarantee zero. It can be late or miss a crossing vehicle, a stopped object, or an unusual situation. **You still watch the road, manage following distance, and brake yourself** — treat an AEB event as a failure you should have prevented, not a feature to rely on.
- **Adaptive cruise keeps distance, it doesn't steer or think.** You still monitor, still steer, and still take over — turn it off in heavy weather, work zones, and stop-and-go where you need full control.
- **Lane-departure warns; it does not drive.** If it's beeping, you drifted — fix your attention, don't tune it out.
- **Stability control helps, but it can't beat physics.** It buys margin against a skid or rollover; it does **not** mean you can take the ramp at car speed. Slow before the curve as always.

**Phantom braking.** AEB can occasionally activate **falsely** — triggered by an overpass shadow, a bridge joint, a car that cuts in and clears, or a vehicle stopped well off to the side. If it happens, **stay in control: keep both hands on the wheel and do NOT panic-swerve**, ease back to normal, and **report a truck that phantom-brakes** so it gets checked. The sudden brake is startling, but yanking the wheel is what turns it into a crash.

**Never disable or ignore a working system.** If a system is faulty or constantly false-alarming, report it for repair — don't defeat it. And don't let the tech lull you: the systems fail quietly, and the driver is always the last line.

[[figure:adas-assist-not-replace]]`,
      },
      {
        order: 3,
        title: "Dashcams, limiters, and living with the tech",
        estMinutes: 4,
        bodyMarkdown: `**Dashcams and event recorders.** Many trucks record continuously and save a clip around a hard brake, swerve, or collision; some also face the driver. Treat the cab as if you're **always on camera** — because you often are. The upside is real: in a not-at-fault crash, **the footage is frequently what clears you**, showing the car that cut you off or ran the light. Drive professionally and the camera is your best witness.

**Speed limiters.** Your truck may be governed to a top speed. Don't fight it by riding it downhill or tailgating to keep pace — drive to conditions, not to the limiter.

**Living with alerts.** Alert fatigue is real — if you tune out every beep, the one that matters gets ignored too. Keep the systems clean and functional (a dirt-covered radar or camera goes blind), respond to warnings, and report a system that cries wolf so it gets fixed rather than mentally muted.

**The bottom line:** the technology has cut real-world crashes, and it's on your side — as long as you stay the driver. Use it, keep it working, and never hand it your attention.`,
      },
    ],
    questions: [
      { order: 1, question: "Automatic Emergency Braking (collision mitigation) is best understood as:", options: ["A replacement for watching the road", "A safety net that reduces crashes but may be late or miss situations — you still watch and brake yourself", "A cruise control", "A parking aid only"], correctIndex: 1, explanation: "AEB is tuned to reduce impacts, not guarantee zero. It can be late or miss a crossing/stopped object. You still manage following distance and brake — treat an AEB event as a prevention failure, not a feature to lean on." },
      { order: 2, question: "The golden rule for all ADAS features is:", options: ["Trust them completely", "They assist, they don't replace the driver — you stay the last line", "Turn them all off", "Only use them at night"], correctIndex: 1, explanation: "ADAS is a safety net, not a driver. The systems fail quietly; you monitor, steer, and brake, and you never hand them your attention." },
      { order: 3, question: "Electronic Stability / Roll Stability control means you can:", options: ["Take ramps and curves at car speed now", "Rely on it instead of slowing", "Still must slow before the curve — it buys margin but can't beat physics", "Ignore load height"], correctIndex: 2, explanation: "Stability control helps prevent a skid or rollover but can't override physics. Slow before the curve as always; it's margin, not permission to go fast." },
      { order: 4, question: "Your lane-departure warning goes off. It means:", options: ["The system is broken", "You drifted out of your lane without signaling — refocus", "You should turn it off", "Nothing important"], correctIndex: 1, explanation: "LDW alerts you to an unsignaled lane drift — a fix-your-attention cue, not noise to tune out." },
      { order: 5, question: "A dashcam that records the road (and sometimes you) is best treated as:", options: ["An enemy to defeat", "A reason to drive as if always on camera — and often the footage that clears you in a not-at-fault crash", "Only useful for the company", "Something to cover up"], correctIndex: 1, explanation: "Assume you're always recorded — the upside is that in a not-at-fault crash the footage frequently clears you by showing what the other driver did." },
      { order: 6, question: "A safety system is constantly false-alarming. You should:", options: ["Disable it", "Report it for repair — don't defeat a working safety system", "Cover the sensor", "Ignore all its alerts permanently"], correctIndex: 1, explanation: "Report a faulty/false-alarming system for repair rather than defeating it. Disabling or ignoring a working system removes a real safety layer — and a dirt-covered radar/camera goes blind." },
      { order: 7, question: "Adaptive cruise control should be turned OFF in:", options: ["Open, flat, dry highway", "Heavy weather, work zones, and stop-and-go where you need full control", "Any daylight driving", "Never — leave it on always"], correctIndex: 1, explanation: "ACC keeps distance but doesn't steer or judge context. Take full control in weather, work zones, and stop-and-go." },
      { order: 8, question: "\"Alert fatigue\" is dangerous because:", options: ["Alerts save fuel", "If you tune out every beep, you'll ignore the one that matters — keep systems clean and respond to warnings", "It only affects new drivers", "Alerts are never useful"], correctIndex: 1, explanation: "Tuning out constant alerts trains you to ignore the critical one too. Keep sensors clean, respond to warnings, and get a cry-wolf system fixed rather than mentally muting it." },
      { order: 9, question: "Your AEB brakes suddenly for what turns out to be an overpass shadow (phantom braking). The right response is to:", options: ["yank the wheel to the shoulder to escape it", "keep both hands on the wheel, don't panic-swerve, ease back to normal, and report it", "disable the AEB system yourself", "brake harder to help it along"], correctIndex: 1, explanation: "AEB can false-activate on shadows, bridge joints, or a car that cuts in and clears. Stay in control — keep both hands on the wheel, don't panic-swerve, ease back to normal speed, and report a truck that phantom-brakes so it gets checked. Swerving is what turns a startling brake into a crash." },
      { order: 10, question: "Your truck is governed by a speed limiter. The professional way to live with it is to:", options: ["ride it downhill and tailgate to keep pace with traffic", "drive to conditions, not to the limiter — don't fight the cap", "have the limiter removed for more power", "only leave it on at night"], correctIndex: 1, explanation: "A speed limiter caps your top speed. Don't fight it by riding it downhill or tailgating to keep up — drive to the conditions and the traffic, not to the number. Blind-spot detection and the other aids follow the same rule: they assist, they don't replace your own checks." },
    ],
  },

  // ───────────────────────────────────────────────────────── D10
  {
    slug: "work-zone-driving",
    title: "Work-Zone Driving",
    category: "On-Road Safety",
    summary: "Work zones are among the highest-severity places a truck drives: narrowed and shifted lanes, sudden stops, flaggers, and workers close to traffic. How to read them, slow early, keep your distance, and get through without a rear-end or a worker strike.",
    version: "2",
    estMinutes: 14,
    passThreshold: 80,
    validityMonths: 12,
    sortOrder: 32,
    disclaimer: DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "Why work zones are so dangerous for trucks",
        estMinutes: 4,
        bodyMarkdown: `A work zone concentrates every hazard: **narrowed and shifted lanes, uneven surfaces, sudden stops, flaggers, equipment, and workers standing feet from live traffic** — all at once, often with reduced sight lines.

**The number-one work-zone truck crash is the rear-end.** Traffic **stops suddenly** in a work zone — a queue appears over a rise, a flagger holds traffic — and a loaded truck that was following too close or going too fast can't stop in time. Many work-zone fatalities involve a large truck striking stopped or slowing traffic.

**Workers and equipment are exposed.** People on foot, trucks and machines entering and leaving the lane, and shifted patterns mean anything can happen close to you.

**The penalties are real.** Work zones commonly carry **reduced speed limits, doubled fines, and increased enforcement** — "Give 'Em a Brake." But the reason to slow isn't the fine; it's that a truck at speed in a compressed, unpredictable space has no room for error.

[[figure:work-zone-layout]]

> ` + DISCLAIMER,
      },
      {
        order: 2,
        title: "Reading and entering a work zone",
        estMinutes: 5,
        bodyMarkdown: `Work zones warn you in advance — read the signs and set up early.

**The advance-warning signs** (orange diamonds) tell you what's coming: a lane closure ahead, a shift, a flagger, reduced speed. **Slow down early** and get into the open lane **before** the merge point — don't race to the front of a closing lane and force your way in at the cones; set up smoothly while there's room.

**A note on the "zipper merge."** Many state DOTs now endorse the **zipper merge** — traffic uses **both lanes all the way to the merge point, then alternates one-for-one** — in heavy stop-and-go, and you'll see signs reading "use both lanes" or "merge here." Don't be confused by it: for a long, slow-to-maneuver truck the safe default is still to **set up early and never force your way in**, but where the signage or the backed-up traffic clearly calls for a zipper, take your turn smoothly and let the next vehicle take theirs.

**Obey the posted work-zone speed** — it's lower for a reason, and often doubled-fine. More importantly, drive slow enough for the compressed space and the chance of a sudden stop.

**Open up your following distance.** This is the single best defense against the rear-end that kills in work zones. Expect the traffic ahead to **stop suddenly** and give yourself room to brake gently. Cover the brake.

**Watch for the pattern shifts:** lanes that jog left or right, temporary lane lines, narrow lanes with a barrier inches off your mirror, uneven pavement or a drop-off at the lane edge. Keep the truck centered and steady — no sudden moves in a tight, barrier-lined lane.

[[figure:work-zone-merge-early]]`,
      },
      {
        order: 3,
        title: "Through the zone and the people in it",
        estMinutes: 4,
        bodyMarkdown: `Inside the zone, the workers are the priority.

**Flaggers direct you — obey them, even over a signal or sign.** A flagger's stop or slow paddle is a lawful instruction; be ready to stop for it and don't creep or pressure them. Make eye contact when you can.

**Pilot cars on one-lane rural work zones.** Where a two-way road is squeezed down to a single shared lane, a **pilot ("follow-me") vehicle** leads a batch of traffic through. Fall in behind it, hold its pace, and **never pass it** — it's guiding you around workers, equipment, and oncoming traffic you can't see.

**Give workers room.** People are on foot near the travel lane; equipment backs and turns across it. Move over a lane if one is open and it's safe, and slow down so you can react to someone stepping out or a machine pulling in.

**Expect the stop-and-go.** Don't tailgate in a slow work-zone queue — the accordion effect means the truck behind (you) needs the most room. Keep a gap even at low speed.

**Night work zones** stack the night-visibility problems (glare, reduced sight, fatigue — see that course) on top of the work-zone hazards. Slow down more, not less, at night.

**Don't rush the exit.** The zone isn't over until you're past the "End Road Work" sign and traffic has fully opened up — workers and equipment can be near the end too.

The whole job in a work zone: **slow early, big following distance, no sudden moves, obey the flagger, protect the people on foot.** That's how a truck gets through without being the crash everyone remembers.`,
      },
    ],
    questions: [
      { order: 1, question: "The most common truck crash in a work zone is:", options: ["Rollover", "Rear-ending stopped or slowing traffic", "Sideswipe", "Backing crash"], correctIndex: 1, explanation: "Traffic stops suddenly in work zones, and a loaded truck following too close or going too fast can't stop in time. Big following distance is the best defense." },
      { order: 2, question: "When a lane is closing ahead in a work zone, you should:", options: ["Race to the front and force in at the cones", "Slow early and merge into the open lane before the merge point, while there's room", "Speed up to beat the closure", "Stop in the closing lane"], correctIndex: 1, explanation: "Set up smoothly and merge early where there's room, rather than forcing your way in at the cones with a long, slow-to-maneuver truck." },
      { order: 3, question: "A flagger holds up a STOP paddle where the signal is green. You:", options: ["Follow the green signal", "Obey the flagger — their instruction is lawful and controls", "Ignore both and proceed", "Honk and drive through"], correctIndex: 1, explanation: "A flagger's instruction is a lawful direction and controls even over a signal or sign. Be ready to stop, don't pressure them, and make eye contact when you can." },
      { order: 4, question: "Your single best defense against the work-zone rear-end is:", options: ["Driving faster to clear it", "A big following distance and covering the brake — expect sudden stops", "Tailgating to keep the queue tight", "Changing lanes constantly"], correctIndex: 1, explanation: "Open up your following distance and expect the traffic ahead to stop suddenly. In a slow queue don't tailgate — the accordion effect means the truck needs the most room." },
      { order: 5, question: "Work-zone speed limits are typically:", options: ["Higher than normal", "Lower, often with doubled fines and more enforcement", "The same as the open road", "Only advisory"], correctIndex: 1, explanation: "Work zones commonly post reduced limits with doubled fines. But the real reason to slow is the compressed, unpredictable space and the chance of a sudden stop." },
      { order: 6, question: "At night, in a work zone, you should:", options: ["Speed up to get through faster", "Slow down more — night-visibility problems stack on top of the work-zone hazards", "Use high beams through the whole zone", "Drive the same as daytime"], correctIndex: 1, explanation: "Night work zones combine reduced sight, glare, and fatigue with the work-zone hazards. Slow down more, not less." },
      { order: 7, question: "The work zone is over when:", options: ["You pass the first cone", "You're past the 'End Road Work' sign and traffic has fully opened — workers/equipment can be near the end too", "You see a worker wave", "Halfway through"], correctIndex: 1, explanation: "Don't rush the exit — stay slow and alert until you're past the End Road Work sign and traffic has fully reopened; hazards exist at the end of the zone too." },
      { order: 8, question: "Inside a barrier-lined narrow work-zone lane, you should:", options: ["Make quick lane corrections", "Keep the truck centered and steady with no sudden moves", "Ride the barrier line", "Speed up to spend less time in it"], correctIndex: 1, explanation: "Narrow, barrier-lined lanes leave inches of margin. Keep centered and steady — sudden moves risk the barrier, your mirror, or an adjacent vehicle." },
    ],
  },
];
