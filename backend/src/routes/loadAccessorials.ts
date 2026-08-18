import { Router, Response } from "express";
import { prisma } from "../config/database";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { auditLog } from "../middleware/audit";
import { log } from "../lib/logger";
import { syncCarrierPayAccessorials } from "../services/integrationService";
import { syncInvoiceAccessorials } from "../services/invoiceService";

/**
 * Fan an approval or rejection into both money paths.
 *
 * Failures are still swallowed rather than rolled back, and that is deliberate:
 * the decision an operator just made is the durable fact, and undoing it because
 * a downstream sync had a bad minute would lose the decision and leave the
 * operator with nothing. The syncs are idempotent and re-run on the next
 * approve, reject or amend on that load.
 *
 * v3.8.ash — but the CALLER now learns what happened. Before, this returned void
 * and every route answered 200, so an approve whose money never moved rendered as
 * a green Approved pill on screen. That is the worst failure shape available: the
 * operator believes the carrier is being paid and the customer billed, and
 * nothing anywhere contradicts them until someone reconciles by hand.
 *
 * Reporting the outcome costs nothing and lets the route say "approved, but the
 * settlement did not update" — which is true, and actionable, and the difference
 * between a caught problem and a discovered one.
 */
async function pushAccessorialToMoneyPaths(
  loadId: string,
): Promise<{ carrier: boolean; invoice: boolean }> {
  const [carrier, invoice] = await Promise.allSettled([
    syncCarrierPayAccessorials(loadId),
    syncInvoiceAccessorials(loadId),
  ]);

  if (carrier.status === "rejected") {
    log.error({ err: carrier.reason, loadId }, "[Accessorial] carrier settlement sync failed");
  }
  if (invoice.status === "rejected") {
    log.error({ err: invoice.reason, loadId }, "[Accessorial] customer invoice sync failed");
  }

  return {
    carrier: carrier.status === "fulfilled",
    invoice: invoice.status === "fulfilled",
  };
}

/**
 * Turn a fan-out result into something a screen can show without inventing an
 * error the operator cannot act on.
 *
 * The decision itself succeeded either way — that is why the route stays 200.
 * What changes is whether the response admits the money is out of step.
 */
function syncWarning(r: { carrier: boolean; invoice: boolean }): string | null {
  if (r.carrier && r.invoice) return null;
  const failed = [!r.carrier && "carrier settlement", !r.invoice && "customer invoice"]
    .filter(Boolean)
    .join(" and ");
  return `Decision saved, but the ${failed} did not update. It will retry on the next change to this load; if the amount still looks wrong, tell operations.`;
}

const router = Router();
router.use(authenticate);

/**
 * GET /api/load-accessorials/pending — every unapproved claim, across loads.
 *
 * The per-load GET below can only answer "what is on this load", which means an
 * operator has to already suspect a load before they can find the claim on it.
 * Detention is written by a cron against a stop that closed hours ago, so there
 * is no moment where anyone is looking at that load. Without this the pending
 * rows are only reachable by guessing, and a claim nobody approves is a carrier
 * nobody pays.
 *
 * Ordered oldest first: the row that has been waiting longest is the one
 * holding up a settlement.
 *
 * MUST stay above `/:loadId` — Express matches in declaration order and would
 * otherwise read "pending" as a load id.
 */
router.get(
  "/pending",
  // v3.8.asb — AE added. This set, /item/:id/approve and /item/:id/reject must
  // stay identical: see is act on this surface.
  authorize("BROKER", "ADMIN", "CEO", "OPERATIONS", "DISPATCH", "AE") as any,
  async (req: AuthRequest, res: Response) => {
    try {
      const accessorials = await prisma.loadAccessorial.findMany({
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
        take: 200,
        include: {
          stop: {
            select: {
              id: true, stopNumber: true, stopType: true,
              facilityName: true, city: true, state: true,
            },
          },
          load: {
            select: {
              id: true, loadNumber: true, referenceNumber: true, status: true,
              originCity: true, originState: true, destCity: true, destState: true,
              customer: { select: { name: true } },
              carrier: { select: { company: true, firstName: true, lastName: true } },
            },
          },
        },
      });
      res.json({ accessorials, count: accessorials.length });
    } catch (err) {
      log.error({ err }, "[Accessorial] pending queue fetch failed");
      res.status(500).json({ error: "Failed to fetch pending accessorials" });
    }
  }
);

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

      // An amount corrected on an already-approved line has to reach the money
      // paths too, not just a fresh approval.
      let warning: string | null = null;
      if (accessorial.status === "APPROVED") {
        warning = syncWarning(await pushAccessorialToMoneyPaths(accessorial.loadId));
      }

      res.json({ accessorial, warning });
    } catch (err) {
      res.status(500).json({ error: "Failed to update accessorial" });
    }
  }
);

// PUT /api/load-accessorials/item/:id/approve — AE approves
router.put(
  "/item/:id/approve",
  // v3.8.asb — must match the /pending viewer set exactly. It did not: DISPATCH
  // could see the queue and its buttons and got a 403 on click, and AE — the
  // role named for this desk — was absent from all three routes while the
  // surface was built for an account executive. A queue you can read and cannot
  // act on is worse than one you cannot see.
  authorize("BROKER", "ADMIN", "CEO", "OPERATIONS", "DISPATCH", "AE") as any,
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

      const warning = syncWarning(await pushAccessorialToMoneyPaths(accessorial.loadId));

      res.json({ accessorial, warning });
    } catch (err) {
      res.status(500).json({ error: "Failed to approve accessorial" });
    }
  }
);

// PUT /api/load-accessorials/item/:id/reject — AE rejects
router.put(
  "/item/:id/reject",
  // v3.8.asb — same set as /pending and /approve. See the note above.
  authorize("BROKER", "ADMIN", "CEO", "OPERATIONS", "DISPATCH", "AE") as any,
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

      // Rejecting a line that had already been approved takes money back out of
      // an unpaid settlement. A line already billed to the customer is a credit
      // memo, which does not exist yet — syncCarrierPayAccessorials queues that
      // case for an operator rather than editing a committed document.
      const warning = syncWarning(await pushAccessorialToMoneyPaths(accessorial.loadId));

      res.json({ accessorial, warning });
    } catch (err) {
      res.status(500).json({ error: "Failed to reject accessorial" });
    }
  }
);

export default router;
