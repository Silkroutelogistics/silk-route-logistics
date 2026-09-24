/**
 * READ-ONLY row-count gate for migration 20260923234218_add_pickup_appointment.
 *
 * srl_readonly ONLY. Writes nothing — not a row, not a column, not a file
 * outside `out/`. It resolves its credential through `_census-credential.ts`
 * (§303), which refuses `neondb_owner` and any non-Neon host, and it sets
 * `default_transaction_read_only = on` before its first query, so a write is
 * refused by Postgres rather than by the author's discipline.
 *
 * WHY IT EXISTS. Item 212: a gate run AFTER the write answers a question that
 * is no longer answerable. This runs before the PR merges, as the migration's
 * own header requires.
 *
 * STOP CONDITION: already_set > 0 means something began writing
 * deliveryAppointment after the migration was authored, and the UPDATE's WHERE
 * clause is no longer the whole story.
 *
 * Run 2026-09-24 before PR #9 merged: will_move 2, already_set 0, would_skip 0,
 * column absent pre-deploy. PASSED.
 */
import { resolveCensusCredential } from "./_census-credential";
import { PrismaClient } from "@prisma/client";

async function main() {
  const cred = resolveCensusCredential() as any;
  const url: string = typeof cred === "string" ? cred : cred.url;
  console.log(`connected as: ${typeof cred === "string" ? "(string cred)" : cred.user} @ ${typeof cred === "string" ? "?" : cred.host}`);
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    await prisma.$executeRawUnsafe("SET default_transaction_read_only = on");

    const gate = await prisma.$queryRawUnsafe<
      { will_move: bigint; already_set: bigint; would_skip: bigint }[]
    >(`
      SELECT COUNT(*) FILTER (WHERE "appointmentNumber" IS NOT NULL)   AS will_move,
             COUNT(*) FILTER (WHERE "deliveryAppointment" IS NOT NULL) AS already_set,
             COUNT(*) FILTER (WHERE "appointmentNumber" IS NOT NULL
                               AND  "deliveryAppointment" IS NOT NULL) AS would_skip
      FROM loads WHERE "deletedAt" IS NULL
    `);

    const g = gate[0];
    const willMove = Number(g.will_move);
    const alreadySet = Number(g.already_set);
    const wouldSkip = Number(g.would_skip);

    console.log(`will_move   = ${willMove}   (authored: 2)`);
    console.log(`already_set = ${alreadySet}   (authored: 0)  <-- STOP if > 0`);
    console.log(`would_skip  = ${wouldSkip}   (authored: 0)`);

    // Does the column already exist? If it does, the migration has already run.
    const col = await prisma.$queryRawUnsafe<{ column_name: string }[]>(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'loads' AND column_name = 'pickupAppointment'
    `);
    console.log(`pickupAppointment column present BEFORE deploy: ${col.length > 0}`);

    const rows = await prisma.$queryRawUnsafe<
      { loadNumber: string | null; appointmentNumber: string | null }[]
    >(`
      SELECT "loadNumber", "appointmentNumber" FROM loads
      WHERE "appointmentNumber" IS NOT NULL AND "deletedAt" IS NULL
      ORDER BY "loadNumber"
    `);
    console.log(`rows that will move: ${rows.map((r) => `${r.loadNumber}=${r.appointmentNumber}`).join(", ")}`);

    console.log(alreadySet === 0 ? "\nGATE PASSES — safe to deploy." : "\nGATE FAILS — STOP.");
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
