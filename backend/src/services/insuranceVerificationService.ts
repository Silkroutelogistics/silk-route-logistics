import { prisma } from "../config/database";
import { INSURANCE_MINIMUMS } from "../lib/insurancePolicy";
import { endorsementState } from "../lib/insuranceFields";
import { log } from "../lib/logger";
import { mcDigits } from "../lib/mcNumber";
import { monitoredCarrierWhere } from "../lib/carrierOperational";
import {
  ENTITY_NAME,
  MC_LABEL,
  DOT_LABEL,
  PHONE,
  DOMAIN,
  COMPLIANCE_EMAIL as AUTHORITY_COMPLIANCE_EMAIL,
} from "../config/authority";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
// v3.8.akg §13.3 Item 8.9 — sourced from canonical authority module.
const COMPLIANCE_EMAIL = AUTHORITY_COMPLIANCE_EMAIL;
const SENDER_EMAIL = "compliance@silkroutelogistics.ai";

// ─── Minimum Coverage Requirements ─────────────────────

// v3.8.azc C1 — the figures moved to lib/insurancePolicy so the document that
// PRINTS them and the gate that ENFORCES them cannot drift. Re-exported under
// the existing name because six call sites in this file read MIN_COVERAGE.
export const MIN_COVERAGE = INSURANCE_MINIMUMS;

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
  additionalInsuredSRL?: boolean | null;
  waiverOfSubrogation?: boolean | null;
  thirtyDayCancellationNotice?: boolean | null;
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

// ─── Agent-Email Gate: hold, stale record, cooldown ────
//
// coi-verify-email-fix C1 + C2c. Both senders (the AE's Send verification and
// the expiry cron) go through sendInsuranceVerificationEmail, so the gate lives
// there. HOLD: CarrierProfile.agentEmailHoldUntil (it replaced a code list).
// STALE: the email repeats the record to the agent, so an AE must have reviewed
// it (insuranceReviewedAt) since the newest COI on file. Never reviewed = stale.

// COOLDOWN: one agent email per carrier per 14 days, whichever path asks.
export const AGENT_EMAIL_COOLDOWN_DAYS = 14;

// A block carries its reason and, for a cooldown, the moment it clears. A hold
// has no clear date: it lasts until it is lifted.
export type AgentEmailBlock = { reason: string; clearsAt: Date | null };

type GateCarrier = { id: string; insuranceAgentEmail: string; agentEmailHoldUntil: Date | null; insuranceReviewedAt: Date | null };

