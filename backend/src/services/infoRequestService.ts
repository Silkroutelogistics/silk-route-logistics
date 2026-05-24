// v3.8.ajh — InfoRequest workflow service.
//
// Encapsulates the three operations + their auto-flip side effects:
//   * createInfoRequest — AE creates an OPEN request against a carrier.
//     If this is the carrier's first OPEN request, auto-flip
//     onboardingStatus PENDING/REVIEWING → INFO_REQUESTED.
//     Sends carrier email with request details + portal link.
//   * resolveInfoRequest — carrier submits text response to an OPEN
//     request. If this was the LAST open request for the carrier,
//     flip onboardingStatus INFO_REQUESTED → REVIEWING. Sends AE
//     email with the response + portal link.
//   * cancelInfoRequest — AE cancels an OPEN request they no longer
//     need. Same last-open detection + status reversal as resolve.
//
// All operations transactional via prisma.$transaction so the request
// status change + the carrier status flip succeed atomically (or both
// roll back). Email sends are fire-and-forget post-transaction per
// the existing post-registration chain pattern.
//
// Pairs with /carrier-auth/application-status which extends to include
// the open requests inline so the carrier portal can render them
// without an extra round-trip.

import { prisma } from "../config/database";
import { sendEmail, wrap } from "./emailService";
import { log } from "../lib/logger";

// Industry-standard category labels for AE template + carrier portal display.
// Order chosen by carrier-onboarding frequency (most common asks first).
const CATEGORY_LABELS: Record<string, string> = {
  COI_UPDATE: "Updated Certificate of Insurance (COI)",
  W9_UPDATE: "Updated W-9 form",
  AUTHORITY_LETTER: "FMCSA Authority Letter",
  SAFETY_CLARIFICATION: "Safety record clarification",
  EIN_VERIFICATION: "EIN/TIN verification",
  VOIDED_CHECK: "Voided check (for Quick Pay setup)",
  ADDRESS_PROOF: "Proof of address",
  REFERENCES: "References from prior brokers",
  OTHER: "Additional information",
};

// Default message templates per category. AE can edit before sending.
// Tone matches existing carrier-facing emails — professional, specific,
// and direct about what's needed and why.
const CATEGORY_TEMPLATES: Record<string, string> = {
  COI_UPDATE: "Please provide an updated Certificate of Insurance. The COI on file expires soon or appears to be missing required coverage. SRL must be listed as Certificate Holder.",
  W9_UPDATE: "Please provide a current W-9 form. Federal tax ID information is required for payment processing.",
  AUTHORITY_LETTER: "Please provide a current copy of your FMCSA Operating Authority letter.",
  SAFETY_CLARIFICATION: "We need clarification on a recent safety record entry. Please describe the circumstances and any corrective actions taken.",
  EIN_VERIFICATION: "Please confirm your EIN/TIN. We need this to verify your business identity against IRS records.",
  VOIDED_CHECK: "Please provide a voided business check from the account where you would like Quick Pay deposits sent.",
  ADDRESS_PROOF: "Please provide proof of business address (utility bill, lease agreement, or business license dated within the last 90 days).",
  REFERENCES: "Please provide contact information (name + phone) for 2-3 brokers you have hauled for in the last 90 days.",
  OTHER: "",
};

export function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] || "Additional information";
}

export function getCategoryTemplate(category: string): string {
  return CATEGORY_TEMPLATES[category] || "";
}

interface CreateInfoRequestArgs {
  carrierId: string;
  createdById: string;
  category: string;
  message: string;
}

// Returns the created request. Transactional with status auto-flip.
// Email send is fire-and-forget post-transaction.
export async function createInfoRequest(args: CreateInfoRequestArgs) {
  const carrier = await prisma.carrierProfile.findUnique({
    where: { id: args.carrierId },
    select: { id: true, onboardingStatus: true, companyName: true, user: { select: { email: true, firstName: true } } },
  });
  if (!carrier) {
    throw new Error("Carrier not found");
  }

  // Atomic: create + status flip in one transaction so we don't end up
  // with an OPEN request but a stale status (or vice versa) on failure.
  const result = await prisma.$transaction(async (tx) => {
    const request = await tx.infoRequest.create({
      data: {
        carrierId: args.carrierId,
        createdById: args.createdById,
        category: args.category as any,
        message: args.message,
        status: "OPEN",
      },
    });

    // Auto-flip onboardingStatus to INFO_REQUESTED when carrier was in
    // PENDING/REVIEWING. Skip if already INFO_REQUESTED (no-op) or any
    // terminal state (APPROVED/REJECTED/SUSPENDED — AE shouldn't be
    // creating requests against terminal carriers, but defensively
    // we don't flip those).
    if (carrier.onboardingStatus === "PENDING" || carrier.onboardingStatus === "REVIEWING") {
      await tx.carrierProfile.update({
        where: { id: args.carrierId },
        data: { onboardingStatus: "INFO_REQUESTED" },
      });
    }

    return request;
  });

  // Fire-and-forget email to carrier.
  if (carrier.user.email) {
    sendInfoRequestEmail({
      email: carrier.user.email,
      firstName: carrier.user.firstName || "there",
      categoryLabel: getCategoryLabel(args.category),
      message: args.message,
    }).catch((err) => log.error({ err, requestId: result.id }, "[InfoRequest] Carrier email failed"));
  }

  return result;
}

