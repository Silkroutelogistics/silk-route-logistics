import { Resend } from "resend";
import { env } from "../config/env";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
const fromEmail = env.EMAIL_FROM;

console.log(`[Email] Resend configured: ${!!resend}, from: ${fromEmail}`);

interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export async function sendEmail(to: string, subject: string, html: string, attachments?: EmailAttachment[]) {
  if (resend) {
    try {
      const { data, error } = await resend.emails.send({
        from: `Silk Route Logistics <${fromEmail}>`,
        to,
        subject,
        html,
        attachments: attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          content_type: a.contentType || "application/pdf",
        })),
      });
      if (error) {
        console.error(`[Email] Resend error to ${to}: ${error.message}`);
        throw new Error(error.message);
      }
      console.log(`[Email] Sent to ${to}: ${subject} (id: ${data?.id})`);
    } catch (err: any) {
      console.error(`[Email] FAILED to send to ${to}: ${err.message}`);
      throw err;
    }
  } else {
    console.log(`[Email][NoAPI] To: ${to} | Subject: ${subject}${attachments ? ` | ${attachments.length} attachment(s)` : ""}`);
  }
}

const brandHeader = `
  <div style="background:#0f172a;padding:24px;text-align:center;border-bottom:3px solid #d4a574">
    <h1 style="color:#d4a574;margin:0;font-family:Georgia,serif">Silk Route Logistics</h1>
  </div>`;

const brandFooter = `
  <div style="background:#1e293b;padding:16px;text-align:center;color:#94a3b8;font-size:12px">
    <p style="margin:0">Silk Route Logistics &bull; silkroutelogistics.ai</p>
  </div>`;

