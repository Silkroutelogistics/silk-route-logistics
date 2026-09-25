/**
 * C1 ADVERSARIAL PROOF — a script holding its OWN PrismaClient flips a status,
 * and IS counted.
 *
 * THE DEFECT THIS CLOSES. The gate used to be fed by a `$allOperations` client
 * extension in `src/config/database.ts`, which by construction sees only writes
 * that pass through the SHARED Prisma client. SRL-121496 was reversed twice —
 * once by an untracked script with its own `new PrismaClient()`, which wrote a
 * proper audit row and produced no counter row, and once by the canonical
 * endpoint, which produced one. Same logical act, counted or not purely by which
 * client happened to write it. An `unexpected_cumulative` of zero could mean
 * "nothing illegal happened" or "it happened through a client nobody was
 * watching", and those read identically.
 *
 * WHAT IS BEING PROVEN, and the control is the load-bearing half. Any proof can
 * show the trigger logging a row. What matters is that the SAME script, the SAME
 * client and the SAME flip are INVISIBLE when the trigger is absent — that is the
 * pre-C1 world, reproduced rather than described, which isolates the trigger as
 * the thing that closed the blind spot rather than anything about the fixture.
 *
 * Run against a THROWAWAY container. The guard below refuses anything else.
 *
 *   PROOF_DATABASE_URL=postgresql://x:x@localhost:55496/x \
 *   RESEND_API_KEY= OPENPHONE_API_KEY= \
 *   npx tsx scripts/_arc-c1-foreign-client-proof.ts
 */
import { PrismaClient } from "@prisma/client";
import {
  cumulativeStatusMachineCounters,
  __resetCumulativeCache,
} from "../src/lib/statusMachineCounters";
import { validateLoadStatusTransition } from "../src/lib/loadStateMachine";

const DB_URL = process.env.PROOF_DATABASE_URL ?? process.env.DATABASE_URL ?? "";

// ── Rail ─────────────────────────────────────────────────────────────────────
// This proof DROPS AND RECREATES A TRIGGER and rewrites load statuses. It must
// never be able to reach anything but a local throwaway container, and the check
// is positive (the host must BE local) rather than "not Neon", so a host nobody
// anticipated is refused rather than allowed.
{
  let host = "";
  try {
    host = new URL(DB_URL).hostname;
  } catch {
    console.error("PROOF_DATABASE_URL is not a URL — refusing.");
    process.exit(1);
  }
  if (host !== "localhost" && host !== "127.0.0.1") {
    console.error(`Refusing: host is "${host}", not a local container.`);
    process.exit(1);
  }
}

const FROM = "BOOKED" as const;
const TO = "DELIVERED" as const;
const TRIGGER = "load_status_transition_log";

type Result = { ok: boolean; label: string; detail: string };
const results: Result[] = [];
function check(ok: boolean, label: string, detail = ""): void {
  results.push({ ok, label, detail });
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
}

/** Distinct clients, deliberately. Each is a separate connection and a separate
 *  instance, which is exactly what an untracked script brings with it. */
const foreign = new PrismaClient({ datasourceUrl: DB_URL });
const second = new PrismaClient({ datasourceUrl: DB_URL });
const reader = new PrismaClient({ datasourceUrl: DB_URL });

