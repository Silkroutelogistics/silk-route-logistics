import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../config/database";
import { sendEmail, wrap } from "../services/emailService";

const quoteRequestSchema = z.object({
  name: z.string().min(1).max(200),
  company: z.string().min(1).max(200),
  email: z.string().email().max(200),
  phone: z.string().max(30).optional(),
  originCity: z.string().min(1).max(100),
  originState: z.string().min(1).max(50),
  destCity: z.string().min(1).max(100),
  destState: z.string().min(1).max(50),
  equipment: z.string().max(50).optional(),
  weight: z.string().max(50).optional(),
  pickupDate: z.string().max(30).optional(),
  details: z.string().max(2000).optional(),
});

const contactSchema = z.object({
  name: z.string().min(1).max(200),
  company: z.string().min(1).max(200),
  email: z.string().email().max(200),
  phone: z.string().max(30).optional(),
  inquiryType: z.string().min(1).max(50),
  message: z.string().min(1).max(5000),
});

/**
 * POST /api/leads/website — Shipper quote request from public website
 */
export async function createWebsiteLead(req: Request, res: Response) {
  try {
    const data = quoteRequestSchema.parse(req.body);

    const lead = await prisma.websiteLead.create({
      data: {
        type: "quote_request",
        name: data.name,
        company: data.company,
        email: data.email,
        phone: data.phone,
        originCity: data.originCity,
        originState: data.originState,
        destCity: data.destCity,
        destState: data.destState,
        equipment: data.equipment,
        weight: data.weight,
        pickupDate: data.pickupDate,
        details: data.details,
      },
    });

    // Notify sales team (fire-and-forget)
    sendEmail(
      "sales@silkroutelogistics.ai",
      `New Quote Request: ${data.originCity}, ${data.originState} → ${data.destCity}, ${data.destState}`,
      wrap(`
        <h2 style="color:#0f172a">New Quote Request</h2>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Name</td><td style="padding:8px;border:1px solid #e2e8f0">${data.name}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Company</td><td style="padding:8px;border:1px solid #e2e8f0">${data.company}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Email</td><td style="padding:8px;border:1px solid #e2e8f0">${data.email}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Phone</td><td style="padding:8px;border:1px solid #e2e8f0">${data.phone || "—"}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Route</td><td style="padding:8px;border:1px solid #e2e8f0">${data.originCity}, ${data.originState} → ${data.destCity}, ${data.destState}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Equipment</td><td style="padding:8px;border:1px solid #e2e8f0">${data.equipment || "—"}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Weight</td><td style="padding:8px;border:1px solid #e2e8f0">${data.weight || "—"}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Pickup Date</td><td style="padding:8px;border:1px solid #e2e8f0">${data.pickupDate || "—"}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Details</td><td style="padding:8px;border:1px solid #e2e8f0">${data.details || "—"}</td></tr>
        </table>
        <p><a href="https://silkroutelogistics.ai/ae/crm.html" style="display:inline-block;background:#d4a574;color:#0f172a;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold">View in CRM</a></p>
      `),
    ).catch((e) => console.error("[Website] Failed to send lead notification:", e.message));

    // Send confirmation to shipper (fire-and-forget)
    sendEmail(
      data.email,
      "We received your quote request — Silk Route Logistics",
      wrap(`
        <h2 style="color:#0f172a">Thank You, ${data.name}!</h2>
        <p>We've received your freight quote request and our team is on it. You'll hear from us within 15 minutes during business hours.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Route</td><td style="padding:8px;border:1px solid #e2e8f0">${data.originCity}, ${data.originState} → ${data.destCity}, ${data.destState}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Equipment</td><td style="padding:8px;border:1px solid #e2e8f0">${data.equipment || "Any"}</td></tr>
        </table>
        <p>In the meantime, feel free to call us at <strong>(312) 555-0175</strong> for immediate assistance.</p>
      `),
    ).catch((e) => console.error("[Website] Failed to send lead confirmation:", e.message));

    console.log(`[Website] New quote request: ${lead.id} — ${data.company} — ${data.originCity},${data.originState} → ${data.destCity},${data.destState}`);
    res.status(201).json({ success: true, id: lead.id });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: err.errors });
    }
    console.error("[Website] Lead creation error:", err.message);
    res.status(500).json({ error: "Failed to submit quote request" });
  }
}

/**
 * POST /api/contact/website — Contact form submission from public website
 */
export async function createContactSubmission(req: Request, res: Response) {
  try {
    const data = contactSchema.parse(req.body);

    const lead = await prisma.websiteLead.create({
      data: {
        type: "contact",
        name: data.name,
        company: data.company,
        email: data.email,
        phone: data.phone,
        inquiryType: data.inquiryType,
        message: data.message,
      },
    });

    // Notify admin (fire-and-forget)
    sendEmail(
      "info@silkroutelogistics.ai",
      `Website Contact: ${data.inquiryType.replace(/_/g, " ")} — ${data.name}`,
      wrap(`
        <h2 style="color:#0f172a">New Contact Form Submission</h2>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Name</td><td style="padding:8px;border:1px solid #e2e8f0">${data.name}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Company</td><td style="padding:8px;border:1px solid #e2e8f0">${data.company}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Email</td><td style="padding:8px;border:1px solid #e2e8f0"><a href="mailto:${data.email}">${data.email}</a></td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Phone</td><td style="padding:8px;border:1px solid #e2e8f0">${data.phone || "—"}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Type</td><td style="padding:8px;border:1px solid #e2e8f0">${data.inquiryType.replace(/_/g, " ")}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Message</td><td style="padding:8px;border:1px solid #e2e8f0">${data.message}</td></tr>
        </table>
        <p>Reply directly to this email or contact the sender at ${data.email}.</p>
      `),
    ).catch((e) => console.error("[Website] Failed to send contact notification:", e.message));

    console.log(`[Website] Contact submission: ${lead.id} — ${data.inquiryType} — ${data.name}`);
    res.status(201).json({ success: true, id: lead.id });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: err.errors });
    }
    console.error("[Website] Contact submission error:", err.message);
    res.status(500).json({ error: "Failed to submit contact form" });
  }
}
