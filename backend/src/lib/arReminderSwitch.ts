/**
 * v3.8.bko — the switch for payment-reminder emails to customers. OFF until
 * an admin turns it on (decided 2026-09-26: keep reminders off, build the
 * switch for when the book is big enough to need them).
 *
 * The only sender is arCollectionsService.processArReminders (9 AM ET), which
 * mails each unpaid invoice's billing recipients. Before this it ran
 * unconditionally, and with no billing contact tagged its recipient resolver
 * falls back to Customer.email — for Beekeepers, the AP address.
 *
 * STORAGE. The switch is the `ar-reminder-emails` row of CronRegistry, the
 * platform's existing on/off record for scheduled work, so the admin cron
 * toggle and this switch are the same fact rather than two that can disagree.
 * No row, a false row, or a failed read all mean OFF: a switch that cannot be
 * read must not send email to customers.
 *
 * The row is created OFF at boot (seedCronRegistry) and a restart never turns
 * it back on — the seed's update clause does not touch `enabled`.
 */
import { prisma } from "../config/database";
import { log } from "./logger";

export const AR_REMINDER_SWITCH = "ar-reminder-emails";
export const AR_REMINDER_SCHEDULE = "0 14 * * *";
export const AR_REMINDER_DESCRIPTION =
  "Payment reminder emails to customers' billing contacts, 9 AM ET. Off until an admin turns it on.";

type Db = Pick<typeof prisma, "cronRegistry">;

export interface ArReminderSwitchState {
  enabled: boolean;
  updatedAt: Date | null;
}

export async function getArReminderSwitch(db: Db = prisma): Promise<ArReminderSwitchState> {
  try {
    const row = await db.cronRegistry.findUnique({ where: { jobName: AR_REMINDER_SWITCH } });
    return { enabled: row?.enabled === true, updatedAt: row?.updatedAt ?? null };
  } catch (err) {
    log.error({ err }, "[ArReminderSwitch] read failed — treating reminder emails as OFF");
    return { enabled: false, updatedAt: null };
  }
}

export async function arReminderEmailsOn(db: Db = prisma): Promise<boolean> {
  return (await getArReminderSwitch(db)).enabled;
}

export async function setArReminderSwitch(enabled: boolean, db: Db = prisma): Promise<ArReminderSwitchState> {
  const row = await db.cronRegistry.upsert({
    where: { jobName: AR_REMINDER_SWITCH },
    update: { enabled },
    create: {
      jobName: AR_REMINDER_SWITCH,
      schedule: AR_REMINDER_SCHEDULE,
      description: AR_REMINDER_DESCRIPTION,
      enabled,
    },
  });
  return { enabled: row.enabled, updatedAt: row.updatedAt };
}
