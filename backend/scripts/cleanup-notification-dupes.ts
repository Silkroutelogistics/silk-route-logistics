/**
 * cleanup-notification-dupes — §13.3 Items 320-322 data step.
 *
 * Removes the duplicates the 2-hourly load-compliance scan wrote before v3.8.bkk
 * gave it a dedupe key, and backfills readAt where only `read` was set.
 *
 *   1. ComplianceAlert, type LOAD_COMPLIANCE: keep the NEWEST row per load
 *      among rows that are not RESOLVED; delete the older ones. Same key the
 *      fixed scan uses (load + type + open state).
 *   2. Notification, load-compliance titles ("Load <ref> — Compliance <SEV>"):
 *      keep the NEWEST row per (user, title); delete the older ones. Per title,
 *      not per load, because the fixed scan notifies once per severity change —
 *      one WARNING and one CRITICAL is what it would have sent.
 *   3. Notification: readAt = now() where read = true and readAt is null (Item
 *      321 made readAt canonical). now(), not createdAt: a backfilled row must
 *      not become eligible for the 30-day read-delete the same night.
 *   4. ComplianceAlert, open LOAD_COMPLIANCE on a FENCED load — the load is
 *      soft-deleted, missing, or a test account, or its carrier is deleted or a
 *      test account: set RESOLVED with resolvedAt, and KEEP the row for the
 *      audit trail. Runs AFTER step 1, so it resolves the one survivor per load
 *      rather than exempting that load's duplicates from deletion. The fixed scan
 *      never visits these loads again, so without this they stay open forever.
 *      ComplianceAlert has no reason column: the reason "record deleted or
 *      test" and the resolved ids go into ONE SystemLog row per run (the
 *      v3.8.bbw chameleon-retirement precedent). SystemLog is kept 90 days
 *      (Item 270); a permanent reason on the row would need its own migration.
 *
 * DRY-RUN BY DEFAULT, as srl_readonly through scripts/_census-credential.ts,
 * with the session forced read-only. It prints what --commit would change.
 *
 * --commit writes, and only to a target the operator names explicitly:
 *   CLEANUP_DATABASE_URL="postgres://..." npx tsx scripts/cleanup-notification-dupes.ts --commit
 * It never reads an env file for the write credential (the production rail,
 * CLAUDE.md §2.2). All three steps run in ONE transaction, and each step's
 * affected-row count must equal the count measured inside that same
 * transaction immediately before, or the whole thing rolls back.
 */
import { PrismaClient } from "@prisma/client";
import { resolveCensusCredential } from "./_census-credential";

const COMMIT = process.argv.includes("--commit");
const j = (x: unknown) => JSON.stringify(x, (_k, v) => (typeof v === "bigint" ? Number(v) : v));
function refuse(msg: string): never {
  console.error("REFUSING: " + msg);
  process.exit(1);
}

const ALERT_DUPES = `
  SELECT id FROM (
    SELECT id, row_number() OVER (PARTITION BY "entityId" ORDER BY "createdAt" DESC, id DESC) AS rn
    FROM compliance_alerts WHERE type = 'LOAD_COMPLIANCE' AND status <> 'RESOLVED') r
  WHERE rn > 1`;
const NOTIF_DUPES = `
  SELECT id FROM (
    SELECT id, row_number() OVER (PARTITION BY "userId", title ORDER BY "createdAt" DESC, id DESC) AS rn
    FROM notifications WHERE title LIKE 'Load % — Compliance %') r
  WHERE rn > 1`;
const READ_BACKFILL = `SELECT id FROM notifications WHERE read = true AND "readAt" IS NULL`;
const FENCED_REASON = "record deleted or test";
/** Open LOAD_COMPLIANCE alerts whose load or carrier is out of scope. */
const FENCED_OPEN = `
  SELECT a.id, a."entityName" FROM compliance_alerts a
  LEFT JOIN loads l ON l.id = a."entityId"
  LEFT JOIN carrier_profiles cp ON cp."userId" = l."carrierId"
  WHERE a.type = 'LOAD_COMPLIANCE' AND a.status <> 'RESOLVED'
    AND (l.id IS NULL OR l."deletedAt" IS NOT NULL OR l."isTestAccount"
         OR cp."deletedAt" IS NOT NULL OR coalesce(cp."isTestAccount", false))`;
