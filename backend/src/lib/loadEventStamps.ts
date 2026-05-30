// Stamp actual pickup/delivery event timestamps on a Load status change.
//
// Build B (2026-05-30) — pairs with lib/onTimePerformance.ts (Build A, which
// READS these columns). The carrier portal already stamped
// actualPickupDatetime on LOADED/IN_TRANSIT + actualDeliveryDatetime on
// DELIVERED. Build B:
//   (a) makes AT_PICKUP the PRIMARY pickup trigger — arrival at the shipper is
//       the moment "on-time pickup" is measured against the appointment window;
//       LOADED/IN_TRANSIT remain fallbacks for carriers who skip AT_PICKUP.
//   (b) adds POD_RECEIVED as a delivery fallback (carriers who upload POD
//       without first flipping DELIVERED).
//   (c) wires the AE-console status path (loadController.updateLoadStatus),
//       which never stamped these columns at all.
// NEVER overwrites an existing timestamp, so the earliest legitimate signal
// wins (a later LOADED flip can't clobber the real AT_PICKUP arrival time).

const PICKUP_STATUSES = new Set(["AT_PICKUP", "PICKED_UP", "LOADED", "IN_TRANSIT"]);
const DELIVERY_STATUSES = new Set(["DELIVERED", "POD_RECEIVED"]);

export function actualEventStamps(
  targetStatus: string,
  existing: { actualPickupDatetime?: Date | null; actualDeliveryDatetime?: Date | null },
  now: Date = new Date()
): { actualPickupDatetime?: Date; actualDeliveryDatetime?: Date } {
  const out: { actualPickupDatetime?: Date; actualDeliveryDatetime?: Date } = {};
  if (PICKUP_STATUSES.has(targetStatus) && !existing.actualPickupDatetime) {
    out.actualPickupDatetime = now;
  }
  if (DELIVERY_STATUSES.has(targetStatus) && !existing.actualDeliveryDatetime) {
    out.actualDeliveryDatetime = now;
  }
  return out;
}
