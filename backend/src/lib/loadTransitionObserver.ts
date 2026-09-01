// Log-first observation of Load.status transitions. Observes; never blocks.
//
// WHY LOG-FIRST, AND WHY THE OBVIOUS VERSION OF THIS IS WRONG.
//
// §13.3 Item 159 / audit finding A1 reads "10 AE-side sites bypass
// validateLoadStatusTransition — wire it in." Tracing every real
// prisma.load.update({ status }) site (29 of them, not 10) says the framing is
// backwards. Most of the named sites are fine: ediService.ts:114 already
// validates and is the reference pattern; integrationService and
// shipperNotificationService are guarded by an `if (load.status === "DELIVERED")`
// check; instantBookService only proceeds from POSTED. What is actually broken is
// the MAP, which omits transitions production legitimately performs:
//
//   1. loadBids.ts:221 and waterfallEngineService.ts:492 set POSTED/TENDERED →
//      DISPATCHED. That is the auto-pilot dispatch divergence CLAUDE.md §2
//      documents deliberately (bulk accept skips BOOKED, and routes/waterfalls
//      queries dispatchedAt for the "dispatched today" dashboards). The AE map
//      allows neither.
//   2. fallOffRecovery.ts:57 re-posts a fallen-off load BOOKED/DISPATCHED →
//      POSTED. Backwards, intentional, and not in the map.
//
// So switching enforcement on would break bulk dispatch and fall-off recovery —
// the precise outage the "wire it in" instruction would have caused. Hence:
// observe first, reconcile the map against what is actually seen, and only then
// gate. Resume state in §13.3 Item 159.
//
// ONE CHOKE POINT, NOT 29 CALL SITES. This hangs off the existing
// $allOperations client extension in config/database.ts, so it sees every status
// write including the dynamic ones a grep cannot classify, plus any site added
// tomorrow. That completeness is the point: a survey that misses the sites
// nobody remembered is the survey that gets the reconciliation wrong. It is also
// one edit to remove when enforcement replaces it.

import { LoadStatus } from "@prisma/client";
import { log } from "./logger";
import { validateLoadStatusTransition } from "./loadStateMachine";

/**
 * Transitions already known to be legitimate and simply absent from the AE map.
 *
 * These are logged like everything else, but tagged `expected: true` so a
 * postmortem can grep `expected:false` for genuine surprises. Tagging is NOT
 * whitelisting — the counts on the expected ones are exactly what decides
 * whether the map gains these transitions or the call sites change.
 */
const KNOWN_DIVERGENCES: ReadonlyArray<{ from: LoadStatus; to: LoadStatus; why: string }> = [
  // CLAUDE.md §2 — bulk accept is hands-off dispatch: accept IS dispatch, so it
  // skips the BOOKED checkpoint the AE-curated direct path keeps.
  { from: "POSTED", to: "DISPATCHED", why: "auto-pilot dispatch (§2 divergence)" },
  { from: "TENDERED", to: "DISPATCHED", why: "auto-pilot dispatch (§2 divergence)" },
  // fallOffRecovery — carrier fell off, load goes back on the board.
  { from: "BOOKED", to: "POSTED", why: "fall-off recovery re-post" },
  { from: "DISPATCHED", to: "POSTED", why: "fall-off recovery re-post" },
];

function isKnown(from: LoadStatus, to: LoadStatus): string | null {
  const hit = KNOWN_DIVERGENCES.find((d) => d.from === from && d.to === to);
  return hit ? hit.why : null;
}

/**
 * Violations observed since this process booted, surfaced on /api/health as
 * status_machine.violations_since_boot (row 3b).
 *
 * The number is the ENFORCEMENT GATE. Item 194 ruled that enforcing the
 * canonical map today breaks production, so the plan is: log-only until a full
 * deploy cycle shows no UNEXPECTED edges, then enforce. Counting them in memory
 * rather than querying logs is what makes "has it been clean" answerable at a
 * glance instead of by a log search nobody runs.
 *
 * Per-process and resets on boot, which is honest: it answers "since this
 * process started", and the field name says so.
 */
let violationsSinceBoot = 0;
let unexpectedSinceBoot = 0;

export function statusMachineCounters() {
  return { violations_since_boot: violationsSinceBoot, unexpected_since_boot: unexpectedSinceBoot };
}

export interface TransitionObservation {
  from: LoadStatus;
  to: LoadStatus;
  loadId?: string | null;
  /** Prisma operation that performed the write, for locating the caller. */
  operation?: string;
}

/**
 * Record one observed transition. Emits a line only when the AE map would have
 * rejected it — a clean transition is not worth a log line, and drowning the
 * signal is how log-first becomes log-never.
 *
 * Returns nothing and cannot throw. The caller is a database write path; an
 * observability failure there would corrupt an operation that had already
 * succeeded. (The auth-event helper shipped this same guarantee and broke it by
 * evaluating an argument outside its own try — see lib/authEvents.ts. Here
 * everything, including the map lookup, is inside.)
 */
export function observeLoadTransition(obs: TransitionObservation): void {
  try {
    const { from, to } = obs;
    if (from === to) return;

    const verdict = validateLoadStatusTransition(from, to, "AE");
    if (verdict.allowed) return;

    // EXPECTED means the AUTO map allows it -- auto-pilot dispatch or a
    // recovery re-post. Derived from the map rather than read from the list,
    // so the two cannot drift: the list now only supplies the human-readable
    // reason, and a guard asserts every entry is genuinely AUTO-allowed.
    const autoAllows = validateLoadStatusTransition(from, to, "AUTO").allowed;
    const known = isKnown(from, to);
    violationsSinceBoot += 1;
    if (!autoAllows) unexpectedSinceBoot += 1;
    log.warn(
      {
        loadTransition: `${from}->${to}`,
        from,
        to,
        loadId: obs.loadId ?? undefined,
        operation: obs.operation,
        code: verdict.code,
        // grep `expected:false` for the transitions nobody has accounted for.
        expected: autoAllows,
        why: known ?? undefined,
      },
      `[LoadTransition] ${from} -> ${to} not in AE map`,
    );
  } catch {
    // Observation must never surface to a write path.
  }
}

/** Exposed for the test that pins the documented divergences. */
export const __KNOWN_DIVERGENCES = KNOWN_DIVERGENCES;
