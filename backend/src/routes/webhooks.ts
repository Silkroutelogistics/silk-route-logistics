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

// Resend inbound email — receives emails sent to sales@silkroutelogistics.ai
router.post("/inbound-email", async (req, res) => {
  try {
    const { from, to, subject, text, html } = req.body;

    if (!from) {
      res.status(400).json({ error: "Missing from field" });
      return;
    }

    // Extract sender email (Resend sends "Name <email>" or just "email")
    const senderEmail = (from.match(/<([^>]+)>/) || [null, from])[1].toLowerCase().trim();
    const senderName = from.replace(/<[^>]+>/, "").trim() || senderEmail;
    const recipientAddr = Array.isArray(to) ? to[0] : (to || "sales@silkroutelogistics.ai");
    const body = text || (html ? html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "");

    console.log(`[Inbound Email] From: ${senderEmail}, Subject: ${subject || "(no subject)"}`);

    // Try to match sender to a carrier or customer
    let entityType = "UNKNOWN";
    let entityId = "UNKNOWN";

    // Check carriers (user email or carrier profile contact email)
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
      // Check carrier profile contact emails
      const carrierProfile = await prisma.carrierProfile.findFirst({
        where: { contactEmail: { equals: senderEmail, mode: "insensitive" } },
      });
      if (carrierProfile) {
        entityType = "CARRIER";
        entityId = carrierProfile.id;
      }
    }

    // If not a carrier, check customers
    if (entityType === "UNKNOWN") {
      const customer = await prisma.customer.findFirst({
        where: { email: { equals: senderEmail, mode: "insensitive" } },
      });
      if (customer) {
        entityType = "SHIPPER";
        entityId = customer.id;
      }
    }

    // Get system user for logging (first admin)
    const systemUser = await prisma.user.findFirst({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });

    // Create communication record
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
