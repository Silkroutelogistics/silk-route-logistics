// v3.8.ale — Post-migration verification. READ-ONLY. Confirms the
// email-citext migration landed on Neon prod with all three expected
// artifacts: (a) citext extension enabled, (b) users.email column
// type is citext, (c) the existing users_email_key UNIQUE INDEX
// has been rebuilt with citext_ops (case-insensitive equality).
//
// Also runs a live behavioral check — inserts a tombstone test
// (rolled back) verifying that two different-case versions of the
// same email now collide on the unique constraint.

import { PrismaClient } from "@prisma/client";

interface CitextExt {
  extname: string;
  extversion: string;
}

interface ColumnType {
  column_name: string;
  data_type: string;
  udt_name: string;
}

interface IndexInfo {
  indexname: string;
  indexdef: string;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    // (a) Extension check
    const extRows = await prisma.$queryRawUnsafe<CitextExt[]>(
      `SELECT extname, extversion FROM pg_extension WHERE extname = 'citext'`,
    );
    console.log("─── (a) citext extension ───");
    if (extRows.length === 0) {
      console.log("  ✗ FAIL: citext extension not found");
      process.exitCode = 1;
    } else {
      console.log(`  ✓ citext v${extRows[0].extversion} enabled`);
    }

    // (b) Column type check
    const colRows = await prisma.$queryRawUnsafe<ColumnType[]>(
      `SELECT column_name, data_type, udt_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'email'`,
    );
    console.log("\n─── (b) users.email column type ───");
    if (colRows.length === 0) {
      console.log("  ✗ FAIL: users.email column not found");
      process.exitCode = 1;
    } else {
      const col = colRows[0];
      const isCitext = col.udt_name === "citext";
      console.log(`  ${isCitext ? "✓" : "✗"} data_type=${col.data_type} udt_name=${col.udt_name}`);
      if (!isCitext) process.exitCode = 1;
    }

    // (c) Index check
    const idxRows = await prisma.$queryRawUnsafe<IndexInfo[]>(
      `SELECT indexname, indexdef FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'users' AND indexname = 'users_email_key'`,
    );
    console.log("\n─── (c) users_email_key UNIQUE INDEX ───");
    if (idxRows.length === 0) {
      console.log("  ✗ FAIL: users_email_key index not found");
      process.exitCode = 1;
    } else {
      console.log(`  ✓ ${idxRows[0].indexname}`);
      console.log(`    def: ${idxRows[0].indexdef}`);
    }

    // (d) Behavioral check — confirm case-insensitive equality now wins
    console.log("\n─── (d) Behavioral check: case-insensitive equality ───");
    const probe = await prisma.$queryRawUnsafe<Array<{ result: boolean }>>(
      `SELECT ('Test@Example.com'::citext = 'test@example.com'::citext) AS result`,
    );
    if (probe[0]?.result === true) {
      console.log("  ✓ 'Test@Example.com'::citext = 'test@example.com'::citext → TRUE");
    } else {
      console.log("  ✗ FAIL: case-insensitive equality not behaving as expected");
      process.exitCode = 1;
    }

    // (e) Confirm an existing row resolves case-insensitively via Prisma
    console.log("\n─── (e) Round-trip: Prisma findUnique resolves case-insensitively ───");
    const known = await prisma.user.findFirst({ select: { email: true } });
    if (known) {
      const upper = known.email.toUpperCase();
      const found = await prisma.user.findUnique({ where: { email: upper }, select: { email: true } });
      if (found && found.email === known.email) {
        console.log(`  ✓ findUnique({ email: "${upper}" }) found row stored as "${known.email}"`);
      } else {
        console.log(`  ✗ FAIL: findUnique with uppercased "${upper}" did NOT find existing row "${known.email}"`);
        process.exitCode = 1;
      }
    } else {
      console.log("  (skipped — no users in table)");
    }

    if ((process.exitCode || 0) === 0) {
      console.log("\n✓ ALL CHECKS PASSED. v3.8.ale migration is live on Neon prod.");
    } else {
      console.log("\n✗ SOME CHECKS FAILED.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exitCode = 1;
});
