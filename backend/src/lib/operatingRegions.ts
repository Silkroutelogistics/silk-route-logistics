/**
 * What a carrier means when they say they run "the Great Lakes".
 *
 * WHY THIS EXISTS. `waterfallScoringService` filtered carriers by comparing the
 * REGION NAME to the load's two-letter STATE CODE with `includes()`:
 *
 *     "NORTHEAST".includes("NH")   // false — a Northeast carrier, a New Hampshire load
 *     "NORTHEAST".includes("OR")   // TRUE  — a Northeast carrier, an OREGON load
 *
 * Computed across the ten regions onboarding offers and all fifty states:
 * **41 of 50 states can never be matched by any region a carrier can select**,
 * and the nine that can match do so by coincidence — "Great Lakes" matches
 * Alaska and Louisiana, "Cross-Border" matches Delaware, "Southeast" matches
 * Utah. Onboarding REQUIRES at least one region (`canNext` step 1), so every
 * carrier who signs up through the portal has a non-empty list and was
 * therefore excluded from essentially every waterfall. Together with the
 * cppTier floor this is why auto-dispatch had no reachable carriers even after
 * the Arc 16 accept fix. (§13.3 Item 223.)
 *
 * THE VOCABULARY IS FIXED BY THE FORM, NOT CHOSEN HERE. The ten names below are
 * exactly `regionOptions` in `frontend/src/app/onboarding/page.tsx`. If that
 * list changes, this map changes with it, and `unmappedRegions()` exists so a
 * test can say so out loud rather than letting a new option silently mean
 * "nationwide".
 *
 * BOUNDARIES ARE DELIBERATELY GENEROUS, AND THE DIRECTION MATTERS. A carrier
 * offered a lane just outside their stated area declines it, and the decline is
 * recorded. A carrier never offered a lane they would have run is invisible —
 * SRL loses the load and never learns why. Where a state plausibly belongs to
 * two regions it is listed in both; membership is a union, not a partition.
 *
 * TWO BOUNDARIES ARE GENUINELY ARGUABLE AND ARE FLAGGED FOR RATIFICATION rather
 * than settled here:
 *   - MN and NY sit in both Great Lakes and their neighbour region.
 *   - "Central Canada" in Canadian usage IS Ontario + Quebec, which makes it a
 *     subset of "Eastern Canada" as freight uses that term. Both are mapped as
 *     written; if SRL means something narrower by one of them, change it here.
 *
 * UNRECOGNISED REGIONS FAIL OPEN. An unknown string yields no states, and a
 * carrier whose regions are all unknown is treated as nationwide — the same
 * treatment `waterfallScoringService` already gives an empty list. That is the
 * safe direction for a filter that has just been shown to be capable of
 * excluding everyone.
 */

/** Canonical map. Keys are compared case-insensitively and whitespace-trimmed. */
const REGION_STATES: Record<string, string[]> = {
  "great lakes": ["IL", "IN", "MI", "MN", "NY", "OH", "PA", "WI"],
  "upper midwest": ["IA", "MN", "MT", "ND", "NE", "SD", "WI", "WY"],
  southeast: ["AL", "AR", "FL", "GA", "KY", "LA", "MS", "NC", "SC", "TN", "VA", "WV"],
  northeast: ["CT", "DC", "DE", "MA", "MD", "ME", "NH", "NJ", "NY", "PA", "RI", "VT"],
  "south central": ["AR", "KS", "LA", "MO", "NM", "OK", "TX"],
  west: ["AK", "AZ", "CA", "CO", "HI", "ID", "MT", "NM", "NV", "OR", "UT", "WA", "WY"],
  "eastern canada": ["NB", "NL", "NS", "ON", "PE", "QC"],
  "western canada": ["AB", "BC", "MB", "NT", "NU", "SK", "YT"],
  "central canada": ["ON", "QC"],
  // Cross-Border is not a place. A carrier who selects it is telling us they
  // will run international lanes, which says nothing about which states they
  // exclude — so it constrains nothing.
  "cross-border": [],
};

/** Regions that mean "no geographic constraint" rather than "nowhere". */
const UNCONSTRAINED = new Set(["cross-border"]);

const norm = (s: string) => (s || "").trim().toLowerCase();

/** The states a single region covers. Empty for unknown or unconstrained regions. */
export function statesForRegion(region: string): string[] {
  return REGION_STATES[norm(region)] ?? [];
}

/** True when this region imposes no geographic limit at all. */
export function isUnconstrainedRegion(region: string): boolean {
  return UNCONSTRAINED.has(norm(region));
}

/**
 * Does a carrier publishing `regions` cover a lane touching any of `states`?
 *
 * Coverage is ORIGIN-OR-DESTINATION, matching the prior intent: a carrier who
 * runs the Northeast can take a load out of the Northeast even if it delivers
 * elsewhere.
 *
 * Returns true when the carrier publishes no regions, only unknown regions, or
 * any unconstrained region — all three mean "do not filter on geography".
 */
export function regionsCoverLane(regions: string[] | null | undefined, states: (string | null | undefined)[]): boolean {
  if (!regions || regions.length === 0) return true;
  if (regions.some(isUnconstrainedRegion)) return true;

  const covered = new Set<string>();
  let anyKnown = false;
  for (const r of regions) {
    const st = statesForRegion(r);
    if (REGION_STATES[norm(r)] !== undefined) anyKnown = true;
    for (const s of st) covered.add(s);
  }
  // Every region the carrier listed is a string this map has never heard of.
  // Excluding them would repeat the original defect on a smaller scale.
  if (!anyKnown) return true;

  return states.some((s) => s && covered.has(s.toUpperCase()));
}

/** Region names present in `candidates` that this map does not know. For tests. */
export function unmappedRegions(candidates: string[]): string[] {
  return candidates.filter((r) => REGION_STATES[norm(r)] === undefined);
}

/** The vocabulary this map covers, for tests that compare it to the form's. */
export const KNOWN_REGIONS = Object.keys(REGION_STATES);
