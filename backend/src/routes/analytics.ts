import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth";
import * as ctrl from "../controllers/analyticsController";

const router = Router();

// All analytics endpoints require authentication
router.use(authenticate as any);

// Revenue & Margin — AE, Accounting, Admin
router.get("/revenue", ctrl.getRevenue as any);

// Load Volume
router.get("/loads", ctrl.getLoads as any);

// On-Time Performance
router.get("/on-time", ctrl.getOnTime as any);

// Lane Profitability
router.get("/lanes", ctrl.getLanes as any);

// Carrier Scorecards — not available to CARRIER role (they use /earnings)
router.get("/carriers", ctrl.getCarriers as any);

// Shipper Scorecards
router.get("/shippers", ctrl.getShippers as any);

// Cash Flow — Accounting/Admin only
router.get("/cash-flow", authorize("ADMIN", "CEO", "ACCOUNTING") as any, ctrl.getCashFlow as any);

// AR Aging — Accounting/Admin only
router.get("/ar-aging", authorize("ADMIN", "CEO", "ACCOUNTING") as any, ctrl.getARAging as any);

// AP — Accounting/Admin only
router.get("/ap", authorize("ADMIN", "CEO", "ACCOUNTING") as any, ctrl.getAP as any);

// Shipper Credit Health — Accounting/Admin only
router.get("/shipper-credit", authorize("ADMIN", "CEO", "ACCOUNTING") as any, ctrl.getShipperCredit as any);

// Carrier Earnings — Carrier's own data
router.get("/earnings", ctrl.getCarrierEarnings as any);

// Export
router.post("/export", ctrl.exportReport as any);

export default router;
