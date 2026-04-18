// Centralizes the "mark prospect not interested" side-effect chain so the
// manual Lead Hunter button and the Gmail auto-detection path stay in lock-step.
//
// Side effects (in order):
//   1. Customer.status → NOT_INTERESTED_STATUS (+ SystemLog audit entry)
//   2. stopSequenceByProspectEmail() if customer has an email
//   3. Communication NOTE with source in metadata ("manual" vs "auto_detected")

import { prisma } from "../config/database";
import { stopSequenceByProspectEmail } from "./emailSequenceService";
import { NOT_INTERESTED_STATUS } from "../../../shared/constants/pipelineStatus";
import { log } from "../lib/logger";

export type NotInterestedSource = "manual" | "auto_detected";

export interface MarkNotInterestedResult {
  stageChanged: boolean;
  sequencesStopped: number;
  noteId: string | null;
}

export async function markProspectNotInterested(
  customerId: string,
  source: NotInterestedSource,
  actorUserId?: string,
): Promise<MarkNotInterestedResult> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, status: true, email: true },
  });
  if (!customer) throw new Error(`Customer ${customerId} not found`);

  let stageChanged = false;
  if (customer.status !== NOT_INTERESTED_STATUS) {
    const prior = customer.status;
    await prisma.customer.update({
      where: { id: customerId },
      data: { status: NOT_INTERESTED_STATUS },
    });
    stageChanged = true;

    await prisma.systemLog.create({
      data: {
        logType: "STATUS_CHANGE",
        severity: "INFO",
        source: "ProspectStatus.markNotInterested",
        message: `Customer ${customerId}: ${prior} → ${NOT_INTERESTED_STATUS}`,
        details: { customerId, from: prior, to: NOT_INTERESTED_STATUS, trigger: source, actor: actorUserId ?? "system" },
      },
    });
  }

  let sequencesStopped = 0;
  if (customer.email) {
    const stopped = await stopSequenceByProspectEmail(customer.email, "MARKED_NOT_INTERESTED");
    if (stopped) sequencesStopped = 1;
  }

  // The NOTE needs a userId (FK to User, Restrict on delete). Manual path passes
  // the acting user; the Gmail path falls back to the first active admin/CEO so
  // Activity feed has an author.
  let userId = actorUserId;
  if (!userId) {
    const fallback = await prisma.user.findFirst({
      where: { role: { in: ["ADMIN", "CEO"] }, isActive: true },
      select: { id: true },
    });
    userId = fallback?.id;
  }

  // Idempotent NOTE creation: reuse an existing mark_not_interested NOTE
  // written in the last 30s for this customer instead of appending a duplicate.
  const DEDUPE_WINDOW_MS = 30_000;
  const recent = await prisma.communication.findFirst({
    where: {
      entityType: "SHIPPER",
      entityId: customerId,
      type: "NOTE",
      createdAt: { gte: new Date(Date.now() - DEDUPE_WINDOW_MS) },
      metadata: { path: ["action"], equals: "mark_not_interested" },
    },
    orderBy: { createdAt: "desc" },
  });

  let noteId: string | null = recent?.id ?? null;
  if (!recent && userId) {
    const note = await prisma.communication.create({
      data: {
        type: "NOTE",
        entityType: "SHIPPER",
        entityId: customerId,
        subject: "Marked Not Interested",
        body: `Marked Not Interested (${source})`,
        metadata: { source: `ProspectStatus.${source}`, action: "mark_not_interested", intent: "UNSUBSCRIBE", trigger: source },
        userId,
      },
    });
    noteId = note.id;
  } else if (!recent && !userId) {
    log.warn(`[ProspectStatus] No fallback user available to author Not Interested NOTE for customer ${customerId}`);
  }

  log.info(`[ProspectStatus] markNotInterested ${customerId} source=${source} stageChanged=${stageChanged} sequencesStopped=${sequencesStopped}`);
  return { stageChanged, sequencesStopped, noteId };
}
