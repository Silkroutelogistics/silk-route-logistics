/**
 * One-time data migration (v3.8.d.2): decode HTML entities in Load fields
 * that were written through the pre-v3.8.d.2 sanitizeInput middleware.
 *
 * The old middleware HTML-escaped every req.body string (& → &amp;,
 * ' → &#x27;, etc.) for XSS defense, on the theory that storing escaped
 * data is safe. The middleware is rewritten in v3.8.d.2 to stop doing
 * this — but existing rows still hold encoded values. This script walks
 * the loads table and decodes the user-visible string fields in place.
 *
 * Run: cd backend && npx ts-node scripts/decode-encoded-load-fields.ts
 *
 * Idempotent — running it twice is harmless; decoded values contain no
 * "&...;" patterns to re-decode.
 *
 * Scoped to the loads table only. Other tables (customers, carriers,
 * messages, etc.) likely have the same issue — extend this script's
 * field list, or add a sibling script per table, when a real symptom
 * surfaces. We are not pre-emptively touching tables that haven't been
 * audited.
 */
import { prisma } from "../src/config/database";
import { decodeHtmlEntities } from "../src/utils/htmlEntities";

const FIELDS_TO_DECODE = [
  "equipmentType",
  "commodity",
  "originCompany",
  "originAddress",
  "originContactName",
  "destCompany",
  "destAddress",
  "destContactName",
  "shipperFacility",
  "consigneeFacility",
  "shipperReference",
  "shipperPoNumber",
  "customerRef",
  "specialInstructions",
  "notes",
  "pickupInstructions",
  "deliveryInstructions",
  "driverName",
  "carrierDispatcherName",
] as const;

async function main() {
  console.log("Scanning loads table for HTML-encoded values...");

  const loads = await prisma.load.findMany({
    where: {
      OR: FIELDS_TO_DECODE.map((field) => ({
        [field]: { contains: "&" },
      })),
    },
    select: { id: true, referenceNumber: true, ...Object.fromEntries(FIELDS_TO_DECODE.map((f) => [f, true])) },
  });

  console.log(`Found ${loads.length} candidate loads with '&' in at least one tracked field.`);

  let updated = 0;
  let skipped = 0;

  for (const load of loads) {
    const data: Record<string, string | null> = {};
    let hasChange = false;

    for (const field of FIELDS_TO_DECODE) {
      const original = (load as Record<string, unknown>)[field];
      if (typeof original === "string") {
        const decoded = decodeHtmlEntities(original);
        if (decoded !== original) {
          data[field] = decoded;
          hasChange = true;
        }
      }
    }

    if (!hasChange) {
      skipped++;
      continue;
    }

    await prisma.load.update({
      where: { id: load.id },
      data,
    });
    updated++;

    if (updated <= 20 || updated % 50 === 0) {
      const ref = load.referenceNumber;
      const before = (load as Record<string, unknown>).equipmentType;
      const after = data.equipmentType ?? before;
      console.log(`  ${ref}: equipmentType "${before}" → "${after}"`);
    }
  }

  console.log("\nDone.");
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped (no entities found): ${skipped}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
