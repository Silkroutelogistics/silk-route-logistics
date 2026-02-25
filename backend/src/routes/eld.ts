import { Router, Response } from "express";
import { getHOSData, getDVIRs, getELDOverview, getDriverLocation, getAllLocations } from "../controllers/eldController";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { prisma } from "../config/database";
import { processSamsaraLocations } from "../services/samsaraService";
import { processMotiveLocations } from "../services/motiveService";

const router = Router();

router.use(authenticate);
router.use(authorize("ADMIN", "CEO", "DISPATCH", "OPERATIONS", "BROKER") as any);

router.get("/overview", getELDOverview);
router.get("/hos", getHOSData);
router.get("/dvir", getDVIRs);
router.get("/locations", getAllLocations);
router.get("/locations/:id", getDriverLocation);

// ─── ELD Device Mappings (Phase 5) ───

// GET /api/eld/devices — List all device mappings
router.get("/devices", async (_req: AuthRequest, res: Response) => {
  try {
    const devices = await prisma.eLDDeviceMapping.findMany({
      orderBy: { lastSeenAt: "desc" },
      include: { carrier: { select: { id: true, firstName: true, lastName: true, company: true } } },
    });
    res.json({ devices });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch device mappings" });
  }
});

// PUT /api/eld/devices/:id — Link a device to a carrier
router.put("/devices/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { carrierId, driverName, driverPhone } = req.body;

    const device = await prisma.eLDDeviceMapping.update({
      where: { id },
      data: {
        carrierId: carrierId || null,
        driverName: driverName || null,
        driverPhone: driverPhone || null,
      },
    });
    res.json({ device });
  } catch (err) {
    res.status(500).json({ error: "Failed to update device mapping" });
  }
});

// GET /api/eld/events — Recent ELD events
router.get("/events", async (req: AuthRequest, res: Response) => {
  try {
    const { provider, loadId, limit: limitStr } = req.query;
    const limit = Math.min(200, parseInt(limitStr as string) || 50);

    const where: any = {};
    if (provider) where.provider = provider;
    if (loadId) where.loadId = loadId;

    const events = await prisma.eLDEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { load: { select: { id: true, referenceNumber: true, loadNumber: true } } },
    });
    res.json({ events, total: events.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch ELD events" });
  }
});

// POST /api/eld/sync — Manual sync trigger
router.post("/sync", authorize("ADMIN") as any, async (_req: AuthRequest, res: Response) => {
  try {
    const [samsara, motive] = await Promise.allSettled([
      processSamsaraLocations(),
      processMotiveLocations(),
    ]);
    const sRes = samsara.status === "fulfilled" ? samsara.value : { processed: 0, matched: 0, error: (samsara as any).reason?.message };
    const mRes = motive.status === "fulfilled" ? motive.value : { processed: 0, matched: 0, error: (motive as any).reason?.message };

    res.json({
      samsara: sRes,
      motive: mRes,
      totalProcessed: (sRes.processed || 0) + (mRes.processed || 0),
      totalMatched: (sRes.matched || 0) + (mRes.matched || 0),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
