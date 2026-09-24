import { Router, Response } from "express";
import path from "path";
import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { z } from "zod";
import { validateBody } from "../middleware/validate";
import { upload } from "../config/upload";
import { uploadFile } from "../services/storageService";
import { nextShipmentNumber } from "../controllers/shipmentController";
import { sendShipperDeliveryEmail, sendShipperMilestoneEmail } from "../services/shipperNotificationService";
import { autoGenerateInvoice } from "../services/invoiceService";
import { onLoadDelivered } from "../services/integrationService";
import { onLoadStatusChange as aiOnLoadStatusChange, onCarrierResponse } from "../services/aiLearningLoop/feedbackCollector";
import { processGpsUpdate } from "../services/geofenceService";
import { logLoadActivity } from "../services/loadActivityService";
import { isValidExceptionCode, getExceptionReason } from "../services/exceptionTaxonomy";
import { broadcastSSE } from "./trackTraceSSE";
import { log } from "../lib/logger";
import { flagSensitiveActionAfterNewLogin } from "../lib/loginFlags";
import { validateLoadStatusTransition } from "../lib/loadStateMachine";
import { markScheduledCheckCallsAnswered } from "../services/checkCallAutomation";
import { actualEventStamps } from "../lib/loadEventStamps";
import { recordLoadDocument, LoadDocumentRefusal } from "../services/loadDocumentService";
import { normalizeDocType } from "../lib/documentTypes";
import { PAPERWORK_DOC_TYPES, PAPERWORK_DOC_LABELS, paperworkAccepts, paperworkOpenAt, paperworkNotBefore, type PaperworkDocType } from "../../../shared/constants/paperwork";
import { uploadLimiter } from "../middleware/rateLimiters";
import { assignCarrier } from "../services/carrierAssignmentService";
import { complianceCheck } from "../services/complianceMonitorService";
import { createTender } from "../services/tenderCreationService";
import { acceptTender } from "../controllers/tenderController";
import { makeCaptureRes } from "../lib/captureResponse";
import { settleTender } from "../services/tenderTransitionService";
import { driverFieldsFromBody, hasDriverFields } from "../lib/driverFields";
import { stampCarrierAcceptance } from "../lib/acceptanceEvidence";
import { loadIsDead, rcPage, PORTAL_MY_LOADS } from "./rcSign";
import { extractClientIp } from "../services/geoService";
import { clientUserAgent } from "../lib/clientIp";
import {
  rotateRcSignToken, recentCarrierMints, recordCarrierMint, carrierEmailOnFile, sendSignLinkEmail,
  RC_SIGN_LINK_MINTS_PER_HOUR,
} from "../services/rcSignLinkService";
import { shipmentSyncFor } from "../lib/shipmentStatusFor";

const router = Router();

router.use(authenticate);
router.use(authorize("CARRIER"));

// v3.8.ajx H1+C4 — SUSPENDED gate for carrier-side mutation endpoints.
//
// Pre-ajx the 5 write endpoints (/:id/status, /:id/documents, /:id/check-call,
// /:id/exceptions, /:id/exceptions/:excId/receipt) only checked load ownership
// (`load.carrierId !== req.user!.id` → 403). A carrier whose onboarding flipped
// to SUSPENDED mid-flight (insurance expired, FMCSA authority revoked, manual
// AE suspension via OverrideComplianceModal/admin) could still continue to
// mutate their active loads — upload POD, mark IN_TRANSIT, fire check calls —
// because the gate fired upstream on TENDER but not on per-load mutation.
//
// complianceMonitorService.ts auto-suspends in 4 branches (insurance-expiry
// L1424, monthly re-vetting L1553, authority-change L1662, safety-rating
// L1702). C4 closes the gap by enforcing the gate at carrier-action time:
// SUSPENDED → 403 with structured code so the carrier portal can surface
// "Your account is suspended. Contact compliance@silkroutelogistics.ai."
//
// Returns `false` when blocked (response already sent). Returns `true` when
// the carrier may proceed.
/**
 * E2 — the carrier's OWN tender rows on a load, for the next-step strip and the
 * BOL button state. Scoped through the relation (LoadTender.carrierId is a
 * CarrierProfile.id; the session holds a User.id — §13.3 Items 57, 222.4) so
 * no other carrier's row, withdrawn or otherwise, is ever serialised to this
 * carrier. Deleted rows excluded, newest first.
 */
/**
 * C6 — "is there a signed rate confirmation on this load", and NOTHING else.
 *
 * The carrier's BOL gate is `carrierAcceptedAt OR a signed RC` (bgs), so the
 * portal needs to know whether one exists. It does NOT need to know who signed
 * it, from what IP, or the hash of the bytes — that is SRL's evidence ABOUT the
 * carrier, and the AE console is where it belongs. Selecting `{ id }` alone
 * means presence is all that can travel: a future reader cannot widen this by
 * accident, because there is nothing here to widen into.
 */
const signedRcPresence = {
  where: { signed: true },
  select: { id: true },
  take: 1,
} as const;

function ownTenders(carrierUserId: string): Prisma.LoadTenderFindManyArgs {
  return {
    where: { carrier: { userId: carrierUserId }, deletedAt: null },
    select: { id: true, status: true, statusReason: true, statusChangedAt: true },
    orderBy: { createdAt: "desc" },
  };
}

async function checkCarrierNotSuspended(req: AuthRequest, res: Response): Promise<boolean> {
  const profile = await prisma.carrierProfile.findUnique({
    where: { userId: req.user!.id },
    select: { onboardingStatus: true },
  });
  if (profile?.onboardingStatus === "SUSPENDED") {
    res.status(403).json({
      error: "Your account is suspended. Contact compliance@silkroutelogistics.ai.",
      code: "CARRIER_SUSPENDED",
    });
    return false;
  }
  return true;
}

