import { Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { verifyCarrierWithFMCSA } from "../services/fmcsaService";

/** Get FMCSA data for the logged-in carrier's DOT number */
export async function getMyFMCSAProfile(req: AuthRequest, res: Response) {
  const profile = await prisma.carrierProfile.findUnique({
    where: { userId: req.user!.id },
  });

  if (!profile?.dotNumber) {
    res.status(404).json({ error: "No carrier profile or DOT number found" });
    return;
  }

  // Strip any "DOT-" prefix to get raw number
  const dotNum = profile.dotNumber.replace(/^DOT-/i, "");
  const result = await verifyCarrierWithFMCSA(dotNum);
  res.json(result);
}

/** Lookup any DOT number (admin/employee use) */
export async function lookupFMCSA(req: AuthRequest, res: Response) {
  const { dotNumber } = req.params;
  if (!dotNumber) {
    res.status(400).json({ error: "DOT number is required" });
    return;
  }

  const dotNum = dotNumber.replace(/^DOT-/i, "");
  const result = await verifyCarrierWithFMCSA(dotNum);
  res.json(result);
}
