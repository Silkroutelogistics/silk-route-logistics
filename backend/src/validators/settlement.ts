import { z } from "zod";

export const createSettlementSchema = z.object({
  carrierId: z.string().cuid(),
  periodStart: z.string().transform((s) => new Date(s)),
  periodEnd: z.string().transform((s) => new Date(s)),
  period: z.enum(["WEEKLY", "BIWEEKLY"]),
  notes: z.string().optional(),
});

export const settlementQuerySchema = z.object({
  carrierId: z.string().optional(),
  status: z.string().optional(),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(50),
});
