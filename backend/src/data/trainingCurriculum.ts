// v3.8.ana — SRL Driver Academy Sprint T3 starter curriculum (seed source).
//
// This module is the INITIAL source of truth for course content. It is loaded
// into the training_courses / training_lessons / training_questions tables by
// scripts/seed-training-courses.ts (idempotent upsert by course slug). After
// the T7 authoring UI ships, the DB rows become the live source and this file
// is the baseline.
//
// CONTENT STATUS: first draft for Wasi review (per the §13.3 Item 193 locked
// decision "Claude drafts, Wasi reviews"). Regulatory facts are stated
// conservatively with governing-reg citations + "verify current" caveats; the
// per-course disclaimer is shown by the player. Re-running the seed after any
// edit re-applies it (idempotent).

import { EXPANSION } from "./trainingCurriculumExpansion";

export interface CurriculumQuestion {
  order: number;
  question: string;
  options: string[]; // exactly 4
  correctIndex: number; // 0-3
  explanation: string;
}

export interface CurriculumLesson {
  order: number;
  title: string;
  bodyMarkdown: string;
  estMinutes: number;
}

export interface CurriculumCourse {
  slug: string;
  title: string;
  category: string;
  summary: string;
  version: string;
  estMinutes: number;
  passThreshold: number; // percent
  validityMonths: number | null; // null = no expiry
  sortOrder: number;
  disclaimer: string;
  lessons: CurriculumLesson[];
  questions: CurriculumQuestion[];
}

export const TRAINING_DISCLAIMER =
  "This course is general educational guidance, not legal or compliance advice. Regulations change and vary by jurisdiction. Always verify against current FMCSA, OSHA, Transport Canada, and your carrier's policies before you rely on it.";

