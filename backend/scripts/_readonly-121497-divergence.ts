/**
 * ARC 121497-data-divergence, Phase A — read-only production census.
 *
 * srl_readonly ONLY. Writes nothing — not a row, not a column, not a file
 * outside `out/`. It resolves its credential through `_census-credential.ts`
 * (§303), which refuses `neondb_owner` and any non-Neon host, and it sets
 * `default_transaction_read_only = on` before its first query — then reads the
 * setting back and throws if it did not take, rather than assuming it did.
 * Postgres refuses a write here; the session setting is the second layer.
 *
 * WHAT IT ANSWERED. Phase A's Q3 (SRL-121497's audit rows), Q4 (the field
 * matrix's DB column) and Q7 (the other live loads). Its finding is the one the
 * whole arc rests on: seven live loads split 100% by `dispatch_method` with no
 * exceptions — the three `direct_tender` loads carry stop windows and dock
 * contacts, the four `loadboard` ones carry neither. A clean natural experiment,
 * which is what identified the controller's field mapping rather than the
 * validator as the place the data was being lost.
 *
 * Tracked late, by addendum: it was left untracked through the arc, and an
 * untracked census script is exactly the §2.2 sweep hazard the §303 convention
 * exists to close.
 */
import { PrismaClient } from "@prisma/client";
import { resolveCensusCredential, announceCensusTarget } from "./_census-credential";

const target = resolveCensusCredential();
announceCensusTarget(target, "census");
console.log("[census] mode   : READ ONLY\n");

const j = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? Number(x) : x), 2);

async function main() {
  const prisma = new PrismaClient({ datasourceUrl: target.url });
  try {
    await prisma.$executeRawUnsafe(`SET default_transaction_read_only = on`);
    const ro: any[] = await prisma.$queryRawUnsafe(`SHOW default_transaction_read_only`);
    if (ro[0]?.default_transaction_read_only !== "on") throw new Error("read-only did not take");

    // ---- Q4: SRL-121497 every stop-relevant column -------------------------
    console.log("=== [1] SRL-121497 — Load row, stop-relevant columns ===");
    const load: any[] = await prisma.$queryRawUnsafe(`
      SELECT id, "loadNumber", status, "createdAt", "updatedAt",
             "pickupDate", "pickupTimeStart", "pickupTimeEnd",
             "deliveryDate", "deliveryTimeStart", "deliveryTimeEnd",
             "actualPickupDatetime", "actualDeliveryDatetime",
             "pickupNumber", "deliveryAppointment", "appointmentNumber",
             "deliveryReference", "shipperPoNumber",
             "pickupInstructions", "deliveryInstructions",
             "pickupHours", "deliveryHours",
             "originCompany", "originContactName", "originContactPhone",
             "destCompany", "destContactName", "destContactPhone",
             pieces, pallets, weight, "piecesTendered", "piecesReceived",
             "bolNumber", "srlBolNumber", "sealNumber", "additionalRefs",
             "customerId", "carrierId", "posterId"
      FROM loads WHERE "loadNumber" = 'SRL-121497'
    `);
    console.log(j(load));
    if (!load.length) { console.log("NO SUCH LOAD"); return; }
    const loadId = load[0].id;

    // ---- LoadStop rows for it ---------------------------------------------
    console.log("\n=== [2] SRL-121497 — LoadStop rows (the other home) ===");
    console.log(j(await prisma.$queryRawUnsafe(
      `SELECT * FROM load_stops WHERE load_id = $1 ORDER BY stop_number`, loadId)));

    // ---- Q3: audit rows ----------------------------------------------------
    console.log("\n=== [3] SRL-121497 — audit_trails (creation + every edit) ===");
    console.log(j(await prisma.$queryRawUnsafe(`
      SELECT id, action, "entityType", "entityId", "performedById",
             "changedFields", "ipAddress", "performedAt"
      FROM audit_trails WHERE "entityId" = $1 ORDER BY "performedAt" ASC`, loadId)));

    console.log("\n=== [4] SRL-121497 — audit_logs (route-level) ===");
    console.log(j(await prisma.$queryRawUnsafe(`
      SELECT id, action, entity, "entityId", "userId", changes, "createdAt"
      FROM audit_logs WHERE "entityId" = $1 ORDER BY "createdAt" ASC`, loadId)));

    console.log("\n=== [5] SRL-121497 — load_activity ===");
    console.log(j(await prisma.$queryRawUnsafe(`
      SELECT id, event_type, tender_id, metadata, created_at
      FROM load_activity WHERE load_id = $1 ORDER BY created_at ASC`, loadId)));

    // ---- documents + RC ----------------------------------------------------
    console.log("\n=== [6] SRL-121497 — documents ===");
    console.log(j(await prisma.$queryRawUnsafe(`
      SELECT id, "docType", "fileName", "entityType", "entityId", "loadId",
             status, "createdAt"
      FROM documents WHERE "loadId" = $1 ORDER BY "createdAt" ASC`, loadId)));

    console.log("\n=== [7] SRL-121497 — rate_confirmations (formData snapshot) ===");
    console.log(j(await prisma.$queryRawUnsafe(`
      SELECT id, "rateConNumber", status, "createdAt", "formData"
      FROM rate_confirmations WHERE "loadId" = $1 ORDER BY "createdAt" ASC`, loadId)));

    // ---- Q7: the other live loads -----------------------------------------
    console.log("\n=== [8] ALL live loads — stop-field divergence sweep ===");
    console.log(j(await prisma.$queryRawUnsafe(`
      SELECT "loadNumber", status,
             "pickupDate", "pickupTimeStart", "pickupTimeEnd",
             "deliveryDate", "deliveryTimeStart", "deliveryTimeEnd",
             "pickupNumber", "deliveryAppointment", "appointmentNumber",
             "originContactName", "originContactPhone",
             "destContactName", "destContactPhone",
             pieces, pallets, weight, "bolNumber", "srlBolNumber",
             (SELECT COUNT(*) FROM load_stops s WHERE s.load_id = l.id) AS stop_rows
      FROM loads l
      WHERE "deletedAt" IS NULL AND ("isTestAccount" IS NULL OR "isTestAccount" = false)
      ORDER BY "createdAt" DESC`)));

    // ---- how many loads have ANY LoadStop rows -----------------------------
    console.log("\n=== [9] LoadStop population overall ===");
    console.log(j(await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS total_stop_rows, COUNT(DISTINCT load_id) AS loads_with_stops FROM load_stops`)));

    console.log("\n=== [10] srlBolNumber / bolNumber population overall ===");
    console.log(j(await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) AS loads,
             COUNT("bolNumber") AS has_bolNumber,
             COUNT("srlBolNumber") AS has_srlBolNumber,
             COUNT("appointmentNumber") AS has_appointmentNumber,
             COUNT("deliveryAppointment") AS has_deliveryAppointment,
             COUNT("pickupTimeStart") AS has_pickupTimeStart,
             COUNT("deliveryTimeStart") AS has_deliveryTimeStart,
             COUNT(pallets) AS has_pallets, COUNT(pieces) AS has_pieces
      FROM loads WHERE "deletedAt" IS NULL`)));
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
