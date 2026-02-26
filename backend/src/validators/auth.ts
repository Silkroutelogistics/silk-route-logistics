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

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});
