import { Response } from "express";
import { AuthRequest } from "../middleware/auth";

/**
 * ELD read endpoints: 501 until a provider is connected.
 *
 * Until Phase 0 of the mandatory-ELD arc these four handlers served
 * eldService, which returned random noise around a city centroid, a random
 * speed and heading, a random duty status, and a provider summary whose every
 * entry read `connected: true` with the comment "Simulated". Nothing in
 * production has ever been connected to a telematics provider: motiveService
 * and samsaraService exist but their API keys are not declared in env.ts. An
 * AE reading /api/eld/overview was shown three connected providers and a
 * device count equal to the number of ACTIVE trucks in a fleet table SRL does
 * not own.
 *
 * A simulated position on an operations screen is worse than no position,
 * because it is indistinguishable from a real one. These now say so. The
 * device-mapping, event, sync and webhook routes in routes/eld.ts are the real
 * single-tenant adapter surface and are unchanged.
 *
 * Audit: docs/audits/track-and-trace-mandatory-eld-audit.md, Part 1 s1.3.
 */

export const ELD_NOT_CONNECTED_MESSAGE =
  "No ELD provider is connected. This endpoint returns device data once a carrier's telematics are linked; it no longer returns simulated positions.";

function notConnected(res: Response): void {
  res.status(501).json({ error: "ELD_NOT_CONNECTED", message: ELD_NOT_CONNECTED_MESSAGE });
}

export async function getHOSData(_req: AuthRequest, res: Response) {
  notConnected(res);
}

export async function getELDOverview(_req: AuthRequest, res: Response) {
  notConnected(res);
}

export async function getDriverLocation(_req: AuthRequest, res: Response) {
  notConnected(res);
}

export async function getAllLocations(_req: AuthRequest, res: Response) {
  notConnected(res);
}
