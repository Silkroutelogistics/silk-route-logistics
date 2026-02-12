import { Router, Response } from "express";
import { prisma } from "../config/database";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { env } from "../config/env";
import { z } from "zod";
import { validateBody } from "../middleware/validate";

const router = Router();

router.use(authenticate);
router.use(authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS", "AE"));

const isDATConfigured = () => !!(env.DAT_API_KEY && env.DAT_API_SECRET);

// POST /api/dat/post-load — Quick post a load to DAT
router.post("/post-load", async (req: AuthRequest, res: Response) => {
  const { loadId } = req.body;
  if (!loadId) {
    res.status(400).json({ error: "loadId required" });
    return;
  }

  const load = await prisma.load.findUnique({ where: { id: loadId } });
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }

  if (isDATConfigured()) {
    // Real DAT API integration
    try {
      const datRes = await fetch(`${env.DAT_API_URL}/postings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.DAT_API_KEY}`,
        },
        body: JSON.stringify({
          origin: { city: load.originCity, state: load.originState, zip: load.originZip },
          destination: { city: load.destCity, state: load.destState, zip: load.destZip },
          equipment: load.equipmentType,
          rate: load.carrierRate || load.rate,
          weight: load.weight,
          pickupDate: load.pickupDate,
          deliveryDate: load.deliveryDate,
          commodity: load.commodity,
          reference: load.referenceNumber,
        }),
      });
      const datData = await datRes.json() as Record<string, unknown>;
      const datPostId = (datData as any).postingId || (datData as any).id || `DAT-${Date.now()}`;

      await prisma.load.update({
        where: { id: load.id },
        data: { datPostId: String(datPostId), datPostedAt: new Date() },
      });

      res.status(201).json({ success: true, datPostId, message: "Posted to DAT" });
    } catch (err) {
      res.status(500).json({ error: "DAT API error: " + (err instanceof Error ? err.message : "Unknown") });
    }
  } else {
    // Mock mode
    console.log("[DAT] API not configured - using mock data for post-load");
    const mockDatPostId = `DAT-MOCK-${Date.now()}`;

    await prisma.load.update({
      where: { id: load.id },
      data: { datPostId: mockDatPostId, datPostedAt: new Date() },
    });

    res.status(201).json({
      success: true,
      datPostId: mockDatPostId,
      message: "Posted to DAT (mock mode)",
      mock: true,
    });
  }
});

// POST /api/dat/post-load-advanced — Post with custom overrides
const advancedPostSchema = z.object({
  loadId: z.string(),
  originCity: z.string().optional(),
  originState: z.string().optional(),
  originZip: z.string().optional(),
  destCity: z.string().optional(),
  destState: z.string().optional(),
  destZip: z.string().optional(),
  equipmentType: z.string().optional(),
  trailerLength: z.string().optional(),
  weight: z.number().optional(),
  rate: z.number().optional(),
  pickupDate: z.string().optional(),
  deliveryDate: z.string().optional(),
  loadType: z.string().optional(),
  comments: z.string().optional(),
});

router.post("/post-load-advanced", validateBody(advancedPostSchema), async (req: AuthRequest, res: Response) => {
  const data = req.body;
  const load = await prisma.load.findUnique({ where: { id: data.loadId } });
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }

  const postData = {
    origin: {
      city: data.originCity || load.originCity,
      state: data.originState || load.originState,
      zip: data.originZip || load.originZip,
    },
    destination: {
      city: data.destCity || load.destCity,
      state: data.destState || load.destState,
      zip: data.destZip || load.destZip,
    },
    equipment: data.equipmentType || load.equipmentType,
    trailerLength: data.trailerLength || load.trailerLength,
    weight: data.weight || load.weight,
    rate: data.rate || load.carrierRate || load.rate,
    pickupDate: data.pickupDate || load.pickupDate,
    deliveryDate: data.deliveryDate || load.deliveryDate,
    loadType: data.loadType || "FULL",
    comments: data.comments || "",
    reference: load.referenceNumber,
  };

  if (isDATConfigured()) {
    try {
      const datRes = await fetch(`${env.DAT_API_URL}/postings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.DAT_API_KEY}`,
        },
        body: JSON.stringify(postData),
      });
      const datData = await datRes.json() as Record<string, unknown>;
      const datPostId = (datData as any).postingId || (datData as any).id || `DAT-${Date.now()}`;

      await prisma.load.update({
        where: { id: load.id },
        data: { datPostId: String(datPostId), datPostedAt: new Date(), datPostedFields: postData as any },
      });

      res.status(201).json({ success: true, datPostId, message: "Posted to DAT (advanced)" });
    } catch (err) {
      res.status(500).json({ error: "DAT API error: " + (err instanceof Error ? err.message : "Unknown") });
    }
  } else {
    console.log("[DAT] API not configured - using mock data for advanced post");
    const mockDatPostId = `DAT-MOCK-${Date.now()}`;

    await prisma.load.update({
      where: { id: load.id },
      data: { datPostId: mockDatPostId, datPostedAt: new Date(), datPostedFields: postData as any },
    });

    res.status(201).json({
      success: true,
      datPostId: mockDatPostId,
      message: "Posted to DAT (mock mode, advanced)",
      mock: true,
    });
  }
});

