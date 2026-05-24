import { z } from "zod";

export const createTenderSchema = z.object({
  carrierId: z.string(),
  offeredRate: z.number().positive(),
  expiresAt: z.string().transform((s) => new Date(s)),
});

export const counterTenderSchema = z.object({
  counterRate: z.number().positive(),
});

// v3.8.ajz Item 90 — Optional decline reason captured at carrier-portal
// decline time. Carrier UI presents 7 categorized strings (carrier/
// dashboard/tenders/page.tsx:16-24) but the validator accepts any free
// text (capped at 500 chars) so future UI iterations + AE manual decline
// paths don't need a schema update to pick a different vocabulary.
export const declineTenderSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
