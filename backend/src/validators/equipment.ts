import { z } from "zod";

export const createEquipmentSchema = z.object({
  unitNumber: z.string().min(1),
  type: z.string().min(1),
  year: z.number().int().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  vin: z.string().optional(),
  mileage: z.number().int().min(0).default(0),
  nextServiceDate: z.string().transform((s) => new Date(s)).optional(),
});

export const updateEquipmentSchema = z.object({
  type: z.string().optional(),
  year: z.number().int().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  vin: z.string().optional(),
  status: z.enum(["ACTIVE", "IN_SHOP", "OUT_OF_SERVICE"]).optional(),
  mileage: z.number().int().min(0).optional(),
  nextServiceDate: z.string().transform((s) => new Date(s)).optional(),
});

export const equipmentQuerySchema = z.object({
  status: z.string().optional(),
  type: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(50),
});
