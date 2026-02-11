import { z } from "zod";

const lineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive().default(1),
  rate: z.number(),
  amount: z.number(),
  type: z.enum(["LINEHAUL", "FUEL_SURCHARGE", "ACCESSORIAL", "DETENTION", "LUMPER", "OTHER"]).default("LINEHAUL"),
  sortOrder: z.number().int().default(0),
});

export const createInvoiceSchema = z.object({
  loadId: z.string().cuid(),
  amount: z.number().positive(),
  dueDate: z.string().transform((s) => new Date(s)).optional(),
  lineItems: z.array(lineItemSchema).optional(),
});

export const submitForFactoringSchema = z.object({
  advanceRate: z.number().min(0).max(100),
});

export const updateLineItemsSchema = z.object({
  lineItems: z.array(lineItemSchema).min(1),
});

export const batchInvoiceStatusSchema = z.object({
  ids: z.array(z.string().cuid()).min(1),
  status: z.enum(["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "FUNDED", "PAID", "REJECTED"]),
});
