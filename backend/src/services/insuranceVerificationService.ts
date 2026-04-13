import { prisma } from "../config/database";
import { log } from "../lib/logger";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const COMPLIANCE_EMAIL = "compliance@silkroutelogistics.ai";
const SENDER_EMAIL = "compliance@silkroutelogistics.ai";

// ─── Minimum Coverage Requirements ─────────────────────

export const MIN_COVERAGE = {
  autoLiability: 1_000_000,    // $1M minimum
  cargoInsurance: 100_000,     // $100K minimum
  generalLiability: 1_000_000, // $1M minimum
  workersComp: 500_000,        // $500K minimum (if applicable)
};

export interface InsuranceCoverageResult {
  isCompliant: boolean;
  issues: string[];
  warnings: string[];
}

// ─── Validate Carrier Insurance ─────────────────────────

export function validateInsuranceCoverage(carrier: {
  autoLiabilityAmount?: number | null;
  cargoInsuranceAmount?: number | null;
  generalLiabilityAmount?: number | null;
  workersCompAmount?: number | null;
  autoLiabilityExpiry?: Date | null;
  cargoInsuranceExpiry?: Date | null;
  generalLiabilityExpiry?: Date | null;
  workersCompExpiry?: Date | null;
  additionalInsuredSRL?: boolean;
  waiverOfSubrogation?: boolean;
  thirtyDayCancellationNotice?: boolean;
}): InsuranceCoverageResult {
  const issues: string[] = [];
  const warnings: string[] = [];
  const now = new Date();
  const thirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  // Amount checks
  if (!carrier.autoLiabilityAmount || carrier.autoLiabilityAmount < MIN_COVERAGE.autoLiability) {
    issues.push(`Auto Liability below minimum $${(MIN_COVERAGE.autoLiability / 1_000_000).toFixed(0)}M (current: $${((carrier.autoLiabilityAmount || 0) / 1_000_000).toFixed(2)}M)`);
  }
  if (!carrier.cargoInsuranceAmount || carrier.cargoInsuranceAmount < MIN_COVERAGE.cargoInsurance) {
    issues.push(`Cargo Insurance below minimum $${(MIN_COVERAGE.cargoInsurance / 1_000).toFixed(0)}K (current: $${((carrier.cargoInsuranceAmount || 0) / 1_000).toFixed(0)}K)`);
  }
  if (!carrier.generalLiabilityAmount || carrier.generalLiabilityAmount < MIN_COVERAGE.generalLiability) {
    warnings.push(`General Liability below recommended $${(MIN_COVERAGE.generalLiability / 1_000_000).toFixed(0)}M`);
  }

  // Expiry checks
  if (carrier.autoLiabilityExpiry && carrier.autoLiabilityExpiry < now) issues.push("Auto Liability insurance EXPIRED");
  else if (carrier.autoLiabilityExpiry && carrier.autoLiabilityExpiry < thirtyDays) warnings.push("Auto Liability expiring within 30 days");

  if (carrier.cargoInsuranceExpiry && carrier.cargoInsuranceExpiry < now) issues.push("Cargo Insurance EXPIRED");
  else if (carrier.cargoInsuranceExpiry && carrier.cargoInsuranceExpiry < thirtyDays) warnings.push("Cargo Insurance expiring within 30 days");

  if (carrier.generalLiabilityExpiry && carrier.generalLiabilityExpiry < now) issues.push("General Liability EXPIRED");
  if (carrier.workersCompExpiry && carrier.workersCompExpiry < now) warnings.push("Workers' Comp EXPIRED");

  // Endorsement checks
  if (!carrier.additionalInsuredSRL) issues.push("SRL NOT listed as Additional Insured");
  if (!carrier.waiverOfSubrogation) warnings.push("Waiver of Subrogation not on file");
  if (!carrier.thirtyDayCancellationNotice) warnings.push("30-day cancellation notice not confirmed");

  return { isCompliant: issues.length === 0, issues, warnings };
}

