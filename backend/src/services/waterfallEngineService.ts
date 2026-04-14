/**
 * Waterfall Dispatch — engine orchestration
 *
 * Responsibilities:
 *  - Build a waterfall (positions + DAT fallback) from scoring output
 *  - Start the cascade (tender position #1)
 *  - Advance the cascade when a position is declined/expired/skipped
 *  - Execute the fallback chain (flip visibility → open → DAT after 2h)
 *  - Full-auto picker: fire any pending POSTED + dispatchMethod=waterfall
 *    + waterfallMode=full_auto loads (called by the 30s cron)
 *
 * All state mutations emit events via loadActivityService so the Track
 * & Trace timeline stays authoritative (Karpathy Rule 12).
 */

import { prisma } from "../config/database";
import type { Prisma } from "@prisma/client";
import { log } from "../lib/logger";
import {
  scoreCarriersForLoad,
  loadLoadContext,
  scoredCarrierToJson,
  type ScoredCarrier,
  type LoadContext,
} from "./waterfallScoringService";
import { logWaterfallEvent } from "./waterfallEventService";
import { broadcastSSE } from "../routes/trackTraceSSE";

const TENDER_WINDOW_MS = 20 * 60 * 1000;            // 20 minutes per position
const LOADBOARD_FALLBACK_WINDOW_MS = 2 * 60 * 60 * 1000; // 2h before DAT
const LOADBOARD_MAX_BID_AGE_DAYS = 30;

// ────────── Build ──────────

export interface BuildOptions {
  mode?: "manual" | "semi_auto" | "full_auto";
  createdById?: string | null;
  maxPositions?: number;
}

/**
 * Create a new Waterfall + populate WaterfallPositions for the load,
 * running the scoring service and appending a DAT fallback marker at
 * the end. Does NOT start tendering — call startWaterfall for that.
 */
export async function buildWaterfall(loadId: string, opts: BuildOptions = {}) {
  const ctx = await loadLoadContext(loadId);
  if (!ctx) throw new Error(`Load ${loadId} not found`);

  const scored = await scoreCarriersForLoad(ctx);
  const max = opts.maxPositions ?? 12;
  const top = scored.slice(0, max);

  // Close any prior non-terminal waterfall so we never run two side-by-side.
  await prisma.waterfall.updateMany({
    where: { loadId, status: { in: ["building", "active", "paused"] } },
    data: { status: "cancelled", completedAt: new Date() },
  });

  const waterfall = await prisma.waterfall.create({
    data: {
      loadId,
      mode: opts.mode ?? "full_auto",
      status: "building",
      createdById: opts.createdById ?? null,
      totalPositions: top.length + 1, // +1 for DAT fallback
      currentPosition: 0,
    },
  });

  let posIndex = 1;
  for (const sc of top) {
    await prisma.waterfallPosition.create({
      data: {
        waterfallId: waterfall.id,
        carrierId: sc.userId, // store User.id since Load.carrierId references User
        position: posIndex++,
        matchScore: sc.matchScore,
        offeredRate: ctx.carrierRate ?? null,
        offeredRatePerMile: ctx.carrierRate && ctx.distance ? ctx.carrierRate / ctx.distance : null,
        marginAmount: ctx.customerRate && ctx.carrierRate ? ctx.customerRate - ctx.carrierRate : null,
        marginPercent: ctx.customerRate && ctx.carrierRate
          ? ((ctx.customerRate - ctx.carrierRate) / ctx.customerRate) * 100
          : null,
        status: "queued",
      },
    });
  }

  // DAT fallback position (carrier_id null, is_fallback true)
  await prisma.waterfallPosition.create({
    data: {
      waterfallId: waterfall.id,
      carrierId: null,
      position: posIndex,
      status: "queued",
      isFallback: true,
    },
  });

  await logWaterfallEvent({
    loadId,
    event: "waterfall_built",
    description: `Waterfall built — ${top.length} carrier position${top.length === 1 ? "" : "s"} + DAT fallback`,
    actorType: opts.createdById ? "USER" : "SYSTEM",
    actorId: opts.createdById,
    metadata: {
      waterfallId: waterfall.id,
      mode: waterfall.mode,
      positions: top.map((t) => scoredCarrierToJson(t)),
    },
  });

  return waterfall;
}

