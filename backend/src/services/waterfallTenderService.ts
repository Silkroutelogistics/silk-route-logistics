/**
 * Waterfall Tendering Service
 *
 * Sends tenders sequentially to ranked carriers. When a carrier declines
 * or the tender expires, automatically advances to the next carrier in line.
 */

import { prisma } from "../config/database";
import { complianceCheck } from "./complianceMonitorService";

export interface WaterfallCandidate {
  carrierId: string;       // CarrierProfile.id
  carrierUserId: string;   // User.id for the carrier
  companyName: string;
  score: number;
  offeredRate: number;
}

export interface WaterfallConfig {
  loadId: string;
  candidates: WaterfallCandidate[];
  expirationMinutes: number;   // how long each tender stays open
  createdById: string;         // broker/admin who launched it
}

/**
 * Launch a waterfall tender campaign.
 * Creates all candidates in the DB (as QUEUED) and activates the first one.
 */
export async function launchWaterfall(config: WaterfallConfig) {
  const { loadId, candidates, expirationMinutes, createdById } = config;

  if (candidates.length === 0) throw new Error("No candidates provided");

  const load = await prisma.load.findUnique({ where: { id: loadId } });
  if (!load) throw new Error("Load not found");
  if (!["POSTED", "TENDERED"].includes(load.status)) {
    throw new Error(`Cannot waterfall a load with status ${load.status}`);
  }

  // Store the campaign metadata on the load as JSON
  const campaignId = `WF-${Date.now().toString(36).toUpperCase()}`;

  // Create tenders for all candidates — first one OFFERED, rest QUEUED (via deletedAt marker)
  const tenders = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const isFirst = i === 0;

    // Compliance check — skip non-compliant carriers
    const compliance = await complianceCheck(c.carrierId);
    if (!compliance.allowed) continue;

    const expiresAt = isFirst
      ? new Date(Date.now() + expirationMinutes * 60 * 1000)
      : new Date(Date.now() + (i + 1) * expirationMinutes * 60 * 1000); // stagger

    const tender = await prisma.loadTender.create({
      data: {
        loadId,
        carrierId: c.carrierId,
        offeredRate: c.offeredRate,
        status: "OFFERED",
        expiresAt,
      },
    });

    tenders.push({ ...tender, sequence: i + 1, companyName: c.companyName });

    // Notify the carrier (only the first one actively)
    if (isFirst) {
      await prisma.notification.create({
        data: {
          userId: c.carrierUserId,
          type: "TENDER",
          title: "New Load Tender",
          message: `You have a new load tender: ${load.originCity}, ${load.originState} → ${load.destCity}, ${load.destState} at $${c.offeredRate}. Respond within ${expirationMinutes} minutes.`,
          actionUrl: `/dashboard/loads`,
        },
      });
    }
  }

  // Advance load to TENDERED
  if (load.status === "POSTED") {
    await prisma.load.update({
      where: { id: loadId },
      data: { status: "TENDERED", tenderedAt: new Date(), tenderedById: createdById },
    });

    // Structured event: Load POSTED → TENDERED
    await prisma.loadTrackingEvent.create({
      data: {
        loadId,
        eventType: "STATUS_CHANGE",
        statusFrom: "POSTED",
        statusTo: "TENDERED",
        locationSource: "AE_MANUAL",
      },
    });
  }

  // Log the campaign start
  await prisma.systemLog.create({
    data: {
      logType: "API_CALL",
      severity: "INFO",
      source: "waterfallTenderService",
      message: `Waterfall campaign ${campaignId} started for load ${load.referenceNumber} with ${tenders.length} carriers`,
      details: {
        campaignId,
        loadId,
        referenceNumber: load.referenceNumber,
        candidateCount: tenders.length,
        expirationMinutes,
      },
      userId: createdById,
    },
  });

  return {
    campaignId,
    loadId,
    referenceNumber: load.referenceNumber,
    tenders: tenders.map((t) => ({
      id: t.id,
      sequence: t.sequence,
      carrierId: t.carrierId,
      companyName: t.companyName,
      offeredRate: t.offeredRate,
      status: t.status,
      expiresAt: t.expiresAt,
    })),
  };
}

/**
 * Get waterfall status for a load — shows all tenders in sequence order.
 */
export async function getWaterfallStatus(loadId: string) {
  const load = await prisma.load.findUnique({
    where: { id: loadId },
    select: { id: true, referenceNumber: true, status: true },
  });
  if (!load) return null;

  const tenders = await prisma.loadTender.findMany({
    where: { loadId, deletedAt: null },
    include: {
      carrier: {
        include: {
          user: { select: { firstName: true, lastName: true, company: true } },
        },
      },
    },
    orderBy: { expiresAt: "asc" },
  });

  return {
    loadId,
    referenceNumber: load.referenceNumber,
    loadStatus: load.status,
    tenders: tenders.map((t, i) => ({
      id: t.id,
      sequence: i + 1,
      carrierId: t.carrierId,
      companyName: t.carrier.companyName,
      contactName: t.carrier.user
        ? `${t.carrier.user.firstName} ${t.carrier.user.lastName}`
        : null,
      offeredRate: t.offeredRate,
      counterRate: t.counterRate,
      status: t.status,
      expiresAt: t.expiresAt,
      respondedAt: t.respondedAt,
    })),
    activeIndex: tenders.findIndex((t) => t.status === "OFFERED" || t.status === "COUNTERED"),
    accepted: tenders.find((t) => t.status === "ACCEPTED") || null,
    allDeclined: tenders.every((t) => ["DECLINED", "EXPIRED"].includes(t.status)),
  };
}
