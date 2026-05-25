import { Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { createCheckCallSchema } from "../validators/checkCall";
import { validateLoadStatusTransition } from "../lib/loadStateMachine";
import { log } from "../lib/logger";
import { LoadStatus } from "@prisma/client";

export async function createCheckCall(req: AuthRequest, res: Response) {
  const data = createCheckCallSchema.parse(req.body);

  const load = await prisma.load.findUnique({ where: { id: data.loadId } });
  if (!load) { res.status(404).json({ error: "Load not found" }); return; }

  const checkCall = await prisma.checkCall.create({
    data: {
      load: { connect: { id: data.loadId } },
      status: data.status,
      location: data.location,
      city: data.city,
      state: data.state,
      notes: data.notes,
      contactedBy: data.contactedBy,
      method: data.method,
      calledBy: { connect: { id: req.user!.id } },
    },
  });

  // Optionally update the load status based on the check call status
  const checkCallToLoadStatus: Record<string, string> = {
    AT_PICKUP: "AT_PICKUP",
    LOADED: "LOADED",
    IN_TRANSIT: "IN_TRANSIT",
    AT_DELIVERY: "AT_DELIVERY",
    DELIVERED: "DELIVERED",
  };

  const newLoadStatus = checkCallToLoadStatus[data.status];
  if (newLoadStatus) {
    // v3.8.akd Item 159 Sprint 2 — validate derived status flip against
    // the canonical state machine. Pre-akd this codepath used a bare
    // `status: newLoadStatus as any` type-assertion with NO transition
    // check — a check call recorded at AT_DELIVERY against a load
    // currently at AT_PICKUP would silently flip the load forward,
    // skipping LOADED + IN_TRANSIT. Now the validator gates the flip;
    // an illegitimate transition logs a SystemLog WARNING + skips the
    // load.update (the check call itself was created at line 12-24 and
    // remains in DB for audit, just doesn't pull the load along with
    // a state-machine violation).
    const transition = validateLoadStatusTransition(
      load.status as LoadStatus,
      newLoadStatus as LoadStatus,
      "AE",
    );
    if (transition.allowed) {
      await prisma.load.update({
        where: { id: data.loadId },
        data: { status: newLoadStatus as LoadStatus },
      });
    } else {
      log.warn(
        {
          loadId: data.loadId,
          from: load.status,
          to: newLoadStatus,
          code: transition.code,
          reason: transition.reason,
        },
        "[CheckCall] Derived status flip rejected by state machine; check call recorded but load.status not advanced.",
      );
      prisma.systemLog.create({
        data: {
          logType: "STATUS_CHANGE",
          severity: "WARNING",
          source: "checkCall-derived-status",
          message: `Check call would advance load ${data.loadId} from ${load.status} to ${newLoadStatus} but the transition is invalid — load.status preserved.`,
          details: {
            loadId: data.loadId,
            checkCallId: checkCall.id,
            from: load.status,
            attemptedTo: newLoadStatus,
            code: transition.code,
            reason: transition.reason,
          },
        },
      }).catch(() => { /* swallow logging-table contention */ });
    }
  }

  // Update last location on linked shipment
  if (data.location || data.city) {
    const linkedShipment = await prisma.shipment.findFirst({ where: { loadId: data.loadId } });
    if (linkedShipment) {
      await prisma.shipment.update({
        where: { id: linkedShipment.id },
        data: {
          lastLocation: data.location || (data.city && data.state ? `${data.city}, ${data.state}` : undefined),
          lastLocationAt: new Date(),
        },
      });
    }
  }

  res.status(201).json(checkCall);
}

export async function getCheckCallsByLoad(req: AuthRequest, res: Response) {
  const checkCalls = await prisma.checkCall.findMany({
    where: { loadId: req.params.loadId },
    include: {
      calledBy: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json(checkCalls);
}

export async function getRecentCheckCalls(req: AuthRequest, res: Response) {
  const limit = parseInt(req.query.limit as string) || 50;

  const checkCalls = await prisma.checkCall.findMany({
    include: {
      load: {
        select: {
          id: true, referenceNumber: true, status: true,
          originCity: true, originState: true, destCity: true, destState: true,
          carrier: { select: { firstName: true, lastName: true, company: true } },
        },
      },
      calledBy: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  res.json(checkCalls);
}
