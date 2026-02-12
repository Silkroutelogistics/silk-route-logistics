import { Router, Response } from "express";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { matchCarriersForLoad, trackMatchAssignment } from "../services/smartMatchService";
import { createCheckCallSchedule } from "../services/checkCallAutomation";
import { calculateLoadRisk } from "../services/riskEngine";
import { executeFallOffRecovery, handleFallOffAcceptance } from "../services/fallOffRecovery";
import {
  startSequence,
  stopSequence,
  getActiveSequences,
} from "../services/emailSequenceService";
import { prisma } from "../config/database";

const router = Router();
router.use(authenticate);

// ──── C.1: Smart Carrier Matching ────

// POST /api/automation/match-carriers/:loadId
router.post(
  "/match-carriers/:loadId",
  authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS"),
  async (req: AuthRequest, res: Response) => {
    try {
      const result = await matchCarriersForLoad(req.params.loadId);
      res.json(result);
    } catch (err: any) {
      res.status(err.message === "Load not found" ? 404 : 500).json({ error: err.message });
    }
  },
);

// POST /api/automation/assign-match/:loadId — Assign a matched carrier and track
router.post(
  "/assign-match/:loadId",
  authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS"),
  async (req: AuthRequest, res: Response) => {
    const { userId, carrierId } = req.body;
    if (!userId) {
      res.status(400).json({ error: "userId required" });
      return;
    }

    try {
      // Track the assignment in match results
      await trackMatchAssignment(req.params.loadId, userId);

      // Assign carrier to load
      await prisma.load.update({
        where: { id: req.params.loadId },
        data: {
          carrierId: userId,
          status: "BOOKED",
          statusUpdatedAt: new Date(),
        },
      });

      // Auto-create check-call schedule
      await createCheckCallSchedule(req.params.loadId);

      res.json({ success: true, message: "Carrier assigned and check-calls scheduled" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ──── C.2: Check-Call Schedule ────

// GET /api/automation/check-call-schedule/:loadId
router.get(
  "/check-call-schedule/:loadId",
  authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS"),
  async (req: AuthRequest, res: Response) => {
    const schedules = await prisma.checkCallSchedule.findMany({
      where: { loadId: req.params.loadId },
      orderBy: { scheduledTime: "asc" },
    });
    res.json({ schedules });
  },
);

// POST /api/automation/check-call-schedule/:loadId — Create schedule manually
router.post(
  "/check-call-schedule/:loadId",
  authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS"),
  async (req: AuthRequest, res: Response) => {
    try {
      await createCheckCallSchedule(req.params.loadId);
      const schedules = await prisma.checkCallSchedule.findMany({
        where: { loadId: req.params.loadId },
        orderBy: { scheduledTime: "asc" },
      });
      res.json({ success: true, schedules });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ──── C.3: Risk Engine ────

// GET /api/automation/risk-score/:loadId
router.get(
  "/risk-score/:loadId",
  authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS"),
  async (req: AuthRequest, res: Response) => {
    try {
      const risk = await calculateLoadRisk(req.params.loadId);

      // Also return latest risk logs
      const logs = await prisma.riskLog.findMany({
        where: { loadId: req.params.loadId },
        orderBy: { createdAt: "desc" },
        take: 10,
      });

      res.json({ ...risk, recentLogs: logs });
    } catch (err: any) {
      res.status(err.message === "Load not found" ? 404 : 500).json({ error: err.message });
    }
  },
);

// ──── C.4: Fall-Off Recovery ────

// POST /api/automation/fall-off-recovery/:loadId
router.post(
  "/fall-off-recovery/:loadId",
  authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS"),
  async (req: AuthRequest, res: Response) => {
    try {
      const result = await executeFallOffRecovery(req.params.loadId, req.body.reason);
      res.json(result);
    } catch (err: any) {
      res.status(err.message === "Load not found" ? 404 : 500).json({ error: err.message });
    }
  },
);

// POST /api/automation/fall-off-accept/:loadId
router.post(
  "/fall-off-accept/:loadId",
  authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS", "CARRIER"),
  async (req: AuthRequest, res: Response) => {
    const carrierUserId = req.body.carrierUserId || req.user!.id;
    try {
      const result = await handleFallOffAcceptance(req.params.loadId, carrierUserId);
      if (!result) {
        res.status(404).json({ error: "No active fall-off event for this load" });
        return;
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// GET /api/automation/fall-off-events — List fall-off events
router.get(
  "/fall-off-events",
  authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS"),
  async (req: AuthRequest, res: Response) => {
    const status = req.query.status as string | undefined;
    const where: any = {};
    if (status) where.status = status;

    const events = await prisma.fallOffEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        load: { select: { referenceNumber: true, originCity: true, originState: true, destCity: true, destState: true } },
      },
    });
    res.json({ events });
  },
);

// ──── C.5: Email Sequences ────

// POST /api/automation/sequences/start
router.post(
  "/sequences/start",
  authorize("ADMIN", "CEO", "BROKER"),
  async (req: AuthRequest, res: Response) => {
    const { prospectId, customSchedule } = req.body;
    if (!prospectId) {
      res.status(400).json({ error: "prospectId required" });
      return;
    }
    try {
      const sequence = await startSequence(prospectId, req.user!.id, customSchedule);
      res.status(201).json(sequence);
    } catch (err: any) {
      const status = err.message.includes("not found") ? 404
        : err.message.includes("already exists") ? 409
        : 500;
      res.status(status).json({ error: err.message });
    }
  },
);

// DELETE /api/automation/sequences/:id
router.delete(
  "/sequences/:id",
  authorize("ADMIN", "CEO", "BROKER"),
  async (req: AuthRequest, res: Response) => {
    try {
      const sequence = await stopSequence(req.params.id, req.body.reason || "MANUAL");
      res.json(sequence);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// GET /api/automation/sequences/active
router.get(
  "/sequences/active",
  authorize("ADMIN", "CEO", "BROKER"),
  async (req: AuthRequest, res: Response) => {
    const sequences = await getActiveSequences();
    res.json({ sequences });
  },
);

// GET /api/automation/sequences — All sequences with pagination
router.get(
  "/sequences",
  authorize("ADMIN", "CEO", "BROKER"),
  async (req: AuthRequest, res: Response) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const status = req.query.status as string | undefined;

    const where: any = {};
    if (status) where.status = status;

    const [sequences, total] = await Promise.all([
      prisma.emailSequence.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.emailSequence.count({ where }),
    ]);

    res.json({ sequences, total, totalPages: Math.ceil(total / limit) });
  },
);

// ──── Dashboard summary (all Phase C data) ────

// GET /api/automation/summary — Phase C automation stats
router.get(
  "/summary",
  authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS"),
  async (req: AuthRequest, res: Response) => {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      activeSequences,
      pendingCheckCalls,
      missedCheckCalls,
      activeFallOffs,
      recoveredFallOffs,
      redRiskCount,
      amberRiskCount,
      recentMatches,
    ] = await Promise.all([
      prisma.emailSequence.count({ where: { status: "ACTIVE" } }),
      prisma.checkCallSchedule.count({ where: { status: "PENDING" } }),
      prisma.checkCallSchedule.count({ where: { status: { in: ["MISSED", "ESCALATED"] } } }),
      prisma.fallOffEvent.count({ where: { status: "ACTIVE" } }),
      prisma.fallOffEvent.count({ where: { status: "RECOVERED" } }),
      prisma.riskLog.count({ where: { level: "RED", createdAt: { gte: twentyFourHoursAgo } } }),
      prisma.riskLog.count({ where: { level: "AMBER", createdAt: { gte: twentyFourHoursAgo } } }),
      prisma.matchResult.count({ where: { createdAt: { gte: twentyFourHoursAgo } } }),
    ]);

    res.json({
      sequences: { active: activeSequences },
      checkCalls: { pending: pendingCheckCalls, missed: missedCheckCalls },
      fallOff: { active: activeFallOffs, recovered: recoveredFallOffs },
      risk: { red: redRiskCount, amber: amberRiskCount },
      matching: { recentMatches },
    });
  },
);

export default router;
