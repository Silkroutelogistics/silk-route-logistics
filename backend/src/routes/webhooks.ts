import { Router } from "express";
import crypto from "crypto";
import { env } from "../config/env";
import { prisma } from "../config/database";
import { openPhoneWebhook } from "../controllers/communicationController";
import { handleCheckCallResponse } from "../services/checkCallAutomation";
import { handleResendWebhook } from "../services/emailSequenceService";
import { processSamsaraWebhook } from "../services/samsaraService";
import { processMotiveWebhook } from "../services/motiveService";
import { parseCheckCallFromEmail } from "../services/emailCheckCallParser";
import { processInboundEmail } from "../services/emailToLoadService";

const router = Router();

// OpenPhone webhook — signature verification if secret is configured
router.post("/openphone", (req, res, next) => {
  if (env.OPENPHONE_WEBHOOK_SECRET) {
    const signature = req.headers["x-openphone-signature"] as string;
    if (!signature) {
      return res.status(401).json({ error: "Missing webhook signature" });
    }

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
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

// Resend webhook — email sequence tracking (opens, clicks, replies, bounces)
// Resend signs webhooks with svix; verify if header present
router.post("/resend", async (req, res) => {
  try {
    // Basic webhook validation: require known event types to filter noise
    const event = req.body;
    if (!event || !event.type) {
      res.status(400).json({ error: "Invalid event payload" });
      return;
    }

    const validTypes = ["email.sent", "email.delivered", "email.bounced", "email.complained", "email.opened", "email.clicked", "email.received", "email.replied"];
    if (!validTypes.includes(event.type)) {
      console.warn(`[Webhook] Unknown Resend event type: ${event.type}`);
      res.status(400).json({ error: "Unknown event type" });
      return;
    }

    await handleResendWebhook(event);
    console.log(`[Webhook] Resend event processed: ${event.type}`);
    res.json({ success: true });
  } catch (err: any) {
    console.error("[Webhook] Resend error:", err);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

// Resend inbound email — receives emails via Resend webhook (email.received event)
// Also accepts direct POST with {from, to, subject, text} for testing
router.post("/inbound-email", async (req, res) => {
  try {
    const payload = req.body;

    // Resend webhook wraps in { type: "email.received", data: { ... } }
    // Also support direct format { from, to, subject, text } for testing
    let from: string;
    let to: string | string[];
    let subject: string;
    let text: string;
    let html: string;
    let emailId: string | undefined;

    if (payload.type === "email.received" && payload.data) {
      // Resend webhook format
      const d = payload.data;
      from = d.from || "";
      to = d.to || [];
      subject = d.subject || "";
      text = d.text || d.body || "";
      html = d.html || "";
      emailId = d.email_id || d.id;
      console.log(`[Inbound Email] Resend webhook event, emailId: ${emailId}`);

      // If body is missing, try to fetch from Resend API
      if (!text && !html && emailId && env.RESEND_API_KEY) {
        try {
          const resp = await fetch(`https://api.resend.com/emails/${emailId}`, {
            headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
          });
          if (resp.ok) {
            const emailData = await resp.json() as any;
            text = emailData.text || "";
            html = emailData.html || "";
            if (!from && emailData.from) from = emailData.from;
            if (!subject && emailData.subject) subject = emailData.subject;
          }
        } catch (fetchErr) {
          console.error("[Inbound Email] Failed to fetch email content:", fetchErr);
        }
      }
    } else {
      // Direct format
      from = payload.from || "";
      to = payload.to || "";
      subject = payload.subject || "";
      text = payload.text || "";
      html = payload.html || "";
    }

    if (!from) {
      res.status(400).json({ error: "Missing from field" });
      return;
    }

    // Extract sender email (may be "Name <email>" or just "email")
    const senderEmail = (from.match(/<([^>]+)>/) || [null, from])[1].toLowerCase().trim();
    const senderName = from.replace(/<[^>]+>/, "").trim() || senderEmail;
    const recipientAddr = Array.isArray(to) ? to[0] : (to || "sales@silkroutelogistics.ai");
    const body = text || (html ? html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "");

    console.log(`[Inbound Email] From: ${senderEmail}, Subject: ${subject || "(no subject)"}`);

    // Try to match sender to a carrier or customer
    let entityType = "UNKNOWN";
    let entityId = "UNKNOWN";

    const carrierUser = await prisma.user.findFirst({
      where: {
        role: "CARRIER",
        email: { equals: senderEmail, mode: "insensitive" },
      },
      include: { carrierProfile: { select: { id: true, companyName: true } } },
    });

    if (carrierUser && carrierUser.carrierProfile) {
      entityType = "CARRIER";
      entityId = carrierUser.carrierProfile.id;
    } else {
      const carrierProfile = await prisma.carrierProfile.findFirst({
        where: { contactEmail: { equals: senderEmail, mode: "insensitive" } },
      });
      if (carrierProfile) {
        entityType = "CARRIER";
        entityId = carrierProfile.id;
      }
    }

    if (entityType === "UNKNOWN") {
      const customer = await prisma.customer.findFirst({
        where: { email: { equals: senderEmail, mode: "insensitive" } },
      });
      if (customer) {
        entityType = "SHIPPER";
        entityId = customer.id;
      }
    }

    const systemUser = await prisma.user.findFirst({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });

    await prisma.communication.create({
      data: {
        type: "EMAIL_INBOUND",
        direction: "INBOUND",
        entityType,
        entityId,
        from: senderEmail,
        to: recipientAddr,
        subject: subject || "(no subject)",
        body: body.slice(0, 10000),
        metadata: {
          senderName,
          rawTo: to,
          hasHtml: !!html,
          emailId: emailId || null,
          receivedAt: new Date().toISOString(),
        },
        userId: systemUser?.id || "system",
      },
    });

    console.log(`[Inbound Email] Stored as ${entityType}/${entityId}`);

    // Auto-try check-call parsing for carrier emails
    if (entityType === "CARRIER" && body) {
      try {
        const ccResult = await parseCheckCallFromEmail(senderEmail, subject || "", body);
        if (ccResult) {
          console.log(`[Inbound Email] Auto-parsed check-call: ${ccResult.status} at ${ccResult.city}, ${ccResult.state}`);
        }
      } catch { /* non-blocking */ }
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error("[Inbound Email] Error:", err);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

// ─── Samsara ELD Webhook ───
router.post("/samsara", async (req, res) => {
  try {
    // Verify signature if secret is configured
    if (env.SAMSARA_WEBHOOK_SECRET) {
      const signature = req.headers["x-samsara-hmac-sha256"] as string;
      if (!signature) {
        res.status(401).json({ error: "Missing webhook signature" });
        return;
      }
      const payload = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      const expected = crypto.createHmac("sha256", env.SAMSARA_WEBHOOK_SECRET).update(payload).digest("hex");
      try {
        if (!crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"))) {
          res.status(403).json({ error: "Invalid signature" });
          return;
        }
      } catch {
        res.status(403).json({ error: "Invalid signature" });
        return;
      }
    }

    const { eventType, data } = req.body;
    if (eventType && data) {
      await processSamsaraWebhook(eventType, data);
      console.log(`[Webhook] Samsara event processed: ${eventType}`);
    }
    res.json({ success: true });
  } catch (err: any) {
    console.error("[Webhook] Samsara error:", err);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

// ─── Motive ELD Webhook ───
router.post("/motive", async (req, res) => {
  try {
    // Verify signature if secret is configured
    if (env.MOTIVE_WEBHOOK_SECRET) {
      const signature = req.headers["x-motive-signature"] as string;
      if (!signature) {
        res.status(401).json({ error: "Missing webhook signature" });
        return;
      }
      const payload = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      const expected = crypto.createHmac("sha256", env.MOTIVE_WEBHOOK_SECRET).update(payload).digest("hex");
      try {
        if (!crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"))) {
          res.status(403).json({ error: "Invalid signature" });
          return;
        }
      } catch {
        res.status(403).json({ error: "Invalid signature" });
        return;
      }
    }

    const { event_type, data } = req.body;
    if (event_type && data) {
      await processMotiveWebhook(event_type, data);
      console.log(`[Webhook] Motive event processed: ${event_type}`);
    }
    res.json({ success: true });
  } catch (err: any) {
    console.error("[Webhook] Motive error:", err);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

// ─── Inbound Email Check-Call Parser (Claude Cowork Prep) ───
router.post("/inbound-checkcall", async (req, res) => {
  try {
    const { from, subject, text } = req.body;
    if (!from || !text) {
      res.status(400).json({ error: "Missing from or text" });
      return;
    }

    const result = await parseCheckCallFromEmail(from, subject || "", text);
    if (result) {
      console.log(`[Webhook] Email check-call parsed: Load ${result.loadRef} → ${result.status}`);
      res.json({ success: true, ...result });
    } else {
      res.json({ success: false, message: "Could not extract check-call data from email" });
    }
  } catch (err: any) {
    console.error("[Webhook] Email check-call error:", err);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

// ─── Inbound Email → Load Parser ───
router.post("/inbound-email-load", async (req, res) => {
  try {
    // Validate webhook secret
    const secret = req.headers["x-webhook-secret"] as string;
    if (!secret || secret !== env.INBOUND_EMAIL_SECRET) {
      res.status(401).json({ error: "Invalid or missing webhook secret" });
      return;
    }

    const { from, subject, body, html } = req.body;
    if (!from) {
      res.status(400).json({ error: "Missing from field" });
      return;
    }

    const emailBody = body || html || "";
    if (!emailBody) {
      res.status(400).json({ error: "Missing body or html field" });
      return;
    }

    const result = await processInboundEmail(from, subject || "(no subject)", emailBody);
    console.log(`[Webhook] Email-to-Load processed: ${result.action}`);
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[Webhook] Email-to-Load error:", err);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

export default router;
