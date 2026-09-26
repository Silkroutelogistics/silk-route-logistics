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
// WHAT IT REPORTS (FAIL-SAFE, ruled 2026-09-26). The generator issues
// max(sequence, highest load held at or above the floor, 121497) + 1 and never
// refuses, so health reports that same number without drawing one: "continuing"
// when nextval() is the answer, "LIFT PENDING" when the next creation moves the
// sequence first. Production sits in LIFT PENDING, next 121498, from the deploy
// until its first new load. `unexpected` is true only when a load already holds
// the number the sequence would issue: something numbered a load outside it.
//
// The meaning has turned over twice. Until 2026-09-26 a next value at or above
// 121472 was flagged ("LEGACY RANGE"); until the fail-safe, one below the floor
// was ("BELOW FLOOR", which the generator then refused).
//
// NULL MEANS UNKNOWN, NEVER "continuing" — the same rule status_machine states.
// A failed read reports nulls and the error. Reporting the safe-looking value
// on no evidence is precisely the shape this field exists to catch.
//
// TTL, NOT PER-PROCESS. schemaInfo caches for the life of the process because
// a migration cannot apply to a running one. A sequence advances on every load
// creation, and it is moved by a script while the process runs, so a short TTL
// is both accurate and enough to keep a load-balancer poll off the database.

import { highestLoadNumberAtOrAboveFloor, LOAD_NUMBER_FLOOR } from "./documentNumber";

const TTL_MS = 60_000;

export interface SeqStore {
  $queryRawUnsafe<T = unknown>(sql: string): Promise<T>;
}

export interface LoadNumberSeqInfo {
  /** The number the next load will be issued, or null if unknown. */
  next: number | null;
  /** "continuing": nextval() is `next`. "LIFT PENDING": the next creation moves the sequence to `next` first. */
  range: "continuing" | "LIFT PENDING" | null;
  /** True when a load already holds the number the sequence would issue. Null = unknown. */
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
    const seqNext = row.is_called ? lastValue + 1 : lastValue;
    const held = await highestLoadNumberAtOrAboveFloor(db); // 0 when none
    const next = Math.max(seqNext, held + 1, LOAD_NUMBER_FLOOR);

    const value: LoadNumberSeqInfo = {
      next,
      range: next === seqNext ? "continuing" : "LIFT PENDING",
      unexpected: held >= seqNext,
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
