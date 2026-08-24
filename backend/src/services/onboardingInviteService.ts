/**
 * ARC 33 — AE-issued carrier invitations.
 *
 * WHAT THIS REPLACES. The "Invite Carriers" button on the AE carriers page was
 * an anchor to `/onboarding` — the carrier's own five-step self-registration
 * wizard. It invited nobody. An AE who used it filled in a carrier's details on
 * a form built for the carrier, and set a password on their behalf. Arc 32's
 * verification gate then made that fail loudly rather than quietly, because the
 * AE cannot read the carrier's inbox — which is how the misroute surfaced.
 *
 * THE CENTRAL PROPERTY: CLICKING THE LINK IS THE VERIFICATION. The AE vouches
 * for the address by typing it; the carrier proves they can read it by opening
 * the mail. That is exactly what Arc 32's code and one-click link prove, so the
 * click mints the same receipt and the carrier never sees an OTP step. Asking
 * someone who just clicked a link in their own inbox to also type a code from
 * that inbox proves nothing twice.
 *
 * CONSUMPTION IS VERIFICATION, NOT COMPLETION. Burning the token proves the
 * mailbox. The draft persists and the wizard resumes normally — a second click
 * says "already verified, continue where you left off", never an error, because
 * re-clicking a link you were sent is not a mistake.
 *
 * TOKEN SHAPE: a random 32-byte value, stored SHA-256-hashed. Not a JWT: the
 * record is the authority, so single-use is `consumedAt` and revocation is a
 * row update, both of which a stateless token cannot give you without a
 * blacklist. The plaintext exists only in the email and in the copy-link handed
 * to the AE.
 */

import crypto from "crypto";
import { prisma } from "../config/database";
import { log } from "../lib/logger";
import { logAuthEvent } from "../lib/authEvents";
import { sendEmail, wrap } from "./emailService";
import { mintReceipt } from "./onboardingDraftService";

/** Matches the driver-invite window, and the same reasoning: long enough to survive a weekend. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const APP_BASE = "https://silkroutelogistics.ai";

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const normalizeEmail = (e: string) => e.trim().toLowerCase();

/** The URL the carrier clicks. Mirrors driverInviteUrl. */
export function carrierInviteUrl(token: string): string {
  return `${APP_BASE}/onboarding?invite=${encodeURIComponent(token)}`;
}

// ── issuing ──────────────────────────────────────────────────────────

export type IssueInput = {
  email: string;
  invitedById: string;
  company?: string;
  mcNumber?: string;
  note?: string;
  inviterName?: string;
};

export type IssueResult =
  | { ok: true; inviteUrl: string; emailSent: boolean; reissued: boolean }
  | { ok: false; reason: "already_carrier"; detail: string }
  | { ok: false; reason: "already_onboarding"; detail: string; status: string };

/**
 * Issue or re-issue an invitation.
 *
 * ENUMERATION NOTE, and it cuts the opposite way from Arc 32's public routes.
 * This endpoint is ADMIN/CEO-only and the caller is staff, so telling them
 * "already a carrier" or "already onboarding — REVIEWING" is exactly the answer
 * they need to do their job. Nothing here is carrier-facing; the carrier learns
 * only what the invitation email says.
 */
