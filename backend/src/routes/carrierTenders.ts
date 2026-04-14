import { Router, Response } from "express";
import { prisma } from "../config/database";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { log } from "../lib/logger";

const router = Router();
router.use(authenticate);
router.use(authorize("CARRIER"));

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

export default router;
