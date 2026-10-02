/**
 * What a 5-field cron expression promises: when it next fires, and the longest
 * it can go between fires. The health digest judges each job against its own
 * expression instead of a flat 25 hours, which called every weekly job stale six
 * days in seven (compass-score-recalc, health-digest arc 2026-10-02).
 *
 * Evaluated in UTC. For a job scheduled with a timezone the interval is the
 * same apart from a DST hour, which the digest's 1.5x grace absorbs; nextFire
 * is exact only for UTC jobs and is used only for those.
 *
 * Supports numbers, `*`, lists, `a-b` and `/n` steps — every form in use. Any
 * other expression ("manual", names, 6 fields) returns null and is not judged.
 */
const DAY_MS = 86_400_000;
const LOOKAHEAD_DAYS = 800; // longest gap in use is monthly; two years covers anything yearly

function field(spec: string, min: number, max: number): Set<number> | null {
  const out = new Set<number>();
  for (const part of spec.split(",")) {
    const m = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part);
    if (!m) return null;
    const [lo, hi] = m[1] === "*" ? [min, max] : m[1].split("-").map(Number).concat(NaN).slice(0, 2);
    const end = Number.isNaN(hi) ? (m[2] ? max : lo) : hi;
    const step = m[2] ? Number(m[2]) : 1;
    if (lo < min || end > max || step < 1) return null;
    for (let v = lo; v <= end; v += step) out.add(v === 7 && max === 7 ? 0 : v);
  }
  return out;
}

function parse(expr: string) {
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5) return null;
  const [min, hour, dom, mon, dow] = [field(f[0], 0, 59), field(f[1], 0, 23), field(f[2], 1, 31), field(f[3], 1, 12), field(f[4], 0, 7)];
  if (!min || !hour || !dom || !mon || !dow) return null;
  return { min: [...min].sort((a, b) => a - b), hour: [...hour].sort((a, b) => a - b), dom, mon, dow, domAny: f[2] === "*", dowAny: f[4] === "*" };
}

/** Every fire from `from` (inclusive) for LOOKAHEAD_DAYS, in order. */
function* fires(expr: string, from: Date): Generator<number> {
  const p = parse(expr);
  if (!p) return;
  const day0 = Math.floor(from.getTime() / DAY_MS) * DAY_MS;
  for (let d = 0; d < LOOKAHEAD_DAYS; d++) {
    const day = new Date(day0 + d * DAY_MS);
    if (!p.mon.has(day.getUTCMonth() + 1)) continue;
    const domHit = p.dom.has(day.getUTCDate());
    const dowHit = p.dow.has(day.getUTCDay());
    // Standard cron: when both day fields are restricted, either one matching is enough.
    if (!(p.domAny || p.dowAny ? domHit && dowHit : domHit || dowHit)) continue;
    for (const h of p.hour) for (const m of p.min) {
      const t = day.getTime() + h * 3_600_000 + m * 60_000;
      if (t >= from.getTime()) yield t;
    }
  }
}

/** The first fire strictly after `after`, or null. */
export function nextFire(expr: string, after: Date): Date | null {
  for (const t of fires(expr, new Date(after.getTime() + 1))) return new Date(t);
  return null;
}

/** The longest gap between consecutive fires, or null if the expression is not judgeable. */
export function expectedIntervalMs(expr: string): number | null {
  let prev: number | undefined;
  let max = 0;
  for (const t of fires(expr, new Date(Date.UTC(2026, 0, 1)))) {
    if (prev !== undefined) max = Math.max(max, t - prev);
    prev = t;
  }
  return max > 0 ? max : null;
}

/**
 * Stale: enabled, has run at least once, and its last START is more than 1.5
 * of its own interval ago. Covers a job that started and never ended too: a
 * stuck run holds its guard, later fires skip, and lastRun stops moving.
 */
export function isStale(row: { enabled: boolean; schedule: string; lastRun: Date | null }, now: Date): boolean {
  if (!row.enabled || !row.lastRun) return false;
  const interval = expectedIntervalMs(row.schedule);
  return interval !== null && now.getTime() - row.lastRun.getTime() > 1.5 * interval;
}
