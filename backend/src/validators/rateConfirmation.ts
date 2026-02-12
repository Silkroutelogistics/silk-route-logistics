import { z } from "zod";

const stopSchema = z.object({
  type: z.enum(["PICKUP", "DELIVERY"]).optional(),
  company: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  contact: z.string().optional(),
  phone: z.string().optional(),
  refNumber: z.string().optional(),
  instructions: z.string().optional(),
});

export const createRateConfirmationSchema = z.object({
  // Section 1: Load Info
  loadId: z.string(),
  // Sections 2-10 bundled as JSON formData
  formData: z.object({
    // Section 1 — Broker / Load Information
    referenceNumber: z.string().optional(),
    loadNumber: z.string().optional(),
    brokerName: z.string().optional(),
    brokerContact: z.string().optional(),
    brokerPhone: z.string().optional(),
    brokerEmail: z.string().optional(),

    // Section 2 — Shipper / Pickup
    shipperName: z.string().optional(),
    shipperAddress: z.string().optional(),
    shipperCity: z.string().optional(),
    shipperState: z.string().optional(),
    shipperZip: z.string().optional(),
    shipperContact: z.string().optional(),
    shipperPhone: z.string().optional(),
    shipperEmail: z.string().optional(),
    shipperRefNumber: z.string().optional(),
    pickupNumber: z.string().optional(),
    pickupHours: z.string().optional(),
    loadingType: z.string().optional(),
    estLoadingTime: z.string().optional(),
    poNumber: z.string().optional(),

    // Section 3 — Consignee / Delivery
    consigneeName: z.string().optional(),
    consigneeAddress: z.string().optional(),
    consigneeCity: z.string().optional(),
    consigneeState: z.string().optional(),
    consigneeZip: z.string().optional(),
    consigneeContact: z.string().optional(),
    consigneePhone: z.string().optional(),
    consigneeEmail: z.string().optional(),
    consigneeRefNumber: z.string().optional(),
    deliveryRef: z.string().optional(),
    appointmentNumber: z.string().optional(),
    deliveryHours: z.string().optional(),
    unloadingType: z.string().optional(),
    estUnloadingTime: z.string().optional(),

    // Section 4 — Multi-stop
    isMultiStop: z.boolean().optional(),
    stops: z.array(stopSchema).optional(),
    extraStopPay: z.number().optional(),

    // Section 5 — Carrier / Driver Assignment
    assignmentType: z.enum(["COMPANY_DRIVER", "PARTNER_CARRIER"]).optional(),
    carrierId: z.string().optional(),
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
    dispatcherName: z.string().optional(),
    dispatcherPhone: z.string().optional(),
    driverName: z.string().optional(),
    driverPhone: z.string().optional(),
    truckNumber: z.string().optional(),
    trailerNumber: z.string().optional(),

    // Section 5b — Equipment & Commodity
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

    // Section 7 — Financials
    customerRate: z.number().optional(),
    lineHaulRate: z.number().optional(),
    rateType: z.enum(["FLAT", "PER_MILE"]).optional(),
    fuelSurcharge: z.number().optional(),
    fuelSurchargeType: z.enum(["FLAT", "PERCENTAGE"]).optional(),
    detentionRate: z.number().optional(),
    accessorials: z.array(z.object({
      type: z.string().optional(),
      description: z.string(),
      amount: z.number(),
    })).optional(),
    totalCharges: z.number().optional(),

    // Section 8 — Payment Terms
    carrierPaymentTier: z.string().optional(),
    quickPayFeePercent: z.number().optional(),
    factoringCompany: z.string().optional(),
    factoringContact: z.string().optional(),
    factoringEmail: z.string().optional(),
    paymentTerms: z.string().optional(),
    docChecklist: z.object({
      signedRateCon: z.boolean().optional(),
      signedBol: z.boolean().optional(),
      pod: z.boolean().optional(),
      carrierInvoice: z.boolean().optional(),
      lumperReceipt: z.boolean().optional(),
      scaleTicket: z.boolean().optional(),
      tempLog: z.boolean().optional(),
    }).optional(),

    // Section 9 — Special Instructions
    specialInstructions: z.string().optional(),
    deliveryInstructions: z.string().optional(),
    pickupInstructions: z.string().optional(),
    appointmentRequired: z.boolean().optional(),

    // Section 9b — Terms & Conditions
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

export const signRateConfirmationSchema = z.object({
  signerName: z.string().min(1),
  signerTitle: z.string().optional(),
  ipAddress: z.string().optional(),
});

export const sendToShipperSchema = z.object({
  recipientEmail: z.string().email(),
  recipientName: z.string().optional(),
  message: z.string().optional(),
});
