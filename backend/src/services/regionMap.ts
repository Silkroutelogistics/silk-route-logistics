/**
 * US + Canada region mapping for Track & Trace board filter.
 * Maps state/province code → region label used in the UI dropdown.
 */

export const REGIONS = [
  "Northeast",
  "Southeast",
  "Midwest",
  "Great Lakes",
  "Southwest",
  "West Coast",
  "Upper Midwest",
  "Central Canada",
  "Eastern Canada",
] as const;

export type Region = typeof REGIONS[number];

const STATE_REGION: Record<string, Region> = {
  // Northeast
  ME: "Northeast", NH: "Northeast", VT: "Northeast", MA: "Northeast",
  RI: "Northeast", CT: "Northeast", NY: "Northeast", NJ: "Northeast",
  PA: "Northeast",
  // Southeast
  DE: "Southeast", MD: "Southeast", DC: "Southeast", VA: "Southeast",
  WV: "Southeast", NC: "Southeast", SC: "Southeast", GA: "Southeast",
  FL: "Southeast", AL: "Southeast", TN: "Southeast", KY: "Southeast",
  MS: "Southeast", AR: "Southeast", LA: "Southeast",
  // Midwest
  OH: "Midwest", IN: "Midwest", IL: "Midwest", MO: "Midwest",
  // Great Lakes
  MI: "Great Lakes", WI: "Great Lakes",
  // Upper Midwest
  MN: "Upper Midwest", IA: "Upper Midwest", ND: "Upper Midwest",
  SD: "Upper Midwest", NE: "Upper Midwest", KS: "Upper Midwest",
  // Southwest
  TX: "Southwest", OK: "Southwest", NM: "Southwest", AZ: "Southwest",
  // West Coast
  CA: "West Coast", OR: "West Coast", WA: "West Coast", NV: "West Coast",
  ID: "West Coast", UT: "West Coast", MT: "West Coast", WY: "West Coast",
  CO: "West Coast", AK: "West Coast", HI: "West Coast",
  // Central Canada
  MB: "Central Canada", SK: "Central Canada", AB: "Central Canada", BC: "Central Canada",
  // Eastern Canada
  ON: "Eastern Canada", QC: "Eastern Canada", NB: "Eastern Canada",
  NS: "Eastern Canada", PE: "Eastern Canada", NL: "Eastern Canada",
};

export function stateToRegion(state: string | null | undefined): Region | null {
  if (!state) return null;
  return STATE_REGION[state.toUpperCase()] ?? null;
}

export function statesInRegion(region: string): string[] {
  return Object.entries(STATE_REGION).filter(([, r]) => r === region).map(([s]) => s);
}
