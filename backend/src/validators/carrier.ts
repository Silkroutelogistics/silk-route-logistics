import { z } from "zod";

export const carrierRegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  company: z.string().min(1),
  phone: z.string().optional(),
  mcNumber: z.string().min(1, "MC number is required"),
  dotNumber: z.string().min(5, "DOT number is required (minimum 5 digits)").regex(/^\d+$/, "DOT number must be numeric"),
  equipmentTypes: z.array(z.string()).min(1),
  operatingRegions: z.array(z.string()).min(1),
  // Extended insurance fields (optional at registration)
  autoLiabilityProvider: z.string().optional(),
  autoLiabilityAmount: z.number().optional(),
  autoLiabilityPolicy: z.string().optional(),
  autoLiabilityExpiry: z.string().optional(),
  cargoInsuranceProvider: z.string().optional(),
  cargoInsuranceAmount: z.number().optional(),
  cargoInsurancePolicy: z.string().optional(),
  cargoInsuranceExpiry: z.string().optional(),
  generalLiabilityProvider: z.string().optional(),
  generalLiabilityAmount: z.number().optional(),
  generalLiabilityPolicy: z.string().optional(),
  generalLiabilityExpiry: z.string().optional(),
  workersCompProvider: z.string().optional(),
  workersCompAmount: z.number().optional(),
  workersCompPolicy: z.string().optional(),
  workersCompExpiry: z.string().optional(),
  additionalInsuredSRL: z.boolean().optional(),
  waiverOfSubrogation: z.boolean().optional(),
  thirtyDayCancellationNotice: z.boolean().optional(),
  // Insurance Agent Contact
  insuranceAgentName: z.string().optional(),
  insuranceAgentEmail: z.string().email().optional().or(z.literal("")),
  insuranceAgentPhone: z.string().optional(),
  insuranceAgencyName: z.string().optional(),
});

export const verifyCarrierSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  safetyScore: z.number().min(0).max(100).optional(),
  notes: z.string().optional(),
});
