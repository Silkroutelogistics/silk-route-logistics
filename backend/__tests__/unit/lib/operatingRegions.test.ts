// The waterfall's region filter must actually match lanes.
//
// It compared the carrier's REGION NAME to the load's two-letter STATE CODE
// with includes(). "NORTHEAST".includes("NH") is false; "NORTHEAST".includes("OR")
// is true. Onboarding REQUIRES a region, so every portal-onboarded carrier was
// excluded from essentially every waterfall — and the few that matched were the
// wrong carriers. §13.3 Item 223.
//
// The proof that found it (scripts/_arc17-waterfall-flight.ts) needs a real
// database and does not run in CI. This is the CI-resident half: it pins the
// arithmetic that made the old comparison wrong, so the defect cannot return
// quietly.

import { describe, it, expect } from "vitest";
import {
  regionsCoverLane,
  statesForRegion,
  unmappedRegions,
  KNOWN_REGIONS,
} from "../../../src/lib/operatingRegions";

// Verbatim from frontend/src/app/onboarding/page.tsx `regionOptions`. If the
// form changes, this list changes and the vocabulary test below fails — which
// is the point: a new option must not silently mean "nationwide".
const FORM_REGIONS = [
  "Great Lakes", "Upper Midwest", "Southeast", "Northeast", "South Central",
  "West", "Eastern Canada", "Western Canada", "Central Canada", "Cross-Border",
];

const ALL_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS",
  "KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY",
  "NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

describe("operating regions", () => {
  it("knows every region the onboarding form can produce", () => {
    const unknown = unmappedRegions(FORM_REGIONS);
    expect(unknown, `the form offers regions this map has never heard of: ${unknown.join(", ")}`).toEqual([]);
  });

  it("covers every US state through at least one region", () => {
    const covered = new Set(KNOWN_REGIONS.flatMap((r) => statesForRegion(r)));
    const orphans = ALL_STATES.filter((s) => !covered.has(s));
    expect(orphans, `no carrier could ever be matched to a load in: ${orphans.join(", ")}`).toEqual([]);
  });

  it("matches the lane the old substring compare could not — Northeast/NH", () => {
    // The canonical failure. "NORTHEAST".includes("NH") === false.
    expect(regionsCoverLane(["Northeast"], ["NH", "TX"])).toBe(true);
  });

  it("rejects the lane the old substring compare wrongly matched — Northeast/OR", () => {
    // "NORTHEAST".includes("OR") === true. A Northeast carrier is not an
    // Oregon carrier, and offering them that load was the visible symptom.
    expect(regionsCoverLane(["Northeast"], ["OR", "WA"])).toBe(false);
  });

  it("rejects the other coincidences the substring compare produced", () => {
    // Each of these was a TRUE match under includes(), and each is wrong.
    expect(regionsCoverLane(["Great Lakes"], ["AK"])).toBe(false);   // "GREAT LAKES".includes("AK")
    expect(regionsCoverLane(["Southeast"], ["UT"])).toBe(false);     // "SOUTHEAST".includes("UT")
    expect(regionsCoverLane(["Cross-Border"], ["DE"])).toBe(true);   // unconstrained — true for a DIFFERENT reason
    expect(regionsCoverLane(["Central Canada"], ["AL"])).toBe(false); // "CENTRAL CANADA".includes("AL")
  });

  it("matches on origin OR destination, not both", () => {
    expect(regionsCoverLane(["Southeast"], ["GA", "WA"])).toBe(true);  // origin
    expect(regionsCoverLane(["West"], ["GA", "WA"])).toBe(true);       // destination
    expect(regionsCoverLane(["Upper Midwest"], ["GA", "WA"])).toBe(false);
  });

  it("fails OPEN — no regions, unknown regions, or Cross-Border never exclude", () => {
    // A filter that has just been shown capable of excluding everyone must not
    // exclude on ignorance. Offering a carrier a lane they will decline costs a
    // decline; never offering it costs the load and is invisible.
    expect(regionsCoverLane([], ["NH"])).toBe(true);
    expect(regionsCoverLane(null, ["NH"])).toBe(true);
    expect(regionsCoverLane(["Neptune"], ["NH"])).toBe(true);
    expect(regionsCoverLane(["Cross-Border"], ["NH"])).toBe(true);
  });

  it("a partly-unknown region list still filters on the part it knows", () => {
    // Fail-open applies when NOTHING is recognised. One good region is a real
    // constraint and must still be honoured, or a typo would disable the filter.
    expect(regionsCoverLane(["Northeast", "Neptune"], ["NH"])).toBe(true);
    expect(regionsCoverLane(["Northeast", "Neptune"], ["CA"])).toBe(false);
  });

  it("is case- and whitespace-insensitive, since these are stored form strings", () => {
    expect(regionsCoverLane(["  northeast "], ["NH"])).toBe(true);
    expect(regionsCoverLane(["GREAT LAKES"], ["MI"])).toBe(true);
  });
});
