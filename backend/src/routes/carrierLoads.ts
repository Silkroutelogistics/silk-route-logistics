import { Router, Response } from "express";
import { prisma } from "../config/database";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { z } from "zod";
import { validateBody } from "../middleware/validate";
import multer from "multer";
import path from "path";
import { env } from "../config/env";

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, env.UPLOAD_DIR),
    filename: (_req, file, cb) => cb(null, Date.now() + "-" + file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")),
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});

const router = Router();

router.use(authenticate);
router.use(authorize("CARRIER"));

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

  res.json({ loads, total, page, totalPages: Math.ceil(total / limit) });
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
  if (status && status !== "ALL") {
    where.status = status;
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
      documents: { where: { docType: { in: ["RATE_CON", "BOL", "POD"] } } },
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

  const { driverName, driverPhone, truckNumber, trailerNumber } = req.body;

  const updated = await prisma.load.update({
    where: { id: load.id },
    data: {
      carrierId: req.user!.id,
      status: "BOOKED",
      driverName: driverName || null,
      driverPhone: driverPhone || null,
      truckNumber: truckNumber || null,
      trailerNumber: trailerNumber || null,
    },
  });

  // Create notification for the poster/broker
  if (load.posterId) {
    await prisma.notification.create({
      data: {
        userId: load.posterId,
        type: "LOAD",
        title: "Load Accepted",
        message: `Load ${load.referenceNumber} has been accepted by carrier.`,
        actionUrl: "/ae/loads.html?id=" + load.id,
      },
    });
  }

  // Update CPP stats
  await prisma.carrierProfile.update({
    where: { id: profile.id },
    data: {
      cppTotalLoads: { increment: 1 },
      cppTotalMiles: { increment: load.distance || 0 },
    },
  });

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
    await prisma.loadTender.update({
      where: { id: tender.id },
      data: { status: "DECLINED", respondedAt: new Date() },
    });
  }

  // Notify broker
  if (load.posterId) {
    await prisma.notification.create({
      data: {
        userId: load.posterId,
        type: "LOAD",
        title: "Load Declined",
        message: `A carrier declined load ${load.referenceNumber}.`,
        actionUrl: "/ae/loads.html?id=" + load.id,
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

  const { driverName, driverPhone, truckNumber, trailerNumber } = req.body;
  const data: Record<string, unknown> = {};
  if (driverName !== undefined) data.driverName = driverName;
  if (driverPhone !== undefined) data.driverPhone = driverPhone;
  if (truckNumber !== undefined) data.truckNumber = truckNumber;
  if (trailerNumber !== undefined) data.trailerNumber = trailerNumber;

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

  const { status, note } = req.body;
  const data: Record<string, unknown> = { status };

  if (status === "DELIVERED") {
    data.actualDeliveryDatetime = new Date();
  }
  if (status === "LOADED" || status === "IN_TRANSIT") {
    data.actualPickupDatetime = new Date();
  }

  const updated = await prisma.load.update({ where: { id: load.id }, data });

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

  // Notify broker
  if (load.posterId) {
    await prisma.notification.create({
      data: {
        userId: load.posterId,
        type: "LOAD",
        title: "Load Status Updated",
        message: `Load ${load.referenceNumber} status: ${status.replace(/_/g, " ")}`,
        actionUrl: "/ae/loads.html?id=" + load.id,
      },
    });
  }

  res.json(updated);
});

// POST /api/carrier-loads/:id/documents — Upload a document (BOL, POD, etc.)
router.post("/:id/documents", upload.single("file"), async (req: AuthRequest, res: Response) => {
  const load = await prisma.load.findUnique({ where: { id: req.params.id } });
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
  if (load.carrierId !== req.user!.id) {
    res.status(403).json({ error: "Not your load" });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const docType = (req.body.type || "OTHER").toUpperCase();
  const fileUrl = "/uploads/" + req.file.filename;

  const doc = await prisma.document.create({
    data: {
      loadId: load.id,
      docType,
      fileName: req.file.originalname,
      fileUrl,
      fileType: req.file.mimetype || "application/octet-stream",
      fileSize: req.file.size,
      entityType: "LOAD",
      entityId: load.id,
      userId: req.user!.id,
    },
  });

  // If it's a POD, update the load
  if (docType === "POD") {
    await prisma.load.update({
      where: { id: load.id },
      data: {
        podUrl: fileUrl,
        podReceivedAt: new Date(),
        status: load.status === "DELIVERED" ? "POD_RECEIVED" : load.status,
      },
    });

    // Notify broker
    if (load.posterId) {
      await prisma.notification.create({
        data: {
          userId: load.posterId,
          type: "LOAD",
          title: "POD Received",
          message: `POD uploaded for load ${load.referenceNumber}`,
          actionUrl: "/ae/loads.html?id=" + load.id,
        },
      });
    }
  }

  res.json(doc);
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

  // Notify broker
  if (load.posterId) {
    await prisma.notification.create({
      data: {
        userId: load.posterId,
        type: "LOAD",
        title: "Check Call Received",
        message: `Check call for ${load.referenceNumber}: ${location || "Location update"}${etaHours ? " — ETA " + etaHours + "h" : ""}`,
        actionUrl: "/ae/loads.html?id=" + load.id,
      },
    });
  }

  res.json(cc);
});

export default router;
