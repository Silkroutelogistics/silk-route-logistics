/**
 * B2 PHASE A — read-only production census (2026-09-20).
 *
 * Question: does the population the new absolute CARRIER_NOT_APPROVED would
 * refuse EXIST today, and is anything live pointed at it?
 *   1. carriers by onboardingStatus × executed BCA × archived × test
 *   2. the non-APPROVED carriers that hold an executed broker-carrier agreement
 *      (the only population the gate's status gap can reach — sign-bca refuses
 *      non-APPROVED, so these arose from a status move AFTER signing)
 *   3. live tenders (OFFERED/COUNTERED/ACCEPTED/RC_SENT/CONFIRMED) whose carrier
 *      is non-APPROVED or archived
 *   4. in-flight loads whose assigned carrier is non-APPROVED or archived
 *   5. active blanket overrides (checkCode IS NULL) and the status of the
 *      carrier each covers — a blanket override releases SUSPENDED/REJECTED today
 *   6. queued/tendered waterfall positions on a non-APPROVED or archived carrier
 *
 * NO WRITES, BY CONSTRUCTION: loads `.env.production.local` the way
 * prisma:status:production does and sets default_transaction_read_only = on on
 * the session before the first query. PROD_ENV_FILE may point at the file when
 * this script runs from a worktree that has no copy of it.
 */
import { PrismaClient } from "@prisma/client";
import { resolveCensusCredential, announceCensusTarget } from "./_census-credential";

const target = resolveCensusCredential();
const url = target.url;
announceCensusTarget(target, "census");
console.log(`[census] mode   : READ ONLY (role cannot write; session setting is the second layer)
`);

const n = (v: unknown) => (typeof v === "bigint" ? Number(v) : v);
const table = (rows: any[]) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, n(v)])));

async function main() {
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    await prisma.$executeRawUnsafe(`SET default_transaction_read_only = on`);
    const ro: any[] = await prisma.$queryRawUnsafe(`SHOW default_transaction_read_only`);
    if (ro[0]?.default_transaction_read_only !== "on") throw new Error("read-only session setting did not take");

    console.log("[1] carriers by onboardingStatus × executed BCA × archived × test");
    console.table(table(await prisma.$queryRawUnsafe(`
      SELECT cp."onboardingStatus" AS status, cp.status AS "appStatus",
             (cp."deletedAt" IS NOT NULL) AS archived, cp."isTestAccount" AS test,
             EXISTS (SELECT 1 FROM carrier_agreements a WHERE a."carrierId" = cp.id AND a.status = 'SIGNED' AND a."templateName" = 'broker-carrier') AS "hasBca",
             COUNT(*)::int AS carriers
      FROM carrier_profiles cp
      GROUP BY 1,2,3,4,5 ORDER BY 1,2,3,4,5;`)));

    console.log("\n[2] non-APPROVED carriers holding an executed broker-carrier agreement (the population the status gap can reach)");
    console.table(table(await prisma.$queryRawUnsafe(`
      SELECT cp."companyName", cp."mcNumber", cp."onboardingStatus" AS status, cp.status AS "appStatus",
             (cp."deletedAt" IS NOT NULL) AS archived, cp."isTestAccount" AS test, cp."approvedAt", cp."updatedAt",
             (SELECT MAX(a."signedAt") FROM carrier_agreements a WHERE a."carrierId" = cp.id AND a.status='SIGNED' AND a."templateName"='broker-carrier') AS "bcaSignedAt"
      FROM carrier_profiles cp
      WHERE cp."onboardingStatus" <> 'APPROVED'
        AND EXISTS (SELECT 1 FROM carrier_agreements a WHERE a."carrierId" = cp.id AND a.status = 'SIGNED' AND a."templateName" = 'broker-carrier')
      ORDER BY cp."updatedAt" DESC;`)));

    console.log("\n[3] live tenders whose carrier is non-APPROVED or archived");
    console.table(table(await prisma.$queryRawUnsafe(`
      SELECT t.status, cp."onboardingStatus" AS "carrierStatus", (cp."deletedAt" IS NOT NULL) AS archived, cp."isTestAccount" AS test, COUNT(*)::int AS tenders
      FROM load_tenders t JOIN carrier_profiles cp ON cp.id = t."carrierId"
      WHERE t.status IN ('OFFERED','COUNTERED','ACCEPTED','RC_SENT','CONFIRMED') AND t."deletedAt" IS NULL
        AND (cp."onboardingStatus" <> 'APPROVED' OR cp."deletedAt" IS NOT NULL)
      GROUP BY 1,2,3,4 ORDER BY 1,2;`)));

    console.log("\n[4] in-flight loads (pre-POD statuses) whose assigned carrier is non-APPROVED or archived");
    console.table(table(await prisma.$queryRawUnsafe(`
      SELECT l.status AS "loadStatus", cp."onboardingStatus" AS "carrierStatus", (cp."deletedAt" IS NOT NULL) AS archived, cp."isTestAccount" AS test, COUNT(*)::int AS loads
      FROM loads l JOIN carrier_profiles cp ON cp."userId" = l."carrierId"
      WHERE l."deletedAt" IS NULL AND l."carrierId" IS NOT NULL
        AND l.status IN ('TENDERED','CONFIRMED','BOOKED','DISPATCHED','AT_PICKUP','LOADED','PICKED_UP','IN_TRANSIT','AT_DELIVERY','DELIVERED')
        AND (cp."onboardingStatus" <> 'APPROVED' OR cp."deletedAt" IS NOT NULL)
      GROUP BY 1,2,3,4 ORDER BY 1,2;`)));

    console.log("\n[5] active compliance overrides and the status of the carrier each covers (checkCode NULL = blanket)");
    console.table(table(await prisma.$queryRawUnsafe(`
      SELECT o."checkCode", cp."companyName", cp."onboardingStatus" AS "carrierStatus", (cp."deletedAt" IS NOT NULL) AS archived, cp."isTestAccount" AS test, o."expiresAt"
      FROM compliance_overrides o JOIN carrier_profiles cp ON cp.id = o."carrierId"
      WHERE o."expiresAt" > NOW()
      ORDER BY o."expiresAt";`)));

    console.log("\n[6] queued/tendered waterfall positions on a non-APPROVED or archived carrier");
    console.table(table(await prisma.$queryRawUnsafe(`
      SELECT p.status, cp."onboardingStatus" AS "carrierStatus", (cp."deletedAt" IS NOT NULL) AS archived, cp."isTestAccount" AS test, COUNT(*)::int AS positions
      FROM waterfall_positions p JOIN carrier_profiles cp ON cp."userId" = p.carrier_id
      WHERE p.status IN ('queued','tendered') AND (cp."onboardingStatus" <> 'APPROVED' OR cp."deletedAt" IS NOT NULL)
      GROUP BY 1,2,3,4 ORDER BY 1,2;`)));
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
