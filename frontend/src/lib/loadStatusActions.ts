/**
 * Shared load-status advancement helpers (v3.8.e).
 *
 * Single source of truth for the status state machine's "advance to next"
 * UX. The Load Board ([dashboard/loads/page.tsx]) and the Track & Trace
 * LoadDetailDrawer both render a button that advances a load to its next
 * valid status; this module centralizes the maps so they can't drift.
 *
 * The backend's authoritative state machine lives in
 * [backend/src/controllers/loadController.ts] VALID_TRANSITIONS — these
 * client-side maps must stay aligned with it. When the backend adds a new
 * transition, update both maps below.
 *
 * Terminal statuses (DELIVERED, COMPLETED, TONU, CANCELLED, etc.) appear
 * implicitly as "no entry" in NEXT_STATUS — `getNextStatusAction` returns
 * null for them, which the UI uses to suppress the advance button.
 */

export const NEXT_STATUS: Record<string, string> = {
  POSTED: "TENDERED",
  TENDERED: "CONFIRMED",
  CONFIRMED: "BOOKED",
  BOOKED: "DISPATCHED",
  DISPATCHED: "AT_PICKUP",
  AT_PICKUP: "LOADED",
  LOADED: "IN_TRANSIT",
  PICKED_UP: "IN_TRANSIT",
  IN_TRANSIT: "AT_DELIVERY",
  AT_DELIVERY: "DELIVERED",
  DELIVERED: "POD_RECEIVED",
  POD_RECEIVED: "INVOICED",
  INVOICED: "COMPLETED",
};

export const STATUS_ACTIONS: Record<string, string> = {
  POSTED: "Tender",
  TENDERED: "Confirm",
  CONFIRMED: "Book Load",
  BOOKED: "Dispatch",
  DISPATCHED: "At Pickup",
  AT_PICKUP: "Mark Loaded",
  LOADED: "In Transit",
  PICKED_UP: "In Transit",
  IN_TRANSIT: "At Delivery",
  AT_DELIVERY: "Mark Delivered",
  DELIVERED: "POD Received",
  POD_RECEIVED: "Mark Invoiced",
  INVOICED: "Complete",
};

export interface NextStatusAction {
  label: string;
  nextStatus: string;
}

/**
 * Returns the next-status advancement label + target for a given current
 * status, or null when the status is terminal (no advancement available).
 *
 * Callers render an advance button when this returns non-null; suppress it
 * when null. Same pattern Load Board has used since v3.4.x.
 */
export function getNextStatusAction(currentStatus: string | undefined | null): NextStatusAction | null {
  if (!currentStatus) return null;
  const nextStatus = NEXT_STATUS[currentStatus];
  const label = STATUS_ACTIONS[currentStatus];
  if (!nextStatus || !label) return null;
  return { label, nextStatus };
}
