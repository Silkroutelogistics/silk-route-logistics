import { prisma } from "../config/database";
import { buildEmail } from "../email/builder";
import { log } from "../lib/logger";

/**
 * Sequence Advance Cron — runs hourly
 *
 * For each ACTIVE customer with a due follow-up:
 * 1. If replied since last outbound → PAUSED
 * 2. If nextTouchDueAt <= now AND currentTouch < 6 → generate DRAFT Communication
 * 3. If currentTouch = 6 and no reply → COMPLETED
 *
 * Never auto-sends. All drafts go to the Queue for human review.
 * Idempotent — safe to run multiple times per hour.
 */
export async function advanceSequences(): Promise<{ paused: number; draftsCreated: number; completed: number; errors: number }> {
  const now = new Date();
  let paused = 0;
  let draftsCreated = 0;
  let completed = 0;
  let errors = 0;

  // Find all active sequences with due follow-ups
  const customers = await prisma.customer.findMany({
    where: {
      sequenceStatus: "ACTIVE",
      deletedAt: null,
    },
    select: {
      id: true, name: true, contactName: true, email: true,
      currentTouch: true, nextTouchDueAt: true, lastTouchSentAt: true,
      sequenceCluster: true, industryType: true,
    },
  });

  for (const c of customers) {
    try {
      // Check for replies since last outbound
      const lastOutbound = c.lastTouchSentAt || new Date(0);
      const replyCount = await prisma.communication.count({
        where: {
          entityType: "SHIPPER",
          entityId: c.id,
          type: "EMAIL_INBOUND",
          createdAt: { gte: lastOutbound },
        },
      });

      if (replyCount > 0) {
        await prisma.customer.update({
          where: { id: c.id },
          data: { sequenceStatus: "PAUSED", nextTouchDueAt: null },
        });
        paused++;
        log.info(`[SequenceCron] Paused ${c.name} — reply detected`);
        continue;
      }

      // Check if current touch is 6 (final) — mark completed
      if ((c.currentTouch || 0) >= 6) {
        await prisma.customer.update({
          where: { id: c.id },
          data: { sequenceStatus: "COMPLETED", nextTouchDueAt: null },
        });
        completed++;
        continue;
      }

      // Check if next touch is due
      if (!c.nextTouchDueAt || c.nextTouchDueAt > now) continue;

      const nextTouch = (c.currentTouch || 0) + 1;
      if (nextTouch > 6) {
        await prisma.customer.update({
          where: { id: c.id },
          data: { sequenceStatus: "COMPLETED", nextTouchDueAt: null },
        });
        completed++;
        continue;
      }

      // Check if a draft already exists for this touch (idempotency)
      const existingDraft = await prisma.communication.count({
        where: {
          entityType: "SHIPPER",
          entityId: c.id,
          type: "EMAIL_OUTBOUND",
          metadata: { path: ["status"], equals: "DRAFT" },
        },
      });

      if (existingDraft > 0) continue; // Draft already queued

      if (!c.email) continue;

      // Generate draft via builder
      const built = await buildEmail({ customerId: c.id, touchNumber: nextTouch });

      // Get system user for cron-generated drafts
      const systemUser = await prisma.user.findFirst({
        where: { email: "whaider@silkroutelogistics.ai" },
        select: { id: true },
      });

      if (!systemUser) {
        log.error("[SequenceCron] System user not found for draft creation");
        errors++;
        continue;
      }

      await prisma.communication.create({
        data: {
          type: "EMAIL_OUTBOUND",
          direction: "OUTBOUND",
          entityType: "SHIPPER",
          entityId: c.id,
          from: "whaider@silkroutelogistics.ai",
          to: c.email,
          subject: built.subject,
          body: built.bodyPlainText,
          userId: systemUser.id,
          metadata: {
            status: "DRAFT",
            touchNumber: nextTouch,
            templateAngle: built.templateAngle,
            bodyHtml: built.bodyHtml,
            generatedBy: "sequence-cron",
          },
        },
      });

      draftsCreated++;
      log.info(`[SequenceCron] Draft created for ${c.name} — touch ${nextTouch}`);
    } catch (err) {
      errors++;
      log.error({ err, customerId: c.id }, "[SequenceCron] Error processing customer");
    }
  }

  log.info({ paused, draftsCreated, completed, errors }, "[SequenceCron] Advance cycle complete");
  return { paused, draftsCreated, completed, errors };
}
