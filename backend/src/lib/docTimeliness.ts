// Document (POD) timeliness for the Compass Score — Build D/E (2026-05-30).
// Pure, testable extraction of the "POD uploaded within 24h of actual delivery"
// computation that integrationService.recalculateCarrierCPP performs. Mirrors
// lib/onTimePerformance.ts: a load is measurable only when it has BOTH an actual
// delivery timestamp AND a POD on file; missing either is excluded (can't
// measure timeliness of a doc that doesn't exist / a delivery never timestamped).
// Neutral 100 when nothing is measurable.

export const POD_GRACE_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface DocTimelinessRow {
  actualDelivery: Date | null;
  /** Earliest POD upload time for the load, or null if no POD on file. */
  podUploadedAt: Date | null;
}

export interface DocTimelinessResult {
  pct: number;
  measurable: number;
  timely: number;
}

export function calcDocTimeliness(
  rows: DocTimelinessRow[],
  graceMs: number = POD_GRACE_MS
): DocTimelinessResult {
  let measurable = 0;
  let timely = 0;
  for (const r of rows) {
    if (!r.actualDelivery || !r.podUploadedAt) continue; // unmeasurable
    measurable++;
    if (r.podUploadedAt.getTime() <= r.actualDelivery.getTime() + graceMs) timely++;
  }
  const pct = measurable > 0 ? (timely / measurable) * 100 : 100;
  return { pct, measurable, timely };
}
