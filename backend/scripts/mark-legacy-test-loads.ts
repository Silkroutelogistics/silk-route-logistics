/**
 * One-off: flag the three legacy BKN test loads that predate Load.isTestAccount
 * being used this way.
 *
 * WHY. The v3.8.ayq recipient resolver returns [] for a load carrying
 * isTestAccount, which is the guard that would have stopped the 2026-09-02
 * incident on its own. When the three September test loads were retired they
 * were flagged; these three were retired on 2026-07-07, before the flag was
 * being set at retirement, so a production check of "BKN loads with
 * isTestAccount = false" returned 3 where it should return 0.
 *
 * THEY WERE NEVER REACHABLE. Both are CANCELLED and soft-deleted, and the
 * resolver returns [] on either of those independently, so nothing has been
 * sending. This closes the third guard rather than fixing an exposure — the
 * value is that the honest answer to "are any real-looking BKN loads left?" is
 * now zero instead of three-with-an-explanation.
 *
 * NOT A BACKFILL, and the distinction matters. A predicate like "every cancelled
 * load for a customer whose name matches beekeep" would be shorter and would be
 * a blind mass update on the flag that decides whether a load can email a
 * customer. Three known ids is a smaller blast radius than a clever query, and
 * it is the same discipline as cancel-stranded-shipments.ts.
 *
 * WHY IT DOES NOT LOAD .env.production.local: the production rail allows exactly
 * two files to do that and carries a stale-entry check. A one-off does not
 * belong on a permanent allow-list. The operator supplies the URL — the
 * deliberate choice §2.2 describes for psql:
 *
 *   BACKFILL_DATABASE_URL="postgres://..." \
 *   RESEND_API_KEY= OPENPHONE_API_KEY= QUO_API_KEY= \
 *   npx tsx scripts/mark-legacy-test-loads.ts --commit
 *
 * Dry-run by default. Before-image written on both paths and NOT committed: it
 * holds customer load records.
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { hostOf, isLocalHost } from "./prisma-target-guard";

/**
 * The three legacy BKN loads, resolved to ids against production 2026-09-03.
 * All three CANCELLED and soft-deleted on 2026-07-07; created April 2026.
 */
const TARGET_IDS = [
  "cmoecl24l0011w05wni8xajxv", // L2205055791
  "cmoecq1o7001qw05wlk0fivr2", // L2228322560
  "cmolqnhp8002bh31tn4ugt5z4", // L6894191249
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

/** The count this run exists to drive to zero. */
const REMAINING = `
  SELECT l."loadNumber", l.status, l."deletedAt" IS NOT NULL AS del
  FROM loads l JOIN customers c ON c.id = l."customerId"
  WHERE c.name ILIKE '%beekeep%' AND l."isTestAccount" = false
  ORDER BY l."loadNumber"`;

async function main() {
  const before = await q(
    `SELECT l.id, l."loadNumber", l.status, l."isTestAccount", l."deletedAt" IS NOT NULL AS del,
            c.name AS customer
     FROM loads l LEFT JOIN customers c ON c.id = l."customerId"
     WHERE l.id = ANY($1) ORDER BY l."loadNumber"`, TARGET_IDS);

  if (before.length !== TARGET_IDS.length) {
    console.error(`expected ${TARGET_IDS.length} target loads, found ${before.length} — refusing`);
    process.exit(1);
  }

  // Refuse if a target is not what this run was authorised for. An id that has
  // become a live load since it was resolved must not be silently flagged as
  // test data — that flag stops a real customer being emailed.
  const wrong = before.filter((b: any) => b.status !== "CANCELLED" || !b.del);
  if (wrong.length > 0) {
    console.error("REFUSING: a target is not a cancelled, soft-deleted load:");
    for (const w of wrong) console.error(`  ${w.loadNumber} status=${w.status} deleted=${w.del}`);
    process.exit(1);
  }

  const undo = path.join(__dirname, "_mark-legacy-test-loads-undo.json");
  fs.writeFileSync(undo, JSON.stringify({ at: new Date().toISOString(), host, before }, null, 2));
  console.log(`BEFORE (saved to ${path.basename(undo)}):`);
  for (const b of before) {
    console.log(`  ${b.loadNumber}  ${b.id}  status=${b.status}  deleted=${b.del}  isTestAccount=${b.isTestAccount}  ${b.customer}`);
  }

  const pre = await q(REMAINING);
  console.log(`\nBKN loads with isTestAccount = false, before: ${pre.length}`);
  for (const r of pre) console.log(`  ${r.loadNumber} [${r.status}] deleted=${r.del}`);

  if (!COMMIT) {
    const todo = before.filter((b: any) => b.isTestAccount === false).length;
    console.log(`\nDRY RUN — would flag ${todo} load(s). Re-run with --commit to apply.`);
    await db.$disconnect();
    return;
  }

  console.log("\napplying...");
  // Scoped to the un-flagged state so a re-run is a no-op and the count is honest.
  const n = await db.$executeRawUnsafe(
    `UPDATE loads SET "isTestAccount" = true, "updatedAt" = now()
     WHERE id = ANY($1) AND "isTestAccount" = false`, TARGET_IDS);
  console.log(`  rows updated: ${n}`);

  const after = await q(
    `SELECT l."loadNumber", l."isTestAccount", l.status, l."updatedAt"
     FROM loads l WHERE l.id = ANY($1) ORDER BY l."loadNumber"`, TARGET_IDS);
  console.log("\nAFTER:");
  for (const a of after) {
    console.log(`  ${a.loadNumber}  isTestAccount=${a.isTestAccount}  status=${a.status}  updatedAt=${new Date(a.updatedAt).toISOString()}`);
  }

  console.log("\nPOST-WRITE COUNT — BKN loads with isTestAccount = false:");
  const post = await q(REMAINING);
  console.log(`  ${post.length}`);
  for (const r of post) console.log(`    STILL UNFLAGGED: ${r.loadNumber} [${r.status}] deleted=${r.del}`);
  if (post.length === 0) console.log("  ZERO — every BKN load is now marked as test data.");

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("ERR " + String(e).slice(0, 400));
  await db.$disconnect();
  process.exit(1);
});
