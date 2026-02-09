import { z } from "zod";

// ─── Truck Schemas ───────────────────────────────────────

export const createTruckSchema = z.object({
  unitNumber: z.string().min(1),
  type: z.enum(["DAY_CAB", "SLEEPER", "STRAIGHT", "BOX_TRUCK"]).default("SLEEPER"),
  year: z.number().int().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  vin: z.string().optional(),
  licensePlate: z.string().optional(),
  licensePlateState: z.string().optional(),
  color: z.string().optional(),
  fuelType: z.string().optional(),
  ownershipType: z.enum(["COMPANY", "LEASED", "OWNER_OPERATOR"]).optional(),
  mileage: z.number().int().optional(),
  registrationExpiry: z.string().transform((s) => new Date(s)).optional(),
  insuranceExpiry: z.string().transform((s) => new Date(s)).optional(),
  nextServiceDate: z.string().transform((s) => new Date(s)).optional(),
  nextServiceMileage: z.number().int().optional(),
});

export const updateTruckSchema = z.object({
  unitNumber: z.string().min(1).optional(),
  type: z.enum(["DAY_CAB", "SLEEPER", "STRAIGHT", "BOX_TRUCK"]).optional(),
  year: z.number().int().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  vin: z.string().optional(),
  licensePlate: z.string().optional(),
  licensePlateState: z.string().optional(),
  color: z.string().optional(),
  fuelType: z.string().optional(),
  ownershipType: z.enum(["COMPANY", "LEASED", "OWNER_OPERATOR"]).optional(),
  status: z.enum(["ACTIVE", "IN_SHOP", "OUT_OF_SERVICE", "SOLD"]).optional(),
  mileage: z.number().int().optional(),
  registrationExpiry: z.string().transform((s) => new Date(s)).optional(),
  insuranceExpiry: z.string().transform((s) => new Date(s)).optional(),
  nextServiceDate: z.string().transform((s) => new Date(s)).optional(),
  nextServiceMileage: z.number().int().optional(),
});

// ─── Trailer Schemas ─────────────────────────────────────

export const createTrailerSchema = z.object({
  unitNumber: z.string().min(1),
  type: z.enum([
    "DRY_VAN", "REEFER", "FLATBED", "STEP_DECK",
    "LOWBOY", "TANKER", "CAR_HAULER", "CONESTOGA", "POWER_ONLY",
  ]).default("DRY_VAN"),
  year: z.number().int().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  vin: z.string().optional(),
  licensePlate: z.string().optional(),
  licensePlateState: z.string().optional(),
  length: z.number().int().optional(),
  capacity: z.number().int().optional(),
  ownershipType: z.enum(["COMPANY", "LEASED", "OWNER_OPERATOR"]).optional(),
  registrationExpiry: z.string().transform((s) => new Date(s)).optional(),
  reeferUnit: z.boolean().optional(),
  reeferModel: z.string().optional(),
  reeferHours: z.number().int().optional(),
});

export const updateTrailerSchema = z.object({
  unitNumber: z.string().min(1).optional(),
  type: z.enum([
    "DRY_VAN", "REEFER", "FLATBED", "STEP_DECK",
    "LOWBOY", "TANKER", "CAR_HAULER", "CONESTOGA", "POWER_ONLY",
  ]).optional(),
  year: z.number().int().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  vin: z.string().optional(),
  licensePlate: z.string().optional(),
  licensePlateState: z.string().optional(),
  length: z.number().int().optional(),
  capacity: z.number().int().optional(),
  ownershipType: z.enum(["COMPANY", "LEASED", "OWNER_OPERATOR"]).optional(),
  status: z.enum(["ACTIVE", "IN_SHOP", "OUT_OF_SERVICE", "SOLD"]).optional(),
  registrationExpiry: z.string().transform((s) => new Date(s)).optional(),
  reeferUnit: z.boolean().optional(),
  reeferModel: z.string().optional(),
  reeferHours: z.number().int().optional(),
});

// ─── Query Schemas ───────────────────────────────────────

export const truckQuerySchema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20),
  status: z.string().optional(),
  type: z.string().optional(),
  search: z.string().optional(),
});

export const trailerQuerySchema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20),
  status: z.string().optional(),
  type: z.string().optional(),
  search: z.string().optional(),
});
