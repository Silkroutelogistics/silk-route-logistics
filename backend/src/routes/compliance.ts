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
  getOverrideStatus,
  suspendCarrier,
  addNote,
  getNotes,
  exportCSV,
  getScanHistory,
  getLatestScan,
  checkCarrier,
} from "../controllers/complianceController";
import { triggerAutoReversal, triggerChameleonScan, triggerLoadComplianceScan } from "../controllers/carrierVettingController";
import { authenticate, authorize } from "../middleware/auth";
import { auditLog } from "../middleware/audit";

const router = Router();

router.use(authenticate);

// Existing routes
router.get("/alerts", authorize("ADMIN", "OPERATIONS", "CEO"), getAlerts);
router.post("/scan", authorize("ADMIN", "OPERATIONS", "CEO"), auditLog("SCAN", "Compliance"), scanCompliance);
// v3.8.aws — these three carried NO authorize(), only the file-level
// authenticate() above. Every sibling on both sides had one, which is what made
// the omission a gap rather than a decision.
//
// It was reachable by a CARRIER. /api/compliance is not a carrier-portal mount,
// so resolveCookieCandidates (middleware/auth.ts:226) orders the candidates
// [ae, carrier, shipper] and a carrier's srl_token_carrier validates on the
// second try. That resolver's own comment says the safety net is "role gating
// still enforced by authorize() downstream" — which is precisely what these
// routes lacked. A carrier could dismiss the compliance alert raised against
// itself.
//
// Role sets are the ones the actual consumers need, not a guess: the compliance
// console (dashboard/compliance/page.tsx) calls /stats, /alerts, /scan,
// /dismiss and /resolve together, and /alerts + /scan are ("ADMIN",
// "OPERATIONS","CEO"). Matching that keeps one screen consistent — a wider
// /stats would load for a BROKER whose /alerts on the same page 403s.
// authorize() precedes auditLog() so a refused call is not recorded as if it
// happened, matching /scan above.
router.patch("/alerts/:id/dismiss", authorize("ADMIN", "CEO", "OPERATIONS"), auditLog("DISMISS", "ComplianceAlert"), dismissAlert);
router.patch("/alerts/:id/resolve", authorize("ADMIN", "CEO", "OPERATIONS"), auditLog("RESOLVE", "ComplianceAlert"), resolveAlert);
router.get("/stats", authorize("ADMIN", "OPERATIONS", "CEO"), getComplianceStats);

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
// Sprint 40 (Item 58) — role gate widened ADMIN → ADMIN+CEO per Pattern 6
// (cross-sprint precedent audit) caught Sprint 39 vs Sprint 40 inconsistency:
// Sprint 39 acceptTenderOnBehalf is ADMIN+CEO. Same operational class
// (admin override of safety gate), CEO is policy superset of ADMIN.
router.post("/carrier/:carrierId/override-block", authorize("ADMIN", "CEO"), overrideBlock);
router.get("/carrier/:carrierId/override-status", authorize("ADMIN", "CEO"), getOverrideStatus);
router.post("/carrier/:carrierId/suspend", authorize("ADMIN"), suspendCarrier);
router.post("/carrier/:carrierId/notes", authorize("ADMIN", "OPERATIONS", "BROKER"), addNote);
router.post("/carrier/:carrierId/check", authorize("ADMIN", "OPERATIONS", "CEO", "BROKER", "DISPATCH"), checkCarrier);

// Vetting upgrade routes
router.post("/check-reversals", authorize("ADMIN", "OPERATIONS"), triggerAutoReversal);
router.post("/chameleon-scan", authorize("ADMIN"), triggerChameleonScan);
router.post("/load-compliance-scan", authorize("ADMIN", "OPERATIONS"), triggerLoadComplianceScan);

export default router;
