/**
 * ONE definition of which carriers the platform acts on.
 *
 * THE DEFECT THIS REPLACES. CarrierProfile carries two overlapping status
 * enums — `onboardingStatus` (canonical) and `status` (the older application
 * pipeline). The schema's own comment says "when one is set, set the other to
 * match", and 20 of the 24 write sites do not: they set onboardingStatus and
 * leave status at whatever it was, usually its @default(NEW).
 *
 * Four scheduled sweeps filtered on `status: "APPROVED"` ALONE:
 *
 *   ofacScreeningService        weekly sanctions / SDN rescan
 *   insuranceVerificationService  60/30/7-day expiry warnings
 *   csaBasicService             CSA BASIC safety scan
 *   eldValidationService        ELD validation sweep
 *
 * And approvalService.approveCarrier — the canonical approve path — writes only
 * onboardingStatus. So a carrier approved through the normal AE flow was
 * invisible to all four, permanently. The sanctions rescan is also the code
 * that SUSPENDS on a hit, so the gap was not merely observational.
 *
 * It has never bitten because the only dual-writing paths are DAT admin-setup
 * and emergency-approve, every seed and proof fixture sets both, and production
 * currently holds no live carriers. It goes live with the first real carrier
 * benched through the normal path.
 *
 * WHY A RESOLVER RATHER THAN FOUR EDITED WHERE-CLAUSES. Patching four filters
 * leaves the fifth one to be written wrong. There is now one place that answers
 * the question, and the sweeps ask it.
 *
 * THE TWO ANSWERS ERR IN OPPOSITE DIRECTIONS, deliberately:
 *
 *   MONITORED    inclusive. Where the enums disagree, scan anyway. A false
 *                positive costs one wasted OFAC call. A false negative is a
 *                sanctioned carrier on a customer's freight.
 *
 *   DISPATCHABLE exclusive. Where they disagree, do not offer the load. A false
 *                positive is a carrier we should not have tendered.
 *
 * DISPATCHABLE IS A PRE-FILTER, NOT AN AUTHORITY. complianceCheck in
 * complianceMonitorService remains the only thing that decides whether a
 * specific carrier may take a specific load — it reads insurance, agreements,
 * OFAC, authority age, chameleon risk and overrides. This narrows the candidate
 * set cheaply in SQL; it does not replace the gate, and nothing here should
 * grow into a second opinion about eligibility.
 */

/** The subset of CarrierProfile these predicates read. */
export interface CarrierStatusFacts {
  onboardingStatus: string;
  status: string;
  isTestAccount: boolean;
  deletedAt: Date | null;
}

/**
 * States that mean "this carrier has been approved at some point", on either
 * enum. SUSPENDED is included on purpose: a suspended carrier is post-approval,
 * and the reason to keep scanning them is exactly that we may need to know
 * about a sanctions hit or an insurance lapse while they are suspended.
 *
 * PENDING and REJECTED are excluded — they were never in the sweeps' intended
 * population, and this fix is meant to repair the drift, not quietly widen who
 * gets scanned.
 */
const MONITORED_ONBOARDING = ["APPROVED", "SUSPENDED"] as const;
const MONITORED_APPLICATION = ["APPROVED", "SUSPENDED"] as const;

/** The exclusive set, preserved verbatim from smartMatchService's filter. */
const DISPATCHABLE_ONBOARDING = "APPROVED";
const DISPATCHABLE_APPLICATION = ["APPROVED", "NEW"] as const;

/**
 * Prisma `where` fragment for the monitored population.
 *
 * The OR is the whole point: it spans the disagreement rather than picking a
 * side. Spread it into a sweep's existing where-clause.
 */
export function monitoredCarrierWhere() {
  return {
    deletedAt: null,
    isTestAccount: false,
    OR: [
      { onboardingStatus: { in: [...MONITORED_ONBOARDING] } },
      { status: { in: [...MONITORED_APPLICATION] } },
    ],
  };
}

/** In-memory form of the same rule, for a profile already loaded. */
export function isMonitoredCarrier(c: CarrierStatusFacts): boolean {
  if (c.deletedAt) return false;
  if (c.isTestAccount) return false;
  return (
    (MONITORED_ONBOARDING as readonly string[]).includes(c.onboardingStatus) ||
    (MONITORED_APPLICATION as readonly string[]).includes(c.status)
  );
}

/**
 * Prisma `where` fragment for the dispatch candidate pre-filter.
 *
 * AND, not OR — both enums must agree. `NEW` is tolerated on the application
 * side because it is the @default and the drift left legitimately-approved
 * carriers sitting on it; that tolerance is what keeps auto-dispatch working
 * while the writers are repaired, and it can narrow to APPROVED alone once the
 * drift-repair has run and the writer discipline has held for a while.
 */
export function dispatchableCarrierWhere() {
  return {
    deletedAt: null,
    isTestAccount: false,
    onboardingStatus: DISPATCHABLE_ONBOARDING,
    status: { in: [...DISPATCHABLE_APPLICATION] },
  };
}

/** In-memory form of the same rule. */
export function isDispatchableCarrier(c: CarrierStatusFacts): boolean {
  if (c.deletedAt) return false;
  if (c.isTestAccount) return false;
  return (
    c.onboardingStatus === DISPATCHABLE_ONBOARDING &&
    (DISPATCHABLE_APPLICATION as readonly string[]).includes(c.status)
  );
}

/**
 * The application-pipeline value that pairs with a given onboardingStatus.
 *
 * Writers call this so the two enums cannot drift again. Returns null where
 * there is no sensible pairing (an onboardingStatus with no application-side
 * counterpart), in which case the caller should leave `status` alone rather
 * than invent a value.
 */
export type ApplicationStatus = "NEW" | "REVIEW" | "APPROVED" | "REJECTED" | "SUSPENDED";

export function pairedApplicationStatus(onboardingStatus: string): ApplicationStatus | null {
  switch (onboardingStatus) {
    case "APPROVED": return "APPROVED";
    case "REJECTED": return "REJECTED";
    case "SUSPENDED": return "SUSPENDED";
    case "PENDING": return "NEW";
    // REVIEWING and INFO_REQUESTED both mean "an AE is working it", which on
    // the application pipeline is REVIEW.
    case "REVIEWING":
    case "INFO_REQUESTED": return "REVIEW";
    default: return null;
  }
}
