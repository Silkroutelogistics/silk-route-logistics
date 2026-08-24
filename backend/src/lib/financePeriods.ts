/**
 * Eastern-time period boundaries for financial reporting.
 *
 * SRL reports in ET (§1 — Michigan entity, Eastern operating hours), but every
 * timestamp is stored UTC. Computing a "month" with `new Date(y, m, 1)` gives
 * the server's local month, which on Render is UTC — so for the first hours of
 * an ET day the two disagree about which month it is, and revenue silently
 * lands in the wrong bucket.
 *
 * DST is handled by asking Intl for the offset AT THE INSTANT rather than
 * assuming a fixed -4 or -5. America/New_York is UTC-4 from March to November
 * and UTC-5 otherwise, and a hardcoded offset is wrong for roughly half the
 * year.
 *
 * WEEK STARTS SUNDAY. That is the existing dashboard's convention and changing
 * it would silently redefine "this week" for whoever is reading the number.
 */

const ZONE = "America/New_York";

/**
 * Milliseconds to ADD to a UTC-constructed wall clock to get the real instant.
 * Positive while ET is behind UTC, so +4h on EDT and +5h on EST.
 *
 * ASKS Intl FOR THE OFFSET DIRECTLY rather than round-tripping through a
 * formatted string. The previous implementation rendered the instant as an ET
 * wall-clock string and re-parsed it with new Date(), which parses in the HOST
 * timezone — so it only worked when the host was not itself Eastern, and it
 * broke on precisely the days it existed to handle. On a DST transition day the
 * wall clock is ambiguous: "1:00 AM" happens twice on the November Sunday, and
 * the parser picks one. It returned SIX HOURS for an instant on 1 Nov 2026, an
 * offset US Eastern has never had.
 *
 * formatToParts with longOffset reports the offset in force AT the instant,
 * with no string round-trip and no dependence on where the server is.
 */
function etOffsetMs(at: Date): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, timeZoneName: "longOffset" })
    .formatToParts(at)
    .find((x) => x.type === "timeZoneName")?.value;
  // "GMT-04:00" / "GMT-05:00". Plain "GMT" means zero, which cannot happen for
  // ET but is the honest reading if a runtime ever emits it.
  const m = name ? /GMT([+-])([0-9]{2}):([0-9]{2})/.exec(name) : null;
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  return -(sign * (Number(m[2]) * 3600000 + Number(m[3]) * 60000));
}

/** The Y/M/D/h/m/s an ET wall clock shows at this instant. */
export function etParts(at: Date): {
  year: number; month: number; day: number;
  hour: number; minute: number; second: number; weekday: number;
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false, weekday: "short",
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(at)) p[part.type] = part.value;
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    // Intl renders midnight as "24" in some ICU versions; normalise.
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    second: Number(p.second),
    weekday: DAYS.indexOf(p.weekday),
  };
}

/** The UTC instant at which the given ET wall-clock date begins (00:00:00 ET). */
function etMidnightInstant(year: number, month: number, day: number): Date {
  // Build the wall clock as if it were UTC, then correct by the offset that
  // actually applies near that date. Two passes because the offset itself can
  // change across the boundary being computed (DST transition weekends).
  const naive = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const firstGuess = new Date(naive + etOffsetMs(new Date(naive)));
  return new Date(naive + etOffsetMs(firstGuess));
}

/** 00:00:00 ET on the first of the current ET month. */
export function etStartOfMonth(now: Date): Date {
  const { year, month } = etParts(now);
  return etMidnightInstant(year, month, 1);
}

/** 00:00:00 ET on the most recent Sunday, in the current ET week. */
export function etStartOfWeek(now: Date): Date {
  const { year, month, day, weekday } = etParts(now);
  const sunday = etMidnightInstant(year, month, day - weekday);
  return sunday;
}

/**
 * Is the whole current week inside the current month?
 *
 * When true, weekly revenue MUST NOT exceed monthly revenue — that comparison
 * is the T5 regression case ($4,850 this week against $0 this month). When the
 * week straddles a month boundary the week legitimately contains days the month
 * does not, and the two are not comparable; the caller should not assert on it.
 */
export function weekIsInsideMonth(now: Date): boolean {
  return etStartOfWeek(now).getTime() >= etStartOfMonth(now).getTime();
}
