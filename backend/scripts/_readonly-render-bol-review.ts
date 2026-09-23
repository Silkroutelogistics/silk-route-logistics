/**
 * REVIEW RENDER ONLY — renders a load's BOL and RC so a human can look at them.
 *
 * TWO CLAIMS, BOTH ADVERSARIALLY VERIFIED BEFORE THIS FILE WAS COMMITTED
 * (three independent reviewers, each prompted to refute; none could):
 *
 *   1. IT CONNECTS ONLY AS srl_readonly. applyCensusCredential() resolves
 *      backend/.env.production.readonly and OVERWRITES process.env.DATABASE_URL
 *      and DIRECT_URL unconditionally. Its guards are positive, not merely
 *      "not localhost": the host must END IN neon.tech and the user must NOT be
 *      neondb_owner, and a failure calls process.exit(1) rather than falling
 *      back. The role itself holds SELECT and no INSERT/UPDATE/DELETE, so a
 *      stray write is refused by Postgres (42501) regardless of what this
 *      script remembers to do.
 *
 *   2. IT WRITES NOTHING BUT FILES UNDER out/. The only filesystem calls are
 *      mkdirSync(OUT) and createWriteStream into OUT, where OUT resolves to
 *      <worktree>/out/bol-review and out/ is gitignored (.gitignore:8). Every
 *      database call is a read — findFirst here, one findMany inside
 *      resolveStopContacts — plus a single static
 *      SET default_transaction_read_only = on, which is a session setting and
 *      not a mutation. It reissues nothing: reissue is manual (ruling 5).
 *
 * THE IMPORT ORDER BELOW IS LOAD-BEARING, AND THAT IS NOT OBVIOUS.
 * Importing pdfService pulls in lib/documentNumber, which pulls in
 * config/database, which constructs the SHARED Prisma singleton at module
 * scope from process.env.DATABASE_URL. So a SECOND client exists, and it is
 * read-only only because applyCensusCredential() ran first. Hoisting the
 * pdfService import above it — or running this file under a true ESM loader,
 * where imports are evaluated before top-level statements — would build that
 * singleton from whatever DATABASE_URL happened to be ambient. The assertion
 * after the imports exists so that mistake fails loudly instead of silently
 * connecting somewhere else.
 *
 * Reviewers' residual notes, recorded rather than smoothed over: the host
 * guard accepts ANY neon.tech project rather than SRL's specific one; the
 * owner-role check is case-sensitive; and config/database also registers a
 * transition-persister callback at load, which fires only on an observed
 * status write — something this script never performs.
 */
import fs from "fs";
import path from "path";
import { applyCensusCredential, announceCensusTarget } from "./_census-credential";

const target = applyCensusCredential();
announceCensusTarget(target, "bol-review");
console.log("[bol-review] mode   : READ ONLY — renders files, writes no rows\n");

import { PrismaClient } from "@prisma/client";
import { generateBOLFromLoad, generateEnhancedRateConfirmation } from "../src/services/pdfService";
import { resolveStopContacts } from "../src/lib/stopContact";

const prisma = new PrismaClient();

// The claim in the header, enforced rather than trusted. Importing pdfService
// above built the shared config/database singleton from this same variable; if
// anything ever reorders the imports, this fails here instead of quietly
// talking to another database.
if (process.env.DATABASE_URL !== target.url) {
  console.error("[bol-review] REFUSING: DATABASE_URL is not the read-only census credential.");
  console.error("[bol-review] Something reordered the imports or overwrote the env after line 11.");
  process.exit(1);
}
const OUT = path.join(__dirname, "..", "..", "out", "bol-review");

const INCLUDE = {
  customer: true,
  carrier: {
    select: {
      id: true, firstName: true, lastName: true, company: true, phone: true,
      carrierProfile: { select: { mcNumber: true, dotNumber: true, companyName: true, contactName: true } },
    },
  },
  driver: { select: { firstName: true, lastName: true, phone: true } },
  lineItems: { orderBy: { lineNumber: "asc" as const } },
} as const;

function sink(doc: any, file: string): Promise<void> {
  return new Promise((res, rej) => {
    const ws = fs.createWriteStream(file);
    doc.pipe(ws);
    ws.on("finish", () => res());
    ws.on("error", rej);
  });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  await prisma.$executeRawUnsafe("SET default_transaction_read_only = on");

  for (const ref of ["SRL-121497", "SRL-121496"]) {
    const load: any = await prisma.load.findFirst({ where: { referenceNumber: ref }, include: INCLUDE });
    if (!load) { console.log(`  !! ${ref} not found`); continue; }

    const stopContacts = await resolveStopContacts(load, prisma);
    const data = {
      ...load,
      stopContacts,
      carrierLegalName: load.carrier?.carrierProfile?.companyName ?? load.carrier?.company ?? null,
      carrierContactName: load.carrier?.carrierProfile?.contactName ?? null,
      driverName: load.driverName || null,
      driverPhone: load.driverPhone || load.driver?.phone || null,
    };

    await sink(await generateBOLFromLoad(data), path.join(OUT, `${ref}-BOL.pdf`));
    await sink(
      generateEnhancedRateConfirmation(data, { rateConNumber: `${ref}R` }),
      path.join(OUT, `${ref}-RC.pdf`),
    );
    const s = stopContacts as any;
    console.log(`  ${ref}: BOL + RC rendered | shipper=${s?.shipper?.name ?? "-"}/${s?.shipper?.source ?? "-"} consignee=${s?.consignee?.name ?? "-"}/${s?.consignee?.source ?? "-"}`);
  }
  await prisma.$disconnect();
  console.log(`\nwritten to ${OUT}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
