import { logLoadActivity } from "./loadActivityService";
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
}) {
  return logLoadActivity({
    loadId: params.loadId,
    eventType: params.event,
    description: params.description,
    actorType: params.actorType ?? "SYSTEM",
    actorId: params.actorId,
    actorName: params.actorName,
    metadata: params.metadata,
  });
}
