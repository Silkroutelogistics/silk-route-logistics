/**
 * Read-only production census for the write-path + record-repair arc.
 *
 * Answers three questions and writes nothing:
 *
 *   C2  How many audit_trails rows carry the swapped/uppercased shape
 *       (entityId = 'status', entityType = an uppercased load id), over what
 *       date range, and what does the rest of the table look like — so the fix
 *       is scoped against the real population rather than a remembered number.
 *
 *   C3  SRL-121495's exact current values for the three fields the repair
 *       clears, captured BEFORE anything is written. This doubles as the
 *       before-image the repair's undo file will hold.
 *
 *   R1  SRL-121496's state, for the TONU-workflow trace.
 *
 * Runs as srl_readonly. The credential lives in the MAIN CHECKOUT because it is
 * gitignored and a worktree does not receive it; the path is passed rather than
 * the file copied, since a second copy of a production credential is a second
 * thing to rotate and a second thing to leak.
 *
 * `SET default_transaction_read_only = on` runs before the first statement as
 * the second layer. The first layer is the role itself, which holds no
 * INSERT/UPDATE/DELETE anywhere (§13.3 Item 303.3).
 */
import { PrismaClient } from "@prisma/client";
import { resolveCensusCredential } from "./_census-credential";

// Defaults to this backend's own .env.production.readonly (the resolver's
// default). In a WORKTREE that file does not exist — it is gitignored, so
// `git worktree add` never brings it — so pass the main checkout's copy:
//
//   CENSUS_ENV_FILE=/path/to/main/backend/.env.production.readonly npx tsx ...
//
// Passing the path rather than copying the file: a second copy of a production
// credential is a second thing to rotate and a second thing to leak.
const CRED = process.env.CENSUS_ENV_FILE;

function j(v: unknown): string {
  return JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? Number(x) : x), 2);
}

