import { z } from "zod";

export const createDriverSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  licenseType: z.string().min(1),
  licenseNumber: z.string().optional(),
  licenseExpiry: z.string().transform((s) => new Date(s)).optional(),
  hireDate: z.string().transform((s) => new Date(s)).optional(),
  hosCycleLimit: z.number().positive().default(70),
});

export const updateDriverSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  licenseType: z.string().optional(),
  licenseNumber: z.string().optional(),
  licenseExpiry: z.string().transform((s) => new Date(s)).optional(),
  status: z.enum(["AVAILABLE", "ON_ROUTE", "OFF_DUTY", "SLEEPER", "INACTIVE"]).optional(),
  currentLocation: z.string().optional(),
  safetyScore: z.number().min(0).max(100).optional(),
  violations: z.number().int().min(0).optional(),
});

export const updateDriverHOSSchema = z.object({
  hosDrivingUsed: z.number().min(0),
  hosOnDutyUsed: z.number().min(0),
  hosCycleUsed: z.number().min(0),
});

export const assignEquipmentSchema = z.object({
  assignedEquipmentId: z.string().nullable(),
});

export const driverQuerySchema = z.object({
  status: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(50),
});
