import { Router, Response } from "express";
import { prisma } from "../config/database";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { auditLog } from "../middleware/audit";

const router = Router();
router.use(authenticate);

// GET /api/load-accessorials/:loadId — Get all accessorials for a load
router.get(
  "/:loadId",
  async (req: AuthRequest, res: Response) => {
    try {
      const { loadId } = req.params;
      const accessorials = await prisma.loadAccessorial.findMany({
        where: { loadId },
        orderBy: { createdAt: "desc" },
        include: {
          stop: { select: { id: true, stopNumber: true, stopType: true, facilityName: true, city: true, state: true } },
        },
      });
      res.json({ accessorials });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch accessorials" });
    }
  }
);

// POST /api/load-accessorials/:loadId — Add accessorial
router.post(
  "/:loadId",
  authorize("BROKER", "ADMIN", "DISPATCH", "OPERATIONS", "CEO", "CARRIER") as any,
  auditLog("CREATE", "LoadAccessorial"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { loadId } = req.params;
      const { type, amount, quantity, unit, rate, stopId, billedTo, notes, receiptDocId } = req.body;

      if (!type || amount === undefined) {
        return res.status(400).json({ error: "Type and amount are required" });
      }

      const accessorial = await prisma.loadAccessorial.create({
        data: {
          loadId,
          type,
          amount,
          quantity: quantity || null,
          unit: unit || null,
          rate: rate || null,
          stopId: stopId || null,
          billedTo: billedTo || null,
          notes: notes || null,
          receiptDocId: receiptDocId || null,
          createdBy: req.user!.id,
        },
      });

      res.status(201).json({ accessorial });
    } catch (err) {
      res.status(500).json({ error: "Failed to create accessorial" });
    }
  }
);

// PUT /api/load-accessorials/item/:id — Update accessorial
router.put(
  "/item/:id",
  authorize("BROKER", "ADMIN", "DISPATCH", "OPERATIONS", "CEO") as any,
  auditLog("UPDATE", "LoadAccessorial"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { type, amount, quantity, unit, rate, billedTo, notes, receiptDocId } = req.body;

      const updateData: any = {};
      if (type !== undefined) updateData.type = type;
      if (amount !== undefined) updateData.amount = amount;
      if (quantity !== undefined) updateData.quantity = quantity;
      if (unit !== undefined) updateData.unit = unit;
      if (rate !== undefined) updateData.rate = rate;
      if (billedTo !== undefined) updateData.billedTo = billedTo;
      if (notes !== undefined) updateData.notes = notes;
      if (receiptDocId !== undefined) updateData.receiptDocId = receiptDocId;

      const accessorial = await prisma.loadAccessorial.update({
        where: { id },
        data: updateData,
      });

      res.json({ accessorial });
    } catch (err) {
      res.status(500).json({ error: "Failed to update accessorial" });
    }
  }
);

// PUT /api/load-accessorials/item/:id/approve — AE approves
router.put(
  "/item/:id/approve",
  authorize("BROKER", "ADMIN", "CEO", "OPERATIONS") as any,
  auditLog("APPROVE", "LoadAccessorial"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const accessorial = await prisma.loadAccessorial.update({
        where: { id },
        data: {
          status: "APPROVED",
          approvedBy: req.user!.id,
          approvedAt: new Date(),
        },
      });

      res.json({ accessorial });
    } catch (err) {
      res.status(500).json({ error: "Failed to approve accessorial" });
    }
  }
);

// PUT /api/load-accessorials/item/:id/reject — AE rejects
router.put(
  "/item/:id/reject",
  authorize("BROKER", "ADMIN", "CEO", "OPERATIONS") as any,
  auditLog("REJECT", "LoadAccessorial"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const accessorial = await prisma.loadAccessorial.update({
        where: { id },
        data: {
          status: "REJECTED",
          rejectedReason: reason || null,
        },
      });

      res.json({ accessorial });
    } catch (err) {
      res.status(500).json({ error: "Failed to reject accessorial" });
    }
  }
);

export default router;
