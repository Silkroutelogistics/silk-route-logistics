import { Router } from "express";
import { env } from "../config/env";
import { openPhoneWebhook } from "../controllers/communicationController";
import { handleCheckCallResponse } from "../services/checkCallAutomation";
import { handleResendWebhook } from "../services/emailSequenceService";

const router = Router();

// OpenPhone webhook — signature verification if secret is configured
router.post("/openphone", (req, res, next) => {
  if (env.OPENPHONE_WEBHOOK_SECRET) {
    const signature = req.headers["x-openphone-signature"] as string;
    if (!signature) {
      return res.status(401).json({ error: "Missing webhook signature" });
    }

    const crypto = require("crypto");
    const payload = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    const expected = crypto
      .createHmac("sha256", env.OPENPHONE_WEBHOOK_SECRET)
      .update(payload)
      .digest("hex");

    try {
      const valid = crypto.timingSafeEqual(
        Buffer.from(signature, "hex"),
        Buffer.from(expected, "hex")
      );
      if (!valid) return res.status(403).json({ error: "Invalid signature" });
    } catch {
      return res.status(403).json({ error: "Invalid signature" });
    }
  }
  next();
}, openPhoneWebhook as any);

// OpenPhone SMS response — auto check-call handler
router.post("/openphone-checkcall", async (req, res) => {
  try {
    const { from, body: msgBody } = req.body;
    if (!from || !msgBody) {
      res.status(400).json({ error: "Missing from or body" });
      return;
    }

    const result = await handleCheckCallResponse(from, msgBody);
    if (result) {
      console.log(`[Webhook] Check-call response processed: Load ${result.loadId} → ${result.label}`);
      res.json({ success: true, ...result });
    } else {
      res.json({ success: false, message: "No matching check-call found or invalid response" });
    }
  } catch (err: any) {
    console.error("[Webhook] Check-call error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Resend webhook — email sequence tracking (opens, clicks, replies, bounces)
router.post("/resend", async (req, res) => {
  try {
    const event = req.body;
    if (!event || !event.type) {
      res.status(400).json({ error: "Invalid event payload" });
      return;
    }

    await handleResendWebhook(event);
    console.log(`[Webhook] Resend event processed: ${event.type}`);
    res.json({ success: true });
  } catch (err: any) {
    console.error("[Webhook] Resend error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
