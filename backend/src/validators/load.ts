import { z } from "zod";

export const createLoadSchema = z.object({
  // Route
  originCity: z.string().min(1).optional(),
  originState: z.string().min(1).optional(),
  originZip: z.string().min(3).optional(),
  originName: z.string().optional(),
  originCompany: z.string().optional(),
  originCountry: z.string().optional(),
  destCity: z.string().min(1).optional(),
  destState: z.string().min(1).optional(),
  destZip: z.string().min(3).optional(),
  destinationCity: z.string().optional(),
  destinationState: z.string().optional(),
  destinationZip: z.string().optional(),
  destinationName: z.string().optional(),
  destCompany: z.string().optional(),
  destinationCountry: z.string().optional(),

  // Schedule
  pickupDate: z.string().transform((s) => new Date(s)),
  deliveryDate: z.string().transform((s) => new Date(s)),
  pickupTimeType: z.string().optional(),
  pickupTime: z.string().optional().nullable(),
  pickupBooked: z.boolean().optional().nullable(),
  pickupBookedBy: z.string().optional().nullable(),
  pickupNotes: z.string().optional().nullable(),
  pickupWindowOpen: z.string().optional().nullable(),
  pickupWindowClose: z.string().optional().nullable(),
  deliveryTimeType: z.string().optional().nullable(),
  deliveryTime: z.string().optional().nullable(),
  deliveryBooked: z.boolean().optional().nullable(),
  deliveryBookedBy: z.string().optional().nullable(),
  deliveryNotes: z.string().optional().nullable(),
  deliveryWindowOpen: z.string().optional().nullable(),
  deliveryWindowClose: z.string().optional().nullable(),

  // Freight
  weight: z.number().positive().optional().nullable(),
  pieces: z.number().int().positive().optional().nullable(),
  equipmentType: z.string().min(1),
  commodity: z.string().optional().nullable(),
  freightClass: z.string().optional().nullable(),
  stackable: z.boolean().optional().nullable(),

  // Rate
  rate: z.number().nonnegative().optional().nullable(),
  customerRate: z.number().nonnegative().optional().nullable(),
  carrierRate: z.number().nonnegative().optional().nullable(),
  rateType: z.string().optional(),
  ratePerMile: z.number().optional().nullable(),
  miles: z.number().optional().nullable(),
  distance: z.number().positive().optional().nullable(),

  // Hazmat
  hazmat: z.boolean().optional(),
  hazmatUN: z.string().optional().nullable(),
  hazmatClass: z.string().optional().nullable(),
  hazmatName: z.string().optional().nullable(),

  // Temperature
  temperature: z.number().optional(),
  tempMin: z.number().optional(),
  tempMax: z.number().optional(),
  temperatureControlled: z.boolean().optional(),

  // Cross-border
  crossBorder: z.boolean().optional(),
  borderCrossing: z.string().optional().nullable(),
  customsBroker: z.string().optional().nullable(),
  bondNumber: z.string().optional().nullable(),
  customsRequired: z.boolean().optional(),
  bondType: z.string().optional(),

  // Dimensions
  dimensions: z.object({
    length: z.number().optional().nullable(),
    width: z.number().optional().nullable(),
    height: z.number().optional().nullable(),
  }).optional(),
  length: z.number().positive().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),

  // Contacts
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  pickupContact: z.object({
    name: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    email: z.string().optional().nullable(),
  }).optional(),
  deliveryContact: z.object({
    name: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    email: z.string().optional().nullable(),
  }).optional(),
  shipperContact: z.object({
    name: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    email: z.string().optional().nullable(),
  }).optional(),
  receiverContact: z.object({
    name: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    email: z.string().optional().nullable(),
  }).optional(),

  // Misc
  specialInstructions: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  accessorials: z.array(z.any()).optional(),
  tarpRequired: z.boolean().optional(),
  status: z.enum(["DRAFT", "POSTED", "TENDERED"]).optional(),
  customerId: z.string().optional(),
}).passthrough(); // Allow extra fields to pass through

export const updateLoadStatusSchema = z.object({
  status: z.enum([
    "DRAFT", "POSTED", "TENDERED", "CONFIRMED", "BOOKED", "DISPATCHED",
    "AT_PICKUP", "LOADED", "PICKED_UP", "IN_TRANSIT", "AT_DELIVERY",
    "DELIVERED", "POD_RECEIVED", "INVOICED", "COMPLETED", "TONU", "CANCELLED",
  ]),
});

export const loadQuerySchema = z.object({
  status: z.string().optional(),
  activeOnly: z.coerce.boolean().optional(),
  originState: z.string().optional(),
  destState: z.string().optional(),
  equipmentType: z.string().optional(),
  minRate: z.coerce.number().optional(),
  maxRate: z.coerce.number().optional(),
  search: z.string().optional(),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20),
});