// DELETE /api/dat/remove-post/:datPostId — Remove DAT listing
router.delete("/remove-post/:datPostId", async (req: AuthRequest, res: Response) => {
  const { datPostId } = req.params;

  if (isDATConfigured()) {
    try {
      await fetch(`${env.DAT_API_URL}/postings/${datPostId}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${env.DAT_API_KEY}` },
      });
    } catch (err) {
      console.error("[DAT] Failed to remove post:", err);
    }
  } else {
    console.log("[DAT] Mock: removed post", datPostId);
  }

  // Clear from load record
  const load = await prisma.load.findFirst({ where: { datPostId } });
  if (load) {
    await prisma.load.update({
      where: { id: load.id },
      data: { datPostId: null, datPostedAt: null, datPostedFields: undefined },
    });
  }

  res.json({ success: true, message: "DAT post removed" });
});

// GET /api/dat/responses/:loadId — Get DAT carrier responses for a load
router.get("/responses/:loadId", async (req: AuthRequest, res: Response) => {
  const load = await prisma.load.findUnique({ where: { id: req.params.loadId } });
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }

  if (!load.datPostId) {
    res.json({ responses: [], message: "Load not posted to DAT" });
    return;
  }

  if (isDATConfigured()) {
    try {
      const datRes = await fetch(`${env.DAT_API_URL}/postings/${load.datPostId}/responses`, {
        headers: { "Authorization": `Bearer ${env.DAT_API_KEY}` },
      });
      const datData = await datRes.json();
      res.json(datData);
    } catch (err) {
      res.status(500).json({ error: "DAT API error: " + (err instanceof Error ? err.message : "Unknown") });
    }
  } else {
    // Return mock responses
    console.log("[DAT] API not configured - returning mock responses");
    res.json({
      responses: [
        {
          id: "dat-resp-001",
          carrierName: "Midwest Express Freight",
          mcNumber: "MC-9887654",
          dotNumber: "4567890",
          equipment: load.equipmentType,
          offeredRate: (load.carrierRate || load.rate) * 0.95,
          phone: "(312) 555-0401",
          email: "dispatch@midwestexpress.com",
          driverAvailable: true,
          estimatedPickup: load.pickupDate,
          respondedAt: new Date(Date.now() - 30 * 60000).toISOString(),
        },
        {
          id: "dat-resp-002",
          carrierName: "Southern Haul Inc",
          mcNumber: "MC-7654321",
          dotNumber: "6789012",
          equipment: load.equipmentType,
          offeredRate: (load.carrierRate || load.rate) * 0.92,
          phone: "(404) 555-0502",
          email: "ops@southernhaul.com",
          driverAvailable: true,
          estimatedPickup: load.pickupDate,
          respondedAt: new Date(Date.now() - 15 * 60000).toISOString(),
        },
        {
          id: "dat-resp-003",
          carrierName: "Pacific Coast Carriers",
          mcNumber: "MC-5432198",
          dotNumber: "8901234",
          equipment: load.equipmentType,
          offeredRate: (load.carrierRate || load.rate) * 1.02,
          phone: "(503) 555-0603",
          email: "loads@pacificcoast.com",
          driverAvailable: false,
          estimatedPickup: new Date(new Date(load.pickupDate).getTime() + 86400000).toISOString(),
          respondedAt: new Date(Date.now() - 5 * 60000).toISOString(),
        },
      ],
      mock: true,
    });
  }
});

export default router;
