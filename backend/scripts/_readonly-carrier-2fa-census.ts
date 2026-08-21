// READ-ONLY census for the mandatory-2FA migration decision. SELECT only.
//
// B1-ENFORCEMENT must not deploy before it is known how many real carriers a
// forced migration would hit, and whether the notification email is needed at
// all. "Pre-revenue, small count" is an assumption until it is a number.

import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  try {
    const rows: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        count(*)                                             AS carrier_users,
        count(*) FILTER (WHERE u."totpEnabled")              AS totp_enabled,
        count(*) FILTER (WHERE u."isActive")                 AS active,
        count(*) FILTER (WHERE u."emailVerifiedAt" IS NOT NULL) AS email_verified,
        count(*) FILTER (WHERE u."lastLogin" IS NOT NULL)    AS has_logged_in
      FROM users u
      WHERE u.role = 'CARRIER';
    `);
    console.log("CARRIER users:", JSON.stringify(rows[0], (_k, v) => (typeof v === "bigint" ? Number(v) : v)));

    const profiles: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        count(*)                                                   AS profiles,
        count(*) FILTER (WHERE "onboardingStatus" = 'APPROVED')     AS approved,
        count(*) FILTER (WHERE "isTestAccount")                     AS test_accounts,
        count(*) FILTER (WHERE "onboardingStatus" = 'APPROVED' AND NOT "isTestAccount") AS approved_real
      FROM carrier_profiles;
    `);
    console.log("carrier_profiles:", JSON.stringify(profiles[0], (_k, v) => (typeof v === "bigint" ? Number(v) : v)));

    // The population a forced migration actually hits: a real, approved carrier
    // who has logged in at least once.
    const affected: any[] = await prisma.$queryRawUnsafe(`
      SELECT u.email, u."lastLogin", u."totpEnabled", cp."companyName", cp."onboardingStatus"
      FROM users u
      JOIN carrier_profiles cp ON cp."userId" = u.id
      WHERE u.role = 'CARRIER'
        AND u."isActive"
        AND NOT cp."isTestAccount"
      ORDER BY u."lastLogin" DESC NULLS LAST;
    `);
    console.log("\nreal active carriers (" + affected.length + "):");
    for (const a of affected) {
      console.log(`  ${a.companyName ?? "(no name)"} · ${a.onboardingStatus} · totp=${a.totpEnabled} · lastLogin=${a.lastLogin ? new Date(a.lastLogin).toISOString().slice(0, 10) : "never"}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("CENSUS FAILED:", e?.message || e);
  process.exit(1);
});
