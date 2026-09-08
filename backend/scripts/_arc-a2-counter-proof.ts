/**
 * A2 — the durable status-machine counter, proved against a real database.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE UNIT TEST. The unit test drives a plain
 * object, so it cannot prove the one thing only Postgres and the generated
 * client know: that `fromStatus_toStatus` is the real name of the composite
 * unique key, that the upsert's create branch fires on a first observation and
 * the increment branch on the second, and that `@updatedAt` actually moves
 * lastSeenAt while firstSeenAt stays put. A mocked store answers "yes" to
 * whatever key name it is handed.
 *
 * It also applies the whole migration chain from an EMPTY database, which is
 * what proves the hand-authored SQL is not merely consistent with the model but
 * applies in sequence with everything before it.
 *
 * READ-ONLY OF PRODUCTION: this never touches it. It builds its own database in
 * the local container and refuses to run against anything else.
 *
 * Outbound keys are explicitly empty when this runs (§19 Sub-pattern 20) --
 * absence is not neutralization, because dotenv fills an unset key from .env.
 */
import { PrismaClient } from "@prisma/client";
import {
  persistTransitionObservation,
  cumulativeStatusMachineCounters,
  __resetCumulativeCache,
} from "../src/lib/statusMachineCounters";

const URL = process.env.PROOF_DATABASE_URL;

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ""}`);
  }
}

async function main() {
  if (!URL) throw new Error("PROOF_DATABASE_URL is required");
  if (!/localhost|127\.0\.0\.1/.test(URL)) {
    throw new Error(`refusing a non-local target: ${URL.replace(/:[^:@]*@/, ":***@")}`);
  }
  for (const k of ["RESEND_API_KEY", "OPENPHONE_API_KEY", "QUO_API_KEY"]) {
    if (process.env[k]) throw new Error(`${k} is set to a real value. Outbound would be LIVE.`);
  }

  const db = new PrismaClient({ datasourceUrl: URL });

  console.log("\n[1] the table exists after the chain applied from empty");
  const cols = await db.$queryRawUnsafe<Array<{ column_name: string; data_type: string }>>(
    `SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'status_machine_counters' ORDER BY column_name;`,
  );
  check("status_machine_counters exists", cols.length > 0, `${cols.length} columns`);
  const names = cols.map((c) => c.column_name).sort();
  check(
    "carries exactly the six columns the model declares",
    JSON.stringify(names) ===
      JSON.stringify(["count", "firstSeenAt", "fromStatus", "id", "lastSeenAt", "toStatus"]),
    names.join(","),
  );

  const idx = await db.$queryRawUnsafe<Array<{ indexname: string }>>(
    `SELECT indexname FROM pg_indexes WHERE tablename = 'status_machine_counters';`,
  );
  check(
    "the composite unique index is present, which the upsert needs by name",
    idx.some((i) => i.indexname === "status_machine_counters_fromStatus_toStatus_key"),
    idx.map((i) => i.indexname).join(","),
  );

  console.log("\n[2] first observation CREATES, second INCREMENTS");
  await db.statusMachineCounter.deleteMany({});
  persistTransitionObservation(db as any, "BOOKED" as any, "DELIVERED" as any);
  await settle();
  const afterFirst = await db.statusMachineCounter.findFirst({
    where: { fromStatus: "BOOKED" as any, toStatus: "DELIVERED" as any },
  });
  check("a row exists after the first observation", !!afterFirst);
  check("it counts 1", afterFirst?.count === 1, String(afterFirst?.count));

  // A tick, so lastSeenAt can move measurably.
  await new Promise((r) => setTimeout(r, 25));
  persistTransitionObservation(db as any, "BOOKED" as any, "DELIVERED" as any);
  await settle();
  const afterSecond = await db.statusMachineCounter.findFirst({
    where: { fromStatus: "BOOKED" as any, toStatus: "DELIVERED" as any },
  });
  check("the second observation increments rather than inserting", afterSecond?.count === 2, String(afterSecond?.count));
  check(
    "exactly one row for the edge, so the composite key really is unique",
    (await db.statusMachineCounter.count()) === 1,
  );
  check(
    "firstSeenAt is unchanged -- it records when the edge was FIRST seen",
    afterFirst!.firstSeenAt.getTime() === afterSecond!.firstSeenAt.getTime(),
  );
  check(
    "lastSeenAt moved forward, so 'when did this last fire' is answerable",
    afterSecond!.lastSeenAt.getTime() > afterFirst!.lastSeenAt.getTime(),
    `${afterFirst!.lastSeenAt.toISOString()} -> ${afterSecond!.lastSeenAt.toISOString()}`,
  );

  console.log("\n[3] the read classifies against the AUTO map, not against the row");
  persistTransitionObservation(db as any, "POSTED" as any, "DISPATCHED" as any);
  await settle();
  __resetCumulativeCache();
  const c = await cumulativeStatusMachineCounters(db as any);
  check("both edges count as AE violations", c.violations_cumulative === 3, String(c.violations_cumulative));
  check(
    "only the edge the AUTO map does not account for is unexpected",
    c.unexpected_cumulative === 2,
    String(c.unexpected_cumulative),
  );
  check(
    "the unexpected edge is named, so there is something to go and read",
    c.unexpected_edges.length === 1 && c.unexpected_edges[0].from === "BOOKED",
    JSON.stringify(c.unexpected_edges.map((e) => `${e.from}->${e.to}`)),
  );
  check("cumulative_since is populated once anything has been seen", !!c.cumulative_since);
  check("no error field on a healthy read", c.error === undefined);

  console.log("\n[4] an unreadable table reports UNKNOWN, not a clean zero");
  // The failure mode that matters: if this reported 0, somebody would read
  // "clean" off a question that was never answered, on the field enforcement is
  // decided by.
  __resetCumulativeCache();
  const broken = await cumulativeStatusMachineCounters(
    { statusMachineCounter: { upsert: async () => ({}), findMany: async () => { throw new Error("relation missing"); } } } as any,
  );
  check("unexpected_cumulative is null", broken.unexpected_cumulative === null, String(broken.unexpected_cumulative));
  check("an error says why", (broken.error ?? "").includes("relation missing"), broken.error ?? "");

  await db.statusMachineCounter.deleteMany({});
  await db.$disconnect();

  console.log(`\n${pass}/${pass + fail} passed`);
  if (fail) process.exit(1);
}

/** The writer is fire-and-forget by contract; give its promise a turn to land. */
async function settle() {
  await new Promise((r) => setTimeout(r, 150));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
