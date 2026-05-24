// v3.8.ajk — Carrier rejection workflow with per-reason reapply windows.
//
// Replaces the previous bare status update (carrierController.updateCarrier
// where AE just flipped onboardingStatus to REJECTED with no captured
// reason). Now every rejection records:
//   * Why (RejectionReason enum)
//   * Who (rejectedById = AE user id)
//   * When (rejectedAt = server timestamp)
//   * Optional context (rejectionNote free-form)
//   * Reapply eligibility (reapplyEligibleAt — computed from REASON,
//     null for FRAUD_DETECTED + IDENTITY_FRAUD permanent disqualification)
//
// Carrier-portal RejectedSection (application-status/page.tsx) reads
// these fields + renders the reason, the rejection note, and the
// reapply date with a countdown. When the date passes, a Reapply CTA
// becomes active.

import { prisma } from "../config/database";
import { sendEmail, wrap } from "./emailService";
import { log } from "../lib/logger";

// Industry-standard reapply windows by rejection reason (in days).
// Null = never eligible to reapply (permanent disqualification).
// Tunable: re-vetting these against operational data after BKN
// onboards N=10+ carriers is on the backlog.
const REAPPLY_WINDOWS_DAYS: Record<string, number | null> = {
  MISSING_DOCUMENTS: 7,           // quick — carrier just needs to upload
  EXPIRED_INSURANCE: 30,          // insurance renewal cycle
  AUTHORITY_NOT_ACTIVE: 60,       // FMCSA reinstatement varies
  SAFETY_RATING_UNSATISFACTORY: 90, // requires demonstrated improvement
  COMPLIANCE_VIOLATION: 60,
  FRAUD_DETECTED: null,           // permanent
  IDENTITY_FRAUD: null,           // permanent
  DUPLICATE_APPLICATION: 30,
  OTHER: 30,                      // default
};

// Human-readable labels for AE modal + carrier-facing email + RejectedSection.
const REASON_LABELS: Record<string, string> = {
  MISSING_DOCUMENTS: "Missing required documents",
  EXPIRED_INSURANCE: "Insurance coverage expired or insufficient",
  AUTHORITY_NOT_ACTIVE: "FMCSA operating authority not active",
  SAFETY_RATING_UNSATISFACTORY: "Safety rating unsatisfactory",
  COMPLIANCE_VIOLATION: "Compliance violation",
  FRAUD_DETECTED: "Fraud detected",
  IDENTITY_FRAUD: "Identity verification failed",
  DUPLICATE_APPLICATION: "Duplicate application detected",
  OTHER: "Other",
};

export function getReasonLabel(reason: string | null | undefined): string {
  if (!reason) return "—";
  return REASON_LABELS[reason] || reason;
}

export function computeReapplyEligibleAt(reason: string): Date | null {
  const days = REAPPLY_WINDOWS_DAYS[reason];
  if (days === null || days === undefined) return null;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

interface RejectCarrierArgs {
  carrierId: string;
  rejectedById: string;
  reason: string;
  note?: string;
}

export async function rejectCarrier(args: RejectCarrierArgs) {
  const carrier = await prisma.carrierProfile.findUnique({
    where: { id: args.carrierId },
    select: {
      id: true,
      onboardingStatus: true,
      companyName: true,
      mcNumber: true,
      dotNumber: true,
      user: { select: { id: true, email: true, firstName: true } },
    },
  });
  if (!carrier) throw new Error("Carrier not found");

  if (carrier.onboardingStatus === "REJECTED") {
    throw new Error("Carrier is already rejected");
  }
  if (carrier.onboardingStatus === "SUSPENDED") {
    throw new Error("Suspended carriers cannot be rejected — lift suspension first");
  }

  const reapplyEligibleAt = computeReapplyEligibleAt(args.reason);

  const updated = await prisma.carrierProfile.update({
    where: { id: args.carrierId },
    data: {
      onboardingStatus: "REJECTED",
      rejectionReason: args.reason as any,
      rejectedAt: new Date(),
      rejectedById: args.rejectedById,
      rejectionNote: args.note || null,
      reapplyEligibleAt,
    },
  });

  // Fire-and-forget email to carrier.
  if (carrier.user.email) {
    sendRejectionEmail({
      email: carrier.user.email,
      firstName: carrier.user.firstName || "there",
      reasonLabel: getReasonLabel(args.reason),
      note: args.note,
      reapplyEligibleAt,
    }).catch((err) => log.error({ err, carrierId: args.carrierId }, "[Rejection] Email failed"));
  }

  return updated;
}

interface RejectionEmailArgs {
  email: string;
  firstName: string;
  reasonLabel: string;
  note?: string;
  reapplyEligibleAt: Date | null;
}

async function sendRejectionEmail(args: RejectionEmailArgs) {
  const portalUrl = "https://silkroutelogistics.ai/carrier/dashboard/application-status";

  const reapplyLine = args.reapplyEligibleAt
    ? `<p style="color:#3A4A5F">You may reapply after <strong>${args.reapplyEligibleAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</strong>. Once that date passes, log in to your portal to submit a new application.</p>`
    : `<p style="color:#3A4A5F">This decision is final. If you believe it was made in error, contact our compliance team.</p>`;

  const noteSection = args.note
    ? `<div style="background:#FBF7F0;border:1px solid #EFE6D3;border-radius:8px;padding:16px 18px;margin:20px 0">
         <p style="font-size:11px;color:#BA7517;text-transform:uppercase;letter-spacing:2px;margin:0 0 8px;font-weight:600">Additional context</p>
         <p style="color:#3A4A5F;font-size:14px;line-height:1.5;margin:0;white-space:pre-wrap">${args.note}</p>
       </div>`
    : "";

  const html = wrap(`
    <h2 style="color:#0A2540;margin-bottom:4px">Application decision</h2>
    <p style="color:#3A4A5F;margin-bottom:24px">Hi ${args.firstName},</p>
    <p style="color:#3A4A5F">After review, we&apos;re unable to approve your carrier application at this time.</p>

    <div style="background:#F6E3E3;border:1px solid rgba(155,44,44,0.30);border-radius:8px;padding:16px 18px;margin:20px 0">
      <p style="font-size:11px;color:#9B2C2C;text-transform:uppercase;letter-spacing:2px;margin:0 0 8px;font-weight:600">Reason</p>
      <p style="color:#0A2540;font-size:14px;font-weight:600;margin:0">${args.reasonLabel}</p>
    </div>

    ${noteSection}

    ${reapplyLine}

    <div style="text-align:center;margin:32px 0">
      <a href="${portalUrl}" style="display:inline-block;background:#BA7517;color:#FBF7F0;padding:14px 36px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:15px">View Status</a>
    </div>

    <p style="color:#6B7685;font-size:13px;margin-top:24px">Questions? Reply to this email or write to <a href="mailto:compliance@silkroutelogistics.ai" style="color:#BA7517">compliance@silkroutelogistics.ai</a>.</p>
  `);

  await sendEmail(args.email, "Carrier application decision — Silk Route Logistics", html, undefined, {
    replyTo: "compliance@silkroutelogistics.ai",
  });
}
