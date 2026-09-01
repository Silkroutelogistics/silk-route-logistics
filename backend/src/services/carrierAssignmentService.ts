import { Prisma, LoadStatus } from "@prisma/client";
import { ActorRole } from "../lib/loadStateMachine";
import { prisma } from "../config/database";

/**
 * The single writer of `Load.carrierId`.
 *
 * WHY THIS EXISTS. The tender-lifecycle audit found ELEVEN code paths writing
 * that column across seven files — including `carrierLoads.ts`, where a carrier
 * assigned *themselves* to a load. Which carrier is on a load decides who gets
 * paid, who the rate confirmation names, who the BOL names, and who the shipper
 * is told is coming. Eleven independent writers for that is not a style
 * problem; it is eleven places for the answer to differ.
 *
 * Consolidating them here does not by itself prevent a twelfth. The guard added
 * alongside this service is what does that, by failing on any write outside the
 * known set.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ID-SPACE HAZARD, which is the reason the parameter is named the way it is.
 *
 *   Load.carrierId        is a **User.id**
 *   LoadTender.carrierId  is a **CarrierProfile.id**
 *
 * Same field name, two different tables. This has already cost real money once:
 * `waterfallEngineService.acceptPosition` passed a User id to a lookup expecting
 * a CarrierProfile id, so every waterfall accept failed as "Carrier not found",
 * skipped the position, and advanced — silently, in the shape of an ordinary
 * compliance decline, from the very commit that added the check (§13.3 Item
 * 222.4). Auto-dispatch could not accept a carrier for months.
 *
 * So the parameter is `carrierUserId`, never `carrierId`. A caller holding a
 * CarrierProfile has to resolve `.userId` first, and the name makes that
 * obvious at the call site instead of at 2am.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THESE RETURN A PROMISE INSTEAD OF AWAITING.
 *
 * `acceptTender` assigns the carrier inside `prisma.$transaction([...])` — the
 * ARRAY form, which takes un-awaited PrismaPromises. An `async` helper would
 * have to be awaited before the array is built, which would execute the write
 * OUTSIDE the transaction and quietly undo the atomicity Sprint 38 added
 * deliberately (§13.3 Item 53: before it, a partial failure left the load BOOKED
 * while the tender was still OFFERED).
 *
 * Returning the PrismaPromise lets a caller compose it into a transaction, or
 * simply `await` it when there is nothing to compose with. Both callers below
 * do exactly one of those.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FOOTGUN, found by the proof failing rather than by reasoning.
 *
 * The promise must be built on the SAME client that opens the transaction. A
 * PrismaPromise from one client cannot be enrolled in another client's
 * `$transaction`, and the failure is SILENT: the operation simply executes on
 * its own and survives the rollback. No error, no warning.
 *
 * The first run of `scripts/_carrier-assignment-proof.ts` did exactly this —
 * `new PrismaClient()` in the test, the singleton in here — and the atomicity
 * assertion failed while everything else passed. The code was right and the
 * test was wrong, but the shape is a real hazard for a future caller.
 *
 * So: pass a `db` only when it is a transaction client from THIS singleton
 * (`prisma.$transaction(async (tx) => ...)`), never a separate PrismaClient.
 */

/** A caller's transaction client, or the shared singleton. */
export type AssignmentDb = Prisma.TransactionClient | typeof prisma;

export interface AssignCarrierInput {
  loadId: string;
  /** A **User.id**. See the ID-space note above — this is not a CarrierProfile id. */
  carrierUserId: string;
  /** Load status to move to alongside the assignment, when the caller owns that decision. */
  /**
   * WHICH RULE SET governs this transition, not who pressed the button.
   *
   * AE is a person moving a load through the ordinary pipeline. AUTO is the
   * platform dispatching or recovering: waterfall accept, loadboard-bid accept,
   * instant book, fall-off recovery, release. A loadboard bid is accepted BY an
   * AE and is still AUTO, because what follows is auto-pilot dispatch semantics
   * rather than the AE-curated BOOKED checkpoint (§2).
   *
   * Typed so the callers that fan in here cannot disagree silently. RECORDED,
   * NOT ENFORCED: Item 194 established that enforcing the canonical map today
   * breaks bulk dispatch and fall-off recovery.
   */
  actor: ActorRole;
  status?: LoadStatus;
  /** The rate agreed with this carrier, when the caller knows it. */
  carrierRate?: number | null;
  /** Extra columns the calling path owns (dispatchedAt, driver fields, ...). */
  extra?: Prisma.LoadUncheckedUpdateInput;
}

/**
 * Put a carrier on a load.
 *
 * Returns an un-awaited PrismaPromise so it can be composed into
 * `$transaction([...])`. Await it directly when there is nothing to compose.
 */
export function assignCarrier(input: AssignCarrierInput, db: AssignmentDb = prisma) {
  const { loadId, carrierUserId, status, carrierRate, extra } = input;
  return db.load.update({
    where: { id: loadId },
    data: {
      carrierId: carrierUserId,
      ...(status ? { status } : {}),
      ...(carrierRate !== undefined ? { carrierRate } : {}),
      ...(extra ?? {}),
    },
  });
}

export interface ClearCarrierInput {
  loadId: string;
  /** Status to move the load to once the carrier is off it — usually POSTED. */
  /**
   * WHICH RULE SET governs this transition, not who pressed the button.
   *
   * AE is a person moving a load through the ordinary pipeline. AUTO is the
   * platform dispatching or recovering: waterfall accept, loadboard-bid accept,
   * instant book, fall-off recovery, release. A loadboard bid is accepted BY an
   * AE and is still AUTO, because what follows is auto-pilot dispatch semantics
   * rather than the AE-curated BOOKED checkpoint (§2).
   *
   * Typed so the callers that fan in here cannot disagree silently. RECORDED,
   * NOT ENFORCED: Item 194 established that enforcing the canonical map today
   * breaks bulk dispatch and fall-off recovery.
   */
  actor: ActorRole;
  status?: LoadStatus;
  /** Extra columns the calling path owns (clearing driver name/phone, etc). */
  extra?: Prisma.LoadUncheckedUpdateInput;
}

/**
 * Take the carrier off a load.
 *
 * Same promise-returning shape as `assignCarrier`, for the same reason. Callers
 * that need the load re-posted pass `status: "POSTED"` rather than issuing a
 * second update, so the load never exists in a state with no carrier and a
 * status that implies one.
 */
export function clearCarrier(input: ClearCarrierInput, db: AssignmentDb = prisma) {
  const { loadId, status, extra } = input;
  return db.load.update({
    where: { id: loadId },
    data: {
      carrierId: null,
      ...(status ? { status } : {}),
      ...(extra ?? {}),
    },
  });
}