// ─── Send Verification Email to Insurance Agent ─────────

export async function sendInsuranceVerificationEmail(carrierId: string) {
  const carrier = await prisma.carrierProfile.findUnique({
    where: { id: carrierId },
    include: { user: { select: { firstName: true, lastName: true, email: true } } },
  });

  if (!carrier) throw new Error("Carrier not found");
  if (!carrier.insuranceAgentEmail) throw new Error("No insurance agent email on file");
  if (!RESEND_API_KEY) { log.warn("[InsVerify] RESEND_API_KEY not set, skipping email"); return null; }

  const agentName = carrier.insuranceAgentName || "Insurance Agent";
  const carrierName = carrier.companyName || `${carrier.user.firstName} ${carrier.user.lastName}`;
  const validation = validateInsuranceCoverage(carrier);

  const insuranceTable = [
    { type: "Auto Liability", provider: carrier.autoLiabilityProvider, policy: carrier.autoLiabilityPolicy, amount: carrier.autoLiabilityAmount, expiry: carrier.autoLiabilityExpiry },
    { type: "Motor Cargo", provider: carrier.cargoInsuranceProvider, policy: carrier.cargoInsurancePolicy, amount: carrier.cargoInsuranceAmount, expiry: carrier.cargoInsuranceExpiry },
    { type: "General Liability", provider: carrier.generalLiabilityProvider, policy: carrier.generalLiabilityPolicy, amount: carrier.generalLiabilityAmount, expiry: carrier.generalLiabilityExpiry },
    { type: "Workers' Comp", provider: carrier.workersCompProvider, policy: carrier.workersCompPolicy, amount: carrier.workersCompAmount, expiry: carrier.workersCompExpiry },
  ];

  const tableRows = insuranceTable.map((ins) =>
    `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;color:#374151">${ins.type}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;color:#374151">${ins.provider || "—"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;color:#374151">${ins.policy || "—"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;color:#374151">${ins.amount ? `$${ins.amount.toLocaleString()}` : "—"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;color:#374151">${ins.expiry ? new Date(ins.expiry).toLocaleDateString() : "—"}</td>
    </tr>`
  ).join("");

  const endorsements = [
    carrier.additionalInsuredSRL ? "✅ SRL listed as Additional Insured" : "❌ SRL NOT listed as Additional Insured",
    carrier.waiverOfSubrogation ? "✅ Waiver of Subrogation" : "❌ Waiver of Subrogation not on file",
    carrier.thirtyDayCancellationNotice ? "✅ 30-day Cancellation Notice" : "❌ 30-day Cancellation Notice not confirmed",
  ].join("<br/>");

  const html = `
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:640px;margin:0 auto">
      <div style="background:#0D1B2A;padding:20px 24px;border-radius:8px 8px 0 0">
        <h1 style="color:#C9A84C;font-size:18px;margin:0">Silk Route Logistics Inc.</h1>
        <p style="color:#94A3B8;font-size:12px;margin:4px 0 0">Certificate of Insurance Verification Request</p>
      </div>

      <div style="background:#FFFFFF;padding:24px;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 8px 8px">
        <p style="color:#374151;font-size:14px;line-height:1.6">Dear ${agentName},</p>

        <p style="color:#374151;font-size:14px;line-height:1.6">
          We are writing to verify the insurance coverage for the following motor carrier that operates under our brokerage authority:
        </p>

        <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:6px;padding:16px;margin:16px 0">
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <tr><td style="color:#6B7280;padding:4px 0">Carrier Name:</td><td style="color:#111827;font-weight:600">${carrierName}</td></tr>
            <tr><td style="color:#6B7280;padding:4px 0">MC Number:</td><td style="color:#111827;font-weight:600">${carrier.mcNumber || "—"}</td></tr>
            <tr><td style="color:#6B7280;padding:4px 0">DOT Number:</td><td style="color:#111827;font-weight:600">${carrier.dotNumber || "—"}</td></tr>
            <tr><td style="color:#6B7280;padding:4px 0">Company Address:</td><td style="color:#111827">${[carrier.address, carrier.city, carrier.state, carrier.zip].filter(Boolean).join(", ") || "—"}</td></tr>
          </table>
        </div>

        <p style="color:#374151;font-size:14px;line-height:1.6;font-weight:600">Coverage on File:</p>

        <table style="width:100%;border-collapse:collapse;margin:12px 0;border:1px solid #E5E7EB;border-radius:6px;overflow:hidden">
          <thead>
            <tr style="background:#F3F4F6">
              <th style="padding:10px 12px;text-align:left;font-size:11px;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px">Type</th>
              <th style="padding:10px 12px;text-align:left;font-size:11px;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px">Provider</th>
              <th style="padding:10px 12px;text-align:left;font-size:11px;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px">Policy #</th>
              <th style="padding:10px 12px;text-align:left;font-size:11px;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px">Amount</th>
              <th style="padding:10px 12px;text-align:left;font-size:11px;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px">Expiry</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>

        <p style="color:#374151;font-size:14px;line-height:1.6;font-weight:600">Endorsements Required:</p>
        <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:6px;padding:12px 16px;margin:8px 0;font-size:13px;color:#374151;line-height:1.8">
          ${endorsements}
        </div>

        <p style="color:#374151;font-size:14px;line-height:1.6;margin-top:20px">
          Please verify the above information is accurate and confirm that all policies are active and in good standing.
          If any information is incorrect, please reply to this email with the updated details and a current Certificate of Insurance.
        </p>

        <p style="color:#374151;font-size:14px;line-height:1.6">
          <strong>SRL's minimum requirements:</strong><br/>
          Auto Liability: $1,000,000 | Cargo Insurance: $100,000 | Additional Insured: Required | 30-Day Cancellation Notice: Required
        </p>

        <p style="color:#374151;font-size:14px;line-height:1.6">
          Please send updated COI to <a href="mailto:${COMPLIANCE_EMAIL}" style="color:#C9A84C">${COMPLIANCE_EMAIL}</a>
        </p>

        <div style="border-top:1px solid #E5E7EB;margin-top:24px;padding-top:16px;font-size:12px;color:#6B7280;line-height:1.6">
          <strong style="color:#374151">Wasih Haider</strong><br/>
          Compliance Department<br/>
          Silk Route Logistics Inc.<br/>
          MC# 01794414 | DOT# 4526880<br/>
          (269) 220-6760 | ${COMPLIANCE_EMAIL}<br/>
          silkroutelogistics.ai
        </div>
      </div>
    </div>
  `;

  // Send via Resend
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `Silk Route Logistics Compliance <${SENDER_EMAIL}>`,
      to: [carrier.insuranceAgentEmail],
      cc: [COMPLIANCE_EMAIL, carrier.user.email].filter(Boolean),
      reply_to: COMPLIANCE_EMAIL,
      subject: `Certificate of Insurance Verification Request — ${carrierName} (MC# ${carrier.mcNumber || "N/A"})`,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    log.error({ carrierId, agentEmail: carrier.insuranceAgentEmail, err }, "[InsVerify] Email send failed");
    throw new Error(`Failed to send verification email: ${err}`);
  }

  const emailResult = await res.json();

  // Log to Communication table
  await prisma.communication.create({
    data: {
      type: "EMAIL_OUTBOUND",
      direction: "OUTBOUND",
      entityType: "CARRIER",
      entityId: carrierId,
      from: SENDER_EMAIL,
      to: carrier.insuranceAgentEmail,
      subject: `COI Verification Request — ${carrierName}`,
      body: `Insurance verification email sent to ${agentName} at ${carrier.insuranceAgentEmail}. Coverage: Auto $${(carrier.autoLiabilityAmount || 0).toLocaleString()}, Cargo $${(carrier.cargoInsuranceAmount || 0).toLocaleString()}.`,
      metadata: { source: "InsuranceVerification", emailId: (emailResult as any).id, validation: JSON.parse(JSON.stringify(validation)) },
      userId: (await prisma.user.findFirst({ where: { role: "ADMIN", isActive: true } }))?.id || "system",
    },
  });

  // Notify internal team
  const ops = await prisma.user.findMany({ where: { role: { in: ["ADMIN", "OPERATIONS"] }, isActive: true }, select: { id: true } });
  for (const u of ops) {
    await prisma.notification.create({
      data: {
        userId: u.id,
        type: "COMPLIANCE",
        title: `COI Verification Sent — ${carrierName}`,
        message: `Insurance verification request sent to ${agentName} (${carrier.insuranceAgentEmail}). ${validation.issues.length} issues, ${validation.warnings.length} warnings.`,
        actionUrl: "/dashboard/carriers",
      },
    });
  }

  log.info({ carrierId, agentEmail: carrier.insuranceAgentEmail, issues: validation.issues.length }, "[InsVerify] Verification email sent");
  return { sent: true, emailId: (emailResult as any).id, validation };
}

