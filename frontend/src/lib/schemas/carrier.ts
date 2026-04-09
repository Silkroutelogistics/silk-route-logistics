import { z } from "zod";

export const carrierSetupSchema = z.object({
  dotNumber: z.string().min(1, "DOT number is required").regex(/^\d{5,8}$/, "DOT must be 5-8 digits"),
  mcNumber: z.string().min(1, "MC number is required").regex(/^\d{5,8}$/, "MC must be 5-8 digits"),
  company: z.string().optional(),
  equipmentTypes: z.array(z.string()).min(1, "Select at least one equipment type"),
  operatingRegions: z.array(z.string()).min(1, "Select at least one region"),
  numberOfTrucks: z.coerce.number().int().positive().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().max(2).optional(),
  zip: z.string().regex(/^\d{5}(-\d{4})?$/, "Invalid ZIP").optional().or(z.literal("")),
});

export const shipperRegistrationSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  industry: z.string().min(1, "Industry is required"),
  email: z.string().email("Invalid email"),
  phone: z.string().min(10, "Phone must be at least 10 digits"),
  contactName: z.string().min(1, "Contact name is required"),
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .regex(/[A-Z]/, "Must contain an uppercase letter")
    .regex(/[0-9]/, "Must contain a number"),
});

export type CarrierSetupInput = z.infer<typeof carrierSetupSchema>;
export type ShipperRegistrationInput = z.infer<typeof shipperRegistrationSchema>;
