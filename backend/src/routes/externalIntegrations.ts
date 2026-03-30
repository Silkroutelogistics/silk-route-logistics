import { Router, Response } from "express";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { env } from "../config/env";
import * as carrierOkService from "../services/carrierOkService";
import { brokerageGateway } from "../services/brokerageGatewayService";
import { runDailyMonitor } from "../services/fmcsaBulkMonitorService";
import { creditCheck } from "../services/secEdgarService";

const router = Router();

router.use(authenticate);
router.use(authorize("ADMIN", "CEO", "BROKER", "OPERATIONS") as any);

// ---------- Integration key configs ----------
const INTEGRATION_KEYS = [
  { name: "CarrierOk", envVar: "CARRIER_OK_API_KEY" as const },
  { name: "DAT", envVar: "DAT_API_KEY" as const },
  { name: "Truckstop", envVar: "TRUCKSTOP_API_KEY" as const },
  { name: "CH Robinson", envVar: "CH_ROBINSON_API_KEY" as const },
  { name: "Echo", envVar: "ECHO_API_KEY" as const },
  { name: "Uber Freight", envVar: "UBER_FREIGHT_API_KEY" as const },
  { name: "Project44", envVar: "PROJECT44_API_KEY" as const },
] as const;

// GET /integrations/status — Status of all configured integrations
router.get("/status", async (_req: AuthRequest, res: Response) => {
  try {
    const integrations = INTEGRATION_KEYS.map((key) => ({
      name: key.name,
      envVar: key.envVar,
      configured: !!process.env[key.envVar],
    }));

    res.json({
      integrations,
      configuredCount: integrations.filter((i) => i.configured).length,
      totalCount: integrations.length,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to retrieve integration status" });
  }
});

// GET /integrations/carrier-lookup/:dotNumber — Lookup carrier via CarrierOk + FMCSA
router.get("/carrier-lookup/:dotNumber", async (req: AuthRequest, res: Response) => {
  try {
    const { dotNumber } = req.params;
    if (!dotNumber || !/^\d+$/.test(dotNumber)) {
      res.status(400).json({ error: "Valid DOT number required" });
      return;
    }

    const results: { fmcsa: any; carrierOk?: any } = { fmcsa: null };

    // Always query FMCSA
    try {
      const fmcsaRes = await fetch(
        `https://mobile.fmcsa.dot.gov/qc/services/carriers/${dotNumber}?webKey=${env.FMCSA_WEB_KEY}`
      );
      if (fmcsaRes.ok) {
        results.fmcsa = await fmcsaRes.json();
      }
    } catch {
      results.fmcsa = { error: "FMCSA lookup failed" };
    }

    // CarrierOk if configured
    if (env.CARRIER_OK_API_KEY) {
      try {
        results.carrierOk = await carrierOkService.lookupCarrier(dotNumber);
      } catch {
        results.carrierOk = { error: "CarrierOk lookup failed" };
      }
    }

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "Carrier lookup failed" });
  }
});

// POST /integrations/brokerage/search-loads — Search loads across brokerages
router.post("/brokerage/search-loads", async (req: AuthRequest, res: Response) => {
  try {
    const { providers, filters } = req.body;
    if (!providers || !Array.isArray(providers) || providers.length === 0) {
      res.status(400).json({ error: "providers array is required" });
      return;
    }
    if (!filters || !filters.origin || !filters.dest || !filters.equipment) {
      res.status(400).json({ error: "filters.origin, filters.dest, and filters.equipment are required" });
      return;
    }

    const results = await brokerageGateway.searchLoads(providers, filters);
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: "Brokerage load search failed" });
  }
});

// POST /integrations/brokerage/post-load — Post load to brokerage(s)
router.post("/brokerage/post-load", async (req: AuthRequest, res: Response) => {
  try {
    const { providers, loadData } = req.body;
    if (!providers || !Array.isArray(providers) || providers.length === 0) {
      res.status(400).json({ error: "providers array is required" });
      return;
    }
    if (!loadData) {
      res.status(400).json({ error: "loadData is required" });
      return;
    }

    const results = await brokerageGateway.postLoad(providers, loadData);
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: "Brokerage load posting failed" });
  }
});

// POST /integrations/brokerage/get-rates — Get rate quotes from brokerages
router.post("/brokerage/get-rates", async (req: AuthRequest, res: Response) => {
  try {
    const { providers, origin, dest, equipment } = req.body;
    if (!providers || !Array.isArray(providers) || providers.length === 0) {
      res.status(400).json({ error: "providers array is required" });
      return;
    }
    if (!origin || !dest || !equipment) {
      res.status(400).json({ error: "origin, dest, and equipment are required" });
      return;
    }

    const results = await brokerageGateway.getRates(providers, origin, dest, equipment);
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: "Rate quote retrieval failed" });
  }
});

// POST /integrations/fmcsa/bulk-monitor — Trigger manual FMCSA bulk monitoring run
router.post("/fmcsa/bulk-monitor", async (req: AuthRequest, res: Response) => {
  try {
    const result = await runDailyMonitor();
    res.json({ message: "FMCSA bulk monitoring complete", ...result });
  } catch (err) {
    res.status(500).json({ error: "FMCSA bulk monitoring failed" });
  }
});

// GET /integrations/fmcsa/changes — Get recent FMCSA changes from compliance alerts
router.get("/fmcsa/changes", async (req: AuthRequest, res: Response) => {
  try {
    const { prisma } = await import("../config/database");
    const changes = await prisma.complianceAlert.findMany({
      where: { type: { in: ["FMCSA_STATUS_CHANGE", "FMCSA_CHANGE", "FMCSA_RATING_CHANGE"] } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json({ changes });
  } catch (err) {
    res.status(500).json({ error: "Failed to retrieve FMCSA changes" });
  }
});

// GET /integrations/credit-check/:companyName — SEC EDGAR public company credit check
router.get("/credit-check/:companyName", async (req: AuthRequest, res: Response) => {
  try {
    const { companyName } = req.params;
    if (!companyName || companyName.trim().length < 2) {
      res.status(400).json({ error: "Company name must be at least 2 characters" });
      return;
    }

    const result = await creditCheck(decodeURIComponent(companyName.trim()));
    res.json(result);
  } catch (err) {
    console.error("SEC EDGAR credit check failed:", err);
    res.status(500).json({ error: "Credit check failed" });
  }
});

export default router;
