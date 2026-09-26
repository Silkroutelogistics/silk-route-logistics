// Is load_number_seq positioned to issue the next load number?
//
// WHY THIS EXISTS. generateLoadNumber issues `CREATE SEQUENCE IF NOT EXISTS
// load_number_seq START WITH ...`, and `IF NOT EXISTS` means that START WITH
// applies ONLY where the sequence does not already exist. Where it does exist,
// the code and the database can disagree silently about what the next load
// will be. On 2026-09-24 an arc read `pg_sequences.start_value` as evidence of
// the next load number. start_value is the CREATE-time value and is NOT changed
// by ALTER SEQUENCE ... RESTART, so it cannot answer the question. Only
// last_value + is_called can, and srl_readonly could not read them until the
// GRANT of v3.8.biq (§13.3 Item 303.2: the default ACL covers tables, not
// sequences).
//
// WHAT "EXPECTED" MEANS NOW (§21.2, corrected 2026-09-26). Loads continue from
// the last legacy number, so the next load is 121498 and upward. A next value
// below LOAD_NUMBER_FLOOR is the state the generator REFUSES to issue from: the
// retired 5001 series, where production's sequence sits (after 5001 and 5002)
// until scripts/restart-load-number-sequence.ts is run. Health says so before
// an AE finds out by failing to create a load.
//
// The meaning inverted with the correction. Until then a next value at or above
// 121472 was the flagged state ("LEGACY RANGE") and a bare 5001-series value was
// the healthy one.
//
// NULL MEANS UNKNOWN, NEVER "continuing" — the same rule status_machine states.
// A failed read reports nulls and the error. Reporting the safe-looking value
// on no evidence is precisely the shape this field exists to catch.
//
// TTL, NOT PER-PROCESS. schemaInfo caches for the life of the process because
// a migration cannot apply to a running one. A sequence advances on every load
// creation, and it is moved by a script while the process runs, so a short TTL
// is both accurate and enough to keep a load-balancer poll off the database.

import { LOAD_NUMBER_FLOOR } from "./documentNumber";

const TTL_MS = 60_000;

export interface SeqStore {
  $queryRawUnsafe<T = unknown>(sql: string): Promise<T>;
}

export interface LoadNumberSeqInfo {
  /** The number the next load will be issued, or null if unknown. */
  next: number | null;
  /** "continuing": the generator will issue `next`. "BELOW FLOOR": it will refuse. */
  range: "continuing" | "BELOW FLOOR" | null;
  /** True when the next number is below the floor. Null = unknown. */
  unexpected: boolean | null;
  checkedAt: string | null;
  error?: string;
}

let cache: { at: number; value: LoadNumberSeqInfo } | null = null;

function unknown(err: unknown, nowMs: number): LoadNumberSeqInfo {
  return {
    next: null,
    range: null,
    unexpected: null,
    checkedAt: new Date(nowMs).toISOString(),
    error: err instanceof Error ? err.message : String(err),
  };
}

export async function loadNumberSeqInfo(db: SeqStore, nowMs: number = Date.now()): Promise<LoadNumberSeqInfo> {
  if (cache && nowMs - cache.at < TTL_MS) return cache.value;

  try {
    const rows = await db.$queryRawUnsafe<Array<{ last_value: bigint | number; is_called: boolean }>>(
      "SELECT last_value, is_called FROM load_number_seq",
    );
    const row = rows?.[0];
    if (!row) return unknown(new Error("load_number_seq returned no row"), nowMs);

    // is_called=false means last_value has not been handed out yet, so it IS
    // the next number. Inverting this reports the state off by one — exactly at
    // the floor, where it matters.
    const lastValue = Number(row.last_value);
    const next = row.is_called ? lastValue + 1 : lastValue;
    const below = next < LOAD_NUMBER_FLOOR;

    const value: LoadNumberSeqInfo = {
      next,
      range: below ? "BELOW FLOOR" : "continuing",
      unexpected: below,
      checkedAt: new Date(nowMs).toISOString(),
    };
    cache = { at: nowMs, value };
    return value;
  } catch (err) {
    // Not cached: a transient database problem must not pin "unknown" for the
    // life of the process when the next call could answer properly.
    return unknown(err, nowMs);
  }
}

/** Test seam — the module-level TTL cache would otherwise leak across cases. */
export function resetLoadNumberSeqCache(): void {
  cache = null;
}