export async function issueInvite(input: IssueInput): Promise<IssueResult> {
  const email = normalizeEmail(input.email);

  // Already has an account: an invitation would be misleading at best.
  const existingUser = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, role: true, carrierProfile: { select: { onboardingStatus: true, companyName: true } } },
  });
  if (existingUser) {
    const p = existingUser.carrierProfile;
    return {
      ok: false,
      reason: "already_carrier",
      detail: p
        ? `${p.companyName} already has a carrier account (${p.onboardingStatus}).`
        : `That address already has an account on the platform (${existingUser.role}).`,
    };
  }

  // Mid-application: re-inviting would not help and the AE should see where
  // they actually are.
  const existingDraft = await prisma.onboardingDraft.findFirst({
    where: { email },
    orderBy: { updatedAt: "desc" },
  });
  if (existingDraft && existingDraft.status === "SUBMITTED") {
    // invitedAt earns its place here: an AE about to re-invite wants to know
    // this carrier was already reached, and when. Without that the 409 reads
    // as an obstruction rather than an answer.
    const when = existingDraft.invitedAt
      ? ` They were invited on ${existingDraft.invitedAt.toISOString().slice(0, 10)}.`
      : "";
    return {
      ok: false,
      reason: "already_onboarding",
      status: existingDraft.status,
      detail: `That carrier has already submitted an application. Review it in the pending list.${when}`,
    };
  }

  // Re-invite refreshes the token in place. A second invitation must not create
  // a second row racing the first.
  const priorOpen = await prisma.onboardingInvite.findFirst({
    where: { email, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });

  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  if (priorOpen) {
    await prisma.onboardingInvite.update({
      where: { id: priorOpen.id },
      data: {
        tokenHash: sha256(token),
        expiresAt,
        company: input.company ?? priorOpen.company,
        mcNumber: input.mcNumber ?? priorOpen.mcNumber,
        note: input.note ?? priorOpen.note,
        invitedById: input.invitedById,
      },
    });
  } else {
    await prisma.onboardingInvite.create({
      data: {
        tokenHash: sha256(token),
        email,
        invitedById: input.invitedById,
        company: input.company ?? null,
        mcNumber: input.mcNumber ?? null,
        note: input.note ?? null,
        expiresAt,
      },
    });
  }

  // The draft is created NOW, at INVITED, so the funnel shows the invitation
  // even if the carrier never opens it. An invitation nobody can see the
  // outcome of is not a pipeline.
  const draftKey = { email, mcNumber: input.mcNumber || `INVITE-${email}` };
  await prisma.onboardingDraft.upsert({
    where: { email_mcNumber: draftKey },
    update: {
      company: input.company ?? undefined,
      invitedById: input.invitedById,
      invitedAt: new Date(),
      // Re-inviting somebody who already clicked must not walk their state
      // backwards — they have proven the mailbox and that does not un-happen.
      ...(existingDraft && existingDraft.status !== "STARTED" ? {} : { status: "INVITED" as const }),
    },
    create: {
      email,
      mcNumber: draftKey.mcNumber,
      company: input.company ?? null,
      nonce: crypto.randomBytes(16).toString("hex"),
      status: "INVITED",
      invitedById: input.invitedById,
      invitedAt: new Date(),
    },
  });

  const inviteUrl = carrierInviteUrl(token);
  let emailSent = false;
  try {
    await sendEmail(
      email,
      "You're invited to join the Silk Route Logistics carrier network",
      wrap(`
        <h2 style="margin:0 0 12px;font-family:Georgia,serif;color:#0A2540;">You've been invited to onboard</h2>
        <p style="color:#3A4A5F;">${input.inviterName ? `${escapeHtml(input.inviterName)} at ` : ""}Silk Route Logistics
        has invited ${input.company ? `<strong>${escapeHtml(input.company)}</strong>` : "your company"} to join our carrier network.</p>
        ${input.note ? `<p style="margin:16px 0;padding:12px 16px;background:#FBF7F0;border-left:3px solid #BA7517;color:#3A4A5F;">${escapeHtml(input.note)}</p>` : ""}
        <p style="color:#3A4A5F;">Opening the link below confirms this email address and takes you straight into the
        application — there is no code to type.</p>
        <p style="margin:20px 0 24px;">
          <a href="${inviteUrl}" style="background:#BA7517;color:#FFFFFF;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;">Start your application</a>
        </p>
        <p style="color:#6B7685;font-size:13px;">This link is good for 7 days and can only be used once.
        If it expires, the page will offer to request a new one.</p>
        <p style="color:#6B7685;font-size:12px;">If you were not expecting this, you can ignore it — nothing happens until you open the link.</p>
      `),
      undefined,
      { replyTo: "operations@silkroutelogistics.ai" },
    );
    emailSent = true;
  } catch (err) {
    // The copy-link fallback is why this is not fatal: the AE can still send it
    // by hand, exactly as the driver-invite flow does.
    log.warn({ err }, "[Invite] invitation email failed — copy-link fallback returned to the AE");
  }

  logAuthEvent("onboarding.invited", { email, userId: input.invitedById });
  return { ok: true, inviteUrl, emailSent, reissued: !!priorOpen };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}

