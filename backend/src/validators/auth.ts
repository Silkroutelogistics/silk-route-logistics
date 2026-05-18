import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10, "Password must be at least 10 characters"),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  company: z.string().optional(),
  role: z.enum(["CARRIER", "BROKER", "SHIPPER", "FACTOR"]),
  phone: z.string().optional(),
  mcNumber: z.string().optional(),
  dotNumber: z.string().optional(),
});

// Sprint 174 (v3.8.acf) — Portal-boundary role gate. Optional
// expectedRole param identifies which portal initiated the login so
// the controller can reject cross-portal credential entry (e.g.,
// CARRIER creds used on /shipper/login). "AE" maps to the set
// {ADMIN, CEO, BROKER, DISPATCH, OPERATIONS, ACCOUNTING}; "SHIPPER"
// maps to the single SHIPPER role. Carrier portal flow is unaffected —
// it uses /api/carrier-auth/* which has its own gate.
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  expectedRole: z.enum(["AE", "SHIPPER"]).optional(),
});
