import { buildInfo } from "../lib/buildInfo";
import { schemaInfo } from "../lib/schemaInfo";
import { statusMachineCounters } from "../lib/loadTransitionObserver";
import { storageStatus } from "../services/storageService";
import { parserStatus } from "../services/coiReaderService";
import { requireTotpEnrolled } from "../middleware/requireTotpEnrolled";
import { makeAllowPublicCarrierAuth } from "../middleware/allowPublicCarrierAuth";
import { Router, Response } from "express";
import { prisma } from "../config/database";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import authRoutes from "./auth";
import ssoAuthRoutes from "./ssoAuth";
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
import equipmentRoutes from "./equipment";
import sopRoutes from "./sops";
import accountingRoutes from "./accounting";
import pdfRoutes from "./pdf";
import marketRoutes from "./market";
import ediRoutes from "./edi";
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
import infoRequestRoutes from "./infoRequests";
import shipperRoutes from "./shippers";
import communicationRoutes from "./communications";
import webhookRoutes from "./webhooks";
import webhookSubscriptionRoutes from "./webhookSubscriptions";
import emailRoutes from "./email";
import carrierAuthRoutes from "./carrierAuth";
import carrierLoadRoutes from "./carrierLoads";
import cppRoutes from "./cpp";
import carrierComplianceRoutes from "./carrierCompliance";
import carrierPaymentRoutes from "./carrierPayments";
import carrierDriversRoutes from "./carrierDrivers";
import driverAuthRoutes from "./driverAuth";
import driverTrainingRoutes from "./driverTraining";
import trainingAdminRoutes from "./trainingAdmin";
import datRoutes from "./dat";
import automationRoutes from "./automation";
import trackingRoutes from "./tracking";
import verifyRoutes from "./verify";
import verifyCertRoutes from "./verifyCert";
import financialRoutes from "./financials";
import claimRoutes from "./claims";
import monitoringRoutes from "./monitoring";
import adminManagementRoutes from "./admin";
import mileageRoutes from "./mileage";
import websiteRoutes from "./website";
import analyticsRoutes from "./analytics";
import aiRoutes from "./ai";
import blogRoutes from "./blog";
import shipperPortalRoutes from "./shipperPortal";
import delayRoutes from "./delays";
import loadTrackingRoutes from "./loadTracking";
import loadStopRoutes from "./loadStops";
import loadAccessorialRoutes from "./loadAccessorials";
import trackTraceBoardRoutes from "./trackTraceBoard";
import trackTraceSSERoutes from "./trackTraceSSE";
import loadExceptionsRoutes from "./loadExceptions";
import waterfallRoutes from "./waterfalls";
import loadBidsRoutes from "./loadBids";
import carrierTendersRoutes from "./carrierTenders";
import crmCustomerRoutes from "./crmCustomer";
import ordersRoutes from "./orders";
import quoteApproveRoutes from "./quoteApprove"; // v3.8.akn Item 180.4 — PUBLIC magic-link approval endpoint
import tenderActionRoutes from "./tenderAction"; // v3.8.als Item 142 — PUBLIC magic-link tender accept/decline endpoint
import rcSignRoutes from "./rcSign"; // v3.8 commit 11c — PUBLIC rate-confirmation e-signature (the single-use token IS the auth)
import externalIntegrations from "./externalIntegrations";
import contractRateRoutes from "./contractRates";
import rfpRoutes from "./rfp";
import routingGuideRoutes from "./routingGuide";
import exceptionConfigRoutes from "./exceptionConfig";
import dockScheduleRoutes from "./dockSchedule";
import carrierCallLogRoutes from "./carrierCallLog";
import fuelSurchargeTableRoutes from "./fuelSurchargeTable";
import tagRoutes from "./tags";
import shipperDefaultsRoutes from "./shipperDefaults";
import openPhoneRoutes from "./openPhone";
import driverPingRoutes from "./driverPing";
import publicAssetRoutes from "./publicAssets";
import sequenceRoutes from "./sequences";
import emailTrackingRoutes from "./emailTracking";

