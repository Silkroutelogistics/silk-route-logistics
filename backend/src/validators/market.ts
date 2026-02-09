import { z } from "zod";

export const laneQuerySchema = z.object({
  region: z.string().optional(),
  equipmentType: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20),
});

export const trendQuerySchema = z.object({
  originState: z.string().optional(),
  destState: z.string().optional(),
  region: z.string().optional(),
  granularity: z.enum(["weekly", "monthly"]).default("weekly"),
  months: z.coerce.number().default(3),
});

export const capacityQuerySchema = z.object({
  region: z.string().optional(),
  equipmentType: z.string().optional(),
});

export const REGIONS: Record<string, string[]> = {
  GREAT_LAKES: ["MI", "OH", "IN", "IL", "WI", "MN"],
  UPPER_MIDWEST: ["IA", "MO", "NE", "KS", "SD", "ND"],
  SOUTHEAST: ["KY", "TN", "GA", "AL", "FL", "SC", "NC"],
  NORTHEAST: ["NY", "PA", "NJ", "CT", "MA"],
  SOUTH_CENTRAL: ["TX", "OK", "AR", "LA"],
  WEST: ["CA", "AZ", "NV", "OR", "WA", "CO"],
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
