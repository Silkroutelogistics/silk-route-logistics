// v3.8.alf — Read-only inspection of _prisma_migrations on Neon prod.
// Reports the most recent N migrations + checks whether the v3.8.ale
// email-citext migration has a ledger row. Used by Step 1(c) of the
// ledger reconciliation sprint.

import { PrismaClient } from "@prisma/client";

interface MigrationRow {
  id: string;
  checksum: string;
  finished_at: Date | null;
  migration_name: string;
  logs: string | null;
  rolled_back_at: Date | null;
  started_at: Date;
  applied_steps_count: number;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const total = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count FROM _prisma_migrations`,
    );
    console.log(`Total ledger rows: ${total[0].count.toString()}`);

    const recent = await prisma.$queryRawUnsafe<MigrationRow[]>(
      `SELECT id, migration_name, started_at, finished_at, rolled_back_at, applied_steps_count
       FROM _prisma_migrations
       ORDER BY started_at DESC
       LIMIT 10`,
    );
    console.log("\n─── Most recent 10 ledger rows ───");
    for (const m of recent) {
      const status = m.rolled_back_at
        ? "ROLLED_BACK"
        : m.finished_at
          ? "APPLIED"
          : "PENDING/RUNNING";
      console.log(`  ${m.migration_name} → ${status} @ ${(m.finished_at || m.started_at).toISOString()}`);
    }

    const target = "20260526164943_email_citext";
    const aleRow = await prisma.$queryRawUnsafe<MigrationRow[]>(
      `SELECT id, migration_name, started_at, finished_at, rolled_back_at, applied_steps_count
       FROM _prisma_migrations
       WHERE migration_name = $1`,
      target,
    );
    console.log(`\n─── v3.8.ale email-citext ledger ───`);
    if (aleRow.length === 0) {
      console.log(`  ✗ NOT RECORDED: no row for ${target}`);
      console.log(`    → Next prisma migrate deploy will see it as PENDING + try to re-apply.`);
      console.log(`    → Migration SQL is idempotent (CREATE EXTENSION IF NOT EXISTS + ALTER COLUMN TYPE on already-citext), so re-apply will succeed but the ledger needs reconciling.`);
    } else {
      const r = aleRow[0];
      console.log(`  ✓ ROW EXISTS: id=${r.id}`);
      console.log(`    started_at=${r.started_at.toISOString()}`);
      console.log(`    finished_at=${r.finished_at?.toISOString() || "(null — never finished)"}`);
      console.log(`    rolled_back_at=${r.rolled_back_at?.toISOString() || "(not rolled back)"}`);
      console.log(`    applied_steps_count=${r.applied_steps_count}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exitCode = 1;
});
