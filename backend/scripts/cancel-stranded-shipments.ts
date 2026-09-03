/**
 * One-off: cancel the two shipments left running under cancelled loads.
 *
 * WHY THEY EXIST. deleteLoad cascades deletedAt to three of Load's thirty-one
 * children and Shipment is not one of them. On 2026-09-02 three BKN test loads
 * were cancelled and soft-deleted; their shipments stayed BOOKED and IN_TRANSIT,
 * and runLateDetection kept emailing the broker every 30 minutes about freight
 * that no longer existed.
 *
 * v3.8.ayv cascades at the source and v3.8.ayw guards the jobs, so no NEW
 * shipment can be stranded this way. These two predate both — they are exactly
 * the rows the code fix cannot reach, which is why the guard and the data run
 * both ship.
 *
 * TARGETED BY ID, not by a predicate. A `WHERE load.status = CANCELLED` sweep
 * would be shorter and would also be a blind mass update against production on a
 * table nothing else in this arc touches. Two known ids is a smaller blast
 * radius than a clever query.
 *
 * WHY IT DOES NOT LOAD .env.production.local: the production rail allows exactly
 * two files to do that and carries a stale-entry check. A one-off does not belong
 * on a permanent allow-list. The operator supplies the URL — the deliberate
 * choice §2.2 describes for psql:
 *
 *   BACKFILL_DATABASE_URL="postgres://..." \
 *   RESEND_API_KEY= OPENPHONE_API_KEY= QUO_API_KEY= \
 *   npx tsx scripts/cancel-stranded-shipments.ts --commit
 *
 * Dry-run by default. Before-image written on both paths and NOT committed: it
 * holds customer shipment records.
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { hostOf, isLocalHost } from "./prisma-target-guard";

/**
 * The stranded rows, identified against production and cancelled by explicit
 * per-id authorisation. Ids rather than a predicate on purpose — see the header.
 *
 * The third was found by this script's own broader sweep while running the first
 * two, and was deliberately NOT swept up in that run: a data run authorised for
 * two known rows should not quietly become three. It is here under a separate
 * authorisation, which is the difference between finding something and acting on
 * it.
 */
const TARGET_IDS = [
  "cmti2gsc20085md2de8kg2gc0", // SRL-121488  (BKN)              BOOKED     — 2026-09-03
  "cmtjiw5oa003onf2dksqbt4dm", // SRL-121489  (BKN)              IN_TRANSIT — 2026-09-03
  // Two months older than the BKN incident: load soft-deleted 2026-07-07 and its
  // status never moved off DISPATCHED, so the shipment stayed DISPATCHED under a
  // load nobody could see. v3.8.ayw's load filter already excluded it from both
  // jobs, so it was sending nothing — this closes the row itself rather than
  // relying on every future reader to keep filtering it out.
  "cmpebkrg6000xb02fwd9auqzv", // L9180992591 (Graphic Packaging) DISPATCHED — added 2026-09-03
];

const COMMIT = process.argv.includes("--commit");
const url = process.env.BACKFILL_DATABASE_URL ?? "";
if (!url) {
  console.error("BACKFILL_DATABASE_URL is not set. Supply the target explicitly — see the header.");
  process.exit(1);
}
for (const k of ["RESEND_API_KEY", "OPENPHONE_API_KEY", "QUO_API_KEY"]) {
  if ((process.env[k] ?? "") !== "") {
    console.error(`REFUSING: ${k} is set to a real value. Outbound would be LIVE. Set it empty.`);
    process.exit(1);
  }
}

const host = hostOf(url);
console.log(`target host : ${host}`);
console.log(`mode        : ${COMMIT ? "COMMIT (will write)" : "DRY RUN (writes nothing)"}`);
console.log(`note        : ${isLocalHost(host) ? "LOCAL host" : "REMOTE host — writes here are production writes"}\n`);

const db = new PrismaClient({ datasources: { db: { url } } });
const q = <T = any>(s: string, ...a: any[]) => db.$queryRawUnsafe<T[]>(s, ...a);

/** Every shipment still running under a load that is cancelled or gone. */
const STRANDED = `
  SELECT s.id, s.status AS shipment_status, l."loadNumber",
         l.status AS load_status, l."deletedAt" IS NOT NULL AS load_deleted
  FROM shipments s JOIN loads l ON l.id = s."loadId"
  WHERE s.status NOT IN ('CANCELLED','COMPLETED','DELIVERED')
    AND (l."deletedAt" IS NOT NULL OR l.status = 'CANCELLED')
  ORDER BY l."loadNumber"`;

async function main() {
  const before = await q(
    `SELECT s.id, s.status, s."loadId", s."updatedAt", l."loadNumber", l.status AS load_status,
            l."deletedAt" IS NOT NULL AS load_deleted
     FROM shipments s LEFT JOIN loads l ON l.id = s."loadId"
     WHERE s.id = ANY($1) ORDER BY l."loadNumber"`, TARGET_IDS);

  if (before.length !== TARGET_IDS.length) {
    console.error(`expected ${TARGET_IDS.length} target shipments, found ${before.length} — refusing`);
    process.exit(1);
  }

  const undo = path.join(__dirname, "_cancel-stranded-shipments-undo.json");
  fs.writeFileSync(undo, JSON.stringify({ at: new Date().toISOString(), host, before }, null, 2));
  console.log(`BEFORE (saved to ${path.basename(undo)}):`);
  for (const b of before) {
    console.log(`  ${b.loadNumber}  shipment=${b.id}  status=${b.status}  load=${b.load_status} deleted=${b.load_deleted}`);
  }

  console.log("\nSTRANDED PLATFORM-WIDE, before:");
  const preSweep = await q(STRANDED);
  console.log(`  ${preSweep.length} shipment(s)`);
  for (const s of preSweep) console.log(`    ${s.loadNumber} ${s.shipment_status} (load ${s.load_status}, deleted=${s.load_deleted})`);

  if (!COMMIT) {
    const todo = before.filter((b: any) => b.status !== "CANCELLED").length;
    console.log(`\nDRY RUN — would cancel ${todo} shipment(s). Re-run with --commit to apply.`);
    await db.$disconnect();
    return;
  }

  console.log("\napplying...");
  // Scoped to non-CANCELLED so a re-run is a no-op and the count stays honest.
  const n = await db.$executeRawUnsafe(
    `UPDATE shipments SET status='CANCELLED', "updatedAt"=now()
     WHERE id = ANY($1) AND status <> 'CANCELLED'`, TARGET_IDS);
  console.log(`  rows updated: ${n}`);

  const after = await q(
    `SELECT s.id, s.status, s."updatedAt", l."loadNumber" FROM shipments s
     LEFT JOIN loads l ON l.id = s."loadId" WHERE s.id = ANY($1) ORDER BY l."loadNumber"`, TARGET_IDS);
  console.log("\nAFTER:");
  for (const a of after) console.log(`  ${a.loadNumber}  ${a.id}  status=${a.status}  updatedAt=${new Date(a.updatedAt).toISOString()}`);

  console.log("\nPOST-WRITE COUNT — shipments still running under a cancelled or deleted load, platform-wide:");
  const postSweep = await q(STRANDED);
  console.log(`  ${postSweep.length}`);
  for (const s of postSweep) console.log(`    STILL STRANDED: ${s.loadNumber} ${s.shipment_status} (load ${s.load_status})`);
  if (postSweep.length === 0) console.log("  ZERO — no shipment is running under a load that has been cancelled or deleted.");

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("ERR " + String(e).slice(0, 400));
  await db.$disconnect();
  process.exit(1);
});
