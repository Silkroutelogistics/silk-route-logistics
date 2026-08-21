import { prisma } from "../config/database";
import { log } from "../lib/logger";
import { normalizePhoneE164 } from "../lib/phoneNormalization";

/**
 * Proving that the number on a load reaches the person driving it.
 *
 * WHY THIS EXISTS. `Load.driverPhone` was free text a carrier typed. Every check
 * call, every ping request and every dispatch message went to a number nobody
 * had ever confirmed reaches a handset, let alone the right one. A typo produced
 * silence indistinguishable from a driver ignoring us, and a deliberately wrong
 * number produced the same silence with worse intent behind it.
 *
 * WHY NOT `OtpCode`. That model requires a `userId` FK to `User`, and a driver
 * is deliberately not a User (§13.3 Item 193 T2). Reusing it would mean minting
 * a User per driver — the registration-bypass shape that decision exists to
 * prevent. So this is one of the parts Arc 19 had to build rather than assemble.
 *
 * WHAT IS PROVEN, AND WHAT IS NOT. A passed verification says: at this moment,
 * something holding this handset read a code we sent to it and typed it back. It
 * does NOT say the person is the named driver, that they hold a CDL, or that
 * they are still holding the phone tomorrow. Those are different claims needing
 * different evidence, and the code must not imply otherwise.
 */

/**
 * The consent sentence shown at verification, stored verbatim on the row.
 *
 * VERSIONED, AND THE VERSION IS PART OF THE TEXT. A TCPA dispute asks what this
 * person agreed to, not what the current build says — so the exact string is
 * copied onto every verification rather than referenced. Changing this constant
 * changes what future drivers are shown and leaves past consents describing
 * themselves accurately.
 *
 * NOT REVIEWED BY COUNSEL. It is drafted to the shape TCPA asks for — who is
 * messaging, what about, how often, that rates apply, and how to stop — and it
 * goes in the counsel pile with the BCA and the Quick Pay Agreement (§16).
 */
export const DRIVER_SMS_CONSENT_VERSION = "2026-08-21-v1";
export const DRIVER_SMS_CONSENT_TEXT =
  `[${DRIVER_SMS_CONSENT_VERSION}] Silk Route Logistics Inc. will text this number about the load you are ` +
  `hauling for us: check calls, pickup and delivery reminders, and a link you can tap to share your ` +
  `location. Message frequency depends on the load. Message and data rates may apply. ` +
  `Reply STOP to stop. Reply HELP for help. Consent is not a condition of being dispatched.`;

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

/** Six digits, uniform, from the platform CSPRNG rather than Math.random. */
function generateCode(): string {
  const { randomInt } = require("crypto") as typeof import("crypto");
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export interface StartResult {
  ok: boolean;
  reason?: string;
  phone?: string;
  alreadyVerified?: boolean;
}

/**
 * Begin verification for a load's driver number.
 *
 * Idempotent on an already-verified number: re-texting a driver who has already
 * proven the handset is noise, and noise on a channel a carrier can opt out of
 * is a channel that stops working when it matters.
 */
export async function startDriverVerification(opts: {
  loadId: string;
  phone: string;
  driverName?: string | null;
}): Promise<StartResult> {
  const phone = normalizePhoneE164(opts.phone);
  if (!phone) return { ok: false, reason: "That does not look like a US mobile number." };

  const load = await prisma.load.findUnique({
    where: { id: opts.loadId },
    select: { id: true, referenceNumber: true, driverPhoneVerified: true, driverPhoneVerifiedAt: true },
  });
  if (!load) return { ok: false, reason: "Load not found." };

  if (load.driverPhoneVerifiedAt && load.driverPhoneVerified === phone) {
    return { ok: true, phone, alreadyVerified: true };
  }

  // A swap invalidates the prior proof immediately, before the new number is
  // proven. The window between "carrier changed the number" and "new number
  // answered" must read as unverified, not as still-verified-on-the-old-number.
  await prisma.load.update({
    where: { id: load.id },
    data: {
      driverName: opts.driverName ?? undefined,
      driverPhone: phone,
      ...(load.driverPhoneVerified !== phone
        ? { driverPhoneVerified: null, driverPhoneVerifiedAt: null, driverConsentAt: null, driverConsentText: null }
        : {}),
    },
  });

  const code = generateCode();
  await prisma.driverPhoneVerification.create({
    data: {
      loadId: load.id,
      phone,
      code,
      expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000),
    },
  });

  // Non-blocking: a send failure must not lose the code the carrier is about to
  // be asked for. It leaves a log line and the carrier can resend.
  try {
    const { sendSMS } = await import("./openPhoneService");
    await sendSMS(
      phone,
      `Silk Route Logistics: your code is ${code}. It expires in ${CODE_TTL_MINUTES} minutes. ` +
        `This confirms you are the driver on load ${load.referenceNumber}.`,
    );
  } catch (err) {
    log.error({ err, loadId: load.id }, "[DriverVerify] code SMS failed to send");
  }

  return { ok: true, phone };
}

export interface ConfirmResult {
  ok: boolean;
  reason?: string;
  verifiedAt?: Date;
}

/**
 * Complete verification. Consent is captured here rather than at start, because
 * consent given before the handset is proven is consent from an unknown party.
 */
export async function confirmDriverVerification(opts: {
  loadId: string;
  code: string;
  consented: boolean;
}): Promise<ConfirmResult> {
  if (!opts.consented) {
    return { ok: false, reason: "Messaging consent is required before we can text this driver." };
  }

  const row = await prisma.driverPhoneVerification.findFirst({
    where: { loadId: opts.loadId, verifiedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return { ok: false, reason: "No verification is in progress for this load. Send a new code." };

  if (row.attempts >= MAX_ATTEMPTS) {
    return { ok: false, reason: "Too many attempts. Send a new code." };
  }
  if (row.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: "That code expired. Send a new one." };
  }

  if (row.code !== String(opts.code || "").trim()) {
    await prisma.driverPhoneVerification.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, reason: "That code is not right." };
  }

  const now = new Date();
  // One transaction: the row and the load must never disagree about whether
  // this number is proven, because the rate-con gate reads the load and the
  // audit trail reads the row.
  await prisma.$transaction([
    prisma.driverPhoneVerification.update({
      where: { id: row.id },
      data: { verifiedAt: now, consentAt: now, consentText: DRIVER_SMS_CONSENT_TEXT },
    }),
    prisma.load.update({
      where: { id: opts.loadId },
      data: {
        driverPhoneVerified: row.phone,
        driverPhoneVerifiedAt: now,
        driverConsentAt: now,
        driverConsentText: DRIVER_SMS_CONSENT_TEXT,
      },
    }),
  ]);

  log.info({ loadId: opts.loadId }, "[DriverVerify] driver handset proven and consent captured");
  return { ok: true, verifiedAt: now };
}

/**
 * Is the number currently on this load the one that was proven?
 *
 * Compares against `driverPhone` rather than trusting the timestamp alone, so
 * editing the number by any path — including one that forgets to clear the
 * verification — reads as unverified rather than inheriting the old proof.
 */
export async function isDriverPhoneVerified(loadId: string): Promise<boolean> {
  const load = await prisma.load.findUnique({
    where: { id: loadId },
    select: { driverPhone: true, driverPhoneVerified: true, driverPhoneVerifiedAt: true },
  });
  if (!load?.driverPhoneVerifiedAt || !load.driverPhoneVerified) return false;
  const current = normalizePhoneE164(load.driverPhone || "");
  return !!current && current === load.driverPhoneVerified;
}
