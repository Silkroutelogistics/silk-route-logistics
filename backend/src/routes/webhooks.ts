import { Router } from "express";
import { env } from "../config/env";
import { prisma } from "../config/database";
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
    res.json({ success: true });
  } catch (err: any) {
    console.error("[Inbound Email] Error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
