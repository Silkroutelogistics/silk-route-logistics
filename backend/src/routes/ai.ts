import { Router, Response } from "express";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { predictRate, getMarketDashboard, runRateLearningCycle } from "../services/rateIntelligenceService";
import { getCarrierPrediction, getCarrierIntelligenceDashboard, runCarrierLearningCycle } from "../services/carrierIntelligenceService";
import { getLaneAnalysis, getBackhaulSuggestions, getLaneDashboard, runLaneLearningCycle } from "../services/laneOptimizerService";
import { getCustomerInsights, getCustomerDashboard, runCustomerLearningCycle } from "../services/customerIntelligenceService";
import { getCarrierForecast, runComplianceForecastCycle } from "../services/complianceForecastService";
import { getAIDashboard, runSystemOptimizationCycle } from "../services/systemOptimizerService";
import { getRecentAnomalies, acknowledgeAnomaly, runAnomalyScan } from "../services/aiLearningLoop/anomalyDetector";
import { getLatestTrainingStatus, runFullTrainingCycle } from "../services/aiLearningLoop/modelTrainer";
import { getPerformanceReport } from "../services/aiLearningLoop/performanceTracker";
import { getRecommendationsForLoad, recordRecommendationOutcome, getRecommendationPerformance } from "../services/smartRecommendationService";
import { submitFacilityRating, getFacilityDashboard, searchFacilities } from "../services/facilityRatingService";
import { getCarrierPreferences, updateCarrierPreferences, autoLearnPreferences } from "../services/carrierPreferenceService";
import { scanActiveShipments, assessLoadRisk, getRiskDashboard } from "../services/shipmentMonitorService";
import { findBackhaulLoads, getDeadheadAnalytics } from "../services/deadheadOptimizerService";
import { canInstantBook, isLoadInstantBookable, instantBook, getInstantBookAnalytics } from "../services/instantBookService";
import { processQuoteEmail, getEmailQuoteAnalytics } from "../services/emailQuoteService";
import { getCostSummary, getTodaySpend, checkBudget } from "../services/aiRouter/costTracker";

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

// ─── Anomaly Detection ──────────────────────────────────────────
router.get("/anomalies/recent", authorize("ADMIN", "CEO", "BROKER", "OPERATIONS") as any, async (req: AuthRequest, res: Response) => {
  try {
    const limit = parseInt(String(req.query.limit)) || 50;
    const anomalies = await getRecentAnomalies(limit);
    res.json(anomalies);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch anomalies", details: String(err) });
  }
});

router.post("/anomalies/:id/acknowledge", authorize("ADMIN", "CEO") as any, async (req: AuthRequest, res: Response) => {
  try {
    const result = await acknowledgeAnomaly(req.params.id, req.user!.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to acknowledge anomaly", details: String(err) });
  }
});

router.post("/anomalies/scan", authorize("ADMIN", "CEO") as any, async (req: AuthRequest, res: Response) => {
  try {
    const result = await runAnomalyScan();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Anomaly scan failed", details: String(err) });
  }
});

// ─── Learning Status & Training ─────────────────────────────────
router.get("/learning/status", authorize("ADMIN", "CEO") as any, async (req: AuthRequest, res: Response) => {
  try {
    const status = await getLatestTrainingStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch training status", details: String(err) });
  }
});

router.post("/learning/full-cycle", authorize("ADMIN", "CEO") as any, async (req: AuthRequest, res: Response) => {
  try {
    const result = await runFullTrainingCycle();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Full training cycle failed", details: String(err) });
  }
});

router.get("/learning/performance", authorize("ADMIN", "CEO") as any, async (req: AuthRequest, res: Response) => {
  try {
    const report = await getPerformanceReport();
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: "Performance report failed", details: String(err) });
  }
});

// ─── Smart Recommendations ──────────────────────────────────────
router.get("/recommendations/load/:loadId", authorize("ADMIN", "BROKER", "DISPATCH", "OPERATIONS") as any, async (req: AuthRequest, res: Response) => {
  try {
    const limit = parseInt(String(req.query.limit)) || 10;
    const recs = await getRecommendationsForLoad(req.params.loadId, limit);
    res.json(recs);
  } catch (err) {
    res.status(500).json({ error: "Recommendations failed", details: String(err) });
  }
});

router.post("/recommendations/outcome", authorize("ADMIN", "BROKER", "DISPATCH", "OPERATIONS") as any, async (req: AuthRequest, res: Response) => {
  try {
    const { loadId, carrierId, outcome } = req.body;
    await recordRecommendationOutcome(loadId, carrierId, outcome);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to record outcome", details: String(err) });
  }
});

router.get("/recommendations/performance", authorize("ADMIN", "CEO", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try {
    const days = parseInt(String(req.query.days)) || 30;
    const perf = await getRecommendationPerformance(days);
    res.json(perf);
  } catch (err) {
    res.status(500).json({ error: "Performance data failed", details: String(err) });
  }
});

// ─── Facility Ratings ───────────────────────────────────────────
router.post("/facilities/rate", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await submitFacilityRating(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to submit rating", details: String(err) });
  }
});

router.get("/facilities/dashboard", authorize("ADMIN", "BROKER", "DISPATCH", "OPERATIONS") as any, async (req: AuthRequest, res: Response) => {
  try {
    const dashboard = await getFacilityDashboard();
    res.json(dashboard);
  } catch (err) {
    res.status(500).json({ error: "Facility dashboard failed", details: String(err) });
  }
});

