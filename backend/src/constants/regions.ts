// US Regions
export const US_REGIONS: Record<string, string[]> = {
  GREAT_LAKES: ["MI", "OH", "IN", "IL", "WI", "MN"],
  UPPER_MIDWEST: ["IA", "MO", "NE", "KS", "SD", "ND"],
  SOUTHEAST: ["KY", "TN", "GA", "AL", "FL", "SC", "NC"],
  NORTHEAST: ["NY", "PA", "NJ", "CT", "MA", "ME", "VT", "NH", "RI", "DE", "MD", "VA", "WV", "DC"],
  SOUTH_CENTRAL: ["TX", "OK", "AR", "LA", "MS"],
  WEST: ["CA", "AZ", "NV", "OR", "WA", "CO", "UT", "NM", "ID", "MT", "WY", "HI", "AK"],
};

// Canadian Regions
export const CA_REGIONS: Record<string, string[]> = {
  EASTERN_CANADA: ["ON", "QC", "NB", "NS", "PE", "NL"],
  WESTERN_CANADA: ["BC", "AB"],
  CENTRAL_CANADA: ["MB", "SK"],
};

// Combined for backward compatibility
export const REGIONS: Record<string, string[]> = {
  ...US_REGIONS,
  ...CA_REGIONS,
};

// Display names
export const REGION_DISPLAY_NAMES: Record<string, string> = {
  GREAT_LAKES: "Great Lakes",
  UPPER_MIDWEST: "Upper Midwest",
  SOUTHEAST: "Southeast",
  NORTHEAST: "Northeast",
  SOUTH_CENTRAL: "South Central",
  WEST: "West",
  EASTERN_CANADA: "Eastern Canada",
  WESTERN_CANADA: "Western Canada",
  CENTRAL_CANADA: "Central Canada",
};

export function getStatesForRegion(region: string): string[] {
  return REGIONS[region] || [];
}

export function getRegionForState(state: string): string | null {
  for (const [region, states] of Object.entries(REGIONS)) {
    if (states.includes(state)) return region;
  }
  return null;
}

export const CANADIAN_PROVINCES = ["AB", "BC", "MB", "NB", "NL", "NT", "NS", "NU", "ON", "PE", "QC", "SK", "YT"];
