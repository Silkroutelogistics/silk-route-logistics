import { Router, Response } from "express";
import {
  getAllCarriers, getCarrierDetail, registerCarrier, updateCarrier, verifyCarrier,
  getCarrierScore,
} from "../controllers/carrierController";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { validateBody, validateQuery } from "../middleware/validate";
import { carrierRegisterSchema, verifyCarrierSchema } from "../validators/carrier";
import { auditLog } from "../middleware/audit";
import { prisma } from "../config/database";
import { z } from "zod";

const router = Router();

const carrierQuerySchema = z.object({
  status: z.string().optional(),
  tier: z.string().optional(),
  region: z.string().optional(),
  search: z.string().optional(),
  include_deleted: z.string().optional(),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(50),
});

const updateCarrierSchema = z.object({
  safetyScore: z.number().min(0).max(100).optional(),
  tier: z.enum(["PLATINUM", "GOLD", "SILVER", "BRONZE", "NONE"]).optional(),
  status: z.enum(["NEW", "REVIEW", "APPROVED", "REJECTED", "SUSPENDED"]).optional(),
  insuranceExpiry: z.string().optional(),
  equipmentTypes: z.array(z.string()).optional(),
  operatingRegions: z.array(z.string()).optional(),
  numberOfTrucks: z.number().int().positive().optional(),
  numberOfDrivers: z.number().int().positive().optional(),
  notes: z.string().optional(),
});

// Public: carrier self-registration
router.post("/", validateBody(carrierRegisterSchema), registerCarrier);

// All routes below require auth
router.use(authenticate);

// Employee-facing list & detail
router.get("/", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS"), validateQuery(carrierQuerySchema), getAllCarriers);
router.get("/:id", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS"), getCarrierDetail);
router.get("/:id/score", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS"), getCarrierScore);
router.put("/:id", authorize("ADMIN", "CEO"), validateBody(updateCarrierSchema), auditLog("UPDATE", "Carrier"), updateCarrier);

// Admin verification
router.post("/:id/verify", authorize("ADMIN", "CEO"), validateBody(verifyCarrierSchema), auditLog("VERIFY", "Carrier"), verifyCarrier);

// DELETE /api/carriers/:id — Soft delete carrier profile
router.delete("/:id", authorize("ADMIN", "CEO"), async (req: AuthRequest, res: Response) => {
  const carrier = await prisma.carrierProfile.findUnique({ where: { id: req.params.id } });
  if (!carrier || carrier.deletedAt) {
    res.status(404).json({ error: "Carrier not found" });
    return;
  }
  await prisma.carrierProfile.update({
    where: { id: carrier.id },
    data: { deletedAt: new Date(), deletedBy: req.user!.email || req.user!.id },
  });
  res.json({ success: true, message: "Carrier archived" });
});

// PUT /api/carriers/:id/restore
router.put("/:id/restore", authorize("ADMIN", "CEO"), async (req: AuthRequest, res: Response) => {
  const carrier = await prisma.carrierProfile.findUnique({ where: { id: req.params.id } });
  if (!carrier || !carrier.deletedAt) {
    res.status(404).json({ error: "Archived carrier not found" });
    return;
  }
  await prisma.carrierProfile.update({
    where: { id: carrier.id },
    data: { deletedAt: null, deletedBy: null },
  });
  res.json({ success: true, message: "Carrier restored" });
});

export default router;
