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
  // v3.8.oo Gap 2 — contractUrl is admin-overridable via PATCH so an AE
  // can paste a URL from outside the upload flow if needed. Primary
  // population path is the CUSTOMER_CONTRACT upload cross-write in
  // documentController.uploadDocuments. Note: onboardingStatus stays
  // off this schema — only the dedicated /approve endpoint can flip it.
  contractUrl: z.string().url().nullable().optional(),
  // v3.8.ako §13.3 Items 180.6 + 180.7 — revenue-protect fields.
  // defaultAccessorialRates: map of negotiated rates the Order Builder
  // accessorial picker reads on customer-select to auto-fill amounts.
  // Shape: { [accessorialType: string]: number }. z.record() allows
  // arbitrary keys (the type strings come from a frontend ACCESSORIAL_TYPES
  // constant that could expand without validator churn).
  defaultAccessorialRates: z.record(z.string(), z.number().nonnegative()).nullable().optional(),
  // minMarginPercent: per-customer margin floor override (0-100). Below
  // this, OrderSidebar surfaces a red alert chip. Null = use the global
  // 10% default fallback.
  minMarginPercent: z.number().min(0).max(100).nullable().optional(),
});

// v3.8.oo Gap 1 — manual credit review now sets customer.creditStatus
// alongside creditCheckDate + notes. Status enum is restricted to the
// three values an AE actually picks during manual review (NOT_CHECKED
// and PENDING_REVIEW are non-terminal states; an AE wouldn't move a
// customer INTO them by hand). DENIED is the schema enum value for the
// "rejected" decision (Prisma enum predates the v3.8.oo directive
// wording — same intent).
export const markManualReviewSchema = z.object({
  creditStatus: z.enum(["APPROVED", "CONDITIONAL", "DENIED"]),
  notes: z.string().optional(),
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
