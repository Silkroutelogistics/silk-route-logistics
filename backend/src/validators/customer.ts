import { z } from "zod";

export const createCustomerSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["SHIPPER", "BROKER", "MANUFACTURER", "DISTRIBUTOR", "RETAILER", "GOVERNMENT", "OTHER"]).optional(),
  contactName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  industry: z.string().optional(),
  industryType: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  billingAddress: z.string().optional(),
  billingCity: z.string().optional(),
  billingState: z.string().optional(),
  billingZip: z.string().optional(),
  creditLimit: z.number().positive().optional(),
  paymentTerms: z.string().optional(),
  taxId: z.string().optional(),
  notes: z.string().optional(),
  rating: z.number().int().min(0).max(5).optional(),
  accountRepId: z.string().nullable().optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial().extend({
  status: z.string().optional(),
});

export const customerQuerySchema = z.object({
  status: z.string().optional(),
  search: z.string().optional(),
  industry: z.string().optional(),
  city: z.string().optional(),
  // context partitions the unified customers table:
  //   "crm"       → onboardingStatus = APPROVED  (post-approval customer list)
  //   "prospects" → onboardingStatus != APPROVED (Lead Hunter pipeline)
  //   omitted     → no onboardingStatus filter (back-compat: AE Console legacy callers)
  context: z.enum(["crm", "prospects"]).optional(),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(50),
});
