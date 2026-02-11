import { z } from "zod";

export const createCheckCallSchema = z.object({
  loadId: z.string(),
  status: z.enum(["CHECKED_IN", "AT_PICKUP", "LOADED", "IN_TRANSIT", "AT_DELIVERY", "DELIVERED", "ISSUE"]),
  location: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  notes: z.string().optional(),
  contactedBy: z.string().optional(),
  method: z.enum(["PHONE", "EMAIL", "ELD", "GPS", "CARRIER_UPDATE"]).optional(),
});
