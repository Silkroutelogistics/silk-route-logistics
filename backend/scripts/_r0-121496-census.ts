/**
 * R0 — READ-ONLY census of SRL-121496 and SRL-121495 across every surface.
 *
 * WHY. /api/health reports unexpected_cumulative = 1 on a NEW counter edge
 * CANCELLED -> DISPATCHED, first = last = 2026-09-25T00:31:58.095Z. My own
 * previous halt card attributed it to backend/scripts/reactivate-load-121495.ts.
 * THAT ATTRIBUTION CANNOT BE RIGHT and this census is what settles it:
 *
 *   - the script is hardcoded to LOAD_REF "SRL-121495" and REFUSES a reference
 *     mismatch (script:175-177), so it cannot have moved 121496;
 *   - it builds `new PrismaClient({ datasourceUrl })` (script:160) rather than
 *     importing the shared singleton, so the $allOperations observer never sees
 *     its writes and it could not have created a counter row at all.
 *
 * So something the observer CAN see moved 121496. This asks what, and whether it
 * left the audit row C1's lens will look for.
 *
 * WRITES NOTHING. srl_readonly only, via _census-credential (§13.3 Item 303),
 * which refuses neondb_owner and any non-Neon host. The credential lives only in
 * the main checkout, so its path is passed explicitly rather than copied here —
 * a second copy of a production credential is a second thing to rotate.
 * `default_transaction_read_only = on` before the first statement is the second
 * layer, not the first.
 */
import { PrismaClient } from "@prisma/client";
import { resolveCensusCredential } from "./_census-credential";

/**
 * The credential file, overridable.
 *
 * Defaults to resolveCensusCredential's own location (backend/.env.production.readonly
 * relative to the script). CENSUS_ENV_FILE exists because this was first run from a
 * WORKTREE, where that file does not exist — it is deliberately kept only in the
 * main checkout, so a second copy is not made for every branch. An absolute path
 * hardcoded here would have pinned the script to one machine, which makes a census
 * an assertion rather than something a reader can re-run.
 */
const CRED_FILE = process.env.CENSUS_ENV_FILE || undefined;

const REFS = ["SRL-121496", "SRL-121495"];

function hr(title: string) {
  console.log(`\n${"=".repeat(78)}\n${title}\n${"=".repeat(78)}`);
}

function iso(v: unknown): string {
  if (v === null || v === undefined) return "null";
  try {
    return new Date(v as string).toISOString();
  } catch {
    return String(v);
  }
}