/** What step 4 will resolve: the fenced open alerts step 1 does NOT delete. */
const FENCED_RESOLVE = `SELECT f.id FROM (${FENCED_OPEN}) f WHERE f.id NOT IN (${ALERT_DUPES})`;

async function counts(db: any) {
  const n = async (sql: string) => Number(((await db.$queryRawUnsafe(`SELECT count(*) AS c FROM (${sql}) x`)) as any)[0].c);
  return {
    alertDupes: await n(ALERT_DUPES),
    notificationDupes: await n(NOTIF_DUPES),
    readAtBackfill: await n(READ_BACKFILL),
    fencedResolve: await n(FENCED_RESOLVE),
  };
}

async function report(db: any) {
  console.log("would change:", j(await counts(db)));
  console.log("alert dupes by load:", j(await db.$queryRawUnsafe(`
    SELECT "entityName", count(*) - 1 AS delete_rows FROM compliance_alerts
    WHERE type = 'LOAD_COMPLIANCE' AND status <> 'RESOLVED' GROUP BY 1 HAVING count(*) > 1 ORDER BY 2 DESC`)));
  console.log("notification dupes by title:", j(await db.$queryRawUnsafe(`
    SELECT title, count(*) - 1 AS delete_rows FROM notifications
    WHERE title LIKE 'Load % — Compliance %' GROUP BY "userId", title HAVING count(*) > 1 ORDER BY 2 DESC`)));
  console.log(`alerts to RESOLVE ("${FENCED_REASON}"), after the dedupe, by load:`, j(await db.$queryRawUnsafe(`
    SELECT f."entityName", count(*) AS resolve_rows FROM (${FENCED_OPEN}) f
    WHERE f.id NOT IN (${ALERT_DUPES}) GROUP BY 1 ORDER BY 2 DESC`)));
}

(async () => {
  if (!COMMIT) {
    const t = resolveCensusCredential();
    const db = new PrismaClient({ datasourceUrl: t.url + (t.url.includes("?") ? "&" : "?") + "connection_limit=1" });
    await db.$executeRawUnsafe("SET default_transaction_read_only = on");
    console.log(`DRY RUN — ${t.user}@…${t.host.slice(-24)}, session read-only. Nothing is written.`);
    await report(db);
    await db.$disconnect();
    return;
  }

  const url = process.env.CLEANUP_DATABASE_URL;
  if (!url) refuse("--commit needs CLEANUP_DATABASE_URL set to the target database. See the header.");
  const u = new URL(url);
  if (u.username === "srl_readonly") refuse("CLEANUP_DATABASE_URL is the read-only role; it cannot write.");
  console.log(`COMMIT — ${u.username}@${u.hostname}`);
  const db = new PrismaClient({ datasourceUrl: url });
  await report(db);
  const done = await db.$transaction(async (tx: any) => {
    const before = await counts(tx);
    const a = await tx.$executeRawUnsafe(`DELETE FROM compliance_alerts WHERE id IN (${ALERT_DUPES})`);
    const n = await tx.$executeRawUnsafe(`DELETE FROM notifications WHERE id IN (${NOTIF_DUPES})`);
    const r = await tx.$executeRawUnsafe(`UPDATE notifications SET "readAt" = now() WHERE id IN (${READ_BACKFILL})`);
    // Step 4, after step 1: the survivors on fenced loads.
    const fenced = (await tx.$queryRawUnsafe(FENCED_OPEN)) as { id: string; entityName: string }[];
    const f = (await tx.complianceAlert.updateMany({
      where: { id: { in: fenced.map((x) => x.id) } },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    })).count;
    if (a !== before.alertDupes || n !== before.notificationDupes || r !== before.readAtBackfill || f !== before.fencedResolve) {
      throw new Error(`count mismatch: measured ${j(before)}, changed ${j({ a, n, r, f })} — rolled back`);
    }
    if (f > 0) {
      await tx.systemLog.create({
        data: {
          logType: "STATUS_CHANGE",
          severity: "INFO",
          source: "cleanup-notification-dupes",
          message: `Resolved ${f} open LOAD_COMPLIANCE alert(s): ${FENCED_REASON}`,
          details: { reason: FENCED_REASON, alertIds: fenced.map((x) => x.id), loads: [...new Set(fenced.map((x) => x.entityName))] },
        },
      });
    }
    return { alertsDeleted: a, notificationsDeleted: n, readAtBackfilled: r, fencedResolved: f };
  }, { timeout: 60_000 });
  console.log("committed:", j(done));
  await db.$disconnect();
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
