/**
 * On-demand EIA fuel-index refresh — manual trigger for seeding /
 * verification without waiting for the weekly Monday-22:00-UTC cron.
 *
 * Run: cd backend && npx ts-node scripts/refresh-fuel-index.ts
 *
 * Honors env.FSC_INDEX_PROVIDER:
 *   - "eia"    (default): fetches all 7 regions from EIA Open Data API v2.
 *   - "manual":           skips fetch; cached values left in place.
 *
 * Per-region failure is reported but does NOT abort the sweep. Exit code:
 *   0 — every region either fetched successfully OR was skipped under the
 *       manual provider.
 *   1 — at least one region's EIA fetch failed (cached value preserved).
 *
 * Use cases:
 *   - First-run seeding immediately after Phase 1's table lands on prod.
 *   - Post-EIA-publish manual refresh if the Monday cron hasn't fired yet
 *     and AE wants the new week's number in cache.
 *   - Operator-side verification that EIA_API_KEY + facet IDs resolve
 *     correctly against the live API after any env or service change.
 */

import { refreshAllRegions } from "../src/services/fuelIndexService";
import { EIA_REGION_LABELS } from "../src/services/eiaRegionMap";

(async () => {
  console.log("Refreshing EIA fuel-index for all 7 regions...");
  const outcomes = await refreshAllRegions();

  const display = outcomes.map((o) => ({
    region: o.region,
    label: EIA_REGION_LABELS[o.region],
    ok: o.ok,
    price: o.indexPrice !== undefined ? `$${o.indexPrice.toFixed(3)}/gal` : "—",
    indexDate: o.indexDate ? o.indexDate.toISOString().slice(0, 10) : "—",
    note: o.note ?? "",
  }));
  console.table(display);

  // Exit code is driven purely by ok booleans — no string matching on note.
  // Manual provider returns ok=true for every region, so it exits 0 cleanly.
  const failed = outcomes.filter((o) => !o.ok);
  if (failed.length > 0) {
    console.error(`\n${failed.length} region(s) failed; cached values preserved where present.`);
    process.exit(1);
  }
  console.log("\nDone.");
  process.exit(0);
})();
