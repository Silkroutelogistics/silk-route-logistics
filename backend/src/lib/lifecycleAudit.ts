/**
 * Lifecycle-gaps B6a (2026-09-19, finding #24) — one record for every
 * lifecycle act, carrying WHO, WHY, WHOSE FAULT and FROM/TO.
 *
 * A load cancelled or marked TONU, a customer inactivated, reactivated or
 * deleted, a carrier archived or restored: each of these wrote its columns on
 * the entity row and left the AUDIT tables with a generic verb — the route
 * middleware's `UPDATE`/`DELETE` with no `changes`, or `logStatusChange` with
 * a from/to status and nothing about the reason. The Load row knows why it was
 * cancelled; the audit record did not. A dispute reads the audit record.
 *
 * TABLE: AuditTrail. Three reasons, none of them taste:
 *   - `AuditTrail.action` is the `AuditAction` enum, which B6a extends with
 *     CANCEL and DEACTIVATE; `AuditLog.action` is a free string and would have
 *     left the enum addition pointless.
 *   - `performedById` is a required FK to User. Every act this file records
 *     is a person's act (a cron never cancels a load or inactivates a customer
 *     through these paths), and a row that cannot name its actor is not the
 *     record a dispute needs.
 *   - lib/carrierStatusAudit (the concurrent arc's single writer for carrier
 *     suspension and reinstatement) lands USER-actor rows on this same table
 *     with `changedFields.actionDetail` as the greppable discriminator. One
 *     table, one reader convention. Carrier SUSPENDED is deliberately NOT a
 *     LifecycleEvent here for that reason — two writers for one act is the
 *     dual-convention class §13.3 keeps unpicking.
 *
 * SHAPE of `changedFields` (stable; a reader greps `actionDetail`):
 *   { actionDetail, entityName, reasonCode, reason, faultParty, previous, new,
 *     actor: { kind: "USER", userId, email } }
 * `previous` / `new` are objects, not a single status pair, because a carrier
 * archive moves two rows (profile deletedAt, login isActive) and a customer
 * delete removes one. A single-field transition still reads as
 * `{ status: "BOOKED" }` → `{ status: "CANCELLED" }`.
 *
 * NEVER THROWS, and is called AFTER the transition commits, with the base
 * client — an audit failure inside a transaction would take the transition
 * down with it, and a history write must not fail the act it describes
 * (Item 235.5). The failure is logged at error level with the actionDetail so
 * a missing row is diagnosable from the log.
 */
import { prisma } from "../config/database";
import { log } from "./logger";
import { clientIp, IpBearingRequest } from "./clientIp";
import type { AuditAction } from "@prisma/client";

export type LifecycleActionDetail =
  | "LOAD_CANCELLED"
  | "LOAD_TONU"
  | "LOAD_ARCHIVED"
  | "LOAD_RESTORED"
  | "CUSTOMER_INACTIVATED"
  | "CUSTOMER_REACTIVATED"
  | "CUSTOMER_DELETED"
  | "CUSTOMER_RESTORED"
  // Reversing a cancellation is a lifecycle act and belongs on the SAME trail
  // as the cancel it reverses -- a reader asking "what happened to this load"
  // should not have to know that the two live in different tables (§13.3 Item
  // 286). STATUS_CHANGE rather than a new enum member, for the reason the
  // header gives: actionDetail is what a reader greps.
  | "LOAD_UNCANCELLED"
  | "CARRIER_ARCHIVED"
  | "CARRIER_RESTORED"
  // A contact's consent decides whether a CUSTOMER is written to, and its
  // removal decides it silently. Neither had a record: the route declares
  // auditLog("DELETE", "CustomerContact") and that middleware wraps res.json,
  // while the handler answers res.status(204).send() — so the declared audit
  // has never once fired, which is why the 2026-09-23 contact removal left no
  // trail at all.
  | "CONTACT_DELETED"
  | "CONTACT_CONSENT_CHANGED";

/**
 * The AuditAction each detail lands under. CANCEL and DEACTIVATE are the two
 * values B6a adds; the rest reuse existing members. A TONU is recorded as a
 * CANCEL with actionDetail LOAD_TONU — the enum has no TONU member, adding one
 * is a schema decision outside this arc (Item 277), and a TONU IS a
 * cancellation with a fault party attached. `actionDetail` keeps the two
 * distinguishable to any reader.
 */
export const LIFECYCLE_ACTION: Readonly<Record<LifecycleActionDetail, AuditAction>> = {
  LOAD_CANCELLED: "CANCEL",
  LOAD_TONU: "CANCEL",
  // Archiving an already-terminal load hides it without changing its status —
  // a DELETE-class act, not a cancellation; recording it as CANCEL would be false.
  LOAD_ARCHIVED: "DELETE",
  LOAD_RESTORED: "STATUS_CHANGE",
  LOAD_UNCANCELLED: "STATUS_CHANGE",
  CUSTOMER_INACTIVATED: "DEACTIVATE",
  CUSTOMER_REACTIVATED: "STATUS_CHANGE",
  CUSTOMER_DELETED: "DELETE",
  CUSTOMER_RESTORED: "STATUS_CHANGE",
  CARRIER_ARCHIVED: "DEACTIVATE",
  CARRIER_RESTORED: "STATUS_CHANGE",
  CONTACT_DELETED: "DELETE",
  // UPDATE rather than a new enum member: a consent change is an edit to a
  // field, and actionDetail is what a reader greps to find it.
  CONTACT_CONSENT_CHANGED: "UPDATE",
};

export type LifecycleEntityType = "Load" | "Customer" | "CarrierProfile" | "CustomerContact";

export interface LifecycleActor {
  userId: string;
  email?: string | null;
}

export interface LifecycleEvent {
  actionDetail: LifecycleActionDetail;
  entityType: LifecycleEntityType;
  entityId: string;
  /** Load reference number, customer name, carrier company — what a reader recognises. */
  entityName: string | null;
  /** A member of CancellationReason for a load; null where the act has no code. */
  reasonCode?: string | null;
  /** The free-text reason the actor gave, already trimmed by the caller. */
  reason?: string | null;
  /** FaultParty (SHIPPER/CARRIER/BROKER/NONE) or the TONU side; null where no fault is assigned. */
  faultParty?: string | null;
  previous: Record<string, unknown>;
  new: Record<string, unknown>;
  actor: LifecycleActor;
  /** For the ip column. Optional: a caller without a request records null. */
  req?: IpBearingRequest;
}

export async function recordLifecycleEvent(event: LifecycleEvent): Promise<void> {
  const changedFields = {
    actionDetail: event.actionDetail,
    entityName: event.entityName,
    reasonCode: event.reasonCode ?? null,
    reason: event.reason ?? null,
    faultParty: event.faultParty ?? null,
    previous: event.previous,
    new: event.new,
    actor: { kind: "USER", userId: event.actor.userId, email: event.actor.email ?? null },
  };
  try {
    await prisma.auditTrail.create({
      data: {
        action: LIFECYCLE_ACTION[event.actionDetail],
        entityType: event.entityType,
        entityId: event.entityId,
        performedById: event.actor.userId,
        ipAddress: event.req ? clientIp(event.req) : null,
        changedFields: changedFields as any,
      },
    });
  } catch (err) {
    log.error(
      { err, actionDetail: event.actionDetail, entityType: event.entityType, entityId: event.entityId },
      "[lifecycleAudit] record failed; the transition stands",
    );
  }
}
