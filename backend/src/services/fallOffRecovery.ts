import { prisma } from "../config/database";
import { matchCarriersForLoad } from "./smartMatchService";
import { log } from "../lib/logger";
import { assignCarrier } from "./carrierAssignmentService";
import { releaseCarrier } from "./carrierReleaseService";
import { reviewableFallOffCount, needsDeactivationReview, DEACTIVATION_REVIEW_THRESHOLD } from "../lib/fallOffScoring";

/**
 * C.4 — Carrier Fall-Off Recovery
 * Triggered when a carrier cancels or is removed from a load within the pickup window.
 */
export async function executeFallOffRecovery(loadId: string, reason?: string) {
  const load = await prisma.load.findUnique({
    where: { id: loadId },
    include: {
      carrier: { select: { id: true, firstName: true, lastName: true, company: true, carrierProfile: true } },
      poster: { select: { id: true, email: true, firstName: true } },
    },
  });
  if (!load) throw new Error("Load not found");

  const originalCarrierId = load.carrierId;
  const startTime = Date.now();

  // B3c — ONE fall-off record, not two. This function used to create its own
  // FallOffEvent here and then call releaseCarrier below, which records one
  // as well — so every fall-off through this path was counted twice, and the
  // "2+ fall-offs" review flag fired on a carrier's FIRST. The release now
  // happens first and its event is the one this function goes on to update.
  //
  // v3.8.axi — through releaseCarrier rather than clearCarrier directly. This
  // path used to clear the carrier and re-post the load while leaving the
  // tender reading ACCEPTED forever: a load back on the board with a tender
  // still claiming a carrier had taken it. releaseCarrier settles the tender to
  // RELEASED, voids live paper, and records the fall-off, all in one place.
  //
  // carrier_fell_off is the right code here by definition — this whole service
  // exists because a carrier backed out.
  const release = await releaseCarrier({ loadId, reason: "carrier_fell_off", note: reason ?? null });
  const eventId = release.fallOffEventId;

  // 1. ALERT AE — urgent red notification
  await prisma.notification.create({
    data: {
      userId: load.posterId,
      type: "LOAD_UPDATE",
      title: `CARRIER FALL-OFF: Load #${load.referenceNumber}`,
      message: `Carrier ${load.carrier?.company || load.carrier?.firstName || "Unknown"} has fallen off. Recovery in progress.`,
      actionUrl: `/dashboard/loads`,
    },
  });

  // Email alert to AE
  try {
    const { sendFallOffAlertEmail } = await import("./emailService");
    await sendFallOffAlertEmail(
      load.poster.email,
      load.poster.firstName,
      load.referenceNumber,
      load.carrier?.company || `${load.carrier?.firstName} ${load.carrier?.lastName}`,
      `${load.originCity}, ${load.originState}`,
      `${load.destCity}, ${load.destState}`,
    );
  } catch { /* non-blocking */ }

  // 2. AUTO-MATCH TOP 3 BACKUP CARRIERS
  let backupsSent = 0;
  try {
    const matchResult = await matchCarriersForLoad(loadId);
    const top3 = matchResult.matches.slice(0, 3);

    for (const match of top3) {
      // Send urgent text to each carrier
      const msg = `SRL urgent load: ${load.originCity}, ${load.originState} to ${load.destCity}, ${load.destState}, $${load.carrierRate ?? 0}, pickup ${new Date(load.pickupDate).toLocaleDateString()}. Reply YES to accept.`;
      log.info(`[FallOff][SMS] To ${match.phone}: ${msg}`);

      // Create notification for the carrier
      await prisma.notification.create({
        data: {
          userId: match.userId,
          type: "LOAD_TENDERED",
          title: `Urgent Load Available: #${load.referenceNumber}`,
          message: `${load.originCity}, ${load.originState} → ${load.destCity}, ${load.destState}. Rate: $${load.carrierRate ?? 0}. Reply to accept.`,
          actionUrl: `/carrier/dashboard/my-loads`,
        },
      });

      backupsSent++;
    }
  } catch (err) {
    log.error({ err: err }, "[FallOff] Smart matching failed:");
  }

  // 3. DAT placeholder (for Phase D)
  log.info(`[FallOff] DAT auto-post placeholder for load ${load.referenceNumber}`);

  // 4. LOG: carrier scoring penalty
  if (originalCarrierId) {
    try {
      const carrierProfile = await prisma.carrierProfile.findFirst({
        where: { userId: originalCarrierId },
      });
      if (carrierProfile) {
        // B3c (#9) — count the fall-offs that are the carrier's. A
        // customer_cancel release is recorded but does not count here
        // (decision 2, 2026-09-18); lib/fallOffScoring holds the rule.
        const fallOffs = await prisma.fallOffEvent.findMany({
          where: { originalCarrierId },
          select: { reason: true },
        });
        const fallOffCount = reviewableFallOffCount(fallOffs);

        // Add note about fall-off
        const existingNotes = carrierProfile.notes || "";
        const newNotes = `${existingNotes}\n[${new Date().toISOString()}] Fall-off #${fallOffCount}: Load ${load.referenceNumber}. Reason: ${reason || "unspecified"}`.trim();

        await prisma.carrierProfile.update({
          where: { id: carrierProfile.id },
          data: { notes: newNotes },
        });

        // DEACTIVATION_REVIEW_THRESHOLD reviewable fall-offs = flag for deactivation
        if (needsDeactivationReview(fallOffCount)) {
          await prisma.notification.create({
            data: {
              userId: load.posterId,
              type: "GENERAL",
              title: `Carrier Deactivation Review: ${carrierProfile.companyName || "Unknown"}`,
              message: `This carrier has ${fallOffCount} fall-off${fallOffCount === 1 ? "" : "s"} of their own (threshold ${DEACTIVATION_REVIEW_THRESHOLD}). Consider deactivation review.`,
              actionUrl: `/dashboard/carriers`,
            },
          });
          log.info(`[FallOff] Carrier ${carrierProfile.companyName} flagged for deactivation review (${fallOffCount} fall-offs)`);
        }
      }
    } catch (err) {
      log.error({ err: err }, "[FallOff] Carrier penalty logging failed:");
    }
  }

  // Update the release's event with tracking info (none exists when the load
  // had no carrier — the release was a no-op and there is nothing to track).
  if (eventId) {
    await prisma.fallOffEvent.update({
      where: { id: eventId },
      data: { backupsSent },
    });
  }

  log.info(`[FallOff] Recovery initiated for load ${load.referenceNumber}: ${backupsSent} backups contacted`);

  return {
    eventId,
    loadId,
    originalCarrierId,
    backupsSent,
    status: "ACTIVE",
  };
}

