// EIA region taxonomy + state mapping for the weekly diesel-price feed.
//
// EIA publishes weekly U.S. on-highway No. 2 diesel retail prices for 7 regions:
//   NATIONAL — U.S. average
//   PADD1    — East Coast (CT, DE, DC, FL, GA, ME, MD, MA, NH, NJ, NY, NC, PA, RI, SC, VT, VA, WV)
//   PADD2    — Midwest    (IL, IN, IA, KS, KY, MI, MN, MO, NE, ND, OH, OK, SD, TN, WI)
//   PADD3    — Gulf Coast (AL, AR, LA, MS, NM, TX)
//   PADD4    — Rocky Mtn  (CO, ID, MT, UT, WY)
//   PADD5    — West Coast (AK, AZ, HI, NV, OR, WA — NOT CA)
//   CA       — California (published separately; CARB diesel runs $0.50-$1.00/gal higher than national)
//
// Taxonomy-drift note (§13.3 Item 7 / Pattern 7 spatial drift candidate):
// Two other state-to-region helpers already exist in this codebase —
// `backend/src/constants/regions.ts` (US_REGIONS taxonomy: GREAT_LAKES / SOUTHEAST / WEST / etc.)
// and `backend/src/services/regionMap.ts` (UI-facing region groups).
// Neither matches the EIA PADD taxonomy, so this helper is the third — by necessity, not preference.
// Reconciliation of the three taxonomies is out of scope for the EIA-feed sprint.

export type EiaRegion = "NATIONAL" | "PADD1" | "PADD2" | "PADD3" | "PADD4" | "PADD5" | "CA";

export const EIA_REGIONS: readonly EiaRegion[] = [
  "NATIONAL",
  "PADD1",
  "PADD2",
  "PADD3",
  "PADD4",
  "PADD5",
  "CA",
] as const;

const STATE_TO_REGION: Record<string, EiaRegion> = {
  // PADD 1 — East Coast
  CT: "PADD1", DE: "PADD1", DC: "PADD1", FL: "PADD1", GA: "PADD1",
  ME: "PADD1", MD: "PADD1", MA: "PADD1", NH: "PADD1", NJ: "PADD1",
  NY: "PADD1", NC: "PADD1", PA: "PADD1", RI: "PADD1", SC: "PADD1",
  VT: "PADD1", VA: "PADD1", WV: "PADD1",
  // PADD 2 — Midwest
  IL: "PADD2", IN: "PADD2", IA: "PADD2", KS: "PADD2", KY: "PADD2",
  MI: "PADD2", MN: "PADD2", MO: "PADD2", NE: "PADD2", ND: "PADD2",
  OH: "PADD2", OK: "PADD2", SD: "PADD2", TN: "PADD2", WI: "PADD2",
  // PADD 3 — Gulf Coast
  AL: "PADD3", AR: "PADD3", LA: "PADD3", MS: "PADD3", NM: "PADD3", TX: "PADD3",
  // PADD 4 — Rocky Mountain
  CO: "PADD4", ID: "PADD4", MT: "PADD4", UT: "PADD4", WY: "PADD4",
  // PADD 5 — West Coast (CA published separately, see below)
  AK: "PADD5", AZ: "PADD5", HI: "PADD5", NV: "PADD5", OR: "PADD5", WA: "PADD5",
  // California — its own EIA series due to CARB diesel pricing
  CA: "CA",
};

/**
 * Map a two-letter U.S. state code to its EIA region. Unknown or missing state → NATIONAL fallback.
 * Used by the FSC pipeline to look up this week's diesel price for the load's origin region
 * before the existing fuelSurchargeTableService.lookupFuelSurcharge converts it to a per-mile rate.
 */
export function stateToEiaRegion(state: string | null | undefined): EiaRegion {
  if (!state) return "NATIONAL";
  const s = state.trim().toUpperCase();
  return STATE_TO_REGION[s] ?? "NATIONAL";
}

/**
 * Human-readable description for each EIA region. UI / admin / log surfaces.
 */
export const EIA_REGION_LABELS: Record<EiaRegion, string> = {
  NATIONAL: "U.S. National Average",
  PADD1: "East Coast (PADD 1)",
  PADD2: "Midwest (PADD 2)",
  PADD3: "Gulf Coast (PADD 3)",
  PADD4: "Rocky Mountain (PADD 4)",
  PADD5: "West Coast excl. California (PADD 5)",
  CA: "California",
};