async function main(): Promise<void> {
  const cred = CRED ? resolveCensusCredential(CRED) : resolveCensusCredential();
  console.log(`[census] host : ${cred.host}`);
  console.log(`[census] user : ${cred.user}`);
  console.log("");

  const prisma = new PrismaClient({ datasourceUrl: cred.url });
  try {
    await prisma.$executeRawUnsafe("SET default_transaction_read_only = on");

    // ── C2 ────────────────────────────────────────────────────────────────
    console.log("=== C2  swapped audit_trails rows (entityId = 'status') ===");
    const swapped = await prisma.$queryRawUnsafe<
      Array<{ n: number; first: Date | null; last: Date | null }>
    >(
      `SELECT count(*)::int AS n,
              min("performedAt") AS first,
              max("performedAt") AS last
         FROM audit_trails
        WHERE "entityId" = 'status'`,
    );
    console.log(j(swapped[0]));

    console.log("");
    console.log("=== C2  every entityId that is a bare path segment, not an id ===");
    // A real entityId is a cuid/uuid. A short lowercase word is a path segment
    // that landed in the id column — the same defect wearing different routes.
    const segmentIds = await prisma.$queryRawUnsafe<
      Array<{ entityId: string; n: number; first: Date | null; last: Date | null }>
    >(
      `SELECT "entityId", count(*)::int AS n,
              min("performedAt") AS first, max("performedAt") AS last
         FROM audit_trails
        WHERE "entityId" ~ '^[a-z][a-z-]{1,24}$'
        GROUP BY "entityId"
        ORDER BY n DESC`,
    );
    console.log(j(segmentIds));

    console.log("");
    console.log("=== C2  entityType shapes: id-like vs model-like ===");
    const shapes = await prisma.$queryRawUnsafe<
      Array<{ shape: string; n: number; sample: string }>
    >(
      `SELECT CASE
                WHEN "entityType" ~ '^[A-Z0-9]{20,}$' THEN 'UPPERCASED_ID'
                WHEN "entityType" ~ '^[A-Z_]+$'       THEN 'MODEL_OR_SEGMENT'
                ELSE 'OTHER'
              END AS shape,
              count(*)::int AS n,
              min("entityType") AS sample
         FROM audit_trails
        GROUP BY 1
        ORDER BY n DESC`,
    );
    console.log(j(shapes));

    console.log("");
    console.log("=== C2  distinct entityType values (top 25) ===");
    const types = await prisma.$queryRawUnsafe<Array<{ entityType: string; n: number }>>(
      `SELECT "entityType", count(*)::int AS n
         FROM audit_trails
        GROUP BY "entityType"
        ORDER BY n DESC
        LIMIT 25`,
    );
    console.log(j(types));

    // ── C3 ────────────────────────────────────────────────────────────────
    console.log("");
    console.log("=== C3  SRL-121495 before-image ===");
    const l95 = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT id, "referenceNumber", status, "cancelledAt", "cancelledById",
              "cancellationFaultParty", "cancellationReasonCode", "cancellationReason",
              ("cancellationSnapshot" IS NULL) AS snapshot_is_null,
              "deletedAt", "updatedAt"
         FROM loads
        WHERE "referenceNumber" = 'SRL-121495'`,
    );
    console.log(j(l95));

    console.log("");
    console.log("=== C3  any OTHER load carrying the same contradiction ===");
    // status past the cancel yet still carrying cancellation metadata. Scoping
    // the repair to one load is only defensible if one load is the population.
    const contradictions = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT "referenceNumber", status, "cancelledAt", "cancellationFaultParty"
         FROM loads
        WHERE status NOT IN ('CANCELLED')
          AND ("cancelledAt" IS NOT NULL
               OR "cancelledById" IS NOT NULL
               OR "cancellationFaultParty" IS NOT NULL)
        ORDER BY "cancelledAt" DESC`,
    );
    console.log(j(contradictions));

    // ── R1 ────────────────────────────────────────────────────────────────
    console.log("");
    console.log("=== R1  SRL-121496 state (TONU trace) ===");
    const l96 = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT id, "referenceNumber", status, "cancelledAt", "cancellationFaultParty",
              "cancellationReasonCode", ("cancellationSnapshot" IS NULL) AS snapshot_is_null,
              "tonuFaultSide", "carrierId", "customerRate", "carrierRate"
         FROM loads
        WHERE "referenceNumber" IN ('SRL-121496','SRL-121495')
        ORDER BY "referenceNumber"`,
    );
    console.log(j(l96));

    console.log("");
    console.log("=== R1  TONU accessorial ledger rows, all time ===");
    // snake_case via @map — the same lesson load_activity taught last arc.
    const tonu = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT la.id, l."referenceNumber", la.type, la.amount, la.customer_amount,
              la.billed_to, la.status, la.created_at
         FROM load_accessorials la
         JOIN loads l ON l.id = la.load_id
        WHERE la.type = 'TONU'
        ORDER BY la.created_at DESC`,
    );
    console.log(j(tonu));

    console.log("");
    console.log("=== C2  the WHOLE mis-shaped population, with its date range ===");
    // entityType holding an uppercased id is the middleware's parse reading a
    // mount-relative path. 'status' is one subset of it, not the population.
    const misshaped = await prisma.$queryRawUnsafe<
      Array<{ n: number; first: Date | null; last: Date | null; total: number }>
    >(
      `SELECT count(*) FILTER (WHERE "entityType" ~ '^[A-Z0-9]{20,}$')::int AS n,
              min("performedAt") FILTER (WHERE "entityType" ~ '^[A-Z0-9]{20,}$') AS first,
              max("performedAt") FILTER (WHERE "entityType" ~ '^[A-Z0-9]{20,}$') AS last,
              count(*)::int AS total
         FROM audit_trails`,
    );
    console.log(j(misshaped[0]));

    console.log("");
    console.log("=== transition-log precondition: does the table exist yet? ===");
    const tbl = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'load_status_transitions'
       ) AS exists`,
    );
    console.log(j(tbl[0]));

    console.log("");
    console.log("=== status_machine_counters, current contents ===");
    const smc = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT "fromStatus", "toStatus", count, "firstSeenAt", "lastSeenAt"
         FROM status_machine_counters
        ORDER BY "lastSeenAt" DESC`,
    );
    console.log(j(smc));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
