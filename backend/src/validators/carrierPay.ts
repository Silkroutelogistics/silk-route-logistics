import { z } from "zod";

export const createCarrierPaySchema = z.object({
  carrierId: z.string().cuid(),
  loadId: z.string().cuid(),
  amount: z.number().positive(),
  paymentMethod: z.enum(["ACH", "CHECK", "WIRE", "QUICKPAY", "FACTORING"]).optional(),
  // Asks whether this hand-raised settlement should carry the load's frozen
  // Quick Pay fee. It never carries a percentage — the controller reads the fee
  // recorded on the load, behind the pilot / signed-agreement / enabled gate.
  //
  // v3.8.asb — `quickPayDiscountPct: z.number().min(0).max(100).default(2)` was
  // deleted from here. It was never read (the controller has taken its fee from
  // the load since the charge gate landed), and while it sat unread it declared
  // a default of 2 — a percentage on no rung of any tier for any carrier who is
  // not Gold, sitting in the request shape of a money endpoint, waiting to be
  // wired back up by someone who trusted the schema to be current. The default
  // on `isQuickPay` went with it: a money flag should be sent deliberately, not
  // supplied by a validator.
  isQuickPay: z.boolean().optional(),
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
