import { prisma } from "../config/database";
import { matchCarriersForLoad } from "./smartMatchService";

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

  // Create fall-off event
  const event = await prisma.fallOffEvent.create({
    data: {
      loadId,
      originalCarrierId,
      reason: reason || "Carrier cancelled/removed",
      status: "ACTIVE",
    },
  });

  // 1. ALERT AE — urgent red notification
  await prisma.notification.create({
    data: {
      userId: load.posterId,
      type: "LOAD_UPDATE",
      title: `CARRIER FALL-OFF: Load #${load.referenceNumber}`,
      message: `Carrier ${load.carrier?.company || load.carrier?.firstName || "Unknown"} has fallen off. Recovery in progress.`,
      actionUrl: `/ae/loads.html`,
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

  // Unassign the carrier from the load
  await prisma.load.update({
    where: { id: loadId },
    data: {
      carrierId: null,
      status: "POSTED",
      driverName: null,
      driverPhone: null,
      truckNumber: null,
      trailerNumber: null,
      statusUpdatedAt: new Date(),
    },
  });

  // 2. AUTO-MATCH TOP 3 BACKUP CARRIERS
  let backupsSent = 0;
  try {
    const matchResult = await matchCarriersForLoad(loadId);
    const top3 = matchResult.matches.slice(0, 3);

    for (const match of top3) {
      // Send urgent text to each carrier
      const msg = `SRL urgent load: ${load.originCity}, ${load.originState} to ${load.destCity}, ${load.destState}, $${load.carrierRate || load.rate}, pickup ${new Date(load.pickupDate).toLocaleDateString()}. Reply YES to accept.`;
      console.log(`[FallOff][SMS] To ${match.phone}: ${msg}`);

      // Create notification for the carrier
      await prisma.notification.create({
        data: {
          userId: match.userId,
          type: "LOAD_TENDERED",
          title: `Urgent Load Available: #${load.referenceNumber}`,
          message: `${load.originCity}, ${load.originState} → ${load.destCity}, ${load.destState}. Rate: $${load.carrierRate || load.rate}. Reply to accept.`,
          actionUrl: `/carrier/loads.html`,
        },
      });

      backupsSent++;
    }
  } catch (err) {
    console.error("[FallOff] Smart matching failed:", err);
  }

  // 3. DAT placeholder (for Phase D)
  console.log(`[FallOff] DAT auto-post placeholder for load ${load.referenceNumber}`);

  // 4. LOG: carrier scoring penalty
  if (originalCarrierId) {
    try {
      const carrierProfile = await prisma.carrierProfile.findFirst({
        where: { userId: originalCarrierId },
      });
      if (carrierProfile) {
        // Count total fall-offs
        const fallOffCount = await prisma.fallOffEvent.count({
          where: { originalCarrierId },
        });

        // Add note about fall-off
        const existingNotes = carrierProfile.notes || "";
        const newNotes = `${existingNotes}\n[${new Date().toISOString()}] Fall-off #${fallOffCount}: Load ${load.referenceNumber}. Reason: ${reason || "unspecified"}`.trim();

        await prisma.carrierProfile.update({
          where: { id: carrierProfile.id },
          data: { notes: newNotes },
        });

        // 2+ fall-offs = flag for deactivation
        if (fallOffCount >= 2) {
          await prisma.notification.create({
            data: {
              userId: load.posterId,
              type: "GENERAL",
              title: `Carrier Deactivation Review: ${carrierProfile.companyName || "Unknown"}`,
              message: `This carrier has ${fallOffCount} fall-offs. Consider deactivation review.`,
              actionUrl: `/ae/caravan.html`,
            },
          });
          console.log(`[FallOff] Carrier ${carrierProfile.companyName} flagged for deactivation review (${fallOffCount} fall-offs)`);
        }
      }
    } catch (err) {
      console.error("[FallOff] Carrier penalty logging failed:", err);
    }
  }

  // Update event with tracking info
  await prisma.fallOffEvent.update({
    where: { id: event.id },
    data: { backupsSent },
  });

  console.log(`[FallOff] Recovery initiated for load ${load.referenceNumber}: ${backupsSent} backups contacted`);

  return {
    eventId: event.id,
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

  // Assign the carrier
  await prisma.load.update({
    where: { id: loadId },
    data: {
      carrierId: carrierUserId,
      status: "BOOKED",
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
        actionUrl: `/ae/loads.html`,
      },
    });
  }

  console.log(`[FallOff] Recovered load ${loadId} in ${recoveryTimeMin.toFixed(0)} min`);
  return { eventId: event.id, recoveryTimeMin };
}
