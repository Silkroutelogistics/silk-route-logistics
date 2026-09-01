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
import { agreedRateFromValue } from "../lib/agreedCarrierRate";
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
import { validateLoadStatusTransition } from "../lib/loadStateMachine";
import { broadcastSSE } from "../routes/trackTraceSSE";
import { assignCarrier } from "./carrierAssignmentService";
import { createTender } from "./tenderCreationService";
import { settleTenders, withdrawLiveTenders } from "./tenderTransitionService";

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
  // v3.8.arf — resume the fast (30s) scheduler tick immediately. The ticker
  // backs off to 10 minutes when idle so Neon compute can suspend; without this
  // hook a brand-new waterfall could wait up to that long before cascading.
  // Dynamic import avoids a circular dependency (schedulerService imports this
  // module for waterfallTick). Non-fatal: a missed hook only costs latency.
  import("./schedulerService")
    .then((m) => m.notifyWaterfallActivity?.())
    .catch(() => { /* scheduler not loaded (e.g. tests) — safe to ignore */ });

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
  //
  // Status is deliberately NOT set here. It used to flip to TENDERED on this
  // line — before tenderPosition ran, i.e. before we knew whether any tender
  // would actually be sent. A fallback-only cascade (no carrier positions,
  // which is every cascade today while scoring requires cppTier SILVER+) took
  // the isFallback branch, created ZERO LoadTender rows, and left the load
  // reading TENDERED with nothing tendered to anyone. Nothing could then move
  // it: the loadboard, outreach and re-cascade are all POSTED-gated, and the
  // only TENDERED -> POSTED writer derives its set from EXPIRED tenders, of
  // which there were none. The status now follows the tender in tenderPosition.
  await prisma.load.update({
    where: { id: wf.loadId },
    data: { visibility: "waterfall" },
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

  // The load moves to TENDERED here, in the same transaction as the tender
  // itself — never before it. That ordering is the whole fix: a load reads
  // TENDERED if and only if a LoadTender row exists to back it.
  //
  // Routed through the state-machine validator, which this file previously
  // called nowhere. tenderedAt is stamped; tenderedById is deliberately left
  // null because no human tendered this — inventing an actor (the poster, say)
  // would misattribute an automated action. tenderedAt set with tenderedById
  // null is therefore the honest signature of a waterfall tender.
  const loadNow = await prisma.load.findUnique({
    where: { id: pos.waterfall.loadId },
    select: { status: true },
  });
  const needsFlip =
    !!loadNow &&
    loadNow.status !== "TENDERED" &&
    validateLoadStatusTransition(loadNow.status, "TENDERED", "AE").allowed;

  // v3.8.axe — through createTender, the single writer of LoadTender.
  //
  // Converted from the ARRAY $transaction form to the INTERACTIVE one.
  // createTender is async because it must write the transition row, and an
  // async call cannot be an element of $transaction([...]) — awaiting it to
  // build the array would run the insert OUTSIDE the transaction and lose the
  // atomicity with the status flip below. Interactive keeps both in one unit.
  const tender = await prisma.$transaction(async (tx) => {
    const t = await createTender({
      loadId: pos.waterfall.loadId,
      carrierProfileId: profile.id,
      offeredRate: Number(pos.offeredRate ?? 0),
      expiresAt,
      waterfallPositionId: pos.id,
      reason: "waterfall_cascade",
    }, tx);
    if (needsFlip) {
      await tx.load.update({
        where: { id: pos.waterfall.loadId },
        data: { status: "TENDERED", tenderedAt: now },
      });
    }
    return t;
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

  // In-app notification
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

  // Carrier email notification (v3.4.u). Non-blocking — a failed email
  // must never roll back a successful tender write.
  try {
    await sendWaterfallTenderEmail(pos.waterfall.loadId, pos.carrierId, expiresAt);
  } catch (err) {
    log.error({ err, loadId: pos.waterfall.loadId, carrierUserId: pos.carrierId }, "[Waterfall] tender email failed");
  }
}

/**
 * Send the tender email to a carrier. Pulls load + carrier context and
 * composes an HTML body with load details, offered rate, lane, expiry,
 * and a deep link into the carrier portal tender page.
 */
async function sendWaterfallTenderEmail(loadId: string, carrierUserId: string, expiresAt: Date) {
  const [load, carrierUser, emailMod] = await Promise.all([
    prisma.load.findUnique({
      where: { id: loadId },
      select: {
        id: true,
        loadNumber: true,
        referenceNumber: true,
        originCity: true,
        originState: true,
        destCity: true,
        destState: true,
        equipmentType: true,
        distance: true,
        weight: true,
        commodity: true,
        pickupDate: true,
        deliveryDate: true,
        carrierRate: true,
        rate: true,
        customer: { select: { name: true } },
      },
    }),
    prisma.user.findUnique({
      where: { id: carrierUserId },
      select: {
        email: true,
        firstName: true,
        lastName: true,
        carrierProfile: { select: { contactEmail: true, companyName: true } },
      },
    }),
    import("./emailService"),
  ]);
  if (!load || !carrierUser) return;

  const to = carrierUser.carrierProfile?.contactEmail || carrierUser.email;
  if (!to) return;

  const { sendEmail, wrap } = emailMod;
  const rate = load.carrierRate ?? 0;
  const lane = `${load.originCity}, ${load.originState} → ${load.destCity}, ${load.destState}`;
  const portalUrl = "https://silkroutelogistics.ai/carrier/dashboard/tenders";
  const minutesRemaining = Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 60000));

  const carrierName = carrierUser.carrierProfile?.companyName
    || `${carrierUser.firstName ?? ""} ${carrierUser.lastName ?? ""}`.trim()
    || "Carrier";

  const html = wrap(`
    <h2 style="color:#0f172a;margin-top:0">New Tender — Load ${load.loadNumber ?? load.referenceNumber}</h2>
    <p>${carrierName},</p>
    <p>You have a new tender from <strong>Silk Route Logistics</strong>. Please accept or decline within the window below.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b;width:160px">Load #</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${load.loadNumber ?? load.referenceNumber}</td></tr>
      <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Lane</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${lane}${load.distance ? ` · ${Math.round(load.distance).toLocaleString()} mi` : ""}</td></tr>
      <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Equipment</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${load.equipmentType}</td></tr>
      ${load.weight ? `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Weight</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${load.weight} lbs</td></tr>` : ""}
      ${load.commodity ? `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Commodity</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${load.commodity}</td></tr>` : ""}
      <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Pickup</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${new Date(load.pickupDate).toLocaleDateString()}</td></tr>
      <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Delivery</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${new Date(load.deliveryDate).toLocaleDateString()}</td></tr>
      <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">Offered rate</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0"><strong style="color:#BA7517">$${Number(rate).toLocaleString()}</strong></td></tr>
    </table>
    <p style="background:#FAEEDA;color:#854F0B;padding:10px 14px;border-radius:6px;margin:16px 0">
      ⏱ <strong>${minutesRemaining} minutes to respond</strong> — tender expires ${new Date(expiresAt).toLocaleString()}.
      If you do not respond, the load automatically cascades to the next carrier.
    </p>
    <p style="text-align:center;margin:24px 0">
      <a href="${portalUrl}" style="display:inline-block;padding:14px 32px;background:#BA7517;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Open Carrier Portal</a>
    </p>
    <p style="color:#475569;font-size:13px">Or paste this into your browser: <a href="${portalUrl}">${portalUrl}</a></p>
    <p style="color:#94a3b8;font-size:12px;margin-top:20px">
      You are receiving this email because this load was offered to you through the SRL Waterfall dispatch system.
      Please respond through the Carrier Portal; declining via email is not tracked.
    </p>
  `);

  await sendEmail(to, `New Tender — Load ${load.loadNumber ?? load.referenceNumber} · ${lane} · $${Number(rate).toLocaleString()}`, html);
  log.info(`[Waterfall] Tender email sent to ${to} for load ${load.referenceNumber}`);
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
export async function declinePosition(
  positionId: string,
  reason: string | null,
  actorId?: string | null,
  opts?: { onBehalf?: boolean },
) {
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
  await settleTenders({
    waterfallPositionId: positionId,
    to: "DECLINED",
    respondedAt: new Date(),
    onBehalf: opts?.onBehalf,
    actor: { id: actorId ?? null, type: opts?.onBehalf ? "USER" : "CARRIER" },
    metadata: { reason },
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

  // Sprint 39 (Item 56) — compliance re-check at accept time.
  // Carrier may have become non-compliant between waterfall offer time
  // and accept time (insurance lapses, FMCSA OUT_OF_SERVICE, agreement
  // expires). Direct path (tenderController.acceptTender:71) re-checks;
  // bulk paths (waterfall + loadbid) used to skip. Skip+advance pattern
  // mirrors declinePosition: log event, mark position skipped, move
  // to next position. Carrier opted in but newly ineligible — next
  // match runs.
  const { complianceCheck } = await import("./complianceMonitorService");

  // ARC 16 — was `complianceCheck(pos.carrierId)`, and that is a USER id.
  //
  // `WaterfallPosition.carrierId` deliberately holds `User.id` (buildWaterfall:
  // "store User.id since Load.carrierId references User"), but `complianceCheck`
  // looks up `CarrierProfile` by primary key. A User id finds no profile, so it
  // returned `{ allowed: false, blocked_reasons: ["Carrier not found"] }` — and
  // the branch below then marked the position `skipped` and advanced. Every
  // position in turn. **Waterfall auto-dispatch could never accept a carrier**,
  // and it failed in the shape of a carrier problem, so the log read like
  // ordinary compliance churn rather than a broken path.
  //
  // Live since Sprint 39 (61589fa7), the commit that ADDED this check — the
  // loadbid path in that same commit resolves the profile first
  // (routes/loadBids.ts: `complianceCheck(carrierProfile.id)`), so the two bulk
  // paths were written to different conventions on the same day. Same id-
  // semantics class as §13.3 Item 57. Found by driving the real path against a
  // real database in the Arc 16 money-path proof; no unit test could see it,
  // because with Prisma mocked the lookup returns whatever the mock is told to.
  //
  // The file already does this resolution for the tender-send path a few
  // hundred lines up (`findFirst({ where: { userId: pos.carrierId } })`); this
  // is the same lookup, and it fails closed if there is no profile.
  const acceptingProfile = await prisma.carrierProfile.findFirst({
    where: { userId: pos.carrierId },
    select: { id: true },
  });
  // Arc 26 — annotated with the gate's own return type ON PURPOSE. This
  // fallback is a hand-written verdict, and an unannotated ternary just widens
  // to a union of the real shape and this literal: it compiled happily while
  // missing blocked_codes, and would have gone on compiling as the shape grew.
  // Annotated, a new required field on complianceCheck fails HERE, at build
  // time, instead of surfacing as a missing field on a live verdict.
  const compliance: Awaited<ReturnType<typeof complianceCheck>> = acceptingProfile
    ? await complianceCheck(acceptingProfile.id)
    : { allowed: false, blocked_reasons: ["Carrier profile not found"], blocked_codes: [], released: [], warnings: [] };
  if (!compliance.allowed) {
    await prisma.waterfallPosition.update({
      where: { id: positionId },
      data: { status: "skipped", respondedAt: new Date() },
    });
    // v3.8.awz — WITHDRAWN, not DECLINED, and this was the worst of the three
    // SRL-side writers. The carrier reached this line by TRYING TO ACCEPT; the
    // compliance re-check above blocked them. Recording that as a decline says
    // the carrier refused the load when they had actively taken it — and then
    // charges them for it, since §9 scores acceptance rate at 10% of Compass.
    //
    // respondedAt is left unset: the carrier's response was an acceptance, and
    // stamping a response time on a row now labelled a withdrawal would be
    // recording SRL's block as the carrier's answer.
    await withdrawLiveTenders({
      waterfallPositionId: positionId,
      reason: "compliance_block",
    });
    // Reuse existing "position_skipped" event type (defined in
    // waterfallEventService union); description prefix carries the
    // compliance reason for searchability + metadata holds the
    // structured blocked_reasons.
    await logWaterfallEvent({
      loadId: pos.waterfall.loadId,
      event: "position_skipped",
      description: `Position #${pos.position} skipped at accept — compliance: ${compliance.blocked_reasons.join(", ")}`,
      actorType: "SYSTEM",
      metadata: { positionId, waterfallId: pos.waterfall.id, reason: "compliance", blocked_reasons: compliance.blocked_reasons },
    });
    await advanceWaterfall(pos.waterfall.id, pos.position + 1);
    return;
  }

  const now = new Date();

  // v3.8.akw §13.3 Item 51 — capture the tender id BEFORE the updateMany
  // flip so the post-write notifyTenderAction call (further down) can
  // fan out the in-app + email notification. updateMany doesn't return
  // updated rows, so this separate findFirst is required.
  const acceptedTender = await prisma.loadTender.findFirst({
    where: { waterfallPositionId: positionId, status: "OFFERED" },
    select: { id: true },
  });

  // Mark position + tender accepted
  await prisma.waterfallPosition.update({
    where: { id: positionId },
    data: { status: "accepted", respondedAt: now },
  });
  await settleTenders({
    waterfallPositionId: positionId,
    to: "ACCEPTED",
    respondedAt: now,
    actor: { id: actorId ?? pos.carrierId, type: "CARRIER" },
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
  // v3.8.axb — through assignCarrier. pos.carrierId is a User.id: buildWaterfall
  // stores User.id deliberately "since Load.carrierId references User". Naming
  // it carrierUserId makes that explicit at the call site — the ID space this
  // very service got wrong once before (§13.3 Item 222.4).
  await assignCarrier({
    loadId: pos.waterfall.loadId,
    carrierUserId: pos.carrierId!,
    status: "DISPATCHED",
    // ARC 16 — the agreed rate for a waterfall position. §13.3 Item 221.1.
    carrierRate: agreedRateFromValue(pos.offeredRate),
    extra: {
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

  // v3.8.akw §13.3 Item 51 — fire tender accept notification (carrier
  // in-app + email). Direct path wires this at tenderController:205,
  // on-behalf path at :375; waterfall was the remaining gap (Sprint 36
  // G2 banked finding). Non-blocking try/catch per Sprint 38 fan-out
  // pattern. acceptedTender may be null in rare race conditions (e.g.
  // tender declined externally between position lookup and updateMany);
  // skip the notification gracefully in that case.
  if (acceptedTender) {
    try {
      const { notifyTenderAction } = await import("./notificationService");
      await notifyTenderAction(acceptedTender.id, "ACCEPTED");
    } catch (err) {
      log.error({ err, tenderId: acceptedTender.id }, "[Waterfall] notifyTenderAction failed (non-blocking)");
    }
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
    await settleTenders({
      waterfallPositionId: pos.id,
      to: "EXPIRED",
      reason: "ttl_elapsed",
      respondedAt: now,
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

  // Visibility and status move TOGETHER. This used to write visibility only,
  // so an exhausted cascade left the load advertised as open-board by its
  // visibility column while its status still said TENDERED — and status is
  // what every consumer actually gates on (carrierLoads, outreach, re-cascade
  // are all `status: "POSTED"`). Returning it to POSTED is the documented AE
  // un-tender step and is in the AE transition map.
  const current = await prisma.load.findUnique({
    where: { id: loadId },
    select: { status: true },
  });
  const returnToBoard =
    !!current &&
    current.status === "TENDERED" &&
    validateLoadStatusTransition(current.status, "POSTED", "AE").allowed;

  await prisma.load.update({
    where: { id: loadId },
    data: {
      visibility: "open",
      fallbackChainStartedAt: now,
      fallbackPostedToLoadboardAt: now,
      ...(returnToBoard ? { status: "POSTED" as const } : {}),
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

    // Same rule one step further down the chain. The selector above still
    // admits TENDERED so pre-fix rows are picked up and healed rather than
    // promoted to DAT while wearing a status that hides them from carriers.
    const now = new Date();
    const cur = await prisma.load.findUnique({ where: { id: l.id }, select: { status: true } });
    const heal =
      !!cur &&
      cur.status === "TENDERED" &&
      validateLoadStatusTransition(cur.status, "POSTED", "AE").allowed;

    await prisma.load.update({
      where: { id: l.id },
      data: {
        visibility: "dat",
        fallbackPostedToDatAt: now,
        ...(heal ? { status: "POSTED" as const } : {}),
      },
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
