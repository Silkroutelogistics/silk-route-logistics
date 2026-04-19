import { Router, Response } from "express";
import { createLoad, getLoads, getLoadById, updateLoad, updateLoadStatus, deleteLoad, restoreLoad, carrierUpdateStatus, getDistance, getLoadAudit } from "../controllers/loadController";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { auditLog } from "../middleware/audit";
import { validateBody, validateQuery } from "../middleware/validate";
import { createLoadSchema, updateLoadStatusSchema, loadQuerySchema } from "../validators/load";
import { prisma } from "../config/database";
import { z } from "zod";

const updateLoadSchema = createLoadSchema.partial();

const router = Router();

router.use(authenticate);

// GET /api/loads/next-bol — preview the next sequential BOL number.
// Client uses this for UI display; server still generates the final
// BOL atomically on load create to avoid collisions.
router.get("/next-bol", async (_req: AuthRequest, res: Response) => {
  const latest = await prisma.load.findFirst({
    where: { bolNumber: { startsWith: "BOL-" } },
    orderBy: { createdAt: "desc" },
    select: { bolNumber: true },
  });
  let next = 100001;
  if (latest?.bolNumber) {
    const n = parseInt(latest.bolNumber.replace(/\D/g, ""), 10);
    if (!Number.isNaN(n)) next = n + 1;
  }
  res.json({ bolNumber: `BOL-${next}`, preview: true });
});

router.get("/distance", getDistance);
router.post("/", authorize("BROKER", "SHIPPER", "ADMIN", "CEO"), validateBody(createLoadSchema), auditLog("CREATE", "Load"), createLoad);
router.get("/", validateQuery(loadQuerySchema), getLoads);
router.get("/:id", getLoadById);
router.put("/:id", authorize("BROKER", "ADMIN", "CEO", "DISPATCH"), validateBody(updateLoadSchema), auditLog("UPDATE", "Load"), updateLoad);
router.patch("/:id/status", authorize("BROKER", "ADMIN", "CEO", "DISPATCH", "OPERATIONS"), validateBody(updateLoadStatusSchema), auditLog("UPDATE_STATUS", "Load"), updateLoadStatus);
router.patch("/:id/carrier-status", authorize("CARRIER"), validateBody(updateLoadStatusSchema), auditLog("UPDATE_STATUS", "Load"), carrierUpdateStatus);
router.delete("/:id", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS"), auditLog("DELETE", "Load"), deleteLoad);
router.put("/:id/restore", authorize("ADMIN", "BROKER", "DISPATCH", "OPERATIONS"), auditLog("UPDATE", "Load"), restoreLoad);

// Field-level audit trail
router.get("/:id/audit", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS"), getLoadAudit);

// Compass by SRL: load-level compliance check
import { runLoadComplianceCheck } from "../controllers/carrierVettingController";
router.post("/:loadId/compliance-check", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS"), runLoadComplianceCheck);

// Quick Pay tier default + per-load override (v3.7.a — Caravan Partner Program)
import { getTierDefaultRate, recordOverride, getOverride } from "../services/quickPayOverrideService";

// Returns the tier default QP rate for a carrier — used by AE Console load
// creation UI to pre-populate the rate field.
router.get("/quickpay/tier-default/:carrierUserId", authorize("BROKER", "ADMIN", "CEO", "DISPATCH"), async (req: AuthRequest, res: Response) => {
  const rate = await getTierDefaultRate(req.params.carrierUserId);
  res.json({ carrierUserId: req.params.carrierUserId, tierDefaultRate: rate });
});

// Creates or updates the per-load QP override audit row.
const overrideBodySchema = z.object({
  tierDefaultRate: z.number().min(0).max(0.2),
  appliedRate: z.number().min(0).max(0.2),
  reason: z.enum(["COMPETITIVE_MATCH", "VOLUME_BONUS", "STRATEGIC_LANE", "OTHER"]).optional(),
  reasonNote: z.string().max(500).optional(),
});
router.post("/:id/quickpay-override", authorize("BROKER", "ADMIN", "CEO"), validateBody(overrideBodySchema), auditLog("CREATE", "LoadQuickPayOverride"), async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body as z.infer<typeof overrideBodySchema>;
    const result = await recordOverride({
      loadId: req.params.id,
      tierDefaultRate: body.tierDefaultRate,
      appliedRate: body.appliedRate,
      reason: body.reason,
      reasonNote: body.reasonNote,
      overriddenBy: req.user!.id,
    });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || "Override failed" });
  }
});

router.get("/:id/quickpay-override", authorize("BROKER", "ADMIN", "CEO", "DISPATCH"), async (req: AuthRequest, res: Response) => {
  const row = await getOverride(req.params.id);
  res.json({ override: row });
});

export default router;