// GET /api/carrier-loads/available — Loads matching carrier's equipment/regions
router.get("/available", async (req: AuthRequest, res: Response) => {
  const profile = await prisma.carrierProfile.findUnique({ where: { userId: req.user!.id } });
  if (!profile) {
    res.status(404).json({ error: "Carrier profile not found" });
    return;
  }

  if (profile.onboardingStatus !== "APPROVED") {
    res.status(403).json({ error: "Carrier must be approved to view available loads" });
    return;
  }

  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, parseInt(req.query.limit as string) || 20);

  // Find POSTED loads matching carrier equipment
  const where: Record<string, unknown> = {
    status: "POSTED",
    carrierId: null,
    deletedAt: null,
  };

  // Filter by equipment type if carrier has preferences
  if (profile.equipmentTypes && profile.equipmentTypes.length > 0) {
    where.equipmentType = { in: profile.equipmentTypes };
  }

  const [loads, total] = await Promise.all([
    prisma.load.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true, referenceNumber: true,
        originCity: true, originState: true, originZip: true,
        destCity: true, destState: true, destZip: true,
        equipmentType: true, weight: true, commodity: true,
        carrierRate: true, rate: true, distance: true,
        pickupDate: true, deliveryDate: true,
        pickupTimeStart: true, pickupTimeEnd: true,
        deliveryTimeStart: true, deliveryTimeEnd: true,
        specialInstructions: true,
        status: true, createdAt: true,
      },
    }),
    prisma.load.count({ where }),
  ]);

  // Enrich loads with facility detention warnings
  const { getFacilityDetentionWarning } = await import("../services/detentionTrackingService");
  const enrichedLoads = await Promise.all(
    loads.map(async (load) => {
      const pickupWarning = await getFacilityDetentionWarning("", load.originCity, load.originState);
      const deliveryWarning = await getFacilityDetentionWarning("", load.destCity, load.destState);
      return {
        ...load,
        detentionWarnings: {
          pickup: pickupWarning,
          delivery: deliveryWarning,
        },
      };
    })
  );

  res.json({ loads: enrichedLoads, total, page, totalPages: Math.ceil(total / limit) });
});

// GET /api/carrier-loads/my-loads — Carrier's assigned loads
router.get("/my-loads", async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
  const status = req.query.status as string;

  const where: Record<string, unknown> = {
    carrierId: req.user!.id,
    deletedAt: null,
  };
  // E6 — a comma-separated list is a set: the My Loads "Completed" chip asks
  // for POD_RECEIVED,INVOICED,COMPLETED, because from the carrier's side those
  // are one state (delivered, paperwork in) and a chip that matched only the
  // last of them would hide a load for the weeks it sits at the first two.
  if (status && status !== "ALL") {
    const set = status.split(",").map((s) => s.trim()).filter(Boolean);
    where.status = set.length > 1 ? { in: set } : set[0];
  }

  const [loads, total] = await Promise.all([
    prisma.load.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true, referenceNumber: true,
        originCity: true, originState: true, originZip: true, originCompany: true,
        destCity: true, destState: true, destZip: true, destCompany: true,
        equipmentType: true, weight: true, commodity: true,
        carrierRate: true, rate: true, distance: true,
        pickupDate: true, deliveryDate: true,
        pickupTimeStart: true, pickupTimeEnd: true,
        deliveryTimeStart: true, deliveryTimeEnd: true,
        specialInstructions: true, status: true,
        driverName: true, driverPhone: true, truckNumber: true, trailerNumber: true,
        rateConfirmationPdfUrl: true,
        createdAt: true, updatedAt: true,
        // C6 — the two facts the BOL gate actually reads (bgs). The list
        // enumerates its select explicitly, so neither arrived here before and
        // the strip mirrored a gate the backend had stopped using.
        carrierAcceptedAt: true,
        rateConfirmations: signedRcPresence,
        // E2 — the next-step strip and the BOL button state are decided from the
        // TENDER (lib/loadDerivedStatus on the carrier side, the same selector
        // the AE board uses). Only THIS carrier's rows: LoadTender.carrierId is
        // a CarrierProfile.id, so the scope is the relation, and a withdrawn
        // sibling never leaves the server.
        tenders: ownTenders(req.user!.id),
      },
    }),
    prisma.load.count({ where }),
  ]);

  res.json({ loads, total, page, totalPages: Math.ceil(total / limit) });
});

// GET /api/carrier-loads/:id — Get single load detail
router.get("/:id", async (req: AuthRequest, res: Response) => {
  const load = await prisma.load.findUnique({
    where: { id: req.params.id },
    include: {
      poster: { select: { firstName: true, lastName: true, company: true, phone: true, email: true } },
      carrier: { select: { firstName: true, lastName: true, company: true, phone: true, carrierProfile: { select: { companyName: true, mcNumber: true, dotNumber: true } } } },
      customer: { select: { name: true, contactName: true, email: true, phone: true } },
      // E4 (ruling 6) — the paperwork panel reads every settlement type, so the
      // carrier sees each slot's state; the original BOL and the RC ride along
      // for the buttons that were already here.
      documents: { where: { docType: { in: [...PAPERWORK_DOC_TYPES, "RATE_CON", "BOL"] } }, orderBy: { createdAt: "desc" } },
      tenders: ownTenders(req.user!.id),
      // C6 — the detail already carries carrierAcceptedAt (this query uses
      // `include`, so every Load scalar comes back); the signed-RC half is what
      // was missing, and the BOL button reads THIS payload.
      rateConfirmations: signedRcPresence,
    },
  });

  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }

  // Carrier can only see their own loads or POSTED loads
  if (load.carrierId !== req.user!.id && load.status !== "POSTED") {
    res.status(403).json({ error: "Not authorized to view this load" });
    return;
  }

  res.json(load);
});

const acceptSchema = z.object({
  driverName: z.string().optional(),
  driverPhone: z.string().optional(),
  truckNumber: z.string().optional(),
  trailerNumber: z.string().optional(),
});

