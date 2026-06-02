import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../config/database";
import { sendEmail, wrap } from "../services/emailService";
import { log } from "../lib/logger";

// Field names match what the public /shippers quote form actually sends
// (companyName / contactName, combined "City, State" origin + destination free-text,
// freightType / estimatedWeight / specialRequirements). The prior schema required
// name/company/originState/destCity/destState and rejected every real submission with
// a 400 — the quote form was silently broken. v3.8.amu realigns the contract.
const quoteRequestSchema = z.object({
  companyName: z.string().min(1).max(200),
  contactName: z.string().min(1).max(200),
  email: z.string().email().max(200),
  phone: z.string().max(30).optional(),
  originCity: z.string().min(1).max(200),
  destinationCity: z.string().min(1).max(200),
  freightType: z.string().max(50).optional(),
  estimatedWeight: z.string().max(50).optional(),
  pickupDate: z.string().max(30).optional(),
  specialRequirements: z.string().max(2000).optional(),
  source: z.string().max(50).optional(),
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
        name: data.contactName,
        company: data.companyName,
        email: data.email,
        phone: data.phone,
        // The form collects origin/destination as combined "City, State" free text,
        // so they land in the city columns; state columns stay null.
        originCity: data.originCity,
        destCity: data.destinationCity,
        equipment: data.freightType,
        weight: data.estimatedWeight,
        pickupDate: data.pickupDate,
        details: data.specialRequirements,
      },
    });

    // Quote reference derived from the persisted record (mirrors the contact INQ- pattern)
    const referenceNumber = "QTE-" + lead.id.slice(-8).toUpperCase();
    const lane = `${data.originCity} → ${data.destinationCity}`;

    // Notify the lead inbox (fire-and-forget). Sent directly to operations@ — the real
    // shared mailbox the user monitors — rather than the sales@ alias. sales@ aliases TO
    // operations@ anyway, and Resend had auto-suppressed sales@ after early hard bounces
    // (before the alias existed), silently dropping every notification. operations@ is the
    // non-suppressed real mailbox + the single inbox the user wants all leads in. (v3.8.amv)
    sendEmail(
      "operations@silkroutelogistics.ai",
      `[${referenceNumber}] New Quote Request: ${lane}`,
      wrap(`
        <h2 style="color:#0f172a">New Quote Request</h2>
        <p style="font-size:15px;margin:0 0 16px"><strong>Reference:</strong> ${referenceNumber}</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Reference</td><td style="padding:8px;border:1px solid #e2e8f0">${referenceNumber}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Contact</td><td style="padding:8px;border:1px solid #e2e8f0">${data.contactName}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Company</td><td style="padding:8px;border:1px solid #e2e8f0">${data.companyName}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Email</td><td style="padding:8px;border:1px solid #e2e8f0"><a href="mailto:${data.email}">${data.email}</a></td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Phone</td><td style="padding:8px;border:1px solid #e2e8f0">${data.phone || "—"}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Lane</td><td style="padding:8px;border:1px solid #e2e8f0">${lane}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Freight type</td><td style="padding:8px;border:1px solid #e2e8f0">${data.freightType || "—"}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Weight</td><td style="padding:8px;border:1px solid #e2e8f0">${data.estimatedWeight || "—"}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Pickup date</td><td style="padding:8px;border:1px solid #e2e8f0">${data.pickupDate || "—"}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Special requirements</td><td style="padding:8px;border:1px solid #e2e8f0">${data.specialRequirements || "—"}</td></tr>
        </table>
        <p><a href="https://silkroutelogistics.ai/ae/crm.html" style="display:inline-block;background:#d4a574;color:#0f172a;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold">View in CRM</a></p>
      `),
    ).catch((e) => log.error({ err: e }, "[Website] Failed to send lead notification:"));

    // Confirmation to the shipper (fire-and-forget) — carries the quote reference
    sendEmail(
      data.email,
      `We received your quote request — ${referenceNumber} — Silk Route Logistics`,
      wrap(`
        <h2 style="color:#0f172a">Thank you, ${data.contactName}.</h2>
        <p>We've received your freight quote request and a dedicated Account Executive will get back to you during business hours (Monday&ndash;Friday, 7:00 AM &ndash; 7:00 PM Eastern).</p>
        <p style="font-size:15px"><strong>Your quote reference is ${referenceNumber}.</strong> Please reference it in any follow-up.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Lane</td><td style="padding:8px;border:1px solid #e2e8f0">${lane}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Freight type</td><td style="padding:8px;border:1px solid #e2e8f0">${data.freightType || "Any"}</td></tr>
        </table>
        <p>If it's urgent, call us at <strong>(269) 220-6760</strong>.</p>
      `),
    ).catch((e) => log.error({ err: e }, "[Website] Failed to send lead confirmation:"));

    log.info(`[Website] New quote request: ${lead.id} (${referenceNumber}) — ${data.companyName} — ${lane}`);
    res.status(201).json({ success: true, id: lead.id, referenceNumber });
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
