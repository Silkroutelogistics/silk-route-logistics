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
import { accountedByLens, validateLoadStatusTransition } from "./loadStateMachine";
import { isUncancelEdge } from "./uncancelLens";

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
  // C3 — the carrier's own lens. A driver reporting arrival is not an AE
  // skipping DISPATCHED; it is the one move CARRIER_ALLOWED_TRANSITIONS is
  // built to permit, and carrierLoads validates it as CARRIER before writing.
  // Counted under AE it read as the only thing in production nobody could
  // account for, which is what held the enforcement gate open.
  { from: "BOOKED", to: "AT_PICKUP", why: "carrier reported arrival (CARRIER lens)" },
  { from: "CONFIRMED", to: "AT_PICKUP", why: "carrier reported arrival (CARRIER lens)" },
];

function isKnown(from: LoadStatus, to: LoadStatus): string | null {
  const hit = KNOWN_DIVERGENCES.find((d) => d.from === from && d.to === to);
  return hit ? hit.why : null;
}

/**
 * THIS MODULE NO LONGER COUNTS ANYTHING. C1, 2026-09-25.
 *
 * It held the in-memory since-boot pair AND pushed a durable counter row, both
 * driven from the $allOperations client extension. Both moved to the database,
 * because that extension can only ever see writes that go through the SHARED
 * Prisma client — and SRL-121496 showed what that costs. The load was reversed
 * twice: once by an untracked script with its own `new PrismaClient()`, which
 * wrote a proper audit row and produced NO counter row, and once by the
 * canonical endpoint, which produced one. The same logical act, counted or not
 * purely by which client wrote it. Three smaller blind spots went with it —
 * `take: 25` truncating a large updateMany, `$executeRaw`, and the
 * `{ status: { set: "X" } }` form the string check does not match.
 *
 * An AFTER UPDATE OF status trigger on `loads` now writes every transition to
 * load_status_transitions, and statusMachineCounters.ts derives the gate from
 * it. See prisma/migrations/20260925120000_load_status_transition_log.
 *
 * WHAT REMAINS IS THE LOG LINE, AND IT IS EXPLICITLY NOT THE SOURCE OF TRUTH.
 * It still earns its place: it names the loadId and the Prisma operation at the
 * instant of the write, so a violation is greppable in real time rather than at
 * the next health read. But it is emitted only for writes that pass through the
 * shared client — the very limitation that moved the counting — so an absent
 * line means nothing and a present one proves nothing about the count.
 * /api/health's status_machine block is the answer.
 */

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

    // EXPECTED means SOME rule set in the machine accounts for it -- auto-pilot
    // dispatch, a recovery re-post, or (C3) a carrier reporting arrival under
    // the lens carrierLoads already validated it against. Derived from the maps
    // rather than read from the list, so the two cannot drift: the list only
    // supplies the human-readable reason, and a guard asserts every entry is
    // genuinely allowed by the lens it claims.
    //
    // ONE predicate, shared with the durable counter, because the cumulative
    // count IS the enforcement gate and two derivations would let the in-memory
    // and durable answers disagree about whether it has closed.
    const lens = accountedByLens(from, to);
    const known = isKnown(from, to);
    // A cancellation reversal. TAGGED here, DECIDED at read time -- and the split
    // is forced by ordering rather than chosen: recordLifecycleEvent writes the
    // authorising row AFTER the transition commits (measured 20ms after, on
    // SRL-121496), so at this instant the row does not exist yet and a check here
    // would call every reversal unauthorised. lib/uncancelLens.ts carries the
    // measurement and the reasoning; isUncancelEdge is imported from there rather
    // than re-tested here so the observer and the durable reader cannot disagree
    // about what a reversal edge IS.
    const reversal = isUncancelEdge(from, to);
    log.warn(
      {
        loadTransition: `${from}->${to}`,
        from,
        to,
        loadId: obs.loadId ?? undefined,
        operation: obs.operation,
        code: verdict.code,
        // grep `expected:false` for the transitions nobody has accounted for.
        //
        // A reversal edge stays `expected:false` HERE on purpose. No lens in the
        // machine accounts for it -- CANCELLED is terminal in both maps -- and
        // claiming otherwise at write time would hide a raw CANCELLED -> X write,
        // which is the one thing this observer exists to surface. `uncancelEdge`
        // is what tells a reader the verdict is not final.
        expected: lens !== null,
        // WHICH lens accounted for it -- so a carrier-reported arrival is
        // legible as one rather than as an anonymous "expected".
        accountedBy: lens ?? undefined,
        // Set when the edge is a cancellation reversal, whose authorisation is
        // settled by the UNCANCEL lens at read time against the LOAD_UNCANCELLED
        // audit row. status_machine.unexpected_cumulative on /api/health is the
        // authoritative answer for these, never this line.
        uncancelEdge: reversal ? true : undefined,
        why: known ?? undefined,
      },
      reversal
        ? `[LoadTransition] ${from} -> ${to} is a cancellation reversal; authorisation resolved at read time`
        : `[LoadTransition] ${from} -> ${to} not in AE map`,
    );
  } catch {
    // Observation must never surface to a write path.
  }
}

/** Exposed for the test that pins the documented divergences. */
export const __KNOWN_DIVERGENCES = KNOWN_DIVERGENCES;