export function wrap(body: string) {
  return `<div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0">
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
    <h2 style="color:#0f172a">Pre-Tracing Update Required</h2>
    <p>Hi ${carrierName},</p>
    <p>Your pickup for load <strong>${loadRef}</strong> is in approximately <strong>${timeLabel}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Origin</td><td style="padding:8px;border:1px solid #e2e8f0">${origin}</td></tr>
      <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Destination</td><td style="padding:8px;border:1px solid #e2e8f0">${dest}</td></tr>
      <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Pickup Date</td><td style="padding:8px;border:1px solid #e2e8f0">${pickupDate.toLocaleDateString()}</td></tr>
    </table>
    <p><strong>Are you on time for pickup?</strong> Please log in to update your status.</p>
    <a href="https://silkroutelogistics.ai/dashboard/loads" style="display:inline-block;background:#d4a574;color:#0f172a;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:8px">Update Status</a>
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
    <h2 style="color:#0f172a">Invoice Auto-Generated</h2>
    <p>Hi ${carrierName},</p>
    <p>Load <strong>${loadRef}</strong> has been delivered. An invoice has been automatically generated:</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Invoice #</td><td style="padding:8px;border:1px solid #e2e8f0">${invoiceNumber}</td></tr>
      <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Amount</td><td style="padding:8px;border:1px solid #e2e8f0">$${amount.toLocaleString()}</td></tr>
      <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Due Date</td><td style="padding:8px;border:1px solid #e2e8f0">Net 30</td></tr>
    </table>
    <a href="https://silkroutelogistics.ai/dashboard/invoices" style="display:inline-block;background:#d4a574;color:#0f172a;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:8px">View Invoice</a>
  `);

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
      <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Last Known Location</td><td style="padding:8px;border:1px solid #e2e8f0">${lastLocation || "Unknown"}</td></tr>
      <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Hours Since Update</td><td style="padding:8px;border:1px solid #e2e8f0">${Math.round(hoursSinceUpdate)}h</td></tr>
    </table>
    <p>Please contact the carrier immediately to confirm load status.</p>
    <a href="https://silkroutelogistics.ai/dashboard/tracking" style="display:inline-block;background:#dc2626;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:8px">View in Track & Trace</a>
  `);

  await sendEmail(brokerEmail, `LATE ALERT: Shipment ${shipmentNumber} - No movement in ${Math.round(hoursSinceUpdate)}h`, html);
}

export async function sendOtpEmail(email: string, firstName: string, code: string) {
  const html = wrap(`
    <h2 style="color:#0f172a">Your Verification Code</h2>
    <p>Hi ${firstName},</p>
    <p>Use the following code to complete your sign-in:</p>
    <div style="text-align:center;margin:24px 0">
      <div style="display:inline-block;background:#f1f5f9;border:2px solid #d4a574;border-radius:12px;padding:16px 32px;letter-spacing:12px;font-size:36px;font-family:'Courier New',monospace;font-weight:bold;color:#0f172a">${code}</div>
    </div>
    <p style="color:#64748b;font-size:14px">This code expires in <strong>5 minutes</strong>. If you didn't request this, please ignore this email.</p>
  `);

  await sendEmail(email, `Your SRL Verification Code: ${code}`, html);
}

export async function sendPasswordResetEmail(email: string, firstName: string, resetUrl: string) {
  const html = wrap(`
    <h2 style="color:#0f172a">Reset Your Password</h2>
    <p>Hi ${firstName},</p>
    <p>We received a request to reset your password. Click the button below to choose a new one:</p>
    <div style="text-align:center;margin:24px 0">
      <a href="${resetUrl}" style="display:inline-block;background:#d4a574;color:#0f172a;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px">Reset Password</a>
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
    <h2 style="color:#0f172a">Rate Confirmation — Load ${loadRef}</h2>
    <p>Hi ${carrierName},</p>
    ${customMessage ? `<p>${customMessage}</p>` : ""}
    <p>Please find the attached Rate Confirmation for load <strong>${loadRef}</strong>.</p>
    <p>Review the details and sign the document to confirm acceptance of this load.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Load Reference</td><td style="padding:8px;border:1px solid #e2e8f0">${loadRef}</td></tr>
    </table>
    <p>If you have any questions, please contact your dispatcher or reply to this email.</p>
    <a href="https://silkroutelogistics.ai/dashboard/loads" style="display:inline-block;background:#d4a574;color:#0f172a;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:8px">View in Dashboard</a>
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
    (f) => `<tr><td style="padding:8px;border:1px solid #e2e8f0">${f.description}</td><td style="padding:8px;border:1px solid #e2e8f0;text-align:center;font-weight:bold;color:#dc2626">+${f.points}</td></tr>`
  ).join("");

  const html = wrap(`
    <h2 style="color:#dc2626">RISK RED ALERT — Load ${loadRef}</h2>
    <p>Hi ${brokerName},</p>
    <p>Load <strong>${loadRef}</strong> has been flagged with a <strong style="color:#dc2626">RED risk level</strong> (score: ${risk.score}).</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr style="background:#fef2f2"><th style="padding:8px;border:1px solid #e2e8f0;text-align:left">Risk Factor</th><th style="padding:8px;border:1px solid #e2e8f0;width:60px">Points</th></tr>
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
      <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Route</td><td style="padding:8px;border:1px solid #e2e8f0">${origin} → ${dest}</td></tr>
      <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Status</td><td style="padding:8px;border:1px solid #e2e8f0;color:#dc2626;font-weight:bold">Recovery In Progress</td></tr>
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
) {
  // Send via the standard sendEmail function
  await sendEmail(to, subject, html);
  console.log(`[Sequence][Email] Sent to ${to}: ${subject} (seq: ${sequenceId})`);
}

// ─── Shipper Notification Templates ──────────────────────────

export function shipperPickupHtml(loadRef: string, origin: string, dest: string, carrierName: string, eta: string) {
  return wrap(`
    <h2 style="color:#0f172a">Shipment Picked Up</h2>
    <p>Your shipment <strong>${loadRef}</strong> has been picked up and is now in transit.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Reference</td><td style="padding:8px;border:1px solid #e2e8f0">${loadRef}</td></tr>
      <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Origin</td><td style="padding:8px;border:1px solid #e2e8f0">${origin}</td></tr>
      <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Destination</td><td style="padding:8px;border:1px solid #e2e8f0">${dest}</td></tr>
      <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Carrier</td><td style="padding:8px;border:1px solid #e2e8f0">${carrierName}</td></tr>
      <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">ETA</td><td style="padding:8px;border:1px solid #e2e8f0">${eta}</td></tr>
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
    (cc) => `<tr><td style="padding:6px 8px;border:1px solid #e2e8f0;font-size:13px">${cc.createdAt}</td><td style="padding:6px 8px;border:1px solid #e2e8f0;font-size:13px">${cc.location || "—"}</td><td style="padding:6px 8px;border:1px solid #e2e8f0;font-size:13px">${cc.status}</td></tr>`
  ).join("");

  const barColor = percentComplete >= 75 ? "#22c55e" : percentComplete >= 40 ? "#f59e0b" : "#3b82f6";
  return wrap(`
    <h2 style="color:#0f172a">Transit Update — ${loadRef}</h2>
    <p>Here is the latest tracking update for your shipment.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Route</td><td style="padding:8px;border:1px solid #e2e8f0">${origin} → ${dest}</td></tr>
      <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Current Location</td><td style="padding:8px;border:1px solid #e2e8f0">${lastLocation}</td></tr>
      <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">ETA</td><td style="padding:8px;border:1px solid #e2e8f0">${etaStr}</td></tr>
    </table>
    <div style="margin:16px 0">
      <div style="font-size:13px;font-weight:bold;margin-bottom:4px">Progress: ${percentComplete}%</div>
      <div style="background:#e2e8f0;border-radius:8px;height:12px;overflow:hidden">
        <div style="background:${barColor};height:100%;width:${percentComplete}%;border-radius:8px"></div>
      </div>
    </div>
    ${checkCalls.length > 0 ? `
    <h3 style="color:#0f172a;font-size:14px;margin-top:20px">Recent Check Calls</h3>
    <table style="width:100%;border-collapse:collapse;margin:8px 0">
      <tr style="background:#f8fafc"><th style="padding:6px 8px;border:1px solid #e2e8f0;text-align:left;font-size:12px">Time</th><th style="padding:6px 8px;border:1px solid #e2e8f0;text-align:left;font-size:12px">Location</th><th style="padding:6px 8px;border:1px solid #e2e8f0;text-align:left;font-size:12px">Status</th></tr>
      ${ccRows}
    </table>` : ""}
  `);
}

