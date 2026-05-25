import { Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { createTenderSchema, counterTenderSchema, declineTenderSchema } from "../validators/tender";
import { nextShipmentNumber } from "./shipmentController";
import { complianceCheck } from "../services/complianceMonitorService";
import { notifyTenderAction } from "../services/notificationService";
import { autoGenerateRateConfirmation } from "../services/autoRateConfirmationService";
import { hooks } from "../lib/hooks";
import { log } from "../lib/logger";

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

  // Sprint 45a (v3.8.abb) Item 80 — replaced manual prisma.notification.create
  // with notifyTenderAction("OFFERED") which now does BOTH the in-app
  // Notification record AND the carrier email fan-out (with AE CC) per Q1-Q5
  // ratifications. Action URL was /dashboard/loads (wrong — that's AE-side);
  // notifyTenderAction sets /carrier/dashboard/tenders correctly. Manual call
  // also used type "TENDER" which isn't in NotificationType enum;
  // notifyTenderAction uses canonical "TENDER_RECEIVED".
  await notifyTenderAction(tender.id, "OFFERED");

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

  // Sprint 38 (Item 53) — atomic accept. Was Promise.all (concurrent, NOT
  // atomic). On partial failure (e.g., load update succeeds, tender update
  // throws) state diverged: load BOOKED while tender still OFFERED, or
  // sibling tenders left OFFERED. prisma.$transaction guarantees all-or-
  // nothing. Three operations: tender→ACCEPTED, load→BOOKED+carrierId,
  // sibling tenders→DECLINED.
  const [updated] = await prisma.$transaction([
    prisma.loadTender.update({
      where: { id: tender.id },
      data: { status: "ACCEPTED", respondedAt: new Date() },
    }),
    prisma.load.update({
      where: { id: tender.loadId },
      data: { status: "BOOKED", carrierId: tender.carrier.userId },
    }),
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

  // Sprint Phase 2 (v3.8.acd) — auto-RC generation. Non-blocking:
  // tender accept must succeed even if RC generation fails (AE can
  // still create RC manually via POST /api/rate-confirmations/). Fires
  // BEFORE notifyTenderAction so the AE's in-app notification can
  // deep-link to the auto-draft RC for review.
  let autoRcId: string | undefined;
  try {
    const rc = await autoGenerateRateConfirmation(load.id, tender.id, load.posterId);
    autoRcId = rc?.id;
  } catch (err) {
    log.error({ err, tenderId: tender.id, loadId: load.id }, "[Tender] auto-RC generation failed");
    // v3.8.ajw C8 — Write a queryable SystemLog WARNING so ops can find
    // tenders that need a manual RC follow-up. log.error above goes to
    // stdout/Render logs (transient); SystemLog row survives + is
    // queryable from AE dashboards. Non-blocking (.catch swallow) so the
    // accept flow never breaks on logging-table contention.
    prisma.systemLog.create({
      data: {
        logType: "INTEGRATION",
        severity: "WARNING",
        source: "auto-rc-generation",
        message: `Auto-RC generation failed for tender ${tender.id} on load ${load.id} — manual RC required`,
        details: {
          tenderId: tender.id,
          loadId: load.id,
          loadReferenceNumber: load.referenceNumber,
          err: err instanceof Error ? err.message : String(err),
        },
      },
    }).catch(() => { /* logging-table contention swallowed */ });
  }

  // Sprint 38 (Item 51) — wire notifyTenderAction. Was manually creating
  // a notification with type "LOAD_UPDATE" — wrong type for tender events
  // (poster's notification preferences + UI filtering branch on this).
  // notifyTenderAction emits the correct "TENDER_ACCEPTED" type and
  // formats the lane string consistently with offered/declined/countered.
  // Sprint Phase 2 — rcId option deep-links AE notification to the
  // auto-draft RC review surface when auto-generation succeeded; when
  // C8's SystemLog WARNING fires, autoRcId stays undefined and
  // notifyTenderAction falls back to /dashboard/track-trace (validated
  // shape at notificationService.ts:237).
  await notifyTenderAction(tender.id, "ACCEPTED", { rcId: autoRcId });

  // Sprint 38 (Item 52) — CRM tracking-link fan-out on direct accept.
  // Pattern matches waterfallEngineService.ts:485-490 (added v3.4.p for
  // waterfall path). Direct accept was the only tender accept path that
  // skipped it. Non-blocking: errors are logged, not thrown — the tender
  // is already accepted at this point, fan-out is best-effort.
  try {
    const { sendTrackingLinkToCrmContacts } = await import("../services/shipperLoadNotifyService");
    await sendTrackingLinkToCrmContacts(load.id);
  } catch (err) {
    log.error({ err }, "[Tender] tracking-link fan-out failed");
  }

  res.json(updated);
}

/**
 * Sprint 39 (Item 54) — AE accept-on-behalf endpoint.
 *
 * Mirrors acceptTender but skips the carrier-userId gate (AE is not the
 * carrier) and writes a distinct audit log action so the override is
 * traceable separately from organic carrier accepts.
 *
 * Authorization is enforced at route level (ADMIN/CEO only). Compliance
 * re-check still runs server-side — UI cannot bypass safety.
 *
 * Status flips to BOOKED per Item 55 P3 (direct path stays BOOKED;
 * waterfall + loadbid auto-pilot to DISPATCHED). Tracking-link fan-out
 * fires at BOOKED to match Sprint 38 normal direct-accept behavior
 * (operational decision: shipper gets tracking link as soon as carrier
 * is confirmed, not on later explicit dispatch advance — α resolution).
 */
export async function acceptTenderOnBehalf(req: AuthRequest, res: Response) {
  const reasonRaw = (req.body?.reason ?? "").toString().trim();
  if (reasonRaw.length < 10) {
    res.status(400).json({ error: "Reason required (min 10 chars)" });
    return;
  }

  const tender = await prisma.loadTender.findUnique({ where: { id: req.params.id }, include: { carrier: true } });
  if (!tender) { res.status(404).json({ error: "Tender not found" }); return; }

  if (tender.status !== "OFFERED" && tender.status !== "COUNTERED") {
    res.status(400).json({ error: `Cannot accept tender in status ${tender.status}` });
    return;
  }

  if (tender.expiresAt && new Date() > tender.expiresAt) {
    await prisma.loadTender.update({ where: { id: tender.id }, data: { status: "EXPIRED" } });
    res.status(400).json({ error: "This tender has expired" });
    return;
  }

  const compliance = await complianceCheck(tender.carrierId);
  if (!compliance.allowed) {
    res.status(403).json({ error: "Carrier is no longer compliant", blocked_reasons: compliance.blocked_reasons });
    return;
  }

  const load = await prisma.load.findUnique({ where: { id: tender.loadId } });
  if (!load) { res.status(404).json({ error: "Load not found" }); return; }

  // Atomic txn (Sprint 38 Item 53 pattern). Same three operations as
  // acceptTender — tender→ACCEPTED, load→BOOKED+carrierId, sibling
  // tenders→DECLINED.
  const [updated] = await prisma.$transaction([
    prisma.loadTender.update({
      where: { id: tender.id },
      data: { status: "ACCEPTED", respondedAt: new Date() },
    }),
    prisma.load.update({
      where: { id: tender.loadId },
      data: { status: "BOOKED", carrierId: tender.carrier.userId },
    }),
    prisma.loadTender.updateMany({
      where: { loadId: tender.loadId, id: { not: tender.id }, status: "OFFERED" },
      data: { status: "DECLINED" },
    }),
  ]);

  // Distinct audit-log action so on-behalf overrides are queryable.
  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: "TENDER_ACCEPTED_ON_BEHALF",
      entity: "LoadTender",
      entityId: tender.id,
      changes: JSON.stringify({
        loadId: load.id,
        carrierProfileId: tender.carrierId,
        carrierUserId: tender.carrier.userId,
        offeredRate: tender.offeredRate,
        reason: reasonRaw,
      }),
    },
  });

  await hooks.run("PostLoadStateChange", { loadId: load.id, from: load.status, to: "BOOKED", actor: req.user!.id });
  await hooks.run("PostTenderAccept", { tenderId: tender.id, loadId: load.id, carrierId: tender.carrierId, rate: tender.offeredRate, actor: req.user!.id, onBehalf: true });

  // Auto-create Shipment (mirrors acceptTender).
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

  // Sprint Phase 2 (v3.8.acd) — auto-RC generation on AE accept-on-behalf.
  // Mirrors acceptTender wiring. Non-blocking try/catch.
  let autoRcId: string | undefined;
  try {
    const rc = await autoGenerateRateConfirmation(load.id, tender.id, load.posterId);
    autoRcId = rc?.id;
  } catch (err) {
    log.error({ err, tenderId: tender.id, loadId: load.id }, "[Tender] auto-RC generation failed (on-behalf)");
    // v3.8.ajw C8 — Mirror direct-accept SystemLog WARNING. Same queryable
    // shape so the ops query can pick up both paths from a single
    // source filter.
    prisma.systemLog.create({
      data: {
        logType: "INTEGRATION",
        severity: "WARNING",
        source: "auto-rc-generation",
        message: `Auto-RC generation failed for tender ${tender.id} on load ${load.id} (on-behalf path) — manual RC required`,
        details: {
          tenderId: tender.id,
          loadId: load.id,
          loadReferenceNumber: load.referenceNumber,
          onBehalf: true,
          err: err instanceof Error ? err.message : String(err),
        },
      },
    }).catch(() => { /* swallow */ });
  }

  // Notification (Sprint 38 Item 51 pattern + Sprint Phase 2 rcId deep-link).
  await notifyTenderAction(tender.id, "ACCEPTED", { rcId: autoRcId });

  // Tracking-link fan-out at BOOKED (Sprint 38 Item 52 pattern, α
  // resolution: fire on accept regardless of P3 status semantics —
  // shipper wants tracking link when carrier confirms).
  try {
    const { sendTrackingLinkToCrmContacts } = await import("../services/shipperLoadNotifyService");
    await sendTrackingLinkToCrmContacts(load.id);
  } catch (err) {
    log.error({ err }, "[Tender on-behalf] tracking-link fan-out failed");
  }

  res.json({ ...updated, onBehalf: true });
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

  // v3.8.ajw H3 — Audit row so carrier counter-offers are queryable for
  // dispute resolution + carrier-behavior analytics. Mirrors the
  // acceptTenderOnBehalf shape (action + entity + changes JSON-serialized).
  // Non-blocking (.catch swallow) so the response never breaks on
  // audit-table contention.
  prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: "TENDER_COUNTERED",
      entity: "LoadTender",
      entityId: tender.id,
      changes: JSON.stringify({
        loadId: tender.loadId,
        carrierProfileId: tender.carrierId,
        offeredRate: tender.offeredRate,
        counterRate,
      }),
    },
  }).catch((err) => log.error({ err, tenderId: tender.id }, "[Tender] auditLog counter failed"));

  // v3.8.aka Item 89 — notifyTenderAction("COUNTERED") replaces the manual
  // prisma.notification.create that pre-aka was the entire notification
  // surface. Same Sprint 38 Item 51 refactor that ACCEPTED + DECLINED +
  // EXPIRED + OFFERED already went through — counterTender was the lone
  // holdout. The helper does BOTH the in-app Notification row AND the new
  // sendTenderCounteredEmail fan-out to the AE poster with offered vs
  // counterRate + delta context. Manual call had type="TENDER" which
  // isn't a NotificationType enum value (matched Item 51's pre-fix bug
  // on the OFFERED branch); notifyTenderAction uses "TENDER_RECEIVED"
  // for the carrier-side type and routes the in-app + email properly.
  // Non-blocking on email-delivery failure — counter is already
  // persisted at this point and the in-app Notification still fires
  // inside the helper, so AE sees the counter in the bell-icon
  // dropdown even if Resend is degraded.
  await notifyTenderAction(tender.id, "COUNTERED");

  res.json(updated);
}

