/**
 * Carrier Vetting Controller
 * Endpoints for one-click carrier vetting and report retrieval.
 */

import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { vetCarrier, vetAndStoreReport } from "../services/carrierVettingService";
import { prisma } from "../config/database";

/**
 * POST /api/carriers/vet
 * Body: { dotNumber: string, mcNumber?: string, carrierId?: string }
 * Returns full vetting report and stores result if carrier exists in DB.
 */
export async function vetCarrierEndpoint(req: AuthRequest, res: Response) {
  const { dotNumber, mcNumber, carrierId } = req.body;

  if (!dotNumber) {
    res.status(400).json({ error: "dotNumber is required" });
    return;
  }

  try {
    const report = await vetAndStoreReport(dotNumber, carrierId, mcNumber);
    res.json(report);
  } catch (err) {
    console.error("[CarrierVetting] Error vetting carrier:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Vetting failed",
    });
  }
}

/**
 * GET /api/carriers/:id/vetting-report
 * Returns the latest stored vetting report from ComplianceScan.
 */
export async function getVettingReport(req: AuthRequest, res: Response) {
  const { id } = req.params;

  const scan = await prisma.complianceScan.findFirst({
    where: {
      carrierId: id,
      scanType: "VETTING_REPORT",
    },
    orderBy: { scannedAt: "desc" },
  });

  if (!scan) {
    res.status(404).json({ error: "No vetting report found for this carrier" });
    return;
  }

  res.json(scan.fmcsaData);
}
