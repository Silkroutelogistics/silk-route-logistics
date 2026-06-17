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
    summary: "Keeping your CDL and medical card valid, the notifications you owe your employer, and how the drug & alcohol program and Clearinghouse work.",
    version: "1",
    estMinutes: 16,
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
          "To drive a commercial vehicle in interstate commerce you must be medically certified. A certified medical examiner from the FMCSA National Registry performs the DOT physical and issues the **medical examiner's certificate** (your \"med card\").\n\nKeep it **current** and carry it (or, depending on your state, ensure your self-certification and the electronic record are on file with your licensing agency). A typical certificate is valid up to 24 months, less if a condition needs monitoring (verify your own expiration).\n\nIf your med card **lapses**, you are not medically qualified to drive a CMV, and your CDL can be downgraded by your state until you recertify. Track the expiration the same way you track your CDL and registration; do not let it surprise you on the road.",
      },
      {
        order: 3,
        title: "Drugs, alcohol, and the Clearinghouse",
        estMinutes: 5,
        bodyMarkdown:
          "The federal drug & alcohol program (49 CFR Part 382) sets hard rules for safety-sensitive (driving) functions.\n\n**Prohibited conduct** includes a blood alcohol concentration of **0.04 or higher**, using alcohol within 4 hours of going on duty, and any prohibited-drug use. **Refusing a required test counts as a positive.**\n\n**Six test types:** pre-employment, random, reasonable-suspicion, post-accident, return-to-duty, and follow-up.\n\n**The FMCSA Drug & Alcohol Clearinghouse** is the federal database of violations. You consent to a query, and a recorded violation **bars you from driving** until you complete the return-to-duty process with a Substance Abuse Professional. A violation does not quietly disappear; it is resolved through the process.",
      },
      {
        order: 4,
        title: "Disqualifying offenses (awareness)",
        estMinutes: 3,
        bodyMarkdown:
          "Some offenses cost you the CDL.\n\n**Major offenses** (DUI in any vehicle, leaving the scene of an accident, using a CMV in a felony, driving a CMV with a revoked CDL, causing a fatality through negligent operation) bring at least a **1-year disqualification** (3 years if carrying placarded hazmat). A **second** major offense is a **lifetime** disqualification.\n\n**Serious traffic violations** (excessive speeding 15+ mph over, reckless driving, improper or erratic lane changes, following too closely, texting or hand-held phone use while driving a CMV, violating a CMV traffic law in connection with a fatal accident) bring a **60-day** disqualification for a second within 3 years, **120 days** for a third.\n\n**Railroad-crossing** and **out-of-service-order** violations carry their own disqualification periods. The takeaway: your driving record on and off the clock is your livelihood.",
      },
    ],
    questions: [
      { order: 1, question: "Within how long must you notify your employer of a traffic conviction (any vehicle, any state)?", options: ["30 days", "60 days", "90 days", "Only if it was in the CMV"], correctIndex: 0, explanation: "49 CFR 383.31 requires notice to your employer within 30 days of a conviction for any traffic violation except parking." },
      { order: 2, question: "What is the maximum blood alcohol concentration allowed while performing safety-sensitive functions?", options: ["0.02", "0.04", "0.08", "Anything under 0.10"], correctIndex: 1, explanation: "Part 382 prohibits performing safety-sensitive functions at 0.04 BAC or higher." },
      { order: 3, question: "Refusing a required DOT drug or alcohol test is treated as:", options: ["No consequence", "A positive test / violation", "A warning only", "Allowed once per year"], correctIndex: 1, explanation: "Under Part 382 a refusal is treated the same as a positive result." },
      { order: 4, question: "A driver with an unresolved Clearinghouse drug/alcohol violation may:", options: ["Keep driving normally", "Not perform safety-sensitive functions until return-to-duty is complete", "Drive only locally", "Drive with a co-driver"], correctIndex: 1, explanation: "A recorded violation bars safety-sensitive functions until the return-to-duty process is completed." },
      { order: 5, question: "Your DOT medical certificate has expired with no valid card on file. You:", options: ["Can drive 30 more days", "Are not medically qualified to drive a CMV until you recertify", "Only need it for hazmat", "Are fine for short hauls"], correctIndex: 1, explanation: "Without a current medical certificate you are not medically qualified, and your CDL can be downgraded until you recertify." },
    ],
  },

  // ─────────────────────────────────────────────────────────
  {
    slug: "hazmat-awareness",
    title: "Hazmat & Dangerous Goods Awareness",
    category: "Hazardous Materials",
    summary: "How to recognize regulated dangerous goods, what the placards and papers mean, what an H endorsement covers, and what to do at a spill.",
    version: "1",
    estMinutes: 18,
    passThreshold: 80,
    validityMonths: 12,
    sortOrder: 3,
    disclaimer: DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "Recognizing dangerous goods",
        estMinutes: 5,
        bodyMarkdown:
          "Hazardous materials (hazmat in the US, dangerous goods in Canada) are substances that can harm people, property, or the environment in transport. The US rules are the Hazardous Materials Regulations, **49 CFR Parts 100-185**.\n\nMaterials are grouped into **9 UN hazard classes**: 1 Explosives, 2 Gases, 3 Flammable liquids, 4 Flammable solids, 5 Oxidizers and organic peroxides, 6 Toxic and infectious substances, 7 Radioactive, 8 Corrosives, 9 Miscellaneous.\n\nAs a driver you do not classify the material; the shipper does. Your job is to **recognize** it: the **placards** on the trailer, the **labels and markings** on the packages, and the **shipping paper** (the description with the UN number, proper shipping name, hazard class, and packing group). If the paperwork and the placards do not match the freight, stop and ask.\n\n> " + DISCLAIMER,
      },
      {
        order: 2,
        title: "Placards, papers, and the ERG",
        estMinutes: 5,
        bodyMarkdown:
          "**Placards.** Most hazmat requires placards once the aggregate gross weight reaches **1,001 lb** (the Table 2 threshold). The most dangerous materials (Table 1: certain explosives, poison gas, and the like) require placards in **any amount**. The placard tells everyone on the road what class is aboard.\n\n**Shipping papers.** They must be within your reach while driving and easily found in an emergency, kept on top of other papers or tabbed. They include the emergency response information.\n\n**The Emergency Response Guidebook (ERG)** is carried in the cab and gives first responders (and you) the initial isolation and protective actions for the material by its UN number or name.\n\nTo haul a **placarded** amount you need a **hazmat (H) endorsement** on your CDL, and the carrier needs to be registered with PHMSA. Hauling hazmat without the endorsement is a serious violation.",
      },
      {
        order: 3,
        title: "If something goes wrong",
        estMinutes: 4,
        bodyMarkdown:
          "At a leak, spill, or crash involving hazmat, the order is **protect, isolate, call**.\n\n**Protect yourself first.** Stop, stay **upwind and uphill**, and do not walk through or touch spilled material or vapor. You cannot help anyone if you are down.\n\n**Isolate.** Keep people away and use the ERG to find the initial isolation distance for the material.\n\n**Call.** Dial **911** and **CHEMTREC at 1-800-424-9300** for chemical emergency guidance, then notify your carrier and SRL.\n\nHazmat also carries a **security awareness** duty: watch for and report tampering, theft, or anyone showing unusual interest in your load. A hazmat load is a target.",
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
      { order: 1, question: "How many UN hazard classes are there?", options: ["6", "7", "9", "12"], correctIndex: 2, explanation: "There are 9 UN hazard classes, from explosives (1) through miscellaneous (9)." },
      { order: 2, question: "Which document gives a driver and first responders immediate emergency guidance for a hazmat load?", options: ["The bill of lading", "The Emergency Response Guidebook (ERG)", "The IFTA license", "The cab card"], correctIndex: 1, explanation: "The ERG, carried in the cab, gives initial isolation and protective actions by UN number or name." },
      { order: 3, question: "To haul a placarded amount of hazardous material, a driver needs:", options: ["Nothing extra", "A hazmat (H) endorsement on the CDL", "A passenger endorsement", "Only a TWIC card"], correctIndex: 1, explanation: "An H endorsement is required to transport placardable quantities of hazmat." },
      { order: 4, question: "At a hazmat spill, your first priority is to:", options: ["Clean it up yourself", "Protect yourself and isolate the area, then call 911 / CHEMTREC", "Drive to the nearest exit", "Hide the shipping papers"], correctIndex: 1, explanation: "Protect yourself (stop, stay upwind/uphill, do not contact the material), isolate, then call for help." },
      { order: 5, question: "The US emergency hotline for a chemical incident is:", options: ["411", "CHEMTREC, 1-800-424-9300", "The DOT main line", "Your dispatcher only"], correctIndex: 1, explanation: "CHEMTREC (1-800-424-9300) provides 24/7 chemical emergency response information; call 911 first for life safety." },
    ],
  },

  // ─────────────────────────────────────────────────────────
  {
    slug: "hazard-communication",
    title: "Hazard Communication: WHMIS & HazCom",
    category: "Hazardous Materials",
    summary: "Workplace chemical safety on the dock and in the warehouse: the GHS labels and pictograms, the Safety Data Sheet, and your right to know. (Not the transport placards.)",
    version: "1",
    estMinutes: 15,
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
          "A **GHS supplier label** carries: the product identifier, a **signal word**, hazard and precautionary statements, the **pictograms**, and the supplier's information.\n\nThe **signal word** ranks severity: **Danger** is the more severe hazard, **Warning** the less severe.\n\nThe **GHS pictograms** are red-bordered diamonds: flame (flammable), corrosion (corrosives), exclamation mark (irritant/harmful), health hazard (serious/long-term health effects), skull and crossbones (acute toxicity), gas cylinder (gases under pressure), exploding bomb (explosives), flame over circle (oxidizers), and the environment pictogram.\n\nInside a facility you may also see a simpler **workplace label** on a container a worker filled. Learn to read both, and never use product from an unlabeled container; report it.",
      },
      {
        order: 3,
        title: "The Safety Data Sheet (SDS)",
        estMinutes: 4,
        bodyMarkdown:
          "Every hazardous workplace chemical has a **Safety Data Sheet (SDS)** with a standardized **16 sections** in a fixed order.\n\nThe sections a driver or dock worker reaches for first:\n\n- **Section 1 Identification** (what it is, supplier, emergency phone)\n- **Section 2 Hazards** (what it can do)\n- **Section 4 First-aid measures** (skin, eye, inhalation, ingestion)\n- **Section 6 Accidental release** (what to do for a spill)\n- **Section 7 Handling and storage**\n- **Section 8 Exposure controls / PPE**\n\nThe facility must keep SDSs accessible to workers. If you are asked to handle a chemical you do not know, find its SDS first.",
      },
      {
        order: 4,
        title: "Your rights and what to do",
        estMinutes: 3,
        bodyMarkdown:
          "Hazard communication gives you concrete rights: to be **trained**, to **access** the labels and SDSs, and (especially under Canadian WHMIS) to **refuse unsafe work**.\n\nIf a chemical contacts your skin or eyes, go to the **SDS first-aid section** and act on it (most call for flushing with water); get medical help for anything serious. Report a leaking, damaged, or unlabeled container rather than handling it.\n\nAnd keep the two systems straight: the GHS pictograms on a drum are **workplace** hazard communication. They are **not** the transport placards on the trailer. Knowing the difference keeps you from misreading a load or a dock.",
      },
    ],
    questions: [
      { order: 1, question: "WHMIS (Canada) and HazCom (US) are about:", options: ["Trailer placards", "Workplace chemical safety (chemicals you handle)", "IFTA fuel tax", "CDL endorsements"], correctIndex: 1, explanation: "WHMIS and OSHA HazCom govern workplace chemical hazard communication, not transport placarding." },
      { order: 2, question: "Which document gives detailed handling, first-aid, and spill information for a workplace chemical?", options: ["The bill of lading", "The Safety Data Sheet (SDS)", "The ERG", "The rate confirmation"], correctIndex: 1, explanation: "The SDS provides standardized handling, first-aid, and accidental-release information." },
      { order: 3, question: "How many sections does a standardized (GHS) Safety Data Sheet have?", options: ["8", "12", "16", "20"], correctIndex: 2, explanation: "A GHS-aligned SDS has 16 standardized sections in a fixed order." },
      { order: 4, question: "On a GHS label, which signal word indicates the MORE severe hazard?", options: ["Warning", "Caution", "Danger", "Notice"], correctIndex: 2, explanation: "GHS uses two signal words: Danger (more severe) and Warning (less severe)." },
      { order: 5, question: "The GHS pictograms on a drum are the same as the placards on the trailer.", options: ["True", "False — they are different systems (workplace vs transport)", "True, only in Canada", "True, only for flammables"], correctIndex: 1, explanation: "Workplace GHS labels (WHMIS/HazCom) are a separate system from transport placards (HMR/TDG)." },
    ],
  },

  // ─────────────────────────────────────────────────────────
  {
    slug: "pre-post-trip-inspection",
    title: "Pre-Trip & Post-Trip Inspection + DVIR",
    category: "Vehicle & Cargo Safety",
    summary: "The legal duty to inspect, a systematic pre-trip walk-around, and the post-trip Driver Vehicle Inspection Report when you find a defect.",
    version: "1",
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
      { order: 1, question: "Before driving, 49 CFR 396.13 requires you to:", options: ["Nothing", "Review the last DVIR and confirm noted defects were corrected", "Call dispatch", "Weigh the truck"], correctIndex: 1, explanation: "396.13 requires the driver to review the previous DVIR and be satisfied any noted defects were repaired before driving." },
      { order: 2, question: "The in-cab air-brake portion of a pre-trip includes:", options: ["Only honking the horn", "Low-air warning, governor cut-in/out, leak-down, and parking-brake checks", "Checking the radio", "Nothing — air brakes are automatic"], correctIndex: 1, explanation: "The air-brake check covers the low-air warning, governor cut-in/out, applied-pressure leak-down, and the parking/tractor-protection function." },
      { order: 3, question: "You find a steer-axle tire with exposed cord. You should:", options: ["Drive carefully to the shop", "Not drive until it is corrected — it is an out-of-service condition", "Air it up and go", "Note it next week"], correctIndex: 1, explanation: "A tire with exposed cord (or below minimum tread on a steer axle) is an out-of-service condition; the truck does not roll until it's fixed." },
      { order: 4, question: "The post-trip Driver Vehicle Inspection Report (DVIR) is required when:", options: ["Every fuel stop", "A defect or deficiency affecting safe operation is found", "Only monthly", "Never"], correctIndex: 1, explanation: "Under 396.11 a DVIR must document any defect or deficiency that would affect safe operation." },
      { order: 5, question: "Your duty to be satisfied the vehicle is safe before driving comes from:", options: ["State law only", "49 CFR 392.7", "The bill of lading", "Nowhere in particular"], correctIndex: 1, explanation: "49 CFR 392.7 prohibits driving unless the driver is satisfied the vehicle is in safe operating condition." },
    ],
  },

  // ─────────────────────────────────────────────────────────
  {
    slug: "cargo-securement",
    title: "Cargo Securement",
    category: "Vehicle & Cargo Safety",
    summary: "The FMCSA securement rules: the forces your system must hold, the working-load-limit 50% rule, minimum tiedowns, and when to re-check.",
    version: "1",
    estMinutes: 16,
    passThreshold: 80,
    validityMonths: 12,
    sortOrder: 6,
    disclaimer: DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "The rules and the goal",
        estMinutes: 4,
        bodyMarkdown:
          "Cargo securement is governed by **49 CFR 393, Subpart I (393.100-393.136)**. The goal is simple: cargo must not shift, spill, leak, blow off, or fall during normal driving, including hard braking and evasive steering.\n\nThe rules set **performance criteria** the securement system must withstand (verify current values): about **0.8 g** of force forward (a hard stop), **0.5 g** rearward, and **0.5 g** to each side. In plain terms, the freight has to stay put when you brake hard or swerve.\n\nYou, the driver, are responsible for knowing the cargo is properly distributed and secured before you move and for keeping it that way en route. \"The shipper loaded it\" is not a defense if it comes loose on your truck.\n\n> " + DISCLAIMER,
      },
      {
        order: 2,
        title: "Working load limit and the 50% rule",
        estMinutes: 5,
        bodyMarkdown:
          "**Working Load Limit (WLL)** is the maximum load a tiedown or anchor point is rated to secure. It is marked on the device, or you use the FMCSA default values. Never load a tiedown past its WLL.\n\n**The aggregate rule:** the combined WLL of all the tiedowns on an article must be **at least 50% of the weight of that article**.\n\n**Minimum number of tiedowns** (verify current):\n\n- An article **5 ft or shorter** and **1,100 lb or lighter**: at least **1** tiedown.\n- An article **over 5 ft**, or **over 1,100 lb**: at least **2** tiedowns.\n- Longer articles: generally **2 tiedowns for the first 10 ft**, plus **1 more for each additional 10 ft** or fraction.\n\nUse **edge protectors** so straps are not cut on sharp corners, and add **blocking, bracing, or friction mats** so the load cannot slide.",
      },
      {
        order: 3,
        title: "Securing it and keeping it secure",
        estMinutes: 4,
        bodyMarkdown:
          "Match the method to the freight: **chains and binders** for steel and heavy machinery, **straps** for palletized and general freight, with **dunnage, blocking, and bracing** to fill voids and stop movement. A **headboard or bulkhead** protects you from a forward shift.\n\nSecurement is not set-and-forget. Re-check it:\n\n- Within the **first 50 miles** after loading,\n- Then at least every **150 miles, every 3 hours, or at each change of duty status**, whichever comes first.\n\nStraps loosen and loads settle, so the early check matters most.\n\nSome commodities have **their own rules** in Subpart I: logs, metal coils, paper rolls, concrete pipe, intermodal containers, vehicles, and large boulders. If you haul one of these, learn its specific requirements before you load.",
      },
    ],
    questions: [
      { order: 1, question: "The combined working load limit of your tiedowns must be at least what percent of the article's weight?", options: ["25%", "50%", "80%", "100%"], correctIndex: 1, explanation: "Subpart I requires aggregate WLL of at least 50% of the weight of the secured article." },
      { order: 2, question: "After loading, you must re-check cargo securement within the first:", options: ["25 miles", "50 miles", "100 miles", "150 miles"], correctIndex: 1, explanation: "The first re-check is required within 50 miles, when loads settle and straps loosen most." },
      { order: 3, question: "After the first check, securement must be re-examined at least every:", options: ["500 miles", "150 miles, 3 hours, or duty-status change — whichever is first", "Only at delivery", "Never again"], correctIndex: 1, explanation: "Re-check at least every 150 miles, 3 hours, or change of duty status, whichever occurs first." },
      { order: 4, question: "Working Load Limit (WLL) is:", options: ["The cargo's weight", "The maximum load a tiedown/anchor is rated to secure", "The truck's GVWR", "The axle weight limit"], correctIndex: 1, explanation: "WLL is the rated capacity of the tiedown or anchor point; aggregate WLL must meet the 50% rule." },
      { order: 5, question: "An article over 5 ft long and over 1,100 lb requires at minimum:", options: ["1 tiedown", "2 tiedowns", "4 tiedowns", "No tiedowns"], correctIndex: 1, explanation: "Articles longer than 5 ft or heavier than 1,100 lb require at least 2 tiedowns (more as length/weight increase)." },
    ],
  },

  // ─────────────────────────────────────────────────────────
  {
    slug: "reefer-cold-chain",
    title: "Reefer & Cold-Chain Protocols",
    category: "Vehicle & Cargo Safety",
    summary: "Pre-cooling, setting to the shipper's spec, proving the temperature with pulping and logs, airflow, breakdowns, and the FSMA food-transport rule.",
    version: "1",
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
      { order: 1, question: "Before loading a reefer, you should:", options: ["Load first, then cool", "Pre-cool the trailer to the required temperature", "Leave the doors open", "Run it warm to save fuel"], correctIndex: 1, explanation: "Pre-cool the trailer before loading; a reefer holds temperature rather than rapidly pulling a warm load down." },
      { order: 2, question: "The reefer setpoint should be:", options: ["Whatever feels right", "The temperature the shipper specifies on the rate con / BOL", "Always 34°F", "Matched to the outside air"], correctIndex: 1, explanation: "The setpoint is the shipper's written specification, not the driver's judgment." },
      { order: 3, question: "\"Pulping\" a load means:", options: ["Weighing it", "Measuring product temperature with a probe thermometer", "Checking the placard", "Counting pallets"], correctIndex: 1, explanation: "Pulping uses a probe thermometer to verify actual product temperature at pickup and delivery." },
      { order: 4, question: "To keep cold air moving through the load, you must NOT:", options: ["Block the return-air bulkhead or floor-load solid over the air chute", "Use the floor channels", "Leave space around the load", "Record temperatures"], correctIndex: 0, explanation: "Blocking the return-air bulkhead or solid floor-loading over the chute starves airflow and creates hot spots." },
      { order: 5, question: "The federal rule governing temperature and sanitary transport of food is:", options: ["The Carmack Amendment", "The FSMA Sanitary Transportation rule (21 CFR Part 1, Subpart O)", "IFTA", "49 CFR Part 395"], correctIndex: 1, explanation: "FSMA's Sanitary Transportation rule requires carriers/drivers to follow and document the shipper's temperature and sanitary requirements." },
    ],
  },

  // ─────────────────────────────────────────────────────────
  {
    slug: "accident-procedures",
    title: "Accident Procedures & Emergency Response",
    category: "On-Road Safety",
    summary: "The first minutes at a crash, placing warning devices, required emergency equipment, post-accident testing triggers, and documenting the scene.",
    version: "1",
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
      { order: 4, question: "After a crash you should:", options: ["Drive away if it seems minor", "Leave the scene to avoid delay", "Secure the scene, check injuries, call 911, document — and not admit fault", "Move all injured people immediately"], correctIndex: 2, explanation: "Secure the scene, render aid/call 911, document, and avoid admitting fault; only move the seriously injured if there is immediate danger." },
      { order: 5, question: "Leaving the scene of an accident you were involved in is:", options: ["Fine if the damage is minor", "A major offense that can disqualify your CDL", "Allowed if no one was injured", "A parking matter"], correctIndex: 1, explanation: "Leaving the scene is a major offense carrying CDL disqualification." },
    ],
  },

  // ─────────────────────────────────────────────────────────
  {
    slug: "adverse-weather-defensive",
    title: "Adverse-Weather & Defensive Driving",
    category: "On-Road Safety",
    summary: "The hazardous-conditions rule, space and stopping distance for a loaded truck, and handling ice, fog, wind, grades, and work zones.",
    version: "1",
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
        estMinutes: 5,
        bodyMarkdown:
          "A loaded combination is heavy and does not stop like a car.\n\n**Following distance:** a common rule is **one second for every 10 ft of vehicle length** at speeds under 40 mph, and **add one second** above 40 mph. A 70-75 ft combination needs roughly **7-8 seconds** in good conditions, and **more** in rain, snow, or fog.\n\n**Total stopping distance** is perception distance + reaction distance + braking distance. At highway speed a loaded truck can need **the length of a football field or more** to stop, and far more on a slick surface.\n\nLook **far ahead**, keep an **escape path** to the side, and never let a four-wheeler crowd you into having no room. Space is the cushion that turns an emergency into a near miss.",
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
      { order: 1, question: "Under 49 CFR 392.14, when conditions become sufficiently dangerous you must:", options: ["Keep your schedule", "Reduce speed, and discontinue (stop) when it is too dangerous", "Speed up to get through it", "Only slow down at night"], correctIndex: 1, explanation: "392.14 requires extreme caution and reduced speed, and stopping when conditions become sufficiently dangerous." },
      { order: 2, question: "Posted speed limits are set for:", options: ["All conditions", "Ideal conditions — you must slow for weather and traction", "Heavy trucks specifically", "Night driving only"], correctIndex: 1, explanation: "Limits assume ideal conditions; you are responsible for reducing speed in rain, snow, ice, or fog." },
      { order: 3, question: "Which surface freezes first and is the classic black-ice risk?", options: ["Valleys", "Bridges and overpasses", "Tunnels", "On-ramps only"], correctIndex: 1, explanation: "Bridges and overpasses lose heat from above and below and freeze before the surrounding road." },
      { order: 4, question: "In high wind, rollover risk is greatest with:", options: ["A fully loaded trailer", "A light or empty trailer", "A reefer only", "There is no difference"], correctIndex: 1, explanation: "A light or empty high-sided trailer is most prone to wind rollover; slow down for gusts." },
      { order: 5, question: "Before a long downgrade you should:", options: ["Ride the brakes all the way down", "Select a safe low gear before descending and use engine braking", "Coast in neutral", "Speed up to get it over with"], correctIndex: 1, explanation: "Choose a safe gear before the descent and use engine braking to avoid overheating the service brakes." },
    ],
  },

  // ─────────────────────────────────────────────────────────
  {
    slug: "roadside-inspections-csa",
    title: "Roadside Inspections & CSA",
    category: "On-Road Safety",
    summary: "The CVSA inspection levels, out-of-service criteria, the 7 CSA BASICs, and how a clean inspection (or a DataQs challenge) protects the carrier's score.",
    version: "1",
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
      { order: 1, question: "A CVSA Level III inspection checks:", options: ["The whole vehicle, including underneath", "The driver only (license, med card, HOS, paperwork)", "Cargo weight", "The engine"], correctIndex: 1, explanation: "Level III is a driver-credential inspection: license, medical card, hours of service/ELD, and documents." },
      { order: 2, question: "How many BASICs does the CSA Safety Measurement System use?", options: ["5", "6", "7", "9"], correctIndex: 2, explanation: "There are 7 BASICs, from Unsafe Driving through the Crash Indicator." },
      { order: 3, question: "A clean roadside inspection:", options: ["Hurts the carrier", "Has no effect", "Helps the carrier's safety score", "Only matters for hazmat"], correctIndex: 2, explanation: "Clean inspections improve the carrier's CSA standing; they are worth doing well." },
      { order: 4, question: "A violation you believe is inaccurate can be challenged through:", options: ["The bill of lading", "DataQs (the FMCSA Request for Data Review)", "IFTA", "A lawsuit only"], correctIndex: 1, explanation: "DataQs is the FMCSA system for challenging inaccurate inspection or crash data with evidence." },
      { order: 5, question: "A CVSA Level I inspection is:", options: ["Driver-only", "A walk-around only", "The full driver + vehicle inspection, including underneath", "Radioactive materials only"], correctIndex: 2, explanation: "Level I is the complete inspection of both driver credentials and the full vehicle." },
    ],
  },

  // ─────────────────────────────────────────────────────────
  {
    slug: "weigh-stations-size-weight",
    title: "Weigh Stations, Size & Weight & Your Registration",
    category: "On-Road Safety",
    summary: "Federal weight limits and the bridge formula, scaling and sliding tandems, plus the cab card and the fuel-and-mileage records you keep so the office can file.",
    version: "1",
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
      { order: 3, question: "To shift weight off an overweight drive axle, you can:", options: ["Only remove cargo", "Slide the trailer tandems or shift the fifth wheel", "Deflate the tires", "Nothing can be done"], correctIndex: 1, explanation: "Sliding the tandems or moving the fifth wheel redistributes weight between axle groups, within bridge-formula spacing." },
      { order: 4, question: "Your apportioned cab card tells you:", options: ["Your hours of service", "The jurisdictions you're registered in and the registered weight you may not exceed", "The IFTA tax owed", "Your medical card expiration"], correctIndex: 1, explanation: "The IRP cab card lists registered jurisdictions and the registered weight; you may operate only at or below it." },
      { order: 5, question: "Filing the quarterly IFTA fuel-tax return is:", options: ["The driver's job each quarter", "The carrier office's job — the driver keeps the fuel receipts and mileage records", "Fully automatic", "Not required"], correctIndex: 1, explanation: "The office files IFTA/IRP; the driver's role is to carry the cab card, obey the registered weight, and keep fuel + mileage records." },
    ],
  },

  // ─────────────────────────────────────────────────────────
  {
    slug: "tracking-check-calls",
    title: "Tracking & Check-Call Compliance",
    category: "SRL Operational Excellence",
    summary: "Why load visibility is part of the job, how to stay visible on an SRL load, and how tracking and check calls feed your carrier's Compass score.",
    version: "1",
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
      { order: 1, question: "On an SRL load, you should make a check call:", options: ["Only at delivery", "At pickup, daily in transit, at delivery, and immediately on any delay/exception", "Once a week", "Only if dispatch asks"], correctIndex: 1, explanation: "Confirm at pickup, daily in transit, at delivery, and call immediately on any delay or exception with location, ETA, and the issue." },
      { order: 2, question: "The SRL carrier mobile app is called:", options: ["Caravan", "Carvan", "Compass", "Marco Polo"], correctIndex: 1, explanation: "Carvan (no second 'a') is the carrier mobile app; The Caravan is the carrier portal." },
      { order: 3, question: "Tracking compliance is what share of the Compass score?", options: ["5%", "10%", "15%", "50%"], correctIndex: 2, explanation: "Tracking compliance is 15% of SRL's 7-factor Compass score." },
      { order: 4, question: "When you hit a delay, the right move is to:", options: ["Wait and explain it later", "Report it early with your location, ETA, and the issue", "Say nothing if you can still make it", "Tell only the receiver"], correctIndex: 1, explanation: "Early reporting lets SRL manage the customer; a silent late delivery hurts the carrier's record." },
      { order: 5, question: "Keeping your load visible on an SRL load:", options: ["Has no real effect", "Raises your carrier's Compass score and access to better freight", "Only matters for reefer loads", "Lowers your pay"], correctIndex: 1, explanation: "Visibility feeds the Compass score (tracking is 15%), and a higher score earns access to better freight." },
    ],
  },
];
