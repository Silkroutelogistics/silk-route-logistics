// Real-artifact verification for the backup-code hardening (§19 Sub-pattern 16).
//
// The unit tests mock encrypt/decrypt, which is right for asserting the CONTENT
// of the envelope but means they never exercise the real crypto path. This runs
// the actual generateTotpSetup against a real database with the real
// encryption, then reads the raw column back and greps it for the plaintext
// codes that were handed out.
//
// A fixture proves the logic. Only this proves the aim.
//
// Local container only:
//   DATABASE_URL=postgresql://srl:srl_local_dev@localhost:5433/srl_e2e \
//   ENCRYPTION_KEY=... npx tsx scripts/_smoke-backup-codes.ts

import { prisma } from "../src/config/database";
import { generateTotpSetup, verifyTotpCode } from "../src/services/totpService";

async function main() {
  const url = process.env.DATABASE_URL || "";
  if (!url.includes("localhost") && !url.includes("127.0.0.1")) {
    throw new Error("Refusing to run against a non-local database");
  }

  const suffix = Date.now().toString().slice(-8);
  const user = await prisma.user.create({
    data: {
      email: `totp-smoke-${suffix}@srl.invalid`,
      passwordHash: "x",
      firstName: "Totp",
      lastName: "Smoke",
      role: "CARRIER",
    },
  });

  try {
    const { backupCodes } = await generateTotpSetup(user.id, user.email);
    console.log("codes issued:", backupCodes.length);

    // Read the RAW column, bypassing the application layer entirely.
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT "totpBackupCodes" AS v FROM users WHERE id = $1;`,
      user.id,
    );
    const rawColumn: string = rows[0].v;

    // THE decisive check: is any issued code recoverable from what was stored?
    const leaked = backupCodes.filter((c) => rawColumn.toUpperCase().includes(c.toUpperCase()));
    console.log("codes appearing verbatim in the stored column:", leaked.length);
    if (leaked.length) {
      console.error("FAIL — plaintext code found at rest:", leaked);
      process.exitCode = 1;
      return;
    }

    // And the codes still work, with the real crypto in the path.
    const first = await verifyTotpCode(user.id, backupCodes[0]);
    console.log("first use accepted:", first);
    const second = await verifyTotpCode(user.id, backupCodes[0]);
    console.log("SAME code reused accepted (must be false):", second);

    const ok = first === true && second === false;
    console.log(ok ? "\nPASS — hashed at rest, consumed once, real crypto path" : "\nFAIL");
    if (!ok) process.exitCode = 1;
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("SMOKE FAILED:", e?.message || e);
  process.exit(1);
});