interface ResolveInfoRequestArgs {
  requestId: string;
  carrierUserId: string; // carrier User.id from authenticate middleware
  resolvedNote: string;
  // v3.8.aji — Optional attachment count for the AE notification email.
  // Document rows are created in the route handler BEFORE this service
  // is called (so they're recoverable even if the service throws on a
  // stale already-resolved check). The service just needs the count
  // for the email body — no document IDs needed at this layer.
  attachmentCount?: number;
}

// Returns the resolved request. Auth check: the request must belong to
// a CarrierProfile owned by carrierUserId.
export async function resolveInfoRequest(args: ResolveInfoRequestArgs) {
  const request = await prisma.infoRequest.findUnique({
    where: { id: args.requestId },
    include: {
      carrier: {
        select: {
          id: true,
          userId: true,
          companyName: true,
          onboardingStatus: true,
          mcNumber: true,
          dotNumber: true,
        },
      },
      createdBy: { select: { id: true, email: true, firstName: true } },
    },
  });

  if (!request) {
    throw new Error("Info request not found");
  }
  if (request.carrier.userId !== args.carrierUserId) {
    throw new Error("Not authorized to resolve this request");
  }
  if (request.status !== "OPEN") {
    throw new Error("This request has already been resolved or cancelled");
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.infoRequest.update({
      where: { id: args.requestId },
      data: {
        status: "RESOLVED",
        resolvedNote: args.resolvedNote,
        resolvedAt: new Date(),
      },
    });

    // Check if any OPEN requests remain for this carrier. If none, flip
    // onboardingStatus INFO_REQUESTED → REVIEWING so AE can pick the
    // application back up.
    const remainingOpen = await tx.infoRequest.count({
      where: { carrierId: request.carrier.id, status: "OPEN" },
    });
    if (remainingOpen === 0 && request.carrier.onboardingStatus === "INFO_REQUESTED") {
      await tx.carrierProfile.update({
        where: { id: request.carrier.id },
        data: { onboardingStatus: "REVIEWING" },
      });
    }

    return updated;
  });

  // Fire-and-forget email to AE who created the request.
  if (request.createdBy.email) {
    sendInfoRequestResolvedEmail({
      aeEmail: request.createdBy.email,
      aeFirstName: request.createdBy.firstName || "there",
      carrierName: request.carrier.companyName || "carrier",
      carrierMc: request.carrier.mcNumber,
      carrierDot: request.carrier.dotNumber,
      categoryLabel: getCategoryLabel(request.category),
      resolvedNote: args.resolvedNote,
      attachmentCount: args.attachmentCount || 0,
    }).catch((err) => log.error({ err, requestId: result.id }, "[InfoRequest] AE resolved-email failed"));
  }

  return result;
}

interface CancelInfoRequestArgs {
  requestId: string;
  cancelledById: string;
}

export async function cancelInfoRequest(args: CancelInfoRequestArgs) {
  const request = await prisma.infoRequest.findUnique({
    where: { id: args.requestId },
    select: {
      id: true,
      status: true,
      carrierId: true,
      carrier: { select: { onboardingStatus: true } },
    },
  });

  if (!request) {
    throw new Error("Info request not found");
  }
  if (request.status !== "OPEN") {
    throw new Error("Only open requests can be cancelled");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.infoRequest.update({
      where: { id: args.requestId },
      data: {
        status: "CANCELLED",
        cancelledById: args.cancelledById,
        cancelledAt: new Date(),
      },
    });

    // Same last-open detection as resolve. If AE cancels the only OPEN
    // request, status returns to REVIEWING.
    const remainingOpen = await tx.infoRequest.count({
      where: { carrierId: request.carrierId, status: "OPEN" },
    });
    if (remainingOpen === 0 && request.carrier.onboardingStatus === "INFO_REQUESTED") {
      await tx.carrierProfile.update({
        where: { id: request.carrierId },
        data: { onboardingStatus: "REVIEWING" },
      });
    }

    return updated;
  });
}

// ── Email templates ──

interface InfoRequestEmailArgs {
  email: string;
  firstName: string;
  categoryLabel: string;
  message: string;
}