// v3.8.anf — the original 5 starter courses. IFTA + IRP are retained here as the
// record of what was authored, but EXCLUDED from the seeded CURRICULUM below
// (they are dispatch/office tasks, not driver — their driver-slices fold into the
// new "Weigh Stations, Size & Weight" course). ELD/HOS, Detention, and Fraud are
// kept and re-sorted into the recalibrated driver-track ordering.
const BASE_CURRICULUM: CurriculumCourse[] = [
  // ─────────────────────────────────────────────────────────
  {
    slug: "eld-hos",
    title: "ELD & Hours of Service",
    category: "Hours & Electronic Logs",
    summary: "The federal Hours of Service limits, the short-haul and 16-hour exceptions, the adverse-driving exception, how your ELD records duty status, sleeper-berth splits, and what to do when the device fails.",
    version: "4",
    estMinutes: 30,
    passThreshold: 80,
    validityMonths: 12,
    sortOrder: 1,
    disclaimer: TRAINING_DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "The core driving limits",
        estMinutes: 7,
        bodyMarkdown:
          "Hours of Service (HOS) rules are set by the FMCSA under 49 CFR Part 395. They exist to keep tired drivers off the road. Three limits sit at the center of property-carrying HOS.\n\n**11-hour driving limit.** After 10 consecutive hours off duty, you may drive a maximum of 11 hours.\n\n**14-hour window.** You cannot drive after the 14th consecutive hour following the start of your shift. Off-duty time during the day (a lunch break, for example) does *not* stop or extend this 14-hour clock. Only the sleeper-berth provision (covered later) can pause it.\n\n**30-minute break.** You must take a 30-minute break once you have driven 8 cumulative hours without at least a 30-minute interruption. The break can be off-duty, sleeper, or on-duty-not-driving time.\n\n**Adverse driving conditions.** If unforeseen conditions (a sudden snow squall, dense fog, a crash that closes the road) keep you from safely finishing a run you could normally complete, you may drive up to **2 extra hours**. Under the current rule this stretches **both** the 11-hour driving limit (to 13) **and** the 14-hour window (to 16). It applies only to conditions you did *not* know and could not reasonably have known about when you were dispatched. Traffic you already knew was heavy, a closure that was on the map, or a slow shipper do *not* count. Use only the extra time you actually need, and it never extends your 30-minute break or your weekly 60/70-hour limit.\n\n[[figure:adverse-driving-extension]]\n\n**Each day resets — the week does not.** On a multi-day trip, every time you take **10 consecutive hours off duty** (or a valid sleeper split) you start the next day with a **fresh 11-hour driving limit and a fresh 14-hour window**. What does *not* reset that easily is your weekly 60/70-hour total, which keeps adding up day over day until you take a 34-hour restart (next lesson).\n\n[[figure:hos-daily-clock]]\n\n> " + TRAINING_DISCLAIMER,
      },
      {
        order: 2,
        title: "The weekly limits and the 34-hour restart",
        estMinutes: 4,
        bodyMarkdown:
          "On top of the daily limits, you are capped on a rolling weekly basis:\n\n- **60 hours in 7 consecutive days**, or\n- **70 hours in 8 consecutive days**\n\nWhich one applies depends on whether your carrier operates every day of the week. These count *on-duty* time, not just driving.\n\n**The 34-hour restart** is optional. If you take at least 34 consecutive hours off duty (off-duty and/or sleeper berth), your 60/70-hour clock resets to zero. You do not have to use a restart, but it is the cleanest way to start a fresh week. Plan it around your reset so you are not stuck waiting on hours mid-week.\n\nThink of the limits as a stack: the 11-hour and 14-hour limits govern your day, the 60/70-hour limit governs your week, and the restart clears the week.",
      },
      {
        order: 3,
        title: "Sleeper-berth splits",
        estMinutes: 5,
        bodyMarkdown:
          "The sleeper-berth provision lets you split your required off-duty time into two periods, and the qualifying periods do not count against your 14-hour window.\n\nYou may split the 10 hours as **7/3** or **8/2**:\n\n- One period of **at least 7 consecutive hours in the sleeper berth**, paired with\n- A second period of **at least 2 consecutive hours** off duty or in the sleeper berth\n- The two periods must add up to **at least 10 hours**\n\n**Why it matters: neither qualifying period counts against your 14-hour window.** That effectively recalculates your window and lets you keep working later into the day than a straight 14 would allow.\n\n**A simple example.** You come on duty at 6:00 a.m. and drive through the morning. At noon you take a qualifying **7-hour sleeper break** (noon to 7:00 p.m.). Because that 7 hours is excluded from the window, you are not forced to stop at the 8:00 p.m. cutoff a straight 14 would give you. You can drive again that evening, then take a **3-hour** off-duty or sleeper period to complete the pairing. The 7 and the 3 add up to your 10.\n\n[[figure:sleeper-berth-split-73]]\n\nThe exact recalculation is genuinely tricky, and when more than one pairing is possible the rule is to use the pairing with the **fewest violations**. **Let your ELD do the math and confirm it before you rely on it.** New drivers should walk a split through with a dispatcher or trainer before depending on it to make a delivery window.\n\n**About 6/4 and 5/5 splits.** You may hear about more flexible splits (6/4, 5/5) or pausing the 14-hour window for a few hours. As of 2026 those are **FMCSA pilot programs still in testing, not legal for general use.** Only **8/2 and 7/3** are valid today, unless your carrier is an approved pilot participant and has authorized you. Never run a 6/4 or 5/5 split, or pause your 14, based on something you heard at a truck stop.",
      },
      {
        order: 4,
        title: "How the ELD records your day",
        estMinutes: 7,
        bodyMarkdown: `An Electronic Logging Device (ELD) connects to the engine and automatically records driving time, so duty status is harder to falsify than paper logs. Most drivers who must keep records of duty status (RODS) have to use a registered ELD.

**The short-haul exception (49 CFR 395.1(e)(1)).** This is the big one. If you operate within a **150 air-mile radius** of your normal work-reporting location and **return there within 14 hours**, you may use a simple **time record** (time in, time out, total hours) instead of RODS or an ELD, and you are **not required to take the 30-minute break**. The **11-hour driving limit still applies**, and the carrier keeps the time records for **6 months**. Other ELD exemptions include pre-2000 engine vehicles, driveaway-towaway operations, and drivers who keep RODS no more than 8 days in any 30-day period. Confirm an exemption actually applies before you rely on it — misusing short-haul is a common violation.

**How to confirm short-haul actually applies — today, this shift.** It is a daily test, not a permanent status. Before you lean on it, check ALL of these for THIS shift:

- You start and **return to your normal work-reporting location** (the same place you began).
- You stay within the **150 air-mile radius** (air miles are straight-line distance, not odometer miles).
- You are **released from duty within 14 hours** of coming on.
- You take at least **10 consecutive hours off** between shifts, and the **11-hour driving limit still applies**.

If even one of these fails on a given day — a load runs you 160 air-miles out, or your shift stretches past 14 hours — you are **not short-haul that day** and you owe a full RODS/ELD record and the 30-minute break for that day. The exception is decided shift by shift.

[[figure:short-haul-daily-test]]

**The 16-hour "big day" exception (49 CFR 395.1(o)).** Once every 7 days, a driver who returns to the same normal work-reporting location and is released there may extend the 14-hour window to 16 hours. It is narrow: the carrier must have released you at that location on your previous five shifts, you must be released within 16 hours of coming on duty, and you cannot have used the exception in the last six days. It extends the window only. Your 11-hour driving limit does not change. Treat it as an occasional tool, not an everyday plan.

You are responsible for selecting the correct duty status: off duty, sleeper berth, driving, or on-duty-not-driving. The device records the driving; you annotate the rest. Review and certify your logs every day. Driving the truck without logging in shows up as Unidentified Driver time that you must review and accept or reject. You, not the carrier, approve any edits to your record, and a carrier may never push you to certify a log you know is false. Uncertified logs and unassigned driving time are easy roadside findings.`,
      },
      {
        order: 5,
        title: "Malfunctions, personal conveyance, and yard moves",
        estMinutes: 5,
        bodyMarkdown:
          "**ELD malfunction.** If your ELD fails, note the malfunction, and you may keep paper logs for up to 8 days. Reconstruct your record of duty status for the current 24-hour period and the prior 7 days. Notify your carrier (generally within 24 hours); the carrier must repair or replace the device within 8 days.\n\n**Personal conveyance (PC).** This is off-duty movement of the truck for your own personal purpose, not advancing the load (for example, driving to a restaurant or a safe place to rest after being loaded). It does not consume driving hours, but it must be genuinely personal. Misusing PC to make up driving time is a common violation.\n\n**Yard moves.** Moving the truck within a private yard or terminal is recorded as on-duty-not-driving (a special driving category), not as line-haul driving.\n\nThe most common roadside HOS violations are exceeding the 11 or 14-hour limits, missing the 30-minute break, false logs, and form-and-manner errors. Exceeding the 11-hour, 14-hour, or 60/70-hour limit is an out-of-service violation: the inspector parks you and the truck until you have the hours to be legal again, and it puts CSA points on both you and your carrier. A false log is treated as a serious offense, not a paperwork slip. Clean, certified logs are your best defense.",
      },
    ],
    questions: [
      {
        order: 1,
        question: "You've driven 11 hours since your last 10-hour break and you're still 2 hours inside your 14-hour window. Can you keep driving?",
        options: ["Yes — you still have time left in the 14-hour window", "No — you've hit the 11-hour driving limit", "Yes, if you switch to on-duty-not-driving", "Yes, for one more hour only"],
        correctIndex: 1,
        explanation: "The 11-hour driving limit and the 14-hour window are separate limits. Even with window time left, once you have driven 11 hours you cannot drive again until you take another 10 consecutive hours off (49 CFR 395.3).",
      },
      {
        order: 2,
        question: "Does taking a 2-hour off-duty lunch extend your 14-hour driving window?",
        options: [
          "Yes, any off-duty time pauses the 14-hour clock",
          "No, only a qualifying sleeper-berth period can pause the 14-hour window",
          "Yes, but only up to 1 hour",
          "Only if you note it as personal conveyance",
        ],
        correctIndex: 1,
        explanation: "Ordinary off-duty time does not stop the 14-hour clock. Only the sleeper-berth provision can effectively pause it.",
      },
      {
        order: 3,
        question: "When is the 30-minute break required?",
        options: [
          "After 8 cumulative hours of driving without a 30-minute interruption",
          "After 8 hours on duty",
          "Every 4 hours of driving",
          "Only on trips over 500 miles",
        ],
        correctIndex: 0,
        explanation: "The break is triggered by 8 cumulative hours of driving time, not on-duty time, and can be satisfied by 30 minutes off-duty, sleeper, or on-duty-not-driving.",
      },
      {
        order: 4,
        question: "Which is a valid sleeper-berth split?",
        options: ["6 hours + 4 hours", "5 hours + 5 hours", "7 hours sleeper + 3 hours off duty", "9 hours + 1 hour"],
        correctIndex: 2,
        explanation: "Valid splits are 7/3 or 8/2, with the longer period of at least 7 hours in the sleeper berth and the total at least 10 hours.",
      },
      {
        order: 5,
        question: "You took 31 consecutive hours off duty. Has your weekly 60/70-hour clock reset?",
        options: ["Yes — any 24+ hours off resets it", "No — a restart needs at least 34 consecutive hours off", "Yes, but only the 70-hour clock", "Only if all 31 hours were in the sleeper berth"],
        correctIndex: 1,
        explanation: "The optional restart needs at least 34 consecutive hours off duty (off-duty and/or sleeper) to reset the 60/70-hour clock. 31 hours is not enough, so you resume with your accumulated hours (49 CFR 395.3).",
      },
      {
        order: 6,
        question: "If your ELD malfunctions, what should you do?",
        options: [
          "Keep driving; the carrier handles everything",
          "Stop driving until it is repaired",
          "Note the malfunction, use paper logs (up to 8 days), reconstruct prior records, and notify the carrier",
          "Switch the device to personal conveyance mode",
        ],
        correctIndex: 2,
        explanation: "On malfunction you note it, may run paper logs for up to 8 days, reconstruct the current day plus prior 7 days, and notify the carrier, who must repair within 8 days.",
      },
      {
        order: 7,
        question: "You normally run short-haul, but today's load takes you 160 air-miles from your terminal. For today, you:",
        options: ["are still short-haul — it's your normal route", "need a full RODS/ELD record and the 30-minute break for that day", "lose your CDL short-haul status permanently", "can use short-haul if you make it back by midnight"],
        correctIndex: 1,
        explanation: "The short-haul exception is a DAILY test (49 CFR 395.1(e)(1)). Go outside the 150 air-mile radius or past the 14-hour return on a given day and you're not short-haul that day — you owe full logs and the 30-minute break. It's decided shift by shift, not once and for all." },
      {
        order: 8,
        question: "It's day 3 of an over-the-road run. After your 10-hour break, how much driving time do you have?",
        options: ["whatever was left from yesterday", "a fresh 11 hours, but watch your weekly 60/70-hour total", "unlimited until your next restart", "only 8 hours on the third day"],
        correctIndex: 1,
        explanation: "Ten consecutive hours off resets your daily clocks — a fresh 11-hour driving limit and 14-hour window each day. What keeps accumulating is the weekly 60/70-hour total, until you take a 34-hour restart." },
      {
        order: 9,
        question: "Halfway through your run an unexpected blizzard slows you to a crawl and you are about to hit your 14-hour window. Under the adverse driving conditions exception you may:",
        options: ["drive up to 2 extra hours, which extends both the 11-hour limit and the 14-hour window", "ignore the 14-hour limit until you arrive", "drive 2 extra hours, but the 14-hour window still forces you to stop", "use it only if you skip your 30-minute break"],
        correctIndex: 0,
        explanation: "Unforeseen adverse conditions let you drive up to 2 additional hours, and under the current rule that extends BOTH the 11-hour driving limit (to 13) and the 14-hour window (to 16). It applies only to conditions you could not have known about at dispatch, and it never changes your weekly 60/70-hour total (49 CFR 395.1(b)(1))." },
    ],
  },

  // ─────────────────────────────────────────────────────────
  {
    slug: "ifta-fundamentals",
    title: "IFTA Fundamentals",
    category: "Registration & Tax",
    summary: "What the International Fuel Tax Agreement is, the single quarterly return, the records you must keep, and how the tax is actually calculated.",
    version: "1",
    estMinutes: 16,
    passThreshold: 80,
    validityMonths: 12,
    sortOrder: 2,
    disclaimer: TRAINING_DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "What IFTA is and who needs it",
        estMinutes: 4,
        bodyMarkdown:
          "IFTA is the **International Fuel Tax Agreement**, a cooperative arrangement among the 48 contiguous US states and 10 Canadian provinces. It lets a carrier report fuel-use tax for all member jurisdictions on a single return filed with its base jurisdiction, instead of filing separately in every state it drives through.\n\nIFTA applies to **qualified motor vehicles** used to transport property across two or more member jurisdictions. A vehicle generally qualifies if it has two axles and a gross vehicle weight rating over 26,000 pounds, or three or more axles regardless of weight, or is a combination exceeding 26,000 pounds. (Alaska, Hawaii, and the District of Columbia are not IFTA members.)\n\nYou carry an IFTA license (keep a copy in the cab) and display two decals on the qualified vehicle, renewed annually.\n\n> " + TRAINING_DISCLAIMER,
      },
      {
        order: 2,
        title: "The quarterly return and deadlines",
        estMinutes: 4,
        bodyMarkdown:
          "IFTA is filed **quarterly**. One return goes to your base jurisdiction covering all member jurisdictions you traveled in that quarter. The standard due dates are:\n\n- **Q1 (Jan-Mar): April 30**\n- **Q2 (Apr-Jun): July 31**\n- **Q3 (Jul-Sep): October 31**\n- **Q4 (Oct-Dec): January 31**\n\nIf a due date falls on a weekend or legal holiday, the deadline is usually the next business day. File even if you owe nothing or had no travel in a quarter (a zero return) to stay in good standing. Late or missing returns trigger penalties and interest and can put your license in jeopardy.",
      },
      {
        order: 3,
        title: "How the tax is calculated",
        estMinutes: 4,
        bodyMarkdown:
          "IFTA settles up the difference between the fuel tax you **paid at the pump** in each jurisdiction and the fuel tax you actually **owe** based on where you burned the fuel.\n\nThe basic idea: your return calculates how many gallons you consumed in each jurisdiction (total miles in that jurisdiction divided by your fleet's average miles-per-gallon for the quarter), multiplies by that jurisdiction's tax rate, then credits the tax you already paid when you bought fuel there. The net result is a balance you owe or a refund.\n\nThis is why **where you buy fuel matters** and why every mile and every gallon has to be tracked by jurisdiction. Buying fuel in a low-tax state while driving mostly in a high-tax state can leave you owing on the return even though you paid at the pump.",
      },
      {
        order: 4,
        title: "Records and audit triggers",
        estMinutes: 4,
        bodyMarkdown:
          "IFTA is a records game. Keep, generally for **four years**:\n\n- **Distance records** (trip reports / an individual vehicle mileage record): date of trip, route, total miles, and miles in each jurisdiction. GPS/ELD distance data is commonly used.\n- **Fuel records**: every purchase with date, jurisdiction, number of gallons, seller, and the vehicle it went into. Keep the receipts.\n\nCommon audit triggers include a reported miles-per-gallon that is implausible or swings wildly between quarters, missing fuel receipts, and gaps in mileage between trips. Sloppy records, not honest mistakes, are what cost carriers money in an audit. Capture trip and fuel data as you go rather than reconstructing it at quarter-end.",
      },
    ],
    questions: [
      {
        order: 1,
        question: "How often is an IFTA return filed?",
        options: ["Monthly", "Quarterly", "Annually", "Per trip"],
        correctIndex: 1,
        explanation: "IFTA is filed quarterly with your base jurisdiction, covering all member jurisdictions traveled.",
      },
      {
        order: 2,
        question: "What is the filing deadline for the first quarter (January-March)?",
        options: ["March 31", "April 30", "May 15", "June 30"],
        correctIndex: 1,
        explanation: "Q1 is due April 30. The quarters are due Apr 30, Jul 31, Oct 31, and Jan 31.",
      },
      {
        order: 3,
        question: "IFTA tax is ultimately based on:",
        options: [
          "Where you bought your fuel",
          "Where you consumed the fuel (miles driven per jurisdiction)",
          "Your truck's purchase price",
          "The number of states on your cab card",
        ],
        correctIndex: 1,
        explanation: "Tax is owed based on fuel consumed in each jurisdiction (miles / MPG), with credit for tax already paid at the pump there.",
      },
      {
        order: 4,
        question: "Which records must you keep for IFTA?",
        options: [
          "Only fuel receipts",
          "Only mileage logs",
          "Distance per jurisdiction AND fuel purchase records",
          "Only your IFTA license",
        ],
        correctIndex: 2,
        explanation: "You need both distance records (miles per jurisdiction) and fuel purchase records, typically kept for four years.",
      },
      {
        order: 5,
        question: "A wildly inconsistent reported miles-per-gallon between quarters is most likely to:",
        options: ["Lower your insurance", "Trigger an IFTA audit", "Increase your apportioned plate fee", "Have no effect"],
        correctIndex: 1,
        explanation: "Implausible or swinging MPG is a classic audit trigger because it suggests missing miles or fuel records.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────
  {
    slug: "irp-apportioned",
    title: "IRP Apportioned Registration",
    category: "Registration & Tax",
    summary: "Apportioned plates and the cab card, how registration fees are split across jurisdictions by distance, and how IRP relates to IFTA.",
    version: "1",
    estMinutes: 14,
    passThreshold: 80,
    validityMonths: 12,
    sortOrder: 3,
    disclaimer: TRAINING_DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "What IRP is",
        estMinutes: 4,
        bodyMarkdown:
          "The **International Registration Plan (IRP)** is a registration reciprocity agreement among US states, the District of Columbia, and Canadian provinces. It lets a commercial vehicle that operates in more than one jurisdiction register once, through its base jurisdiction, and receive a single **apportioned plate** that is recognized everywhere it is registered to run.\n\nWithout IRP you would need separate registration in every state you drive in. With it, you pay one base-state registration whose fees are divided among the jurisdictions you actually travel in.\n\nIRP is about **registration** (your plate and the right to operate the vehicle in each jurisdiction). It is separate from IFTA, which is about **fuel tax**. Carriers handle both, and both depend on the same distance records.\n\n> " + TRAINING_DISCLAIMER,
      },
      {
        order: 2,
        title: "The cab card and apportioned fees",
        estMinutes: 4,
        bodyMarkdown:
          "Your **cab card** is the registration document that proves apportioned registration. It lists each jurisdiction the vehicle is registered in and the registered weight in each. Carry it in the vehicle; an officer may ask for it. You may only operate at or below the registered weight shown for a jurisdiction.\n\nRegistration fees are **apportioned by distance**: the percentage of your total fleet distance traveled in each jurisdiction during the reporting period determines the share of that jurisdiction's full registration fee you pay. Drive more miles in a state, pay a larger share of its fee.\n\nFor a brand-new registrant with no prior travel history, jurisdictions use an estimated-distance schedule for the first registration year, then true it up with actual distance at renewal.",
      },
      {
        order: 3,
        title: "Distance records, renewal, and supplements",
        estMinutes: 4,
        bodyMarkdown:
          "Because fees follow distance, IRP requires accurate **distance records** by jurisdiction over the reporting period, kept on file (commonly several years; verify your jurisdiction's retention rule). These are essentially the same trip records IFTA needs, which is why carriers keep them together.\n\nRegistration runs on an annual cycle and must be **renewed** each registration year using your actual distance for the reporting period.\n\nUnder the **Full Reciprocity Plan (FRP)**, all IRP member jurisdictions are already listed on your apportioned cab card, so you do not file a supplement just to start running in a new jurisdiction. You still file **supplements** during the year for other changes: adding or removing a vehicle, or changing a registered weight. Keep your registration honest to how you actually operate, and remember you may run only at or below the registered weight shown for each jurisdiction, or you risk fines.",
      },
    ],
    questions: [
      {
        order: 1,
        question: "What does an IRP apportioned plate let you do?",
        options: [
          "Skip fuel tax reporting",
          "Operate a commercial vehicle in multiple jurisdictions under one base-state registration",
          "Exceed posted weight limits",
          "Avoid the 14-hour HOS window",
        ],
        correctIndex: 1,
        explanation: "IRP provides one apportioned registration recognized across the jurisdictions you register in, instead of separate plates per state.",
      },
      {
        order: 2,
        question: "How are IRP registration fees divided among jurisdictions?",
        options: [
          "Equally among all states",
          "By the distance percentage traveled in each jurisdiction",
          "By the price of the truck",
          "By number of axles",
        ],
        correctIndex: 1,
        explanation: "Fees are apportioned by the share of total distance traveled in each jurisdiction during the reporting period.",
      },
      {
        order: 3,
        question: "What does the cab card list?",
        options: [
          "Your HOS limits",
          "The jurisdictions you are registered in and the registered weight in each",
          "Your IFTA tax owed",
          "Your medical card expiry",
        ],
        correctIndex: 1,
        explanation: "The cab card shows the jurisdictions of registration and the registered weight for each; carry it in the vehicle.",
      },
      {
        order: 4,
        question: "How does IRP relate to IFTA?",
        options: [
          "They are the same filing",
          "IRP is registration; IFTA is fuel tax. They are separate but both rely on distance records",
          "IFTA replaces IRP",
          "IRP is only for Canada",
        ],
        correctIndex: 1,
        explanation: "IRP covers apportioned registration and IFTA covers fuel-use tax; they are distinct programs that share the same underlying distance records.",
      },
      {
        order: 5,
        question: "Under the Full Reciprocity Plan (FRP), when do you file an IRP supplement?",
        options: [
          "To add a jurisdiction you just started running in",
          "To add or remove a vehicle, or change a registered weight",
          "Every quarter, like an IFTA return",
          "Never; IRP has no supplements",
        ],
        correctIndex: 1,
        explanation: "Under FRP all member jurisdictions are already on your cab card, so supplements are for vehicle changes or weight changes, not for adding jurisdictions.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────
  {
    slug: "detention-documentation",
    title: "Detention & Load Documentation",
    category: "SRL Operational Excellence",
    summary: "How to document detention so it gets paid, what a clean BOL, POD, and seal mean under the Carmack Amendment, holding the line when you're pressured to sign clean, and getting accessorials pre-authorized and paid the right way so you actually get reimbursed.",
    version: "4",
    estMinutes: 22,
    passThreshold: 80,
    validityMonths: null,
    sortOrder: 12,
    disclaimer: TRAINING_DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "Documenting detention so it gets paid",
        estMinutes: 4,
        bodyMarkdown:
          "Detention is the time you wait at a shipper or receiver beyond the free time allowed. It is real money, but only if you can prove it. The proof is **timestamps**.\n\nCapture and record:\n\n- Your **arrival time** at the gate or guard shack\n- **Check-in** time at the dock or office\n- **Loaded/unloaded** time and **departure** time\n\nGet these noted on the bill of lading where you can, and back them up with photos of the gate clock, your in-cab clock, or app timestamps. Note times **as they happen**, not from memory at the end of the day.\n\n**Free time lives on your rate confirmation.** Your **rate con** (the contract between the broker and your carrier) lists the line-haul rate plus the accessorials and the **free time** — usually in a 'free time' or 'detention terms' field, not on the freight line. Check it **before** you leave for pickup so you know exactly what you're getting (two hours is common, but go by what the rate con says).\n\n**Not all waiting is billable detention.** Time before your appointment because you arrived early, or a 'dock hold' while the receiver isn't ready, may not bill the same way — some of it is detention, some is layover, some isn't billable at all. **Detention** is by the hour after free time runs out; **layover** is a per-day charge once the wait stretches past a day. If you're unsure whether a hold counts, **check the rate con and call dispatch** — don't assume eight hours of sitting equals eight hours of detention pay.\n\n[[figure:detention-timeline]]\n\n> " + TRAINING_DISCLAIMER,
      },
      {
        order: 2,
        title: "A clean BOL and POD",
        estMinutes: 5,
        bodyMarkdown:
          "The **bill of lading (BOL)** is the document that evidences the contract of carriage and serves as the receipt for the freight. A clean BOL shows the **shipper and consignee** names and addresses, the **commodity** description, the **piece and weight count**, and **signatures with dates and times** at pickup.\n\n**Verify the count before you sign — the right way for the freight type.** Physically **count the pallets or skids** yourself. For pre-counted, sealed cases you can't open, note **'per shipper count'** (sometimes written 'STC' — said to contain) on the BOL so you're not attesting to a number you couldn't verify. If you genuinely can't verify a count, **write that on the BOL** rather than signing as if you did.\n\n[[figure:bol-fields-checklist]]\n\nThe **proof of delivery (POD)** is the signed, dated BOL at delivery showing the load arrived. Make sure it's legible, the receiver's name is printed and signed, and the date and time are on it.\n\n**The seal is part of the documentation.** On a sealed trailer the **seal number is printed on the BOL** — verify it matches at pickup. At delivery, confirm the seal is **still intact and the number still matches before the trailer is opened.** A **broken or mismatched seal** can mean tampering or theft: note it on the paperwork, photograph it, and call dispatch **before** the load is unloaded, so the exception is on record. Never sign a clean POD over a seal that was broken in transit.\n\n**Why the signature carries real legal weight — the Carmack Amendment.** Federal law (**the Carmack Amendment, 49 U.S.C. § 14706**) governs a carrier's liability for loss or damage to freight, and your signed BOL/POD is the core evidence of the load's condition. A **clean signature is presumed to mean the load was delivered in good order** — so if you sign clean on a load that was short or damaged, the law presumes it arrived fine, and the carrier can end up owning a claim that wasn't its fault. That's why the next lesson matters so much.",
      },
      {
        order: 3,
        title: "OS&D, and holding the line when you're pressured to sign clean",
        estMinutes: 4,
        bodyMarkdown:
          "**OS&D** stands for **Over, Short, and Damage.** If at delivery the count is over or short, or any freight is damaged, **write the exception on the delivery receipt and have the receiver acknowledge it before you sign**, and photograph the issue. A clean signature with no notation tells everyone the load arrived perfect — even if it didn't — and the carrier can end up owning a claim that wasn't its fault.\n\n[[figure:osd-notation-workflow]]\n\n**What to do when the dock pressures you to sign clean.** This is common and you need to be ready for it: *'Don't worry, the system tracks it,'* *'It's just a wet spot, sign it,'* *'Corporate handles damage separately,'* or *'Sign clean or we won't load you next time.'* **Do not sign clean over a real problem.** Instead:\n\n- **Note the exact over/short/damage on the POD yourself**, with the date and time.\n- **Photograph it** — full frame, including any labels or identifiers.\n- If the receiver **refuses to acknowledge or initial** your notation, **note their refusal too** ('Receiver [name] declined to sign damage notation') and photograph the freight.\n- **Call dispatch right then** with the photos.\n\n**SRL backs you on this.** Signing clean to avoid a confrontation or protect the next load is exactly how a driver gets stuck holding a claim under the Carmack Amendment. Protecting the document protects you.",
      },
      {
        order: 4,
        title: "Accessorials: get them approved first",
        estMinutes: 5,
        bodyMarkdown:
          "**Accessorials** are charges beyond the line haul: lumper fees, detention, layover, scale tickets, extra stops.\n\n**The receipt is necessary but not enough — authorization comes first.** The single most common reason a driver eats a charge is that they paid it without getting it approved. **Before you incur any accessorial, text or call dispatch for authorization:** *'Receiver requires a lumper, $185 — OK to pay?'* Wait for the yes. A receipt for a charge that was never pre-approved often gets **denied**, and then it comes out of your pocket.\n\n**How you actually pay a lumper.** Once dispatch approves it, you normally pay with a **Comchek or EFS code (or your fuel card)** that dispatch issues — **not cash out of your own pocket**. Paying cash and chasing reimbursement later is how drivers end up eating the charge. Get the code, pay with it, and keep the receipt.\n\nThen document it:\n\n- Keep the **lumper receipt**, the **scale ticket**, the **detention record** — each charge needs its own paper.\n- **Photograph originals immediately** in case the paper gets lost — full frame, in focus, with the **receipt number and all the text readable** (a blurry photo doesn't get paid).\n- Keep **both** the receipt **and** the dispatch authorization (the text/email saying 'yes').\n\nNo receipt usually means no reimbursement — and no *authorization* often means no reimbursement either, receipt or not.\n\n[[figure:accessorial-preauth-flowchart]]",
      },
      {
        order: 5,
        title: "Get paid faster with SRL",
        estMinutes: 3,
        bodyMarkdown:
          "Good documentation is also fast documentation. The sooner clean paperwork reaches the broker, the sooner the invoice can be processed and you can be paid.\n\nWith Silk Route Logistics, upload your signed BOL, POD, and any accessorial receipts through the carrier portal as soon as the load delivers. Make sure photos are in focus and the whole document is in frame, including signatures and dates. Incomplete or unreadable paperwork is the most common reason pay gets delayed.\n\n**Don't rely on the portal alone.** After you upload, **screenshot the confirmation**, and keep your own copies of every BOL, POD, and receipt on your phone or in a folder. If a portal upload fails silently and the office later says 'we never got it,' your local copies and screenshot are your proof.\n\nThe habit that protects you: document at the moment it happens, note any exception before you sign, get accessorials approved first, photograph every receipt, and send it all in promptly. Clean paperwork is how a working driver protects both the load and the paycheck.",
      },
    ],
    questions: [
      { order: 1, question: "Getting a detention claim paid depends most on:", options: ["how long you waited at the dock", "a timestamped record of arrival, check-in, and departure", "whether dispatch was notified", "the receiver admitting it was their fault"], correctIndex: 1, explanation: "Detention is paid on proof. A timestamped arrival/check-in/departure record, backed by the BOL and photos, is what supports the claim — the length of the wait means nothing if you can't document it." },
      { order: 2, question: "Free time and the detention rate are set by:", options: ["a flat two-hour federal standard", "the receiver's posted dock policy", "your rate confirmation or contract", "FMCSA regulation"], correctIndex: 2, explanation: "Free time and detention pay come from your rate confirmation/contract. Two hours is common but not a legal rule — go by what your rate con says." },
      { order: 3, question: "You find a damaged pallet at delivery. Before signing the POD you:", options: ["note the damage on the receipt and photograph it", "sign clean and report it by phone later", "refuse the entire shipment", "let the receiver file the claim"], correctIndex: 0, explanation: "Write the over/short/damage on the document, have the receiver acknowledge it, and photograph it BEFORE signing. A clean signature makes the problem yours." },
      { order: 4, question: "Uploading clean BOL/POD/receipts to the SRL portal promptly:", options: ["is required by FMCSA regulation", "resets your hours-of-service clock", "gets your invoice processed and you paid sooner", "changes nothing"], correctIndex: 2, explanation: "Prompt, legible, complete documentation is the most direct way to avoid pay delays — it's not a regulation, it's how you get paid faster." },
      { order: 5, question: "The receiver requires a $185 lumper. To make sure you get reimbursed, you:", options: ["pay it and keep the receipt — that's all it takes", "text dispatch for authorization BEFORE paying, then keep the receipt AND the approval", "pay it and mention the amount to dispatch later", "refuse to pay and leave"], correctIndex: 1, explanation: "A receipt alone is necessary but not sufficient — an unauthorized charge often gets denied. Get dispatch's OK first ('lumper $185, OK to pay?'), then keep both the receipt and the authorization text/email." },
      { order: 6, question: "You sign a clean POD, then it turns out the freight was damaged in transit. Under the Carmack Amendment, the clean signature means:", options: ["the receiver is automatically liable", "the load is presumed delivered in good order — so the carrier can end up owning the claim", "nothing, signatures don't matter", "the shipper pays regardless"], correctIndex: 1, explanation: "A clean signature is presumed to mean the load arrived in good order (Carmack Amendment, 49 U.S.C. 14706). Signing clean over a real problem shifts the claim onto the carrier — which is why you note OS&D before you sign." },
      { order: 7, question: "A receiver says 'sign clean or we won't load you next time' on a load with two damaged pallets. You:", options: ["sign clean to keep the relationship", "note the damage and refusal yourself, photograph it, and call dispatch — SRL backs you", "leave without delivering", "sign clean but text dispatch about it later"], correctIndex: 1, explanation: "Never sign clean over a real problem, even under pressure. Note the OS&D and the receiver's refusal to acknowledge it, photograph the freight, and call dispatch right then. Protecting the document protects you and the carrier under Carmack." },
      { order: 8, question: "At delivery the trailer seal is broken and the number doesn't match the BOL. Before the receiver unloads, you:", options: ["unload and sort it out later", "note the broken/mismatched seal on the paperwork, photograph it, and call dispatch before unloading", "replace the seal yourself and continue", "ignore it — seals don't matter once you've arrived"], correctIndex: 1, explanation: "The seal number on the BOL is your proof the trailer wasn't opened in transit. A broken or mismatched seal can mean tampering or theft — note it on the paperwork, photograph it, and call dispatch BEFORE the load is unloaded so the exception is documented." },
      { order: 9, question: "Dispatch approves a $200 lumper. The usual way you pay it is:", options: ["cash from your own pocket, then ask to be reimbursed", "a Comchek or EFS code (or fuel card) issued by dispatch", "your personal check", "you don't pay — the receiver always waives it"], correctIndex: 1, explanation: "Lumpers are normally paid with a Comchek/EFS code or fuel card that dispatch issues once they authorize it — not cash out of your own pocket. Get the authorization, use the payment method dispatch provides, and keep the receipt." },
    ],
  },

  // ─────────────────────────────────────────────────────────
  {
    slug: "fraud-awareness",
    title: "Fraud & Double-Brokering Awareness",
    category: "SRL Operational Excellence",
    summary: "How double-brokering and freight scams leave carriers unpaid, the red flags (including chameleon carriers and fake insurance), how to verify a broker before you commit, and why no load is worth skipping the check.",
    version: "3",
    estMinutes: 18,
    passThreshold: 80,
    validityMonths: null,
    sortOrder: 14,
    disclaimer: TRAINING_DISCLAIMER,
    lessons: [
      {
        order: 1,
        title: "How double-brokering scams work",
        estMinutes: 4,
        bodyMarkdown:
          "Double-brokering is when someone who is not authorized to broker a load re-brokers it to an actual carrier, collects the payment from the real broker or shipper, and disappears, leaving the carrier that hauled the freight unpaid.\n\nIt usually looks like a normal load offer. A 'broker' posts or sends you a load, you haul it and deliver clean, you invoice, and the money never comes because the entity you contracted with was a fraud or had no authority to assign the load. The legitimate broker paid the scammer, not you, and you have little recourse.\n\nThe damage is real: you did the work, burned the fuel and hours, and have nothing to show for it.\n\n**Verification is a gate, not an afterthought.** The defense is checking **before you say yes** — before you accept the load and sign the rate confirmation. Verifying after pickup is too late; the fraud is already done.\n\n**Know who actually pays you.** A load can pass through more than one hand legitimately (a broker assigns it, a load is factored, a trusted partner sub-brokers it). Sub-brokering is legal, but it's also where the chain gets murky. Make sure you can answer: *who is the company on my rate confirmation, and are they the one who will pay me?* If you can't trace the payer, that's your signal to dig before you roll.\n\n> " + TRAINING_DISCLAIMER,
      },
      {
        order: 2,
        title: "Red flags",
        estMinutes: 4,
        bodyMarkdown:
          "Scams share patterns. Slow down when you see:\n\n- A **rate that is too good to be true** for the lane.\n- **Pressure** to commit fast or to move communication and paperwork off the platform — often paired with a **same-day or next-morning pickup** so you have no time to verify.\n- **Mismatched names**: the company on the rate confirmation does not match the BOL, the email domain, or who actually called you.\n- A **free email domain** (Gmail, Yahoo, Outlook) instead of a real company domain, or a **VOIP/cell phone** where a brokerage should have a business line.\n- The **phone number on the load post doesn't match** the number on the FMCSA record.\n- A **last-minute request to change remit-to or banking information**, especially by email. This is classic payment-redirect fraud.\n- **Spoofed or duplicate load-board posts**, where a real broker's identity is copied onto a fake contact.\n- A **brand-new operating authority** (very recent USDOT/MC) using a name close to an established company — a possible **chameleon carrier** (a banned operation reopened under a fresh identity).\n- A counterparty that is **reluctant or evasive** when you ask to verify their authority.\n\nAny one of these is a reason to stop and check. Several together is a reason to walk away.\n\n[[figure:real-vs-spoofed-broker]]",
      },
      {
        order: 3,
        title: "How to verify a broker",
        estMinutes: 3,
        bodyMarkdown:
          "Verification is quick and it is your protection:\n\n- Look the broker up on the **FMCSA SAFER system by their USDOT number** (their MC/docket number may also appear) and confirm the **broker authority** is active and in good standing.\n- **Check how old the authority is.** A brokerage that's been active for years is a very different risk than a docket granted last month. A brand-new authority with a generic name is a chameleon-carrier red flag worth a hard look.\n- Confirm a **BMC-84 broker bond** ($75,000 minimum) or trust is on file.\n- **Call the phone number listed on the FMCSA record**, not only the number in the email or load post. Spoofed contacts use a real company name with a fake number. A simple script: *'Hi, I'm a driver for [my carrier]. I have a load offer from [broker name], MC [number] — can you confirm that's your current contact and authority?'*\n- **Insurance certificates get faked too.** A forged COI may carry a real policy number that actually belongs to a *different* carrier, or a VOIP callback number. If insurance is the question, verify it with the **insurer or agent directly**, using a number you look up — not the one printed on the certificate.\n- Make sure the **company you are contracting with matches** the one on the rate confirmation and the one that will pay you.\n\nNever change your banking or remit-to details based on an emailed instruction alone. Confirm any payment-information change through a known, independent contact at the company. A minute of checking beats a free load.\n\n[[figure:fraud-broker-verification-flowchart]]",
      },
      {
        order: 4,
        title: "What to do when something looks wrong",
        estMinutes: 3,
        bodyMarkdown:
          "If something feels off, the order is simple: **stop, verify, report.**\n\n- **Stop.** Do not move the freight or send money or banking changes while you are unsure. **No load is worth skipping the check, even if it costs you a day.** The scam runs on time pressure — a tight pickup window is often the bait. If you can't verify in time, walk away.\n- **Verify.** Use the steps in the last lesson: FMCSA authority + its age, the bond, the number on the official record, matching company names.\n- **Report.** If you suspect double-brokering, a spoofed broker, a chameleon carrier, or a payment-redirect attempt on an SRL load, contact SRL compliance at **compliance@silkroutelogistics.ai**. On a non-SRL load or a personal claim, you can also report to the **FMCSA at 1-800-832-5660** and, for online fraud, the **FBI's IC3 (ic3.gov)**.\n\n**Already hauled it and now suspect a setup?** Finishing a fraudulent load can deepen your exposure; **stopping a bad load protects you.** Get to a safe place, **document everything** (the offer, the rate con, every message and number), and **call SRL immediately** before you deliver or send any money or banking change.\n\nSRL keeps fraud reports **confidential**, uses them to protect other carriers, and **you are never penalized for reporting**. Silk Route Logistics runs carriers through identity and authority vetting, and the Compass Engine watches for double-brokering patterns — but **you are the last and best check at the load level.** If a deal is pressuring you to skip verification, that pressure is the tell.",
      },
    ],
    questions: [
      { order: 1, question: "In a double-brokering scam, why does the carrier that hauled the load go unpaid?", options: ["the broker deducted it as a cargo claim", "an unauthorized party re-brokered the load, took the pay, and vanished", "the shipper rejected the freight on arrival", "the invoice was submitted past the deadline"], correctIndex: 1, explanation: "A fraudulent party re-brokers the load and pockets the payment from the legitimate broker, leaving the carrier that actually hauled it with no one legitimate to collect from." },
      { order: 2, question: "Which of these is a classic freight-fraud red flag?", options: ["a rate that matches the going market", "a last-minute emailed request to change the remit-to or banking info", "a broker who answers your verification questions", "a rate confirmation that matches the BOL"], correctIndex: 1, explanation: "An unsolicited, last-minute request to change payment/banking details — especially by email — is a classic payment-redirect fraud. The other three are signs of a NORMAL, legitimate deal." },
      { order: 3, question: "The safest way to confirm a broker's phone contact is genuine is to:", options: ["call the number in the load-offer email", "call the number listed on the broker's FMCSA record", "trust the load-board posting", "reply to the email and ask them to confirm it"], correctIndex: 1, explanation: "Spoofed contacts pair a real company name with a fake number. Call the number on the official FMCSA record — not the one in the email or post, which the scammer controls." },
      { order: 4, question: "Before hauling for a broker you don't know, you should confirm:", options: ["that the rate is well above market", "active broker authority on FMCSA SAFER plus a BMC-84 bond on file", "that they have a professional-looking website", "that they're posted on a major load board"], correctIndex: 1, explanation: "Verify the broker's USDOT/broker authority is active and in good standing on FMCSA SAFER, with a BMC-84 bond, and that the contracting company matches who will pay you. A nice website or a load-board post proves nothing — scammers have both." },
      { order: 5, question: "You suspect a load on the SRL platform is a double-brokering attempt. You:", options: ["haul it and sort out the payment afterward", "stop, verify the broker, and report it to compliance@silkroutelogistics.ai", "accept the emailed banking change to be safe", "re-post it to another load board"], correctIndex: 1, explanation: "Stop, verify the broker's authority, and report suspected fraud to SRL compliance (compliance@silkroutelogistics.ai) so the load can be protected and other carriers warned." },
      { order: 6, question: "A 'broker' offers a great rate using a Gmail address, a cell-phone number, and a brokerage authority granted three weeks ago. This pattern suggests:", options: ["a normal small brokerage worth trusting", "possible chameleon-carrier / fraud — verify authority age and contacts before committing", "nothing unusual at all", "you should accept fast before the load is gone"], correctIndex: 1, explanation: "A free email domain, a VOIP/cell line where a business line belongs, and a brand-new authority together point to a possible chameleon carrier (a banned operation reopened under a fresh identity). Check the authority's age on SAFER and call the number on the official record before you commit." },
      { order: 7, question: "A load looks slightly off but has a same-day pickup, so there's no time to fully verify. You:", options: ["take it — the tight window means it's a good real load", "walk away; no load is worth skipping verification, even if it costs you a day", "pay the requested deposit to hold it", "verify after you've already picked it up"], correctIndex: 1, explanation: "Time pressure is the bait — scammers push same-day loads precisely to stop you verifying. Verification is a gate that happens BEFORE you commit. If you can't verify in time, walk away; a lost day beats a lost load and fuel." },
    ],
  },
];

// The seeded curriculum: the kept starter courses (IFTA + IRP excluded — archived
// as dispatch tasks) plus the v3.8.anf driver-focused expansion. Ordered by
// sortOrder. The live IFTA/IRP rows are flipped to ARCHIVED by
// scripts/archive-dispatch-courses.ts so re-seeding never re-publishes them.
const ARCHIVED_SLUGS = new Set(["ifta-fundamentals", "irp-apportioned"]);
export const CURRICULUM: CurriculumCourse[] = [
  ...BASE_CURRICULUM.filter((c) => !ARCHIVED_SLUGS.has(c.slug)),
  ...EXPANSION,
];
