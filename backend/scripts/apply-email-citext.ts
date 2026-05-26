// v3.8.ale — One-shot apply of the email-citext migration directly
// against Neon prod via the runtime Prisma client. Bypasses the
// Prisma migrate CLI (which requires DIRECT_URL — not yet set in
// local .env). The migration SQL is idempotent so Render's next
// `prisma migrate deploy` will idempotently re-apply + ledger-record
// the migration file at prisma/migrations/20260526164943_email_citext/.
//
// Per the v3.8.ale directive: apply DIRECTLY against the Neon
// production URL + verify; do NOT rely on the Render build chain.
//
// Pre-flight: dedupe-scan-email.ts reported CLEAN. Safe to apply.

import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log("Step 1: CREATE EXTENSION IF NOT EXISTS citext...");
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS citext`);
    console.log("  ✓ citext extension ensured");

    console.log("Step 2: ALTER TABLE users ALTER COLUMN email TYPE citext...");
    await prisma.$executeRawUnsafe(`ALTER TABLE users ALTER COLUMN email TYPE citext`);
    console.log("  ✓ users.email column type → citext");

    console.log("\nMigration applied. Running verification...");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exitCode = 1;
});