// ─── Check Expiring Insurance (Cron) ────────────────────

export async function checkExpiringInsurance() {
  const now = new Date();
  const days60 = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
  const days30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const days7 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  // Find carriers with expiring insurance
  const expiring = await prisma.carrierProfile.findMany({
    where: {
      deletedAt: null,
      status: "APPROVED",
      OR: [
        { autoLiabilityExpiry: { lte: days60, gte: now } },
        { cargoInsuranceExpiry: { lte: days60, gte: now } },
        { generalLiabilityExpiry: { lte: days60, gte: now } },
      ],
    },
    include: { user: { select: { firstName: true, lastName: true, email: true } } },
  });

  let remindersSent = 0;

  for (const carrier of expiring) {
    const carrierName = carrier.companyName || `${carrier.user.firstName} ${carrier.user.lastName}`;

    // Determine urgency
    const expiryDates = [carrier.autoLiabilityExpiry, carrier.cargoInsuranceExpiry, carrier.generalLiabilityExpiry].filter(Boolean) as Date[];
    const earliestExpiry = expiryDates.sort((a, b) => a.getTime() - b.getTime())[0];
    if (!earliestExpiry) continue;

    const daysUntil = Math.ceil((earliestExpiry.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    let severity: "INFO" | "WARNING" | "CRITICAL" = "INFO";
    if (daysUntil <= 7) severity = "CRITICAL";
    else if (daysUntil <= 30) severity = "WARNING";

    // Send email to agent if we have their email
    if (carrier.insuranceAgentEmail && (daysUntil === 60 || daysUntil === 30 || daysUntil === 7)) {
      try {
        await sendInsuranceVerificationEmail(carrier.id);
        remindersSent++;
      } catch (err) {
        log.error({ err, carrierId: carrier.id }, "[InsVerify] Expiry reminder failed");
      }
    }

    // Internal notification
    if (daysUntil === 30 || daysUntil === 7 || daysUntil === 1) {
      const admins = await prisma.user.findMany({ where: { role: { in: ["ADMIN", "OPERATIONS"] }, isActive: true }, select: { id: true } });
      for (const admin of admins) {
        await prisma.notification.create({
          data: {
            userId: admin.id,
            type: "COMPLIANCE",
            title: `${severity === "CRITICAL" ? "URGENT: " : ""}Insurance Expiring — ${carrierName}`,
            message: `${carrierName}'s insurance expires in ${daysUntil} days (${earliestExpiry.toLocaleDateString()}).`,
            actionUrl: "/dashboard/carriers",
          },
        });
      }
    }
  }

  log.info({ expiringCount: expiring.length, remindersSent }, "[InsVerify] Expiry check complete");
  return { checked: expiring.length, remindersSent };
}