// ────────── Start / Advance ──────────

/**
 * Start the cascade by tendering position #1. Sets waterfall status to
 * active and records `started_at`. Idempotent — if the waterfall is
 * already active, returns current state.
 */
export async function startWaterfall(waterfallId: string) {
  const wf = await prisma.waterfall.findUnique({
    where: { id: waterfallId },
    include: {
      positions: { orderBy: { position: "asc" } },
      load: { select: { id: true, customerRate: true, carrierRate: true } },
    },
  });
  if (!wf) throw new Error("Waterfall not found");
  if (wf.status === "active") return wf;
  if (wf.status !== "building" && wf.status !== "paused") {
    throw new Error(`Cannot start waterfall in status ${wf.status}`);
  }

  await prisma.waterfall.update({
    where: { id: waterfallId },
    data: { status: "active", startedAt: new Date() },
  });

  await logWaterfallEvent({
    loadId: wf.loadId,
    event: "waterfall_started",
    description: `Waterfall cascade started (${wf.positions.length} positions)`,
    metadata: { waterfallId },
  });

  // Flip visibility to waterfall so the load hides from the open loadboard.
  await prisma.load.update({
    where: { id: wf.loadId },
    data: { visibility: "waterfall", status: "TENDERED" },
  });

  await tenderPosition(waterfallId, 1);
  return wf;
}

/**
 * Open a tender on a specific position — writes LoadTender, stamps
 * waterfall_position, broadcasts SSE, logs event. Skipped positions
 * jump past. DAT fallback positions delegate to the fallback chain.
 */
async function tenderPosition(waterfallId: string, position: number) {
  const pos = await prisma.waterfallPosition.findFirst({
    where: { waterfallId, position },
    include: { waterfall: { select: { loadId: true, mode: true } } },
  });
  if (!pos) return;

  if (pos.isFallback) {
    await triggerFallbackChain(pos.waterfall.loadId, waterfallId);
    return;
  }
  if (!pos.carrierId) return; // defensive

  // Find CarrierProfile for this User so we can write LoadTender.carrierId
  const profile = await prisma.carrierProfile.findUnique({
    where: { userId: pos.carrierId },
    select: { id: true, userId: true },
  });
  if (!profile) {
    // Bad data — skip this position
    await prisma.waterfallPosition.update({
      where: { id: pos.id },
      data: { status: "skipped" },
    });
    await advanceWaterfall(waterfallId, position + 1);
    return;
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + TENDER_WINDOW_MS);

  const tender = await prisma.loadTender.create({
    data: {
      loadId: pos.waterfall.loadId,
      carrierId: profile.id,
      status: "OFFERED",
      offeredRate: Number(pos.offeredRate ?? 0),
      expiresAt,
      waterfallPositionId: pos.id,
    },
  });

  await prisma.waterfallPosition.update({
    where: { id: pos.id },
    data: {
      status: "tendered",
      tenderSentAt: now,
      tenderExpiresAt: expiresAt,
    },
  });

  await prisma.waterfall.update({
    where: { id: waterfallId },
    data: { currentPosition: position },
  });

  await logWaterfallEvent({
    loadId: pos.waterfall.loadId,
    event: "position_tendered",
    description: `Tender #${position} sent (${TENDER_WINDOW_MS / 60000} min window)`,
    metadata: { waterfallId, positionId: pos.id, tenderId: tender.id, carrierUserId: pos.carrierId, expiresAt },
  });

  broadcastSSE({
    type: "waterfall_tendered",
    loadId: pos.waterfall.loadId,
    data: { waterfallId, position, tenderId: tender.id, expiresAt },
  });

  // TODO: wire carrier push + email notification when the notification
  // fan-out service is ready. The tender is already queryable via the
  // carrier portal so the path is unblocked.
  try {
    await prisma.notification.create({
      data: {
        userId: pos.carrierId,
        type: "LOAD",
        title: "New tender offered",
        message: `You have a new load tender. 20 minutes to respond.`,
        actionUrl: "/carrier/dashboard/tenders",
      },
    });
  } catch {
    // non-blocking
  }
}

