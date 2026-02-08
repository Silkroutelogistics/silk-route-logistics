import { z } from "zod";

export const financeSummaryQuerySchema = z.object({
  period: z.enum(["monthly", "quarterly", "ytd"]).default("monthly"),
});

export const carrierSettlementQuerySchema = z.object({
  carrierId: z.string().optional(),
  status: z.string().optional(),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(50),
});
