import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { calculateMileage, calculateBatch, getProviderStatus } from "../services/mileageService";

export async function getMileage(req: AuthRequest, res: Response) {
  const { origin, destination, equipment, hazmat } = req.query as Record<string, string>;

  if (!origin || !destination) {
    res.status(400).json({ error: "origin and destination query parameters are required" });
    return;
  }

  const result = await calculateMileage(origin, destination, {
    equipment: equipment || undefined,
    hazmat: hazmat === "true",
  });

  res.json(result);
}

export async function getMileageProvider(_req: AuthRequest, res: Response) {
  res.json(getProviderStatus());
}

export async function batchMileage(req: AuthRequest, res: Response) {
  const { pairs } = req.body as { pairs?: { origin: string; destination: string; equipment?: string; hazmat?: boolean }[] };

  if (!Array.isArray(pairs) || pairs.length === 0) {
    res.status(400).json({ error: "pairs array is required" });
    return;
  }

  if (pairs.length > 50) {
    res.status(400).json({ error: "Maximum 50 pairs per batch request" });
    return;
  }

  const results = await calculateBatch(
    pairs.map((p) => ({
      origin: p.origin,
      destination: p.destination,
      options: { equipment: p.equipment, hazmat: p.hazmat },
    }))
  );

  res.json({ results });
}