async function loggedFlips(loadId: string): Promise<number> {
  const rows = await reader.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM load_status_transitions
      WHERE load_id = $1 AND from_status = $2::"LoadStatus" AND to_status = $3::"LoadStatus"`,
    loadId,
    FROM,
    TO,
  );
  return rows[0]?.n ?? 0;
}

async function latestTxid(loadId: string): Promise<string | null> {
  const rows = await reader.$queryRawUnsafe<{ txid: string }[]>(
    `SELECT txid FROM load_status_transitions WHERE load_id = $1
      ORDER BY occurred_at DESC, id DESC LIMIT 1`,
    loadId,
  );
  return rows[0]?.txid ?? null;
}

/**
 * A NULL READ THROWS. The gate's own rule is that null means UNKNOWN and never
 * zero, because the two read identically at a glance on the one field that
 * decides whether enforcement is safe to turn on. Returning it here would let a
 * failed read surface as a quiet delta mismatch several checks later, pointing
 * at the trigger instead of at the read.
 */
async function unexpected(): Promise<number> {
  __resetCumulativeCache(); // the read is TTL-cached; a stale hit would read as "no change"
  const c = await cumulativeStatusMachineCounters(reader as any);
  if (c.unexpected_cumulative === null) {
    throw new Error(
      "unexpected_cumulative read as null. Null is UNKNOWN, never zero — every delta " +
        "below would be measured against a number that does not exist.",
    );
  }
  return c.unexpected_cumulative;
}

async function main(): Promise<void> {
  console.log(`\nC1 — foreign-client visibility proof\n${"=".repeat(60)}`);

  // ── Vacuity tripwires ──────────────────────────────────────────────────────
  // Every assertion below is a DELTA on a count. If the edge stopped being a
  // violation, or the read started failing, the deltas would all be zero and
  // every later check would pass while measuring nothing.
  console.log("\n[0] the fixture can actually fail");
  check(
    !validateLoadStatusTransition(FROM, TO, "AE").allowed,
    `${FROM} -> ${TO} is still a violation under the AE map`,
  );

  const trigBefore = await reader.$queryRawUnsafe<{ def: string }[]>(
    `SELECT pg_get_triggerdef(oid) AS def FROM pg_trigger
      WHERE tgrelid = 'public.loads'::regclass AND tgname = $1 AND NOT tgisinternal`,
    TRIGGER,
  );
  check(trigBefore.length === 1, "the trigger is installed to begin with");
  const triggerDef = trigBefore[0]?.def ?? "";

  // ── Setup ──────────────────────────────────────────────────────────────────
  await reader.$executeRawUnsafe(
    `UPDATE loads SET status = $1::"LoadStatus" WHERE id IN ('lt-1','lt-2','lt-3','lt-4')`,
    FROM,
  );

  // A REAL tripwire, not a restatement of the line above it. Every assertion
  // below is a delta, and a delta against an empty log is trivially zero — so
  // the thing worth asserting is that the source has rows at all.
  const logRows = await reader.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM load_status_transitions`,
  );
  check(
    (logRows[0]?.n ?? 0) > 0,
    "the transition log has rows, so the deltas below are measured against something",
    `${logRows[0]?.n} rows`,
  );

  const base = await unexpected(); // throws on a null read; see the helper
  console.log(`      baseline unexpected_cumulative = ${base}`);

  const counterRowsBefore = await reader.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM status_machine_counters`,
  );

  // ── A. The foreign client's write IS counted ───────────────────────────────
  console.log("\n[A] a script with its OWN client flips a status");
  const a0 = await loggedFlips("lt-1");
  await foreign.load.update({ where: { id: "lt-1" }, data: { status: TO } });

  check((await loggedFlips("lt-1")) === a0 + 1, "the trigger logged the transition");
  const afterA = await unexpected();
  check(
    afterA === base + 1,
    "unexpected_cumulative moved — the gate saw a write the client extension never could",
    `${base} -> ${afterA}`,
  );
  const txidA = await latestTxid("lt-1");
  check(!!txidA, "the row carries a txid", `txid=${txidA}`);

  // ── B. CONTROL: the pre-C1 world ───────────────────────────────────────────
  // Same script, same client, same edge. Only the trigger is gone. If this still
  // counted, check A would be measuring something other than the trigger.
  console.log("\n[B] control — the identical flip with the trigger removed");
  const b0 = await loggedFlips("lt-2"); // before the drop, so the control is a true delta
  await reader.$executeRawUnsafe(`DROP TRIGGER "${TRIGGER}" ON "public"."loads"`);
  await foreign.load.update({ where: { id: "lt-2" }, data: { status: TO } });

  check((await loggedFlips("lt-2")) === b0, "nothing was logged — this is what SRL-121496 looked like");
  const afterB = await unexpected();
  check(
    afterB === afterA,
    "unexpected_cumulative did NOT move, so the counting is the trigger's doing",
    `${afterA} -> ${afterB}`,
  );

  await reader.$executeRawUnsafe(triggerDef);
  const trigBack = await reader.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM pg_trigger
      WHERE tgrelid = 'public.loads'::regclass AND tgname = $1 AND NOT tgisinternal`,
    TRIGGER,
  );
  check(trigBack[0]?.n === 1, "the trigger was restored from its own definition");

  // ── C. Any client, not that client ─────────────────────────────────────────
  console.log("\n[C] a DIFFERENT client, to show it is not one connection being watched");
  const c0 = await loggedFlips("lt-3");
  await second.load.update({ where: { id: "lt-3" }, data: { status: TO } });

  check((await loggedFlips("lt-3")) === c0 + 1, "the second client's write was logged too");
  const txidC = await latestTxid("lt-3");
  check(
    !!txidC && txidC !== txidA,
    "and under its own transaction id, so the two are genuinely separate writes",
    `A=${txidA} C=${txidC}`,
  );
  const afterC = await unexpected();
  check(afterC === afterB + 1, "the gate moved again", `${afterB} -> ${afterC}`);

  // ── D. Raw SQL, the extension's other blind spot ───────────────────────────
  console.log("\n[D] $executeRaw — which the client extension also could not see");
  const d0 = await loggedFlips("lt-4");
  await foreign.$executeRawUnsafe(`UPDATE loads SET status = $1::"LoadStatus" WHERE id = 'lt-4'`, TO);

  check((await loggedFlips("lt-4")) === d0 + 1, "a raw UPDATE was logged");
  const afterD = await unexpected();
  check(afterD === afterC + 1, "and counted", `${afterC} -> ${afterD}`);

  // ── E. The old counter table stayed frozen ─────────────────────────────────
  console.log("\n[E] the counter table is frozen, and the count came from the log");
  const counterRowsAfter = await reader.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM status_machine_counters`,
  );
  check(
    counterRowsAfter[0]?.n === counterRowsBefore[0]?.n,
    "status_machine_counters gained no rows across four counted transitions",
    `${counterRowsBefore[0]?.n} -> ${counterRowsAfter[0]?.n}`,
  );

  // ── Tally ──────────────────────────────────────────────────────────────────
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${"=".repeat(60)}`);
  console.log(`${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log("\nFAILED:");
    for (const f of failed) console.log(`  - ${f.label}`);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error("\nPROOF ERRORED:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    // The trigger must go back even on a throw — a proof that leaves the
    // container in its control state would make every later run lie.
    try {
      const n = await reader.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM pg_trigger
          WHERE tgrelid = 'public.loads'::regclass AND tgname = $1 AND NOT tgisinternal`,
        TRIGGER,
      );
      if (n[0]?.n !== 1) console.error(`WARNING: ${TRIGGER} is NOT installed — the container is dirty.`);
    } catch {
      /* the connection is already gone; nothing useful to say */
    }
    await Promise.allSettled([foreign.$disconnect(), second.$disconnect(), reader.$disconnect()]);
  });
