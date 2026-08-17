/**
 * THE ratified accessorial schedule. One place. Everything else reads from here.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The schedule was ratified in v3.8.arn and re-ratified 2026-08-15, and then it
 * drifted anyway — because the numbers lived as prose in fifteen places and as
 * literals in several more. At the time this module was written, production was
 * simultaneously serving:
 *
 *   - a Rate Confirmation printing detention $50/hr capped at $250/stop, and
 *   - "Standard Freight Operations Manual" v3.0 at /dashboard/sops telling the AE
 *     detention is $75/hr, TONU is $350, layover is $350/day, and lumpers carry a
 *     $25 admin fee.
 *
 * An AE reading the manual would have quoted a carrier four wrong numbers off a
 * document SRL wrote. That is not a typo class, it is a sourcing class: prose that
 * restates a figure has a half-life, and the only durable fix is to stop restating
 * it. Same lesson CLAUDE.md §14 records about version strings — do not repeat a
 * value that lives in code; point at the constant.
 *
 * SO: every surface that states an accessorial figure imports it from here, and
 * `scripts/verify-accessorial-standard.ts` fails the build if any prose surface
 * contradicts these values. Adding a number to a document is now a code change.
 *
 * WHAT LIVES WHERE
 * ----------------
 * The dwell ENGINE (how detention accrues, when it converts to layover, what a
 * given dwell is worth) stays in `lib/detentionLayover.ts`. That file computes;
 * this file publishes. The four dwell constants are re-exported here so a caller
 * needs exactly one import, and they are re-exported rather than redefined so
 * there is still only one definition.
 */

import {
  DETENTION_FREE_HOURS,
  DETENTION_RATE_PER_HOUR,
  DETENTION_CAP_PER_STOP,
  LAYOVER_RATE_PER_DAY,
} from "./detentionLayover";

export {
  DETENTION_FREE_HOURS,
  DETENTION_RATE_PER_HOUR,
  DETENTION_CAP_PER_STOP,
  LAYOVER_RATE_PER_DAY,
};

/**
 * Truck Ordered Not Used, flat, per occurrence.
 *
 * RATIFIED 2026-08-15 as two-sided: bill the CUSTOMER $200 on any cancellation
 * with no notice test, and pay the CARRIER $200 when the cancellation lands
 * same-day as pickup or after the carrier was dispatched.
 *
 * NEITHER SIDE IS BUILT. There is no customer-side TONU charge anywhere in the
 * billing path, and the carrier-side clause the Rate Confirmation prints today
 * pays on a narrower trigger than the ratified one. This constant is the AMOUNT,
 * which is settled; it is not evidence that the charge fires. See CLAUDE.md §5.
 */
export const TONU_AMOUNT = 200;

/**
 * The CARRIER'S release window, in hours before pickup.
 *
 * The carrier may release a load up to this many hours before pickup without
 * penalty. It is NOT a window for SRL to cancel penalty-free — that reading is
 * what made this clause and the TONU clause contradict each other on the same
 * signed page. Reframed, they govern different parties: this is the carrier
 * backing out, TONU is SRL or the shipper backing out.
 *
 * RATIFIED 2026-08-15, NOT ENFORCED by any writer.
 */
export const CARRIER_RELEASE_WINDOW_HOURS = 4;

/** Hours after delivery in which signed BOL, POD and supporting paperwork are due. */
export const PAPERWORK_DUE_HOURS = 24;

/** Minutes before detention begins that the carrier owes SRL a call. */
export const DETENTION_NOTICE_MINUTES = 30;

/**
 * Lumpers, and every other cost the carrier fronts, are reimbursed AT COST.
 * SRL takes no margin on them and adds no handling charge. A non-zero value here
 * would be a policy change, not a config change.
 */
export const LUMPER_ADMIN_FEE = 0;

/**
 * SRL issues no money codes. There is no Comchek, EFS, Comdata, or SRL fuel card.
 * This is load-bearing operationally, not just editorially: a driver who believes
 * a code is coming will sit at the dock waiting for one that does not exist, and
 * the load sits with them. Any surface that implies otherwise is a defect.
 */
export const ISSUES_MONEY_CODES = false;

/** Dollars a stop is worth once dwell passes the conversion (cap + first layover day). */
export const CONVERSION_TOTAL = DETENTION_CAP_PER_STOP + LAYOVER_RATE_PER_DAY;

/** Billable detention hours before the cap is reached. Derived, never hardcoded. */
export const BILLABLE_HOURS_TO_CAP = DETENTION_CAP_PER_STOP / DETENTION_RATE_PER_HOUR;

/** Total dwell hours at which detention converts to layover. Derived. */
export const CONVERSION_DWELL_HOURS = DETENTION_FREE_HOURS + BILLABLE_HOURS_TO_CAP;

/**
 * Canonical prose. Documents embed these instead of retyping figures.
 *
 * Each is written to drop into a different register — a bulleted SOP, a numbered
 * contract clause, a driver lesson — but every number in all of them comes from
 * the constants above, so they cannot disagree with each other or with the ladder
 * the ledger actually pays.
 */
