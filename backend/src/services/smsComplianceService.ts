import { prisma } from "../config/database";
import { log } from "../lib/logger";
import { normalizePhoneE164 } from "../lib/phoneNormalization";

/**
 * STOP and HELP — the two words a business that texts people must honour.
 *
 * WHY THIS BLOCKED THE SMS SURFACE. The driver consent text shipped in Arc 19
 * promises both: "Reply STOP to stop. Reply HELP for help." Promising STOP and
 * not honouring it is worse than never promising it — it is the specific
 * conduct TCPA penalises, and the promise is already in writing on every
 * consent record we have stored. (§13.3 Item 225, blocking item.)
 *
 * THE KEYWORDS ARE THE CARRIER-STANDARD SET, not a set we chose. US carriers
 * and the CTIA short-code handbook treat all of these as opt-out, and a handset
 * that sends any of them expects the texting to end. Matching only "STOP" would
 * mean a driver who sends "CANCEL" keeps receiving messages they tried to
 * refuse, which is indistinguishable from ignoring them.
 */

/** Opt-out keywords, carrier-standard. Matched case-insensitively, trimmed. */
export const STOP_KEYWORDS = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"] as const;

/** Help keywords, same convention. */
export const HELP_KEYWORDS = ["HELP", "INFO"] as const;

/**
 * The one message allowed after a STOP.
 *
 * Carriers permit — and effectively expect — a single confirmation so the
 * sender is on record having received the request. Anything after it is a
 * violation, which is why `sendSMS` refuses every subsequent send and this one
 * has to ask for an explicit exemption rather than being quietly special.
 */
export const STOP_CONFIRMATION =
  "Silk Route Logistics: you are unsubscribed and will get no further texts from us. " +
  "Your load and your pay are unaffected. Questions: (269) 220-6760.";

/**
 * The HELP reply. Its content is not decorative — carriers check that a HELP
 * response identifies the sender, says what the messages are, gives a human
 * contact, and restates STOP. All four are required and all four are here.
 */
export const HELP_RESPONSE =
  "Silk Route Logistics (freight broker, MC# 1794414). We text you about loads you are hauling for us: " +
  "check calls, pickup and delivery reminders, and location links. " +
  "Help: operations@silkroutelogistics.ai or (269) 220-6760. " +
  "Msg & data rates may apply. Reply STOP to opt out.";

/** What an inbound message was, if it was one of these. */
export type SmsKeyword = "STOP" | "HELP" | null;

/**
 * Classify an inbound body.
 *
 * Deliberately strict — THE WHOLE MESSAGE must be the keyword, once
 * punctuation and spacing are stripped.
 *
 * The first version of this matched the first WORD, which meant a driver
 * replying "stop by the gate when you get here" was unsubscribed from the
 * channel they were actively using. That is worse than missing an opt-out: it
 * silently severs a working conversation and neither side is told why. The
 * proof caught it, and the carrier convention is the stricter one — an opt-out
 * message is the keyword and nothing else.
 *
 * Punctuation and spacing ARE forgiven, because "STOP." and "Stop all" are
 * plainly opt-outs and refusing them on a full stop would be pedantry that
 * costs a TCPA claim.
 */
export function classifyInbound(body: string): SmsKeyword {
  const only = String(body || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (!only) return null;
  if ((STOP_KEYWORDS as readonly string[]).includes(only)) return "STOP";
  if ((HELP_KEYWORDS as readonly string[]).includes(only)) return "HELP";
  return null;
}

/**
 * Is this number currently opted out?
 *
 * Called by `sendSMS` on every outbound message, so it is deliberately one
 * indexed lookup on a unique column. Fails CLOSED on an error — if we cannot
 * tell whether someone opted out, we do not text them. That is the opposite of
 * §14's eligibility half and correctly so: the asymmetry runs the other way
 * here, because a missed message costs a delay and an unwanted message after a
 * STOP costs a TCPA claim.
 */
export async function isOptedOut(phone: string): Promise<boolean> {
  const e164 = normalizePhoneE164(phone);
  if (!e164) return false; // not a number we could have opted out
  try {
    const row = await prisma.smsOptOut.findUnique({ where: { phone: e164 } });
    return !!row && row.optedInAgainAt === null;
  } catch (err) {
    log.error({ err, phone: e164 }, "[SmsCompliance] opt-out lookup failed — refusing to send");
    return true;
  }
}

/** Record a STOP. Idempotent: a second STOP is not a second opt-out. */
export async function recordOptOut(phone: string, keyword: string): Promise<{ alreadyOptedOut: boolean }> {
  const e164 = normalizePhoneE164(phone);
  if (!e164) return { alreadyOptedOut: false };

  const existing = await prisma.smsOptOut.findUnique({ where: { phone: e164 } });
  if (existing && existing.optedInAgainAt === null) {
    return { alreadyOptedOut: true };
  }

  await prisma.smsOptOut.upsert({
    where: { phone: e164 },
    create: { phone: e164, optedOutAt: new Date(), keyword: keyword.slice(0, 20) },
    // A number that opted out, re-consented, and opted out again: the row is
    // reused and optedInAgainAt cleared, so "opted out" is once again true.
    update: { optedOutAt: new Date(), keyword: keyword.slice(0, 20), optedInAgainAt: null },
  });

  log.info({ phone: e164, keyword }, "[SmsCompliance] STOP recorded — all further sends to this number refuse");
  return { alreadyOptedOut: false };
}

/**
 * Clear an opt-out — and the ONLY caller may be a fresh, explicit verification.
 *
 * A driver who opted out and is later assigned another load must NOT be
 * silently re-enrolled by that assignment. They opt back in by answering a new
 * code and being shown the consent language again, which is a deliberate act by
 * the person holding the handset. This function exists so that act has somewhere
 * to land; it must never be called from an assignment, an import or a backfill.
 */
export async function recordReconsent(phone: string): Promise<void> {
  const e164 = normalizePhoneE164(phone);
  if (!e164) return;
  const row = await prisma.smsOptOut.findUnique({ where: { phone: e164 } });
  if (!row || row.optedInAgainAt !== null) return;
  await prisma.smsOptOut.update({ where: { phone: e164 }, data: { optedInAgainAt: new Date() } });
  log.info({ phone: e164 }, "[SmsCompliance] re-consent recorded after a fresh verification");
}

/**
 * Handle an inbound STOP or HELP. Returns null if the message was neither, so
 * the caller falls through to its existing parse.
 */
export async function handleComplianceKeyword(
  fromPhone: string,
  body: string,
): Promise<{ keyword: "STOP" | "HELP"; reply: string; alreadyOptedOut?: boolean } | null> {
  const kind = classifyInbound(body);
  if (!kind) return null;

  if (kind === "HELP") {
    // HELP does not change state, and is answerable even to an opted-out
    // number: someone asking who is texting them is entitled to be told.
    return { keyword: "HELP", reply: HELP_RESPONSE };
  }

  const { alreadyOptedOut } = await recordOptOut(fromPhone, String(body).trim().split(/\s+/)[0] || "STOP");
  return { keyword: "STOP", reply: STOP_CONFIRMATION, alreadyOptedOut };
}