const router = Router();

// --- Health & Monitoring (before any auth-guarded routes) ---
router.get("/health", async (_req, res) => {
  // sha + bootedAt turn deploy verification from "correlate uptime against the
  // push time and hope" into a value you read. See lib/buildInfo.
  //
  // v3.8.atk — `schema` answers the other half. The SHA says what CODE is
  // running; a migration applies during the BUILD, while the previous process is
  // still serving, so the SHA can report the old commit when the database has
  // already changed. That is precisely how a column drop looked un-deployed on
  // 2026-08-20 (§13.3 Item 212). See lib/schemaInfo.
  //
  // THIS is the endpoint that matters for that: /api/health. The internal
  // /health in server.ts is a separate handler, and adding the field only there
  // — which is what v3.8.atj did — left the blindness exactly where it was.
  // v3.8.avo — storage and parser answer the third blindness.
  //
  // The SHA says what code is running; `schema` says what the database is. Both
  // were added after a deploy looked fine while something underneath was not.
  // These two say whether the platform can KEEP and READ what a carrier hands
  // it — and until 2026-08-30 the answer was no, silently: the production
  // documents table held zero rows because storage refuses uploads when it is
  // unconfigured, and nothing surfaced that (§13.3 Item 248).
  //
  // Both are READ from the services' own checks — storageStatus() returns the
  // same `useS3` const the upload path branches on, parserStatus() reads the
  // same env name extractCOIData reads. A second copy of "is this configured"
  // is a second answer, and the one health reports would be the untested one.
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    ...buildInfo(),
    schema: await schemaInfo(),
    storage: storageStatus(),
    parser: parserStatus(),
  });
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
    res.status(500).json({ status: "error", error: process.env.NODE_ENV !== "production" ? String(err) : "Internal server error" });
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
    res.status(500).json({ error: process.env.NODE_ENV !== "production" ? String(err) : "Internal server error" });
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
    res.status(500).json({ error: process.env.NODE_ENV !== "production" ? String(err) : "Internal server error" });
  }
});

// --- API Documentation ---
import apiDocsRoutes from "./apiDocs";
router.use("/docs", apiDocsRoutes);

// --- Public Routes (no auth) ---
router.use("/tracking", trackingRoutes);
router.use("/verify", verifyRoutes); // Sprint 51 Item 129 — RC anti-fraud verification
router.use("/verify-cert", verifyCertRoutes); // v3.8.aob Sprint E1 — Driver Academy cert verifier
router.use("/blog", blogRoutes);
router.use("/webhooks", webhookRoutes);
router.use("/webhook-subscriptions", webhookSubscriptionRoutes);
router.use("/email-tracking", emailTrackingRoutes); // Resend webhook (public)
router.use("/quote-approve", quoteApproveRoutes); // v3.8.akn Item 180.4 — magic-link approval (public; JWT IS the auth)
router.use("/tender-action", tenderActionRoutes); // v3.8.als Item 142 — magic-link tender accept/decline (public; JWT IS the auth)
router.use("/rc-sign", rcSignRoutes); // v3.8 commit 11c — rate-confirmation e-signature (public; the single-use token IS the auth)
router.use("/ping", driverPingRoutes); // ARC 19 — driver location ping (public; the load-scoped token IS the auth)
router.use("/public-assets", publicAssetRoutes); // brand CSS + the ping script, served from 'self' so the CSP can load them
router.use("/", websiteRoutes);

