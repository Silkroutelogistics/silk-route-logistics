import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth";
import {
  getShipperDashboard,
  getShipperShipments,
  getShipperInvoices,
  getShipperAnalytics,
  getShipperTracking,
  getShipperDocuments,
  createQuoteRequest,
  fileShipperDispute,
  getShipperDisputes,
} from "../controllers/shipperPortalController";
import { generateQuote, QuoteRequest } from "../services/autoQuoteService";

const router = Router();

// All shipper portal routes require SHIPPER role
router.use(authenticate, authorize("SHIPPER") as any);

router.get("/dashboard", getShipperDashboard as any);
router.get("/shipments", getShipperShipments as any);
router.get("/invoices", getShipperInvoices as any);
router.get("/analytics", getShipperAnalytics as any);
router.get("/tracking", getShipperTracking as any);
router.get("/documents", getShipperDocuments as any);
router.get("/disputes", getShipperDisputes as any);
router.post("/quotes", createQuoteRequest as any);
router.post("/disputes", fileShipperDispute as any);

// ─── Instant Quote (Shipper-facing auto-quote) ──────────────────
router.post("/instant-quote", async (req: any, res: any) => {
  try {
    const { originCity, originState, destCity, destState, equipmentType, weight, pickupDate, commodity, isHazmat, isTempControlled } = req.body;
    if (!originCity || !originState || !destCity || !destState || !equipmentType) {
      return res.status(400).json({ error: "originCity, originState, destCity, destState, and equipmentType are required" });
    }
    const quoteRequest: QuoteRequest = {
      originCity, originState, destCity, destState, equipmentType,
      weight: weight ? parseFloat(weight) : undefined,
      pickupDate,
      commodity,
      isHazmat: !!isHazmat,
      isTempControlled: !!isTempControlled,
    };
    const quote = await generateQuote(quoteRequest);
    res.json(quote);
  } catch (err) {
    res.status(500).json({ error: "Instant quote generation failed", ...(process.env.NODE_ENV !== "production" ? { details: String(err) } : {}) });
  }
});

export default router;