export async function declineTender(req: AuthRequest, res: Response) {
  const tender = await prisma.loadTender.findUnique({ where: { id: req.params.id }, include: { carrier: true, load: true } });
  if (!tender) { res.status(404).json({ error: "Tender not found" }); return; }
  if (tender.carrier.userId !== req.user!.id) { res.status(403).json({ error: "Not authorized" }); return; }

  // v3.8.ajz Item 90 — Parse optional decline reason. Frontend has been
  // POSTing { reason } since v3.8.aap (carrier portal decline modal at
  // carrier/dashboard/tenders/page.tsx:117). Backend pre-ajz dropped it
  // silently. Empty/whitespace strings normalize to undefined so a
  // carrier hitting Decline without picking a dropdown value still
  // produces a clean null in DB rather than an empty-string artifact.
  const { reason: rawReason } = declineTenderSchema.parse(req.body ?? {});
  const declineReason = rawReason && rawReason.length > 0 ? rawReason : undefined;

  // Already expired — just mark it
  if (tender.expiresAt && new Date() > tender.expiresAt) {
    await prisma.loadTender.update({ where: { id: tender.id }, data: { status: "EXPIRED" } });
  }

  const updated = await prisma.loadTender.update({
    where: { id: tender.id },
    data: {
      status: "DECLINED",
      respondedAt: new Date(),
      declineReason: declineReason ?? null,
    },
  });

  // v3.8.ajw H3 + v3.8.ajz Item 90 — Audit row now includes the decline
  // reason in the changes blob. Closes the gap where carrier decline
  // events were untrackable for analytics (decline rate by carrier,
  // decline reasons distribution per Sprint 145 candidate, lane decline
  // patterns). Non-blocking on audit-table contention.
  prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: "TENDER_DECLINED",
      entity: "LoadTender",
      entityId: tender.id,
      changes: JSON.stringify({
        loadId: tender.loadId,
        carrierProfileId: tender.carrierId,
        offeredRate: tender.offeredRate,
        declineReason: declineReason ?? null,
      }),
    },
  }).catch((err) => log.error({ err, tenderId: tender.id }, "[Tender] auditLog decline failed"));

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

  // Sprint 52.hotfix.b — filter to actionable tenders only. Pre-fix this
  // endpoint returned ALL statuses (accepted/declined/expired/countered
  // mixed with offered), past-expiry tenders, and soft-deleted rows.
  // Carrier portal "Tenders" view needs the pending-action set only.
  // Both direct (waterfallPositionId=null) and cascade-originated
  // (waterfallPositionId set) tenders surface through this single consumer.
  const tenders = await prisma.loadTender.findMany({
    where: {
      carrierId: profile.id,
      status: "OFFERED",
      expiresAt: { gt: new Date() },
      deletedAt: null,
    },
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

  // Sprint 52a (Item 141) — fan-out EXPIRED email notification per tender
  // AFTER status flip, BEFORE load revert. Each call wrapped in try/catch
  // so a single email transport error doesn't break the batch sweep.
  // Sub-pattern 12 (write-read-dataflow-audit) gate: producer (updateMany
  // flip to EXPIRED) → consumer (notifyTenderAction reads tender by id,
  // resolves carrier + AE recipients, fires sendTenderExpiredEmail).
  // Pre-Sprint-52a this wiring was missing — processExpiredTenders was
  // an orphaned producer never invoked by any cron schedule, and even
  // when invoked manually it did not fire the EXPIRED email (the email
  // template existed in emailService.ts:659 since Sprint 45a, comment
  // block explicitly labeled "Defensive add for Sprint 45b cron-driven
  // expiry handler"). Sprint 52a IS the Sprint 45b that never shipped.
  for (const tender of expired) {
    try {
      await notifyTenderAction(tender.id, "EXPIRED");
    } catch (err) {
      log.error({ err, tenderId: tender.id }, `[TenderExpiry] notifyTenderAction failed for tender`);
    }
  }

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

  log.info(`[TenderExpiry] ${expired.length} tenders expired, ${loadsReverted} loads reverted to POSTED`);
  return { expired: expired.length, loadsReverted };
}
