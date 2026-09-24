/**
 * THE single Load -> Shipment status mapping.
 *
 * `LoadStatus` has 18 members. `ShipmentStatus` has 8. That gap is not a bug to
 * be closed by widening the enum (§13.3 Item 160 records the decision: Load is
 * the operational source of truth, Shipment is a narrow billing projection) --
 * it is a translation, and a translation needs exactly one definition.
 *
 * BEFORE THIS FILE THERE WERE TWO, AND THEY DISAGREED.
 *
 *   carrierLoads.ts had a real 5-entry map with a `|| status` fallthrough.
 *   loadController.ts had NO map at all -- it wrote `{ status }` raw.
 *
 * Nine of the seventeen statuses `updateLoadStatusSchema` accepts are not
 * ShipmentStatus members, so the AE path threw on them. Proven against a real
 * database rather than reasoned about: with a connected client, a valid value
 * (IN_TRANSIT) reaches the wire and fails on the missing row (P2025), while
 * AT_PICKUP / LOADED / AT_DELIVERY / POD_RECEIVED / TONU / CONFIRMED /
 * TENDERED / POSTED / INVOICED are all rejected before it. The two valid
 * controls reaching the wire are what give that probe its discriminating power.
 *
 * It was reachable on the ordinary happy path: DISPATCHED -> AT_PICKUP is an
 * allowed AE transition, an accepted load always has a linked shipment
 * (tenderController creates one), and the write is a bare `await` with no
 * try/catch. The load status commits first, so the AE saw a 500 on a load that
 * HAD moved -- and the retry hit the same-status early return and answered 200
 * with the shipment still behind. Loud once, then silently wrong forever.
 *
 * THE MAPPING PRESERVES THE CARRIER PATH EXACTLY. Where carrierLoads already
 * had an answer, that answer is kept, so no shipper-visible status changes.
 * Only the AE path changes, and only from "throws" to "maps" -- there is no
 * prior behaviour there to preserve.
 *
 * ONE DIVERGENCE IS DELIBERATELY NOT FIXED HERE. `AT_PICKUP -> PICKED_UP` says
 * the freight is picked up when the truck has only ARRIVED; LOADED is when it
 * is actually on. Correcting it would move a customer-facing status on loads
 * that are live right now, which is a product decision rather than a
 * unification, so it is banked (§13.3) rather than taken silently.
 */
import type { LoadStatus, ShipmentStatus } from "@prisma/client";

/**
 * Total over LoadStatus: every member maps. A `Record` rather than a lookup
 * with a fallback, so adding a LoadStatus member fails to compile until
 * somebody decides what it means for a shipment -- which is the whole point of
 * having one definition.
 */
const LOAD_TO_SHIPMENT: Record<LoadStatus, ShipmentStatus> = {
  // Before a carrier is on it, there is nothing to project.
  DRAFT: "PENDING",
  PLANNED: "PENDING",
  POSTED: "PENDING",
  TENDERED: "PENDING",
  // Committed, not yet rolling.
  CONFIRMED: "BOOKED",
  BOOKED: "BOOKED",
  DISPATCHED: "DISPATCHED",
  // carrierLoads' existing answer, preserved. See the note above.
  AT_PICKUP: "PICKED_UP",
  LOADED: "PICKED_UP",
  PICKED_UP: "PICKED_UP",
  IN_TRANSIT: "IN_TRANSIT",
  // carrierLoads' existing answer, preserved: arrival at the consignee is
  // reported to the shipper as delivered.
  AT_DELIVERY: "DELIVERED",
  DELIVERED: "DELIVERED",
  POD_RECEIVED: "DELIVERED",
  // The billing projection is finished once the money document exists.
  INVOICED: "COMPLETED",
  COMPLETED: "COMPLETED",
  // A truck ordered and not used ends the shipment the same way a cancel does:
  // no freight moved.
  TONU: "CANCELLED",
  CANCELLED: "CANCELLED",
};

export interface ShipmentSync {
  status: ShipmentStatus;
  /** The load status implies the freight is now on the truck. */
  setActualPickup: boolean;
  /** The load status implies the freight has reached the consignee. */
  setActualDelivery: boolean;
}

/**
 * The timestamps travel with the status because they were the second thing the
 * two call sites disagreed about: carrierLoads stamped actualPickup on
 * AT_PICKUP and LOADED, loadController on PICKED_UP. Splitting them across two
 * exports would leave the same drift one refactor away.
 */
export function shipmentSyncFor(loadStatus: LoadStatus): ShipmentSync {
  return {
    status: LOAD_TO_SHIPMENT[loadStatus],
    setActualPickup: loadStatus === "AT_PICKUP" || loadStatus === "LOADED" || loadStatus === "PICKED_UP",
    setActualDelivery: loadStatus === "AT_DELIVERY" || loadStatus === "DELIVERED",
  };
}

// A status-only export is deliberately NOT offered yet. The un-cancel (C3b)
// will want one -- restoring a load's status implies its shipment's -- and an
// export shipped ahead of its only real consumer is a dead export with a test
// standing in for a reader (§3.7). It arrives with that caller.
