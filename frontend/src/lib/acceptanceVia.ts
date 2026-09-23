/**
 * How a carrier's acceptance was recorded, in words — ONE definition.
 *
 * `Load.carrierAcceptedVia` stores an enum naming the act that produced the
 * stamp (R8b). Two AE surfaces render it: the load detail's Execution Evidence
 * panel (bgv) and the settlement's per-load row (C7). This module exists so
 * they cannot come to disagree about what `TENDER_ACCEPT` means — a second
 * label map is how one screen ends up saying "accepted the tender" while
 * another says "confirmed", for the same stamp on the same load.
 *
 * The labels are full sentences rather than terse codes on purpose. These are
 * read by a person deciding whether to pay a settlement or to trust a
 * signature, and "TENDER_ACCEPT" tells them nothing they did not already know.
 */
export const ACCEPTANCE_VIA_LABEL: Record<string, string> = {
  RC_SIGNATURE: "Signed the rate confirmation",
  TENDER_ACCEPT: "Accepted the tender",
  BID_AWARD_ACCEPT: "Bid awarded",
  // Kept because the column can hold them, NOT because anything writes them:
  // carrierUpdateStatus was deleted in v3.8.akc and the surviving route admits
  // AT_PICKUP..DELIVERED, so no live path stamps either. Rendering the raw
  // enum if one ever appeared would be worse than carrying two dead entries.
  STATUS_CONFIRMED: "Confirmed the load",
  STATUS_BOOKED: "Booked the load",
  PICKUP_ARRIVAL: "Arrived at pickup",
};

/**
 * The label for a stored via value. An unrecognised value renders AS ITSELF
 * rather than as a blank or a guess — a stamp SRL wrote and cannot name is
 * something an AE should see, not something a UI should hide.
 */
export function acceptanceViaLabel(via: string | null | undefined): string | null {
  if (!via) return null;
  return ACCEPTANCE_VIA_LABEL[via] ?? via;
}
