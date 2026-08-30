/**
 * READ-ONLY preflight for the verification-carry-forward arc.
 *
 * Answers the one question that decides whether the avb code is live or inert
 * in production: are the three OnboardingDraft geo columns actually there, and
 * is their migration in the ledger?
 *
 * Reads only. No writes, no DDL. Safe against production.
 *
 *   npx tsx scripts/_readonly-arc-avg-preflight.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const host = (process.env.DATABASE_URL || "").match(/@([^/?]+)/)?.[1] ?? "(unknown)";
  console.log(`target host: ${host}\n`);

  const MIGRATION = "20260830120000_add_draft_verification_geo";
  const ledger = await prisma.$queryRawUnsafe<Array<{
    migration_name: string; finished_at: Date | null; rolled_back_at: Date | null;
  }>>(
    `SELECT migration_name, finished_at, rolled_back_at
       FROM _prisma_migrations WHERE migration_name = $1`,
    MIGRATION
  );
  console.log(`── ledger: ${MIGRATION}`);
  if (ledger.length === 0) {
    console.log("   ✗ NO ROW — migration has never been applied here.\n");
  } else {
    console.log(`   ✓ applied @ ${ledger[0].finished_at?.toISOString()}`);
    console.log(`     rolled_back: ${ledger[0].rolled_back_at ? "YES" : "no"}\n`);
  }

  const cols = await prisma.$queryRawUnsafe<Array<{ column_name: string; data_type: string }>>(
    `SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'onboarding_drafts'
        AND column_name IN ('verifiedFromIp','verifiedFromCountry','verifiedUserAgent')
      ORDER BY column_name`
  );
  console.log("── onboarding_drafts geo columns");
  if (cols.length === 0) console.log("   ✗ ABSENT — the avb carry-forward is inert in this database.");
  for (const c of cols) console.log(`   ✓ ${c.column_name} (${c.data_type})`);

  const userCols = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users'
        AND column_name IN ('emailVerifiedAt','emailVerifiedFromIp','emailVerifiedFromCountry')
      ORDER BY column_name`
  );
  console.log("\n── users verification columns (carry-forward target)");
  for (const c of userCols) console.log(`   ✓ ${c.column_name}`);
  if (userCols.length < 3) console.log("   ✗ one or more ABSENT");

  // Population, so nobody reads an empty panel as a defect.
  const drafts = await prisma.onboardingDraft.count();
  const verified = await prisma.onboardingDraft.count({ where: { verifiedAt: { not: null } } });
  const withGeo = await prisma.onboardingDraft.count({ where: { verifiedFromIp: { not: null } } });
  const carriers = await prisma.user.count({ where: { role: "CARRIER" } });
  const carriersWithProof = await prisma.user.count({
    where: { role: "CARRIER", emailVerifiedAt: { not: null } },
  });
  const authEvents = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT COUNT(*)::bigint AS n FROM auth_events`
  ).catch(() => [{ n: BigInt(-1) }]);

  console.log("\n── population");
  console.log(`   onboarding drafts: ${drafts}  (verified: ${verified}, with geo: ${withGeo})`);
  console.log(`   CARRIER users: ${carriers}  (with emailVerifiedAt: ${carriersWithProof})`);
  console.log(`   auth_events rows: ${authEvents[0].n === BigInt(-1) ? "(table absent)" : authEvents[0].n}`);
}

main()
  .catch((e) => { console.error("preflight failed:", e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
