import nodemailer from "nodemailer";

// Log SMTP config at startup (mask password)
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
const smtpPort = parseInt(process.env.SMTP_PORT || "587");

console.log(`[Email] SMTP config: host=${smtpHost}, port=${smtpPort}, user=${smtpUser || "NOT SET"}, pass=${smtpPass ? smtpPass.slice(0, 4) + "****" : "NOT SET"}`);

const transporter = smtpUser
  ? nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: false,
      auth: { user: smtpUser, pass: smtpPass },
    })
  : null;

if (transporter) {
  transporter.verify().then(() => {
    console.log("[Email] SMTP connection verified successfully");
  }).catch((err) => {
    console.error("[Email] SMTP verification FAILED:", err.message);
  });
}

async function sendEmail(to: string, subject: string, html: string) {
  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from: `"Silk Route Logistics" <${smtpUser}>`,
        to,
        subject,
        html,
      });
      console.log(`[Email] Sent to ${to}: ${subject} (messageId: ${info.messageId})`);
    } catch (err: any) {
      console.error(`[Email] FAILED to send to ${to}: ${err.message}`);
      throw err;
    }
  } else {
    console.log(`[Email][NoSMTP] To: ${to} | Subject: ${subject}`);
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

function wrap(body: string) {
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
