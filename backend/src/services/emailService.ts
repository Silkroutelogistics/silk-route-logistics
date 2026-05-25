import { Resend } from "resend";
import { env } from "../config/env";
import { log } from "../lib/logger";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
const fromEmail = env.EMAIL_FROM;

log.info(`[Email] Resend configured: ${!!resend}, from: ${fromEmail}`);

interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export async function sendEmail(to: string, subject: string, html: string, attachments?: EmailAttachment[], options?: { replyTo?: string; fromName?: string; cc?: string | string[] }): Promise<string | undefined> {
  if (resend) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const { data, error } = await resend.emails.send({
          from: `${options?.fromName || "Silk Route Logistics"} <${fromEmail}>`,
          replyTo: options?.replyTo || undefined,
          to,
          cc: options?.cc || undefined,
          subject,
          html,
          headers: {
            "List-Unsubscribe": `<mailto:unsubscribe@silkroutelogistics.ai?subject=unsubscribe>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
          attachments: attachments?.map((a) => ({
            filename: a.filename,
            content: a.content,
            content_type: a.contentType || "application/pdf",
          })),
        });
        if (error) {
          if (error.message.includes("rate limit") && attempt < 2) {
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
            continue;
          }
          log.error(`[Email] Resend error to ${to}: ${error.message}`);
          throw new Error(error.message);
        }
        log.info(`[Email] Sent to ${to}: ${subject} (id: ${data?.id})`);
        return data?.id; // Return Resend email ID for tracking
      } catch (err: any) {
        if (err.message?.includes("rate limit") && attempt < 2) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        log.error(`[Email] FAILED to send to ${to}: ${err.message}`);
        throw err;
      }
    }
  } else {
    log.info(`[Email][NoAPI] To: ${to} | Subject: ${subject}${attachments ? ` | ${attachments.length} attachment(s)` : ""}`);
  }
  return undefined;
}

// Sprint 45a (v3.8.abb) — Brand chrome reconciled to srl-brand-design skill
// canonical per references/tokens.md (Pattern 6 sub-rule c gated):
//   --navy      #0A2540 (was #0f172a Tailwind slate-900)
//   --navy-700  #15365A (was #1e293b Tailwind slate-800)
//   --gold      #C5A572 (was #d4a574 off-canonical olive — STRUCTURAL role:
//                        rules, dividers, header brand mark)
//   --fg-on-navy-2 #C9D2DE (was #94a3b8 Tailwind slate-400 — footer muted on navy)
//   --navy-100  #E2EAF2 (was #e2e8f0 Tailwind slate-200 — card hairline)
//   #FFFFFF white card surface preserved per email-rendering best practices
//   (cream #FBF7F0 renders inconsistently across Outlook/Gmail/Apple Mail).
//
// Sprint 45-RC-PRE (v3.8.abc) — Item 88 close. Body color canonical applied
// to all 15 legacy email function bodies via three sweeps:
//   color:#0f172a → color:#0A2540 (h2 + body text — 21 occurrences;
//     6 caught by the CTA compound sweep below, 15 standalone)
//   #e2e8f0 → #E2EAF2 (table borders, dividers — 34 occurrences)
//   background:#d4a574;color:#0f172a → background:#BA7517;color:#FFFFFF
//     (CTA buttons — 6 occurrences; --gold-dark emphasis per skill canonical)
// Status colors (#dc2626 / #22c55e / #f59e0b / #3b82f6) DELIBERATELY
// preserved as Tailwind per Sprint 45-RC-PRE D2 — functional legibility
// of alert signals beats brand-token consistency on status semantics.
//
// Item 91 close — carrier-facing URLs aligned to /carrier/dashboard/* per
// Sprint 44c precedent (sendPreTracingEmail "Update Status",
// sendAutoInvoiceEmail "View Invoice", sendRateConfirmationEmail "View in
// Dashboard"). AE-facing URLs (sendLateAlertEmail tracking,
// sendRiskAlertEmail / sendFallOffAlertEmail /ae/loads.html) preserved at
// AE Console paths per audience-routing canonical.
//
// Item 92 LOG OPEN — residual off-skill hex codes + URL surfaces outside
// directive scope, surfaced via Pattern 7 always-fire enumeration:
//   - #d4a574 standalone border in sendOtpEmail OTP code display
//   - #94a3b8 muted paragraph text in sendQpVarianceReport +
//     sendPasswordReset
//   - #f1f5f9 OTP code background card surface
//   - /ae/loads.html legacy AE HTML paths in sendRiskAlertEmail +
//     sendFallOffAlertEmail (separate AE Console URL canonical class)
//   - sendPasswordExpiryReminder /dashboard/settings — recipient role
//     unknown; requires per-recipient routing
// Surface for Sprint 47+ mass-cleanup; not BKN-blocking.
const brandHeader = `
  <div style="background:#0A2540;padding:24px;text-align:center;border-bottom:3px solid #C5A572">
    <h1 style="color:#C5A572;margin:0;font-family:Georgia,serif">Silk Route Logistics</h1>
  </div>`;

const brandFooter = `
  <div style="background:#15365A;padding:16px;text-align:center;color:#C9D2DE;font-size:12px">
    <p style="margin:0">Silk Route Logistics &bull; silkroutelogistics.ai</p>
  </div>`;

export function wrap(body: string) {
  return `<div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #E2EAF2">
    ${brandHeader}
    <div style="padding:24px">${body}</div>
    ${brandFooter}
  </div>`;
}

export async function sendPreTracingEmail(
  carrierEmail: string,
  carrierName: string,
  loadRef: string,
  origin: string,
  dest: string,
  pickupDate: Date,
  hoursUntilPickup: number,
) {
  const timeLabel = hoursUntilPickup <= 24 ? "24 hours" : "48 hours";
  const html = wrap(`
    <h2 style="color:#0A2540">Pre-Tracing Update Required</h2>
    <p>Hi ${carrierName},</p>
    <p>Your pickup for load <strong>${loadRef}</strong> is in approximately <strong>${timeLabel}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Origin</td><td style="padding:8px;border:1px solid #E2EAF2">${origin}</td></tr>
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Destination</td><td style="padding:8px;border:1px solid #E2EAF2">${dest}</td></tr>
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Pickup Date</td><td style="padding:8px;border:1px solid #E2EAF2">${pickupDate.toLocaleDateString()}</td></tr>
    </table>
    <p><strong>Are you on time for pickup?</strong> Please log in to update your status.</p>
    <a href="https://silkroutelogistics.ai/carrier/dashboard/loads" style="display:inline-block;background:#BA7517;color:#FFFFFF;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:8px">Update Status</a>
  `);

  await sendEmail(carrierEmail, `Pre-Tracing: Load ${loadRef} pickup in ${timeLabel}`, html);
}

export async function sendAutoInvoiceEmail(
  carrierEmail: string,
  carrierName: string,
  loadRef: string,
  invoiceNumber: string,
  amount: number,
) {
  const html = wrap(`
    <h2 style="color:#0A2540">Invoice Auto-Generated</h2>
    <p>Hi ${carrierName},</p>
    <p>Load <strong>${loadRef}</strong> has been delivered. An invoice has been automatically generated:</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Invoice #</td><td style="padding:8px;border:1px solid #E2EAF2">${invoiceNumber}</td></tr>
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Amount</td><td style="padding:8px;border:1px solid #E2EAF2">$${amount.toLocaleString()}</td></tr>
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Due Date</td><td style="padding:8px;border:1px solid #E2EAF2">Net 30</td></tr>
    </table>
    <a href="https://silkroutelogistics.ai/carrier/dashboard/payments" style="display:inline-block;background:#BA7517;color:#FFFFFF;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:8px">View Payment Status</a>
  `);
  // Sprint 54 (v3.8.acc) Item 11b — URL was canonicalized to
  // /carrier/dashboard/invoices in Sprint 45-RC-PRE (§13.3 Item 91) but the
  // page was never built. Carrier-side payment viewing lives at
  // /carrier/dashboard/payments. Label updated to match destination.

  await sendEmail(carrierEmail, `Invoice ${invoiceNumber} generated for load ${loadRef}`, html);
}

export async function sendLateAlertEmail(
  brokerEmail: string,
  brokerName: string,
  loadRef: string,
  shipmentNumber: string,
  lastLocation: string | null,
  hoursSinceUpdate: number,
) {
  const html = wrap(`
    <h2 style="color:#dc2626">Late Alert</h2>
    <p>Hi ${brokerName},</p>
    <p>Shipment <strong>${shipmentNumber}</strong> (Load ${loadRef}) has not reported movement in <strong>${Math.round(hoursSinceUpdate)} hours</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Last Known Location</td><td style="padding:8px;border:1px solid #E2EAF2">${lastLocation || "Unknown"}</td></tr>
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Hours Since Update</td><td style="padding:8px;border:1px solid #E2EAF2">${Math.round(hoursSinceUpdate)}h</td></tr>
    </table>
    <p>Please contact the carrier immediately to confirm load status.</p>
    <a href="https://silkroutelogistics.ai/dashboard/tracking" style="display:inline-block;background:#dc2626;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:8px">View in Track & Trace</a>
  `);

  await sendEmail(brokerEmail, `LATE ALERT: Shipment ${shipmentNumber} - No movement in ${Math.round(hoursSinceUpdate)}h`, html);
}

export async function sendOtpEmail(email: string, firstName: string, code: string) {
  const html = wrap(`
    <h2 style="color:#0A2540">Your Verification Code</h2>
    <p>Hi ${firstName},</p>
    <p>Use the following code to complete your sign-in:</p>
    <div style="text-align:center;margin:24px 0">
      <div style="display:inline-block;background:#f1f5f9;border:2px solid #d4a574;border-radius:12px;padding:16px 32px;letter-spacing:12px;font-size:36px;font-family:'Courier New',monospace;font-weight:bold;color:#0A2540">${code}</div>
    </div>
    <p style="color:#64748b;font-size:14px">This code expires in <strong>5 minutes</strong>. If you didn't request this, please ignore this email.</p>
  `);

  await sendEmail(email, `Your SRL Verification Code: ${code}`, html);
}

// v3.8.aje — Email verification gate. Sent post-registration with a
// time-limited token. Click → backend captures click-IP + resolves
// country via geoip-lite → marks emailVerifiedAt → cross-references
// against registrationCountry for the country-jump fraud signal.
// Token lives in OtpCode table with `VERIFY:` prefix (extends the
// existing `RESET:` pattern at otpService.ts:106 — no new schema for
// token storage). 24-hour expiry to accommodate carriers who don't
// check email immediately.
export async function sendEmailVerificationEmail(
  email: string,
  firstName: string,
  verifyUrl: string,
) {
  const html = wrap(`
    <h2 style="color:#0A2540;margin-bottom:4px">Confirm your email</h2>
    <p style="color:#3A4A5F;margin-bottom:24px">Hi ${firstName},</p>
    <p style="color:#3A4A5F">Welcome to the Caravan Partner Program. To complete your application, please confirm this is your email address by clicking the button below.</p>

    <div style="text-align:center;margin:32px 0">
      <a href="${verifyUrl}" style="display:inline-block;background:#BA7517;color:#FBF7F0;padding:14px 36px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:15px">Verify Email Address</a>
    </div>

    <p style="color:#6B7685;font-size:13px;margin-top:24px">Or copy and paste this link into your browser:</p>
    <p style="color:#0A2540;font-size:12px;word-break:break-all;background:#FBF7F0;border:1px solid #EFE6D3;border-radius:6px;padding:10px;font-family:'Courier New',monospace">${verifyUrl}</p>

    <div style="background:#FBEFD4;border:1px solid rgba(176,122,26,0.20);border-radius:8px;padding:14px 16px;margin:24px 0">
      <p style="color:#B07A1A;font-size:13px;margin:0"><strong>This link expires in 24 hours.</strong> If you didn't submit a carrier application with Silk Route Logistics, you can safely ignore this email.</p>
    </div>

    <p style="color:#6B7685;font-size:13px;margin-top:24px">Verifying your email is a one-time step that helps protect your application from impersonation and lets us reach you with status updates as your application moves through compliance review.</p>
  `);

  await sendEmail(email, "Confirm your email — Silk Route Logistics", html);
}

/**
 * Monthly Quick Pay override variance report (v3.7.a) — sent to Wasi on
 * the 1st of each month. Flags the month with a REVIEW SUGGESTED banner
 * when aggregate margin impact exceeds 1.5% of QP revenue.
 */
export async function sendQpVarianceReport(summary: {
  periodStart: Date;
  periodEnd: Date;
  overrideCount: number;
  avgDeltaPp: number;
  totalMarginImpactUsd: number;
  monthlyQpRevenueUsd: number;
  variancePctOfRevenue: number;
  reviewSuggested: boolean;
  byReason: Record<string, number>;
}) {
  const fmtUsd = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const fmtPct = (n: number) => `${n.toFixed(2)}%`;
  const periodLabel = summary.periodStart.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const reasonRows = Object.entries(summary.byReason)
    .map(([k, v]) => `<tr><td style="padding:4px 12px">${k}</td><td style="padding:4px 12px;text-align:right">${v}</td></tr>`)
    .join("");
  const banner = summary.reviewSuggested
    ? `<div style="background:#fef3c7;border:1px solid #f59e0b;padding:12px 16px;border-radius:8px;margin:16px 0;font-weight:600;color:#92400e">⚠ REVIEW SUGGESTED — variance ${fmtPct(summary.variancePctOfRevenue)} exceeds 1.5% threshold.</div>`
    : "";

  const html = wrap(`
    <h2 style="color:#0A2540">Quick Pay Override Variance — ${periodLabel}</h2>
    ${banner}
    <p>Monthly summary of per-load QP fee overrides (${summary.periodStart.toDateString()} → ${summary.periodEnd.toDateString()}).</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
      <tr><td style="padding:6px 12px;color:#64748b">Overrides applied</td><td style="padding:6px 12px;text-align:right;font-weight:600">${summary.overrideCount}</td></tr>
      <tr><td style="padding:6px 12px;color:#64748b">Avg delta from tier default</td><td style="padding:6px 12px;text-align:right;font-weight:600">${summary.avgDeltaPp >= 0 ? "+" : ""}${summary.avgDeltaPp.toFixed(2)} pp</td></tr>
      <tr><td style="padding:6px 12px;color:#64748b">Total margin impact</td><td style="padding:6px 12px;text-align:right;font-weight:600">${fmtUsd(summary.totalMarginImpactUsd)}</td></tr>
      <tr><td style="padding:6px 12px;color:#64748b">Monthly QP revenue</td><td style="padding:6px 12px;text-align:right;font-weight:600">${fmtUsd(summary.monthlyQpRevenueUsd)}</td></tr>
      <tr><td style="padding:6px 12px;color:#64748b">Variance as % of revenue</td><td style="padding:6px 12px;text-align:right;font-weight:600">${fmtPct(summary.variancePctOfRevenue)}</td></tr>
    </table>
    <h3 style="color:#0A2540;margin-top:24px">Breakdown by reason</h3>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr style="border-bottom:2px solid #E2EAF2"><th style="padding:8px 12px;text-align:left">Reason</th><th style="padding:8px 12px;text-align:right">Count</th></tr>
      ${reasonRows}
    </table>
    <p style="color:#94a3b8;font-size:12px;margin-top:24px">Report generated by Silk Route Logistics variance cron. Audit-only — no action required unless the REVIEW SUGGESTED banner is present.</p>
  `);

  await sendEmail("whaider@silkroutelogistics.ai", `QP Override Variance — ${periodLabel}`, html);
}

export async function sendPasswordResetEmail(email: string, firstName: string, resetUrl: string) {
  const html = wrap(`
    <h2 style="color:#0A2540">Reset Your Password</h2>
    <p>Hi ${firstName},</p>
    <p>We received a request to reset your password. Click the button below to choose a new one:</p>
    <div style="text-align:center;margin:24px 0">
      <a href="${resetUrl}" style="display:inline-block;background:#BA7517;color:#FFFFFF;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px">Reset Password</a>
    </div>
    <p style="color:#64748b;font-size:14px">This link expires in <strong>30 minutes</strong>. If you didn't request this, you can safely ignore this email.</p>
    <p style="color:#94a3b8;font-size:12px;margin-top:16px;word-break:break-all">Or copy this link: ${resetUrl}</p>
  `);

  await sendEmail(email, "Reset your password — Silk Route Logistics", html);
}

export async function sendRateConfirmationEmail(
  carrierEmail: string,
  carrierName: string,
  loadRef: string,
  pdfBuffer: Buffer,
  customMessage?: string,
) {
  const html = wrap(`
    <h2 style="color:#0A2540">Rate Confirmation — Load ${loadRef}</h2>
    <p>Hi ${carrierName},</p>
    ${customMessage ? `<p>${customMessage}</p>` : ""}
    <p>Please find the attached Rate Confirmation for load <strong>${loadRef}</strong>.</p>
    <p>Review the details and sign the document to confirm acceptance of this load.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Load Reference</td><td style="padding:8px;border:1px solid #E2EAF2">${loadRef}</td></tr>
    </table>
    <p>If you have any questions, please contact your dispatcher or reply to this email.</p>
    <a href="https://silkroutelogistics.ai/carrier/dashboard/loads" style="display:inline-block;background:#BA7517;color:#FFFFFF;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:8px">View in Dashboard</a>
  `);

  await sendEmail(
    carrierEmail,
    `Rate Confirmation: Load ${loadRef} — Silk Route Logistics`,
    html,
    [{ filename: `RC-${loadRef}.pdf`, content: pdfBuffer }],
  );
}

/**
 * C.3 — Risk Alert Email (RED level)
 */
export async function sendRiskAlertEmail(
  brokerEmail: string,
  brokerName: string,
  loadRef: string,
  risk: { score: number; level: string; factors: { factor: string; points: number; description: string }[] },
) {
  const factorRows = risk.factors.map(
    (f) => `<tr><td style="padding:8px;border:1px solid #E2EAF2">${f.description}</td><td style="padding:8px;border:1px solid #E2EAF2;text-align:center;font-weight:bold;color:#dc2626">+${f.points}</td></tr>`
  ).join("");

  const html = wrap(`
    <h2 style="color:#dc2626">RISK RED ALERT — Load ${loadRef}</h2>
    <p>Hi ${brokerName},</p>
    <p>Load <strong>${loadRef}</strong> has been flagged with a <strong style="color:#dc2626">RED risk level</strong> (score: ${risk.score}).</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr style="background:#fef2f2"><th style="padding:8px;border:1px solid #E2EAF2;text-align:left">Risk Factor</th><th style="padding:8px;border:1px solid #E2EAF2;width:60px">Points</th></tr>
      ${factorRows}
    </table>
    <p><strong>Immediate action required.</strong> Review the load and take corrective measures.</p>
    <a href="https://silkroutelogistics.ai/ae/loads.html" style="display:inline-block;background:#dc2626;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:8px">View Load Board</a>
  `);

  await sendEmail(brokerEmail, `RISK RED: Load ${loadRef} — Score ${risk.score}`, html);
}

/**
 * C.4 — Fall-Off Alert Email
 */
export async function sendFallOffAlertEmail(
  brokerEmail: string,
  brokerName: string,
  loadRef: string,
  carrierName: string,
  origin: string,
  dest: string,
) {
  const html = wrap(`
    <h2 style="color:#dc2626">CARRIER FALL-OFF — Load ${loadRef}</h2>
    <p>Hi ${brokerName},</p>
    <p><strong>${carrierName}</strong> has fallen off load <strong>${loadRef}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Route</td><td style="padding:8px;border:1px solid #E2EAF2">${origin} → ${dest}</td></tr>
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Status</td><td style="padding:8px;border:1px solid #E2EAF2;color:#dc2626;font-weight:bold">Recovery In Progress</td></tr>
    </table>
    <p>The system is automatically contacting backup carriers. Monitor the load board for updates.</p>
    <a href="https://silkroutelogistics.ai/ae/loads.html" style="display:inline-block;background:#dc2626;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:8px">View Load Board</a>
  `);

  await sendEmail(brokerEmail, `CARRIER FALL-OFF: Load ${loadRef} — Recovery Active`, html);
}

/**
 * C.5 — Sequence Email Sender (wraps sendEmail for sequence tracking)
 */
export async function sendSequenceEmail(
  to: string,
  subject: string,
  html: string,
  sequenceId: string,
  options?: { fromName?: string; replyTo?: string },
) {
  await sendEmail(to, subject, html, undefined, {
    fromName: options?.fromName,
    replyTo: options?.replyTo,
  });
  log.info(`[Sequence][Email] Sent to ${to}: ${subject} (seq: ${sequenceId}, from: ${options?.fromName || "default"})`);
}

// ─── Shipper Notification Templates ──────────────────────────

export function shipperPickupHtml(loadRef: string, origin: string, dest: string, carrierName: string, eta: string) {
  return wrap(`
    <h2 style="color:#0A2540">Shipment Picked Up</h2>
    <p>Your shipment <strong>${loadRef}</strong> has been picked up and is now in transit.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Reference</td><td style="padding:8px;border:1px solid #E2EAF2">${loadRef}</td></tr>
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Origin</td><td style="padding:8px;border:1px solid #E2EAF2">${origin}</td></tr>
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Destination</td><td style="padding:8px;border:1px solid #E2EAF2">${dest}</td></tr>
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Carrier</td><td style="padding:8px;border:1px solid #E2EAF2">${carrierName}</td></tr>
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">ETA</td><td style="padding:8px;border:1px solid #E2EAF2">${eta}</td></tr>
    </table>
    <p>You will receive regular transit updates throughout the journey.</p>
  `);
}

export function shipperTransitHtml(
  loadRef: string, origin: string, dest: string, lastLocation: string,
  etaStr: string, percentComplete: number,
  checkCalls: { location: string; status: string; createdAt: string }[],
) {
  const ccRows = checkCalls.map(
    (cc) => `<tr><td style="padding:6px 8px;border:1px solid #E2EAF2;font-size:13px">${cc.createdAt}</td><td style="padding:6px 8px;border:1px solid #E2EAF2;font-size:13px">${cc.location || "—"}</td><td style="padding:6px 8px;border:1px solid #E2EAF2;font-size:13px">${cc.status}</td></tr>`
  ).join("");

  const barColor = percentComplete >= 75 ? "#22c55e" : percentComplete >= 40 ? "#f59e0b" : "#3b82f6";
  return wrap(`
    <h2 style="color:#0A2540">Transit Update — ${loadRef}</h2>
    <p>Here is the latest tracking update for your shipment.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Route</td><td style="padding:8px;border:1px solid #E2EAF2">${origin} → ${dest}</td></tr>
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Current Location</td><td style="padding:8px;border:1px solid #E2EAF2">${lastLocation}</td></tr>
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">ETA</td><td style="padding:8px;border:1px solid #E2EAF2">${etaStr}</td></tr>
    </table>
    <div style="margin:16px 0">
      <div style="font-size:13px;font-weight:bold;margin-bottom:4px">Progress: ${percentComplete}%</div>
      <div style="background:#E2EAF2;border-radius:8px;height:12px;overflow:hidden">
        <div style="background:${barColor};height:100%;width:${percentComplete}%;border-radius:8px"></div>
      </div>
    </div>
    ${checkCalls.length > 0 ? `
    <h3 style="color:#0A2540;font-size:14px;margin-top:20px">Recent Check Calls</h3>
    <table style="width:100%;border-collapse:collapse;margin:8px 0">
      <tr style="background:#f8fafc"><th style="padding:6px 8px;border:1px solid #E2EAF2;text-align:left;font-size:12px">Time</th><th style="padding:6px 8px;border:1px solid #E2EAF2;text-align:left;font-size:12px">Location</th><th style="padding:6px 8px;border:1px solid #E2EAF2;text-align:left;font-size:12px">Status</th></tr>
      ${ccRows}
    </table>` : ""}
  `);
}

export function shipperDeliveryHtml(loadRef: string, origin: string, dest: string, deliveredAt: string) {
  return wrap(`
    <h2 style="color:#22c55e">Shipment Delivered</h2>
    <p>Your shipment <strong>${loadRef}</strong> has been delivered successfully.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Reference</td><td style="padding:8px;border:1px solid #E2EAF2">${loadRef}</td></tr>
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Route</td><td style="padding:8px;border:1px solid #E2EAF2">${origin} → ${dest}</td></tr>
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Delivered At</td><td style="padding:8px;border:1px solid #E2EAF2">${deliveredAt}</td></tr>
    </table>
    <p>Proof of Delivery (POD) will be sent to you once it has been validated.</p>
  `);
}

export function shipperPODHtml(loadRef: string, podUrl: string) {
  return wrap(`
    <h2 style="color:#0A2540">Proof of Delivery Available — ${loadRef}</h2>
    <p>The Proof of Delivery for shipment <strong>${loadRef}</strong> has been validated and is now available.</p>
    <div style="text-align:center;margin:24px 0">
      <a href="${podUrl}" style="display:inline-block;background:#BA7517;color:#FFFFFF;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px">Download POD</a>
    </div>
    <p style="color:#64748b;font-size:13px">If you have any questions about this delivery, please contact your account representative.</p>
  `);
}

export async function sendRemittanceEmail(carrierEmail: string, data: {
  carrierName: string;
  loadRef: string;
  lane: string;
  grossAmount: number;
  qpFeeRate: number;
  qpFeeAmount: number;
  netPayment: number;
  paymentMethod: string;
  estimatedArrival: string;
}) {
  const html = wrap(`
    <h2 style="color:#0A2540">Payment Remittance</h2>
    <p>Hi ${data.carrierName},</p>
    <p>Payment processed for Load <strong>${data.loadRef}</strong> (${data.lane}):</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Gross Amount</td><td style="padding:8px;border:1px solid #E2EAF2">$${data.grossAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Quick Pay Fee (${data.qpFeeRate}%)</td><td style="padding:8px;border:1px solid #E2EAF2;color:#dc2626">-$${data.qpFeeAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
      <tr style="background:#f0fdf4"><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold;font-size:16px">Net Payment</td><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold;font-size:16px;color:#22c55e">$${data.netPayment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
    </table>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Payment Method</td><td style="padding:8px;border:1px solid #E2EAF2">${data.paymentMethod}</td></tr>
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Estimated Arrival</td><td style="padding:8px;border:1px solid #E2EAF2">${data.estimatedArrival}</td></tr>
    </table>
    <p style="color:#64748b;font-size:14px">Thank you for hauling with Silk Route Logistics.</p>
  `);

  await sendEmail(carrierEmail, `Payment Remittance: Load ${data.loadRef} — $${data.netPayment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, html);
}

export async function sendPasswordExpiryReminder(email: string, firstName: string, daysLeft: number) {
  const urgency = daysLeft <= 2 ? "#dc2626" : daysLeft <= 7 ? "#f59e0b" : "#3b82f6";
  const html = wrap(`
    <h2 style="color:${urgency}">Password Expiring Soon</h2>
    <p>Hi ${firstName},</p>
    <p>Your Silk Route Logistics password will expire in <strong style="color:${urgency}">${daysLeft} day${daysLeft !== 1 ? "s" : ""}</strong>.</p>
    <p>Please update your password before it expires to avoid being locked out.</p>
    <a href="https://silkroutelogistics.ai/dashboard/settings" style="display:inline-block;background:#BA7517;color:#FFFFFF;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:8px">Change Password</a>
    <p style="color:#64748b;font-size:13px;margin-top:16px">If your password expires, you'll be prompted to create a new one at your next login.</p>
  `);

  await sendEmail(email, `Password expires in ${daysLeft} days — Silk Route Logistics`, html);
}

// ─── Tender Notification Templates (Sprint 45a, v3.8.abb) ──────────────
//
// Carrier and AE-facing tender lifecycle emails. Use skill-canonical chrome
// via wrap() (Sub-phase 0 reconciled in this commit) + skill-canonical
// CTA color --gold-dark #BA7517 per references/tokens.md ("EMPHASIS — CTAs,
// hover, labels"). Reply-To: operations@silkroutelogistics.ai per Q1
// ratification — carrier replies route to the operations inbox.
//
// Subject convention per Q2: "Tender <Action>: {ref} ({origin} → {dest})"
//
// Carrier email source per Q3 (Pattern 6 sub-rule c gated): primary
// carrierProfile.contactEmail, fallback user.email. Resolution happens at
// the notifyTenderAction call site (notificationService.ts), not here.

export interface TenderOfferedEmailParams {
  to: string;
  cc?: string;
  ref: string;
  originName: string;   // "San Diego, CA"
  destName: string;     // "Northlake, TX"
  rate: number;
  expiresAt: Date | string;
  equipment: string;
  weight?: number | null;
  milesEstimate?: number | null;
  transitDays?: number | null;
  dollarsPerMile?: number | null;
  dispatchNotes?: string | null;
}

export async function sendTenderOfferedEmail(params: TenderOfferedEmailParams): Promise<string | undefined> {
  const expiry = typeof params.expiresAt === "string" ? new Date(params.expiresAt) : params.expiresAt;
  const expiryLabel = expiry.toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    hour12: true, timeZone: "America/New_York",
  });
  const rateFmt = `$${params.rate.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  // D5 — Lane economics: $/mile + transit days (broker industry standard)
  const economicsRow = params.milesEstimate
    ? `<tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Miles</td><td style="padding:8px;border:1px solid #E2EAF2">${params.milesEstimate.toLocaleString()} mi${params.dollarsPerMile ? ` &middot; $${params.dollarsPerMile.toFixed(2)}/mi` : ""}</td></tr>`
    : "";
  const transitRow = params.transitDays
    ? `<tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Transit</td><td style="padding:8px;border:1px solid #E2EAF2">${params.transitDays.toFixed(1)} days</td></tr>`
    : "";
  const weightRow = params.weight
    ? `<tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Weight</td><td style="padding:8px;border:1px solid #E2EAF2">${params.weight.toLocaleString()} lbs</td></tr>`
    : "";
  const dispatchNotesBlock = params.dispatchNotes
    ? `<p style="background:#FAEEDA;border-left:3px solid #BA7517;padding:12px;margin:16px 0;font-size:14px"><strong>Dispatch notes:</strong> ${params.dispatchNotes}</p>`
    : "";

  const html = wrap(`
    <h2 style="color:#0A2540;margin:0 0 16px">You've been offered a load</h2>
    <p>A new tender is available for your fleet. Review the details below and respond before it expires.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Reference</td><td style="padding:8px;border:1px solid #E2EAF2">${params.ref}</td></tr>
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Lane</td><td style="padding:8px;border:1px solid #E2EAF2">${params.originName} &rarr; ${params.destName}</td></tr>
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Equipment</td><td style="padding:8px;border:1px solid #E2EAF2">${params.equipment}</td></tr>
      ${weightRow}
      ${economicsRow}
      ${transitRow}
      <tr style="background:#FAEEDA"><td style="padding:8px;border:1px solid #C5A572;font-weight:bold;color:#BA7517">Offered Rate</td><td style="padding:8px;border:1px solid #C5A572;font-weight:bold;font-size:16px;color:#0A2540">${rateFmt}</td></tr>
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Expires</td><td style="padding:8px;border:1px solid #E2EAF2">${expiryLabel} ET</td></tr>
    </table>
    ${dispatchNotesBlock}
    <p>Log in to your carrier portal to accept or decline. If you have questions, reply to this email and our operations team will respond.</p>
    <a href="https://silkroutelogistics.ai/carrier/login?next=%2Fcarrier%2Fdashboard%2Ftenders" style="display:inline-block;background:#BA7517;color:#FFFFFF;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:8px">Log in to view tender</a>
  `);

  return sendEmail(
    params.to,
    `Tender Offered: ${params.ref} (${params.originName} → ${params.destName})`,
    html,
    undefined,
    {
      replyTo: "operations@silkroutelogistics.ai",
      cc: params.cc,
    },
  );
}

export interface TenderAcceptedEmailParams {
  to: string;
  cc?: string | string[];
  ref: string;
  originName: string;
  destName: string;
  carrierName: string;
  rate: number;
  dispatchTimeline?: string | null;
}

export async function sendTenderAcceptedEmail(params: TenderAcceptedEmailParams): Promise<string | undefined> {
  const rateFmt = `$${params.rate.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const timelineBlock = params.dispatchTimeline
    ? `<p style="margin:16px 0"><strong>Dispatch:</strong> ${params.dispatchTimeline}</p>`
    : "";

  const html = wrap(`
    <h2 style="color:#0A2540;margin:0 0 16px">Tender accepted by ${params.carrierName}</h2>
    <p>The carrier has accepted your tender. The load is now <strong>BOOKED</strong> and ready for dispatch.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Reference</td><td style="padding:8px;border:1px solid #E2EAF2">${params.ref}</td></tr>
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Lane</td><td style="padding:8px;border:1px solid #E2EAF2">${params.originName} &rarr; ${params.destName}</td></tr>
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Carrier</td><td style="padding:8px;border:1px solid #E2EAF2">${params.carrierName}</td></tr>
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Rate</td><td style="padding:8px;border:1px solid #E2EAF2">${rateFmt}</td></tr>
    </table>
    ${timelineBlock}
    <p>Track the load in real-time from the Track &amp; Trace tab.</p>
    <a href="https://silkroutelogistics.ai/dashboard/track-trace" style="display:inline-block;background:#BA7517;color:#FFFFFF;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:8px">View in Track &amp; Trace</a>
  `);

  return sendEmail(
    params.to,
    `Tender Accepted: ${params.ref} (${params.carrierName})`,
    html,
    undefined,
    {
      replyTo: "operations@silkroutelogistics.ai",
      cc: params.cc,
    },
  );
}

// Sprint 54 (v3.8.acc) Item 7 — Carrier-facing confirmation email when their
// tender is accepted. Pre-Sprint-54 notifyTenderAction("ACCEPTED") only
// emailed the AE poster. Carriers got no confirmation that their accept
// click actually took, just an in-app notification on next portal visit.
export interface TenderAcceptedConfirmationEmailParams {
  to: string;
  ref: string;
  originName: string;
  destName: string;
  carrierName: string;
  rate: number;
  pickupDate?: string | null;
  deliveryDate?: string | null;
}

export async function sendTenderAcceptedConfirmationEmail(params: TenderAcceptedConfirmationEmailParams): Promise<string | undefined> {
  const rateFmt = `$${params.rate.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const pickupRow = params.pickupDate
    ? `<tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Pickup</td><td style="padding:8px;border:1px solid #E2EAF2">${params.pickupDate}</td></tr>`
    : "";
  const deliveryRow = params.deliveryDate
    ? `<tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Delivery</td><td style="padding:8px;border:1px solid #E2EAF2">${params.deliveryDate}</td></tr>`
    : "";

  const html = wrap(`
    <h2 style="color:#0A2540;margin:0 0 16px">Tender accepted &mdash; you're booked</h2>
    <p>Thanks ${params.carrierName}. Your acceptance is recorded and the load is now <strong>BOOKED</strong> in your name. Watch your inbox for the Rate Confirmation and dispatch instructions.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Reference</td><td style="padding:8px;border:1px solid #E2EAF2">${params.ref}</td></tr>
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Lane</td><td style="padding:8px;border:1px solid #E2EAF2">${params.originName} &rarr; ${params.destName}</td></tr>
      ${pickupRow}
      ${deliveryRow}
      <tr style="background:#FAEEDA"><td style="padding:8px;border:1px solid #C5A572;font-weight:bold;color:#BA7517">Rate</td><td style="padding:8px;border:1px solid #C5A572;font-weight:bold;font-size:16px;color:#0A2540">${rateFmt}</td></tr>
    </table>
    <p>Questions before pickup? Reply to this email and our operations team will respond.</p>
    <a href="https://silkroutelogistics.ai/carrier/dashboard/my-loads" style="display:inline-block;background:#BA7517;color:#FFFFFF;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:8px">View My Loads</a>
  `);

  return sendEmail(
    params.to,
    `Booked: ${params.ref} (${params.originName} → ${params.destName})`,
    html,
    undefined,
    { replyTo: "operations@silkroutelogistics.ai" },
  );
}

export interface TenderDeclinedEmailParams {
  to: string;
  ref: string;
  loadId: string;
  originName: string;
  destName: string;
  carrierName: string;
  rate: number;
  declineReason?: string | null;
}

export async function sendTenderDeclinedEmail(params: TenderDeclinedEmailParams): Promise<string | undefined> {
  const rateFmt = `$${params.rate.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  // D4 — Conditional decline reason rendering (only if non-null)
  const reasonRow = params.declineReason
    ? `<tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Reason</td><td style="padding:8px;border:1px solid #E2EAF2;color:#9B2C2C">${params.declineReason}</td></tr>`
    : "";

  const html = wrap(`
    <h2 style="color:#9B2C2C;margin:0 0 16px">Tender declined by ${params.carrierName}</h2>
    <p>The carrier has declined the tender. Re-tender to a different carrier or renegotiate.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Reference</td><td style="padding:8px;border:1px solid #E2EAF2">${params.ref}</td></tr>
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Lane</td><td style="padding:8px;border:1px solid #E2EAF2">${params.originName} &rarr; ${params.destName}</td></tr>
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Carrier</td><td style="padding:8px;border:1px solid #E2EAF2">${params.carrierName}</td></tr>
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Offered Rate</td><td style="padding:8px;border:1px solid #E2EAF2">${rateFmt}</td></tr>
      ${reasonRow}
    </table>
    <a href="https://silkroutelogistics.ai/dashboard/loads" style="display:inline-block;background:#BA7517;color:#FFFFFF;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:8px">Re-tender</a>
  `);

  return sendEmail(
    params.to,
    `Tender Declined: ${params.ref} (${params.carrierName})`,
    html,
    undefined,
    { replyTo: "operations@silkroutelogistics.ai" },
  );
}

// v3.8.aka Item 89 — Counter-tender email surfaces the carrier's counter-
// offer to the AE poster. Pre-aka the COUNTERED branch of
// notifyTenderAction only wrote an in-app Notification — AEs only saw
// the counter if they happened to be in the dashboard. Now also fires
// the AE-facing email with offered/countered/delta context so the AE
// can act inbox-side. Pattern mirrors sendTenderDeclinedEmail (Sprint
// 45a D4) — AE-facing, reply-to operations@, gold-dark CTA.
export interface TenderCounteredEmailParams {
  to: string;
  ref: string;
  loadId: string;
  originName: string;
  destName: string;
  carrierName: string;
  offeredRate: number;
  counterRate: number;
}

export async function sendTenderCounteredEmail(params: TenderCounteredEmailParams): Promise<string | undefined> {
  const offeredFmt = `$${params.offeredRate.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const counterFmt = `$${params.counterRate.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const delta = params.counterRate - params.offeredRate;
  const deltaPct = params.offeredRate > 0 ? (delta / params.offeredRate) * 100 : 0;
  const deltaSign = delta >= 0 ? "+" : "";
  const deltaFmt = `${deltaSign}$${Math.abs(delta).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} (${deltaSign}${deltaPct.toFixed(1)}%)`;
  // Counter is almost always upward — color the delta amber for "review"
  // unless it happens to be downward (rare but possible for negotiated lanes).
  const deltaColor = delta >= 0 ? "#B07A1A" : "#2F7A4F";

  const html = wrap(`
    <h2 style="color:#0A2540;margin:0 0 16px">Counter-offer from ${params.carrierName}</h2>
    <p>The carrier countered your tender. Review the rate change and re-tender at the new rate, decline, or counter back.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Reference</td><td style="padding:8px;border:1px solid #E2EAF2">${params.ref}</td></tr>
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Lane</td><td style="padding:8px;border:1px solid #E2EAF2">${params.originName} &rarr; ${params.destName}</td></tr>
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Carrier</td><td style="padding:8px;border:1px solid #E2EAF2">${params.carrierName}</td></tr>
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Your offer</td><td style="padding:8px;border:1px solid #E2EAF2">${offeredFmt}</td></tr>
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Carrier counter</td><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold;color:#0A2540">${counterFmt}</td></tr>
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Delta</td><td style="padding:8px;border:1px solid #E2EAF2;color:${deltaColor};font-weight:bold">${deltaFmt}</td></tr>
    </table>
    <a href="https://silkroutelogistics.ai/dashboard/loads" style="display:inline-block;background:#BA7517;color:#FFFFFF;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:8px">Review in Dashboard</a>
  `);

  return sendEmail(
    params.to,
    `Counter Offer: ${params.ref} (${counterFmt} from ${params.carrierName})`,
    html,
    undefined,
    { replyTo: "operations@silkroutelogistics.ai" },
  );
}

export interface TenderExpiredEmailParams {
  to: string;
  ref: string;
  loadId: string;
  originName: string;
  destName: string;
  carrierName: string;
  rate: number;
}

// Defensive add for Sprint 45b cron-driven expiry handler (Item 80d).
// Sprint 45a wires the email path so 45b only needs to fire the cron tick
// + flip tender status to EXPIRED + call notifyTenderAction("EXPIRED").
export async function sendTenderExpiredEmail(params: TenderExpiredEmailParams): Promise<string | undefined> {
  const rateFmt = `$${params.rate.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const html = wrap(`
    <h2 style="color:#B07A1A;margin:0 0 16px">Tender expired</h2>
    <p>The tender to <strong>${params.carrierName}</strong> expired without a response. Re-tender to another carrier to keep the load moving.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Reference</td><td style="padding:8px;border:1px solid #E2EAF2">${params.ref}</td></tr>
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Lane</td><td style="padding:8px;border:1px solid #E2EAF2">${params.originName} &rarr; ${params.destName}</td></tr>
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Carrier (no response)</td><td style="padding:8px;border:1px solid #E2EAF2">${params.carrierName}</td></tr>
      <tr><td style="padding:8px;border:1px solid #E2EAF2;font-weight:bold">Offered Rate</td><td style="padding:8px;border:1px solid #E2EAF2">${rateFmt}</td></tr>
    </table>
    <a href="https://silkroutelogistics.ai/dashboard/loads" style="display:inline-block;background:#BA7517;color:#FFFFFF;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:8px">Re-tender</a>
  `);

  return sendEmail(
    params.to,
    `Tender Expired: ${params.ref}`,
    html,
    undefined,
    { replyTo: "operations@silkroutelogistics.ai" },
  );
}
