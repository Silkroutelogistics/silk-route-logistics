/**
 * Sprint A0 (v3.8.bbv): one record for every carrier suspension and
 * reinstatement, naming who did it, from what, to what, and why.
 *
 * AEROSWIFT was suspended by a cron and reinstated by another cron, and
 * neither left a row that said so. The only trace was a ComplianceAlert and an
 * email. This helper is the single writer for that record.
 *
 * WHERE THE ROW GOES DEPENDS ON WHO ACTED, and that is the design:
 *
 *   USER  -> AuditTrail. performedById is a required FK to User, which is
 *            exactly right when a person acted.
 *   CRON  -> SystemLog, logType STATUS_CHANGE, source = the job name. A cron
 *            has no User and must not borrow one: cron/sequenceAdvance.ts:100
 *            looks up whaider@ to attribute cron work to the founder, which
 *            is the anti-pattern this file exists to avoid (section 13.3).
 *            SystemLog.userId is nullable and its source column carries the
 *            actor honestly.
 *
 * NEVER THROWS. A history write must not fail the transition it describes.
 * It is called AFTER the transition commits, with the base client, for the
 * same reason: an audit failure inside a transaction would take the
 * transition down with it.
 */
import { prisma } from "../config/database";
import { log } from "../lib/logger";

export type CarrierStatusActor =
  | { kind: "USER"; userId: string; ipAddress?: string | null }
  | { kind: "CRON"; source: string };

export interface CarrierStatusTransition {
  carrierId: string;
  carrierName: string;
  previousStatus: string;
  newStatus: "SUSPENDED" | "APPROVED";
  /** AutoSuspendCause member, or null when the transition clears it. */
  cause: string | null;
  reason: string;
  actor: CarrierStatusActor;
}

/** The value a reader greps for on either table. */
export function actionDetailFor(t: Pick<CarrierStatusTransition, "previousStatus" | "newStatus">): string {
  if (t.newStatus === "SUSPENDED") return "CARRIER_SUSPENDED";
  if (t.previousStatus === "SUSPENDED" && t.newStatus === "APPROVED") return "CARRIER_REINSTATED";
  return "CARRIER_STATUS_CHANGE";
}

export async function recordCarrierStatusTransition(t: CarrierStatusTransition): Promise<void> {
  const detail = actionDetailFor(t);
  const fields = {
    actionDetail: detail,
    carrierName: t.carrierName,
    previousStatus: t.previousStatus,
    newStatus: t.newStatus,
    cause: t.cause,
    reason: t.reason,
    actor: t.actor.kind === "USER" ? { kind: "USER", userId: t.actor.userId } : { kind: "CRON", source: t.actor.source },
  };
  try {
    if (t.actor.kind === "USER") {
      await prisma.auditTrail.create({
        data: {
          action: t.newStatus === "SUSPENDED" ? "CARRIER_SUSPENDED" : "STATUS_CHANGE",
          entityType: "CarrierProfile",
          entityId: t.carrierId,
          performedById: t.actor.userId,
          ipAddress: t.actor.ipAddress ?? null,
          changedFields: fields as any,
        },
      });
    } else {
      await prisma.systemLog.create({
        data: {
          logType: "STATUS_CHANGE",
          severity: t.newStatus === "SUSPENDED" ? "WARNING" : "INFO",
          source: `cron/${t.actor.source}`,
          message: `${detail}: ${t.carrierName} ${t.previousStatus} -> ${t.newStatus} by ${t.actor.source}. ${t.reason}`,
          details: { carrierId: t.carrierId, ...fields } as any,
        },
      });
    }
  } catch (err) {
    log.error({ err, carrierId: t.carrierId, detail }, "[CarrierStatusAudit] transition record failed; transition stands");
  }
}
