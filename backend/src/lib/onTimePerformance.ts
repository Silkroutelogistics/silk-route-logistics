// On-time performance computation for the Compass Score (carrier scorecard)
// and the Caravan tier-advancement gate.
//
// Build A (2026-05-30): replaces the hardcoded on-time stubs in
// integrationService.recalculateCarrierCPP (was `return true` / always 100%)
// and caravanService.checkMilestoneAdvancement (was `onTimePct = total > 0
// ? 100 : 0`). Reads the actual event timestamps that the carrier portal
// already captures — Load.actualPickupDatetime / actualDeliveryDatetime
// (carrierLoads.ts status endpoint) — and compares them to the scheduled
// appointment window.
//
// Locked decisions (Wasi, 2026-05-30):
//   - Grace window: 2 hours past the appointment end time.
//   - No appointment window (no *TimeEnd) → EXCLUDED from the denominator
//     (we can't say a load was "on-time to an appointment" that had no time).
//   - No actual timestamp → EXCLUDED (genuinely unmeasurable; widened later
//     by Build B AE-path stamping + trackingEvents backfill).
//
// The manual-status-derived caveat applies: accuracy depends on the
// carrier/AE flipping status at the real moment. ELD/telematics auto-capture
// (Build C) feeds this same function later with no rework.

export const ON_TIME_GRACE_MS = 2 * 60 * 60 * 1000; // 2 hours

/**
 * Resolve the on-time deadline = scheduled date @ appointment-end-time + grace.
 * Returns null when there is no parseable appointment-end time, which marks the
 * load as unmeasurable (excluded from the denominator per the locked decision).
 */
export function onTimeDeadline(
  scheduledDate: Date | null | undefined,
  timeEnd: string | null | undefined,
  graceMs: number = ON_TIME_GRACE_MS
): Date | null {
  if (!scheduledDate) return null;
  if (!timeEnd || !/^\d{1,2}:\d{2}/.test(timeEnd)) return null; // no window → unmeasurable
  const [h, m] = timeEnd.split(":").map((n) => parseInt(n, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const d = new Date(scheduledDate);
  d.setHours(h, m, 0, 0);
  return new Date(d.getTime() + graceMs);
}

export interface OnTimeRow {
  scheduledDate: Date | null;
  timeEnd: string | null;
  actual: Date | null;
}

export interface OnTimeResult {
  /** On-time percentage over measurable rows; 100 (neutral) when none measurable. */
  pct: number;
  /** Rows that had BOTH an actual timestamp AND an appointment window. */
  measurable: number;
  /** Measurable rows that arrived within the deadline (incl. grace). */
  onTime: number;
}

/**
 * Compute on-time % over a set of loads. A row is "measurable" only when it has
 * both an actual event timestamp and a parseable appointment-end window.
 * When nothing is measurable, pct defaults to 100 (neutral — no penalty for a
 * carrier we simply have no data on yet). Callers that need PROOF before acting
 * (e.g. the advancement gate) should branch on `measurable === 0` themselves.
 */
export function calcOnTimePerformance(
  rows: OnTimeRow[],
  graceMs: number = ON_TIME_GRACE_MS
): OnTimeResult {
  let measurable = 0;
  let onTime = 0;
  for (const r of rows) {
    if (!r.actual) continue; // no actual timestamp → unmeasurable
    const deadline = onTimeDeadline(r.scheduledDate, r.timeEnd, graceMs);
    if (!deadline) continue; // no appointment window → excluded
    measurable++;
    if (new Date(r.actual).getTime() <= deadline.getTime()) onTime++;
  }
  const pct = measurable > 0 ? (onTime / measurable) * 100 : 100;
  return { pct, measurable, onTime };
}
