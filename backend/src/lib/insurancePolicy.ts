/**
 * THE insurance minimums SRL requires of a carrier. One place. Everything else
 * reads from here.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The same three figures lived as literals in three modules that answer
 * different questions about them, and nothing connected the answers:
 *
 *   pdfService.ts:2373            PRINTS them on the Rate Confirmation
 *   insuranceVerificationService  ENFORCES them on a carrier's COI
 *   carrierVettingService.ts:226  DEDUCTS vetting points when they are not met
 *
 * Three copies of a number a carrier is held to is the accessorialPolicy defect
 * in a different domain: the Rate Confirmation could promise one minimum while
 * the gate enforced another, and the only thing that would notice is a carrier
 * reading their own paperwork after being refused a load.
 *
 * The direction that matters is PRINTED <- ENFORCED. A document may not state a
 * minimum SRL does not actually require, because that document is what the
 * carrier relies on. insurancePolicy.test.ts asserts that direction against a
 * real rendered PDF rather than against another copy of the constant.
 *
 * These are SRL's contractual minimums and are deliberately NOT the FMCSA
 * financial-responsibility floors, which are a different instrument with a
 * different purpose. Broker-Carrier Agreement paragraph 2 is the governing
 * statement; changing a figure here without changing the agreement makes the
 * agreement false, so move both in the same commit.
 */

/** Minimum coverage, in whole dollars, per Broker-Carrier Agreement paragraph 2. */
export const INSURANCE_MINIMUMS = {
  /** Commercial Automobile Liability, combined single limit, each occurrence. */
  autoLiability: 1_000_000,
  /** All-risk broad form Motor Truck Cargo Legal Liability, each occurrence. */
  cargoInsurance: 100_000,
  /** Commercial General Liability, per occurrence. */
  generalLiability: 1_000_000,
  /** Workers' Compensation, where applicable. */
  workersComp: 500_000,
} as const;

/**
 * The figures as they are PRINTED, e.g. "$1,000,000".
 *
 * Formatting lives here rather than at each print site so a document cannot
 * render a differently-formatted version of the same number and drift from the
 * guard that checks it.
 */
export function formatMinimum(amount: number): string {
  return `$${amount.toLocaleString("en-US")}`;
}
