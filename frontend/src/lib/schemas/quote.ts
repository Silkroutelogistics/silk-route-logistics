import { z } from "zod";

export const quoteRequestSchema = z.object({
  originCity: z.string().min(1, "Origin city is required"),
  originState: z.string().length(2, "State must be 2-letter code"),
  destCity: z.string().min(1, "Destination city is required"),
  destState: z.string().length(2, "State must be 2-letter code"),
  equipmentType: z.string().min(1, "Equipment type is required"),
  weight: z.coerce.number().positive("Weight must be positive").optional(),
  pickupDate: z.string().min(1, "Pickup date is required"),
  deliveryDate: z.string().optional(),
  commodity: z.string().min(1, "Commodity is required"),
  isHazmat: z.boolean().default(false),
  isTempControlled: z.boolean().default(false),
  specialInstructions: z.string().optional(),
}).refine(
  (data) => !data.deliveryDate || new Date(data.deliveryDate) >= new Date(data.pickupDate),
  { message: "Delivery date must be after pickup date", path: ["deliveryDate"] },
);

export type QuoteRequestInput = z.infer<typeof quoteRequestSchema>;
