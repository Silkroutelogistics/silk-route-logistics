// POD paperwork reminders — carrier-lifecycle audit F-8.
//
// The 24-hour paperwork deadline is a real obligation on three surfaces: the
// Broker-Carrier Agreement, the printed Rate Confirmation, and the driver
// training curriculum. lib/docTimeliness GRADES the carrier's Compass Score
// against it. Nothing ever REMINDED them. A carrier was scored against a
// deadline they were never told was running, on a load whose delivery time we
// knew precisely.
//
// The only pre-existing prompts were POD_REQUEST_30MIN / POD_REQUEST_1HR inside
// createCheckCallSchedule, and they miss in two ways: they are pegged to the
// PLANNED deliveryDate rather than the actual one, so on any load that delivers
// off-schedule they fire at the wrong time (or have already elapsed and get
// filtered out of futureSchedules); and neither sits anywhere near the 24-hour
// mark, so nothing escalates as the deadline approaches.
//
// Deadline source: PAPERWORK_DUE_HOURS, the same constant docTimeliness derives
// POD_GRACE_MS from. Grading and reminding must never drift apart — telling a
// carrier one deadline and scoring them against another is what loses a Compass
// dispute (CLAUDE.md section 9).

import { prisma } from "../config/database";
import { log } from "../lib/logger";
import { PAPERWORK_DUE_HOURS } from "../lib/accessorialPolicy";
import { sendPodReminderEmail } from "./emailService";

/**
 * Bands, not exact thresholds.
 *
 * An exact-hour scheme drops a reminder entirely if the run that would have
 * sent it fails or is skipped — the same fragility banked against the insurance
 * and training reminder crons. Bands are re-entrant: a load sitting in a band is
 * eligible until it is notified for that band, so a missed run self-heals on the
 * next tick.
 *
 * `notify` is who the message is for. The first two nudge the carrier while
 * there is still time; the third tells the AE the deadline has passed, because
 * at that point it is an operational problem, not a reminder.
 */
export interface PodReminderBand {
  key: "early" | "final" | "overdue";
  fromHours: number;
  toHours: number;
  notify: "CARRIER" | "AE";
}

export const BANDS: PodReminderBand[] = [
  { key: "early", fromHours: 4, toHours: 20, notify: "CARRIER" },
  { key: "final", fromHours: 20, toHours: PAPERWORK_DUE_HOURS, notify: "CARRIER" },
  { key: "overdue", fromHours: PAPERWORK_DUE_HOURS, toHours: Infinity, notify: "AE" },
];

/**
 * Which band a load falls in, by hours since actual delivery. Pure so the
 * boundaries are pinned by test rather than by reading the loop.
 *
 * Returns null under 4 hours — a carrier who has just backed off the dock does
 * not need chasing. Bands are half-open [from, to) so no hour belongs to two.
 */
export function podReminderBand(hoursSince: number): PodReminderBand | null {
  return BANDS.find((b) => hoursSince >= b.fromHours && hoursSince < b.toHours) ?? null;
}

/** Stop chasing a load that has been sitting overdue for this long — it is an ops problem by then, not a reminder. */
const ABANDON_AFTER_HOURS = 14 * 24;

/**
 * Statuses a load can sit in while paperwork is still genuinely owed.
 *
 * Arc 2 Item 1 — this used to be DELIVERED alone, which left an escape hatch.
 * The AE map allows DELIVERED to go straight to INVOICED (loadStateMachine:77),
 * so an AE invoicing a load before the POD landed silently removed it from the
 * chase population forever. Worse than it sounds: INVOICED only advances to
 * COMPLETED, so such a load can never reach POD_RECEIVED either — it exits the
 * pipeline owing paperwork with nothing left to notice.
 *
 * INVOICED is still chaseable, not futile: the POD upload path records the
 * Document row and stamps podUrl regardless of status, and only *advances*
 * status from AT_DELIVERY / DELIVERED / LOADED (carrierLoads.ts
 * podAdvancingStatuses). So a carrier uploading against an INVOICED load
 * still files their paperwork correctly — the status simply does not walk
 * backwards, which is right.
 *
 * Deliberately excluded:
 *   POD_RECEIVED — the paperwork is in by definition,
 *   COMPLETED    — terminal and settled; chasing a closed load is noise,
 *   TONU / CANCELLED — never delivered, so nothing is owed.
 */
