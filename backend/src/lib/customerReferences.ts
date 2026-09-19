/**
 * Customer references — what stands between a customer row and deletion.
 *
 * Lifecycle-gaps B5a (findings #18/#19; decision 4 of 2026-09-18). deleteCustomer
 * used to soft-delete the row and CASCADE: cancel every open load under a
 * free-text reason, void the invoices, zero the credit, deactivate the shipper
 * login — with no audit row and no fault party. Decision 4 retires the cascade.
 * A customer is deleted only when NOTHING references it; anything else is
 * refused with the references NAMED, so the AE acts on each one deliberately
 * (cancel a load with a reason code, stop a sequence) or inactivates the
 * customer, which is the end state for anything with history.
 *
 * THE RULE. Zero references → the row is hard-deleted and its OWNED rows go
 * with it by FK cascade (credit, intelligence, notes, activity, order
 * templates). Any reference → 409. The reference classes are the plan's six —
 * loads, invoices via load, contract rates, facilities, contacts, orders — plus
 * five the schema forces, each because a hard delete would otherwise do
 * something silent:
 *
 *   shipper login      Customer.userId — a portal account left pointing at nothing
 *   RFP bids           FK onDelete: Cascade — a hard delete would erase them unasked
 *   routing guides     FK onDelete: SetNull — history would lose its customer
 *   shipments          FK onDelete: SetNull — same
 *   exception alerts   bare customerId, no FK — would dangle
 *   in-flight sequence bare prospectId; processDueSequences HOLDS a sequence whose
 *                      prospect is missing and re-logs "manual review" every day,
 *                      forever. COMPLETED/STOPPED sequences are inert and do not count.
 *
 * "Open" loads are the ones the AE map still lets an AE cancel (the same rule
 * the Cancel button and the status endpoint read). They are named separately
 * because they have a next action; a load past that point is history and blocks
 * the same way. Archived (soft-deleted) loads still point at the customer and
 * still count.
 */

import type { LoadStatus } from "@prisma/client";
import { prisma } from "../config/database";
import { validateLoadStatusTransition } from "./loadStateMachine";

export interface BlockingLoad {
  id: string;
  referenceNumber: string;
  status: string;
  /** The AE map still allows CANCELLED from here — cancel it with a reason code first. */
  cancellable: boolean;
}

export interface CustomerReferenceCensus {
  loads: BlockingLoad[];
  invoices: number;
  shipments: number;
  orders: number;
  contractRates: number;
  facilities: number;
  contacts: number;
  rfpBids: number;
  routingGuides: number;
  exceptionAlerts: number;
  /** ACTIVE or PAUSED email sequences keyed on this customer as the prospect. */
  activeSequences: number;
  shipperUser: { id: string; email: string } | null;
}

/**
 * The statuses from which an AE may still cancel, read from the state machine.
 * The validator answers `CANCELLED → CANCELLED` as an allowed no-op (idempotent
 * repeat), which is not this question: a cancelled load is history.
 */
export function isCancellableStatus(status: string): boolean {
  if (status === "CANCELLED") return false;
  return validateLoadStatusTransition(status as LoadStatus, "CANCELLED", "AE").allowed;
}

export function referenceTotal(c: CustomerReferenceCensus): number {
  return (
    c.loads.length +
    c.invoices +
    c.shipments +
    c.orders +
    c.contractRates +
    c.facilities +
    c.contacts +
    c.rfpBids +
    c.routingGuides +
    c.exceptionAlerts +
    c.activeSequences +
    (c.shipperUser ? 1 : 0)
  );
}

/** One sentence naming what blocks, in the order an AE would act on it. */
export function describeReferences(c: CustomerReferenceCensus): string {
  const parts: string[] = [];
  if (c.loads.length) {
    const open = c.loads.filter((l) => l.cancellable).length;
    const history = c.loads.length - open;
    const detail = [open ? `${open} open` : "", history ? `${history} history` : ""].filter(Boolean).join(", ");
    parts.push(`${c.loads.length} load${c.loads.length === 1 ? "" : "s"} (${detail})`);
  }
  const n = (count: number, one: string, many: string) => (count ? `${count} ${count === 1 ? one : many}` : "");
  for (const s of [
    n(c.invoices, "invoice", "invoices"),
    n(c.shipments, "shipment", "shipments"),
    n(c.orders, "order", "orders"),
    n(c.contractRates, "contract rate", "contract rates"),
    n(c.facilities, "facility", "facilities"),
    n(c.contacts, "contact", "contacts"),
    n(c.rfpBids, "RFP bid", "RFP bids"),
    n(c.routingGuides, "routing guide", "routing guides"),
    n(c.exceptionAlerts, "exception alert", "exception alerts"),
    n(c.activeSequences, "in-flight email sequence", "in-flight email sequences"),
    c.shipperUser ? `a shipper login (${c.shipperUser.email})` : "",
  ]) {
    if (s) parts.push(s);
  }
  return parts.join(", ");
}

export async function censusCustomerReferences(customerId: string): Promise<CustomerReferenceCensus> {
  const [loadRows, invoices, shipments, orders, contractRates, facilities, contacts, rfpBids, routingGuides, exceptionAlerts, activeSequences, owner] =
    await Promise.all([
      prisma.load.findMany({
        where: { customerId },
        select: { id: true, referenceNumber: true, status: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.invoice.count({ where: { load: { customerId } } }),
      prisma.shipment.count({ where: { customerId } }),
      prisma.order.count({ where: { customerId } }),
      prisma.contractRate.count({ where: { customerId } }),
      prisma.customerFacility.count({ where: { customerId } }),
      prisma.customerContact.count({ where: { customerId } }),
      prisma.rfpBid.count({ where: { customerId } }),
      prisma.routingGuide.count({ where: { customerId } }),
      prisma.exceptionAlert.count({ where: { customerId } }),
      prisma.emailSequence.count({ where: { prospectId: customerId, status: { in: ["ACTIVE", "PAUSED"] } } }),
      prisma.customer.findUnique({ where: { id: customerId }, select: { user: { select: { id: true, email: true } } } }),
    ]);

  return {
    loads: loadRows.map((l) => ({
      id: l.id,
      referenceNumber: l.referenceNumber,
      status: l.status,
      cancellable: isCancellableStatus(l.status),
    })),
    invoices,
    shipments,
    orders,
    contractRates,
    facilities,
    contacts,
    rfpBids,
    routingGuides,
    exceptionAlerts,
    activeSequences,
    shipperUser: owner?.user ? { id: owner.user.id, email: owner.user.email } : null,
  };
}