export async function agentEmailBlock(carrier: GateCarrier): Promise<AgentEmailBlock | null> {
  const hold = carrier.agentEmailHoldUntil;
  if (hold && hold > new Date()) {
    const indefinite = hold.getUTCFullYear() >= 9999;
    return { reason: `agent email on hold ${indefinite ? "until lifted" : `until ${hold.toISOString()}`}`, clearsAt: indefinite ? null : hold };
  }

  const reviewed = carrier.insuranceReviewedAt;
  if (!reviewed) return { reason: "insurance record not reviewed by an AE since it last changed; review it against the COI and save", clearsAt: null };
  const coi = await prisma.document.findFirst({
    where: { entityType: "CARRIER", entityId: carrier.id, docType: "COI" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (coi && reviewed < coi.createdAt) {
    return { reason: `AE review (${reviewed.toISOString()}) predates the latest COI (${coi.createdAt.toISOString()}); review and save it`, clearsAt: null };
  }

  const since = new Date(Date.now() - AGENT_EMAIL_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
  const recent = await prisma.communication.findFirst({
    where: {
      entityType: "CARRIER",
      entityId: carrier.id,
      direction: "OUTBOUND",
      createdAt: { gte: since },
      OR: [
        { metadata: { path: ["source"], equals: "InsuranceVerification" } },
        { to: { equals: carrier.insuranceAgentEmail, mode: "insensitive" } },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (recent) {
    const clearsAt = new Date(recent.createdAt.getTime() + AGENT_EMAIL_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
    return { reason: `agent emailed ${recent.createdAt.toISOString()}; ${AGENT_EMAIL_COOLDOWN_DAYS}-day cooldown`, clearsAt };
  }
  return null;
}

// ─── Send Verification Email to Insurance Agent ─────────

export async function sendInsuranceVerificationEmail(carrierId: string) {
  const carrier = await prisma.carrierProfile.findUnique({
    where: { id: carrierId },
    include: { user: { select: { firstName: true, lastName: true, email: true } } },
  });

  if (!carrier) throw new Error("Carrier not found");
  if (!carrier.insuranceAgentEmail) throw new Error("No insurance agent email on file");

  const blocked = await agentEmailBlock({ ...carrier, insuranceAgentEmail: carrier.insuranceAgentEmail });
  if (blocked) {
    log.info({ carrierId, reason: blocked.reason }, "[InsVerify] Agent email blocked");
    return { sent: false as const, reason: blocked.reason, clearsAt: blocked.clearsAt };
  }
  if (!RESEND_API_KEY) { log.warn("[InsVerify] RESEND_API_KEY not set, skipping email"); return null; }

  // v3.8.avk — the agent's name still identifies WHO was contacted in the audit
  // and activity lines below. It is no longer used to address them in the body:
  // a system-generated email speaks as SRL to an organisation, and greeting an
  // individual by name makes a generated message read as personal correspondence
  // from someone who did not write it.
  const agentName = carrier.insuranceAgentName || "Insurance Agent";
  const agencyName = carrier.insuranceAgencyName?.trim() || null;
  const salutation = agencyName ? `Dear ${agencyName} team,` : "Hello,";
  const carrierName = carrier.companyName || `${carrier.user.firstName} ${carrier.user.lastName}`;
  const validation = validateInsuranceCoverage(carrier);

  const money = (n: number | null | undefined) => (n ? `$${n.toLocaleString()}` : "—");
  const insurer = (name: string | null, naic: string | null) => (name ? `${name}${naic ? ` (NAIC ${naic})` : ""}` : "Not stated");
  const insuranceTable = [
    { type: "Auto Liability", insurer: insurer(carrier.autoLiabilityInsurerName, carrier.autoLiabilityInsurerNaic), policy: carrier.autoLiabilityPolicy, amount: money(carrier.autoLiabilityAmount), expiry: carrier.autoLiabilityExpiry },
    { type: "Motor Cargo", insurer: insurer(carrier.cargoInsuranceInsurerName, carrier.cargoInsuranceInsurerNaic), policy: carrier.cargoInsurancePolicy, amount: money(carrier.cargoInsuranceAmount), expiry: carrier.cargoInsuranceExpiry },
    { type: "General Liability", insurer: insurer(carrier.generalLiabilityInsurerName, carrier.generalLiabilityInsurerNaic), policy: carrier.generalLiabilityPolicy, amount: money(carrier.generalLiabilityAmount), expiry: carrier.generalLiabilityExpiry },
    // Workers' comp is statutory; its dollar limits are employer's liability.
    { type: "Workers' Comp", insurer: insurer(carrier.workersCompInsurerName, carrier.workersCompInsurerNaic), policy: carrier.workersCompPolicy,
      amount: carrier.workersCompStatutory ? `Statutory · EL ${money(carrier.workersCompElEachAccident)} / ${money(carrier.workersCompElDiseaseEachEmployee)} / ${money(carrier.workersCompElDiseasePolicyLimit)}` : money(carrier.workersCompAmount),
      expiry: carrier.workersCompExpiry },
  ];

  // An expiry is a calendar date stored at midnight UTC; any other zone shows it a day early.
  // Within 30 days it is flagged per policy (coi-verify-email-fix C2d, D5).
  const expiryCell = (d: Date) => d.toLocaleDateString("en-US", { timeZone: "UTC" }) +
    (d.getTime() - Date.now() <= 30 * 24 * 60 * 60 * 1000 && d.getTime() >= Date.now() ? ' <strong style="color:#9B2C2C">· expires within 30 days</strong>' : "");

  const tableRows = insuranceTable.map((ins) =>
    `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;color:#374151">${ins.type}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;color:#374151">${ins.insurer}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;color:#374151">${ins.policy || "—"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;color:#374151">${ins.amount}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;color:#374151">${ins.expiry ? expiryCell(new Date(ins.expiry)) : "—"}</td>
    </tr>`
  ).join("");

  const endorsements = [
    `SRL as Additional Insured: ${endorsementState(carrier.additionalInsuredSRL)}`,
    `Waiver of Subrogation: ${endorsementState(carrier.waiverOfSubrogation)}`,
    `30-day Cancellation Notice: ${endorsementState(carrier.thirtyDayCancellationNotice)}`,
  ].join("<br/>");

  const html = `
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:640px;margin:0 auto">
      <div style="background:#0A2540;padding:20px 24px;border-radius:8px 8px 0 0">
        <h1 style="color:#C5A572;font-size:18px;margin:0">Silk Route Logistics Inc.</h1>
        <p style="color:#94A3B8;font-size:12px;margin:4px 0 0">Certificate of Insurance Verification Request</p>
      </div>

      <div style="background:#FFFFFF;padding:24px;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 8px 8px">
        <p style="color:#374151;font-size:14px;line-height:1.6">${salutation}</p>

        <p style="color:#374151;font-size:14px;line-height:1.6">
          We are writing to verify the insurance coverage for the following motor carrier:
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
              <th style="padding:10px 12px;text-align:left;font-size:11px;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px">Insurer</th>
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
          Please send updated COI to <a href="mailto:${COMPLIANCE_EMAIL}" style="color:#BA7517">${COMPLIANCE_EMAIL}</a>
        </p>

        <div style="border-top:1px solid #E5E7EB;margin-top:24px;padding-top:16px;font-size:12px;color:#6B7280;line-height:1.6">
          <strong style="color:#374151">Compliance Department</strong><br/>
          ${ENTITY_NAME}<br/>
          ${MC_LABEL} | ${DOT_LABEL}<br/>
          ${PHONE} | ${COMPLIANCE_EMAIL}<br/>
          ${DOMAIN}
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
      subject: `Certificate of Insurance Verification Request — ${carrierName} (MC# ${mcDigits(carrier.mcNumber) || "N/A"})`,
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
  return { sent: true as const, emailId: (emailResult as any).id, validation };
}

// ─── Check Expiring Insurance (Cron) ────────────────────

export async function checkExpiringInsurance() {
  const now = new Date();
  const days60 = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
  const days30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const days7 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  // Find carriers with expiring insurance
  const expiring = await prisma.carrierProfile.findMany({
    // AND, not a spread. monitoredCarrierWhere() carries its own OR — it spans
    // the two status enums — and spreading it beside this OR would silently
    // drop one of them, because the last key wins in an object literal. The
    // loser would have been the span this fix exists to add.
    where: {
      AND: [
        monitoredCarrierWhere(),
        {
          OR: [
            { autoLiabilityExpiry: { lte: days60, gte: now } },
            { cargoInsuranceExpiry: { lte: days60, gte: now } },
            { generalLiabilityExpiry: { lte: days60, gte: now } },
          ],
        },
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
        const out = await sendInsuranceVerificationEmail(carrier.id);
        if (out?.sent) remindersSent++;
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