// POST /api/carrier-loads/:id/accept — Accept a posted load
router.post("/:id/accept", validateBody(acceptSchema), async (req: AuthRequest, res: Response) => {
  const profile = await prisma.carrierProfile.findUnique({ where: { userId: req.user!.id } });
  if (!profile || profile.onboardingStatus !== "APPROVED") {
    res.status(403).json({ error: "Carrier must be approved to accept loads" });
    return;
  }

  const load = await prisma.load.findUnique({ where: { id: req.params.id } });
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
  if (load.status !== "POSTED") {
    res.status(400).json({ error: "Load is no longer available (status: " + load.status + ")" });
    return;
  }

  // v3.8.axc — the full compliance gate, which this path never ran.
  //
  // It checked onboardingStatus === "APPROVED" and nothing else, while the
  // router-level gate checks only SUSPENDED. complianceCheck covers far more:
  // insurance expiry, FMCSA authority revoked, out-of-service, chameleon risk,
  // authority age, vetting score — and AGREEMENT_TERMINATED.
  //
  // That last one made this a live contradiction of ratified policy. §14 says
  // terminating a Broker-Carrier Agreement blocks future tenders; acceptTender
  // enforces that. But a terminated carrier could still walk up to the load
  // board and TAKE a posted load, because this path never asked. Same for a
  // carrier whose insurance lapsed but whose auto-suspend cron had not yet run:
  // an AE tendering them the very same load would have been blocked.
  const compliance = await complianceCheck(profile.id);
  if (!compliance.allowed) {
    res.status(403).json({
      error: "Your account cannot accept loads right now.",
      blocked_reasons: compliance.blocked_reasons,
      blocked_codes: compliance.blocked_codes,
    });
    return;
  }

  // Present-only. The portal's accept button posts no body, and until Phase 0
  // of the mandatory-ELD arc this route wrote all four driver fields as
  // `value || null`, erasing whatever an AE had entered on the load. The rule
  // is shared with PATCH /:id/driver so the two cannot drift.
  const driverFields = driverFieldsFromBody(req.body);

  // v3.8.axf — the self-assign becomes a real tender: createTender, then the
  // ordinary acceptTender path.
  //
  // This route used to reimplement acceptance: it assigned the carrier itself,
  // created the shipment itself, withdrew siblings itself, notified the AE
  // itself. Four copies of logic that already existed, and it still produced a
  // load with a carrier and NO tender — so no OFFERED row, no tender history,
  // no rate confirmation, and nothing for the lifecycle to reason about. A
  // carrier who took a load off the board simply had no paper trail.
  //
  // Now the offer is recorded and immediately accepted. Delegation is via the
  // response-capturing shim already used by the magic-link route
  // (routes/tenderAction.ts), which reuses the whole battle-tested accept path
  // — compliance re-check, atomic transaction, carrier assignment, sibling
  // withdrawal, shipment, auto-RC, notifications, tracking-link fan-out — with
  // no duplication. acceptTender's ownership gate is satisfied because this
  // carrier IS the requesting user.
  // The carrier rate, and ONLY the carrier rate.
  //
  // The first version of this read `load.carrierRate ?? load.rate ?? 0`, and the
  // noLoadRateReads guard caught it. Load.rate is a retired write-only mirror of
  // the CUSTOMER rate (§13.3 Item 227), so that fallback would have offered the
  // carrier what the shipper is being charged — the §13.3 Item 221.2 harm, on
  // the one path where the carrier accepts the number on sight.
  //
  // No fallback to 0 either. §14: fail toward not paying rather than toward the
  // wrong number. A load on the board with no carrier rate is a data problem an
  // AE must fix; quoting zero would let a carrier accept a load worth nothing.
  if (load.carrierRate == null) {
    res.status(409).json({
      error: "This load has no carrier rate set yet. Contact your SRL rep.",
      code: "NO_CARRIER_RATE",
    });
    return;
  }

  const selfTender = await createTender({
    loadId: load.id,
    carrierProfileId: profile.id,
    offeredRate: load.carrierRate,
    actor: { id: req.user!.id, type: "CARRIER" },
    reason: "load_board_self_accept",
  });

  const cap = makeCaptureRes();
  await acceptTender({ ...req, params: { id: selfTender.id } } as AuthRequest, cap.shim);
  if (cap.state.statusCode >= 400) {
    // acceptTender refused (expired, compliance, illegal status). The OFFERED
    // row stays as the record that the attempt happened, and the carrier is
    // told why in acceptTender's own words rather than a generic message.
    res.status(cap.state.statusCode).json(cap.state.body);
    return;
  }

  // Driver details are this route's alone — acceptTender has no notion of them.
  // Not a carrierId write, so it does not belong in carrierAssignmentService.
  const updated = hasDriverFields(driverFields)
    ? await prisma.load.update({ where: { id: load.id }, data: driverFields })
    : await prisma.load.findUnique({ where: { id: load.id } });

  // Shipment creation, sibling withdrawal and the AE notification all happened
  // inside acceptTender above. They used to be duplicated here, and the copies
  // had already drifted: this one created the shipment at `load.carrierRate ?? 0`
  // while acceptTender uses the tender's agreed rate.
  // Update CPP stats
  await prisma.carrierProfile.update({
    where: { id: profile.id },
    data: {
      cppTotalLoads: { increment: 1 },
      cppTotalMiles: { increment: load.distance || 0 },
    },
  });

  // AI Learning Loop: record carrier acceptance
  aiOnLoadStatusChange(load.id, "POSTED", "BOOKED", new Date()).catch((e) =>
    log.error({ err: e }, "[AI Feedback]")
  );
  onCarrierResponse(req.user!.id, load.id, "ACCEPTED", 0).catch((e) =>
    log.error({ err: e }, "[AI Feedback]")
  );

  res.json(updated);
});

