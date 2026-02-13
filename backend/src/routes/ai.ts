import { Router, Response } from "express";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { predictRate, getMarketDashboard, runRateLearningCycle } from "../services/rateIntelligenceService";
import { getCarrierPrediction, getCarrierIntelligenceDashboard, runCarrierLearningCycle } from "../services/carrierIntelligenceService";
import { getLaneAnalysis, getBackhaulSuggestions, getLaneDashboard, runLaneLearningCycle } from "../services/laneOptimizerService";
import { getCustomerInsights, getCustomerDashboard, runCustomerLearningCycle } from "../services/customerIntelligenceService";
import { getCarrierForecast, runComplianceForecastCycle } from "../services/complianceForecastService";
import { getAIDashboard, runSystemOptimizationCycle } from "../services/systemOptimizerService";

const router = Router();
router.use(authenticate);

// ─── AI System Dashboard ──────────────────────────────────────────
router.get("/dashboard", authorize("ADMIN", "CEO") as any, async (req: AuthRequest, res: Response) => {
  try {
    const dashboard = await getAIDashboard();
    res.json(dashboard);
  } catch (err) {
    res.status(500).json({ error: "Failed to load AI dashboard", details: String(err) });
  }
});

// ─── System Health Check ──────────────────────────────────────────
router.get("/health", authorize("ADMIN", "CEO") as any, async (req: AuthRequest, res: Response) => {
  try {
    const health = await runSystemOptimizationCycle();
    res.json(health);
  } catch (err) {
    res.status(500).json({ error: "Failed to run system health check", details: String(err) });
  }
});

// ─── Rate Intelligence ────────────────────────────────────────────
router.get("/rates/predict", authorize("ADMIN", "BROKER", "AE", "DISPATCH", "OPERATIONS") as any, async (req: AuthRequest, res: Response) => {
  try {
    const { originState, destState, equipmentType, miles } = req.query;
    if (!originState || !destState) {
      return res.status(400).json({ error: "originState and destState are required" });
    }
    const prediction = await predictRate(
      String(originState),
      String(destState),
      String(equipmentType || "DRY_VAN"),
      miles ? parseFloat(String(miles)) : undefined
    );
    res.json(prediction || { message: "No data available for this lane" });
  } catch (err) {
    res.status(500).json({ error: "Rate prediction failed", details: String(err) });
  }
});

router.get("/rates/market", authorize("ADMIN", "BROKER", "AE", "CEO") as any, async (req: AuthRequest, res: Response) => {
  try {
    const dashboard = await getMarketDashboard();
    res.json(dashboard);
  } catch (err) {
    res.status(500).json({ error: "Failed to load market data", details: String(err) });
  }
});

// ─── Carrier Intelligence ─────────────────────────────────────────
router.get("/carriers/:carrierId/predict", authorize("ADMIN", "BROKER", "AE", "DISPATCH", "OPERATIONS") as any, async (req: AuthRequest, res: Response) => {
  try {
    const prediction = await getCarrierPrediction(req.params.carrierId);
    res.json(prediction || { message: "No intelligence data for this carrier" });
  } catch (err) {
    res.status(500).json({ error: "Carrier prediction failed", details: String(err) });
  }
});

router.get("/carriers/dashboard", authorize("ADMIN", "BROKER", "AE", "OPERATIONS") as any, async (req: AuthRequest, res: Response) => {
  try {
    const dashboard = await getCarrierIntelligenceDashboard();
    res.json(dashboard);
  } catch (err) {
    res.status(500).json({ error: "Failed to load carrier intelligence", details: String(err) });
  }
});

// ─── Lane Optimization ────────────────────────────────────────────
router.get("/lanes/analyze", authorize("ADMIN", "BROKER", "AE", "DISPATCH") as any, async (req: AuthRequest, res: Response) => {
  try {
    const { originState, destState } = req.query;
    if (!originState || !destState) {
      return res.status(400).json({ error: "originState and destState are required" });
    }
    const analysis = await getLaneAnalysis(String(originState), String(destState));
    res.json(analysis);
  } catch (err) {
    res.status(500).json({ error: "Lane analysis failed", details: String(err) });
  }
});

router.get("/lanes/backhaul", authorize("ADMIN", "BROKER", "AE", "DISPATCH") as any, async (req: AuthRequest, res: Response) => {
  try {
    const { destState } = req.query;
    if (!destState) return res.status(400).json({ error: "destState is required" });
    const suggestions = await getBackhaulSuggestions(String(destState));
    res.json(suggestions);
  } catch (err) {
    res.status(500).json({ error: "Backhaul suggestion failed", details: String(err) });
  }
});

router.get("/lanes/dashboard", authorize("ADMIN", "BROKER", "AE", "OPERATIONS") as any, async (req: AuthRequest, res: Response) => {
  try {
    const dashboard = await getLaneDashboard();
    res.json(dashboard);
  } catch (err) {
    res.status(500).json({ error: "Failed to load lane dashboard", details: String(err) });
  }
});

// ─── Customer Intelligence ────────────────────────────────────────
router.get("/customers/:customerId/insights", authorize("ADMIN", "BROKER", "AE", "CEO") as any, async (req: AuthRequest, res: Response) => {
  try {
    const insights = await getCustomerInsights(req.params.customerId);
    res.json(insights || { message: "No intelligence data for this customer" });
  } catch (err) {
    res.status(500).json({ error: "Customer insights failed", details: String(err) });
  }
});

router.get("/customers/dashboard", authorize("ADMIN", "BROKER", "AE", "CEO") as any, async (req: AuthRequest, res: Response) => {
  try {
    const dashboard = await getCustomerDashboard();
    res.json(dashboard);
  } catch (err) {
    res.status(500).json({ error: "Failed to load customer dashboard", details: String(err) });
  }
});

// ─── Compliance Forecast ──────────────────────────────────────────
router.get("/compliance/:carrierId/forecast", authorize("ADMIN", "OPERATIONS", "DISPATCH") as any, async (req: AuthRequest, res: Response) => {
  try {
    const forecast = await getCarrierForecast(req.params.carrierId);
    res.json(forecast || { message: "No forecast data for this carrier" });
  } catch (err) {
    res.status(500).json({ error: "Compliance forecast failed", details: String(err) });
  }
});

// ─── Manual Learning Triggers (Admin Only) ────────────────────────
router.post("/learn/:service", authorize("ADMIN", "CEO") as any, async (req: AuthRequest, res: Response) => {
  try {
    const service = req.params.service;
    let result: any;

    switch (service) {
      case "rates":
        result = await runRateLearningCycle();
        break;
      case "carriers":
        result = await runCarrierLearningCycle();
        break;
      case "lanes":
        result = await runLaneLearningCycle();
        break;
      case "customers":
        result = await runCustomerLearningCycle();
        break;
      case "compliance":
        result = await runComplianceForecastCycle();
        break;
      case "system":
        result = await runSystemOptimizationCycle();
        break;
      case "all":
        result = {
          rates: await runRateLearningCycle(),
          carriers: await runCarrierLearningCycle(),
          lanes: await runLaneLearningCycle(),
          customers: await runCustomerLearningCycle(),
          compliance: await runComplianceForecastCycle(),
          system: await runSystemOptimizationCycle(),
        };
        break;
      default:
        return res.status(400).json({ error: `Unknown service: ${service}. Options: rates, carriers, lanes, customers, compliance, system, all` });
    }

    res.json({ success: true, service, result });
  } catch (err) {
    res.status(500).json({ error: "Learning cycle failed", details: String(err) });
  }
});

export default router;
