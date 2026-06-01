import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../config/database";
import { sendEmail, wrap } from "../services/emailService";
import { log } from "../lib/logger";

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
    ).catch((e) => log.error({ err: e }, "[Website] Failed to send lead notification:"));

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
        <p>In the meantime, feel free to call us at <strong>(269) 220-6760</strong> for immediate assistance.</p>
      `),
    ).catch((e) => log.error({ err: e }, "[Website] Failed to send lead confirmation:"));

    log.info(`[Website] New quote request: ${lead.id} — ${data.company} — ${data.originCity},${data.originState} → ${data.destCity},${data.destState}`);
    res.status(201).json({ success: true, id: lead.id });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: err.errors });
    }
    log.error({ err: err }, "[Website] Lead creation error:");
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

    // Friendly inquiry number derived from the persisted record (no schema change;
    // mirrors the carrier APP-XXXXXXXX reference pattern). Shown to the submitter
    // on-screen + in their confirmation email, and carried in the operations notice.
    const inquiryNumber = "INQ-" + lead.id.slice(-8).toUpperCase();
    const inquiryTypeLabel = data.inquiryType.replace(/_/g, " ");

    // Notify operations (fire-and-forget) — leads with the inquiry number + sender email
    sendEmail(
      "operations@silkroutelogistics.ai",
      `[${inquiryNumber}] Website Contact: ${inquiryTypeLabel} — ${data.name}`,
      wrap(`
        <h2 style="color:#0f172a">New Contact Form Submission</h2>
        <p style="font-size:15px;margin:0 0 16px"><strong>Inquiry number:</strong> ${inquiryNumber}</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Inquiry #</td><td style="padding:8px;border:1px solid #e2e8f0">${inquiryNumber}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Name</td><td style="padding:8px;border:1px solid #e2e8f0">${data.name}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Company</td><td style="padding:8px;border:1px solid #e2e8f0">${data.company}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Email</td><td style="padding:8px;border:1px solid #e2e8f0"><a href="mailto:${data.email}">${data.email}</a></td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Phone</td><td style="padding:8px;border:1px solid #e2e8f0">${data.phone || "—"}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Type</td><td style="padding:8px;border:1px solid #e2e8f0">${inquiryTypeLabel}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Message</td><td style="padding:8px;border:1px solid #e2e8f0">${data.message}</td></tr>
        </table>
        <p>Reply directly to ${data.email}, referencing ${inquiryNumber}.</p>
      `),
    ).catch((e) => log.error({ err: e }, "[Website] Failed to send contact notification:"));

    // Confirmation to the submitter (fire-and-forget) — gives them the inquiry number in writing
    sendEmail(
      data.email,
      `We received your message — ${inquiryNumber} — Silk Route Logistics`,
      wrap(`
        <h2 style="color:#0f172a">Thank you for contacting us, ${data.name}.</h2>
        <p>We've received your message and a member of our team will get back to you during business hours (Monday&ndash;Friday, 7:00 AM &ndash; 7:00 PM Eastern).</p>
        <p style="font-size:15px"><strong>Your inquiry number is ${inquiryNumber}.</strong> Please reference it in any follow-up.</p>
        <p>If it's urgent, call us at <strong>(269) 220-6760</strong>.</p>
      `),
    ).catch((e) => log.error({ err: e }, "[Website] Failed to send contact confirmation:"));

    log.info(`[Website] Contact submission: ${lead.id} (${inquiryNumber}) — ${data.inquiryType} — ${data.name}`);
    res.status(201).json({ success: true, id: lead.id, inquiryNumber });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: err.errors });
    }
    log.error({ err: err }, "[Website] Contact submission error:");
    res.status(500).json({ error: "Failed to submit contact form" });
  }
}