export const POD_CHASE_STATUSES = ["DELIVERED", "INVOICED"] as const;

/** Pure form of the population rule, so the boundary is pinned by test rather than read out of a query. */
export function isPodChaseableStatus(status: string): boolean {
  return (POD_CHASE_STATUSES as readonly string[]).includes(status);
}

/** How often the AE is re-told about a load still sitting overdue. */
export const OVERDUE_REESCALATION_HOURS = 48;

/**
 * Which overdue escalation a load is in — 0 at the deadline, then one per
 * OVERDUE_REESCALATION_HOURS after it. Null before the deadline.
 *
 * Arc 2 Item 2. Dedup is per link, and the overdue link used to be a single
 * fixed key, so the AE was told once and then never again. A load could sit
 * ten days past its deadline in silence — the one state where somebody
 * definitely needs to keep hearing about it, since the invoice may already
 * have gone out against paperwork that never arrived.
 *
 * Encoding the ordinal in the link makes each repeat its own dedup key, so the
 * existing link-matching dedup handles repeats with no new table and no new
 * column. The 14-day abandon window still caps it: the sweep's `earliest`
 * filter drops the load out of the population entirely, so escalation stops on
 * its own rather than needing a separate cap.
 */
export function overdueEscalationOrdinal(hoursSince: number): number | null {
  if (hoursSince < PAPERWORK_DUE_HOURS) return null;
  return Math.floor((hoursSince - PAPERWORK_DUE_HOURS) / OVERDUE_REESCALATION_HOURS);
}

/**
 * The dedup key for a (load, moment) pair. Carrier bands fire once each; the
 * overdue band fires once per escalation ordinal.
 */
export function podDedupKey(band: PodReminderBand, hoursSince: number): string {
  if (band.key !== "overdue") return band.key;
  return `overdue-${overdueEscalationOrdinal(hoursSince) ?? 0}`;
}

export interface PodReminderResult {
  scanned: number;
  carrierRemindersSent: number;
  aeEscalations: number;
  skippedAlreadyNotified: number;
  errors: number;
}

/**
 * Hourly sweep. Finds DELIVERED loads with an actual delivery timestamp and no
 * POD on file, buckets each into a band, and notifies once per (load, band).
 *
 * Dedup uses the notification link rather than a new column: the band key is
 * encoded in the link, so an existing row for that exact link means that band
 * has already fired. Same no-migration pattern the check-call-reminders cron
 * uses, and it is what keeps this from becoming the notification flood that
 * Item 192 recorded.
 */
