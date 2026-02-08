import { z } from "zod";

export const createCustomerSchema = z.object({
  name: z.string().min(1),
  contactName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  creditLimit: z.number().positive().optional(),
  paymentTerms: z.string().optional(),
  notes: z.string().optional(),
  rating: z.number().int().min(0).max(5).optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial().extend({
  status: z.string().optional(),
});

export const customerQuerySchema = z.object({
  status: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(50),
});
