import { z } from "zod";

export const createRateConfirmationSchema = z.object({
  // Section 1: Load Info
  loadId: z.string(),
  // Sections 2-10 bundled as JSON formData
  formData: z.object({
    // Section 1 — Load Information
    referenceNumber: z.string().optional(),
    loadNumber: z.string().optional(),

    // Section 2 — Shipper / Origin
    shipperName: z.string().optional(),
    shipperAddress: z.string().optional(),
    shipperCity: z.string().optional(),
    shipperState: z.string().optional(),
    shipperZip: z.string().optional(),
    shipperContact: z.string().optional(),
    shipperPhone: z.string().optional(),
    shipperEmail: z.string().optional(),
    shipperRefNumber: z.string().optional(),

    // Section 3 — Consignee / Destination
    consigneeName: z.string().optional(),
    consigneeAddress: z.string().optional(),
    consigneeCity: z.string().optional(),
    consigneeState: z.string().optional(),
    consigneeZip: z.string().optional(),
    consigneeContact: z.string().optional(),
    consigneePhone: z.string().optional(),
    consigneeEmail: z.string().optional(),
    consigneeRefNumber: z.string().optional(),

    // Section 4 — Carrier Information
    carrierName: z.string().optional(),
    carrierMcNumber: z.string().optional(),
    carrierDotNumber: z.string().optional(),
    carrierAddress: z.string().optional(),
    carrierCity: z.string().optional(),
    carrierState: z.string().optional(),
    carrierZip: z.string().optional(),
    carrierContact: z.string().optional(),
    carrierPhone: z.string().optional(),
    carrierEmail: z.string().optional(),
    driverName: z.string().optional(),
    driverPhone: z.string().optional(),
    truckNumber: z.string().optional(),
    trailerNumber: z.string().optional(),

    // Section 5 — Equipment & Commodity
    equipmentType: z.string().optional(),
    commodity: z.string().optional(),
    weight: z.number().optional(),
    pieces: z.number().optional(),
    dims: z.string().optional(),
    hazmat: z.boolean().optional(),
    tempRequirements: z.string().optional(),

    // Section 6 — Dates & Times
    pickupDate: z.string().optional(),
    pickupTimeWindow: z.string().optional(),
    deliveryDate: z.string().optional(),
    deliveryTimeWindow: z.string().optional(),

    // Section 7 — Rates & Charges
    lineHaulRate: z.number().optional(),
    fuelSurcharge: z.number().optional(),
    detentionRate: z.number().optional(),
    accessorials: z.array(z.object({
      description: z.string(),
      amount: z.number(),
    })).optional(),
    totalCharges: z.number().optional(),
    paymentTerms: z.string().optional(),

    // Section 8 — Special Instructions
    specialInstructions: z.string().optional(),
    deliveryInstructions: z.string().optional(),
    pickupInstructions: z.string().optional(),
    appointmentRequired: z.boolean().optional(),

    // Section 9 — Terms & Conditions
    termsAccepted: z.boolean().optional(),
    customTerms: z.string().optional(),

    // Section 10 — Signatures
    brokerSignature: z.string().optional(),
    brokerSignDate: z.string().optional(),
    carrierSignature: z.string().optional(),
    carrierSignDate: z.string().optional(),
  }),
});

export const updateRateConfirmationSchema = createRateConfirmationSchema.partial();

export const sendRateConfirmationSchema = z.object({
  recipientEmail: z.string().email(),
  recipientName: z.string().optional(),
  message: z.string().optional(),
});
