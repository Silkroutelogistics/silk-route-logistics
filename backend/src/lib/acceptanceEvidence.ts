/**
 * Acceptance evidence: the record that a carrier agreed to haul this load.
 *
 * WHY THIS IS ONE MODULE AND NOT SIX WRITES. Six paths can establish the act,
 * and the rules that make the record trustworthy -- stamp for the party whose
 * act it was, first write wins, never coerce a mismatch -- have to hold on all
 * six or the record is only as good as the weakest one. Six copies is six
 * chances to forget, and the seventh path added later inherits nothing. This
 * codebase has unpicked that shape repeatedly (dual suspension columns, dual
 * onboarding status, eleven Load.carrierId writers); one writer is the answer
 * it keeps arriving at.
 *
 * WHY NOT INFER IT FROM STATUS. `Load.status` reaching DISPATCHED is not
 * evidence a carrier accepted anything. Three SRL-side paths reach DISPATCHED
 * with no carrier act at all, and none is a defect -- they simply stamp
 * nothing. A status column can also be moved again afterwards. "Where is this
 * load now" and "did the carrier ever agree to haul it" are different
 * questions, and a dispute asks the second.
 */
import { prisma } from "../config/database";
import { log } from "./logger";

/**
 * How the acceptance was established. Exhaustive: a path not named here stamps
 * nothing rather than inventing a value.
 */
export type AcceptanceVia =
  | "RC_SIGNATURE"
  | "TENDER_ACCEPT"
  | "BID_AWARD_ACCEPT"
  | "STATUS_CONFIRMED"
  | "STATUS_BOOKED"
  | "PICKUP_ARRIVAL";

export const ACCEPTANCE_VIA: readonly AcceptanceVia[] = [
  "RC_SIGNATURE",
  "TENDER_ACCEPT",
  "BID_AWARD_ACCEPT",
  "STATUS_CONFIRMED",
  "STATUS_BOOKED",
  "PICKUP_ARRIVAL",
] as const;

export interface StampAcceptanceInput {
  loadId: string;
  via: AcceptanceVia;
  /**
   * The carrier whose act this was, as a User.id -- the Load.carrierId space.
   *
   * Resolved from the AUTHORITATIVE ROW for the path, never from anything the
   * actor supplied. On the token path that is the rate confirmation's load; the
   * typed signer name is evidence of who signed, never the identity itself,
   * because a text input cannot establish which carrier a load belongs to.
   */
  carrierUserId: string;
  /** The signed-in user who performed it. NULL where there is no session. */
  byUserId?: string | null;
  at: Date;
}

export type StampResult =
  | { stamped: true }
  | { stamped: false; reason: "already_stamped" | "carrier_mismatch" | "load_not_found" };

/** Anything that exposes `load.updateMany` / `load.findUnique` -- prisma or a tx client. */
type LoadDb = {
  load: {
    updateMany: (args: unknown) => Promise<{ count: number }>;
    findUnique: (args: unknown) => Promise<{ carrierId: string | null; carrierAcceptedAt: Date | null } | null>;
  };
};

/**
 * Record an acceptance. Idempotent, and safe to call from any of the six paths.
 *
 * FIRST WRITE WINS IS ENFORCED BY THE DATABASE, not by a read-then-check. The
 * update is scoped `carrierAcceptedAt: null`, so two concurrent acts on the
 * same load cannot both land -- one matches zero rows. A read-then-write would
 * leave a window between the read and the write in which the other act commits,
 * and both would then believe they were first. Same reasoning as the single-use
 * signing token in v3.8.axu, where a sequential pre-check passed and six
 * concurrent replays still wrote five times.
 *
 * R8d IS ENFORCED THE SAME WAY. `carrierId: carrierUserId` is in the WHERE, so
 * a stamp naming a carrier who does not hold the load matches zero rows and
 * writes nothing. It is never coerced onto the load's current carrier: a
 * disagreement means one of the two is wrong, and guessing which would put a
 * confident-looking name on a record a dispute reads.
 *
 * NEVER THROWS. This records an act that has already happened; a failure here
 * must not undo it. The caller is told what happened and carries on.
 */
export async function stampCarrierAcceptance(
  input: StampAcceptanceInput,
  db: LoadDb = prisma as unknown as LoadDb,
): Promise<StampResult> {
  const { loadId, via, carrierUserId, byUserId, at } = input;

  const res = await db.load.updateMany({
    where: { id: loadId, carrierAcceptedAt: null, carrierId: carrierUserId },
    data: {
      carrierAcceptedAt: at,
      carrierAcceptedVia: via,
      carrierAcceptedByUserId: byUserId ?? null,
      carrierAcceptedCarrierId: carrierUserId,
    },
  });
  if (res.count === 1) return { stamped: true };

  // Zero rows: already stamped (ordinary, and the point of the guard), the
  // carrier disagrees (worth a human), or the load is gone. Read to say which,
  // because "nothing was written" is three different facts and only one of them
  // is fine.
  const load = await db.load.findUnique({
    where: { id: loadId },
    select: { carrierId: true, carrierAcceptedAt: true },
  });
  if (!load) {
    log.warn({ loadId, via }, "[Acceptance] stamp skipped — load not found");
    return { stamped: false, reason: "load_not_found" };
  }
  if (load.carrierAcceptedAt) return { stamped: false, reason: "already_stamped" };

  log.warn(
    { loadId, via, stampCarrierUserId: carrierUserId, loadCarrierId: load.carrierId },
    "[Acceptance] stamp REFUSED — the act names a carrier who does not hold this load",
  );
  return { stamped: false, reason: "carrier_mismatch" };
}