export const POLICY_TEXT = {
  /** One line. For a terms grid, a tooltip, or a summary row. */
  detentionShort: () =>
    `$${DETENTION_RATE_PER_HOUR}/hr after ${DETENTION_FREE_HOURS} hrs free, ` +
    `$${DETENTION_CAP_PER_STOP}/stop cap`,

  /** Full detention rule, including the conditions people forget. */
  detentionFull: () =>
    `Detention is $${DETENTION_RATE_PER_HOUR} per hour for all equipment types after ` +
    `${DETENTION_FREE_HOURS} hours of free time at each stop, capped at ` +
    `$${DETENTION_CAP_PER_STOP} per stop. Free time is per stop, independent and ` +
    `non-cumulative. The clock starts at arrival. Detention is not payable if the ` +
    `carrier arrived outside the appointment window. The carrier notifies SRL ` +
    `${DETENTION_NOTICE_MINUTES} minutes before detention begins and again on departure.`,

  /** The part that is genuinely counter-intuitive, so it gets its own sentence. */
  conversion: () =>
    `At the cap, detention converts to layover. Detention covers the hours before ` +
    `the conversion and layover the hours after; the two never cover the same hours. ` +
    `Layover day one bills at the conversion, so a stop still held past ` +
    `${CONVERSION_DWELL_HOURS} hours of dwell is worth $${CONVERSION_TOTAL} ` +
    `(the $${DETENTION_CAP_PER_STOP} detention cap plus the first layover day). ` +
    `Each further layover day is $${LAYOVER_RATE_PER_DAY}.`,

  layover: () => `Layover is $${LAYOVER_RATE_PER_DAY} per day.`,

  tonu: () => `TONU (truck ordered not used) is $${TONU_AMOUNT} flat.`,

  /** The money-code sentence is the operationally load-bearing half. */
  lumper: () =>
    `Lumper fees are reimbursed at cost. The carrier fronts the payment and SRL ` +
    `reimburses on the original receipt, with no admin fee. SRL issues no money ` +
    `codes — there is no Comchek, EFS, Comdata, or SRL fuel card — so a driver ` +
    `should never wait at a dock for one. Dispatch authorization is required before ` +
    `the driver pays.`,

  release: () =>
    `The carrier may release a load up to ${CARRIER_RELEASE_WINDOW_HOURS} hours ` +
    `before pickup without penalty.`,

  paperwork: () =>
    `Signed bill of lading, proof of delivery and supporting paperwork are due ` +
    `within ${PAPERWORK_DUE_HOURS} hours of delivery.`,

  /** Every rule, as a bulleted block. What an SOP or an agreement exhibit embeds. */
  fullSchedule: (): string =>
    [
      `- Detention: ${POLICY_TEXT.detentionFull()}`,
      `- Conversion: ${POLICY_TEXT.conversion()}`,
      `- Layover: $${LAYOVER_RATE_PER_DAY} per day.`,
      `- ${POLICY_TEXT.tonu()}`,
      `- Lumper: ${POLICY_TEXT.lumper()}`,
      `- Cancellation: ${POLICY_TEXT.release()}`,
      `- Paperwork: ${POLICY_TEXT.paperwork()}`,
    ].join("\n"),
} as const;

/**
 * Figures that were once policy and are not any more, with the value that replaced
 * each. The drift guard scans documents for these, and the chatbot ban list is
 * built from the same array, so retiring a figure updates every check at once.
 *
 * A number appearing here does not make it unmentionable — a changelog may record
 * that a rate changed. It makes it unmentionable AS CURRENT POLICY.
 */
export const RETIRED_FIGURES: { pattern: RegExp; was: string; now: string }[] = [
  { pattern: /\$75\s*(?:\/|\s+per\s+)\s*(?:hr|hour)/i, was: "detention $75/hr (Platinum tier rate)", now: `$${DETENTION_RATE_PER_HOUR}/hr, all tiers` },
  { pattern: /\$65\s*(?:\/|\s+per\s+)\s*(?:hr|hour)/i, was: "detention $65/hr (Gold tier / reefer rate)", now: `$${DETENTION_RATE_PER_HOUR}/hr, all equipment` },
  { pattern: /TONU[^.\n]{0,40}\$350|\$350[^.\n]{0,20}TONU/i, was: "TONU $350", now: `$${TONU_AMOUNT} flat` },
  { pattern: /\$350\s*(?:\/|\s+per\s+)\s*day/i, was: "layover $350/day", now: `$${LAYOVER_RATE_PER_DAY}/day` },
  { pattern: /cap(?:ped)?[^.\n]{0,30}\$200(?![0-9])/i, was: "detention cap $200/stop", now: `$${DETENTION_CAP_PER_STOP}/stop` },
  { pattern: /\$25\s+admin\s+fee|admin\s+fee[^.\n]{0,20}\$25/i, was: "lumper $25 admin fee", now: "at cost, no admin fee" },
  { pattern: /\$150\s+admin\s+fee/i, was: "$150 shipper-cancellation admin fee", now: "not a ratified charge" },
];

/**
 * Words that promise a payment instrument SRL does not have. Distinct from
 * RETIRED_FIGURES because these were never right, and because the failure mode is
 * a driver stranded at a dock rather than a wrong dollar amount.
 */
export const MONEY_CODE_TERMS = ["Comchek", "Comdata", "EFS", "fuel card", "money code"];
