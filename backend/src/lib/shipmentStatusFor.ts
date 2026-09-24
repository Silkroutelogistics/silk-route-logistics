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
 * THE ONE DIVERGENCE IT LEFT IS NOW CORRECTED (C2, Item 317).
 * `AT_PICKUP -> PICKED_UP` claimed the freight was picked up when the truck had
 * only ARRIVED. It maps to `DISPATCHED` -- the nearest pre-pickup member --
 * because arrival is not loading, and `LOADED` is when the freight is actually
 * on. `setActualPickup` moved with it for the same reason: the status and the
 * timestamp are ONE claim, and leaving the stamp on AT_PICKUP would have left a
 * row reading DISPATCHED while carrying a pickup time. The stamp is not lost,
 * only deferred to the moment it becomes true -- AT_PICKUP -> LOADED and
 * AT_PICKUP -> PICKED_UP are both allowed AE transitions and both still stamp.
 *
 * ITEM 317 BANKED TWO RISKS FOR THIS CHANGE AND THE CODE CARRIES NEITHER.
 * Both were checked rather than trusted (§19 Sub-pattern 15):
 *
 *   "moves a customer-facing status" -- `shipperPortalController` contains ZERO
 *   `prisma.shipment` queries; every shipper-facing surface, including the
 *   tracking stepper and the shipments list, reads `prisma.load`. Nothing a
 *   customer sees reads this column.
 *
 *   "moves the timestamp detention and on-time-pickup read" -- it does not.
 *   §9's on-time factor and every analytics surface read
 *   `Load.actualPickupDatetime`, stamped by `lib/loadEventStamps.ts`, which
 *   this file does not touch. Detention takes stop arrival as given from
 *   `LoadStop`. `Shipment.actualPickup` has THREE writers and ZERO readers in
 *   backend/src or frontend/src -- the two greps that look like reads are
 *   output fields merely NAMED actualPickup, sourced from the Load column.
 *
 * THE ONE CONSUMER THAT REALLY WOULD HAVE FIRED DIFFERENTLY IS WHY C1 SHIPPED
 * FIRST. `runPreTracing` selects shipments on `status in (BOOKED, DISPATCHED)`,
 * so this remap pushes a dock-arrived shipment back INTO that selection --
 * re-creating, through a different door, the exact defect C1 had just closed.
 * C1's load-level filter is what holds it shut, and the proof drives both
 * together rather than reasoning about the interaction.
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
  // Arrived at the shipper, not yet loaded. The nearest pre-pickup member --
  // the truck is there and the freight is not on it (C2, Item 317).
  AT_PICKUP: "DISPATCHED",
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
    // NOT AT_PICKUP: arriving is not loading, and the stamp is the same claim
    // the status makes (C2, Item 317). Deferred, not lost -- both moves out of
    // AT_PICKUP land on a status that stamps.
    setActualPickup: loadStatus === "LOADED" || loadStatus === "PICKED_UP",
    setActualDelivery: loadStatus === "AT_DELIVERY" || loadStatus === "DELIVERED",
  };
}

// A status-only export is deliberately NOT offered yet. The un-cancel (C3b)
// will want one -- restoring a load's status implies its shipment's -- and an
// export shipped ahead of its only real consumer is a dead export with a test
// standing in for a reader (§3.7). It arrives with that caller.