// POST /api/carrier-loads/:id/decline — Decline a load tender
router.post("/:id/decline", async (req: AuthRequest, res: Response) => {
  const load = await prisma.load.findUnique({ where: { id: req.params.id } });
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }

  // Log the decline as a tender event if tender exists
  const tender = await prisma.loadTender.findFirst({
    where: { loadId: load.id, carrierId: { not: undefined } },
    orderBy: { createdAt: "desc" },
  });

  if (tender) {
    await settleTender({
      tenderId: tender.id, to: "DECLINED", from: ["OFFERED", "COUNTERED"],
      respondedAt: new Date(),
      actor: { id: req.user!.id, type: "CARRIER" },
    });
  }

  // AI Learning Loop: record carrier decline
  onCarrierResponse(req.user!.id, load.id, "DECLINED", 0).catch((e) =>
    log.error({ err: e }, "[AI Feedback]")
  );

  // Notify broker
  if (load.posterId) {
    await prisma.notification.create({
      data: {
        userId: load.posterId,
        type: "LOAD",
        title: "Load Declined",
        message: `A carrier declined load ${load.referenceNumber}.`,
        actionUrl: "/dashboard/loads",
      },
    });
  }

  res.json({ success: true });
});

const updateDriverSchema = z.object({
  driverName: z.string().optional(),
  driverPhone: z.string().optional(),
  truckNumber: z.string().optional(),
  trailerNumber: z.string().optional(),
});

// PATCH /api/carrier-loads/:id/driver — Update driver/truck info on assigned load
// Called by the Driver & Equipment panel on /carrier/dashboard/my-loads.
router.patch("/:id/driver", validateBody(updateDriverSchema), async (req: AuthRequest, res: Response) => {
  const load = await prisma.load.findUnique({ where: { id: req.params.id } });
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
  if (load.carrierId !== req.user!.id) {
    res.status(403).json({ error: "Not your load" });
    return;
  }

  const data = driverFieldsFromBody(req.body);

  const updated = await prisma.load.update({ where: { id: load.id }, data });
  res.json(updated);
});

// POST /api/carrier-loads/:id/status — Update load status (carrier-side)
const statusUpdateSchema = z.object({
  status: z.enum(["AT_PICKUP", "LOADED", "IN_TRANSIT", "AT_DELIVERY", "DELIVERED"]),
  note: z.string().optional(),
});

router.post("/:id/status", validateBody(statusUpdateSchema), async (req: AuthRequest, res: Response) => {
  const load = await prisma.load.findUnique({ where: { id: req.params.id } });
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
  if (load.carrierId !== req.user!.id) {
    res.status(403).json({ error: "Not your load" });
    return;
  }
  if (!(await checkCarrierNotSuspended(req, res))) return;

  const { status, note } = req.body;
  const oldStatus = load.status;

  // A repeat of the status the load already holds is a double-submit, not a
  // second event. The transition validator ALLOWS same-status on both actors,
  // so before this guard a double-click fired every side effect twice: on
  // 2026-09-22 two LOADED writes 453ms apart put two identical
  // "Shipment Picked Up" emails into a customer's inbox 272ms apart and left
  // two check-call rows behind them. Answering 200 rather than 4xx is
  // deliberate — the caller asked for a state the load is already in, which is
  // not an error, and a 4xx would make a harmless retry look like a failure.
  if (oldStatus === status) {
    res.json({ ...load, unchanged: true });
    return;
  }

  // v3.8.ajw C3 — Reject illegitimate transitions (BOOKED→DELIVERED skip,
  // backwards jumps, etc.). Carrier-side state machine canonicalized in
  // src/lib/loadStateMachine.ts. Returns 422 with the structured reason so
  // the carrier portal can surface a useful message ("Cannot jump from
  // BOOKED to DELIVERED. Next allowed: AT_PICKUP.") instead of a generic
  // 500 from downstream code that assumed the state machine was honored.
  const transition = validateLoadStatusTransition(oldStatus, status, "CARRIER");
  if (!transition.allowed) {
    res.status(422).json({
      error: transition.reason ?? "Invalid status transition",
      code: transition.code,
      from: oldStatus,
      to: status,
    });
    return;
  }

  // Build B (2026-05-30): AT_PICKUP is now the PRIMARY pickup-time signal
  // (arrival at shipper = the on-time-pickup moment); LOADED/IN_TRANSIT remain
  // fallbacks, never overwriting an earlier AT_PICKUP stamp. Replaces the prior
  // unconditional LOADED/IN_TRANSIT overwrite. See lib/loadEventStamps.ts.
  const data: Record<string, unknown> = { status, ...actualEventStamps(status, load) };

  const updated = await prisma.load.update({ where: { id: load.id }, data });

  // C4a — arriving at the shipper is an acceptance if nothing earlier recorded
  // one. A carrier who drove to the dock has plainly taken the load, whatever
  // paperwork did or did not happen first, and this is the last honest moment
  // to say so. First-write-wins in the writer means it defers to a real
  // signature or tender accept rather than overwriting one.
  //
  // The ownership gate above already refused anyone but this load's carrier
  // (403 "Not your load"), so load.carrierId === req.user.id here by
  // construction; it is passed explicitly rather than relied on implicitly,
  // because the writer refuses a carrier who does not hold the load and that
  // refusal should never be reached from a path that has already checked.
  if (status === "AT_PICKUP" && load.carrierId) {
    await stampCarrierAcceptance({
      loadId: load.id,
      via: "PICKUP_ARRIVAL",
      carrierUserId: load.carrierId,
      byUserId: req.user!.id,
      at: new Date(),
    });
  }

  // T&T activity + real-time board push
  await logLoadActivity({
    loadId: load.id,
    eventType: "status_change",
    description: `Status ${oldStatus} → ${status}`,
    actorType: "CARRIER",
    actorId: req.user!.id,
    actorName: req.user!.email,
    metadata: { from: oldStatus, to: status, source: "carrier_portal" },
  });
  broadcastSSE({ type: "status_change", loadId: load.id, data: { from: oldStatus, to: status } });

  // AI Learning Loop: record carrier status change
  aiOnLoadStatusChange(load.id, oldStatus, status, new Date()).catch((e) =>
    log.error({ err: e }, "[AI Feedback]")
  );

  // Create check call for the status update
  try {
    await prisma.checkCall.create({
      data: {
        loadId: load.id,
        calledById: req.user!.id,
        status,
        notes: note || `Carrier updated status to ${status}`,
      },
    });
  } catch {
    // Non-critical, don't fail the request
  }

  // Audit F-5 — a status advance IS a check-in. Close any due obligation so the
  // carrier is not texted for an update they just gave, then marked MISSED.
  await markScheduledCheckCallsAnswered(load.id, {
    responseText: `Carrier advanced load to ${status} via portal`,
  });

  // Notify broker
  if (load.posterId) {
    await prisma.notification.create({
      data: {
        userId: load.posterId,
        type: "LOAD",
        title: "Load Status Updated",
        message: `Load ${load.referenceNumber} status: ${status.replace(/_/g, " ")}`,
        actionUrl: "/dashboard/loads",
      },
    });
  }

  // v3.8.akc Item 158 — Shipment + shipper fan-out, MIGRATED from the
  // pre-akc dead route loadController.carrierUpdateStatus (PATCH
  // /api/loads/:id/carrier-status). That route was authorize("CARRIER")
  // only, had richer side effects (Shipment sync + shipper email cascade
  // + auto-invoice on DELIVERED + onLoadDelivered integration), and was
  // wired to a frontend mutation on /dashboard/loads that never fired in
  // production (the CarrierActions conditional render gates on
  // isCarrier(user?.role) but carriers route to /carrier/dashboard, not
  // /dashboard). Net effect pre-akc: carrier portal status updates went
  // through the canonical POST /api/carrier-loads/:id/status but missed
  // the shipper-notification + auto-invoice fan-outs that the dead route
  // was doing. akc merges the side effects into the canonical, then
  // deletes the dead route + dead controller + dead frontend mutation.

  // Shipment status sync — maps load statuses to ShipmentStatus enum.
  const linkedShipment = await prisma.shipment.findFirst({ where: { loadId: load.id } });
  if (linkedShipment) {
    // The map that used to live here is now lib/shipmentStatusFor.ts. It kept
    // this path's answers exactly when it was extracted; C2 then corrected the
    // one that was wrong -- AT_PICKUP reads DISPATCHED, not PICKED_UP, because
    // arriving is not loading. Nothing a shipper SEES moves either way: every
    // shipper-facing surface reads Load, not Shipment.
    const sync = shipmentSyncFor(status);
    const shipmentUpdate: Record<string, unknown> = { status: sync.status };
    if (sync.setActualPickup) shipmentUpdate.actualPickup = new Date();
    if (status === "IN_TRANSIT") shipmentUpdate.lastLocationAt = new Date();
    if (sync.setActualDelivery) shipmentUpdate.actualDelivery = new Date();
    await prisma.shipment.update({ where: { id: linkedShipment.id }, data: shipmentUpdate });
  }

  // Auto-invoice + integration + delivery email on DELIVERED.
  if (status === "DELIVERED") {
    await autoGenerateInvoice(load.id);
    sendShipperDeliveryEmail(load.id).catch((e) => log.error({ err: e }, "[ShipperNotify] delivery email error:"));
    onLoadDelivered(load.id).catch((e) => log.error({ err: e }, "[Integration] onLoadDelivered error:"));
  }

  // Milestone email — the single canonical shipper lifecycle email (milestone
  // label + full details + tracking link), fires for every status change.
  // go-live audit R1: the pickup email + the per-status CRM contact cascade that
  // used to fire here were removed as duplicates of this one (a shipper got 2-3
  // emails per milestone); the POD email is sent by the POD-upload flow.
  sendShipperMilestoneEmail(load.id, status).catch((e) => log.error({ err: e }, "[ShipperNotify] milestone email error:"));

  res.json(updated);
});

