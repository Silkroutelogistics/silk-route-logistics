/**
 * Tracking-compliance factor: measured, or not measured. Never assumed.
 *
 * Until Phase 0 of the mandatory-ELD arc the weekly recalc scored every carrier
 * at a constant 100 for tracking compliance unless CarrierProfile.eldEnabled was
 * true, and nothing has ever written eldEnabled. A constant is not a
 * measurement. A constant of 100 was a claim, on every scorecard, gauge and
 * Compass composite, that SRL had location visibility it does not have.
 *
 * The factor is now NULL when no location source exists, and the composite
 * excludes it (tierService.calculateOverallScore renormalises the remaining
 * weights). CarrierScorecard.gpsCompliancePct is Float @default(0) and cannot
 * hold null without a migration this sprint does not carry, so the PERSISTED
 * value for an unmeasured carrier is UNMEASURED_TRACKING_PCT, the same 0 a
 * fresh row already holds. Every reader of that column gates on eldEnabled and
 * renders "Not measured" instead of the number. Phase 1 replaces the sentinel
 * with a nullable column once a per-carrier location source exists.
 *
 * Audit: docs/audits/track-and-trace-mandatory-eld-audit.md, Part 1 section 1.5.
 */

/** Persisted stand-in for "nothing measured this" on a non-nullable column. */
export const UNMEASURED_TRACKING_PCT = 0;

export interface TrackingFactorInput {
  /** CarrierProfile.eldEnabled: today the only signal that a location source exists. */
  eldEnabled: boolean;
  /** Distinct loads in the window with at least one located tracking event. */
  trackedLoads: number;
  /** Loads in the window. */
  totalLoads: number;
}

/**
 * The measured percentage, or null when nothing measured it.
 *
 * A carrier with a connected source and no loads in the window reads 100, not
 * 0: an absence of loads is not an absence of tracking.
 */
export function resolveTrackingFactor(input: TrackingFactorInput): number | null {
  if (!input.eldEnabled) return null;
  if (input.totalLoads <= 0) return 100;
  return (input.trackedLoads / input.totalLoads) * 100;
}

/** What the non-nullable column receives for a factor that may be null. */
export function persistedTrackingPct(factor: number | null): number {
  return factor === null ? UNMEASURED_TRACKING_PCT : factor;
}