async function main() {
  const cred = CRED_FILE ? resolveCensusCredential(CRED_FILE) : resolveCensusCredential();
  console.log(`[r0] host: ${cred.host}`);
  console.log(`[r0] user: ${cred.user}   (must NOT be neondb_owner)`);

  const prisma = new PrismaClient({ datasourceUrl: cred.url });
  await prisma.$executeRawUnsafe("SET default_transaction_read_only = on");

  // ── 0. the counters, every row ────────────────────────────────────────────
  hr("0. status_machine_counters — every row");
  const counters = await prisma.$queryRawUnsafe<any[]>(
    `SELECT "fromStatus", "toStatus", count, "firstSeenAt", "lastSeenAt"
       FROM status_machine_counters ORDER BY "lastSeenAt" DESC`,
  );
  for (const c of counters) {
    console.log(
      `  ${c.fromStatus} -> ${c.toStatus}  count=${c.count}  first=${iso(c.firstSeenAt)}  last=${iso(c.lastSeenAt)}`,
    );
  }

  // ── 1. snapshot population, for C2's refuse-vs-proceed split ─────────────
  hr("1. cancellationSnapshot population (C2 decides on this)");
  const snapPop = await prisma.$queryRawUnsafe<any[]>(
    `SELECT
        count(*)::int                                                          AS loads_total,
        (count(*) FILTER (WHERE "cancellationSnapshot" IS NOT NULL))::int       AS with_snapshot,
        (count(*) FILTER (WHERE status = 'CANCELLED'))::int                     AS cancelled_now,
        (count(*) FILTER (WHERE status = 'CANCELLED'
                            AND "cancellationSnapshot" IS NOT NULL))::int       AS cancelled_with_snapshot
       FROM loads`,
  );
  console.log("  " + JSON.stringify(snapPop[0]));

  for (const ref of REFS) {
    hr(`LOAD ${ref}`);

    const loads = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, "referenceNumber", status, "deletedAt", "deletedBy",
              "cancellationReason", "cancellationReasonCode", "cancellationFaultParty",
              "cancelledAt", "cancelledById",
              ("cancellationSnapshot" IS NOT NULL)      AS has_snapshot,
              "trackingToken" IS NOT NULL               AS has_tracking_token,
              "trackingTokenRevokedAt",
              "carrierId", "createdAt", "updatedAt"
         FROM loads WHERE "referenceNumber" = $1`,
      ref,
    );
    if (!loads.length) {
      console.log("  (no such load)");
      continue;
    }
    const L = loads[0];
    console.log(`  id                      ${L.id}`);
    console.log(`  status                  ${L.status}`);
    console.log(`  updatedAt               ${iso(L.updatedAt)}`);
    console.log(`  deletedAt / deletedBy   ${iso(L.deletedAt)} / ${L.deletedBy ?? "null"}`);
    console.log(`  cancellationReasonCode  ${L.cancellationReasonCode ?? "null"}`);
    console.log(`  cancellationReason      ${JSON.stringify(L.cancellationReason)}`);
    console.log(`  cancellationFaultParty  ${L.cancellationFaultParty ?? "null"}`);
    console.log(`  cancelledAt / ById      ${iso(L.cancelledAt)} / ${L.cancelledById ?? "null"}`);
    console.log(`  HAS SNAPSHOT            ${L.has_snapshot}     <- C2 refuse-vs-proceed`);
    console.log(`  trackingToken present   ${L.has_tracking_token}`);
    console.log(`  trackingTokenRevokedAt  ${iso(L.trackingTokenRevokedAt)}`);
    console.log(`  carrierId               ${L.carrierId ?? "null"}`);

    // ── audit_trails: the table recordLifecycleEvent writes ────────────────
    console.log("\n  --- audit_trails (recordLifecycleEvent + createAuditEntry) ---");
    const trails = await prisma.$queryRawUnsafe<any[]>(
      `SELECT a.action,
              a."entityType",
              a."performedAt",
              a."performedById",
              u.email                                   AS actor_email,
              a."changedFields"->>'actionDetail'          AS action_detail,
              a."changedFields"->>'reason'                AS reason,
              a."changedFields"->'previous'->>'status'    AS prev_status,
              a."changedFields"->'new'->>'status'         AS new_status,
              a."changedFields"->'actor'->>'userId'       AS cf_actor_user,
              a."ipAddress"
         FROM audit_trails a
         LEFT JOIN users u ON u.id = a."performedById"
        WHERE a."entityId" = $1
        ORDER BY a."performedAt" ASC`,
      L.id,
    );
    if (!trails.length) console.log("    (none)");
    for (const t of trails) {
      console.log(
        `    ${iso(t.performedAt)}  ${t.action}/${t.entityType}  detail=${t.action_detail ?? "-"}  ` +
          `${t.prev_status ?? "-"} -> ${t.new_status ?? "-"}  actor=${t.actor_email ?? t.performedById}  ` +
          `reason=${t.reason === null ? "null" : JSON.stringify(String(t.reason).slice(0, 60))}`,
      );
    }

    // ── audit_logs: the table auditLog() middleware writes ─────────────────
    console.log("\n  --- audit_logs (auditLog() route middleware) ---");
    const logs = await prisma.$queryRawUnsafe<any[]>(
      `SELECT l.action, l.entity, l."createdAt", u.email AS actor_email, l.changes
         FROM audit_logs l LEFT JOIN users u ON u.id = l."userId"
        WHERE l."entityId" = $1 ORDER BY l."createdAt" ASC`,
      L.id,
    );
    if (!logs.length) console.log("    (none)");
    for (const g of logs) {
      console.log(
        `    ${iso(g.createdAt)}  ${g.action}/${g.entity}  actor=${g.actor_email ?? "-"}  changes=${g.changes === null ? "null" : JSON.stringify(String(g.changes).slice(0, 70))}`,
      );
    }

    // ── load_activity: where the one-off script leaves its only trace ──────
    console.log("\n  --- load_activity ---");
    const acts = await prisma.$queryRawUnsafe<any[]>(
      `SELECT event_type AS "eventType", actor_type AS "actorType", actor_name AS "actorName", created_at AS "createdAt", left(description, 110) AS descr
         FROM load_activity WHERE load_id = $1 ORDER BY created_at ASC`,
      L.id,
    );
    if (!acts.length) console.log("    (none)");
    for (const a of acts) {
      console.log(
        `    ${iso(a.createdAt)}  ${a.eventType}  by ${a.actorType}/${a.actorName ?? "-"}  ${JSON.stringify(a.descr ?? "")}`,
      );
    }

    // ── shipment ──────────────────────────────────────────────────────────
    console.log("\n  --- shipments ---");
    const shp = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "shipmentNumber", status, "updatedAt" FROM shipments WHERE "loadId" = $1`,
      L.id,
    );
    if (!shp.length) console.log("    (none)");
    for (const s of shp) console.log(`    ${s.shipmentNumber}  status=${s.status}  updatedAt=${iso(s.updatedAt)}`);

    // ── shipper tracking tokens (snake_case @map) ─────────────────────────
    console.log("\n  --- shipper_tracking_tokens ---");
    const toks = await prisma.$queryRawUnsafe<any[]>(
      `SELECT left(token, 4) AS token_head, access_level, expires_at, access_count, last_accessed_at, created_at
         FROM shipper_tracking_tokens WHERE load_id = $1 ORDER BY created_at ASC`,
      L.id,
    );
    if (!toks.length) console.log("    (none)");
    for (const t of toks) {
      const expired = t.expires_at ? new Date(t.expires_at) < new Date() : null;
      console.log(
        `    ${t.token_head}...  level=${t.access_level}  expires=${iso(t.expires_at)} (${expired ? "EXPIRED" : "live"})  ` +
          `accessCount=${t.access_count}  lastAccessed=${iso(t.last_accessed_at)}`,
      );
    }

    // ── rate confirmations ────────────────────────────────────────────────
    console.log("\n  --- rate_confirmations ---");
    const rcs = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "rateConNumber", status, signed, "signedAt", "sentAt",
              ("contentHash"   IS NOT NULL) AS has_hash,
              ("signTokenHash" IS NOT NULL) AS has_sign_token,
              "signTokenUsedAt", "counterSignedAt", "signerName"
         FROM rate_confirmations WHERE "loadId" = $1 ORDER BY "sentAt" ASC NULLS FIRST`,
      L.id,
    );
    if (!rcs.length) console.log("    (none)");
    for (const r of rcs) {
      console.log(
        `    ${r.rateConNumber ?? "(no number)"}  status=${r.status}  signed=${r.signed} at ${iso(r.signedAt)}  ` +
          `signer=${r.signerName ?? "-"}  hash=${r.has_hash}  signToken=${r.has_sign_token} used=${iso(r.signTokenUsedAt)}  ` +
          `counterSigned=${iso(r.counterSignedAt)}`,
      );
    }

    // ── carrier bell notices. No loadId column, so match the actionUrl. ────
    console.log("\n  --- notifications whose actionUrl names this load (carrier bell) ---");
    const nots = await prisma.$queryRawUnsafe<any[]>(
      `SELECT n.type, n.title, n."createdAt", n.read, n."actionUrl", u.email AS recipient, u.role
         FROM notifications n JOIN users u ON u.id = n."userId"
        WHERE n."actionUrl" LIKE '%' || $1 || '%'
        ORDER BY n."createdAt" ASC`,
      L.id,
    );
    if (!nots.length) console.log("    (none — nobody was told)");
    for (const n of nots) {
      console.log(
        `    ${iso(n.createdAt)}  ${n.type}  "${n.title}"  -> ${n.recipient} (${n.role})  read=${n.read}  url=${n.actionUrl}`,
      );
    }
  }

  // ── every load_activity 'cancellation_reversed' row anywhere ─────────────
  hr("Every 'cancellation_reversed' load_activity row on the database");
  const rev = await prisma.$queryRawUnsafe<any[]>(
    `SELECT la.load_id, l."referenceNumber", la.actor_type AS "actorType", la.actor_name AS "actorName", la.created_at AS "createdAt"
       FROM load_activity la LEFT JOIN loads l ON l.id = la.load_id
      WHERE la.event_type IN ('cancellation_reversed','load_uncancelled') ORDER BY la.created_at ASC`,
  );
  if (!rev.length) console.log("  (none)");
  for (const r of rev) {
    console.log(`  ${iso(r.createdAt)}  ${r.referenceNumber ?? r.load_id}  by ${r.actorType}/${r.actorName ?? "-"}`);
  }

  // ── every LOAD_UNCANCELLED audit row anywhere — what C1's lens will see ──
  hr("Every LOAD_UNCANCELLED audit_trails row (C1's authorising predicate)");
  const unc = await prisma.$queryRawUnsafe<any[]>(
    `SELECT a."entityId", l."referenceNumber", a."performedAt", u.email AS actor,
            a."changedFields"->>'reason'             AS reason,
            a."changedFields"->'new'->>'status'      AS new_status
       FROM audit_trails a
       LEFT JOIN loads l ON l.id = a."entityId"
       LEFT JOIN users u ON u.id = a."performedById"
      WHERE a."changedFields"->>'actionDetail' = 'LOAD_UNCANCELLED'
      ORDER BY a."performedAt" ASC`,
  );
  if (!unc.length) console.log("  (NONE — no un-cancel has ever gone through the canonical path)");
  for (const r of unc) {
    console.log(
      `  ${iso(r.performedAt)}  ${r.referenceNumber ?? r.entityId}  -> ${r.new_status}  actor=${r.actor ?? "-"}  reason=${JSON.stringify(String(r.reason ?? "").slice(0, 50))}`,
    );
  }

  // ── anything at all that touched the database in the 00:31:58 window ─────
  hr("audit_trails + audit_logs in 00:27-00:37Z on 2026-09-25 (the counter window)");
  const win1 = await prisma.$queryRawUnsafe<any[]>(
    `SELECT 'audit_trails' AS src, a.action::text AS action, a."entityType" AS entity, a."entityId",
            a."performedAt" AS ts, u.email AS actor, a."changedFields"->>'actionDetail' AS detail
       FROM audit_trails a LEFT JOIN users u ON u.id = a."performedById"
      WHERE a."performedAt" BETWEEN '2026-09-25T00:27:00Z' AND '2026-09-25T00:37:00Z'
      UNION ALL
     SELECT 'audit_logs', l.action, l.entity, l."entityId", l."createdAt", u2.email, NULL
       FROM audit_logs l LEFT JOIN users u2 ON u2.id = l."userId"
      WHERE l."createdAt" BETWEEN '2026-09-25T00:27:00Z' AND '2026-09-25T00:37:00Z'
      ORDER BY ts ASC`,
  );
  if (!win1.length) console.log("  (NOTHING — the writer left no audit row in either table)");
  for (const r of win1) {
    console.log(`  ${iso(r.ts)}  [${r.src}]  ${r.action}/${r.entity}  detail=${r.detail ?? "-"}  actor=${r.actor ?? "-"}  entityId=${r.entityId}`);
  }

  await prisma.$disconnect();
  console.log("\n[r0] done. Wrote nothing.");
}

main().catch((e) => {
  console.error("R0 FAILED:", e?.message ?? e);
  process.exit(1);
});
