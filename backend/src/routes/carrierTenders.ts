import { Router, Response } from "express";
import { prisma } from "../config/database";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { log } from "../lib/logger";
import { mintOfferSignLink, RC_SIGN_LINK_MINTS_PER_HOUR } from "../services/rcSignLinkService";
import { rcPage } from "./rcSign";
import { extractClientIp } from "../services/geoService";
import { clientUserAgent } from "../lib/clientIp";

const router = Router();
router.use(authenticate);
router.use(authorize("CARRIER"));

/**
 * POST /api/carrier-tenders/:id/sign-link — Item 342 (v3.8.bop).
 *
 * The Tenders page's Accept for an offer issued with its rate confirmation.
 * Accepting is signing, so this mints the signing link and 303s to the
 * review-and-sign page. A form POST rather than XHR, as My Loads' "Sign it
 * here" is, so the browser follows the redirect to a page the API serves.
 */
router.post("/:id/sign-link", async (req: AuthRequest, res: Response) => {
  const out = await mintOfferSignLink({
    tenderId: req.params.id,
    carrierUserId: req.user!.id,
    channel: "portal",
    ip: extractClientIp(req as never),
    userAgent: clientUserAgent(req as never),
  });
  if (out.ok) { res.redirect(303, out.link.path); return; }
  const back = "https://silkroutelogistics.ai/carrier/dashboard/tenders";
  const copy: Record<string, [number, string, string]> = {
    NOT_YOUR_TENDER: [404, "Tender not found", "We could not find this offer on your account."],
    OFFER_NOT_OPEN: [409, "Offer no longer open", "This offer has expired or has already been answered, so there is nothing to sign."],
    NO_OFFER_RC: [409, "Nothing to sign yet", "This offer has no rate confirmation attached. Accept it from the Tenders page and your dispatcher will send one."],
    SIGN_LINK_RATE_LIMITED: [429, "Too many signing links", `A new signing link has been issued ${RC_SIGN_LINK_MINTS_PER_HOUR} times in the last hour for this offer. Try again in an hour, or use the most recent page you opened.`],
  };
  const [status, title, msg] = copy[out.code];
  res.status(status).type("html").send(rcPage({ title, body: `<h1>${title}</h1><p>${msg}</p><a class="cta" href="${back}">Back to Tenders</a>` }));
});

/**
 * GET /api/carrier-tenders/active
 * Returns all waterfall positions currently tendered to the authed
 * carrier (status=tendered, window not yet expired).
 */
router.get("/active", async (req: AuthRequest, res: Response) => {
  try {
    const profile = await prisma.carrierProfile.findUnique({
      where: { userId: req.user!.id },
      select: { id: true, userId: true },
    });
    if (!profile) return res.json({ tenders: [] });

    const now = new Date();
    const positions = await prisma.waterfallPosition.findMany({
      where: {
        carrierId: profile.userId,
        status: "tendered",
        tenderExpiresAt: { gt: now },
      },
      orderBy: { tenderExpiresAt: "asc" },
      include: {
        waterfall: {
          select: {
            id: true,
            loadId: true,
            load: {
              select: {
                id: true,
                loadNumber: true,
                referenceNumber: true,
                originCity: true,
                originState: true,
                destCity: true,
                destState: true,
                equipmentType: true,
                pickupDate: true,
                deliveryDate: true,
                distance: true,
                weight: true,
                commodity: true,
              },
            },
          },
        },
      },
    });

    const tenders = positions.map((p) => ({
      positionId: p.id,
      position: p.position,
      offeredRate: Number(p.offeredRate ?? 0),
      tenderExpiresAt: p.tenderExpiresAt,
      waterfallId: p.waterfall.id,
      load: p.waterfall.load,
    }));

    res.json({ tenders });
  } catch (err) {
    log.error({ err }, "[CarrierTenders] active error");
    res.status(500).json({ error: "Failed to fetch active tenders" });
  }
});

/**
 * GET /api/carrier-tenders/history
 *
 * Every tender this carrier has held, whatever became of it.
 *
 * The portal showed only LIVE offers, so a carrier could see what they were
 * being asked to take and nothing at all about what had happened to anything
 * else. That is the surface where the DECLINED/WITHDRAWN split actually pays: a
 * carrier who lost three races to faster carriers should be able to see three
 * loads marked covered, rather than three blanks and a suspicion.
 *
 * Scoped to the authed carrier's own profile id. Soft-deleted rows are excluded,
 * which is why the cancelled-load path soft-deletes — a load that no longer
 * exists is not history a carrier needs.
 */
router.get("/history", async (req: AuthRequest, res: Response) => {
  try {
    const profile = await prisma.carrierProfile.findUnique({
      where: { userId: req.user!.id },
      select: { id: true },
    });
    if (!profile) return res.json({ tenders: [] });

    const rows = await prisma.loadTender.findMany({
      where: { carrierId: profile.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        status: true,
        statusReason: true,
        declineReason: true,
        offeredRate: true,
        counterRate: true,
        createdAt: true,
        respondedAt: true,
        statusChangedAt: true,
        expiresAt: true,
        load: {
          select: {
            referenceNumber: true, loadNumber: true,
            originCity: true, originState: true,
            destCity: true, destState: true,
            equipmentType: true, pickupDate: true, distance: true,
          },
        },
      },
    });

    res.json({
      tenders: rows.map((t) => ({
        id: t.id,
        status: t.status,
        statusReason: t.statusReason,
        declineReason: t.declineReason,
        // The rate the carrier is actually being told about: their counter if
        // they made one, otherwise what was offered. Showing the offer beside a
        // countered tender would read as though SRL had ignored the counter.
        //
        // Named tenderRate, not rate. `Load.rate` is a write-only mirror under a
        // drop migration (§13.3 Item 227) and a bare `rate` beside it is exactly
        // the ambiguity that retirement exists to remove -- the frontend ratchet
        // guard flagged it, correctly, on the first run.
        tenderRate: t.counterRate ?? t.offeredRate,
        offeredRate: t.offeredRate,
        counterRate: t.counterRate,
        createdAt: t.createdAt,
        // When it last moved, falling back to when it was answered and then to
        // when it was created. A tender that never moved has no third date, and
        // a null there is more honest than today's timestamp.
        at: t.statusChangedAt ?? t.respondedAt ?? t.createdAt,
        expiresAt: t.expiresAt,
        load: t.load,
      })),
    });
  } catch (err) {
    log.error({ err }, "[CarrierTenders] history");
    res.status(500).json({ error: "Failed to load tender history" });
  }
});

export default router;