// POST /api/carrier-loads/:id/documents — Upload a document (BOL, POD, etc.)
router.post("/:id/documents", uploadLimiter, upload.single("file"), async (req: AuthRequest, res: Response) => {
  const load = await prisma.load.findUnique({ where: { id: req.params.id } });
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
  if (load.carrierId !== req.user!.id) {
    res.status(403).json({ error: "Not your load" });
    return;
  }
  if (!(await checkCarrierNotSuspended(req, res))) return;
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  // E4 (ruling 6) — "SIGNED_BOL_PU accepted from AT_PICKUP": the one paperwork
  // slot with a status gate. The panel does not offer it earlier, and this
  // refusal is what makes that a rule rather than a button. The gate lives in
  // shared/constants/paperwork so the panel and this route read one table;
  // every other paperwork type is open from the moment the panel exists.
  {
    const dt = normalizeDocType(req.body.docType ?? req.body.type);
    if (dt && (PAPERWORK_DOC_TYPES as readonly string[]).includes(dt) && !paperworkAccepts(dt, load.status)) {
      const label = PAPERWORK_DOC_LABELS[dt as PaperworkDocType];
      const open = paperworkOpenAt(load.status);
      res.status(409).json({
        error: open
          ? `${label} is accepted once the load reaches ${paperworkNotBefore(dt)}.`
          : `This load is not taking paperwork (status ${load.status}).`,
        code: open ? "PAPERWORK_TOO_EARLY" : "LOAD_NOT_OPEN",
      });
      return;
    }
  }

  // E1c — one seam records a load document (services/loadDocumentService):
  // allowlist + magic-byte check before any write, the file, the Document row,
  // and on a POD the status advance AND the delivery + settlement hooks. This
  // route used to advance AT_DELIVERY -> POD_RECEIVED past DELIVERED and fire
  // nothing, so a carrier who uploaded the POD at delivery was never paid.
  let result;
  try {
    result = await recordLoadDocument({
      loadId: load.id,
      docType: req.body.docType || req.body.type,
      file: req.file,
      actor: { id: req.user!.id, email: req.user!.email, role: req.user!.role },
      uploadSource: "CARRIER_PORTAL",
    });
  } catch (e) {
    if (e instanceof LoadDocumentRefusal) {
      res.status(e.status).json({ error: e.message, code: e.code });
      return;
    }
    throw e;
  }
  // B5b-2 — see documentController; this router is carrier-only already.
  void flagSensitiveActionAfterNewLogin(req.user!.id, "document-upload");
  res.json(result.document);
});

