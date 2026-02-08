import { z } from "zod";

export const createTenderSchema = z.object({
  carrierId: z.string(),
  offeredRate: z.number().positive(),
  expiresAt: z.string().transform((s) => new Date(s)),
});

export const counterTenderSchema = z.object({
  counterRate: z.number().positive(),
});
