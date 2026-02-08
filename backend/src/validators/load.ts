import { z } from "zod";

export const createLoadSchema = z.object({
  originCity: z.string().min(1),
  originState: z.string().length(2),
  originZip: z.string().min(5).max(10),
  destCity: z.string().min(1),
  destState: z.string().length(2),
  destZip: z.string().min(5).max(10),
  weight: z.number().positive().optional(),
  equipmentType: z.string().min(1),
  commodity: z.string().optional(),
  rate: z.number().positive(),
  distance: z.number().positive().optional(),
  notes: z.string().optional(),
  pickupDate: z.string().transform((s) => new Date(s)),
  deliveryDate: z.string().transform((s) => new Date(s)),
});

export const updateLoadStatusSchema = z.object({
  status: z.enum(["POSTED", "BOOKED", "IN_TRANSIT", "DELIVERED", "COMPLETED", "CANCELLED"]),
});

export const loadQuerySchema = z.object({
  status: z.string().optional(),
  originState: z.string().optional(),
  destState: z.string().optional(),
  equipmentType: z.string().optional(),
  minRate: z.coerce.number().optional(),
  maxRate: z.coerce.number().optional(),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20),
});
