import { Router, Request, Response } from "express";
import { prisma } from "../config/database";
import { log } from "../lib/logger";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";

const router = Router();

// ─── Resend Webhook Receiver (public, no auth) ──────────────
// Resend sends webhook events for email.opened, email.clicked, email.delivered, email.bounced
// We map these back to Communication records via Resend email ID stored in metadata.

router.post("/resend-webhook", async (req: Request, res: Response) => {
  try {
    const event = req.body;
    const eventType = event?.type as string;
    const data = event?.data;

    if (!eventType || !data) {
      return res.status(400).json({ error: "Invalid webhook payload" });
    }

    log.info({ eventType, emailId: data.email_id }, "[EmailTracking] Resend webhook received");

    // Find the Communication record that matches this Resend email ID
    // We store the Resend email_id in Communication.metadata.resendEmailId
    const emailId = data.email_id;
    if (!emailId) {
      return res.status(200).json({ ok: true, skipped: "no email_id" });
    }

    const comms = await prisma.communication.findMany({
      where: {
        type: "EMAIL_OUTBOUND",
        metadata: { path: ["resendEmailId"], equals: emailId },
      },
      select: { id: true, metadata: true, entityId: true },
      take: 1,
    });

    if (comms.length === 0) {
      log.warn({ emailId }, "[EmailTracking] No matching Communication for Resend email ID");
      return res.status(200).json({ ok: true, skipped: "no matching comm" });
    }

    const comm = comms[0];
    const meta = (comm.metadata as Record<string, unknown>) || {};

    switch (eventType) {
      case "email.delivered": {
        await prisma.communication.update({
          where: { id: comm.id },
          data: { metadata: { ...meta, deliveredAt: new Date().toISOString() } },
        });
        break;
      }

      case "email.opened": {
        const opens = Array.isArray(meta.opens) ? [...meta.opens] : [];
        opens.push({ openedAt: new Date().toISOString(), timestamp: data.created_at });
        const openCount = opens.length;
        const firstOpenAt = (meta.firstOpenAt as string) || new Date().toISOString();
        await prisma.communication.update({
          where: { id: comm.id },
          data: { metadata: { ...meta, opens: opens as any[], openCount, firstOpenAt } as any },
        });
        break;
      }

      case "email.clicked": {
        const clicks = Array.isArray(meta.clicks) ? [...meta.clicks] : [];
        clicks.push({
          clickedAt: new Date().toISOString(),
          link: data.click?.link,
          ipAddress: data.click?.ipAddress,
          userAgent: data.click?.userAgent,
        });
        await prisma.communication.update({
          where: { id: comm.id },
          data: { metadata: { ...meta, clicks: clicks as any[], clickCount: clicks.length } as any },
        });
        break;
      }

      case "email.bounced": {
        await prisma.communication.update({
          where: { id: comm.id },
          data: { metadata: { ...meta, bouncedAt: new Date().toISOString(), bounceReason: data.bounce?.message } },
        });
        // Auto-stop sequence for bounced emails
        await prisma.customer.updateMany({
          where: { id: comm.entityId, sequenceStatus: "ACTIVE" },
          data: { sequenceStatus: "STOPPED", nextTouchDueAt: null },
        });
        break;
      }

      case "email.complained": {
        await prisma.communication.update({
          where: { id: comm.id },
          data: { metadata: { ...meta, complainedAt: new Date().toISOString() } },
        });
        // Auto-stop sequence for complaints (DNC)
        await prisma.customer.updateMany({
          where: { id: comm.entityId, sequenceStatus: "ACTIVE" },
          data: { sequenceStatus: "STOPPED", nextTouchDueAt: null },
        });
        break;
      }
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    log.error({ err }, "[EmailTracking] Webhook processing error");
    res.status(200).json({ ok: true }); // Always 200 to avoid Resend retries
  }
});

// ─── Engagement stats (authenticated) ───────────────────────

router.get("/engagement-stats", authenticate, authorize("ADMIN", "CEO", "BROKER") as any, async (req: AuthRequest, res: Response) => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);

  const outboundEmails = await prisma.communication.findMany({
    where: {
      type: "EMAIL_OUTBOUND",
      entityType: "SHIPPER",
      createdAt: { gte: thirtyDaysAgo },
      metadata: { path: ["source"], equals: "MassEmailCampaign" },
    },
    select: { id: true, metadata: true },
  });

  const replies = await prisma.communication.count({
    where: {
      type: "EMAIL_INBOUND",
      entityType: "SHIPPER",
      createdAt: { gte: thirtyDaysAgo },
    },
  });

  let totalSent = outboundEmails.length;
  let uniqueOpens = 0;
  let totalClicks = 0;

  for (const email of outboundEmails) {
    const meta = email.metadata as Record<string, unknown> | null;
    if (meta?.openCount && (meta.openCount as number) > 0) uniqueOpens++;
    if (meta?.clickCount) totalClicks += meta.clickCount as number;
  }

  res.json({
    totalSent,
    uniqueOpens,
    openRate: totalSent > 0 ? Math.round((uniqueOpens / totalSent) * 100) : 0,
    replyRate: totalSent > 0 ? Math.round((replies / totalSent) * 100) : 0,
    totalClicks,
    replies,
    period: "30d",
  });
});

export default router;
