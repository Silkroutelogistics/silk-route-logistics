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
    version: "3",
    estMinutes: 22,
    passThreshold: 80,
    validityMonths: 12,
    sortOrder: 2,
    disclaimer: DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "Your CDL and keeping it valid",
        estMinutes: 4,
        bodyMarkdown:
          "Your commercial driver's license is your authority to operate. Keeping it valid is on you, not just your carrier.\n\n**Class and endorsements.** Class A covers a combination over 26,001 lb GCWR towing a unit over 10,000 lb. Endorsements add privileges: **H** (hazmat), **N** (tank), **X** (tank + hazmat), **T** (doubles/triples), **P** (passenger). Only carry what your operation needs, and only haul what your endorsements cover.\n\n**The notifications you owe (49 CFR 383.31, 383.33).** You must notify your employer within **30 days** of a conviction for any traffic violation (in any vehicle, in any state, except parking). If your license is suspended, revoked, canceled, or you are disqualified or lose the right to operate, you must tell your employer by the **end of the next business day**.\n\n**One driver, one license.** You may hold only one CDL, from your home state.\n\n> " + DISCLAIMER,
      },
      {
        order: 2,
        title: "Your DOT medical card",
        estMinutes: 4,
        bodyMarkdown:
          "To drive a commercial vehicle in interstate commerce you must be medically certified. A certified medical examiner from the FMCSA National Registry performs the DOT physical and issues the **medical examiner's certificate** (your \"med card\"). A typical certificate is valid up to 24 months, less if a condition needs monitoring (verify your own expiration).\n\n**Self-certification: which of the four categories you operate in.** When you get or renew your CDL you tell your state licensing agency how you operate, and that decides whether you must keep a med card on file:\n\n- **Non-excepted interstate (NI)** — you cross state lines or haul interstate freight under the full federal safety rules. **You must keep a current med card on file with your state.** Most SRL drivers are here.\n- **Excepted interstate (EI)** — interstate, but only certain excepted operations the FMCSA exempts from the medical rules. No med card filed.\n- **Non-excepted intrastate (NA)** — you drive only within one state and must meet **that state's** medical rules.\n- **Excepted intrastate (EA)** — intrastate operations your state has excepted from its medical rules.\n\nDriving in a category other than the one you self-certified to can get your commercial privileges **suspended or revoked** — so certify honestly and update it if your operation changes.\n\nIf your med card **lapses**, you are not medically qualified to drive a CMV, and your CDL can be **downgraded** by your state until you recertify. Track the expiration the same way you track your CDL and registration; do not let it surprise you on the road.",
      },
      {
        order: 3,
        title: "Drugs, alcohol, and the Clearinghouse",
        estMinutes: 5,
        bodyMarkdown:
          "The federal drug & alcohol program (49 CFR Part 382) sets hard rules for safety-sensitive (driving) functions.\n\n**Prohibited conduct** includes a blood alcohol concentration of **0.04 or higher**, using alcohol within 4 hours of going on duty, and any prohibited-drug use. **Refusing a required test counts as a positive.**\n\n**Six test types:** pre-employment, random, reasonable-suspicion, post-accident, return-to-duty, and follow-up.\n\n**The FMCSA Drug & Alcohol Clearinghouse** is the federal database of violations. You consent to a query, and a recorded violation **bars you from driving** until you complete the return-to-duty process. A violation does not quietly disappear.\n\n**What return-to-duty actually involves:**\n\n1. The violation is recorded and you are **prohibited** from safety-sensitive (driving) functions.\n2. You are evaluated by a **Substance Abuse Professional (SAP)**, who prescribes education and/or treatment.\n3. You complete what the SAP prescribes, and the SAP reassesses you.\n4. You take and **pass a return-to-duty test** (a negative result). At that point you are **no longer prohibited** and may drive again.\n5. The SAP sets a **follow-up testing plan** — a minimum of **6 unannounced tests in the first 12 months**, which can run up to **5 years**. Your violation stays **unresolved** in the Clearinghouse until you finish that follow-up plan.\n\nThe process is generally at your expense. The point: a violation is recoverable, but only by doing the SAP / return-to-duty work — there is no shortcut and no waiting it out.",
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

The takeaway: your driving record, on and off the clock, is your livelihood.`,
      },
      {
        order: 5,
        title: "Three ways you can lose the wheel — and how each comes back",
        estMinutes: 5,
        bodyMarkdown:
          "Not every \"you can't drive\" is the same thing, and each one comes back a different way. Know which is which.\n\n**1. Medical downgrade — administrative, reversible.** If your med card lapses and you're in a category that needs one, your state **downgrades** your CDL to a regular license. This is not a punishment, it's a status. You fix it by getting a new DOT physical and **submitting the current med card to your state**, and your CDL is restored. Fast to fix — if you don't let it lapse in the first place.\n\n**2. Disqualification — a penalty for an offense.** A 49 CFR 383.51 offense (DUI, repeat serious violations, an out-of-service violation, and so on) **disqualifies** you for a set period: 90 days, a year, three years, or life. When the period ends, reinstatement is **not automatic** — you go through your state to reinstate, pay any fees, and meet its conditions, and a long disqualification may require **retaking the CDL tests**.\n\n**3. Clearinghouse prohibition — a drug/alcohol stop.** A recorded drug or alcohol violation puts you in **prohibited** status until you complete the return-to-duty process with a SAP (previous lesson). This is separate from a medical downgrade and from a 383.51 disqualification: different cause, different fix.\n\nThe practical takeaway: keep your med card current (avoids #1), protect your driving record on and off the clock (avoids #2), and stay clean (avoids #3). Each one is recoverable, but each costs you time and money you would rather keep.",
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
      { order: 8, question: "Your med card lapsed and your state downgraded your CDL. To restore it you:", options: ["wait out a disqualification period", "get a new DOT physical and submit the med card to your state", "complete a return-to-duty test with a SAP", "reapply for a brand-new CDL from scratch"], correctIndex: 1, explanation: "A medical downgrade is administrative, not a penalty — recertify (new DOT physical) and submit the med card to your state and your CDL is restored. That's different from a 383.51 disqualification (an offense penalty) and from a Clearinghouse return-to-duty test (a drug/alcohol stop)." },
    ],
  },

  // ─────────────────────────────────────────────────────────
  {
    slug: "hazmat-awareness",
    title: "Hazmat & Dangerous Goods Awareness",
    category: "Hazardous Materials",
    summary: "Recognize the 9 hazard classes and their placards, read the shipping paper, keep incompatible loads apart, know what an H endorsement covers, and what to do at a spill.",
    version: "4",
    estMinutes: 22,
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
        bodyMarkdown: `**When placards are required (49 CFR 172.504).** Most hazmat must be placarded once the aggregate gross weight reaches **1,001 lb** (the Table 2 threshold). The most dangerous materials — **Table 1** (certain explosives, poison gas, and the like) — require placards in **any amount**. A material with a second hazard may also carry a **subsidiary placard** (the same diamond, with no class number).

[[figure:placard-anatomy]]

**The shipping paper and the basic description.** It must be within reach while you drive and easy to find in an emergency (on top of other papers, or tabbed). The **basic description** lists, in order, the **UN ID number, proper shipping name, hazard class, and packing group**, plus the quantity, an emergency-response phone number, and the **shipper's certification** that the load is correctly classified, packed, marked, and labeled. The **Emergency Response Guidebook (ERG)** rides in the cab and gives isolation and protective actions by UN number.

**Read the UN ID and packing group — they are not decoration.** The **four-digit UN ID** (for example, *UN 1203* gasoline, *UN 1830* sulfuric acid) is the **key to every hazmat resource**: look the number up in the orange-bordered section of the ERG and it gives you the response guide, the isolation distances, and the evacuation actions for exactly that material. The **packing group** ranks how dangerous the material is: **PG I** = high danger, **PG II** = medium, **PG III** = low. Higher danger means stricter packaging and handling. When you read a shipping paper, find the UN number first — it is what you will quote to 911, CHEMTREC, and responders.

**Do not load incompatible hazards together.** The **segregation table (49 CFR 177.848)** forbids loading certain classes in the same vehicle — oxidizers away from flammables, acids away from cyanides, and so on. If a shipper hands you two classes that don't mix, that is a stop-and-verify.

To haul a **placarded** amount you need a **hazmat (H) endorsement** on your CDL (with a TSA security threat assessment), and the carrier must be **registered with PHMSA**. Hauling a placardable load without the endorsement is a serious violation.

**This awareness course is not your hazmat training.** Federal law (**49 CFR 172.704**) requires every hazmat employee — including the driver — to complete documented hazmat training, and to **renew it at least every 3 years**. The carrier keeps the training record as a DOT compliance item. If your hazmat training has lapsed, you cannot legally haul hazmat until you re-train.

**You can refuse a load that doesn't add up.** If the placards, the shipping paper, and the freight don't match — or the paperwork is missing — you have the right and the duty to **refuse the load** and tell dispatch why. Refusing an unsafe or improperly documented hazmat load is not grounds for discipline; it protects you, the carrier, and the public. Accepting it puts the violation on your CDL.`,
      },
      {
        order: 3,
        title: "If something goes wrong",
        estMinutes: 4,
        bodyMarkdown:
          "At a leak, spill, or crash involving hazmat, the order is **protect, isolate, call**.\n\n**Protect yourself first.** Stop, stay **upwind** (if upwind and uphill conflict, *upwind wins* — vapor travels with the wind), and do not walk through or touch spilled material or vapor. You cannot help anyone if you are down.\n\n**Isolate.** Keep people back and look the **UN number** up in the orange section of the ERG. It gives you two distances: the **initial isolation distance** (a circle around the spill that *nobody* enters) and the **protective-action distance** (how far downwind people must **evacuate or shelter in place**). For a small spill these are tens of feet; for a large spill or a PIH gas they can be hundreds of feet to over a mile. Quote the UN number to responders so they pull the right guide.\n\n**Call.** Dial **911** and **CHEMTREC at 1-800-424-9300** for chemical emergency guidance, then notify your carrier and SRL. You are not the cleanup crew — your job is to protect yourself, keep others back, and get the experts moving. Let trained responders handle containment.\n\nHazmat also carries a **security awareness** duty: watch for and report tampering, theft, or anyone showing unusual interest in your load. A hazmat load is a target.",
      },
      {
        order: 4,
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
    ],
  },

  // ─────────────────────────────────────────────────────────
  {
    slug: "hazard-communication",
    title: "Hazard Communication: WHMIS & HazCom",
    category: "Hazardous Materials",
    summary: "Workplace chemical safety on the dock and in the warehouse: the GHS labels and pictograms, the Safety Data Sheet, and your right to know. (Not the transport placards.)",
    version: "4",
    estMinutes: 18,
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
          "Hazard communication is about the chemicals you handle or work around at a dock, warehouse, or shop, not the freight in the trailer.\n\nIn the US it is **OSHA's Hazard Communication Standard (HazCom), 29 CFR 1910.1200**. In Canada it is **WHMIS 2015** (Workplace Hazardous Materials Information System). Both are aligned to the **Globally Harmonized System (GHS)**, so the labels and data sheets look the same in either country.\n\nThis is **different** from the placards and shipping papers on a dangerous-goods load, which are governed by the transport rules (HMR / TDG) covered in the other course. A drum with a GHS label sitting on a dock is a workplace-safety matter; the same drum placarded on a trailer is a transport matter.\n\nThe core principle is **right to know**: you are entitled to know the hazards of the chemicals you work near, and how to protect yourself.\n\n> " + DISCLAIMER,
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
          "Every hazardous workplace chemical has a **Safety Data Sheet (SDS)** with a standardized **16 sections** in a fixed order.\n\nThe sections a driver or dock worker reaches for first:\n\n- **Section 1 Identification** (what it is, supplier, emergency phone)\n- **Section 2 Hazards** (what it can do)\n- **Section 4 First-aid measures** (skin, eye, inhalation, ingestion)\n- **Section 6 Accidental release** (what to do for a spill)\n- **Section 7 Handling and storage**\n- **Section 8 Exposure controls / PPE**\n\nThe facility must keep SDSs accessible to workers. If you are asked to handle a chemical you do not know, find its SDS first.\n\n**Finding it fast matters in an emergency.** SDSs live in a binder, a posted sheet, or an electronic system (a computer, a QR code on the label, or a facility app). At an unfamiliar dock the quickest path is to **ask the supervisor or safety officer where the SDS station is** — know where to look before you need it, not during a spill.",
      },
      {
        order: 4,
        title: "Your rights and what to do",
        estMinutes: 3,
        bodyMarkdown:
          "Hazard communication gives you concrete rights: to be **trained** (your employer is legally required to train you on the chemicals you work around, 29 CFR 1910.1200(h)), and to **access** the labels and SDSs. Canada's WHMIS pairs with a **right to refuse unsafe work** — though that right actually comes from the **Canada Labour Code Part II**, not WHMIS itself. In the US the right to refuse varies by state and employer.\n\nIf a chemical contacts your skin or eyes, go to the **SDS first-aid section** and act on it (most call for flushing with water); get medical help for anything serious.\n\nA **damaged, worn, or missing container label** is the facility's legal duty to fix — don't guess at what's inside or move it unsafely. **Report it to the supervisor** and let them restore the label.\n\nKeep the two systems straight: the GHS pictograms on a drum are **workplace** hazard communication, **not** the transport placards on the trailer. Knowing the difference keeps you from misreading a load or a dock.",
      },
    ],
    questions: [
      { order: 1, question: "WHMIS (Canada) and OSHA HazCom (US) govern:", options: ["the placards and shipping papers on a dangerous-goods trailer", "the safe handling of chemicals you work around at a dock, shop, or warehouse", "the apportioned registration of the truck", "the driver's hours-of-service limits"], correctIndex: 1, explanation: "WHMIS and HazCom are WORKPLACE chemical hazard communication — the chemicals you handle on the dock or in the shop. The trailer's placards and papers are a separate transport system (HMR/TDG)." },
      { order: 2, question: "You're asked to handle a cleaning solvent you don't know. Where do you find its hazards, first-aid, and spill steps?", options: ["its Safety Data Sheet (SDS)", "the Emergency Response Guidebook (ERG)", "the bill of lading", "the product's sales brochure"], correctIndex: 0, explanation: "The Safety Data Sheet gives standardized hazard, first-aid, handling, and spill information for a workplace chemical. The ERG is for transport emergencies — a different system." },
      { order: 3, question: "A label reads the signal word \"Warning.\" Compared with a label reading \"Danger,\" this product's hazard is:", options: ["more severe", "less severe", "exactly the same", "not regulated"], correctIndex: 1, explanation: "GHS uses exactly two signal words: Danger (more severe) and Warning (less severe). \"Warning\" signals the lower hazard level." },
      { order: 4, question: "A red-bordered diamond with a flame-over-a-circle symbol on a drum marks:", options: ["a flammable liquid", "an oxidizer", "a corrosive", "an environmental hazard"], correctIndex: 1, explanation: "The flame-over-circle pictogram means an OXIDIZER (it makes fires burn hotter). A plain flame is flammable; a liquid eating a hand/surface is corrosion; a dead tree and fish is the environment pictogram." },
      { order: 5, question: "A solvent splashes in a coworker's eyes. Which SDS section do you go to first?", options: ["Section 1, Identification", "Section 4, First-aid measures", "Section 9, Physical properties", "Section 14, Transport information"], correctIndex: 1, explanation: "Section 4 (First-aid measures) gives the immediate steps for eye, skin, inhalation, and ingestion exposure. The 16 SDS sections sit in a fixed order so you can find first-aid fast." },
      { order: 6, question: "A drum on a warehouse rack shows a GHS pictogram diamond. That labeling is governed by:", options: ["the DOT Hazardous Materials Regulations (transport placarding)", "the OSHA HazCom / WHMIS workplace standard", "the rate confirmation", "the IFTA agreement"], correctIndex: 1, explanation: "A drum sitting in a workplace is governed by OSHA HazCom (US) / WHMIS (Canada). The same drum, once placarded on a trailer, falls under the DOT transport rules — two different systems." },
      { order: 7, question: "How many hazard pictograms does OSHA require on US workplace labels?", options: ["7", "8 — the environmental pictogram is the 9th in full GHS but not OSHA-required", "9", "as many as the chemical has"], correctIndex: 1, explanation: "OSHA HazCom (29 CFR 1910.1200) mandates 8 pictograms; the environmental/aquatic pictogram is the 9th in the full GHS (and appears on some Canadian/WHMIS labels) but is outside OSHA's jurisdiction. WHMIS 2015 also uses the same 8 for workplace labels." },
      { order: 8, question: "At an unfamiliar dock you need the SDS for a cleaner to check the PPE, but it isn't where you expect. You:", options: ["use it without checking PPE", "ask the warehouse supervisor where the SDS station is", "assume the label tells you everything", "skip the job entirely"], correctIndex: 1, explanation: "The facility must keep SDSs accessible — ask the supervisor or safety officer where the SDS station is. The label alone doesn't give the full PPE, first-aid, and spill guidance the SDS does." },
    ],
  },

  // ─────────────────────────────────────────────────────────
  {
    slug: "pre-post-trip-inspection",
    title: "Pre-Trip & Post-Trip Inspection + DVIR",
    category: "Vehicle & Cargo Safety",
    summary: "The legal duty to inspect, a systematic pre-trip walk-around, and the post-trip Driver Vehicle Inspection Report when you find a defect.",
    version: "2",
    estMinutes: 16,
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
        estMinutes: 6,
        bodyMarkdown:
          "Inspect the same way every time so you do not skip anything.\n\n**In the cab:** gauges and warning lights, and the **air-brake checks** if equipped: the low-air warning activates before pressure drops too far, the governor cuts in and out in the right range, the applied-pressure leak (leak-down) is within limits, and the parking brake and tractor-protection hold.\n\n**Walk the truck:**\n\n- **Tires** (tread depth, inflation, no cuts, bulges, or exposed cord; no flats on duals)\n- **Wheels and lugs** (no missing or loose lug nuts, no cracks)\n- **Brakes** (lining, drums/rotors, slack adjusters, air lines and chambers)\n- **Steering and suspension** (linkage, springs, mounts, no leaks)\n- **Coupling** (fifth wheel locked, kingpin seated, no gap, safety latch)\n- **Lights and reflectors**, **mirrors**, **glass and wipers**\n- **Leaks** under the truck (oil, coolant, fuel, air)\n- **Cargo securement** and **emergency equipment** (fire extinguisher charged, 3 reflective triangles, spare fuses if used)",
      },
      {
        order: 3,
        title: "Defects, the DVIR, and out-of-service",
        estMinutes: 4,
        bodyMarkdown:
          "When you find a defect that affects safe operation, it must be **fixed before the truck moves**.\n\nThe **post-trip DVIR** (49 CFR 396.11) documents any defect or deficiency found at the end of the day so the next driver and the shop know. If nothing is wrong, many operations still log a no-defect report per their policy.\n\nCommon **out-of-service** conditions roadside: brakes out of adjustment or defective, a flat or below-minimum-tread tire, steering problems, inoperative required lights, fluid leaks, and inadequate cargo securement. Any of these can park the truck on the spot.\n\nReport defects honestly. Papering over a problem to make a delivery window is how a small repair becomes a crash or an out-of-service.",
      },
    ],
    questions: [
      { order: 1, question: "Before you drive, 49 CFR 396.13 requires you to:", options: ["review the previous DVIR and confirm any noted defects were repaired", "complete a fresh post-trip DVIR for the last driver", "weigh the truck at the nearest certified scale", "re-torque all the wheel lug nuts"], correctIndex: 0, explanation: "396.13 requires reviewing the LAST driver's DVIR and being satisfied any noted defects were corrected before driving. The post-trip DVIR (396.11) is a separate, end-of-day duty." },
      { order: 2, question: "The in-cab air-brake portion of a pre-trip checks the:", options: ["low-air warning, governor cut-in/out, leak-down, and parking brake", "engine oil, coolant, and belt tension", "trailer weight and axle distribution", "ELD, GPS, and dash-cam connections"], correctIndex: 0, explanation: "The air-brake check confirms the low-air warning activates, the governor cuts in/out in range, the applied-pressure leak-down is within limits, and the parking/tractor-protection holds." },
      { order: 3, question: "On your walk-around you find a steer-axle tire with exposed cord. You:", options: ["air it up to spec and drive to the next shop", "do not drive — exposed cord is an out-of-service condition", "log it on tonight's DVIR and finish the run", "move it to a trailer position and roll"], correctIndex: 1, explanation: "A steer tire with exposed cord (or below-minimum tread) is an out-of-service condition — the truck does not move until it's corrected. Steer-tire failures are especially dangerous." },
      { order: 4, question: "A post-trip Driver Vehicle Inspection Report (DVIR) must be completed when:", options: ["the truck is refueled at the end of a shift", "a defect affecting safe operation is found", "the odometer reaches a scheduled service interval", "a different trailer is hooked for the next load"], correctIndex: 1, explanation: "Under 49 CFR 396.11 the post-trip DVIR documents any defect or deficiency affecting safe operation. Many fleets also log a no-defect report by policy." },
      { order: 5, question: "Your legal duty to be satisfied the vehicle is safe before driving comes from:", options: ["the shipper's bill of lading", "49 CFR 392.7", "the truck's owner's manual", "your dispatcher's instructions"], correctIndex: 1, explanation: "49 CFR 392.7 prohibits driving unless the driver is satisfied the vehicle and its equipment are in safe operating condition." },
    ],
  },

  // ─────────────────────────────────────────────────────────
  {
    slug: "cargo-securement",
    title: "Cargo Securement",
    category: "Vehicle & Cargo Safety",
    summary: "The FMCSA securement rules: the forces your system must hold, the working-load-limit 50% rule, the minimum-tiedown count, a worked example you can run at the dock, and when to re-check.",
    version: "2",
    estMinutes: 18,
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

**The forces your system must hold (49 CFR 393.102).** Your securement must withstand at least **0.8 g forward** (a hard stop), **0.5 g rearward**, **0.5 g to each side**, and **0.2 g vertical** (upward). In plain terms: the freight has to stay put when you brake hard, accelerate, swerve, or hit a bump.

**It is on you.** The driver is responsible for knowing the cargo is properly distributed and secured before moving, and for keeping it that way en route. "The shipper loaded it" is not a defense if the load comes loose on your truck.`,
      },
      {
        order: 2,
        title: "Working load limit and the 50% rule",
        estMinutes: 5,
        bodyMarkdown: `**Working Load Limit (WLL)** is the maximum load a strap, chain, or anchor point is rated to hold. Use the **WLL marked on the device**; if it is unmarked, use the FMCSA default values in **49 CFR 393.108**. A tiedown's real WLL is its **lowest-rated part** — the strap, the hook, the winch, and the anchor point all count, and the weakest one wins.

**The 50% aggregate rule (393.106).** The combined WLL of all the tiedowns on an article must be **at least one-half (50%) of the weight of that article**.

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

**Some commodities have their own rules** in Subpart I — logs, metal coils, paper rolls, concrete pipe, intermodal containers, vehicles, and large boulders each have specific tiedown requirements. If you haul one, learn its section before you load.`,
      },
      {
        order: 4,
        title: "Doing the math at the dock",
        estMinutes: 5,
        bodyMarkdown: `Run both rules every time, then follow whichever is stricter.

**Step 1 — the 50% rule.** Halve the article weight. That is the minimum **aggregate WLL** your straps must add up to.

**Step 2 — the tiedown count.** Measure the article and apply 393.110.

**Worked example.** A **9,000 lb** steel rack, **12 ft** long, not blocked against forward movement. Each strap is marked **WLL 3,335 lb**.

- 50% rule: half of 9,000 = **4,500 lb** of aggregate WLL needed. Two straps give 6,670 lb, which clears it.
- Tiedown count: a 12-ft article needs **2 tiedowns for the first 10 ft, plus 1 more** for the extra 2 ft = **3 tiedowns**.

So two straps **pass** the weight rule but **fail** the count. You need **at least 3 straps** here. Three straps give 10,005 lb of aggregate WLL — well over the 4,500 lb minimum — and meet the count.

**The takeaway:** never stop at the 50% math. Count tiedowns by length too, and add edge protection and blocking so nothing slides.`,
      },
    ],
    questions: [
      { order: 1, question: "The combined working load limit of the tiedowns on an article must be at least:", options: ["one-quarter of the article's weight", "one-half of the article's weight", "equal to the article's weight", "twice the article's weight"], correctIndex: 1, explanation: "49 CFR 393.106 requires the aggregate WLL of the tiedowns to be at least 50% (one-half) of the weight of the secured article." },
      { order: 2, question: "After starting a trip with a freshly loaded trailer, you must first re-check securement within:", options: ["25 miles or 1 hour", "50 miles", "150 miles or 3 hours", "the first fuel stop"], correctIndex: 1, explanation: "Per 49 CFR 392.9, the first securement check is required within the first 50 miles, where loads settle and straps loosen most." },
      { order: 3, question: "After the first check, securement must be re-examined at least every:", options: ["600 miles or once per shift", "150 miles, 3 hours, or change of duty status", "300 miles or 6 hours", "state line you cross"], correctIndex: 1, explanation: "After the first 50-mile check, 49 CFR 392.9 requires re-examining the load at least every 150 miles, every 3 hours, or at each change of duty status — whichever comes first." },
      { order: 4, question: "A 12-ft article weighs 9,000 lb and is not blocked against forward movement. Each strap is rated WLL 3,335 lb. The minimum that legally secures it is:", options: ["two straps — that meets the 50% weight rule", "three straps — to meet both the 50% rule and the 393.110 count for a 12-ft article", "one strap rated over 4,500 lb", "four straps, one at each corner"], correctIndex: 1, explanation: "Half of 9,000 lb = 4,500 lb aggregate WLL, which two straps clear. But 393.110 needs 2 tiedowns for the first 10 ft plus 1 for the extra 2 ft = 3 for a 12-ft article. You must meet both rules, so the count governs: at least three straps." },
      { order: 5, question: "A tiedown assembly's working load limit is governed by:", options: ["the heaviest load it has ever held", "its lowest-rated part — strap, hook, winch, or anchor point", "the trailer's gross weight rating", "how tightly you ratchet it"], correctIndex: 1, explanation: "A tiedown's WLL is set by its weakest link — the lowest-rated of the strap/chain, the hardware, and the anchor point. Use the marked value, or the 393.108 defaults if it is unmarked." },
      { order: 6, question: "An 8-ft article weighing 1,400 lb (not blocked forward) requires at minimum:", options: ["1 tiedown", "2 tiedowns", "3 tiedowns", "no tiedowns if it is centered"], correctIndex: 1, explanation: "Under 393.110, an article longer than 5 ft (or heavier than 1,100 lb) needs at least 2 tiedowns. An 8-ft, 1,400-lb article exceeds both thresholds, so 2 is the minimum." },
    ],
  },

  // ─────────────────────────────────────────────────────────
  {
    slug: "reefer-cold-chain",
    title: "Reefer & Cold-Chain Protocols",
    category: "Vehicle & Cargo Safety",
    summary: "Pre-cooling, setting to the shipper's spec, proving the temperature with pulping and logs, airflow, breakdowns, and the FSMA food-transport rule.",
    version: "2",
    estMinutes: 14,
    passThreshold: 80,
    validityMonths: 12,
    sortOrder: 7,
    disclaimer: DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "Pre-cool and set to spec",
        estMinutes: 4,
        bodyMarkdown:
          "A reefer holds temperature; it does not pull a warm load down quickly. So **pre-cool the trailer** to the required temperature **before** you load. Loading product into a warm box is how a cold-chain claim starts.\n\nSet the reefer to the temperature the **shipper specifies on the rate confirmation or BOL**. The setpoint is the shipper's specification, **not your judgment** and not a round number you like.\n\nRun the **mode** the load calls for: **continuous** (the unit runs steadily, used for frozen and temperature-sensitive product) or **cycle-sentry / start-stop** (the unit cycles to hold a range, used for some fresh product). Confirm both the setpoint and the mode before you pull from the dock.\n\n> " + DISCLAIMER,
      },
      {
        order: 2,
        title: "Prove the temperature: pulping and logs",
        estMinutes: 4,
        bodyMarkdown:
          "Your protection on a temperature claim is **proof**.\n\n**Pulp the product** at pickup and at delivery: slide a probe thermometer between cases or into the designated spot and read the actual product temperature, then note it. Pulping shows the product was in spec when you took it and when you delivered it.\n\n**Keep the temperature record.** Modern reefers log a continuous temperature trace you can download or print. That trace is your evidence the cold chain held the whole run.\n\nIf the receiver rejects a load on temperature, a clean pulp reading at pickup plus a continuous in-spec trace is what protects you and the carrier. No record, no defense.",
      },
      {
        order: 3,
        title: "Airflow, breakdowns, and FSMA",
        estMinutes: 4,
        bodyMarkdown:
          "**Airflow** keeps the whole load in spec. Do not block the **return-air bulkhead** at the front, use the **floor channels** (do not floor-load solid product directly over the air chute), and leave room for air to move around and through the load.\n\nIf the reefer **breaks down**, treat it as urgent: call SRL/dispatch immediately, document the time and temperature, find the nearest repair, and protect the load (a transload may be needed). Minutes matter on a frozen or pharma load.\n\nUnder the FDA's **FSMA Sanitary Transportation of Human and Animal Food rule (21 CFR Part 1, Subpart O)**, the carrier and driver must **follow the shipper's written temperature and sanitary requirements** and be able to show they did. Clean equipment, the right setpoint, and the temperature record together meet that duty.",
      },
    ],
    questions: [
      { order: 1, question: "Before loading a reefer, you:", options: ["load first, then bring the box down to temp", "pre-cool the trailer to the required temperature", "run the unit warm to save fuel", "leave the doors open to vent"], correctIndex: 1, explanation: "Pre-cool the trailer before loading. A reefer holds temperature; it does not rapidly pull a warm load down — loading into a warm box is how a cold-chain claim starts." },
      { order: 2, question: "The reefer setpoint should be:", options: ["a safe round number like 34°F", "the temperature the shipper specifies on the rate con / BOL", "whatever holds the box steady", "matched to the outside air"], correctIndex: 1, explanation: "The setpoint is the shipper's written specification — not the driver's judgment and not a round number you like." },
      { order: 3, question: "\"Pulping\" a load means:", options: ["reading product temperature with a probe thermometer", "weighing each pallet", "checking the trailer's air-temp display", "counting the cases"], correctIndex: 0, explanation: "Pulping uses a probe thermometer to read ACTUAL product temperature at pickup and delivery — the trailer's air-temp display is not the same as product temp." },
      { order: 4, question: "To keep cold air moving through the load, you:", options: ["leave the return-air bulkhead clear and use the floor channels", "floor-load solid product over the air chute", "block the bulkhead to hold the cold in", "pack the load tight against the front wall"], correctIndex: 0, explanation: "Keep the return-air bulkhead clear and use the floor channels. Blocking the bulkhead or floor-loading solid over the chute starves airflow and creates hot spots." },
      { order: 5, question: "The federal rule governing temperature and sanitary transport of food is:", options: ["the Carmack Amendment", "the FSMA Sanitary Transportation rule", "IFTA", "the hours-of-service rules"], correctIndex: 1, explanation: "FSMA's Sanitary Transportation rule (21 CFR Part 1, Subpart O) requires carriers and drivers to follow and document the shipper's temperature and sanitary requirements." },
    ],
  },

  // ─────────────────────────────────────────────────────────
  {
    slug: "accident-procedures",
    title: "Accident Procedures & Emergency Response",
    category: "On-Road Safety",
    summary: "The first minutes at a crash, placing warning devices, required emergency equipment, post-accident testing triggers, and documenting the scene.",
    version: "2",
    estMinutes: 14,
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
          "When you are in or come upon a crash, the first minutes matter most.\n\n**Stop.** Leaving the scene of an accident you were involved in is a **major offense** that can disqualify your CDL. Pull clear only as far as safety requires.\n\n**Secure the scene.** Turn on your hazards, and protect the area from a secondary crash. Check for injuries and call **911**. Do not move a seriously injured person unless there is fire or immediate danger.\n\nStay calm, stay safe, and get help moving. Everything else (paperwork, calls to dispatch) comes after life safety.\n\n> " + DISCLAIMER,
      },
      {
        order: 2,
        title: "Warning devices and emergency equipment",
        estMinutes: 5,
        bodyMarkdown:
          "Stopped on or beside a roadway, you must put out **warning devices within 10 minutes** (49 CFR 392.22).\n\n**Placement of your 3 reflective triangles:**\n\n- **Two-lane, two-way road:** one about **10 ft** behind the truck toward approaching traffic, one about **100 ft** behind, and one about **100 ft** ahead.\n- **One-way or divided highway:** place them to the rear at about **10 ft, 100 ft, and 200 ft**.\n- **Hills, curves, or obstructions:** move the farthest device back **100 to 500 ft** so traffic sees the warning in time.\n\n**Required emergency equipment (49 CFR 393.95):** a charged and rated **fire extinguisher**, **spare fuses** (if your vehicle uses them), and **3 bidirectional reflective triangles**. Check them on your pre-trip so they are there when you need them.",
      },
      {
        order: 3,
        title: "Testing, documentation, and notifying",
        estMinutes: 4,
        bodyMarkdown:
          "**Post-accident drug & alcohol testing (49 CFR 382.303).** A DOT test is required when:\n\n- there is a **fatality** (always), or\n- the driver receives a **citation** for a moving violation arising from the crash **and** either a vehicle was **towed** from the scene **or** someone needed **medical treatment away from the scene**.\n\n**Document the scene:** photos of vehicles, positions, road and weather, plus names and contact info for the other parties and any witnesses. Exchange information, but **do not admit fault** at the scene; let the facts and the investigation speak.\n\n**Notify** your carrier and SRL promptly. The carrier records qualifying crashes in its **accident register**. Quick, accurate reporting protects you and helps SRL support the load and the customer.",
      },
    ],
    questions: [
      { order: 1, question: "Within how many minutes of stopping on a roadway must warning devices be placed?", options: ["5 minutes", "10 minutes", "30 minutes", "60 minutes"], correctIndex: 1, explanation: "49 CFR 392.22 requires warning devices within 10 minutes of stopping on or beside the roadway." },
      { order: 2, question: "How many reflective warning triangles are required emergency equipment?", options: ["1", "2", "3", "6"], correctIndex: 2, explanation: "49 CFR 393.95 requires 3 bidirectional reflective triangles (plus a fire extinguisher and spare fuses if used)." },
      { order: 3, question: "A post-accident DOT drug & alcohol test is ALWAYS required when:", options: ["Any fender-bender occurs", "There is a fatality", "Damage exceeds $1,000", "Only if you are at fault"], correctIndex: 1, explanation: "Under 382.303 a test is always required for a fatality; other cases depend on a citation plus tow-away or injury treated away from scene." },
      { order: 4, question: "After a crash, your immediate priority is to:", options: ["drive on if the damage looks minor", "secure the scene, check for injuries, and call 911", "exchange insurance and admit fault to speed the claim", "move every injured person off the road"], correctIndex: 1, explanation: "Secure the scene, render aid and call 911, then document — and do not admit fault. Only move the seriously injured if there is fire or immediate danger." },
      { order: 5, question: "Leaving the scene of a crash you were involved in is:", options: ["acceptable if the damage is minor", "a major offense that can disqualify your CDL", "allowed when no one is injured", "only a citation, not a CDL matter"], correctIndex: 1, explanation: "Leaving the scene is a major offense that carries CDL disqualification — regardless of how minor it looks or whether anyone was hurt." },
    ],
  },

  // ─────────────────────────────────────────────────────────
  {
    slug: "adverse-weather-defensive",
    title: "Adverse-Weather & Defensive Driving",
    category: "On-Road Safety",
    summary: "The hazardous-conditions rule, real stopping-distance numbers for a loaded truck, following distance, and handling ice, fog, wind, grades, and work zones.",
    version: "2",
    estMinutes: 15,
    passThreshold: 80,
    validityMonths: 12,
    sortOrder: 9,
    disclaimer: DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "The hazardous-conditions rule",
        estMinutes: 4,
        bodyMarkdown:
          "Federal rule **49 CFR 392.14** is direct: when conditions such as snow, ice, sleet, fog, mist, rain, dust, or smoke reduce visibility or traction, you must use **extreme caution** and **reduce speed**. When conditions become **sufficiently dangerous**, you must **discontinue** driving and stop until it is safe.\n\nPosted speed limits are set for **ideal** conditions, not bad ones. \"I was under the limit\" is no defense for driving too fast for ice or fog.\n\nNo load is worth a crash. The professional move in bad weather is to slow down, and to shut down when it crosses the line. Your judgment on the scene governs.\n\n> " + DISCLAIMER,
      },
      {
        order: 2,
        title: "Space and stopping",
        estMinutes: 6,
        bodyMarkdown: `A loaded combination is heavy and does not stop like a car. Three things add up to your **total stopping distance**:

- **Perception distance** — how far you roll while you notice the hazard (about **1.75 seconds**, roughly **140 ft at 55 mph**).
- **Reaction distance** — how far you roll while your foot moves to the brake (about **0.75-1 second**, roughly **60 ft at 55 mph**).
- **Braking distance** — how far the truck travels once the brakes grab (over **200 ft** for a loaded rig at 55 mph).

Add them up: a loaded truck at **55 mph needs about 400+ feet to stop** — **longer than a football field** — and at higher highway speed a fully loaded rig can take **nearly two football fields**. Here is the part that surprises new drivers: **an empty truck needs MORE braking distance, not less**, because there is less weight pushing the tires into the road for traction.

**Following distance (CDL-manual rule of thumb).** Leave **one second for every 10 ft of vehicle length below 40 mph, plus one more second above 40 mph**. A 70-75 ft combination needs about **7-8 seconds** in good conditions — and **more** in rain, snow, or fog. Treat it as a floor, not a target.

Look **far ahead**, keep an **escape path** to the side, and never let a four-wheeler crowd you into having no room. Space is the cushion that turns an emergency into a near miss.`,
      },
      {
        order: 3,
        title: "Specific hazards",
        estMinutes: 4,
        bodyMarkdown:
          "**Black ice:** bridges and overpasses freeze first because cold air reaches them from above and below. Suspect ice near 32°F even when the road looks wet.\n\n**Hydroplaning:** in standing water, tires can ride up on a film and lose contact. Slow down, avoid hard steering or braking.\n\n**Fog:** use **low beams** (high beams glare back), slow down, and never overdrive your sight distance.\n\n**High wind:** a high-sided trailer can roll, and the risk is **worst when the trailer is light or empty**. Slow down and grip the wheel for gusts on open ground and bridges.\n\n**Mountain grades:** select a **safe low gear before** you start down, use **engine braking** to save your service brakes, and know where the **runaway-truck ramps** are.\n\n**Work zones:** expect sudden slowdowns and workers near the lane. And wear your **seat belt** (49 CFR 392.16); it keeps you in the seat and in control.",
      },
    ],
    questions: [
      { order: 1, question: "Under 49 CFR 392.14, when weather makes the road sufficiently dangerous you must:", options: ["hold the posted limit to stay with traffic", "reduce speed, and stop driving until it is safe again", "turn on your flashers and keep rolling", "move to the shoulder and continue slowly"], correctIndex: 1, explanation: "392.14 requires extreme caution and reduced speed in hazardous conditions, and discontinuing driving until conditions are safe when they become sufficiently dangerous." },
      { order: 2, question: "A loaded truck at 55 mph on dry pavement needs roughly how much total distance to stop?", options: ["about 100 feet", "about 200 feet", "about 400 feet", "about 1,000 feet"], correctIndex: 2, explanation: "Total stopping distance = perception (~140 ft) + reaction (~60 ft) + braking (200+ ft) ≈ 400+ ft at 55 mph for a loaded rig — longer than a football field, and far more on a slick surface." },
      { order: 3, question: "Compared with a loaded truck, an empty truck's braking distance is generally:", options: ["shorter, because it weighs less", "longer, because less weight means less tire traction", "the same in every condition", "shorter only on dry roads"], correctIndex: 1, explanation: "Empty trucks often need MORE braking distance — less weight pressing the tires into the road means less traction, and brakes lock more easily. Don't assume an empty truck stops quicker." },
      { order: 4, question: "Your combination is about 70 ft long and you're running 55 mph in clear weather. The rule-of-thumb minimum following distance is about:", options: ["3 seconds", "5 seconds", "8 seconds", "12 seconds"], correctIndex: 2, explanation: "The CDL-manual rule of thumb: 1 second per 10 ft of length below 40 mph (70 ft = 7 seconds), plus 1 more above 40 mph = about 8 seconds. Add more in rain, snow, or fog." },
      { order: 5, question: "Which surface freezes first and is the classic black-ice trap?", options: ["the middle of a long straightaway", "bridges and overpasses", "freshly paved asphalt", "the inside of a tunnel"], correctIndex: 1, explanation: "Bridges and overpasses lose heat from above and below, so they freeze before the surrounding road. Suspect ice near 32°F even when the road just looks wet." },
      { order: 6, question: "Before a long, steep downgrade, the right move is to:", options: ["build speed early so you can coast the bottom", "select a safe low gear before you start down and use engine braking", "ride the service brakes steadily the whole way", "shift to neutral to save fuel"], correctIndex: 1, explanation: "Pick a safe low gear BEFORE the descent and use engine braking; riding the service brakes overheats and fades them, and coasting in neutral is unsafe and illegal for a CMV on a downgrade." },
    ],
  },

  // ─────────────────────────────────────────────────────────
  {
    slug: "roadside-inspections-csa",
    title: "Roadside Inspections & CSA",
    category: "On-Road Safety",
    summary: "The CVSA inspection levels, out-of-service criteria, the 7 CSA BASICs, and how a clean inspection (or a DataQs challenge) protects the carrier's score.",
    version: "2",
    estMinutes: 13,
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
          "Roadside inspections follow the **CVSA North American Standard** levels. The ones you will meet most:\n\n- **Level I — full inspection:** driver credentials **and** a complete vehicle inspection, including underneath.\n- **Level II — walk-around:** driver and vehicle, but only what can be checked without going under the truck.\n- **Level III — driver-only:** license, medical card, hours of service / ELD, and shipping papers, no vehicle component.\n\nHigher levels exist (special studies, vehicle-only, radioactive/hazmat, jurisdictional, and electronic inspections).\n\nWhatever the level, the officer is checking the same things you checked on your pre-trip: your **CDL and med card**, your **HOS/ELD**, your **shipping papers**, and the truck's **brakes, tires, lights, steering, and securement**. Being ready makes it quick.\n\n> " + DISCLAIMER,
      },
      {
        order: 2,
        title: "Out-of-service and the BASICs",
        estMinutes: 5,
        bodyMarkdown:
          "An inspection can place a **driver** out of service (for example, an HOS violation, no valid license or medical card, or signs of impairment) or the **vehicle** out of service (brakes out of adjustment, a flat or bad tire, steering or lighting defects). An out-of-service order stops the truck until the problem is fixed.\n\nViolations feed the carrier's **CSA Safety Measurement System**, scored across **7 BASICs**:\n\n- **Unsafe Driving**\n- **Hours-of-Service Compliance**\n- **Driver Fitness**\n- **Controlled Substances / Alcohol**\n- **Vehicle Maintenance**\n- **Hazardous Materials Compliance**\n- **Crash Indicator**\n\nYour conduct and your truck's condition score against the **carrier you run under**, which affects its inspection odds, insurance, and freight access.",
      },
      {
        order: 3,
        title: "Clean inspections and DataQs",
        estMinutes: 3,
        bodyMarkdown:
          "A **clean inspection helps** the carrier's safety record, so it is worth doing the small things: be courteous, have your license, med card, and papers ready, and keep the ELD current and the truck in shape.\n\nIf you receive a violation you believe is **inaccurate** (wrong driver, already-corrected defect, mistaken citation), the carrier can challenge it through **DataQs**, the FMCSA's online Request for Data Review system, with supporting evidence. Keep your copy of the inspection report and note anything that looks wrong so the office can file a challenge.\n\nThe roadside is where the carrier's safety reputation is built one stop at a time. Treat every inspection as a chance to put a clean one on the board.",
      },
    ],
    questions: [
      { order: 1, question: "A CVSA Level III inspection covers:", options: ["the full vehicle, including underneath", "the driver's credentials and documents only", "cargo weight and axle limits", "the engine and drivetrain"], correctIndex: 1, explanation: "Level III is the driver-credential inspection: license, medical card, hours of service/ELD, and shipping papers — no vehicle component. (The full-vehicle check is Level I.)" },
      { order: 2, question: "How many BASICs does the CSA Safety Measurement System use?", options: ["5", "6", "7", "9"], correctIndex: 2, explanation: "There are 7 BASICs, from Unsafe Driving through the Crash Indicator." },
      { order: 3, question: "A clean roadside inspection:", options: ["raises the carrier's risk score", "improves the carrier's safety record", "has no effect on CSA", "matters only for hazmat loads"], correctIndex: 1, explanation: "Clean inspections improve the carrier's CSA standing — which affects its inspection odds, insurance, and freight access. They are worth doing well." },
      { order: 4, question: "An inspection violation you believe is inaccurate is challenged through:", options: ["a DataQs Request for Data Review", "the bill of lading", "an IFTA filing", "a court lawsuit"], correctIndex: 0, explanation: "DataQs is the FMCSA's online system for challenging inaccurate inspection or crash data with supporting evidence." },
      { order: 5, question: "A CVSA Level I inspection is:", options: ["a driver-credentials check only", "a walk-around without going underneath", "the full driver-and-vehicle inspection, including underneath", "a hazmat-only inspection"], correctIndex: 2, explanation: "Level I is the complete inspection of both driver credentials and the full vehicle, including underneath. (A walk-around without going under is Level II.)" },
    ],
  },

  // ─────────────────────────────────────────────────────────
  {
    slug: "weigh-stations-size-weight",
    title: "Weigh Stations, Size & Weight & Your Registration",
    category: "On-Road Safety",
    summary: "Federal weight limits and the bridge formula, scaling and sliding tandems, plus the cab card and the fuel-and-mileage records you keep so the office can file.",
    version: "2",
    estMinutes: 14,
    passThreshold: 80,
    validityMonths: 12,
    sortOrder: 11,
    disclaimer: DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "Federal weight limits and the bridge formula",
        estMinutes: 5,
        bodyMarkdown:
          "On the Interstate system the federal limits are **80,000 lb** gross weight, **20,000 lb** on a single axle, and **34,000 lb** on a tandem-axle group, all subject to the **Federal Bridge Formula**, which limits how much weight you can carry based on the **spacing between axles** (axles closer together can carry less). Verify state-specific limits, which can differ.\n\nStates also set **size** limits: width is generally **8 feet 6 inches**, and height commonly around **13 feet 6 inches** (it varies by state, so check your route).\n\nIf you are **over** a legal weight or dimension, you need an **oversize/overweight permit**, and you must **carry it** and follow its route and time restrictions. Running overweight without a permit means fines and a stop.\n\n> " + DISCLAIMER,
      },
      {
        order: 2,
        title: "Scaling and weigh stations",
        estMinutes: 4,
        bodyMarkdown:
          "Before you trust your axle weights, **scale the truck** (a CAT scale gives you steer, drive, and trailer-tandem weights). If a group is over, you can **slide the trailer tandems** or **shift the fifth wheel** to move weight between the drive and trailer groups until each is legal, within the bridge-formula spacing.\n\nAt a **weigh station**, follow the signs. Many trucks use a bypass service (**PrePass** or **Drivewyze**) that signals via transponder or app whether to pull in or bypass, but if you are **directed in**, you pull in, every time. Bypassing an open scale you were directed into is a violation.\n\nGetting legal at the scale before you roll beats getting fined (and delayed) at the next one.",
      },
      {
        order: 3,
        title: "Your registration: the cab card and the records you keep",
        estMinutes: 5,
        bodyMarkdown:
          "Two registration programs touch the driver, even though the **office files them**.\n\n**Your cab card (IRP).** Carry it. The apportioned cab card lists the **jurisdictions the vehicle is registered in** and the **registered weight**. You may operate only **at or below** that registered weight; exceed it and you are subject to fines. An officer may ask to see it.\n\n**The records you keep (IFTA).** So the office can file the quarterly fuel-tax return and the registration correctly, **you** capture the source data: keep every **fuel receipt** with the date, location, and gallons, and record accurate **odometer readings and miles by state**. Modern ELDs/GPS capture much of the mileage, but the fuel receipts are on you.\n\nThe split is clean: **filing IFTA and IRP is the carrier office's job; the driver carries the cab card, stays within the registered weight, and keeps the fuel and mileage records.**",
      },
    ],
    questions: [
      { order: 1, question: "The standard maximum gross weight on the Interstate system is:", options: ["60,000 lb", "73,280 lb", "80,000 lb", "100,000 lb"], correctIndex: 2, explanation: "Federal limit is 80,000 lb gross, subject to axle limits and the bridge formula (state limits may differ)." },
      { order: 2, question: "The maximum weight on a tandem-axle group is generally:", options: ["20,000 lb", "34,000 lb", "40,000 lb", "48,000 lb"], correctIndex: 1, explanation: "The federal tandem-axle limit is 34,000 lb; a single axle is 20,000 lb." },
      { order: 3, question: "To shift weight off an overweight drive axle, you can:", options: ["slide the trailer tandems or shift the fifth wheel", "let air out of the drive tires", "move cargo into the sleeper", "nothing can be done at the scale"], correctIndex: 0, explanation: "Sliding the tandems or moving the fifth wheel redistributes weight between axle groups, within bridge-formula spacing. (Deflating tires or moving cargo into the cab doesn't make an axle group legal.)" },
      { order: 4, question: "Your apportioned cab card tells you:", options: ["the jurisdictions you're registered in and your registered weight", "your hours-of-service limits", "the IFTA tax you owe this quarter", "your medical-card expiration"], correctIndex: 0, explanation: "The IRP cab card lists the registered jurisdictions and the registered weight you may not exceed — it's not your HOS clock, your tax bill, or your med card." },
      { order: 5, question: "Filing the quarterly IFTA fuel-tax return is:", options: ["the driver's job each quarter", "the carrier office's job", "fully automatic from the ELD", "not required if you stay in one state"], correctIndex: 1, explanation: "The office files IFTA and IRP. The driver's role is to carry the cab card, obey the registered weight, and keep the fuel receipts and mileage records the office files from." },
    ],
  },

  // ─────────────────────────────────────────────────────────
  {
    slug: "tracking-check-calls",
    title: "Tracking & Check-Call Compliance",
    category: "SRL Operational Excellence",
    summary: "Why load visibility is part of the job, how to stay visible on an SRL load, and how tracking and check calls feed your carrier's Compass score.",
    version: "2",
    estMinutes: 11,
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
        estMinutes: 4,
        bodyMarkdown:
          "Two habits keep a load visible.\n\n**Let the technology see you.** Accept **tracking** when you take the load, use the **Carvan** mobile app and **The Caravan** carrier portal, and allow location sharing (ELD or geofence updates) where it is available. (Note the spelling: **Carvan** is the app, **The Caravan** is the portal.)\n\n**Make the check calls.** Confirm at **pickup**, give a **daily** update while in transit, confirm at **delivery**, and call **immediately** on any delay, breakdown, detention, or exception. A good check call gives three things: your **location**, your **ETA**, and the **issue** if there is one.\n\nIf you need help at any hour, **Marco Polo AI** is available 24/7 in the app.",
      },
      {
        order: 3,
        title: "Tracking, on-time, and your Compass score",
        estMinutes: 4,
        bodyMarkdown:
          "SRL rates every carrier with the **Compass score**, a 7-factor measure of how a carrier performs. **Tracking compliance is 15%** of that score, sitting right alongside on-time pickup, on-time delivery, and communication.\n\nThat means visibility is not just courtesy, it is **measured**. A driver who keeps the load visible and reports early **raises their carrier's Compass score**, and a stronger Compass score earns the carrier access to **better, higher-paying freight**.\n\nThe single best habit: **report a delay early.** A heads-up two hours out lets SRL manage the customer; a silent late delivery damages the carrier's record. Early and visible is how a professional driver protects the load, the customer relationship, and the carrier's standing.",
      },
    ],
    questions: [
      { order: 1, question: "On an SRL load, the check-call cadence is:", options: ["at pickup and at delivery only", "at pickup, daily in transit, at delivery, and on any delay", "once every 24 hours regardless of events", "whenever it's convenient"], correctIndex: 1, explanation: "Confirm at pickup, give a daily in-transit update, confirm at delivery, and call immediately on any delay or exception — with your location, ETA, and the issue." },
      { order: 2, question: "The SRL carrier mobile app is called:", options: ["Caravan", "Carvan", "Compass", "Marco Polo"], correctIndex: 1, explanation: "Carvan (no second 'a') is the carrier mobile app; The Caravan is the carrier portal." },
      { order: 3, question: "Tracking compliance is what share of the Compass score?", options: ["5%", "10%", "15%", "50%"], correctIndex: 2, explanation: "Tracking compliance is 15% of SRL's 7-factor Compass score." },
      { order: 4, question: "When you hit a delay, the right move is to:", options: ["wait and explain it after delivery", "stay quiet if you can still make the window", "report it early with your location, ETA, and the issue", "tell only the receiver"], correctIndex: 2, explanation: "Report it early — a heads-up lets SRL manage the customer; a silent late delivery hurts the carrier's record." },
      { order: 5, question: "Keeping your SRL load visible:", options: ["has no real effect on you", "raises your carrier's Compass score and freight access", "matters only on reefer loads", "lowers your settlement"], correctIndex: 1, explanation: "Visibility feeds the Compass score (tracking is 15%), and a higher score earns the carrier access to better, higher-paying freight." },
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
    summary: "The maneuver that causes the most preventable accidents, how to set up and back to a dock, and how to couple and uncouple a trailer without dropping it.",
    version: "2",
    estMinutes: 14,
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
          "Backing causes more preventable accidents than any other maneuver. Most are low-speed property damage, but they are almost all avoidable.\n\n**G.O.A.L. — Get Out And Look.** Before you back, and again partway through if anything changed, stop, get out, and walk the path. Clearance overhead, behind, and on both sides changes by the foot.\n\n**Back to the driver's side when you can.** A driver-side (left) back lets you see down the length of the trailer out your window. A blind-side (right) back hides the danger zone — avoid it, or get a spotter.\n\n**Signal and go slow.** Sound the horn before backing, use four-ways, idle speed only, and keep steering corrections small. When backing, the trailer goes the opposite way you turn the wheel — small input, then straighten.\n\n**Use a spotter** when one is available, agree on hand signals first, and stop the instant you lose sight of them.\n\n> " + DISCLAIMER,
      },
      {
        order: 2,
        title: "Setting up and working the dock",
        estMinutes: 4,
        bodyMarkdown:
          "A good back starts with a good setup. For a 45° or 90° alley dock, position the truck so the trailer can swing into the hole with room to straighten; pull forward to reset if the angle goes wrong rather than forcing it.\n\nUse your mirrors constantly and make small corrections. If you can't see, stop and G.O.A.L. again.\n\n**At the dock:** set the trailer brakes, chock the wheels, and engage the dock lock or wheel restraint if the facility has one — this stops trailer creep and a truck pulling away early while a forklift is still inside. Watch the dock plate gap. Follow the facility's red-light / green-light signals and their staff's direction. You are a guest at their dock — their rules win.",
      },
      {
        order: 3,
        title: "Coupling and uncoupling",
        estMinutes: 4,
        bodyMarkdown:
          "**Coupling:** line up the tractor squarely, back slowly until the fifth wheel just contacts the trailer, then under the kingpin until it locks. Confirm the lock three ways — a **tug test** (pull forward gently against the locked trailer), a **visual check** that the fifth-wheel jaws are fully closed around the kingpin with no gap, and that the trailer rode up onto the fifth wheel (no gap between them). Connect the glad-hand air lines and the electrical cord, then raise the landing gear all the way and stow the handle.\n\n**Uncoupling:** park on solid, level ground, set the brakes, and chock the wheels. Lower the landing gear until it just takes the weight (don't overcrank and lift the tractor). Disconnect the lines, pull the fifth-wheel release handle, and ease forward slowly. A dropped trailer or an unlocked fifth wheel that lets the trailer come off in transit is a catastrophic, career-defining failure — never skip the tug test.",
      },
    ],
    questions: [
      { order: 1, question: "Which maneuver causes the most preventable truck accidents?", options: ["backing", "head-on collisions", "highway merging", "rear-end collisions"], correctIndex: 0, explanation: "Low-speed backing accidents are the most common preventable incident — and nearly all are avoidable with G.O.A.L. and a spotter." },
      { order: 2, question: "\"G.O.A.L.\" means:", options: ["Go Or Aim Low", "Gear, Oil, Air, Lights", "Get Out And Look", "Grip On And Lean"], correctIndex: 2, explanation: "Get Out And Look — walk the path before and during a back; clearance changes by the foot." },
      { order: 3, question: "When you have a choice, you back toward:", options: ["the driver's (left) side", "the blind (right) side", "whichever side is quicker", "downhill"], correctIndex: 0, explanation: "A driver-side back lets you see down the length of the trailer out your window; a blind-side (right) back hides the danger zone — avoid it or use a spotter." },
      { order: 4, question: "After coupling, you confirm the fifth wheel is locked by:", options: ["the sound of it clicking", "a tug test and a visual check of the jaws", "weighing the trailer", "honking twice"], correctIndex: 1, explanation: "Tug-test forward against the locked trailer AND visually confirm the jaws are fully closed around the kingpin with no gap — sound alone is not proof." },
      { order: 5, question: "Before pulling the fifth-wheel release to uncouple, you:", options: ["just pull the pin and ease forward", "fully raise the landing gear first", "park level, chock the wheels, and set the landing gear on the weight", "leave it in gear with the engine running"], correctIndex: 2, explanation: "Level ground, chocks, and the landing gear taking the weight prevent a dropped trailer. (You set the gear to take the weight — you do NOT raise it before releasing.)" },
    ],
  },

  {
    slug: "distracted-fatigued-driving",
    title: "Distracted & Fatigued Driving",
    category: "On-Road Safety",
    summary: "The federal phone rules, the three kinds of distraction, and why fatigue is an impairment that only sleep fixes.",
    version: "2",
    estMinutes: 13,
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
          "Federal rules ban texting (49 CFR 392.80) and hand-held phone use (49 CFR 392.82) while driving a commercial vehicle. Hands-free only, with the phone mounted, reachable in a single touch, dialed before you roll.\n\nThe stakes are not just a ticket. Violations carry fines, hit your record, and feed the CSA Unsafe Driving BASIC — the same data carriers and insurers watch.\n\nThe physics: at 55 mph, taking your eyes off the road for about **5 seconds** means you travel roughly the length of a **football field** essentially blind. No message is worth that.\n\n> " + DISCLAIMER,
      },
      {
        order: 2,
        title: "The three kinds of distraction",
        estMinutes: 4,
        bodyMarkdown:
          "Distraction comes in three forms, and the worst tasks combine all three:\n\n- **Visual** — eyes off the road (reading a message, a GPS screen, paperwork).\n- **Manual** — hands off the wheel (eating, reaching, handling a device).\n- **Cognitive** — mind off the drive (a stressful call, daydreaming).\n\nProgramming the GPS, reviewing dispatch instructions, and eating are all things to do **stopped**, not rolling. Pre-program your route and read your messages before you put it in gear. If something needs your attention on the road, find a safe place and stop.",
      },
      {
        order: 3,
        title: "Fatigue is an impairment",
        estMinutes: 4,
        bodyMarkdown:
          "Drowsy driving impairs reaction and judgment much like alcohol. Hours-of-Service gives you the legal framework, but **you** manage your rest inside it.\n\n**Warning signs:** heavy eyelids, drifting in the lane, missing exits or signs, repeated yawning, can't-remember-the-last-few-miles. These mean stop now.\n\n**Only sleep fixes fatigue.** Coffee, loud music, an open window, and cranking the AC buy minutes, not safety. If you're fighting to stay awake, get to a safe place and rest — a late load beats a crash.\n\nWatch your circadian lows (roughly midnight–6 a.m. and mid-afternoon), eat and hydrate sensibly, and take untreated sleep apnea seriously — it's a common, fixable cause of chronic driver fatigue.",
      },
    ],
    questions: [
      { order: 1, question: "Federal rules on a hand-held phone while driving a CMV:", options: ["allow it anytime", "ban hand-held use and texting", "allow texting only at red lights", "don't apply to trucks"], correctIndex: 1, explanation: "49 CFR 392.80 bans texting and 392.82 bans hand-held use — hands-free only, mounted, reachable in a single touch, dialed before you roll." },
      { order: 2, question: "The three types of driving distraction are:", options: ["Visual, manual, cognitive", "Loud, bright, cold", "Phone, food, radio", "Day, night, dusk"], correctIndex: 0, explanation: "Visual (eyes off), manual (hands off), and cognitive (mind off) — the worst tasks combine all three." },
      { order: 3, question: "At 55 mph, looking away for about 5 seconds means traveling roughly:", options: ["10 feet", "The length of a football field", "One mile", "Half a block"], correctIndex: 1, explanation: "About a football field, essentially blind — no message is worth it." },
      { order: 4, question: "The only real cure for fatigue is:", options: ["Coffee", "Fresh air", "Sleep", "Loud music"], correctIndex: 2, explanation: "Stimulants and air buy minutes, not safety; only sleep restores you." },
      { order: 5, question: "You feel yourself nodding off mid-shift. The right move is:", options: ["Push to the next planned stop", "Get to a safe place and rest", "Open the window and speed up", "Drink an energy drink and continue"], correctIndex: 1, explanation: "Stop and rest — a late delivery is recoverable; a fatigue crash is not." },
    ],
  },

  {
    slug: "railroad-crossings-emergencies",
    title: "Railroad Crossings & Emergency Maneuvers",
    category: "On-Road Safety",
    summary: "Crossing tracks safely, what to do if you stall on them, and how to handle brake failure, blowouts, and skids.",
    version: "2",
    estMinutes: 14,
    passThreshold: 80,
    validityMonths: 12,
    sortOrder: 17,
    disclaimer: DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "Railroad crossings",
        estMinutes: 5,
        bodyMarkdown:
          "A loaded truck against a train is never a contest you win.\n\n**Never start across until you can clear.** Make sure there is room for your **entire** vehicle on the far side before you enter — never stop on the tracks waiting for traffic ahead.\n\n**Don't shift on the tracks.** A missed gear can leave you stalled on the rails — pick your gear before you cross and hold it.\n\n**Know who must stop.** Placarded hazmat loads and certain vehicles are required to stop at crossings; most other CMVs do not stop unless signed or signaled — know your load and obey the signs.\n\n**Mind your clearance.** Long-wheelbase and low-clearance combinations can hang up on a raised crossing — if in doubt, find another route.\n\n**If you stall on the tracks with a train coming:** get out and away immediately. Move toward the train at an angle (so flying debris from the impact goes away from you), and call the **emergency number posted at the crossing** or 911. Your life is worth more than the truck.\n\n> " + DISCLAIMER,
      },
      {
        order: 2,
        title: "Emergency maneuvers",
        estMinutes: 5,
        bodyMarkdown:
          "When something goes wrong, trained responses beat panic.\n\n**Steer, don't always brake.** It usually takes less distance to steer around a hazard than to stop for it. Counter-steer — turn to miss, then turn back — and stay off hard braking that could put you into a skid.\n\n**Brake failure:** downshift, use the engine brake / retarder, pump hydraulic brakes to build pressure if equipped, and look for a runaway-truck **escape ramp**. On a long grade, the time to manage your speed is at the **top**, not halfway down.\n\n**Tire blowout:** hold the wheel firmly with both hands, **stay off the brake**, ease off the throttle, let the rig slow on its own, then steer gently to the shoulder. Braking hard on a blowout is how you lose control.",
      },
      {
        order: 3,
        title: "Skid control and recovery",
        estMinutes: 4,
        bodyMarkdown:
          "Skids come from doing too much — too much brake, steering, throttle, or speed for the conditions.\n\n**Drive-wheel skid** (rear tires spin/slide): ease off the accelerator and counter-steer in the direction you want to go.\n\n**Front-wheel skid:** you can't steer until the front tires regain grip — ease off and let them slow.\n\n**Trailer skid / jackknife:** watch your mirrors for the trailer swinging out; ease off the brake and throttle so the trailer can fall back in line.\n\n**ABS:** in a hard stop, keep firm, steady pressure — the system pulses the brakes for you. Don't pump an ABS pedal.\n\nThe best skid is the one you prevent: slow down for rain, ice, curves, and grades before they force the issue.",
      },
    ],
    questions: [
      { order: 1, question: "Before crossing railroad tracks you must be sure:", options: ["your whole vehicle can clear the far side", "the gate arm is down", "no train is scheduled", "the crossing is paved"], correctIndex: 0, explanation: "Never enter unless your entire vehicle can clear the far side, and never stop on the tracks waiting for traffic ahead." },
      { order: 2, question: "Your truck stalls on the tracks and a train is coming. You:", options: ["stay and keep trying to restart", "get out and push the truck clear", "get out, move toward the train at an angle, and call the posted number", "wait in the cab for help"], correctIndex: 2, explanation: "Get out and away immediately. Move toward the train at an angle so impact debris flies away from you, and call the emergency number posted at the crossing or 911. The truck isn't worth your life." },
      { order: 3, question: "With a tire blowout, you:", options: ["brake hard immediately", "hold the wheel firmly, stay off the brake, ease off the throttle", "swerve sharply to the shoulder", "accelerate through it"], correctIndex: 1, explanation: "Hard braking or sharp swerving on a blowout causes loss of control — hold firm, stay off the brake, let the rig slow, then steer gently to the shoulder." },
      { order: 4, question: "To avoid a sudden hazard it is usually:", options: ["always better to hard-brake", "safer to steer around it than to hard-brake", "best to close the gap", "best to speed up"], correctIndex: 1, explanation: "Steering around a hazard usually takes less distance than stopping for it; counter-steer to miss, then straighten." },
      { order: 5, question: "In a hard stop with ABS you:", options: ["pump the pedal", "keep firm, steady pressure on the brake", "brake then fully release", "use only the trailer brake"], correctIndex: 1, explanation: "Hold firm, steady pressure — ABS pulses the brakes for you. Pumping an ABS pedal defeats the system." },
    ],
  },

  {
    slug: "trip-planning-routing",
    title: "Trip Planning & Truck-Legal Routing",
    category: "On-Road Safety",
    summary: "Planning a truck-legal route before you roll, avoiding low bridges and restrictions, and mapping the trip against your hours and fuel.",
    version: "2",
    estMinutes: 13,
    passThreshold: 80,
    validityMonths: 12,
    sortOrder: 18,
    disclaimer: DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "Plan the route before you roll",
        estMinutes: 4,
        bodyMarkdown:
          "A few minutes of planning prevents the worst days.\n\nUse a **truck-specific** GPS or map — one that accounts for your height, weight, length, and width — not a passenger-car app that will route you under a 12-foot bridge or down a no-truck parkway.\n\nKnow your numbers: a standard dry van/reefer stands about **13 feet 6 inches** tall; know your gross weight and length. Check the route for low bridges, weight-limited bridges, restricted or prohibited truck routes, and city no-truck zones.\n\nLay out fuel, scales, and rest stops along the way, and line the trip up against your appointment times so you aren't forced into a bad decision late.\n\n> " + DISCLAIMER,
      },
      {
        order: 2,
        title: "Low clearance, restrictions, and permits",
        estMinutes: 4,
        bodyMarkdown:
          "Bridge strikes are among the most expensive and most preventable incidents in trucking — and they are always the driver's responsibility.\n\n**Know your height and verify posted clearances.** If a posted clearance is anywhere near your height, or there's no posted sign and you're unsure, **stop and verify** — do not guess and do not \"try it slow.\"\n\n**Oversize / overweight loads** move under a permit that specifies the **route and the times** you may travel. Follow the permit exactly; deviating voids it.\n\n**Hazmat** has its own routing — required routes, and prohibited tunnels and city cores. If you carry it, you route for it.",
      },
      {
        order: 3,
        title: "Hours, fuel, and rest planning",
        estMinutes: 4,
        bodyMarkdown:
          "Map the trip against your **Hours-of-Service clock**, not just the miles: your remaining drive time, your 14-hour window, your 30-minute break, and your available on-duty hours.\n\n**Plan parking before you need it.** Running out of legal hours with no safe place to park is a common, avoidable trap — identify parking ahead of your limit, not at the last minute.\n\nPlan fuel stops where it's legal and economical, and keep the receipt (your carrier's fuel-tax records depend on it). Build slack for weather and traffic so a delay doesn't push you into an hours or parking violation.",
      },
    ],
    questions: [
      { order: 1, question: "For routing a truck you should use:", options: ["a truck-specific tool set to your height, weight, and length", "any passenger-car GPS app", "memory and road signs only", "whatever the shipper used"], correctIndex: 0, explanation: "A car app will route you under a low bridge or down a no-truck road. Use a truck-specific tool that knows your dimensions and weight." },
      { order: 2, question: "A standard dry van/reefer height to plan clearances around is about:", options: ["11 feet 0 inches", "13 feet 6 inches", "15 feet 0 inches", "10 feet 0 inches"], correctIndex: 1, explanation: "About 13'6\" — know your actual height and verify posted clearances against it." },
      { order: 3, question: "You're unsure a bridge has enough clearance. You:", options: ["stop and verify — don't guess", "take it slowly", "follow the car ahead", "let some air out of the tires"], correctIndex: 0, explanation: "Bridge strikes are preventable and always on the driver. Verify the clearance — never guess or \"try it slow.\"" },
      { order: 4, question: "Safe parking should be planned:", options: ["at the last minute", "ahead of your hours limit, before you run out", "only at familiar truck stops", "never — just keep driving"], correctIndex: 1, explanation: "Running out of legal hours with nowhere safe to park is an avoidable trap — identify parking ahead of your 11/14-hour limits." },
      { order: 5, question: "An oversize/overweight permit typically comes with:", options: ["no conditions", "a higher speed limit", "specific route and travel-time restrictions you must follow", "only a fee"], correctIndex: 2, explanation: "The permit dictates the route and the times you may travel; deviating from it voids the permit." },
    ],
  },

  {
    slug: "cargo-theft-security",
    title: "Cargo Theft & Security Awareness",
    category: "SRL Operational Excellence",
    summary: "Why your load is a target, how to park and lock to protect it, and how thieves use fictitious pickups — and what to do if a load is stolen.",
    version: "2",
    estMinutes: 14,
    passThreshold: 80,
    validityMonths: null,
    sortOrder: 19,
    disclaimer: DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "Why your load is a target",
        estMinutes: 4,
        bodyMarkdown:
          "Cargo theft is a multi-billion-dollar problem, and thieves are professionals who study freight.\n\n**High-value, high-demand goods are targeted** — food and beverage, household and consumer-packaged goods, electronics, and pharmaceuticals top the lists. A lot of SRL freight (refrigerated CPG, wellness products) is exactly what thieves want, because it's easy to resell and hard to trace.\n\n**The risky window is right after pickup.** A large share of thefts happen at unsecured parking and within the first hours and roughly first 200 miles after pickup — the \"red zone\" — when a tired driver stops close to the origin.\n\nKnowing you're a target is the first defense.\n\n> " + DISCLAIMER,
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
        title: "Fictitious pickups and what to do if it's stolen",
        estMinutes: 4,
        bodyMarkdown:
          "Not all theft is a broken lock. In a **fictitious** or **strategic** pickup, a thief poses as a legitimate carrier or driver — using a stolen or fake identity — and simply drives the load away from the shipper. It's the same identity-fraud and double-brokering problem you learned about, aimed at the cargo.\n\n**Protect against it:** confirm the load is really yours — your dispatch details and SRL paperwork should match what the shipper has; be suspicious of last-minute changes to the pickup, the destination, or who's collecting. If anything feels off, **stop and report it to SRL compliance@silkroutelogistics.ai before you move the freight.**\n\n**If a load is stolen:** report it **immediately** — police, SRL, and the broker. Recovery odds drop sharply by the hour, so speed matters more than anything else.",
      },
    ],
    questions: [
      { order: 1, question: "The highest-risk window for cargo theft is often:", options: ["at delivery", "the first hours and ~200 miles after pickup (the \"red zone\")", "only overnight on weekends", "there is no real pattern"], correctIndex: 1, explanation: "A large share of thefts happen close to origin soon after pickup — clear the red zone before your first long stop." },
      { order: 2, question: "A common cargo-theft target is:", options: ["gravel and sand", "empty trailers", "high-value goods — food, CPG, electronics, pharma", "outbound mail only"], correctIndex: 2, explanation: "Easy-to-resell, hard-to-trace goods — exactly what a lot of SRL freight (reefer CPG, wellness) is." },
      { order: 3, question: "A good anti-theft practice is to:", options: ["park in secure lit lots and use a kingpin / high-security lock", "leave it running to deter thieves", "post your route so people can find you", "hide a spare key on a tire"], correctIndex: 0, explanation: "Secure, lit parking plus real locks removes the opportunity most thefts depend on. Leaving it running or broadcasting your route does the opposite." },
      { order: 4, question: "A \"fictitious pickup\" is when:", options: ["the shipper cancels the load", "a thief poses as a legit carrier to take the load at pickup", "the receiver is closed on arrival", "the BOL has a typo"], correctIndex: 1, explanation: "It's identity fraud aimed at the cargo — confirm the pickup is really yours and watch for last-minute changes before you move freight." },
      { order: 5, question: "If your loaded trailer is stolen, you:", options: ["report it immediately to police, SRL, and the broker", "wait a day to see if it turns up", "handle it quietly yourself", "tell only the receiver"], correctIndex: 0, explanation: "Recovery odds drop sharply by the hour — report it immediately to everyone." },
    ],
  },

  {
    slug: "human-trafficking-awareness",
    title: "Human Trafficking Awareness",
    category: "Driver Qualification & Health",
    summary: "What trafficking is, why drivers are a key line of defense, how to recognize the signs, and how to report safely without intervening.",
    version: "3",
    estMinutes: 16,
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
          "Human trafficking — forced labor and sex trafficking — happens along the same highways, truck stops, motels, and rest areas drivers use every day. Victims are often hidden in plain sight.\n\nDrivers are the **eyes of the highway** and a recognized line of defense; the organization **Truckers Against Trafficking (TAT)** trains drivers exactly for this. Your role is not to be a hero or run a rescue — it is to **recognize and report**. A single call has freed people.\n\nThis training is increasingly **expected**: a number of states now require human-trafficking awareness for CDL drivers, and major carriers train to the TAT standard. More important than any mandate, you are often the only person positioned to notice. You do **not** have to be certain — your job is to notice and report, and let trained responders sort out the rest.\n\n> " + DISCLAIMER,
      },
      {
        order: 2,
        title: "Recognizing the signs",
        estMinutes: 4,
        bodyMarkdown:
          "No single sign proves trafficking, but patterns matter. Watch for someone who:\n\n- **Is not free to come and go** or is clearly controlled by another person.\n- **Lacks their own ID or documents** — someone else holds them.\n- **Appears coached, fearful, or isn't allowed to speak** for themselves.\n- Shows signs of abuse, malnourishment, or branding tattoos.\n- Is a **minor** involved in commercial sex (always trafficking).\n\nAt truck stops, watch for activity around the trucks — CB chatter offering \"commercial company,\" people moving between trucks at night, or knocks on cab doors. Trust your instincts; if it feels wrong, it may be.\n\n**\"Controlled by another person\" — what that really looks like.** A couple or family traveling together is normal. Control is different: one person **answers for** another, holds **all** their documents and money, and won't let them speak, be alone, or leave; the other looks fearful, coached, or is watched constantly. A minor involved in commercial sex is **always** trafficking.\n\n**When you're not sure, you still report.** You are not the investigator and you don't need proof. If the pattern feels wrong, make the call and let trained responders assess it. A wrong hunch costs a phone call; a missed one can cost a life.",
      },
      {
        order: 3,
        title: "Report — don't engage",
        estMinutes: 3,
        bodyMarkdown:
          "**Do not confront a trafficker or attempt a rescue.** It's dangerous for you and for the victim.\n\n**Know what \"don't engage\" means.** Reporting is your job; *intervening* is not. Trying to talk to the victim, offering them a ride, food, or money, confronting the controller, taking close-up photos, or following the vehicle are all **intervening** — they can tip off a trafficker, put the victim in worse danger, and put you at risk. Stay back, stay safe, and let the professionals act.\n\nInstead, quietly note what you can — descriptions, a vehicle and plate, the location and time — and call:\n\n- **National Human Trafficking Hotline: 1-888-373-7888**, or **text HELP to 233733** (texting the number alone does not reach a responder — include the keyword), or\n- **911** if someone is in immediate danger.\n\nMake the call from a safe spot, and let trained responders take it from there. Recognizing and reporting is the whole job.",
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
    ],
  },

  {
    slug: "workplace-dock-safety",
    title: "Workplace & Dock Safety",
    category: "Vehicle & Cargo Safety",
    summary: "Three-point contact and the falls that injure drivers, safe lifting and material handling, and staying safe around the dock and forklifts.",
    version: "2",
    estMinutes: 12,
    passThreshold: 80,
    validityMonths: 12,
    sortOrder: 21,
    disclaimer: DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "Slips, trips, falls, and three-point contact",
        estMinutes: 4,
        bodyMarkdown:
          "Falls getting into and out of the cab and trailer are a leading cause of driver injury — and they end with a wrenched knee, a broken wrist, or worse.\n\n**Always use three points of contact:** two hands and one foot, or two feet and one hand, in contact with the truck at all times when climbing in or out. **Face the equipment** — climb down like a ladder, never step off facing out, and **never jump down.** Jumping loads your knees, ankles, and back with your full weight plus momentum.\n\nKeep steps and grab handles clean and clear, and watch your footing for ice, fuel and oil spills, hoses, and uneven dock surfaces.\n\n> " + DISCLAIMER,
      },
      {
        order: 2,
        title: "Lifting and material handling",
        estMinutes: 4,
        bodyMarkdown:
          "Back injuries from poor lifting end careers slowly.\n\n**Lift with your legs, not your back:** feet planted, squat down, keep the load close to your body, and stand up with your legs. **Don't twist** while lifting — turn your feet instead. For anything heavy, awkward, or high, get help or use equipment (pallet jack, hand truck, or a lumper where that's the arrangement).\n\nKnow the basics of a pallet jack and hand truck, don't overreach or overload them, and pace repetitive handling so you don't grind down your back and shoulders. If touching the freight isn't your job, don't let yourself get talked into it unsafely.",
      },
      {
        order: 3,
        title: "On the dock",
        estMinutes: 4,
        bodyMarkdown:
          "The dock is someone else's workplace full of moving equipment.\n\n**Trailer can't move while it's worked:** chock the wheels and use the dock lock / wheel restraint so the trailer can't creep or get pulled away with a forklift inside — early departure and trailer creep have killed people.\n\n**Forklifts:** stay out of their path, make eye contact with the operator, and never assume they see you. Watch the dock-plate gap, and be aware of carbon-monoxide buildup in enclosed docks.\n\n**Wear the required PPE** — high-visibility vest, steel-toe boots, hard hat where the facility requires — and follow their rules. You're a guest; their safety program governs while you're on site.",
      },
    ],
    questions: [
      { order: 1, question: "Getting into or out of the cab, you always use:", options: ["three points of contact", "one hand on the wheel", "a quick jump down", "the door handle only"], correctIndex: 0, explanation: "Two hands and a foot, or two feet and a hand, at all times — face the equipment like a ladder and never jump down." },
      { order: 2, question: "The correct way to lift a heavy object is:", options: ["bend at the back and pull", "with your legs, load held close, no twisting", "as fast as possible", "one-handed to save time"], correctIndex: 1, explanation: "Squat, keep the load close, stand with your legs, and turn your feet instead of twisting. Get help or equipment for anything heavy or awkward." },
      { order: 3, question: "To keep a trailer from pulling away from the dock during loading, use:", options: ["wheel chocks and a dock lock / wheel restraint", "the parking brake alone", "nothing — the forklift weight holds it", "the trailer marker lights"], correctIndex: 0, explanation: "Chocks plus a dock restraint stop trailer creep and an early pull-away while a forklift is still inside — that scenario has killed people." },
      { order: 4, question: "Around a forklift on the dock you:", options: ["assume the operator sees you", "stay out of its path and make eye contact", "walk close behind it", "stand in the main aisle"], correctIndex: 1, explanation: "Never assume you're seen — stay clear of its path and make eye contact with the operator." },
      { order: 5, question: "Falls from the cab or trailer are:", options: ["rare and unavoidable", "only a winter problem", "a leading cause of driver injury", "not your responsibility"], correctIndex: 2, explanation: "Among the most common driver injuries, and almost entirely preventable with three-point contact and never jumping down." },
    ],
  },

  {
    slug: "coercion-professional-conduct",
    title: "Coercion, Whistleblower Protection & Professional Conduct",
    category: "SRL Operational Excellence",
    summary: "Your right to refuse unsafe or illegal driving, the protection that backs that right, and the professionalism that earns repeat freight.",
    version: "2",
    estMinutes: 12,
    passThreshold: 80,
    validityMonths: null,
    sortOrder: 22,
    disclaimer: DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "The coercion rule",
        estMinutes: 4,
        bodyMarkdown:
          "Federal law protects your right to drive legally. The FMCSA **coercion rule (49 CFR 390.6)** prohibits motor carriers, shippers, receivers, and brokers from coercing a driver to violate the safety regulations — Hours-of-Service, CDL rules, drug & alcohol rules, hazmat, and securement among them.\n\nIf anyone threatens your pay, your job, or your future loads to push you to drive over your hours or operate unsafely, that's **coercion** — and it's illegal. You may file a complaint with FMCSA, generally **within 90 days** of the incident.\n\nYou have the right to refuse to break the law, and SRL backs that right.\n\n> " + DISCLAIMER,
      },
      {
        order: 2,
        title: "Whistleblower protection",
        estMinutes: 3,
        bodyMarkdown:
          "Your refusal is protected. Under the **Surface Transportation Assistance Act (STAA)**, you cannot lawfully be fired, disciplined, or retaliated against for refusing to operate a vehicle that would violate a safety regulation, or for reporting a safety violation.\n\nA threat like \"run these hours or lose the account\" has no legal teeth. The law is on the side of the driver who refuses to drive illegally.\n\n**If you face retaliation, file with OSHA, which administers STAA complaints, within 180 days of the retaliatory act.** Keep the two clocks straight:\n\n- The **coercion** complaint (someone pressuring you to violate the rules) goes to **FMCSA within 90 days**.\n- The **STAA retaliation** complaint (being fired, disciplined, or punished after you refused or reported) goes to **OSHA within 180 days**.\n\nOSHA can order you reinstated with back pay. Knowing your protection, and the clock on it, is what lets you hold the line when you're pressured.",
      },
      {
        order: 3,
        title: "Professional conduct on an SRL load",
        estMinutes: 4,
        bodyMarkdown:
          "On an SRL load you represent both your carrier and SRL to the shipper and receiver. Professionalism is what turns one load into a lane.\n\n**Be on time, communicate, and be courteous.** Show up clean, follow each facility's rules, and don't argue at the dock — if there's a problem, work it through **dispatch and SRL**, not a confrontation with the staff in front of you.\n\n**Integrity:** accurate logs, honest paperwork, no shortcuts. The freight world is small and your record follows you.\n\nYour professionalism — and your tracked, Compass-scored performance — is what earns you access to repeat, better freight. Drivers who are easy to work with and consistently deliver get called first.",
      },
    ],
    questions: [
      { order: 1, question: "The FMCSA coercion rule (49 CFR 390.6) prohibits:", options: ["a carrier, shipper, receiver, or broker forcing you to violate safety rules", "speeding tickets", "parking at a rest area", "using a fuel card"], correctIndex: 0, explanation: "390.6 bans coercing a driver to break the safety regulations — HOS, CDL, drug/alcohol, hazmat, securement — under threat to pay, job, or future loads." },
      { order: 2, question: "A broker threatens to pull your loads unless you run past your legal hours. That is:", options: ["normal business", "your problem to solve", "coercion — reportable to FMCSA within 90 days", "required of you"], correctIndex: 2, explanation: "Threatening your livelihood to force a violation is coercion under 390.6 — file the coercion complaint with FMCSA within 90 days." },
      { order: 3, question: "You refuse to drive over your hours and are threatened with firing. You are:", options: ["out of luck", "protected from retaliation under the STAA (file with OSHA within 180 days)", "required to comply", "subject to a fine"], correctIndex: 1, explanation: "STAA protects you from retaliation for refusing to violate safety regs or for reporting them — the OSHA complaint deadline is 180 days (vs. 90 days for the FMCSA coercion complaint)." },
      { order: 4, question: "A problem with facility staff at the dock is handled by:", options: ["arguing it out on the spot", "contacting dispatch and SRL, not confronting staff", "leaving without telling anyone", "posting about it online"], correctIndex: 1, explanation: "Work problems through dispatch and SRL — don't confront facility staff in front of the dock." },
      { order: 5, question: "Your professionalism and tracked performance most directly affect:", options: ["nothing measurable", "your access to repeat, better freight", "only the weather", "the fuel price"], correctIndex: 1, explanation: "Carriers who are reliable, easy to work with, and who score well on Compass get called first for the better loads." },
    ],
  },
];
