import { Router, Response } from "express";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import {
  sendSMS, listPhoneNumbers, listCalls, listMessages,
  syncCarrierToOpenPhone, syncShipperToOpenPhone,
  processWebhookEvent, getCallHistory, getPhoneStats,
} from "../services/openPhoneService";
import { log } from "../lib/logger";
import crypto from "crypto";

const router = Router();

// ─── Webhook (no auth — OpenPhone sends directly) ──────

router.post("/webhook", async (req: any, res: Response) => {
  // Verify webhook signature
  const secret = process.env.OPENPHONE_WEBHOOK_SECRET;
  if (secret) {
    const signature = req.headers["openphone-signature"] || req.headers["x-openphone-signature"];
    if (signature) {
      const expected = crypto.createHmac("sha256", secret).update(JSON.stringify(req.body)).digest("hex");
      if (signature !== expected) {
        log.warn("[OpenPhone] Invalid webhook signature");
        return res.status(401).json({ error: "Invalid signature" });
      }
    }
  }

  try {
    const result = await processWebhookEvent(req.body);
    res.status(200).json(result);
  } catch (err: any) {
    log.error({ err }, "[OpenPhone] Webhook processing error");
    res.status(200).json({ received: true, error: err.message }); // Always 200 to prevent retries
  }
});

// ─── Authenticated Endpoints ────────────────────────────

router.use(authenticate);

// GET /openphone/stats
router.get("/stats", authorize("ADMIN", "CEO", "BROKER", "DISPATCH") as any, async (req: AuthRequest, res: Response) => {
  try {
    const stats = await getPhoneStats(req.query.dateFrom as string);
    res.json(stats);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /openphone/history — call & SMS history from Communications table
router.get("/history", authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS") as any, async (req: AuthRequest, res: Response) => {
  try {
    const result = await getCallHistory({
      entityType: req.query.entityType as string,
      entityId: req.query.entityId as string,
      type: req.query.type as string,
      dateFrom: req.query.dateFrom as string,
      dateTo: req.query.dateTo as string,
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 25,
    });
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /openphone/sms — send SMS via OpenPhone
router.post("/sms", authorize("ADMIN", "CEO", "BROKER", "DISPATCH") as any, async (req: AuthRequest, res: Response) => {
  try {
    const { to, content } = req.body;
    if (!to || !content) return res.status(400).json({ error: "to and content are required" });
    const result = await sendSMS(to, content);
    res.json(result);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// GET /openphone/phone-numbers — list workspace numbers
router.get("/phone-numbers", authorize("ADMIN", "CEO") as any, async (_req: AuthRequest, res: Response) => {
  try { res.json(await listPhoneNumbers()); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /openphone/calls — list recent calls from OpenPhone API
router.get("/calls", authorize("ADMIN", "CEO", "BROKER", "DISPATCH") as any, async (req: AuthRequest, res: Response) => {
  try {
    const result = await listCalls({
      phoneNumberId: req.query.phoneNumberId as string,
      after: req.query.after as string,
      maxResults: parseInt(req.query.maxResults as string) || 50,
    });
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /openphone/messages — list recent messages from OpenPhone API
router.get("/messages", authorize("ADMIN", "CEO", "BROKER", "DISPATCH") as any, async (req: AuthRequest, res: Response) => {
  try {
    const result = await listMessages({
      phoneNumberId: req.query.phoneNumberId as string,
      after: req.query.after as string,
      maxResults: parseInt(req.query.maxResults as string) || 50,
    });
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /openphone/sync/carrier/:id — push carrier to OpenPhone contacts
router.post("/sync/carrier/:id", authorize("ADMIN", "CEO", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try { res.json(await syncCarrierToOpenPhone(req.params.id)); }
  catch (err: any) { res.status(400).json({ error: err.message }); }
});

// POST /openphone/sync/shipper/:id — push shipper to OpenPhone contacts
router.post("/sync/shipper/:id", authorize("ADMIN", "CEO", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  try { res.json(await syncShipperToOpenPhone(req.params.id)); }
  catch (err: any) { res.status(400).json({ error: err.message }); }
});

export default router;