/**
 * Move the cascade forward to the next non-terminal position. Used by
 * decline / expire / skip handlers. If nextPosition exceeds the total,
 * triggers the fallback chain.
 */
export async function advanceWaterfall(waterfallId: string, nextPosition: number) {
  const wf = await prisma.waterfall.findUnique({
    where: { id: waterfallId },
    select: { id: true, loadId: true, totalPositions: true },
  });
  if (!wf) return;

  if (nextPosition > wf.totalPositions) {
    // shouldn't happen — DAT fallback is always the last position
    await triggerFallbackChain(wf.loadId, waterfallId);
    return;
  }

  await tenderPosition(waterfallId, nextPosition);
}

/**
 * Mark a position declined + advance. Called from the carrier-portal
 * decline endpoint and the /positions/:id/skip endpoint.
 */
export async function declinePosition(positionId: string, reason: string | null, actorId?: string | null) {
  const pos = await prisma.waterfallPosition.findUnique({
    where: { id: positionId },
    include: { waterfall: { select: { id: true, loadId: true } } },
  });
  if (!pos || pos.status !== "tendered") return;

  await prisma.waterfallPosition.update({
    where: { id: positionId },
    data: { status: "declined", respondedAt: new Date(), declineReason: reason ?? null },
  });

  // Mark matching LoadTender as DECLINED
  await prisma.loadTender.updateMany({
    where: { waterfallPositionId: positionId, status: "OFFERED" },
    data: { status: "DECLINED", respondedAt: new Date() },
  });

  await logWaterfallEvent({
    loadId: pos.waterfall.loadId,
    event: "position_declined",
    description: `Position #${pos.position} declined${reason ? `: ${reason}` : ""}`,
    actorType: actorId ? "CARRIER" : "SYSTEM",
    actorId,
    metadata: { positionId, waterfallId: pos.waterfall.id, reason },
  });

  await advanceWaterfall(pos.waterfall.id, pos.position + 1);
}

/**
 * Mark a position accepted + dispatch the load. This is the happy-path
 * terminal state for a waterfall.
 */
export async function acceptPosition(positionId: string, actorId?: string | null) {
  const pos = await prisma.waterfallPosition.findUnique({
    where: { id: positionId },
    include: {
      waterfall: { select: { id: true, loadId: true } },
    },
  });
  if (!pos || pos.status !== "tendered" || !pos.carrierId) return;

  const now = new Date();

  // Mark position + tender accepted
  await prisma.waterfallPosition.update({
    where: { id: positionId },
    data: { status: "accepted", respondedAt: now },
  });
  await prisma.loadTender.updateMany({
    where: { waterfallPositionId: positionId, status: "OFFERED" },
    data: { status: "ACCEPTED", respondedAt: now },
  });

  // Cancel any remaining queued positions
  await prisma.waterfallPosition.updateMany({
    where: {
      waterfallId: pos.waterfall.id,
      status: "queued",
    },
    data: { status: "skipped" },
  });

  // Close waterfall
  await prisma.waterfall.update({
    where: { id: pos.waterfall.id },
    data: { status: "completed", completedAt: now, completedCarrierId: pos.carrierId },
  });

  // Dispatch the load — status=DISPATCHED per Karpathy state machine
  await prisma.load.update({
    where: { id: pos.waterfall.loadId },
    data: {
      status: "DISPATCHED",
      carrierId: pos.carrierId,
      dispatchedAt: now,
      dispatchedCarrierId: pos.carrierId,
      statusUpdatedAt: now,
      carrierConfirmedAt: now,
    },
  });

  await logWaterfallEvent({
    loadId: pos.waterfall.loadId,
    event: "position_accepted",
    description: `Position #${pos.position} accepted — load dispatched`,
    actorType: actorId ? "CARRIER" : "SYSTEM",
    actorId,
    metadata: { positionId, waterfallId: pos.waterfall.id },
  });

  await logWaterfallEvent({
    loadId: pos.waterfall.loadId,
    event: "load_dispatched",
    description: "Load dispatched via waterfall",
    actorType: "SYSTEM",
    metadata: { via: "waterfall", carrierUserId: pos.carrierId },
  });

  broadcastSSE({
    type: "waterfall_completed",
    loadId: pos.waterfall.loadId,
    data: { waterfallId: pos.waterfall.id, carrierUserId: pos.carrierId },
  });

  // Auto-schedule check calls (reuses existing service)
  try {
    const { createCheckCallSchedule } = await import("./checkCallAutomation");
    await createCheckCallSchedule(pos.waterfall.loadId);
  } catch (err) {
    log.error({ err }, "[Waterfall] check-call schedule failed");
  }

  // CRM tracking-link fan-out: email tracking URL to any customer
  // contact flagged receivesTrackingLink=true. Non-blocking.
  try {
    const { sendTrackingLinkToCrmContacts } = await import("./shipperLoadNotifyService");
    await sendTrackingLinkToCrmContacts(pos.waterfall.loadId);
  } catch (err) {
    log.error({ err }, "[Waterfall] tracking-link fan-out failed");
  }
}

