// Which RANGE is load_number_seq issuing from?
//
// WHY THIS EXISTS. §21.2 moved loads onto a bare series starting at 5001.
// generateLoadNumber issues `CREATE SEQUENCE IF NOT EXISTS load_number_seq
// START WITH 5001`, and `IF NOT EXISTS` means that START WITH applies ONLY
// where the sequence does not already exist. On production it did — at
// 121472 — so the code edit alone moved nothing there, and a one-off RESTART
// was the other half. Nothing reported which of the two states production
// was in, and on 2026-09-24 that produced a wrong published claim: an arc
// read `pg_sequences.start_value` as evidence of the next load number.
// start_value is the CREATE-time value and is NOT changed by ALTER SEQUENCE
// ... RESTART, so it cannot distinguish "never restarted" from "restarted to
// 5001". Only last_value + is_called can, and srl_readonly could not read
// them at all (§13.3 Item 303.2 — the default ACL covers tables, not
// sequences). Answering it took an owner credential and a hand-run script.
//
// So health answers it now, beside "what code" and "what schema".
//
// NULL MEANS UNKNOWN, NEVER "bare" — the same rule status_machine states. A
// failed read reports nulls and the error. Reporting the safe-looking value
// on no evidence is precisely the shape this field exists to catch.
//
// TTL, NOT PER-PROCESS. schemaInfo caches for the life of the process because
// a migration cannot apply to a running one. A sequence advances on every
// load creation, so that would go stale inside one process. The RANGE only
// changes after ~116,000 loads, so a short TTL is both accurate and enough to
// keep a load-balancer poll off the database.

/** Loads issued before the bare series occupy 121472 and upward. */
export const LEGACY_FLOOR = 121472;

const TTL_MS = 60_000;

export interface SeqStore {
  $queryRawUnsafe<T = unknown>(sql: string): Promise<T>;
}

export interface LoadNumberSeqInfo {
  /** The number the next load will be issued, or null if unknown. */
  next: number | null;
  range: "bare" | "LEGACY RANGE" | null;
  /** True when the next number falls back in the legacy range. Null = unknown. */
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
    // the next number. Inverting this reports the range off by one.
    const lastValue = Number(row.last_value);
    const next = row.is_called ? lastValue + 1 : lastValue;
    const bare = next < LEGACY_FLOOR;

    const value: LoadNumberSeqInfo = {
      next,
      range: bare ? "bare" : "LEGACY RANGE",
      unexpected: !bare,
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