export async function sendPodReminders(): Promise<PodReminderResult> {
  const now = new Date();
  const result: PodReminderResult = {
    scanned: 0,
    carrierRemindersSent: 0,
    aeEscalations: 0,
    skippedAlreadyNotified: 0,
    errors: 0,
  };

  const earliest = new Date(now.getTime() - ABANDON_AFTER_HOURS * 3600_000);
  const latest = new Date(now.getTime() - BANDS[0].fromHours * 3600_000);

  const loads = await prisma.load.findMany({
    where: {
      status: { in: [...POD_CHASE_STATUSES] },
      actualDeliveryDatetime: { not: null, gte: earliest, lte: latest },
      deletedAt: null,
      isTestAccount: false,
      carrierId: { not: null },
      // No POD on file, by either signal. The Document row is the primary one;
      // podUrl is checked too so a load whose POD landed through a path that
      // stamped the load but left no row of that docType is never chased.
      documents: { none: { docType: "POD" } },
      podUrl: null,
    },
    select: {
      id: true,
      referenceNumber: true,
      actualDeliveryDatetime: true,
      originCity: true,
      originState: true,
      destCity: true,
      destState: true,
      posterId: true,
      carrierId: true,
      carrier: {
        select: {
          email: true,
          carrierProfile: { select: { companyName: true, contactEmail: true } },
        },
      },
    },
    take: 200,
  });

  result.scanned = loads.length;
  if (loads.length === 0) return result;

  // One query for every POD notification in the abandon window, then match by
  // link. Cheaper than a per-load existence check.
  const priorLinks = new Set(
    (
      await prisma.notification.findMany({
        where: { type: "POD_REMINDER", createdAt: { gte: earliest } },
        select: { link: true },
      })
    )
      .map((n) => n.link)
      .filter((l): l is string => !!l),
  );

  for (const load of loads) {
    try {
      const deliveredAt = load.actualDeliveryDatetime!;
      const hoursSince = (now.getTime() - deliveredAt.getTime()) / 3600_000;
      const band = podReminderBand(hoursSince);
      if (!band) continue;

      const link = `/carrier/dashboard/my-loads?load=${load.id}&pod=${podDedupKey(band, hoursSince)}`;
      if (priorLinks.has(link)) {
        result.skippedAlreadyNotified++;
        continue;
      }

      const ref = load.referenceNumber || load.id;
      const originName = [load.originCity, load.originState].filter(Boolean).join(", ") || "origin";
      const destName = [load.destCity, load.destState].filter(Boolean).join(", ") || "destination";
      const hoursRemaining = Math.max(0, Math.round(PAPERWORK_DUE_HOURS - hoursSince));

      if (band.notify === "CARRIER") {
        await prisma.notification.create({
          data: {
            userId: load.carrierId!,
            type: "POD_REMINDER",
            title: hoursRemaining > 0 ? "Paperwork due" : "Paperwork past due",
            message:
              hoursRemaining > 0
                ? `Signed BOL and POD for ${ref} are due in ${hoursRemaining}h.`
                : `Signed BOL and POD for ${ref} are past due.`,
            link,
            actionUrl: link,
          },
        });

        const to = load.carrier?.carrierProfile?.contactEmail || load.carrier?.email;
        if (to) {
          await sendPodReminderEmail({
            to,
            carrierName: load.carrier?.carrierProfile?.companyName || "there",
            ref,
            originName,
            destName,
            deliveredAt,
            hoursRemaining,
            dueHours: PAPERWORK_DUE_HOURS,
          });
        }
        result.carrierRemindersSent++;
      } else if (load.posterId) {
        // Overdue — the carrier has had their two nudges; this one is for the AE,
        // and it repeats every OVERDUE_REESCALATION_HOURS for as long as the load
        // stays in the population (Item 2). Silence after one notice was the bug:
        // the invoice may already have gone out against paperwork that never came.
        const ordinal = overdueEscalationOrdinal(hoursSince) ?? 0;
        const days = Math.floor(hoursSince / 24);
        await prisma.notification.create({
          data: {
            userId: load.posterId,
            type: "POD_REMINDER",
            title: ordinal === 0 ? "POD overdue" : `POD still overdue (${days}d)`,
            message:
              ordinal === 0
                ? `No POD on ${ref} — ${Math.round(hoursSince)}h since delivery (due within ${PAPERWORK_DUE_HOURS}h).`
                : `Still no POD on ${ref} — ${days} days since delivery. Carrier has been reminded; this needs a call.`,
            link,
            actionUrl: `/dashboard/loads`,
          },
        });
        result.aeEscalations++;
      } else {
        continue; // no AE to tell; do not burn the dedup key
      }

      priorLinks.add(link);
    } catch (err) {
      result.errors++;
      log.error({ err, loadId: load.id }, "[PodReminder] Failed for load (non-fatal)");
    }
  }

  log.info({ result }, "[PodReminder] Sweep complete");
  return result;
}
