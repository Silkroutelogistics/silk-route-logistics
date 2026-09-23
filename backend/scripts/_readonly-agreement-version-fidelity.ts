/**
 * READ-ONLY. For every SIGNED carrier agreement in production, can the download
 * route serve the document that was actually signed?
 *
 * WHY THIS EXISTS. GET /agreement/:type/pdf used to resolve the agreement with
 * no version, so it rendered the LIVE body under the signed attestation - one
 * PDF asserting two different versions. v3.8.baf made it version-faithful, and
 * the fix leans on the archive: a signed version that is not archived resolves
 * to the current body, silently, which is the same defect wearing the fix's
 * clothes. The route refuses in that case rather than downgrading.
 *
 * So this answers the operational question that refusal creates: is there any
 * carrier, today, whose signed version would be refused? Run it before bumping
 * either agreement's version, and after archiving one.
 *
 * SELECT only. Loads .env.production.local explicitly per §2.2 and refuses a
 * local host - dotenv.config() does NOT override an already-set DATABASE_URL,
 * and Prisma loads backend/.env first, so a script that uses it silently reads
 * the local container while reporting on "production".
 */

import { applyCensusCredential, announceCensusTarget } from "./_census-credential";

const target = applyCensusCredential();
announceCensusTarget(target, "fidelity");

import { PrismaClient } from "@prisma/client";
import { getAgreement } from "../src/data/agreements";

const prisma = new PrismaClient();

(async () => {

  // Read-only at the SESSION level, not by promise. The header says SELECT
  // only; this is Postgres refusing anything else. The SHOW is the load-bearing
  // half — a SET that silently did not take looks identical to one that did.
  await prisma.$executeRawUnsafe(`SET default_transaction_read_only = on`);
  const ro: any[] = await prisma.$queryRawUnsafe(`SHOW default_transaction_read_only`);
  if (ro[0]?.default_transaction_read_only !== "on") throw new Error("read-only session setting did not take");

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      templateName: string;
      version: string;
      status: string;
      companyName: string;
      has_doc: boolean;
      has_cs: boolean;
    }>
  >(
    `SELECT ca."templateName", ca."version", ca."status", cp."companyName",
            (ca."documentUrl" IS NOT NULL) AS has_doc,
            (ca."counterSignedByName" IS NOT NULL) AS has_cs
       FROM "carrier_agreements" ca
       JOIN "carrier_profiles" cp ON cp."id" = ca."carrierId"
      WHERE ca."status" = 'SIGNED'
      ORDER BY ca."templateName", ca."signedAt"`,
  );

  console.log("SIGNED agreements: " + rows.length);
  let refused = 0;
  for (const r of rows) {
    const resolved = getAgreement(r.templateName, r.version);
    const faithful = !!resolved && resolved.version === r.version;
    if (!faithful) refused++;
    // The stored copy is served first and is the document itself, so a row with
    // one is safe even if its version were unarchived. Both are reported: the
    // archive is what a re-render falls back to when storage cannot be read.
    console.log(
      "  " + (faithful ? "OK  " : "REFUSE ") + r.templateName + " v" + r.version +
      "  | " + r.companyName +
      "  | storedCopy=" + (r.has_doc ? "yes" : "NO") +
      "  | countersign=" + (r.has_cs ? "yes" : "null") +
      (faithful ? "" : "  -> would resolve to v" + (resolved?.version ?? "nothing")),
    );
  }

  console.log(
    refused === 0
      ? "RESULT: every signed version resolves to its own archived body. No carrier is refused."
      : "RESULT: " + refused + " signed row(s) would be REFUSED — archive those versions.",
  );
  await prisma.$disconnect();
  process.exit(refused === 0 ? 0 : 1);
})();
