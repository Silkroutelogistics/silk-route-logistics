// THE APPOINTMENT WINDOW, worded the same way on every document.
//
// THE DEFECT THIS CLOSES. The bill of lading rendered a literal template
// placeholder when a load carried no window:
//
//   Window: Thu, Sep 24, 2026  ·  [HH:MM–HH:MM]
//
// Measured on production 2026-09-23: 4 of 7 live loads print that, SRL-121497
// among them — BOOKED, pickup 2026-09-24, BOL number already issued. A driver
// reading it sees a form nobody finished, on the document that sends them to a
// dock.
//
// WHY "local" AND NOT AN ABBREVIATION (ruling 1). There is no timezone anywhere
// in the schema — not on Load, not on LoadStop, not on CustomerFacility — and
// none can be derived: origin/dest lat-lng is populated on 0 of 7 live loads,
// and the only two states SRL ships (TX, KY) are BOTH split-timezone. Kentucky
// is Eastern in the north where SRL's lanes run and Central in the west; Texas
// is Central except El Paso. A state lookup would be confidently wrong for
// exactly the freight we move, and an hour wrong on a dock time is a driver
// arriving at the wrong time with a document that told them to.
//
// "local" is what the industry prints when the zone is not recorded, and it is
// true: a dock window IS local to the dock. Carrying a real zone is banked
// (§13.3) and needs a column, an AE surface and a backfill — not a guess.
//
// "to" RATHER THAN AN EN-DASH: ranges with a dash read as a hyphenated single
// value at 7.75pt, and this line is also read aloud over a phone.

/**
 * The time portion of a stop window. Returns null when no time is recorded —
 * callers render the date alone rather than a placeholder.
 *
 *   formatStopWindow("08:00", "14:00")  ->  "08:00 to 14:00 local"
 *   formatStopWindow("09:00", null)     ->  "09:00 local"
 *   formatStopWindow("09:00", "09:00")  ->  "09:00 local"
 *   formatStopWindow(null, null)        ->  null
 */
export function formatStopWindow(
  start: string | null | undefined,
  end: string | null | undefined,
): string | null {
  const from = String(start ?? "").trim();
  const to = String(end ?? "").trim();

  // An end with no start is still a fact worth printing — "by 14:00" is how a
  // delivery-only window arrives — so it is not discarded.
  if (!from && !to) return null;
  if (from && to && from !== to) return `${from} to ${to} local`;
  return `${from || to} local`;
}

/**
 * The whole line: a formatted date, and the window when there is one.
 *
 * The date is passed already formatted because the two documents format it
 * differently and neither should be changed here — the BOL wants
 * "Thu, Sep 24, 2026", the rate confirmation has its own.
 */
export function formatStopWindowLine(
  formattedDate: string,
  start: string | null | undefined,
  end: string | null | undefined,
  separator = " · ",
): string {
  const win = formatStopWindow(start, end);
  return win ? `${formattedDate}${separator}${win}` : formattedDate;
}
