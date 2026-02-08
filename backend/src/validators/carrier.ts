import { z } from "zod";

export const carrierRegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  company: z.string().min(1),
  phone: z.string().optional(),
  mcNumber: z.string().optional(),
  dotNumber: z.string().optional(),
  equipmentTypes: z.array(z.string()).min(1),
  operatingRegions: z.array(z.string()).min(1),
});

export const verifyCarrierSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  safetyScore: z.number().min(0).max(100).optional(),
});
