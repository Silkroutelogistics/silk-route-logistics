import { z } from "zod";

export const createInvoiceSchema = z.object({
  loadId: z.string().cuid(),
  amount: z.number().positive(),
  dueDate: z.string().transform((s) => new Date(s)).optional(),
});

export const submitForFactoringSchema = z.object({
  advanceRate: z.number().min(0).max(100),
});
