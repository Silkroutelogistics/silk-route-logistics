/**
 * ARC 33 Phase 2b — the onboarding moments a carrier was never told about.
 *
 * Phase A found four of five lifecycle moments already had an email, and the
 * fifth had no email because THE TRANSITION ITSELF DID NOT EXIST: nothing moved
 * a carrier from PENDING to REVIEWING. A submitted application went silent
 * between the receipt email and a decision, which for the carrier is
 * indistinguishable from being ignored.
 *
 * THE RULE THIS FILE ENFORCES (ratified input 4): a lifecycle email rides the
 * STATUS TRANSITION, never the code path that caused it. The approval
 * asymmetry — AE-approved carriers were congratulated, Compass-auto-approved
 * carriers were not — was the same defect in the other direction. A carrier
 * must not be able to infer HOW they were handled from WHETHER they heard
 * anything.
 *
 * DEDUP IS LINK-ENCODED. The notification's actionUrl carries the transition
 * marker, so a repeated transition cannot re-announce itself. No migration, and
 * it survives a retry or a second path arriving late — the same shape
 * podReminderService uses.
 */

import { prisma } from "../config/database";
import { log } from "../lib/logger";
import { sendEmail, wrap } from "./emailService";

const PORTAL = "https://silkroutelogistics.ai";

/**
 * Announce exactly once, keyed on the link. Returns whether it announced, so
 * callers can log the difference between "sent" and "already sent" rather than
 * guessing.
 */
async function announceOnce(args: {
  userId: string;
  email: string | null;
  link: string;
  title: string;
  inAppMessage: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  const already = await prisma.notification.findFirst({
    where: { userId: args.userId, actionUrl: args.link },
    select: { id: true },
  });
  if (already) return false;

  await prisma.notification.create({
    data: {
      userId: args.userId,
      type: "ONBOARDING",
      title: args.title,
      message: args.inAppMessage,
      actionUrl: args.link,
    },
  });

  if (args.email) {
    // Non-blocking: a transport failure must not roll back a state change that
    // has already happened.
    sendEmail(args.email, args.subject, args.html, undefined, {
      replyTo: "operations@silkroutelogistics.ai",
    }).catch((err) => log.warn({ err }, "[Lifecycle] email failed; in-app notification stands"));
  }
  return true;
}

/**
 * PENDING → REVIEWING. The transition that did not exist.
 *
 * Idempotent and one-directional: calling it on a carrier already past PENDING
 * is a no-op rather than a walk backwards, because an AE opening a file twice
 * is not a state change.
 */
export async function transitionToReviewing(carrierId: string): Promise<{ moved: boolean; announced: boolean }> {
  const carrier = await prisma.carrierProfile.findUnique({
    where: { id: carrierId },
    select: {
      id: true,
      userId: true,
      companyName: true,
      onboardingStatus: true,
      user: { select: { email: true, firstName: true } },
    },
  });
  if (!carrier) throw new Error("Carrier not found");
  if (carrier.onboardingStatus !== "PENDING") return { moved: false, announced: false };

  await prisma.carrierProfile.update({
    where: { id: carrierId },
    data: { onboardingStatus: "REVIEWING" , status: "REVIEW"},
  });

  const link = `/carrier/dashboard/application-status?reviewing=${carrierId}`;
  const announced = await announceOnce({
    userId: carrier.userId,
    email: carrier.user?.email ?? null,
    link,
    title: "Your application is under review",
    inAppMessage: "A member of our team has your application open. We'll be in touch shortly.",
    subject: "Your Silk Route Logistics application is under review",
    html: wrap(`
      <h2 style="margin:0 0 12px;font-family:Georgia,serif;color:#0A2540;">We're reviewing your application</h2>
      <p style="color:#3A4A5F;">Someone on our team has your application open. Most reviews finish within a few
      business days.</p>
      <p style="color:#3A4A5F;">If we need anything else from you, we'll ask here and by email — you don't need
      to do anything right now.</p>
      <p style="margin:20px 0 24px;">
        <a href="${PORTAL}/carrier/dashboard/application-status" style="background:#BA7517;color:#FFFFFF;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;">Check your status</a>
      </p>
    `),
  });

  log.info({ carrierId, announced }, "[Lifecycle] PENDING -> REVIEWING");
  return { moved: true, announced };
}

/**
 * Confirm to the CARRIER that their answer landed. The AE was already emailed
 * when a request was resolved; the carrier — the one who did the work — heard
 * nothing, so from their side answering and being ignored looked the same.
 */
export async function confirmInfoRequestAnswered(args: {
  carrierId: string;
  requestId: string;
  categoryLabel: string;
  askedFor: string;
}): Promise<boolean> {
  const carrier = await prisma.carrierProfile.findUnique({
    where: { id: args.carrierId },
    select: { userId: true, user: { select: { email: true } } },
  });
  if (!carrier) return false;

  return announceOnce({
    userId: carrier.userId,
    email: carrier.user?.email ?? null,
    link: `/carrier/dashboard/application-status?answered=${args.requestId}`,
    title: "We received your response",
    inAppMessage: `Thanks — your response to our ${args.categoryLabel} request is with the review team.`,
    subject: "We received your response — Silk Route Logistics",
    html: wrap(`
      <h2 style="margin:0 0 12px;font-family:Georgia,serif;color:#0A2540;">Got it, thank you</h2>
      <p style="color:#3A4A5F;">Your response is with our review team and your application is moving again.</p>
      <p style="font-size:13px;color:#6B7685;margin:20px 0 6px;letter-spacing:.08em;text-transform:uppercase;">What we asked for</p>
      <p style="margin:0 0 20px;padding:12px 16px;background:#FBF7F0;border-left:3px solid #BA7517;color:#3A4A5F;">${escapeHtml(args.askedFor)}</p>
      <p style="margin:20px 0 24px;">
        <a href="${PORTAL}/carrier/dashboard/application-status" style="background:#BA7517;color:#FFFFFF;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;">View your application</a>
      </p>
    `),
  });
}

/**
 * A withdrawn request is the more urgent of the two silences: without this the
 * carrier keeps chasing paperwork nobody needs any more.
 */
export async function notifyInfoRequestWithdrawn(args: {
  carrierId: string;
  requestId: string;
  categoryLabel: string;
}): Promise<boolean> {
  const carrier = await prisma.carrierProfile.findUnique({
    where: { id: args.carrierId },
    select: { userId: true, user: { select: { email: true } } },
  });
  if (!carrier) return false;

  return announceOnce({
    userId: carrier.userId,
    email: carrier.user?.email ?? null,
    link: `/carrier/dashboard/application-status?withdrawn=${args.requestId}`,
    title: "We no longer need that document",
    inAppMessage: `Our ${args.categoryLabel} request has been withdrawn — nothing further is needed.`,
    subject: "You can disregard our last request — Silk Route Logistics",
    html: wrap(`
      <h2 style="margin:0 0 12px;font-family:Georgia,serif;color:#0A2540;">You can disregard that request</h2>
      <p style="color:#3A4A5F;">We asked for <strong>${escapeHtml(args.categoryLabel)}</strong> and no longer need it.
      Please don't spend any more time on it.</p>
      <p style="color:#3A4A5F;">Your application is back with our review team.</p>
      <p style="margin:20px 0 24px;">
        <a href="${PORTAL}/carrier/dashboard/application-status" style="background:#BA7517;color:#FFFFFF;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;">View your application</a>
      </p>
    `),
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}