// --- API Routes ---
router.use("/auth/sso", ssoAuthRoutes); // v3.8 SSO — before /auth so the prefix is unambiguous; inherits authLimiter mounted on /api/auth
router.use("/auth", authRoutes);
router.use("/chat", chatRoutes);
router.use("/loads", loadRoutes);
router.use("/invoices", invoiceRoutes);
router.use("/documents", documentRoutes);
// Carrier-specific routes MUST come before /carrier to avoid prefix matching
// Arc 11 — mandatory carrier 2FA. Every carrier-portal mount passes through the
// enrollment gate; carrier-auth included, because its own exemption list is what
// keeps /totp/setup, /totp/confirm, /me and /logout reachable to a carrier who
// has not enrolled yet. A gate that blocks the route which satisfies the gate is
// a lockout, and that is the failure this whole ordering exists to avoid.
// ARC 15 — `authenticate` is listed here DELIBERATELY, and the gate does not
// work without it.
//
// requireTotpEnrolled short-circuits on `!req.user` (middleware/auth is what
// populates it). Every carrier router calls `router.use(authenticate)`
// INTERNALLY, which runs AFTER this mount's middleware chain — so when the
// gate ran, req.user was undefined and it called next() for everyone. The
// wall was mounted on all six routers and gated exactly one of them:
// /carrier-tenders, and only by accident, because an earlier mount at "/"
// had already populated req.user as a side effect.
//
// The mount-parity test that was supposed to protect this asserted the STRING
// "requireTotpEnrolled" appeared on each mount line. It did. Presence is not
// function, and removing the string to "adversarially verify" that guard could
// never have surfaced this. §19 Sub-pattern 16.
//
// authenticate is idempotent — running it here and again inside the router
// re-reads the same cookie and re-populates the same req.user.
//
// ═══ ARC 27 — AND THAT CHANGE LOCKED THE FRONT DOOR ═══════════════════════
//
// Adding `authenticate` here was right for the gate and wrong for /carrier-auth
// specifically, because that router is the ONLY carrier mount holding routes
// that must work with NO session. From atu until this fix, production answered
// every one of them with 401 "No token provided":
//
//     POST /login          — you cannot log in if logging in requires a login
//     POST /verify-otp     — step 2 of that same login
//     POST /totp-verify    — step 3 of that same login
//     POST /resend-otp     — the recovery path for step 2
//     POST /verify-email   — clicked from an email by someone with no session
//     GET  /agreement/:type— the PUBLIC onboarding click-through reads this
//
// No carrier could sign in, and no prospect could finish registering. It ran
// for roughly 27 hours. The other four mounts below are untouched by this fix
// because every route under them is meant to be authenticated; carrier-auth is
// the exception, and being the exception is exactly what made it invisible.
//
// Arc 15's guard could not have caught it. It asserted the STRING
// "authenticate" appeared on each mount line — and the string being present is
// what broke login. That is §19 Sub-pattern 16 pointing the other way: the
// guard proved the wall was mounted, and could not see that the wall now
// blocked the door people come in through. The replacement guard
// (__tests__/unit/routes/carrierAuthPublicRoutes.test.ts) sends real requests
// through this real chain instead of reading this file.
//
// The allowlist is METHOD-AWARE on purpose: only POST /login is public, not
// GET /login. And /agreement/:type ends in `$` so it cannot match
// /agreement/:type/pdf, which is carrier-only.
const allowPublicCarrierAuth = makeAllowPublicCarrierAuth(carrierAuthRoutes);
router.use("/carrier-auth", allowPublicCarrierAuth, authenticate, requireTotpEnrolled, carrierAuthRoutes);
router.use("/carrier-loads", authenticate, requireTotpEnrolled, carrierLoadRoutes);
router.use("/carrier-compliance", authenticate, requireTotpEnrolled, carrierComplianceRoutes);
router.use("/carrier-payments", authenticate, requireTotpEnrolled, carrierPaymentRoutes);
router.use("/carrier-drivers", authenticate, requireTotpEnrolled, carrierDriversRoutes);
// v3.8.amz — SRL Driver Academy T2: driver-portal auth (phone + PIN). Public
// set-pin/login + authenticated me/logout. Drivers are not Users; this mount
// uses authenticateDriver, not the shared authenticate.
router.use("/driver-auth", driverAuthRoutes);
// v3.8.anb — SRL Driver Academy T4: the training player API (course catalog,
// lesson progress, server-graded quiz). authenticateDriver, PUBLISHED-only.
router.use("/driver-training", driverTrainingRoutes);
// v3.8.ane — SRL Driver Academy T7: AE course-authoring API (course/lesson/
// question CRUD + transactional save + publish/archive). AE-cookie (authenticate),
// ADMIN/CEO writes; distinct from the driver-side /driver-training above.
router.use("/training-admin", trainingAdminRoutes);
router.use("/carrier-pay", carrierPayRoutes);
router.use("/carrier", carrierRoutes);
router.use("/dat", datRoutes);
router.use("/", tenderRoutes);
router.use("/messages", messageRoutes);
router.use("/notifications", notificationRoutes);
router.use("/integrations", integrationRoutes);
router.use("/shipments", shipmentRoutes);
router.use("/customers", crmCustomerRoutes); // CRM upgrade routes (tracking, facilities, notes, docs, activity)
router.use("/customers", customerRoutes);
// Arc 31 — /drivers (asset-era driver register) retired. SRL is a pure broker;
// drivers belong to carriers, and the carrier-scoped roster lives at
// /carrier-drivers with its own auth, its own schemas and the Academy built on
// it. The AE page this served is gone and the Driver MODEL stays, because the
// carrier portal owns rows in it.
router.use("/equipment", equipmentRoutes);
router.use("/sops", sopRoutes);
router.use("/accounting", accountingRoutes);
router.use("/pdf", pdfRoutes);
router.use("/market", marketRoutes);
router.use("/edi", ediRoutes);
router.use("/compliance", complianceRoutes);
router.use("/audit", auditRoutes);
router.use("/eld", eldRoutes);
router.use("/fmcsa", fmcsaRoutes);
router.use("/rate-confirmations", rateConfirmationRoutes);
router.use("/check-calls", checkCallRoutes);
router.use("/settlements", settlementRoutes);
router.use("/carriers", carriersRoutes);
router.use("/info-requests", infoRequestRoutes);
router.use("/shippers", shipperRoutes);
router.use("/communications", communicationRoutes);
router.use("/email", emailRoutes);
router.use("/cpp", cppRoutes);
router.use("/automation", automationRoutes);
router.use("/financials", financialRoutes);
router.use("/claims", claimRoutes);
router.use("/admin", monitoringRoutes);
router.use("/admin", adminManagementRoutes);
router.use("/mileage", mileageRoutes);
router.use("/analytics", analyticsRoutes);
router.use("/ai", aiRoutes);
router.use("/shipper-portal", shipperPortalRoutes);
router.use("/delays", delayRoutes);
router.use("/load-tracking", loadTrackingRoutes);
router.use("/load-stops", loadStopRoutes);
router.use("/load-accessorials", loadAccessorialRoutes);
router.use("/track-trace", trackTraceBoardRoutes);
router.use("/track-trace", trackTraceSSERoutes);
router.use("/load-exceptions", loadExceptionsRoutes);
router.use("/waterfalls", waterfallRoutes);
router.use("/carrier-tenders", authenticate, requireTotpEnrolled, carrierTendersRoutes);
router.use("/orders", ordersRoutes);
router.use("/", loadBidsRoutes); // /loadboard, /loads/:id/bids, /loads/:id/notes, /market-rates
router.use("/external-integrations", externalIntegrations);
router.use("/contract-rates", contractRateRoutes);
router.use("/rfps", rfpRoutes);
router.use("/routing-guides", routingGuideRoutes);
router.use("/exceptions", exceptionConfigRoutes);
router.use("/dock-schedules", dockScheduleRoutes);
router.use("/carrier-calls", carrierCallLogRoutes);
router.use("/fuel-tables", fuelSurchargeTableRoutes);
router.use("/tags", tagRoutes);
router.use("/shipper-defaults", shipperDefaultsRoutes);
router.use("/openphone", openPhoneRoutes);
router.use("/sequences", sequenceRoutes);
router.use("/email-tracking", emailTrackingRoutes);

export default router;