// ── accepting ────────────────────────────────────────────────────────

export type AcceptResult =
  | {
      ok: true;
      email: string;
      receipt: string;
      prefill: { company: string | null; mcNumber: string | null };
      alreadyUsed: boolean;
    }
  | { ok: false; reason: "not_found" | "expired" };

/**
 * The click. Burns the token, records the funnel step, and mints the Arc 32
 * receipt — the same artifact the typed code produces, so registration's gate
 * needs no special case for invited carriers.
 *
 * A second click on a burned token still returns ok with `alreadyUsed`, because
 * the mailbox was proven and re-opening your own email is not an error.
 */
export async function acceptInvite(token: string): Promise<AcceptResult> {
  const invite = await prisma.onboardingInvite.findUnique({ where: { tokenHash: sha256(token) } });
  if (!invite) {
    logAuthEvent("onboarding.invite_failed", { reason: "invalid_token" });
    return { ok: false, reason: "not_found" };
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    logAuthEvent("onboarding.invite_failed", { email: invite.email, reason: "expired_token" });
    return { ok: false, reason: "expired" };
  }

  const alreadyUsed = invite.consumedAt !== null;
  const now = new Date();
  if (!alreadyUsed) {
    await prisma.onboardingInvite.update({ where: { id: invite.id }, data: { consumedAt: now } });
  }

  // The draft key mirrors what issueInvite created.
  const mcKey = invite.mcNumber || `INVITE-${invite.email}`;
  const draft = await prisma.onboardingDraft.upsert({
    where: { email_mcNumber: { email: invite.email, mcNumber: mcKey } },
    update: {
      // verifiedAt is what the receipt binds against; the click is the proof.
      verifiedAt: now,
      status: "LINK_CLICKED",
      company: invite.company ?? undefined,
      invitedById: invite.invitedById,
    },
    create: {
      email: invite.email,
      mcNumber: mcKey,
      company: invite.company ?? null,
      nonce: crypto.randomBytes(16).toString("hex"),
      verifiedAt: now,
      status: "LINK_CLICKED",
      invitedById: invite.invitedById,
      invitedAt: invite.createdAt,
    },
  });

  logAuthEvent(alreadyUsed ? "onboarding.invite_reopened" : "onboarding.invite_accepted", {
    email: invite.email,
  });

  return {
    ok: true,
    email: invite.email,
    receipt: mintReceipt({ email: draft.email, verifiedAt: now.getTime(), nonce: draft.nonce }),
    prefill: { company: invite.company, mcNumber: invite.mcNumber },
    alreadyUsed,
  };
}

/**
 * An expired link asks the inviting AE for a fresh one rather than issuing one
 * itself. Auto-resend on an expired token would let anyone holding an old link
 * mint new ones indefinitely, which is the opposite of what an expiry is for.
 */
export async function requestFreshInvite(token: string): Promise<{ notified: boolean }> {
  const invite = await prisma.onboardingInvite.findUnique({
    where: { tokenHash: sha256(token) },
    select: { email: true, company: true, invitedById: true },
  });
  if (!invite) return { notified: false };

  try {
    await prisma.notification.create({
      data: {
        userId: invite.invitedById,
        type: "ONBOARDING",
        title: "Carrier asked for a fresh invitation",
        message: `${invite.company ?? invite.email} opened an expired invitation link and asked for a new one.`,
        actionUrl: "/dashboard/carriers",
      },
    });
    return { notified: true };
  } catch (err) {
    log.warn({ err }, "[Invite] could not notify the inviting AE of a refresh request");
    return { notified: false };
  }
}
