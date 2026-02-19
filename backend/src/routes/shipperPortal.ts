import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth";
import {
  getShipperDashboard,
  getShipperShipments,
  getShipperInvoices,
  getShipperAnalytics,
  getShipperTracking,
  getShipperDocuments,
} from "../controllers/shipperPortalController";

const router = Router();

// All shipper portal routes require SHIPPER role
router.use(authenticate, authorize("SHIPPER") as any);

router.get("/dashboard", getShipperDashboard as any);
router.get("/shipments", getShipperShipments as any);
router.get("/invoices", getShipperInvoices as any);
router.get("/analytics", getShipperAnalytics as any);
router.get("/tracking", getShipperTracking as any);
router.get("/documents", getShipperDocuments as any);

export default router;
