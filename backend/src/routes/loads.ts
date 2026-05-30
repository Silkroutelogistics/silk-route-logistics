import { Router, Response } from "express";
import { createLoad, getLoads, getLoadById, updateLoad, updateLoadStatus, deleteLoad, restoreLoad, getDistance, getLoadAudit } from "../controllers/loadController";
import { createLoadWithTender } from "../controllers/withTenderController";
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

// Sprint 59 (v3.8.acj) Item 176 — Carrier Engagement Drawer Mode 1
// atomic endpoint. Validation lives inside the controller (custom
// shape, not createLoadSchema). Auth gated to AE Console roles —
// SHIPPER cannot self-tender via this path (they use /shipper-portal).
router.post("/with-tender", authorize("BROKER", "ADMIN", "CEO", "DISPATCH", "OPERATIONS"), auditLog("CREATE", "Load"), createLoadWithTender);

router.post("/", authorize("BROKER", "SHIPPER", "ADMIN", "CEO"), validateBody(createLoadSchema), auditLog("CREATE", "Load"), createLoad);
router.get("/", validateQuery(loadQuerySchema), getLoads);
router.get("/:id", getLoadById);
router.put("/:id", authorize("BROKER", "ADMIN", "CEO", "DISPATCH"), validateBody(updateLoadSchema), auditLog("UPDATE", "Load"), updateLoad);
router.patch("/:id/status", authorize("BROKER", "ADMIN", "CEO", "DISPATCH", "OPERATIONS"), validateBody(updateLoadStatusSchema), auditLog("UPDATE_STATUS", "Load"), updateLoadStatus);
// v3.8.akc Item 158 — PATCH /:id/carrier-status DELETED. Was dead surface
// (no frontend caller despite the CarrierActions component referencing it —
// the conditional render gated on isCarrier(user?.role) AND CARRIER users
// route to /carrier/dashboard, not /dashboard/loads). Side effects
// (shipment sync + auto-invoice + shipper email cascade + onLoadDelivered)
// migrated into canonical POST /api/carrier-loads/:id/status.
// v3.8.ali §13.3 Item 192 — per-load risk-email kill switch. AE toggles
// the external risk-alert email on/off for a specific load they are
// actively handling. Email-only mute: the risk engine still writes
// RiskLog + still fires the in-app notification; only sendRiskAlertEmail
// is skipped when muted. Audit fields capture who/when. Same AE-role
// gate as the status + quickpay-override mutations.
router.patch(
  "/:id/risk-email-mute",
  authorize("BROKER", "ADMIN", "CEO", "DISPATCH", "OPERATIONS"),
  validateBody(z.object({ muted: z.boolean() })),
  auditLog("UPDATE", "Load"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { muted } = req.body as { muted: boolean };
      const existing = await prisma.load.findUnique({
        where: { id: req.params.id },
        select: { id: true },
      });
      if (!existing) {
        res.status(404).json({ error: "Load not found" });
        return;
      }
      const updated = await prisma.load.update({
        where: { id: req.params.id },
        data: {
          riskEmailMuted: muted,
          riskEmailMutedAt: muted ? new Date() : null,
          riskEmailMutedById: muted ? req.user!.id : null,
        },
        select: { id: true, riskEmailMuted: true, riskEmailMutedAt: true, riskEmailMutedById: true },
      });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to update risk-email mute" });
    }
  }
);

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
// creation UI to pre-populate the rate field. Sprint 51.c (Item 151): speed
// query param accepts "QP_7DAY" | "QP_SAMEDAY"; defaults to QP_7DAY when
// omitted for backwards-compat with any legacy caller.
router.get("/quickpay/tier-default/:carrierUserId", authorize("BROKER", "ADMIN", "CEO", "DISPATCH"), async (req: AuthRequest, res: Response) => {
  const speedParam = String(req.query.speed || "QP_7DAY");
  const speed: "QP_7DAY" | "QP_SAMEDAY" = speedParam === "QP_SAMEDAY" ? "QP_SAMEDAY" : "QP_7DAY";
  const rate = await getTierDefaultRate(req.params.carrierUserId, speed);
  res.json({ carrierUserId: req.params.carrierUserId, speed, tierDefaultRate: rate });
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
