import { Router, Response } from "express";
import { Resend } from "resend";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { env } from "../config/env";
import { prisma } from "../config/database";
import { TEMPLATE_MAP } from "../templates/emailTemplates";

const router = Router();
const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

router.use(authenticate);
router.use(authorize("ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS", "AE") as any);

// GET /api/email/templates — list available templates
router.get("/templates", (_req: any, res: Response) => {
  res.json({
    templates: [
      { id: "introduction", name: "Introduction", params: ["recipientName", "senderName", "companyName"] },
      { id: "follow_up", name: "Follow Up", params: ["recipientName", "senderName", "context"] },
      { id: "rate_quote", name: "Rate Quote", params: ["recipientName", "senderName", "lanes", "rate"] },
      { id: "load_confirmation", name: "Load Confirmation", params: ["recipientName", "loadRef", "origin", "dest", "pickup", "delivery", "rate"] },
      { id: "invoice", name: "Invoice", params: ["recipientName", "invoiceNumber", "amount", "dueDate"] },
      { id: "thank_you", name: "Thank You", params: ["recipientName", "senderName", "reason"] },
    ],
  });
});

// POST /api/email/send — send an email using a template
router.post("/send", async (req: any, res: Response) => {
  const { to, subject, template, templateParams, customBody, entityType, entityId, loadId } = req.body;

  if (!to || !subject) {
    return res.status(400).json({ error: "to and subject are required" });
  }

  let html: string;

  if (template && TEMPLATE_MAP[template]) {
    const params = templateParams || [];
    html = TEMPLATE_MAP[template](...params);
  } else if (customBody) {
    // Wrap custom body in SRL branding
    html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden">
        <tr><td style="background:#0D1B2A;padding:24px 32px;text-align:center">
          <h1 style="margin:0;color:#C8963E;font-size:22px;font-weight:700">Silk Route Logistics</h1>
        </td></tr>
        <tr><td style="padding:32px;color:#475569;font-size:15px;line-height:1.6">${customBody}</td></tr>
        <tr><td style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;text-align:center;font-size:12px;color:#94a3b8">
          Silk Route Logistics &middot; Moving Freight, Building Futures
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  } else {
    return res.status(400).json({ error: "template or customBody is required" });
  }

  // Send email
  if (resend) {
    try {
      const { data, error } = await resend.emails.send({
        from: `Silk Route Logistics <${env.EMAIL_FROM}>`,
        to,
        subject,
        html,
      });
      if (error) {
        return res.status(500).json({ error: error.message });
      }

      // Log as communication
      if (entityType && entityId) {
        await prisma.communication.create({
          data: {
            type: "EMAIL_OUTBOUND",
            direction: "OUTBOUND",
            entityType,
            entityId,
            loadId: loadId || null,
            from: env.EMAIL_FROM,
            to,
            subject,
            body: html,
            userId: req.user!.id,
          },
        });
      }

      res.json({ success: true, emailId: data?.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  } else {
    // Dev mode: log and return success
    console.log(`[Email][Dev] To: ${to} | Subject: ${subject}`);

    if (entityType && entityId) {
      await prisma.communication.create({
        data: {
          type: "EMAIL_OUTBOUND",
          direction: "OUTBOUND",
          entityType,
          entityId,
          loadId: loadId || null,
          from: env.EMAIL_FROM,
          to,
          subject,
          body: html,
          userId: req.user!.id,
        },
      });
    }

    res.json({ success: true, emailId: "dev-" + Date.now(), dev: true });
  }
});

// POST /api/email/preview — preview a template (returns HTML)
router.post("/preview", (req: any, res: Response) => {
  const { template, templateParams } = req.body;
  if (!template || !TEMPLATE_MAP[template]) {
    return res.status(400).json({ error: "Invalid template" });
  }
  const params = templateParams || [];
  const html = TEMPLATE_MAP[template](...params);
  res.json({ html });
});

export default router;
