import { z } from "zod";

export const createClaimSchema = z.object({
  loadId: z.string().cuid(),
  claimType: z.enum(["DAMAGE", "SHORTAGE", "LATE", "NO_SHOW", "OTHER"]),
  description: z.string().min(10),
  estimatedValue: z.number().positive().optional(),
  photos: z.array(z.string()).optional(),
});

export const updateClaimSchema = z.object({
  status: z.enum(["FILED", "UNDER_REVIEW", "INVESTIGATING", "RESOLVED", "CLOSED"]).optional(),
  notes: z.string().min(1).optional(),
  assignedToId: z.string().cuid().optional(),
  resolvedValue: z.number().optional(),
});