router.get("/facilities/search", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { state, city, zip, minRating } = req.query;
    const facilities = await searchFacilities({
      state: state as string,
      city: city as string,
      zip: zip as string,
      minRating: minRating ? parseFloat(String(minRating)) : undefined,
    });
    res.json(facilities);
  } catch (err) {
    res.status(500).json({ error: "Facility search failed", details: String(err) });
  }
});

// ─── Carrier Preferences ────────────────────────────────────────
router.get("/preferences/:carrierId", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const prefs = await getCarrierPreferences(req.params.carrierId);
    res.json(prefs);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch preferences", details: String(err) });
  }
});

router.put("/preferences/:carrierId", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await updateCarrierPreferences({ carrierId: req.params.carrierId, ...req.body });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to update preferences", details: String(err) });
  }
});

router.post("/preferences/:carrierId/auto-learn", authorize("ADMIN", "OPERATIONS") as any, async (req: AuthRequest, res: Response) => {
  try {
    const result = await autoLearnPreferences(req.params.carrierId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Auto-learn failed", details: String(err) });
  }
});

// ─── Shipment Monitor ───────────────────────────────────────────
router.get("/monitor/scan", authorize("ADMIN", "DISPATCH", "OPERATIONS") as any, async (req: AuthRequest, res: Response) => {
  try {
    const result = await scanActiveShipments();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Shipment scan failed", details: String(err) });
  }
});

router.get("/monitor/load/:loadId", authorize("ADMIN", "BROKER", "DISPATCH", "OPERATIONS") as any, async (req: AuthRequest, res: Response) => {
  try {
    const risk = await assessLoadRisk(req.params.loadId);
    res.json(risk);
  } catch (err) {
    res.status(500).json({ error: "Risk assessment failed", details: String(err) });
  }
});

router.get("/monitor/dashboard", authorize("ADMIN", "DISPATCH", "OPERATIONS") as any, async (req: AuthRequest, res: Response) => {
  try {
    const dashboard = await getRiskDashboard();
    res.json(dashboard);
  } catch (err) {
    res.status(500).json({ error: "Risk dashboard failed", details: String(err) });
  }
});

// ─── Deadhead Optimizer ─────────────────────────────────────────
router.get("/deadhead/backhaul", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { currentState, carrierId, equipmentType, maxDeadheadMiles } = req.query;
    if (!currentState) return res.status(400).json({ error: "currentState is required" });
    const loads = await findBackhaulLoads({
      currentState: String(currentState),
      carrierId: carrierId as string,
      equipmentType: equipmentType as string,
      maxDeadheadMiles: maxDeadheadMiles ? parseInt(String(maxDeadheadMiles)) : undefined,
    });
    res.json(loads);
  } catch (err) {
    res.status(500).json({ error: "Backhaul search failed", details: String(err) });
  }
});

router.get("/deadhead/analytics", authorize("ADMIN", "BROKER", "OPERATIONS") as any, async (req: AuthRequest, res: Response) => {
  try {
    const analytics = await getDeadheadAnalytics();
    res.json(analytics);
  } catch (err) {
    res.status(500).json({ error: "Deadhead analytics failed", details: String(err) });
  }
});

// ─── Instant Book ───────────────────────────────────────────────
router.get("/instant-book/eligible/:carrierId", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await canInstantBook(req.params.carrierId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Eligibility check failed", details: String(err) });
  }
});

router.get("/instant-book/load/:loadId", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await isLoadInstantBookable(req.params.loadId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Load check failed", details: String(err) });
  }
});

router.post("/instant-book", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { loadId, carrierId } = req.body;
    const result = await instantBook(loadId, carrierId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Instant book failed", details: String(err) });
  }
});

router.get("/instant-book/analytics", authorize("ADMIN", "CEO", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try {
    const days = parseInt(String(req.query.days)) || 30;
    const analytics = await getInstantBookAnalytics(days);
    res.json(analytics);
  } catch (err) {
    res.status(500).json({ error: "Analytics failed", details: String(err) });
  }
});

// ─── Email Quote Processing ─────────────────────────────────────
router.post("/email-quote/process", authorize("ADMIN", "BROKER", "OPERATIONS") as any, async (req: AuthRequest, res: Response) => {
  try {
    const { subject, body, sender } = req.body;
    const result = await processQuoteEmail(subject, body, sender);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Email processing failed", details: String(err) });
  }
});

router.get("/email-quote/analytics", authorize("ADMIN", "CEO", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try {
    const days = parseInt(String(req.query.days)) || 30;
    const analytics = await getEmailQuoteAnalytics(days);
    res.json(analytics);
  } catch (err) {
    res.status(500).json({ error: "Analytics failed", details: String(err) });
  }
});

// ─── AI Cost Monitoring ─────────────────────────────────────────
router.get("/costs/summary", authorize("ADMIN", "CEO") as any, async (req: AuthRequest, res: Response) => {
  try {
    const days = parseInt(String(req.query.days)) || 30;
    const summary = await getCostSummary(days);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: "Cost summary failed", details: String(err) });
  }
});

router.get("/costs/today", authorize("ADMIN", "CEO") as any, async (req: AuthRequest, res: Response) => {
  try {
    const today = await getTodaySpend();
    res.json(today);
  } catch (err) {
    res.status(500).json({ error: "Today spend failed", details: String(err) });
  }
});

router.get("/costs/budget", authorize("ADMIN", "CEO") as any, async (req: AuthRequest, res: Response) => {
  try {
    const budget = await checkBudget();
    res.json(budget);
  } catch (err) {
    res.status(500).json({ error: "Budget check failed", details: String(err) });
  }
});

export default router;
