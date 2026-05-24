import { z } from "zod";

export const carrierRegisterSchema = z.object({
  email: z.string().email(),
  // v3.8.aix — γ "Very Strong" tier per frontend onboarding gate.
  // 14+ chars + 1 uppercase + 1 lowercase + 1 digit + 1 special.
  // Backend re-enforces composition rules as defense-in-depth (frontend
  // can be bypassed; backend is authoritative). HIBP not re-checked
  // server-side — frontend handles it.
  password: z.string()
    .min(14, "Password must be at least 14 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one digit")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  company: z.string().min(1),
  phone: z.string().min(10, "Phone number is required"),
  mcNumber: z.string().min(1, "MC number is required"),
  dotNumber: z.string().min(5, "DOT number is required (minimum 5 digits)").regex(/^\d+$/, "DOT number must be numeric"),
  equipmentTypes: z.array(z.string()).min(1),
  operatingRegions: z.array(z.string()).min(1),
  // Address (required for compliance fingerprinting)
  address: z.string().min(1, "Street address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(2, "State is required"),
  zip: z.string().min(5, "ZIP code is required"),
  // EIN/TIN (required for business verification)
  ein: z.string().regex(/^\d{9}$/, "EIN must be 9 digits").optional(),
  numberOfTrucks: z.number().int().min(1).optional(),
  // Extended insurance fields (optional at registration)
  // v3.8.aiw — Effective date pair added for COI verification
  // (effective <= today <= expiry = currently active).
  autoLiabilityProvider: z.string().optional(),
  autoLiabilityAmount: z.number().optional(),
  autoLiabilityPolicy: z.string().optional(),
  autoLiabilityEffective: z.string().optional(),
  autoLiabilityExpiry: z.string().optional(),
  cargoInsuranceProvider: z.string().optional(),
  cargoInsuranceAmount: z.number().optional(),
  cargoInsurancePolicy: z.string().optional(),
  cargoInsuranceEffective: z.string().optional(),
  cargoInsuranceExpiry: z.string().optional(),
  generalLiabilityProvider: z.string().optional(),
  generalLiabilityAmount: z.number().optional(),
  generalLiabilityPolicy: z.string().optional(),
  generalLiabilityEffective: z.string().optional(),
  generalLiabilityExpiry: z.string().optional(),
  workersCompProvider: z.string().optional(),
  workersCompAmount: z.number().optional(),
  workersCompPolicy: z.string().optional(),
  workersCompEffective: z.string().optional(),
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
