// One-time backfill — populate Load.actualPickupDatetime / actualDeliveryDatetime
// for historical delivered loads so the Build A Compass on-time score has data
// to measure against (Build B, 2026-05-30).
//
// Sources (reliable, no trackingEvents parsing needed):
//   actualDeliveryDatetime  <-  Shipment.actualDelivery  ??  Load.podReceivedAt
//   actualPickupDatetime    <-  Shipment.actualPickup
//
// Only fills NULL columns (idempotent, never overwrites). Dry-run by default;
// pass --commit to write. Run from backend/ with DATABASE_URL set (per §2.2):
//   npx ts-node scripts/backfill-actual-event-timestamps.ts            (dry run)
//   npx ts-node scripts/backfill-actual-event-timestamps.ts --commit   (apply)

import { prisma } from "../src/config/database";

async function main() {
  const commit = process.argv.includes("--commit");
  console.log(`[backfill] mode: ${commit ? "COMMIT (writing)" : "DRY-RUN (read-only)"}`);

  const loads = await prisma.load.findMany({
    where: {
      status: { in: ["DELIVERED", "POD_RECEIVED", "COMPLETED", "INVOICED"] },
      OR: [{ actualPickupDatetime: null }, { actualDeliveryDatetime: null }],
    },
    select: {
      id: true,
      referenceNumber: true,
      podReceivedAt: true,
      actualPickupDatetime: true,
      actualDeliveryDatetime: true,
    },
  });

  console.log(`[backfill] ${loads.length} delivered loads missing at least one actual timestamp`);

  let pickupFilled = 0;
  let deliveryFilled = 0;
  let skipped = 0;

  for (const l of loads) {
    const ship = await prisma.shipment.findFirst({
      where: { loadId: l.id },
      select: { actualPickup: true, actualDelivery: true },
    });

    const updates: { actualPickupDatetime?: Date; actualDeliveryDatetime?: Date } = {};
    if (!l.actualPickupDatetime && ship?.actualPickup) {
      updates.actualPickupDatetime = ship.actualPickup;
    }
    if (!l.actualDeliveryDatetime) {
      const d = ship?.actualDelivery ?? l.podReceivedAt;
      if (d) updates.actualDeliveryDatetime = d;
    }

    if (Object.keys(updates).length === 0) {
      skipped++;
      continue;
    }
    if (updates.actualPickupDatetime) pickupFilled++;
    if (updates.actualDeliveryDatetime) deliveryFilled++;

    console.log(
      `[backfill] ${l.referenceNumber ?? l.id}` +
        (updates.actualPickupDatetime ? ` pickup<-${updates.actualPickupDatetime.toISOString()}` : "") +
        (updates.actualDeliveryDatetime ? ` delivery<-${updates.actualDeliveryDatetime.toISOString()}` : "")
    );

    if (commit) {
      await prisma.load.update({ where: { id: l.id }, data: updates });
    }
  }

  console.log(
    `[backfill] ${commit ? "WROTE" : "WOULD WRITE"} — pickupFilled=${pickupFilled} deliveryFilled=${deliveryFilled} skipped(no-source)=${skipped}`
  );
  if (!commit) console.log("[backfill] dry-run only. Re-run with --commit to apply.");
}

main()
  .catch((e) => {
    console.error("[backfill] error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
