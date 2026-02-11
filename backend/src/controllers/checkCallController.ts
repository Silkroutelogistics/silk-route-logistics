import { Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { createCheckCallSchema } from "../validators/checkCall";

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
    await prisma.load.update({
      where: { id: data.loadId },
      data: { status: newLoadStatus as any },
    });
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
