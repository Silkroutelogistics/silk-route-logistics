/**
 * FMCSA QCMobile API response types — split surface.
 *
 * Sprint v3.8.ahj — Authority-age compliance epic (Items 182, sprint 1 of 5).
 *
 * Holds the authority-endpoint response shape so the new authority-age
 * data plumbing (`getCarrierAuthority` in fmcsaService.ts) and the
 * existing carrier-data plumbing (`verifyCarrierWithFMCSA`,
 * `lookupByMcNumber`) can be shaped + imported independently as the
 * epic grows. The inline `FMCSACarrierResult` interface in
 * fmcsaService.ts is intentionally NOT moved in this sprint — that's a
 * refactor with a wider callsite blast radius, scope-deferred per §3.3
 * atomic-commit discipline.
 */

export interface FMCSAAuthorityResult {
  /** DOT number queried. Echoed back from the input. */
  dotNumber: string;

  /**
   * Earliest `original_served_date` from the carrier's operating-authority
   * history, parsed as ISO `YYYY-MM-DD`. The anchor for authority-age
   * computation.
   *
   * **Reinstatement-continuity caveat (deferred per Item 182 locked
   * decisions).** A carrier whose authority was granted, revoked, and
   * later reinstated will read here as older than they operationally
   * are — the gate sees the original grant date, not the most recent
   * reinstatement. This is a deliberate future AE-warning concern,
   * NOT a bug to fix in v3.8.ahj. Mitigation path: surface a
   * `latestReinstatementDate` field via AE Console warning when present
   * AND distinct from the original grant. Tracked for v3.8.ahl + ahm
   * window when the gate + override UI land.
   */
  authorityGrantDate: string | null;

  /**
   * Calendar months elapsed from `authorityGrantDate` to today, derived
   * on read. NOT persisted as a stored snapshot per Item 182 locked
   * decisions — age is recomputed each time the gate runs, anchored on
   * the stable grant date. Null when no GRANT entry exists in history.
   */
  authorityAgeMonths: number | null;

  /**
   * Authority type from the original (earliest) grant entry — e.g.
   * `COMMON`, `CONTRACT`, `BROKER`. Informational only at v3.8.ahj;
   * the eventual gate looks at the date, not the type.
   */
  authorityType: string | null;

  /** Count of operating-authority history entries returned. Observability. */
  rawHistoryCount: number;

  /**
   * Non-fatal error messages. Examples: webKey missing, network timeout,
   * no GRANT in history, malformed `original_served_date`. The caller
   * decides whether to surface to the user — the function itself never
   * throws.
   */
  errors: string[];
}
