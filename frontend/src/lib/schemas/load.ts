import { z } from "zod";

const usState = z.string().length(2, "State must be 2-letter code");
const zipCode = z.string().regex(/^\d{5}(-\d{4})?$/, "Invalid ZIP code").or(z.literal(""));

/** Step 1: Origin & Destination */
export const loadStep1Schema = z.object({
  originCity: z.string().min(1, "Origin city is required"),
  originState: usState,
  originZip: zipCode.optional().or(z.literal("")),
  originAddress: z.string().optional(),
  destCity: z.string().min(1, "Destination city is required"),
  destState: usState,
  destZip: zipCode.optional().or(z.literal("")),
  destAddress: z.string().optional(),
  pickupDate: z.string().min(1, "Pickup date is required"),
  deliveryDate: z.string().optional(),
});

/** Step 2: Load Details */
export const loadStep2Schema = z.object({
  equipmentType: z.string().min(1, "Equipment type is required"),
  commodity: z.string().optional(),
  weight: z.coerce.number().positive("Weight must be positive").optional().or(z.literal(0)),
  pieces: z.coerce.number().int().nonnegative().optional(),
});

/** Step 3: Rate & Contact */
export const loadStep3Schema = z.object({
  rate: z.coerce.number().positive("Rate must be greater than 0"),
  customerRate: z.coerce.number().positive().optional(),
  rateType: z.enum(["FLAT", "PER_MILE"]).default("FLAT"),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email("Invalid email").optional().or(z.literal("")),
});

/** Full load schema for submission */
export const createLoadSchema = loadStep1Schema
  .merge(loadStep2Schema)
  .merge(loadStep3Schema)
  .extend({
    specialInstructions: z.string().optional(),
    isHazmat: z.boolean().default(false),
    isTempControlled: z.boolean().default(false),
    temperatureMin: z.coerce.number().optional(),
    temperatureMax: z.coerce.number().optional(),
    customerId: z.string().optional(),
  });

export type LoadStep1 = z.infer<typeof loadStep1Schema>;
export type LoadStep2 = z.infer<typeof loadStep2Schema>;
export type LoadStep3 = z.infer<typeof loadStep3Schema>;
export type CreateLoadInput = z.infer<typeof createLoadSchema>;
