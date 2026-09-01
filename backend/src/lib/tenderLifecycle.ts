/**
 * The tender lifecycle vocabulary, in one place.
 *
 * WHY. "Which loads are on the board" and "which loads are in transit" were
 * each answered by reading `Load.status` and comparing against a list written
 * out at the call site. Two lists, two files, no relationship — and the
 * lifecycle audit found them OVERLAPPING BY SIX: a load could appear on the
 * Load Board and in Track & Trace at the same time, which is not a display bug
 * so much as two surfaces disagreeing about whether a truck is booked.
 *
 * The partition is a property of the TENDER, not the load. A load is off the
 * board the moment a carrier holds it, and it is in Track & Trace for exactly
 * the same reason. Deriving both from one predicate is what makes them
 * complementary by construction rather than by two people keeping two lists in
 * step.
 */
import { TenderStatus } from "@prisma/client";

/**
 * A carrier holds this load.
 *
 * ACCEPTED is the moment the load leaves the board — not RC_SENT and not
 * CONFIRMED. The paperwork state says how far the terms have got; it does not
 * change who has the truck. Putting a load back on the board because the rate
 * confirmation is unsigned would offer freight that is already committed.
 */
export const HOLDS_LOAD: TenderStatus[] = ["ACCEPTED", "RC_SENT", "CONFIRMED"];

/** Still open for the carrier to answer. */
export const LIVE_STATES: TenderStatus[] = ["OFFERED", "COUNTERED"];

/** Settled without the carrier taking the load. */
export const SETTLED_STATES: TenderStatus[] = ["DECLINED", "WITHDRAWN", "EXPIRED", "RELEASED"];

/**
 * How long a rate confirmation may sit unsigned before the load needs a human.
 *
 * Read at call time rather than module load so a test can move it, and bounded
 * so a typo cannot either flood Needs Attention (0) or silence it entirely
 * (a year). The default of 4 hours is the ratified figure.
 */
export function rcSignSlaHours(): number {
  const raw = Number(process.env.RC_SIGN_SLA_HOURS);
  if (!Number.isFinite(raw) || raw <= 0) return 4;
  return Math.min(168, Math.max(1, raw));
}

/**
 * Prisma `where` fragment: loads a carrier holds.
 *
 * Expressed as `some` over the tenders rather than a column on the load,
 * because the column is the thing that kept drifting. A load whose tender was
 * released still read BOOKED until somebody remembered to walk the status back;
 * a load whose tender is ACCEPTED is held whatever the column says.
 */
//
// `Load.carrierId` is in the OR because direct assignment is a real path: an AE
// can put a carrier on a load without a tender ever existing. Reading only the
// tenders would drop those loads out of Track & Trace entirely -- trucks in
// transit, invisible -- which is a worse failure than the overlap this replaces.
export const heldByCarrier = {
  OR: [
    { tenders: { some: { status: { in: HOLDS_LOAD }, deletedAt: null } } },
    { carrierId: { not: null } },
  ],
} as const;

/**
 * Prisma `where` fragment: loads no carrier holds.
 *
 * The EXACT complement of the above, by construction rather than by two lists
 * kept in step. That is the whole point: the previous pair overlapped by six
 * statuses, so a load could sit on the board and in Track & Trace at once.
 */
export const notHeldByCarrier = {
  AND: [
    { tenders: { none: { status: { in: HOLDS_LOAD }, deletedAt: null } } },
    { carrierId: null },
  ],
} as const;
