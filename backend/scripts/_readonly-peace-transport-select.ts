/**
 * READ-ONLY production lookup for the lifecycle-gaps audit (2026-09-18).
 * One SELECT, approved verbatim in Phase B. Same rail as
 * _readonly-document-upload-census.ts: loads .env.production.local explicitly,
 * refuses a local host, refuses a rail breach, sets the session read-only
 * before the first query so a write is refused by Postgres, not by discipline.
 */
import { PrismaClient } from "@prisma/client";
import { resolveCensusCredential, announceCensusTarget } from "./_census-credential";

const target = resolveCensusCredential();
const url = target.url;
announceCensusTarget(target, "select");
console.log(`[select] mode   : READ ONLY (role cannot write; session setting is the second layer)
`);

async function main() {
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    await prisma.$executeRawUnsafe(`SET default_transaction_read_only = on`);
    const ro: any[] = await prisma.$queryRawUnsafe(`SHOW default_transaction_read_only`);
    if (ro[0]?.default_transaction_read_only !== "on") throw new Error("read-only did not take");
    console.log(`[select] mode            : READ ONLY confirmed\n`);
    const rows: any[] = await prisma.$queryRawUnsafe(`
      SELECT l."loadNumber", l.status AS load_status, l."carrierId", l."cancellationReason", l."deletedAt",
             t.status AS tender_status, t."statusReason", t."respondedAt", t."deletedAt" AS tender_deleted,
             rc.status AS rc_status, (rc."signTokenHash" IS NOT NULL) AS rc_still_signable,
             (SELECT count(*) FROM check_call_schedules s WHERE s."loadId" = l.id) AS schedules,
             (SELECT count(*) FROM fall_off_events f WHERE f."loadId" = l.id) AS fall_offs
      FROM load_tenders t
      JOIN loads l ON l.id = t."loadId"
      JOIN carrier_profiles cp ON cp.id = t."carrierId"
      LEFT JOIN rate_confirmations rc ON rc."loadId" = l.id
      WHERE cp."mcNumber" ILIKE '%99226'
      ORDER BY t."createdAt" DESC`);
    console.log(`rows: ${rows.length}`);
    for (const r of rows) console.log(JSON.stringify(r, (_k, v) => (typeof v === "bigint" ? Number(v) : v)));
  } finally { await prisma.$disconnect(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