export function shipperDeliveryHtml(loadRef: string, origin: string, dest: string, deliveredAt: string) {
  return wrap(`
    <h2 style="color:#22c55e">Shipment Delivered</h2>
    <p>Your shipment <strong>${loadRef}</strong> has been delivered successfully.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Reference</td><td style="padding:8px;border:1px solid #e2e8f0">${loadRef}</td></tr>
      <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Route</td><td style="padding:8px;border:1px solid #e2e8f0">${origin} → ${dest}</td></tr>
      <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Delivered At</td><td style="padding:8px;border:1px solid #e2e8f0">${deliveredAt}</td></tr>
    </table>
    <p>Proof of Delivery (POD) will be sent to you once it has been validated.</p>
  `);
}

export function shipperPODHtml(loadRef: string, podUrl: string) {
  return wrap(`
    <h2 style="color:#0f172a">Proof of Delivery Available — ${loadRef}</h2>
    <p>The Proof of Delivery for shipment <strong>${loadRef}</strong> has been validated and is now available.</p>
    <div style="text-align:center;margin:24px 0">
      <a href="${podUrl}" style="display:inline-block;background:#d4a574;color:#0f172a;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px">Download POD</a>
    </div>
    <p style="color:#64748b;font-size:13px">If you have any questions about this delivery, please contact your account representative.</p>
  `);
}

export async function sendPasswordExpiryReminder(email: string, firstName: string, daysLeft: number) {
  const urgency = daysLeft <= 2 ? "#dc2626" : daysLeft <= 7 ? "#f59e0b" : "#3b82f6";
  const html = wrap(`
    <h2 style="color:${urgency}">Password Expiring Soon</h2>
    <p>Hi ${firstName},</p>
    <p>Your Silk Route Logistics password will expire in <strong style="color:${urgency}">${daysLeft} day${daysLeft !== 1 ? "s" : ""}</strong>.</p>
    <p>Please update your password before it expires to avoid being locked out.</p>
    <a href="https://silkroutelogistics.ai/dashboard/settings" style="display:inline-block;background:#d4a574;color:#0f172a;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:8px">Change Password</a>
    <p style="color:#64748b;font-size:13px;margin-top:16px">If your password expires, you'll be prompted to create a new one at your next login.</p>
  `);

  await sendEmail(email, `Password expires in ${daysLeft} days — Silk Route Logistics`, html);
}
