/**
 * READ-ONLY production census for Task E4 (3/3): every `documents` row whose
 * docType is the bare `BOL`.
 *
 * The carrier Documents dropdown drops "Bill of Lading" (bare BOL) in favour
 * of the ruling-6 vocabulary — the original BOL is the AE's pre-dispatch
 * attachment, and what a carrier hands in is a SIGNED copy (SIGNED_BOL_PU /
 * SIGNED_BOL_DEL). Rows already stored as bare BOL are LEFT UNTOUCHED, by
 * ruling; this script reports them so the owner can see what the old option
 * produced and decide, per row, whether any is really a signed copy.
 *
 * NO WRITES, BY CONSTRUCTION. Loads `.env.production.local` the way
 * `prisma:status:production` does, refuses a local host or a rail breach, and
 * sets `default_transaction_read_only = on` on the session before the first
 * query, so a write would be refused by Postgres rather than by discipline.
 *
 * Prints NO part of any connection string. The host is not needed to read
 * the result and is not shown.
 *
 * Run:  npx tsx scripts/_readonly-bare-bol-census.ts
 */
import { PrismaClient } from "@prisma/client";
import { resolveCensusCredential, announceCensusTarget } from "./_census-credential";

const target = resolveCensusCredential();
const url = target.url;
announceCensusTarget(target, "census");
console.log(`[census] mode   : READ ONLY (role cannot write; session setting is the second layer)
`);

async function main() {
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    await prisma.$executeRawUnsafe(`SET default_transaction_read_only = on`);
    const ro: any[] = await prisma.$queryRawUnsafe(`SHOW default_transaction_read_only`);
    if (ro[0]?.default_transaction_read_only !== "on") throw new Error("read-only session setting did not take");

    const rows: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        d.id, d."fileName", d."docType", d.status, d.upload_source AS "uploadSource",
        d."createdAt", d."entityType", d."entityId",
        l."referenceNumber" AS "loadRef", l."loadNumber", l.status AS "loadStatus",
        u.role AS "uploaderRole"
      FROM documents d
      LEFT JOIN loads l ON l.id = d."loadId"
      LEFT JOIN users u ON u.id = d."userId"
      WHERE d."docType" = 'BOL'
      ORDER BY d."createdAt";
    `);

    console.log(`bare BOL rows: ${rows.length}\n`);
    for (const r of rows) {
      console.log(
        `  ${r.id}  ${new Date(r.createdAt).toISOString().slice(0, 19)}Z  src=${r.uploadSource}  by=${r.uploaderRole ?? "?"}  ` +
        `status=${r.status}  load=${r.loadNumber ?? r.loadRef ?? "(none)"}/${r.loadStatus ?? "-"}  file=${r.fileName}`,
      );
    }
    const bySource: Record<string, number> = {};
    for (const r of rows) bySource[r.uploadSource] = (bySource[r.uploadSource] ?? 0) + 1;
    console.log("\nby uploadSource:", JSON.stringify(bySource));

    // For contrast: does anything already use the signed vocabulary?
    const signed: any[] = await prisma.$queryRawUnsafe(`
      SELECT d."docType", COUNT(*)::int AS n FROM documents d
      WHERE d."docType" IN ('SIGNED_BOL_PU','SIGNED_BOL_DEL','POD','INVOICE','TEMP_LOG','RECEIPT_LUMPER','RECEIPT_SCALE')
      GROUP BY d."docType" ORDER BY d."docType";
    `);
    console.log("paperwork-vocabulary rows:", signed.length ? JSON.stringify(signed) : "none");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e?.message ?? e); process.exit(1); });