// ── E3 (ruling 3, 2026-09-21): in-portal signing + self-serve resend ─────────
//
// There is ONE signing surface, the token page (/api/rc-sign/:token), and the
// portal reaches it by MINTING a fresh single-use token through the same
// function the AE's RESEND_RC uses (services/rcSignLinkService) and sending the
// carrier there. Nothing here reads or returns a stored token: the row holds
// only a hash, and the secret exists only in the redirect or the email, once.
// The legacy session-authed POST /rate-confirmations/:id/sign is deleted with
// this arc (Item 158 precedent) — it signed without moving the tender, so the
// BOL gate stayed shut behind a "signed" document.
//
// Both routes:
//   (a) the caller owns the load, the load is live, and THIS carrier's tender is
//       RC_SENT — nothing to sign before the AE sends, nothing after CONFIRMED;
//   (b) rotate the token (which is what revokes the prior link);
//   (c) 3 mints per RC per rolling hour, 429 beyond — the audit row is the
//       counter, so "audit-log every mint" is not a thing to remember.
//
// The portal route answers a form-POST NAVIGATION (the session cookie rides a
// same-site top-level POST; an XHR could not follow the redirect into a page),
// so its refusals are the branded page rather than JSON. The email route is
// an XHR and answers JSON.
type SignableRc =
  | { ok: true; load: { id: string; referenceNumber: string; loadNumber: string | null }; rc: { id: string } }
  | { ok: false; status: number; code: string; message: string };

async function signableRcForCarrier(loadId: string, userId: string): Promise<SignableRc> {
  const load = await prisma.load.findUnique({
    where: { id: loadId },
    select: { id: true, referenceNumber: true, loadNumber: true, carrierId: true, status: true, deletedAt: true },
  });
  if (!load) return { ok: false, status: 404, code: "LOAD_NOT_FOUND", message: "Load not found." };
  if (load.carrierId !== userId) return { ok: false, status: 403, code: "NOT_YOUR_LOAD", message: "Not your load." };
  if (loadIsDead(load)) return { ok: false, status: 409, code: "LOAD_NOT_LIVE", message: "This load has been cancelled. There is nothing to sign." };

  const tender = await prisma.loadTender.findFirst({
    where: { loadId: load.id, carrier: { userId }, deletedAt: null, status: { in: ["ACCEPTED", "RC_SENT", "CONFIRMED"] } },
    orderBy: { createdAt: "desc" },
    select: { status: true },
  });
  if (!tender || tender.status === "ACCEPTED") {
    return { ok: false, status: 409, code: "RC_NOT_SENT", message: "SRL has not sent the rate confirmation for this load yet. It will arrive by email; you can sign it here once it has." };
  }
  if (tender.status === "CONFIRMED") {
    return { ok: false, status: 409, code: "ALREADY_SIGNED", message: "This rate confirmation is already signed. Nothing further is needed." };
  }
  const rc = await prisma.rateConfirmation.findFirst({
    where: { loadId: load.id, status: { not: "VOID" } },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, contentHash: true },
  });
  if (!rc || rc.status !== "SENT" || !rc.contentHash) {
    return { ok: false, status: 409, code: "RC_NOT_SENT", message: "SRL has not sent the rate confirmation for this load yet." };
  }
  return { ok: true, load: { id: load.id, referenceNumber: load.referenceNumber, loadNumber: load.loadNumber }, rc: { id: rc.id } };
}

async function mintLimitHit(rcId: string): Promise<boolean> {
  return (await recentCarrierMints(rcId)) >= RC_SIGN_LINK_MINTS_PER_HOUR;
}


// POST /api/carrier-loads/:id/rc-sign-link — sign it here: mint, then 303 to the signing page.
router.post("/:id/rc-sign-link", async (req: AuthRequest, res: Response) => {
  const s = await signableRcForCarrier(req.params.id, req.user!.id);
  const back = `${PORTAL_MY_LOADS}?load=${encodeURIComponent(req.params.id)}`;
  if (!s.ok) {
    res.status(s.status).type("html").send(rcPage({
      title: s.code === "ALREADY_SIGNED" ? "Already signed" : "Nothing to sign yet",
      body: `<h1>${s.code === "ALREADY_SIGNED" ? "This rate confirmation is signed" : "Nothing to sign yet"}</h1><p>${s.message}</p><a class="cta" href="${back}">Back to My Loads</a>`,
    }));
    return;
  }
  if (await mintLimitHit(s.rc.id)) {
    res.status(429).type("html").send(rcPage({
      title: "Too many signing links",
      body: `<h1>Too many signing links</h1><p>A new signing link has been issued ${RC_SIGN_LINK_MINTS_PER_HOUR} times in the last hour for this rate confirmation. Use the most recent one from your email, or try again in an hour.</p><a class="cta" href="${back}">Back to My Loads</a>`,
    }));
    return;
  }
  const link = await rotateRcSignToken(s.rc.id);
  await recordCarrierMint({
    userId: req.user!.id, rcId: s.rc.id, loadId: s.load.id, tokenId: link.tokenId, channel: "portal",
    ip: extractClientIp(req as never), userAgent: clientUserAgent(req as never),
  });
  res.redirect(303, link.path);
});

// POST /api/carrier-loads/:id/rc-sign-link/email — email me a new link, to the address on file only.
router.post("/:id/rc-sign-link/email", async (req: AuthRequest, res: Response) => {
  const s = await signableRcForCarrier(req.params.id, req.user!.id);
  if (!s.ok) { res.status(s.status).json({ error: s.message, code: s.code }); return; }
  if (await mintLimitHit(s.rc.id)) {
    res.status(429).json({
      error: `A new signing link has been issued ${RC_SIGN_LINK_MINTS_PER_HOUR} times in the last hour for this rate confirmation. Use the most recent one, or try again in an hour.`,
      code: "SIGN_LINK_RATE_LIMITED",
    });
    return;
  }
  // The request body is never consulted for the address. A link that signs a
  // document for this carrier goes only to an address this carrier put on file.
  const to = await carrierEmailOnFile(req.user!.id);
  if (!to) { res.status(409).json({ error: "No email address on file for this carrier.", code: "NO_EMAIL_ON_FILE" }); return; }

  const link = await rotateRcSignToken(s.rc.id);
  try {
    await sendSignLinkEmail(to, s.load.loadNumber ?? s.load.referenceNumber, link.url);
  } catch (err) {
    // The prior link is already superseded; the carrier asked for a new one and
    // can ask again. The mint is NOT recorded, so a failed send does not count
    // against them.
    log.error({ err, rcId: s.rc.id }, "[RC] carrier-requested signing link failed to send");
    res.status(502).json({ error: "We could not send the email. Try again in a moment.", code: "EMAIL_SEND_FAILED" });
    return;
  }
  await recordCarrierMint({
    userId: req.user!.id, rcId: s.rc.id, loadId: s.load.id, tokenId: link.tokenId, channel: "email", sentTo: to,
    ip: extractClientIp(req as never), userAgent: clientUserAgent(req as never),
  });
  res.json({ ok: true, sentTo: to, expiresAt: link.expiresAt });
});

