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

export { REGIONS, getStatesForRegion, getRegionForState } from "../constants/regions";
