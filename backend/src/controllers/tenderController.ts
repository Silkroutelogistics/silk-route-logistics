import { Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { createTenderSchema, counterTenderSchema } from "../validators/tender";
import { nextShipmentNumber } from "./shipmentController";
import { complianceCheck } from "../services/complianceMonitorService";
import { hooks } from "../lib/hooks";

export async function createTender(req: AuthRequest, res: Response) {
  const { carrierId, offeredRate, expiresAt } = createTenderSchema.parse(req.body);
  const load = await prisma.load.findUnique({ where: { id: req.params.id } });
  if (!load) { res.status(404).json({ error: "Load not found" }); return; }

  // Only allow tendering on POSTED or TENDERED loads
  if (!["POSTED", "TENDERED"].includes(load.status)) {
    res.status(400).json({ error: `Cannot tender a load with status ${load.status}` });
    return;
  }

  const carrier = await prisma.carrierProfile.findUnique({ where: { id: carrierId } });
  if (!carrier) { res.status(404).json({ error: "Carrier not found" }); return; }

  // Compliance gate: block non-compliant carriers
  const compliance = await complianceCheck(carrierId);
  if (!compliance.allowed) {
    res.status(403).json({ error: "Carrier is non-compliant", blocked_reasons: compliance.blocked_reasons });
    return;
  }

  const tender = await prisma.loadTender.create({
    data: { loadId: load.id, carrierId, offeredRate, expiresAt },
  });

  // Auto-advance load to TENDERED on first tender (if currently POSTED)
  if (load.status === "POSTED") {
    await prisma.load.update({
      where: { id: load.id },
      data: { status: "TENDERED", tenderedAt: new Date(), tenderedById: req.user!.id },
    });
    await hooks.run("PostLoadStateChange", { loadId: load.id, from: "POSTED", to: "TENDERED", actor: req.user!.id });
  }

  await prisma.notification.create({
    data: {
      userId: carrier.userId,
      type: "TENDER",
      title: "New Load Tender",
      message: `You have a new load tender: ${load.originCity}, ${load.originState} → ${load.destCity}, ${load.destState} at $${offeredRate}`,
      actionUrl: `/dashboard/loads`,
    },
  });

  res.status(201).json({ ...tender, complianceWarnings: compliance.warnings.length > 0 ? compliance.warnings : undefined });
}

export async function acceptTender(req: AuthRequest, res: Response) {
  const tender = await prisma.loadTender.findUnique({ where: { id: req.params.id }, include: { carrier: true } });
  if (!tender) { res.status(404).json({ error: "Tender not found" }); return; }
  if (tender.carrier.userId !== req.user!.id) { res.status(403).json({ error: "Not authorized" }); return; }

  // Block action on expired tenders
  if (tender.expiresAt && new Date() > tender.expiresAt) {
    await prisma.loadTender.update({ where: { id: tender.id }, data: { status: "EXPIRED" } });
    res.status(400).json({ error: "This tender has expired" });
    return;
  }

  // Compliance gate: re-check at acceptance time (carrier may have become non-compliant)
  const compliance = await complianceCheck(tender.carrierId);
  if (!compliance.allowed) {
    res.status(403).json({ error: "Carrier is no longer compliant", blocked_reasons: compliance.blocked_reasons });
    return;
  }

  // Fetch full load details for shipment creation
  const load = await prisma.load.findUnique({ where: { id: tender.loadId } });
  if (!load) { res.status(404).json({ error: "Load not found" }); return; }

  const [updated] = await Promise.all([
    prisma.loadTender.update({
      where: { id: tender.id },
      data: { status: "ACCEPTED", respondedAt: new Date() },
    }),
    prisma.load.update({
      where: { id: tender.loadId },
      data: { status: "BOOKED", carrierId: tender.carrier.userId },
    }),
    // Decline other tenders for same load
    prisma.loadTender.updateMany({
      where: { loadId: tender.loadId, id: { not: tender.id }, status: "OFFERED" },
      data: { status: "DECLINED" },
    }),
  ]);

  await hooks.run("PostLoadStateChange", { loadId: load.id, from: load.status, to: "BOOKED", actor: req.user!.id });
  await hooks.run("PostTenderAccept", { tenderId: tender.id, loadId: load.id, carrierId: tender.carrierId, rate: tender.offeredRate, actor: req.user!.id });

  // Auto-create Shipment linked to this load
  const shipmentNumber = await nextShipmentNumber();
  await prisma.shipment.create({
    data: {
      shipmentNumber,
      loadId: load.id,
      status: "BOOKED",
      originCity: load.originCity,
      originState: load.originState,
      originZip: load.originZip,
      destCity: load.destCity,
      destState: load.destState,
      destZip: load.destZip,
      equipmentType: load.equipmentType,
      commodity: load.commodity,
      weight: load.weight,
      pieces: load.pieces,
      rate: tender.offeredRate,
      distance: load.distance,
      specialInstructions: load.specialInstructions,
      customerId: load.customerId,
      pickupDate: load.pickupDate,
      deliveryDate: load.deliveryDate,
    },
  });

  // Notify the broker/poster that tender was accepted
  if (load.posterId) {
    await prisma.notification.create({
      data: {
        userId: load.posterId,
        type: "LOAD_UPDATE",
        title: "Tender Accepted",
        message: `Carrier accepted tender for load ${load.referenceNumber}. Shipment created for tracking.`,
        actionUrl: "/dashboard/tracking",
      },
    });
  }

  res.json(updated);
}

export async function counterTender(req: AuthRequest, res: Response) {
  const { counterRate } = counterTenderSchema.parse(req.body);
  const tender = await prisma.loadTender.findUnique({ where: { id: req.params.id }, include: { carrier: true, load: true } });
  if (!tender) { res.status(404).json({ error: "Tender not found" }); return; }
  if (tender.carrier.userId !== req.user!.id) { res.status(403).json({ error: "Not authorized" }); return; }

  // Block action on expired tenders
  if (tender.expiresAt && new Date() > tender.expiresAt) {
    await prisma.loadTender.update({ where: { id: tender.id }, data: { status: "EXPIRED" } });
    res.status(400).json({ error: "This tender has expired" });
    return;
  }

  const updated = await prisma.loadTender.update({
    where: { id: tender.id },
    data: { status: "COUNTERED", counterRate, respondedAt: new Date() },
  });

  // Notify the broker/poster about the counter-offer
  if (tender.load.posterId) {
    const carrierName = tender.carrier.companyName || `Carrier #${tender.carrierId.slice(-6)}`;
    await prisma.notification.create({
      data: {
        userId: tender.load.posterId,
        type: "TENDER",
        title: "Counter-Offer Received",
        message: `${carrierName} countered load ${tender.load.referenceNumber} at $${counterRate} (offered: $${tender.offeredRate}).`,
        actionUrl: "/dashboard/loads",
      },
    });
  }

  res.json(updated);
}

export async function declineTender(req: AuthRequest, res: Response) {
  const tender = await prisma.loadTender.findUnique({ where: { id: req.params.id }, include: { carrier: true, load: true } });
  if (!tender) { res.status(404).json({ error: "Tender not found" }); return; }
  if (tender.carrier.userId !== req.user!.id) { res.status(403).json({ error: "Not authorized" }); return; }

  // Already expired — just mark it
  if (tender.expiresAt && new Date() > tender.expiresAt) {
    await prisma.loadTender.update({ where: { id: tender.id }, data: { status: "EXPIRED" } });
  }

  const updated = await prisma.loadTender.update({
    where: { id: tender.id },
    data: { status: "DECLINED", respondedAt: new Date() },
  });

  // Check if all tenders for this load are now declined
  const remainingActive = await prisma.loadTender.count({
    where: { loadId: tender.loadId, status: { in: ["OFFERED", "COUNTERED"] } },
  });

  if (remainingActive === 0 && tender.load.posterId) {
    await prisma.notification.create({
      data: {
        userId: tender.load.posterId,
        type: "LOAD_UPDATE",
        title: "All Tenders Declined",
        message: `All carriers have declined load ${tender.load.referenceNumber}. Consider reposting or adjusting the rate.`,
        actionUrl: "/dashboard/loads",
      },
    });
  }

  res.json(updated);
}

export async function getCarrierTenders(req: AuthRequest, res: Response) {
  const profile = await prisma.carrierProfile.findUnique({ where: { userId: req.user!.id } });
  if (!profile) { res.status(404).json({ error: "Carrier profile not found" }); return; }

  const tenders = await prisma.loadTender.findMany({
    where: { carrierId: profile.id },
    include: {
      load: {
        include: { poster: { select: { id: true, company: true, firstName: true, lastName: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json(tenders);
}

/** Broker/admin: view all tenders for a specific load */
export async function getLoadTenders(req: AuthRequest, res: Response) {
  const load = await prisma.load.findUnique({ where: { id: req.params.id, deletedAt: null } });
  if (!load) { res.status(404).json({ error: "Load not found" }); return; }

  const tenders = await prisma.loadTender.findMany({
    where: { loadId: load.id, deletedAt: null },
    include: {
      carrier: {
        include: {
          user: { select: { id: true, company: true, firstName: true, lastName: true, email: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json(tenders);
}

/** Cron job: expire stale tenders and revert load to POSTED if all expired */
export async function processExpiredTenders() {
  const now = new Date();

  // Find all OFFERED tenders past their expiration
  const expired = await prisma.loadTender.findMany({
    where: {
      status: { in: ["OFFERED", "COUNTERED"] },
      expiresAt: { lt: now },
      deletedAt: null,
    },
    select: { id: true, loadId: true, carrierId: true },
  });

  if (expired.length === 0) return { expired: 0, loadsReverted: 0 };

  // Batch-expire them
  await prisma.loadTender.updateMany({
    where: { id: { in: expired.map((t) => t.id) } },
    data: { status: "EXPIRED", respondedAt: now },
  });

  // For each affected load, check if any active tenders remain
  const affectedLoadIds = [...new Set(expired.map((t) => t.loadId))];
  let loadsReverted = 0;

  for (const loadId of affectedLoadIds) {
    const remaining = await prisma.loadTender.count({
      where: { loadId, status: { in: ["OFFERED", "COUNTERED"] }, deletedAt: null },
    });
    if (remaining === 0) {
      // Revert load to POSTED so it's back on the board
      const load = await prisma.load.findUnique({ where: { id: loadId } });
      if (load && load.status === "TENDERED") {
        await prisma.load.update({ where: { id: loadId }, data: { status: "POSTED" } });
        await hooks.run("PostLoadStateChange", { loadId, from: "TENDERED", to: "POSTED", actor: "system" });
        loadsReverted++;

        // Notify poster
        if (load.posterId) {
          await prisma.notification.create({
            data: {
              userId: load.posterId,
              type: "LOAD_UPDATE",
              title: "All Tenders Expired",
              message: `All tenders for load ${load.referenceNumber} have expired. Load returned to POSTED.`,
              actionUrl: "/dashboard/loads",
            },
          });
        }
      }
    }
  }

  console.log(`[TenderExpiry] ${expired.length} tenders expired, ${loadsReverted} loads reverted to POSTED`);
  return { expired: expired.length, loadsReverted };
}
