import { z } from "zod";

/**
 * Sprint 59 (v3.8.acj) Item 176 — Carrier Engagement Drawer Mode 1.
 *
 * Atomic POST /api/loads/with-tender request schema. Replaces the
 * Item 167 silent-failure path through /api/orders/:id/convert-to-load
 * (which captured directTenderCarrierId into a Load column but never
 * fired createTender, leaving carriers tendered-in-name-only). Drawer
 * collects Load + Tender + RC seed in one form; backend creates all
 * three rows in a single prisma.$transaction with full rollback on
 * partial failure.
 */

const lineItemSchema = z.object({
  lineNumber: z.number().int().positive(),
  pieces: z.number().int().positive(),
  packageType: z.string().default("PLT"),
  description: z.string().min(1),
  weight: z.number().nonnegative(),
  dimensionsLength: z.number().nullable().optional(),
  dimensionsWidth: z.number().nullable().optional(),
  dimensionsHeight: z.number().nullable().optional(),
  freightClass: z.string().nullable().optional(),
  nmfcCode: z.string().nullable().optional(),
  hazmat: z.boolean().default(false),
  hazmatUnNumber: z.string().nullable().optional(),
  hazmatClass: z.string().nullable().optional(),
  hazmatEmergencyContact: z.string().nullable().optional(),
  hazmatPlacardRequired: z.boolean().nullable().optional(),
  stackable: z.boolean().nullable().optional(),
  turnable: z.boolean().nullable().optional(),
});

const tenderSchema = z.object({
  carrierId: z.string().min(1),
  offeredRate: z.number().positive(),
  expiresAt: z.string().transform((s) => new Date(s)),
});

export const createLoadWithTenderSchema = z.object({
  // Optional Order draft to convert (drawer launched from Order Builder)
  orderId: z.string().optional(),

  // Customer
  customerId: z.string().min(1),

  // Lane (drawer Section 1)
  originCity: z.string().min(1),
  originState: z.string().min(1),
  originZip: z.string().min(3),
  originAddress: z.string().optional().nullable(),
  originCompany: z.string().optional().nullable(),
  originContactName: z.string().optional().nullable(),
  originContactPhone: z.string().optional().nullable(),
  destCity: z.string().min(1),
  destState: z.string().min(1),
  destZip: z.string().min(3),
  destAddress: z.string().optional().nullable(),
  destCompany: z.string().optional().nullable(),
  destContactName: z.string().optional().nullable(),
  destContactPhone: z.string().optional().nullable(),
  distance: z.number().nonnegative().optional().nullable(),

  // Equipment & Freight (drawer Section 2)
  equipmentType: z.string().min(1),
  commodity: z.string().optional().nullable(),
  weight: z.number().nonnegative().optional().nullable(),
  pieces: z.number().int().nonnegative().optional().nullable(),
  lineItems: z.array(lineItemSchema).min(1, "At least one line item required"),
  hazmat: z.boolean().default(false),
  temperatureControlled: z.boolean().default(false),
  tempMin: z.number().optional().nullable(),
  tempMax: z.number().optional().nullable(),

  // Schedule (drawer Section 3)
  pickupDate: z.string().transform((s) => new Date(s)),
  pickupTimeStart: z.string().optional().nullable(),
  pickupTimeEnd: z.string().optional().nullable(),
  deliveryDate: z.string().transform((s) => new Date(s)),
  deliveryTimeStart: z.string().optional().nullable(),
  deliveryTimeEnd: z.string().optional().nullable(),

  // Stops & References (drawer Section 4)
  isMultiStop: z.boolean().default(false),
  stops: z.any().optional().nullable(),
  poNumbers: z.array(z.string()).default([]),
  appointmentNumber: z.string().optional().nullable(),
  shipperReference: z.string().optional().nullable(),
  deliveryReference: z.string().optional().nullable(),

  // Tender (drawer Section 5)
  tender: tenderSchema,

  // Financials (drawer Section 6) — Load row keeps customerRate +
  // carrierRate + accessorials. Sprint 59.b (v3.8.act) Item 176
  // dropped fuelSurcharge from drawer scope: FSC is an RC-generation
  // concern, not a tender-creation one. autoRateConfirmationService
  // hardcodes fuelSurcharge=0 on the seed RC; AE adjusts on the RC
  // PDF surface post-acceptance.
  customerRate: z.number().nonnegative().optional().nullable(),
  accessorials: z.any().optional().nullable(),

  // Instructions (drawer Section 7)
  specialInstructions: z.string().optional().nullable(),
  pickupInstructions: z.string().optional().nullable(),
  deliveryInstructions: z.string().optional().nullable(),

  // Defaults
  shipmentPriority: z.enum(["standard", "hot"]).default("standard"),
  checkCallProtocol: z.enum(["standard", "expedited"]).default("standard"),
  trackingLinkAutoSend: z.boolean().default(true),
});

export type CreateLoadWithTenderInput = z.infer<typeof createLoadWithTenderSchema>;
