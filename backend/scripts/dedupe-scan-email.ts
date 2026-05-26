// v3.8.ale — Pre-migration dedupe scan. READ-ONLY. Reports any
// case-duplicate email rows in the production `users` table before
// we apply the case-insensitive UNIQUE INDEX. If this returns any
// rows, the migration MUST halt — manual resolution required (merges
// are destructive and need a human decision).
//
// Run: cd backend && npx ts-node scripts/dedupe-scan-email.ts

import { PrismaClient } from "@prisma/client";

interface DupeGroup {
  e: string;
  c: bigint;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRawUnsafe<DupeGroup[]>(
      `SELECT LOWER(TRIM(email)) AS e, COUNT(*)::bigint AS c
       FROM users
       GROUP BY LOWER(TRIM(email))
       HAVING COUNT(*) > 1
       ORDER BY c DESC`,
    );
    if (rows.length === 0) {
      console.log("CLEAN: zero case-duplicate email rows in production users table.");
      console.log("Safe to apply the case-insensitive UNIQUE INDEX migration.");
      return;
    }
    console.log(`HALT: found ${rows.length} case-duplicate group(s):`);
    for (const row of rows) {
      const examples = await prisma.$queryRawUnsafe<Array<{ id: string; email: string; role: string; createdAt: Date }>>(
        `SELECT id, email, role, "createdAt" FROM users WHERE LOWER(TRIM(email)) = $1 ORDER BY "createdAt"`,
        row.e,
      );
      console.log(`\n  ${row.e} — ${row.c} rows:`);
      for (const ex of examples) {
        console.log(`    id=${ex.id} email=${ex.email} role=${ex.role} createdAt=${ex.createdAt.toISOString()}`);
      }
    }
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exitCode = 1;
});