// POST /api/carrier-loads/:id/check-call — Submit a check call from carrier
const checkCallSchema = z.object({
  city: z.string().optional(),
  state: z.string().optional(),
  etaHours: z.number().optional(),
  notes: z.string().optional(),
});

router.post("/:id/check-call", validateBody(checkCallSchema), async (req: AuthRequest, res: Response) => {
  const load = await prisma.load.findUnique({ where: { id: req.params.id } });
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
  if (load.carrierId !== req.user!.id) {
    res.status(403).json({ error: "Not your load" });
    return;
  }
  if (!(await checkCarrierNotSuspended(req, res))) return;

  const { city: ccCity, state: ccState, etaHours, notes } = req.body;
  const location = ccCity && ccState ? `${ccCity}, ${ccState}` : (ccCity || ccState || "");
  const etaDate = etaHours ? new Date(Date.now() + etaHours * 3600000) : undefined;

  const cc = await prisma.checkCall.create({
    data: {
      loadId: load.id,
      calledById: req.user!.id,
      status: load.status,
      location: location || undefined,
      city: ccCity || undefined,
      state: ccState || undefined,
      etaUpdate: etaDate,
      method: "CARRIER_PORTAL",
      notes: notes || `Carrier check-in from ${location || "unknown location"}`,
    },
  });

  // Audit F-5 — this is the whole point of the endpoint: the carrier answered.
  // Close the outstanding schedule row so processDueCheckCalls stops chasing it
  // and riskEngine stops counting it against the load.
  await markScheduledCheckCallsAnswered(load.id, {
    responseText: location
      ? `Carrier reported in via portal from ${location}`
      : "Carrier reported in via portal",
  });

  // Notify broker
  if (load.posterId) {
    await prisma.notification.create({
      data: {
        userId: load.posterId,
        type: "LOAD",
        title: "Check Call Received",
        message: `Check call for ${load.referenceNumber}: ${location || "Location update"}${etaHours ? " — ETA " + etaHours + "h" : ""}`,
        actionUrl: "/dashboard/loads",
      },
    });
  }

  res.json(cc);
});

// ─── Post Capacity / Availability ────────────────────────────────────
// Carrier announces where they are and when they'll be available.
// Stored on CarrierProfile.preferredLanes JSON field as capacity posts.
router.post("/post-capacity", async (req: AuthRequest, res: Response) => {
  try {
    const { currentCity, currentState, availableDate, equipmentType, preferredDestStates, notes } = req.body;
    if (!currentCity || !currentState || !availableDate) {
      res.status(400).json({ error: "currentCity, currentState, and availableDate required" });
      return;
    }
    const profile = await prisma.carrierProfile.findUnique({ where: { userId: req.user!.id } });
    if (!profile) { res.status(404).json({ error: "Carrier profile not found" }); return; }

    const capacityPost = {
      currentCity, currentState, availableDate, equipmentType: equipmentType || profile.equipmentTypes?.[0] || "Dry Van",
      preferredDestStates: preferredDestStates || [], notes: notes || "",
      postedAt: new Date().toISOString(), carrierId: req.user!.id, companyName: profile.companyName,
    };

    // Store as latest capacity post in preferredLanes JSON
    const existing = (profile.preferredLanes as any) || {};
    const capacityPosts = Array.isArray(existing.capacityPosts) ? existing.capacityPosts : [];
    capacityPosts.unshift(capacityPost);
    // Keep last 10 posts
    if (capacityPosts.length > 10) capacityPosts.length = 10;

    await prisma.carrierProfile.update({
      where: { userId: req.user!.id },
      data: { preferredLanes: { ...existing, capacityPosts, lastCapacityPost: capacityPost } },
    });

    res.json({ ok: true, capacityPost });
  } catch (err) {
    log.error({ err: err }, "[Capacity] Post error:");
    res.status(500).json({ error: "Failed to post capacity" });
  }
});

// ─── ARC 19: verified driver phone ─────────────────────────────────
//
// Dispatch requires a driver name and a mobile we have PROVEN reaches a
// handset. `driverPhone` was free text: a typo produced silence
// indistinguishable from a driver ignoring us, and a deliberately wrong
// number produced the same silence with worse intent. §13.3 Item 225.

const driverVerifyStartSchema = z.object({
  driverName: z.string().min(2).max(120),
  driverPhone: z.string().min(7).max(24),
});

router.post("/:id/driver-verify/start", validateBody(driverVerifyStartSchema), async (req: AuthRequest, res: Response) => {
  const load = await prisma.load.findFirst({
    where: { id: req.params.id, carrierId: req.user!.id },
    select: { id: true },
  });
  if (!load) { res.status(404).json({ error: "Load not found" }); return; }

  const { startDriverVerification, DRIVER_SMS_CONSENT_TEXT } = await import("../services/driverVerificationService");
  const r = await startDriverVerification({
    loadId: load.id,
    phone: req.body.driverPhone,
    driverName: req.body.driverName,
  });
  if (!r.ok) { res.status(400).json({ error: r.reason }); return; }
  // The consent text goes out with the start response so the carrier's UI
  // shows the driver the exact words that will be stored against them.
  res.json({ ok: true, phone: r.phone, alreadyVerified: !!r.alreadyVerified, consentText: DRIVER_SMS_CONSENT_TEXT });
});

