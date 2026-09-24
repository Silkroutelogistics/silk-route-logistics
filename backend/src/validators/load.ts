import { z } from "zod";
import { assessCancellationInput } from "../lib/cancellationPolicy";
import { isTonuFaultSide } from "../lib/tonuPolicy";

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

  // Temperature (Fahrenheit — no unit field by design, see schema.prisma)
  temperature: z.number().optional(),
  tempMin: z.number().optional(),
  tempMax: z.number().optional(),
  temperatureControlled: z.boolean().optional(),
  // v3.8.art — the single setpoint the driver dials in, the pre-cool target,
  // and the run mode. Left .optional() rather than .default(true) on
  // reeferContinuous so a PATCH that omits it does not silently rewrite a
  // deliberate cycle-sentry election back to continuous; the column default
  // supplies true on create.
  tempSetpoint: z.number().optional(),
  preCoolTo: z.number().optional(),
  reeferContinuous: z.boolean().optional(),

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

/**
 * Reversing a cancellation needs a reason, and a real one.
 *
 * min(10) matches the compliance-override convention rather than being picked
 * fresh: both are an admin overriding a decision the platform already made, and
 * both end up in an audit row somebody reads months later. "ok" is not a reason.
 */
export const uncancelLoadSchema = z.object({
  reason: z.string().trim().min(10, "Give a reason of at least 10 characters.").max(2000),
});

export const updateLoadStatusSchema = z.object({
  status: z.enum([
    "DRAFT", "POSTED", "TENDERED", "CONFIRMED", "BOOKED", "DISPATCHED",
    "AT_PICKUP", "LOADED", "PICKED_UP", "IN_TRANSIT", "AT_DELIVERY",
    "DELIVERED", "POD_RECEIVED", "INVOICED", "COMPLETED", "TONU", "CANCELLED",
  ]),
  // These three MUST be declared here even though the controller reads them off
  // req.body directly. validateBody replaces req.body with the Zod result
  // (middleware/validate.ts:21) and Zod strips unknown keys, so a field absent
  // from this schema is silently gone by the time the handler runs.
  //
  // tonuFaultSide — v3.8.aso added a 422 gate requiring it on a TONU flip and
  // read it off the stripped body, so the gate rejected EVERY TONU including
  // ones that sent a valid fault side. TONU was impossible to record. Caught by
  // the Phase 1e smoke, which is the entire reason that smoke was worth running.
  //
  // reason / cancellationReason — same stripping, pre-existing and quieter: the
  // TONU/CANCELLED handler reads `req.body.reason || req.body.cancellationReason`
  // and passed undefined to onLoadCancelledOrTONU every time, so every voided
  // CarrierPay note read "no reason provided" no matter what the AE typed.
  tonuFaultSide: z.enum(["CUSTOMER", "CARRIER", "BROKER"]).optional(),
  reason: z.string().max(2000).optional(),
  cancellationReason: z.string().max(2000).optional(),
  // Lifecycle-gaps B2b — declared as a string, not an enum, so the refine
  // below answers with the policy's own message (which lists the reasons)
  // instead of Zod's generic enum error.
  cancellationReasonCode: z.string().max(64).optional(),
}).superRefine((v, ctx) => {
  // Lifecycle-gaps B2b — a cancel carries a reason CODE, a TONU a fault side.
  // Enforced HERE so the controller cannot be reached without them, and again
  // in the controller through the same assessCancellationInput, so the rule
  // is stated once and the two cannot disagree (Sub-pattern 5).
  if (v.status === "CANCELLED") {
    const verdict = assessCancellationInput({
      cancellationReasonCode: v.cancellationReasonCode,
      cancellationReason: v.cancellationReason ?? v.reason,
    });
    if (!verdict.ok) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["cancellationReasonCode"], message: verdict.message });
  }
  if (v.status === "TONU" && !isTonuFaultSide(v.tonuFaultSide)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tonuFaultSide"], message: "A TONU must record whose failure caused it: CUSTOMER, CARRIER, or BROKER." });
  }
});

export const loadQuerySchema = z.object({
  status: z.string().optional(),
  activeOnly: z.coerce.boolean().optional(),
  /**
   * The reversal queue: loads cancelled inside the un-cancel window.
   *
   * A SEPARATE PARAMETER RATHER THAN A CHANGE TO activeOnly (ruling 3). The
   * board's active partition is what every other surface reads, and widening
   * it to admit cancelled loads would put them in front of every AE rather
   * than in one tab behind a role gate.
   */
  reversible: z.enum(["true"]).optional(),
  // v3.8.axo — the Load Board / Track & Trace partition, asked as a question
  // about the TENDERS rather than a list of load statuses each surface keeps
  // its own copy of. "false" is the board, "true" is Track & Trace, absent is
  // everything. See lib/tenderLifecycle.
  held: z.enum(["true", "false"]).optional(),
  originState: z.string().optional(),
  destState: z.string().optional(),
  equipmentType: z.string().optional(),
  minRate: z.coerce.number().optional(),
  maxRate: z.coerce.number().optional(),
  search: z.string().optional(),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20),
});