/**
 * Called by the 30s cron. Finds positions whose tender window has
 * elapsed without a response, marks them expired, and advances.
 */
export async function expireStalePositions() {
  const now = new Date();
  const stale = await prisma.waterfallPosition.findMany({
    where: {
      status: "tendered",
      tenderExpiresAt: { lt: now },
    },
    include: { waterfall: { select: { id: true, loadId: true, status: true } } },
  });

  for (const pos of stale) {
    if (pos.waterfall.status !== "active") continue;

    await prisma.waterfallPosition.update({
      where: { id: pos.id },
      data: { status: "expired", respondedAt: now },
    });
    await prisma.loadTender.updateMany({
      where: { waterfallPositionId: pos.id, status: "OFFERED" },
      data: { status: "EXPIRED", respondedAt: now },
    });

    await logWaterfallEvent({
      loadId: pos.waterfall.loadId,
      event: "position_expired",
      description: `Position #${pos.position} expired (no response in window)`,
      metadata: { positionId: pos.id, waterfallId: pos.waterfall.id },
    });

    await advanceWaterfall(pos.waterfall.id, pos.position + 1);
  }

  return { expired: stale.length };
}

// ────────── Fallback chain ──────────

/**
 * Waterfall carriers exhausted → flip load to visibility=open and post
 * it to the internal loadboard. A separate cron tick will promote to
 * DAT after 2h with no accepted bids.
 */
export async function triggerFallbackChain(loadId: string, waterfallId: string) {
  const now = new Date();

  await prisma.waterfall.update({
    where: { id: waterfallId },
    data: { status: "exhausted", completedAt: now },
  });

  await prisma.load.update({
    where: { id: loadId },
    data: {
      visibility: "open",
      fallbackChainStartedAt: now,
      fallbackPostedToLoadboardAt: now,
    },
  });

  await logWaterfallEvent({
    loadId,
    event: "waterfall_exhausted",
    description: "Waterfall exhausted — flipping to open loadboard",
    metadata: { waterfallId },
  });
  await logWaterfallEvent({
    loadId,
    event: "fallback_loadboard",
    description: "Load posted to open loadboard (fallback step 1)",
    metadata: { waterfallId },
  });

  // Notify the load poster so they know manual intervention is looming
  try {
    const load = await prisma.load.findUnique({
      where: { id: loadId },
      select: { posterId: true, referenceNumber: true, loadNumber: true },
    });
    if (load?.posterId) {
      await prisma.notification.create({
        data: {
          userId: load.posterId,
          type: "LOAD",
          title: "Waterfall exhausted",
          message: `Load ${load.loadNumber ?? load.referenceNumber} is now on the open loadboard. Will post to DAT in 2h if no accepted bids.`,
          actionUrl: "/dashboard/waterfall",
        },
      });
    }
  } catch {
    // non-blocking
  }

  broadcastSSE({ type: "waterfall_fallback", loadId, data: { step: "loadboard", waterfallId } });
}

