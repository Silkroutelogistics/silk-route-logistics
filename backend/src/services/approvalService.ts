// v3.8.ajt B5 — Dedicated AE approval flow for carriers.
//
// Pre-ajt the AE-side approval went through the generic PUT /:id update
// endpoint which (a) didn't fire a carrier-facing approval email, (b)
// didn't write a dedicated AuditAction.APPROVE row (used generic UPDATE),
// (c) had no notification fan-out to the carrier. Result: carrier learned
// they were approved only by happening to log in and seeing the dashboard
// switch from status page to main dashboard.
//
// This service mirrors the rejectionService / liftCarrierRejection pattern:
//   * Validate not already APPROVED + not currently SUSPENDED
//   * Atomic update: onboardingStatus → APPROVED, approvedAt, isVerified
//     (legacy field — keeps existing 27+ readers happy)
//   * Send brand-canonical carrier email with portal CTA
//   * Create in-app Notification row (type ONBOARDING) for the bell
//
// Compass auto-approve path remains separate (v3.8.aje gate in
// carrierController.ts line 391+ requires emailVerifiedAt). This service
// is the AE-discretion override path — AE can approve a carrier even
// without email verification if operational judgment says so.

import { prisma } from "../config/database";
import { sendEmail, wrap } from "./emailService";
import { log } from "../lib/logger";

interface ApproveCarrierArgs {
  carrierId: string;
  approvedById: string;
  note?: string;
}

export async function approveCarrier(args: ApproveCarrierArgs) {
  const carrier = await prisma.carrierProfile.findUnique({
    where: { id: args.carrierId },
    select: {
      id: true,
      userId: true,
      onboardingStatus: true,
      companyName: true,
      mcNumber: true,
      dotNumber: true,
      user: { select: { email: true, firstName: true } },
    },
  });
  if (!carrier) throw new Error("Carrier not found");

  if (carrier.onboardingStatus === "APPROVED") {
    throw new Error("Carrier is already approved");
  }
  if (carrier.onboardingStatus === "SUSPENDED") {
    throw new Error("Suspended carriers must have suspension lifted before approval");
  }

  // Atomic: flip carrier status + flip legacy User.isVerified (used as
  // synonym for AE-approved across 27+ existing read sites — kept in sync
  // here so we don't introduce drift relative to the existing Compass
  // auto-approve path at carrierController.ts:306).
  const updated = await prisma.$transaction(async (tx) => {
    const updatedProfile = await tx.carrierProfile.update({
      where: { id: args.carrierId },
      data: {
        onboardingStatus: "APPROVED",
        approvedAt: new Date(),
        // Note: CarrierProfile has no `approvedById` column (only
        // `approvedAt`). AE attribution captured via `auditLog("APPROVE",
        // "Carrier")` on the route layer + the `args.approvedById` arg
        // passed through here for future schema migration. Banked as a
        // small follow-up if AE forensics needs per-approval attribution.
        // Clear any prior rejection metadata if approving a previously
        // rejected carrier (Lift Rejection path goes REJECTED → REVIEWING
        // first, then AE approves; this defensive clear keeps the row
        // clean if AE skips the intermediate state).
        rejectionReason: null,
        rejectedAt: null,
        rejectedById: null,
        rejectionNote: null,
        reapplyEligibleAt: null,
        reapplyReminderSentAt: null,
      },
    });
    await tx.user.update({
      where: { id: carrier.userId },
      data: { isVerified: true },
    });
    return updatedProfile;
  });

  // Fire-and-forget carrier email + in-app notification.
  if (carrier.user.email) {
    sendCarrierApprovalEmail({
      email: carrier.user.email,
      firstName: carrier.user.firstName || "there",
      companyName: carrier.companyName,
      note: args.note,
    }).catch((err) => log.error({ err, carrierId: args.carrierId }, "[Approval] Carrier email failed"));
  }

  // In-app notification — surfaces on the NotificationBell when the
  // carrier next logs in.
  prisma.notification.create({
    data: {
      userId: carrier.userId,
      type: "ONBOARDING",
      title: "Application Approved!",
      message: "Welcome to the Caravan Partner Program. You're cleared to start hauling loads.",
      actionUrl: "/carrier/dashboard",
    },
  }).catch((err) => log.error({ err, carrierId: args.carrierId }, "[Approval] In-app notification failed"));

  return updated;
}

interface ApprovalEmailArgs {
  email: string;
  firstName: string;
  companyName: string | null;
  note?: string;
}

async function sendCarrierApprovalEmail(args: ApprovalEmailArgs) {
  const portalUrl = "https://silkroutelogistics.ai/carrier/login";

  const noteSection = args.note
    ? `<div style="background:#FBF7F0;border:1px solid #EFE6D3;border-radius:8px;padding:16px 18px;margin:20px 0">
         <p style="font-size:11px;color:#BA7517;text-transform:uppercase;letter-spacing:2px;margin:0 0 8px;font-weight:600">Note from our team</p>
         <p style="color:#3A4A5F;font-size:14px;line-height:1.5;margin:0;white-space:pre-wrap">${args.note}</p>
       </div>`
    : "";

  const html = wrap(`
    <h2 style="color:#0A2540;margin-bottom:4px">Welcome to the Caravan Partner Program</h2>
    <p style="color:#3A4A5F;margin-bottom:24px">Hi ${args.firstName},</p>
    <p style="color:#3A4A5F">Good news — your carrier application has been approved. ${args.companyName ? `<strong>${args.companyName}</strong> is` : "You're"} now cleared to receive tender offers and start hauling loads with Silk Route Logistics.</p>

    <div style="background:#E6F0E9;border:1px solid rgba(47,122,79,0.30);border-radius:8px;padding:16px 18px;margin:20px 0">
      <p style="font-size:11px;color:#2F7A4F;text-transform:uppercase;letter-spacing:2px;margin:0 0 8px;font-weight:600">Status</p>
      <p style="color:#0A2540;font-size:14px;font-weight:600;margin:0">Approved · Caravan Partner</p>
    </div>

    ${noteSection}

    <p style="color:#3A4A5F">From your carrier portal you can browse available loads, view tender offers, upload documents, and request Quick Pay on completed loads.</p>

    <div style="text-align:center;margin:32px 0">
      <a href="${portalUrl}" style="display:inline-block;background:#BA7517;color:#FBF7F0;padding:14px 36px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:15px">Sign In to Your Portal</a>
    </div>

    <p style="color:#6B7685;font-size:13px;margin-top:24px">Questions? Reply to this email or write to <a href="mailto:operations@silkroutelogistics.ai" style="color:#BA7517">operations@silkroutelogistics.ai</a>.</p>
  `);

  await sendEmail(args.email, "Welcome to Silk Route Logistics — Application Approved", html, undefined, {
    replyTo: "operations@silkroutelogistics.ai",
  });
}
