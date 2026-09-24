/**
 * READ-ONLY post-deploy verification for migration 20260923234218.
 *
 * srl_readonly ONLY. Writes nothing — not a row, not a column, not a file
 * outside `out/`. It resolves its credential through `_census-credential.ts`
 * (§303), which refuses `neondb_owner` and any non-Neon host, and it sets
 * `default_transaction_read_only = on` before its first query, so a write is
 * refused by Postgres rather than by the author's discipline.
 *
 * WHAT IT ASSERTS. That the column landed, that the ledger records the
 * migration as finished and not rolled back, and — the half that matters —
 * that the backfill moved the two appointments to the delivery side WITHOUT
 * clearing the legacy `appointmentNumber` and without inventing a pickup
 * appointment for a load that never had one.
 *
 * Run 2026-09-24 after c5a0b1be deployed: column present, ledger finished at
 * 01:40:13.729Z with 0 failed/pending, SRL-121497 and SRL-121493 both keep
 * their legacy value, pickupAppointment null on every live load.
 */
import { resolveCensusCredential } from "./_census-credential";
import { PrismaClient } from "@prisma/client";

async function main() {
  const cred = resolveCensusCredential() as any;
  const url: string = typeof cred === "string" ? cred : cred.url;
  console.log(`connected as: ${cred.user} @ ${cred.host}\n`);
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    await prisma.$executeRawUnsafe("SET default_transaction_read_only = on");

    const col = await prisma.$queryRawUnsafe<{ column_name: string; data_type: string; is_nullable: string }[]>(`
      SELECT column_name, data_type, is_nullable FROM information_schema.columns
      WHERE table_name = 'loads' AND column_name IN ('pickupAppointment','deliveryAppointment','appointmentNumber')
      ORDER BY column_name
    `);
    console.log("--- columns on loads ---");
    col.forEach((c) => console.log(`  ${c.column_name.padEnd(22)} ${c.data_type} nullable=${c.is_nullable}`));
    console.log(`  pickupAppointment PRESENT: ${col.some((c) => c.column_name === "pickupAppointment")}`);

    const mig = await prisma.$queryRawUnsafe<
      { migration_name: string; finished_at: Date | null; applied_steps_count: number; rolled_back_at: Date | null }[]
    >(`
      SELECT migration_name, finished_at, applied_steps_count, rolled_back_at
      FROM _prisma_migrations WHERE migration_name = '20260923234218_add_pickup_appointment'
    `);
    console.log("\n--- migration ledger ---");
    mig.forEach((m) =>
      console.log(`  ${m.migration_name}\n    finished_at=${m.finished_at?.toISOString()} steps=${m.applied_steps_count} rolled_back=${m.rolled_back_at ?? "null"}`),
    );

    const fails = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT COUNT(*) AS n FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL`,
    );
    console.log(`  failed/pending migrations on this database: ${Number(fails[0].n)}`);

    const loads = await prisma.$queryRawUnsafe<any[]>(`
      SELECT "loadNumber", "srlBolNumber", "appointmentNumber", "deliveryAppointment",
             "pickupAppointment", "pickupDate", "deliveryDate", status, "updatedAt"
      FROM loads WHERE "loadNumber" IN ('SRL-121497','SRL-121493') ORDER BY "loadNumber"
    `);
    console.log("\n--- the two loads the migration touched ---");
    loads.forEach((l) => {
      console.log(`  ${l.loadNumber}  srlBol=${l.srlBolNumber}  status=${l.status}`);
      console.log(`    appointmentNumber (legacy, preserved) = ${JSON.stringify(l.appointmentNumber)}`);
      console.log(`    deliveryAppointment (backfilled)      = ${JSON.stringify(l.deliveryAppointment)}`);
      console.log(`    pickupAppointment (new column)        = ${JSON.stringify(l.pickupAppointment)}`);
      console.log(`    pickupDate=${l.pickupDate?.toISOString()} deliveryDate=${l.deliveryDate?.toISOString()}`);
    });

    const counts = await prisma.$queryRawUnsafe<any[]>(`
      SELECT COUNT(*) FILTER (WHERE "appointmentNumber" IS NOT NULL)  AS legacy_kept,
             COUNT(*) FILTER (WHERE "deliveryAppointment" IS NOT NULL) AS delivery_set,
             COUNT(*) FILTER (WHERE "pickupAppointment" IS NOT NULL)   AS pickup_set,
             COUNT(*) AS total
      FROM loads WHERE "deletedAt" IS NULL
    `);
    const c = counts[0];
    console.log("\n--- post-deploy counts (live loads) ---");
    console.log(`  total=${c.total}  legacy appointmentNumber kept=${c.legacy_kept}  deliveryAppointment set=${c.delivery_set}  pickupAppointment set=${c.pickup_set}`);
    console.log(`  legacy column NOT cleared: ${Number(c.legacy_kept) === 2}`);
    console.log(`  backfill moved both:       ${Number(c.delivery_set) === 2}`);
    console.log(`  no pickup appt invented:   ${Number(c.pickup_set) === 0}`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