const driverVerifyConfirmSchema = z.object({
  code: z.string().min(4).max(10),
  consented: z.boolean(),
});

router.post("/:id/driver-verify/confirm", validateBody(driverVerifyConfirmSchema), async (req: AuthRequest, res: Response) => {
  const load = await prisma.load.findFirst({
    where: { id: req.params.id, carrierId: req.user!.id },
    select: { id: true },
  });
  if (!load) { res.status(404).json({ error: "Load not found" }); return; }

  const { confirmDriverVerification } = await import("../services/driverVerificationService");
  const r = await confirmDriverVerification({
    loadId: load.id,
    code: req.body.code,
    consented: req.body.consented === true,
  });
  if (!r.ok) { res.status(400).json({ error: r.reason }); return; }
  res.json({ ok: true, verifiedAt: r.verifiedAt });
});

// ─── GPS Location Update (Geofence Check) ───────────────────────────
// Carrier app sends periodic location pings; service auto-detects
// arrival/departure at stops and triggers status changes.
router.post("/gps-update", async (req: AuthRequest, res: Response) => {
  try {
    const { latitude, longitude } = req.body;
    if (!latitude || !longitude) {
      res.status(400).json({ error: "latitude and longitude required" });
      return;
    }
    const carrierId = req.user!.id;
    await processGpsUpdate(carrierId, Number(latitude), Number(longitude));
    res.json({ ok: true });
  } catch (err) {
    log.error({ err: err }, "[GPS] Update error:");
    res.status(500).json({ error: "Failed to process GPS update" });
  }
});

// ─── Carrier-side exception reporting ──────────────────────────────
// Mirrors AE-side /api/load-exceptions but scoped to the calling carrier.

const carrierExceptionSchema = z.object({
  category: z.string(),
  unitType: z.string().optional(),
  description: z.string().optional(),
  locationText: z.string().optional(),
  locationLat: z.number().optional(),
  locationLng: z.number().optional(),
});

router.post("/:id/exceptions", validateBody(carrierExceptionSchema), async (req: AuthRequest, res: Response) => {
  const load = await prisma.load.findUnique({ where: { id: req.params.id } });
  if (!load) { res.status(404).json({ error: "Load not found" }); return; }
  if (load.carrierId !== req.user!.id) { res.status(403).json({ error: "Not your load" }); return; }
  if (!(await checkCarrierNotSuspended(req, res))) return;

  const { category, unitType, description, locationText, locationLat, locationLng } = req.body;
  if (!isValidExceptionCode(category)) {
    res.status(400).json({ error: "Invalid exception category" });
    return;
  }
  const reason = getExceptionReason(category)!;

  const exception = await prisma.loadException.create({
    data: {
      loadId: load.id,
      category,
      unitType: unitType ?? reason.unitType,
      description: description ?? null,
      locationText: locationText ?? null,
      locationLat: locationLat ?? null,
      locationLng: locationLng ?? null,
      reportedById: req.user!.id,
      reportedByName: req.user!.email,
      reportedSource: "CARRIER_PORTAL",
    },
  });

  await logLoadActivity({
    loadId: load.id,
    eventType: "exception_logged",
    description: `Exception reported by carrier: ${reason.label}`,
    actorType: "CARRIER",
    actorId: req.user!.id,
    actorName: req.user!.email,
    metadata: { exceptionId: exception.id, category, source: "carrier_portal" },
  });
  broadcastSSE({ type: "alert", loadId: load.id, data: { kind: "exception", exceptionId: exception.id, category, label: reason.label } });

  if (load.posterId) {
    await prisma.notification.create({
      data: {
        userId: load.posterId,
        type: "LOAD",
        title: "Exception reported",
        message: `Carrier reported ${reason.label} on load ${load.referenceNumber}`,
        actionUrl: "/dashboard/track-trace",
      },
    });
  }

  res.status(201).json({ exception });
});

// POST /:id/exceptions/:excId/receipt — upload repair receipt for a specific exception
router.post("/:id/exceptions/:excId/receipt", uploadLimiter, upload.single("file"), async (req: AuthRequest, res: Response) => {
  const load = await prisma.load.findUnique({ where: { id: req.params.id } });
  if (!load) { res.status(404).json({ error: "Load not found" }); return; }
  if (load.carrierId !== req.user!.id) { res.status(403).json({ error: "Not your load" }); return; }
  if (!(await checkCarrierNotSuspended(req, res))) return;
  if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }

  const exc = await prisma.loadException.findUnique({ where: { id: req.params.excId } });
  if (!exc || exc.loadId !== load.id) { res.status(404).json({ error: "Exception not found" }); return; }

  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const ext = path.extname(req.file.originalname).toLowerCase();
  const key = `receipts/${uniqueSuffix}${ext}`;
  const fileUrl = await uploadFile(req.file.buffer, key, req.file.mimetype);

  const doc = await prisma.document.create({
    data: {
      loadId: load.id,
      docType: "RECEIPT_MECHANICAL",
      fileName: req.file.originalname,
      fileUrl,
      fileType: req.file.mimetype || "application/octet-stream",
      fileSize: req.file.size,
      entityType: "LOAD",
      entityId: load.id,
      userId: req.user!.id,
      uploadSource: "CARRIER_PORTAL",
      exceptionId: exc.id,
    },
  });

  await prisma.loadException.update({
    where: { id: exc.id },
    data: { receiptStatus: "UPLOADED" },
  });

  await logLoadActivity({
    loadId: load.id,
    eventType: "exception_receipt_uploaded",
    description: `Repair receipt uploaded by carrier`,
    actorType: "CARRIER",
    actorId: req.user!.id,
    actorName: req.user!.email,
    metadata: { exceptionId: exc.id, documentId: doc.id },
  });
  broadcastSSE({ type: "alert", loadId: load.id, data: { kind: "exception_receipt", exceptionId: exc.id } });

  res.status(201).json({ document: doc });
});

export default router;
