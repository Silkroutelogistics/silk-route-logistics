import { logLoadActivity } from "./loadActivityService";
import { log } from "../lib/logger";
import type { Prisma } from "@prisma/client";

/**
 * Thin wrapper around logLoadActivity that stamps every waterfall lifecycle
 * event into the shared load activity timeline. Keeps the Track & Trace
 * Activity tab as the single source of truth for load history (Karpathy
 * Rule 12 — event-based state transitions).
 */
export async function logWaterfallEvent(params: {
  loadId: string;
  event:
    | "waterfall_built"
    | "waterfall_started"
    | "waterfall_paused"
    | "waterfall_resumed"
    | "waterfall_cancelled"
    | "waterfall_exhausted"
    | "position_tendered"
    | "position_accepted"
    | "position_declined"
    | "position_expired"
    | "position_skipped"
    | "fallback_loadboard"
    | "fallback_dat"
    | "dispatch_method_changed"
    | "visibility_changed"
    | "load_dispatched"
    | "bid_submitted"
    | "bid_accepted"
    | "bid_rejected"
    | "note_added";
  description: string;
  actorType?: "USER" | "SYSTEM" | "CARRIER" | "DRIVER" | "SHIPPER";
  actorId?: string | null;
  actorName?: string | null;
  metadata?: Prisma.InputJsonValue;
  /** Scope this event to one tender when it is about a tender. */
  tenderId?: string | null;
}) {
  return logLoadActivity({
    loadId: params.loadId,
    eventType: params.event,
    description: params.description,
    actorType: params.actorType ?? "SYSTEM",
    actorId: params.actorId,
    actorName: params.actorName,
    metadata: params.metadata,
    tenderId: params.tenderId,
  });
}

/**
 * Every state a tender can occupy.
 *
 * OFFERED   — live offer, awaiting the carrier.
 * COUNTERED — carrier proposed a different rate; still live, ball with the AE.
 * ACCEPTED  — carrier committed. This is what assigns the carrier to the load.
 * RC_SENT   — rate confirmation issued, awaiting signature.
 * CONFIRMED — rate confirmation signed. The tender is fully executed.
 * DECLINED  — CARRIER-INITIATED REFUSAL, and only ever that. Nothing SRL does
 *             may write it: a carrier's decline rate is read as a performance
 *             signal, so recording an SRL-side action as a decline would put a
 *             mark against a carrier who did nothing.
 * WITHDRAWN — SRL pulled the offer. Covers "another carrier took it"
 *             (load_covered), a rejected counter, and any AE cancellation.
 * EXPIRED   — TTL elapsed with no answer from anyone.
 * RELEASED  — carrier came off a load they had already been assigned to.
 */
export type TenderState =
  | "OFFERED"
  | "COUNTERED"
  | "ACCEPTED"
  | "RC_SENT"
  | "CONFIRMED"
  | "DECLINED"
  | "WITHDRAWN"
  | "EXPIRED"
  | "RELEASED";

/**
 * Record a tender state transition — THE single writer for tender history.
 *
 * Every path that moves a tender between states calls this, so the drawer's
 * "Tender History" has one source and cannot be told a partial story by a
 * caller that forgot to log. `reason` is free-form but the callers use a fixed
 * vocabulary (load_covered, counter_rejected, carrier_fell_off, ...) so the
 * timeline can be filtered on it later without parsing prose.
 *
 * Non-throwing by design: a history write must never be able to fail the
 * transition it is describing. A lost line in the log is bad; a tender stuck
 * half-transitioned because logging fell over is worse.
 */
export async function logTenderTransition(params: {
  tenderId: string;
  loadId: string;
  from: TenderState | null;
  to: TenderState;
  reason?: string | null;
  actorType?: "USER" | "SYSTEM" | "CARRIER" | "DRIVER" | "SHIPPER";
  actorId?: string | null;
  actorName?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const arrow = params.from ? `${params.from} → ${params.to}` : `→ ${params.to}`;
  try {
    return await logLoadActivity({
      loadId: params.loadId,
      eventType: "tender_transition",
      description: params.reason ? `Tender ${arrow} (${params.reason})` : `Tender ${arrow}`,
      actorType: params.actorType ?? "SYSTEM",
      actorId: params.actorId,
      actorName: params.actorName,
      tenderId: params.tenderId,
      metadata: {
        from: params.from,
        to: params.to,
        reason: params.reason ?? null,
        ...params.metadata,
      } as Prisma.InputJsonValue,
    });
  } catch (err) {
    log.error(
      { err, tenderId: params.tenderId, from: params.from, to: params.to },
      "[TenderEvent] transition log failed — transition itself is unaffected",
    );
    return null;
  }
}
