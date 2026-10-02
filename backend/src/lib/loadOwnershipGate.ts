import type { NextFunction, Response } from "express";
import { prisma } from "../config/database";
import type { AuthRequest } from "../middleware/auth";
import { isSrlStaffRole } from "./documentTypes";

/**
 * carrier-portal-upgrade G5/G6 — "is this caller allowed near this load", as a
 * router.param handler, so a router whose every route takes :loadId (or
 * :stopId) cannot add a route that skips it.
 *
 * Staff pass. A carrier passes only for its own load (Load.carrierId is a
 * User.id). Every other role is refused. Role gates (`authorize`) still run on
 * each route; this answers the question they cannot, which is WHICH load.
 */
async function decide(req: AuthRequest, res: Response, next: NextFunction, carrierId: () => Promise<string | null | undefined | false>) {
  try {
    if (isSrlStaffRole(req.user?.role)) return next();
    if (req.user?.role !== "CARRIER") {
      res.status(403).json({ error: "Not authorized for this load" });
      return;
    }
    const owner = await carrierId();
    if (owner === false) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (owner !== req.user.id) {
      res.status(403).json({ error: "Not authorized for this load" });
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}

/** router.param("loadId", loadIdOwnershipGate) */
export function loadIdOwnershipGate(req: AuthRequest, res: Response, next: NextFunction, loadId: string) {
  return decide(req, res, next, async () => {
    const load = await prisma.load.findUnique({ where: { id: loadId }, select: { carrierId: true } });
    return load ? load.carrierId : false;
  });
}

/** router.param("stopId", stopIdOwnershipGate) — resolves the stop's own load. */
export function stopIdOwnershipGate(req: AuthRequest, res: Response, next: NextFunction, stopId: string) {
  return decide(req, res, next, async () => {
    const stop = await prisma.loadStop.findUnique({ where: { id: stopId }, select: { load: { select: { carrierId: true } } } });
    return stop ? stop.load?.carrierId : false;
  });
}
