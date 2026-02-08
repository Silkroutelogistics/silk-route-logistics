import { z } from "zod";

export const createShipmentSchema = z.object({
  originCity: z.string().min(1),
  originState: z.string().min(2).max(3),
  originZip: z.string().min(5).max(10),
  destCity: z.string().min(1),
  destState: z.string().min(2).max(3),
  destZip: z.string().min(5).max(10),
  weight: z.number().positive().optional(),
  pieces: z.number().int().positive().optional(),
  commodity: z.string().optional(),
  equipmentType: z.string().min(1),
  rate: z.number().positive(),
  distance: z.number().positive().optional(),
  specialInstructions: z.string().optional(),
  pickupDate: z.string().transform((s) => new Date(s)),
  deliveryDate: z.string().transform((s) => new Date(s)),
  customerId: z.string().optional(),
  driverId: z.string().optional(),
  equipmentId: z.string().optional(),
  proNumber: z.string().optional(),
  bolNumber: z.string().optional(),
});

export const updateShipmentStatusSchema = z.object({
  status: z.enum(["PENDING", "BOOKED", "DISPATCHED", "PICKED_UP", "IN_TRANSIT", "DELIVERED", "COMPLETED", "CANCELLED"]),
  driverId: z.string().optional(),
  equipmentId: z.string().optional(),
});

export const updateShipmentLocationSchema = z.object({
  lastLocation: z.string().min(1),
  eta: z.string().transform((s) => new Date(s)).optional(),
});

export const shipmentQuerySchema = z.object({
  status: z.string().optional(),
  customerId: z.string().optional(),
  driverId: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(50),
});