/**
 * Handle "YES" response from a backup carrier (via OpenPhone webhook)
 */
export async function handleFallOffAcceptance(loadId: string, carrierUserId: string) {
  const event = await prisma.fallOffEvent.findFirst({
    where: { loadId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
  if (!event) return null;

  // Assign the carrier.
  //
  // v3.8.axa — through assignCarrier. The parameter was already named
  // carrierUserId here, which is the correct ID space: Load.carrierId is a
  // User.id, not a CarrierProfile.id.
  await assignCarrier({
    loadId,
    // recovery re-assign
    actor: "AUTO",
    carrierUserId,
    status: "BOOKED",
    extra: {
      statusUpdatedAt: new Date(),
    },
  });

  const recoveryTimeMin = (Date.now() - new Date(event.createdAt).getTime()) / (1000 * 60);

  // Update the event
  await prisma.fallOffEvent.update({
    where: { id: event.id },
    data: {
      status: "RECOVERED",
      newCarrierId: carrierUserId,
      recoveryMethod: "CARAVAN_MATCH",
      recoveryTimeMin,
      backupsAccepted: 1,
      resolvedAt: new Date(),
    },
  });

  // Notify AE
  const load = await prisma.load.findUnique({
    where: { id: loadId },
    select: { posterId: true, referenceNumber: true, carrier: { select: { company: true, firstName: true, lastName: true } } },
  });
  if (load) {
    await prisma.notification.create({
      data: {
        userId: load.posterId,
        type: "LOAD_UPDATE",
        title: `Fall-Off Recovered: Load #${load.referenceNumber}`,
        message: `${load.carrier?.company || load.carrier?.firstName || "New carrier"} accepted. Recovery time: ${recoveryTimeMin.toFixed(0)} min.`,
        actionUrl: `/dashboard/loads`,
      },
    });
  }

  log.info(`[FallOff] Recovered load ${loadId} in ${recoveryTimeMin.toFixed(0)} min`);
  return { eventId: event.id, recoveryTimeMin };
}
