// Document (POD) timeliness for the Compass Score — Build D/E (2026-05-30).
// Pure, testable extraction of the "POD uploaded within 24h of actual delivery"
// computation that integrationService.recalculateCarrierCPP performs. Mirrors
// lib/onTimePerformance.ts: a load is measurable only when it has BOTH an actual
// delivery timestamp AND a POD on file; missing either is excluded (can't
// measure timeliness of a doc that doesn't exist / a delivery never timestamped).
// Neutral 100 when nothing is measurable.

// v3.8.asc — derived from PAPERWORK_DUE_HOURS rather than its own 24.
//
// This is the window a carrier is GRADED against; PAPERWORK_DUE_HOURS is the
// deadline they are GIVEN, in writing, on the Rate Confirmation and in the
// Broker-Carrier Agreement. CLAUDE.md §9 says the two "must move in the same
// commit" — which was an instruction to a human because nothing connected them.
// Now they cannot separate: grading a carrier against a deadline different from
// the one they signed is the kind of thing that loses a Compass Score dispute.
import { PAPERWORK_DUE_HOURS } from "./accessorialPolicy";

export const POD_GRACE_MS = PAPERWORK_DUE_HOURS * 60 * 60 * 1000;

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
