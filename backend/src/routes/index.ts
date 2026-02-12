import { Router, Response } from "express";
import { prisma } from "../config/database";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import authRoutes from "./auth";
import loadRoutes from "./loads";
import invoiceRoutes from "./invoices";
import documentRoutes from "./documents";
import carrierRoutes from "./carrier";
import tenderRoutes from "./tenders";
import messageRoutes from "./messages";
import notificationRoutes from "./notifications";
import integrationRoutes from "./integrations";
import shipmentRoutes from "./shipments";
import customerRoutes from "./customers";
import driverRoutes from "./drivers";
import equipmentRoutes from "./equipment";
import sopRoutes from "./sops";
import accountingRoutes from "./accounting";
import pdfRoutes from "./pdf";
import marketRoutes from "./market";
import ediRoutes from "./edi";
import fleetRoutes from "./fleet";
import complianceRoutes from "./compliance";
import auditRoutes from "./audit";
import eldRoutes from "./eld";
import fmcsaRoutes from "./fmcsa";
import chatRoutes from "./chat";
import rateConfirmationRoutes from "./rateConfirmations";
import checkCallRoutes from "./checkCalls";
import carrierPayRoutes from "./carrierPay";
import settlementRoutes from "./settlements";
import carriersRoutes from "./carriers";
import shipperRoutes from "./shippers";
import communicationRoutes from "./communications";
import webhookRoutes from "./webhooks";
import emailRoutes from "./email";
import carrierAuthRoutes from "./carrierAuth";
import carrierLoadRoutes from "./carrierLoads";
import srcppRoutes from "./srcpp";
import carrierComplianceRoutes from "./carrierCompliance";
import carrierPaymentRoutes from "./carrierPayments";
import datRoutes from "./dat";
import carrierMatchRoutes from "./carrierMatch";
import automationRoutes from "./automation";

const router = Router();

// --- Health & Monitoring (before any auth-guarded routes) ---
router.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), timestamp: new Date().toISOString(), version: "1.0.0" });
});

router.get("/health/detailed", authenticate, authorize("ADMIN") as any, async (req: any, res: Response) => {
  try {
    const dbCheck = await prisma.$queryRaw`SELECT 1 as ok`.then(() => true).catch(() => false);
    const mem = process.memoryUsage();
    const [userCount, loadCount, invoiceCount] = await Promise.all([
      prisma.user.count(),
      prisma.load.count(),
      prisma.invoice.count(),
    ]);
    res.json({
      status: dbCheck ? "healthy" : "degraded",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      version: "1.0.0",
      node: process.version,
      environment: process.env.NODE_ENV || "development",
      database: { connected: dbCheck },
      memory: {
        rss: `${(mem.rss / 1024 / 1024).toFixed(1)} MB`,
        heapUsed: `${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB`,
        heapTotal: `${(mem.heapTotal / 1024 / 1024).toFixed(1)} MB`,
      },
      counts: { users: userCount, loads: loadCount, invoices: invoiceCount },
    });
  } catch (err) {
    res.status(500).json({ status: "error", error: String(err) });
  }
});

// --- System Logs (for admin monitoring) ---
router.get("/system-logs", authenticate, authorize("ADMIN") as any, async (req: any, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const type = req.query.type as string | undefined;
    const severity = req.query.severity as string | undefined;

    const where: any = {};
    if (type) where.logType = type;
    if (severity) where.severity = severity;

    const [logs, total] = await Promise.all([
      prisma.systemLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.systemLog.count({ where }),
    ]);
    res.json({ logs, total, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// --- Audit Trail (for admin monitoring) ---
router.get("/audit-trail", authenticate, authorize("ADMIN") as any, async (req: any, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 50);

    const [entries, total] = await Promise.all([
      prisma.auditTrail.findMany({
        orderBy: { performedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: { performedBy: { select: { firstName: true, lastName: true, email: true, role: true } } },
      }),
      prisma.auditTrail.count(),
    ]);
    res.json({ entries, total, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// --- API Routes ---
router.use("/auth", authRoutes);
router.use("/chat", chatRoutes);
router.use("/loads", loadRoutes);
router.use("/invoices", invoiceRoutes);
router.use("/documents", documentRoutes);
// Carrier-specific routes MUST come before /carrier to avoid prefix matching
router.use("/carrier-auth", carrierAuthRoutes);
router.use("/carrier-loads", carrierLoadRoutes);
router.use("/carrier-compliance", carrierComplianceRoutes);
router.use("/carrier-payments", carrierPaymentRoutes);
router.use("/carrier-match", carrierMatchRoutes);
router.use("/carrier-pay", carrierPayRoutes);
router.use("/carrier", carrierRoutes);
router.use("/dat", datRoutes);
router.use("/", tenderRoutes);
router.use("/messages", messageRoutes);
router.use("/notifications", notificationRoutes);
router.use("/integrations", integrationRoutes);
router.use("/shipments", shipmentRoutes);
router.use("/customers", customerRoutes);
router.use("/drivers", driverRoutes);
router.use("/equipment", equipmentRoutes);
router.use("/sops", sopRoutes);
router.use("/accounting", accountingRoutes);
router.use("/pdf", pdfRoutes);
router.use("/market", marketRoutes);
router.use("/edi", ediRoutes);
router.use("/fleet", fleetRoutes);
router.use("/compliance", complianceRoutes);
router.use("/audit", auditRoutes);
router.use("/eld", eldRoutes);
router.use("/fmcsa", fmcsaRoutes);
router.use("/rate-confirmations", rateConfirmationRoutes);
router.use("/check-calls", checkCallRoutes);
router.use("/settlements", settlementRoutes);
router.use("/carriers", carriersRoutes);
router.use("/shippers", shipperRoutes);
router.use("/communications", communicationRoutes);
router.use("/webhooks", webhookRoutes);
router.use("/email", emailRoutes);
router.use("/srcpp", srcppRoutes);
router.use("/automation", automationRoutes);

export default router;