async function sendInfoRequestEmail(args: InfoRequestEmailArgs) {
  const portalUrl = "https://silkroutelogistics.ai/carrier/dashboard/application-status";
  const html = wrap(`
    <h2 style="color:#0A2540;margin-bottom:4px">We need additional information</h2>
    <p style="color:#3A4A5F;margin-bottom:24px">Hi ${args.firstName},</p>
    <p style="color:#3A4A5F">As part of reviewing your carrier application, our compliance team has requested additional information. Please respond in your portal at your earliest convenience so we can continue reviewing your application.</p>

    <div style="background:#FBF7F0;border:1px solid #EFE6D3;border-radius:8px;padding:18px 20px;margin:24px 0">
      <p style="font-size:11px;color:#BA7517;text-transform:uppercase;letter-spacing:2px;margin:0 0 8px;font-weight:600">Information requested</p>
      <p style="color:#0A2540;font-size:15px;font-weight:600;margin:0 0 12px">${args.categoryLabel}</p>
      <p style="color:#3A4A5F;font-size:14px;line-height:1.5;margin:0;white-space:pre-wrap">${args.message}</p>
    </div>

    <div style="text-align:center;margin:32px 0">
      <a href="${portalUrl}" style="display:inline-block;background:#BA7517;color:#FBF7F0;padding:14px 36px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:15px">Respond in Portal</a>
    </div>

    <p style="color:#6B7685;font-size:13px;margin-top:24px">Once you respond, your application returns to active review. If you have questions about what we're asking for, reply to this email and our compliance team will help clarify.</p>
  `);

  await sendEmail(args.email, "Additional information needed — Silk Route Logistics", html, undefined, {
    replyTo: "compliance@silkroutelogistics.ai",
  });
}

interface InfoRequestResolvedEmailArgs {
  aeEmail: string;
  aeFirstName: string;
  carrierName: string;
  carrierMc: string | null;
  carrierDot: string | null;
  categoryLabel: string;
  resolvedNote: string;
  attachmentCount: number;
}

async function sendInfoRequestResolvedEmail(args: InfoRequestResolvedEmailArgs) {
  const dashboardUrl = "https://silkroutelogistics.ai/dashboard/carriers";
  const carrierRef = [args.carrierMc && `MC# ${args.carrierMc.replace(/^MC-?/i, "")}`, args.carrierDot && `DOT# ${args.carrierDot}`].filter(Boolean).join(" · ");

  // v3.8.aji — Attachment count summary in the email body.
  // Carrier-uploaded files surface via the existing /dashboard/carriers
  // documents tab (entityType=CARRIER + entityId=carrierProfileId);
  // the email just signals their presence + count so the AE knows to
  // check the documents tab in addition to reading the response text.
  const attachmentLine = args.attachmentCount > 0
    ? `<p style="font-size:11px;color:#BA7517;text-transform:uppercase;letter-spacing:2px;margin:16px 0 8px;font-weight:600">Attachments</p>
       <p style="color:#3A4A5F;font-size:14px;margin:0">${args.attachmentCount} file${args.attachmentCount === 1 ? "" : "s"} uploaded. View them in the carrier's Documents tab.</p>`
    : "";

  const html = wrap(`
    <h2 style="color:#0A2540;margin-bottom:4px">Info request resolved</h2>
    <p style="color:#3A4A5F;margin-bottom:24px">Hi ${args.aeFirstName},</p>
    <p style="color:#3A4A5F"><strong>${args.carrierName}</strong>${carrierRef ? ` (${carrierRef})` : ""} has responded to your info request. Their application has returned to active review.</p>

    <div style="background:#FBF7F0;border:1px solid #EFE6D3;border-radius:8px;padding:18px 20px;margin:24px 0">
      <p style="font-size:11px;color:#BA7517;text-transform:uppercase;letter-spacing:2px;margin:0 0 8px;font-weight:600">Original ask</p>
      <p style="color:#0A2540;font-size:14px;font-weight:600;margin:0 0 16px">${args.categoryLabel}</p>

      <p style="font-size:11px;color:#2F7A4F;text-transform:uppercase;letter-spacing:2px;margin:0 0 8px;font-weight:600">Carrier response</p>
      <p style="color:#3A4A5F;font-size:14px;line-height:1.5;margin:0;white-space:pre-wrap">${args.resolvedNote}</p>
      ${attachmentLine}
    </div>

    <div style="text-align:center;margin:32px 0">
      <a href="${dashboardUrl}" style="display:inline-block;background:#BA7517;color:#FBF7F0;padding:14px 36px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:15px">Review Carrier</a>
    </div>
  `);

  await sendEmail(args.aeEmail, `Info request resolved — ${args.carrierName}`, html);
}
