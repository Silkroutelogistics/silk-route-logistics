import { prisma } from "../config/database";
import { log } from "../lib/logger";
import { normalizePhoneE164 } from "../lib/phoneNormalization";

/**
 * What an opt-out means operationally.
 *
 * A DRIVER WHO OPTS OUT IS A TRACKING GAP, NOT A VIOLATION — and the difference
 * matters more than it sounds. They exercised a right the consent text promised
 * them in writing. If the platform treats that as a fraud indicator, the AE
 * queue fills with flags that turn out to be nothing, and the lesson an AE
 * learns is that compliance produces noise. Then the flags that DO matter get
 * skimmed. So nothing here scores, blocks, or penalises: it tells a human what
 * changed and how to work around it.
 *
 * WHAT ACTUALLY CHANGES IS NARROWER THAN IT LOOKS. Check calls have always gone
 * to the carrier's dispatch contact — `createCheckCallSchedule` resolves
 * `load.carrier.phone || carrierProfile.contactPhone`, never the driver's
 * number. The only thing an SRL text ever sends to a driver's handset is the
 * verification code and the tap-to-share location link. So an opt-out costs the
 * location link and nothing else; the check-call channel continues untouched.
 * Saying so precisely is the difference between an AE who knows what to do and
 * an AE who thinks the load has gone dark. §13.3 Item 226.
 */

/** Loads where a driver's silence still matters. */
const ACTIVE_STATUSES = [
  "BOOKED", "CONFIRMED", "DISPATCHED", "AT_PICKUP",
  "LOADED", "PICKED_UP", "IN_TRANSIT", "AT_DELIVERY",
] as const;

/**
 * Notify the AE on each active load this handset is driving.
 *
 * ONE NOTIFICATION PER LOAD, and only for loads actually in flight. A driver
 * who opts out between loads generates nothing, because there is nothing for an
 * AE to do about it yet — they will be told at the point it matters, which is
 * when that driver is next assigned and does not verify.
 *
 * Never throws: the STOP is already recorded and the confirmation already sent.
 * A failure here must not make the opt-out itself look unsuccessful.
 */
export async function applyOptOutConsequences(phone: string): Promise<{ notified: number }> {
  const e164 = normalizePhoneE164(phone);
  if (!e164) return { notified: 0 };

  let loads: Array<{ id: string; referenceNumber: string; status: string; posterId: string | null; driverName: string | null }> = [];
  try {
    loads = await prisma.load.findMany({
      where: {
        driverPhoneVerified: e164,
        status: { in: ACTIVE_STATUSES as unknown as any },
        deletedAt: null,
      },
      select: { id: true, referenceNumber: true, status: true, posterId: true, driverName: true },
    });
  } catch (err) {
    log.error({ err, phone: e164 }, "[SmsOptOut] could not read affected loads");
    return { notified: 0 };
  }

  let notified = 0;
  for (const l of loads) {
    if (!l.posterId) continue;
    try {
      await prisma.notification.create({
        data: {
          userId: l.posterId,
          type: "SYSTEM_ALERT",
          title: `Driver opted out of SMS — load ${l.referenceNumber}`,
          message:
            `${l.driverName || "The driver"} on load ${l.referenceNumber} (${l.status}) replied STOP, so we will not text ` +
            `that number again. This is their right and is not a problem with the carrier. ` +
            `Check calls are unaffected — they have always gone to the carrier's dispatch contact, and still do. ` +
            `What stops is the tap-to-share location link, so position updates on this load now come from ` +
            `the carrier's replies rather than from the driver directly.`,
          actionUrl: "/dashboard/track-trace",
        },
      });
      notified += 1;
    } catch (err) {
      log.error({ err, loadId: l.id }, "[SmsOptOut] AE notification failed");
    }
  }

  log.info({ phone: e164, activeLoads: loads.length, notified }, "[SmsOptOut] consequences applied");
  return { notified };
}
