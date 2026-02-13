import { Router } from "express";
import {
  getAlerts,
  scanCompliance,
  dismissAlert,
  resolveAlert,
  getComplianceStats,
  getDashboard,
  getOverview,
  getCarrierDetail,
  snoozeAlert,
  sendReminder,
  runFmcsaCheck,
  overrideBlock,
  suspendCarrier,
  addNote,
  getNotes,
  exportCSV,
  getScanHistory,
  getLatestScan,
  checkCarrier,
} from "../controllers/complianceController";
import { authenticate, authorize } from "../middleware/auth";
import { auditLog } from "../middleware/audit";

const router = Router();

router.use(authenticate);

// Existing routes
router.get("/alerts", authorize("ADMIN", "OPERATIONS", "CEO"), getAlerts);
router.post("/scan", authorize("ADMIN", "OPERATIONS", "CEO"), auditLog("SCAN", "Compliance"), scanCompliance);
router.patch("/alerts/:id/dismiss", auditLog("DISMISS", "ComplianceAlert"), dismissAlert);
router.patch("/alerts/:id/resolve", auditLog("RESOLVE", "ComplianceAlert"), resolveAlert);
router.get("/stats", getComplianceStats);

// New Compliance Console routes
router.get("/dashboard", authorize("ADMIN", "OPERATIONS", "CEO", "BROKER", "DISPATCH"), getDashboard);
router.get("/overview", authorize("ADMIN", "OPERATIONS", "CEO", "BROKER", "DISPATCH"), getOverview);
router.get("/export", authorize("ADMIN", "OPERATIONS", "CEO"), exportCSV);
router.get("/scans/latest", authorize("ADMIN", "OPERATIONS", "CEO"), getLatestScan);
router.get("/scans/:carrierId", authorize("ADMIN", "OPERATIONS", "CEO"), getScanHistory);
router.get("/carrier/:carrierId/notes", authorize("ADMIN", "OPERATIONS", "CEO", "BROKER"), getNotes);
router.get("/carrier/:carrierId", authorize("ADMIN", "OPERATIONS", "CEO", "BROKER", "DISPATCH"), getCarrierDetail);
router.post("/alerts/:id/snooze", authorize("ADMIN", "OPERATIONS"), snoozeAlert);
router.post("/carrier/:carrierId/send-reminder", authorize("ADMIN", "OPERATIONS"), sendReminder);
router.post("/carrier/:carrierId/run-fmcsa-check", authorize("ADMIN", "OPERATIONS"), runFmcsaCheck);
router.post("/carrier/:carrierId/override-block", authorize("ADMIN"), overrideBlock);
router.post("/carrier/:carrierId/suspend", authorize("ADMIN"), suspendCarrier);
router.post("/carrier/:carrierId/notes", authorize("ADMIN", "OPERATIONS", "BROKER"), addNote);
router.post("/carrier/:carrierId/check", authorize("ADMIN", "OPERATIONS", "CEO", "BROKER", "DISPATCH"), checkCarrier);

export default router;
