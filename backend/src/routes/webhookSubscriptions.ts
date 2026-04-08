import { Router, Response } from "express";
import crypto from "crypto";
import { prisma } from "../config/database";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { isUrlSafe } from "../lib/urlSafety";
import { z } from "zod";

const router = Router();
router.use(authenticate);

const VALID_EVENTS = [
  "LOAD_POSTED", "LOAD_BOOKED", "LOAD_DISPATCHED", "LOAD_DELIVERED",
  "TENDER_ACCEPTED", "TENDER_DECLINED", "INVOICE_APPROVED", "CARRIER_VETTED",
] as const;

const createSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  events: z.array(z.enum(VALID_EVENTS)).min(1),
  headers: z.record(z.string()).optional(),
});

/** List all webhook endpoints for the current user */
router.get(
  "/",
  authorize("ADMIN", "CEO", "BROKER"),
  async (req: AuthRequest, res: Response) => {
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { userId: req.user!.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    // Mask secrets in response
    res.json(endpoints.map((ep) => ({ ...ep, secret: ep.secret.slice(0, 8) + "..." })));
  },
);

/** Create a webhook endpoint */
router.post(
  "/",
  authorize("ADMIN", "CEO"),
  async (req: AuthRequest, res: Response) => {
    try {
      const parsed = createSchema.parse(req.body);

      // SSRF check on URL
      const urlCheck = await isUrlSafe(parsed.url);
      if (!urlCheck.safe) {
        res.status(400).json({ error: `Unsafe URL: ${urlCheck.reason}` });
        return;
      }

      const secret = crypto.randomBytes(32).toString("hex");

      const endpoint = await prisma.webhookEndpoint.create({
        data: {
          name: parsed.name,
          url: parsed.url,
          secret,
          events: parsed.events,
          headers: parsed.headers || undefined,
          userId: req.user!.id,
        },
      });

      // Return full secret only on creation
      res.status(201).json(endpoint);
    } catch (err: any) {
      if (err.name === "ZodError") {
        res.status(400).json({ error: "Invalid input", details: err.errors });
      } else {
        console.error("[Webhooks] Create error:", err);
        res.status(500).json({ error: "Failed to create webhook" });
      }
    }
  },
);

/** Delete a webhook endpoint (soft delete) */
router.delete(
  "/:id",
  authorize("ADMIN", "CEO"),
  async (req: AuthRequest, res: Response) => {
    const ep = await prisma.webhookEndpoint.findFirst({
      where: { id: req.params.id, userId: req.user!.id, deletedAt: null },
    });
    if (!ep) { res.status(404).json({ error: "Webhook not found" }); return; }

    await prisma.webhookEndpoint.update({
      where: { id: ep.id },
      data: { deletedAt: new Date(), isEnabled: false },
    });

    res.json({ message: "Webhook deleted" });
  },
);

/** Toggle enable/disable */
router.patch(
  "/:id/toggle",
  authorize("ADMIN", "CEO"),
  async (req: AuthRequest, res: Response) => {
    const ep = await prisma.webhookEndpoint.findFirst({
      where: { id: req.params.id, userId: req.user!.id, deletedAt: null },
    });
    if (!ep) { res.status(404).json({ error: "Webhook not found" }); return; }

    const updated = await prisma.webhookEndpoint.update({
      where: { id: ep.id },
      data: { isEnabled: !ep.isEnabled, failCount: 0 },
    });

    res.json(updated);
  },
);

export default router;