/**
 * 2h after loadboard fallback, promote any still-open loads to DAT.
 * Called by the 30s cron on every tick (cheap query).
 */
export async function promoteStaleOpenLoadsToDat() {
  const cutoff = new Date(Date.now() - LOADBOARD_FALLBACK_WINDOW_MS);

  const stale = await prisma.load.findMany({
    where: {
      visibility: "open",
      fallbackPostedToLoadboardAt: { lt: cutoff },
      fallbackPostedToDatAt: null,
      status: { in: ["POSTED", "TENDERED"] },
      deletedAt: null,
    },
    select: { id: true, posterId: true, referenceNumber: true, loadNumber: true },
  });

  for (const l of stale) {
    const acceptedBids = await prisma.loadBid.count({
      where: { loadId: l.id, status: "accepted" },
    });
    if (acceptedBids > 0) continue; // somebody took it, skip

    const now = new Date();
    await prisma.load.update({
      where: { id: l.id },
      data: { visibility: "dat", fallbackPostedToDatAt: now },
    });

    await logWaterfallEvent({
      loadId: l.id,
      event: "fallback_dat",
      description: "Load posted to DAT (fallback step 2)",
      metadata: { step: "dat" },
    });

    if (l.posterId) {
      try {
        await prisma.notification.create({
          data: {
            userId: l.posterId,
            type: "LOAD",
            title: "Load on DAT",
            message: `Load ${l.loadNumber ?? l.referenceNumber} posted to DAT — manual intervention may be needed.`,
            actionUrl: "/dashboard/waterfall",
          },
        });
      } catch {}
    }

    broadcastSSE({ type: "waterfall_fallback", loadId: l.id, data: { step: "dat" } });
  }

  return { promoted: stale.length };
}

// ────────── Full-auto picker ──────────

/**
 * Find POSTED loads whose dispatch_method=waterfall and waterfall_mode=
 * full_auto, have no existing active waterfall, and kick them off. Keeps
 * the load create request path fast — the user confirmed async is OK.
 */
export async function pickPendingFullAutoLoads() {
  const loads = await prisma.load.findMany({
    where: {
      dispatchMethod: "waterfall",
      waterfallMode: "full_auto",
      status: "POSTED",
      deletedAt: null,
      createdAt: { gte: new Date(Date.now() - LOADBOARD_MAX_BID_AGE_DAYS * 24 * 60 * 60 * 1000) },
    },
    select: { id: true, referenceNumber: true, loadNumber: true },
    take: 20,
  });

  let started = 0;
  for (const l of loads) {
    const existing = await prisma.waterfall.findFirst({
      where: { loadId: l.id, status: { in: ["building", "active", "paused"] } },
      select: { id: true },
    });
    if (existing) continue;

    try {
      const wf = await buildWaterfall(l.id, { mode: "full_auto" });
      await startWaterfall(wf.id);
      started++;
    } catch (err) {
      log.error({ err, loadId: l.id }, "[Waterfall] full-auto start failed");
    }
  }
  return { started, considered: loads.length };
}

// ────────── Cron entrypoint ──────────

/**
 * Single entrypoint the scheduler calls every 30 seconds. Intentionally
 * sequential so that a slow expire doesn't overlap with a full-auto pick
 * run in the same tick.
 */
export async function waterfallTick() {
  const expired = await expireStalePositions();
  const fallback = await promoteStaleOpenLoadsToDat();
  const started = await pickPendingFullAutoLoads();
  return { ...expired, ...fallback, ...started };
}
