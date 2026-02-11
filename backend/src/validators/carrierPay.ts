import { z } from "zod";

export const createCarrierPaySchema = z.object({
  carrierId: z.string().cuid(),
  loadId: z.string().cuid(),
  amount: z.number().positive(),
  paymentMethod: z.enum(["ACH", "CHECK", "WIRE", "QUICKPAY", "FACTORING"]).optional(),
  isQuickPay: z.boolean().default(false),
  quickPayDiscountPct: z.number().min(0).max(100).default(2),
  scheduledDate: z.string().transform((s) => new Date(s)).optional(),
  notes: z.string().optional(),
});

export const updateCarrierPaySchema = z.object({
  status: z.enum(["PENDING", "SCHEDULED", "PROCESSING", "PAID", "VOID"]).optional(),
  paymentMethod: z.enum(["ACH", "CHECK", "WIRE", "QUICKPAY", "FACTORING"]).optional(),
  checkNumber: z.string().optional(),
  referenceNumber: z.string().optional(),
  scheduledDate: z.string().transform((s) => new Date(s)).optional(),
  notes: z.string().optional(),
});

export const batchCarrierPaySchema = z.object({
  ids: z.array(z.string().cuid()).min(1),
  action: z.enum(["SCHEDULE", "PROCESS", "PAY", "VOID"]),
});

export const carrierPayQuerySchema = z.object({
  carrierId: z.string().optional(),
  status: z.string().optional(),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(50),
});
