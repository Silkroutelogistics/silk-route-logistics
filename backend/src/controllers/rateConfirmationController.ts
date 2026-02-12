import { Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import {
  createRateConfirmationSchema,
  updateRateConfirmationSchema,
  sendRateConfirmationSchema,
  signRateConfirmationSchema,
  sendToShipperSchema,
} from "../validators/rateConfirmation";
import { generateEnhancedRateConfirmation, generateShipperLoadConfirmation } from "../services/pdfService";
import { sendRateConfirmationEmail, sendEmail, wrap } from "../services/emailService";

export async function createRateConfirmation(req: AuthRequest, res: Response) {
  const { loadId, formData } = createRateConfirmationSchema.parse(req.body);

  const load = await prisma.load.findUnique({ where: { id: loadId } });
  if (!load) { res.status(404).json({ error: "Load not found" }); return; }

  const rc = await prisma.rateConfirmation.create({
    data: {
      loadId,
      formData: formData as any,
      createdById: req.user!.id,
      carrierRate: formData.lineHaulRate,
      fuelSurcharge: formData.fuelSurcharge,
      accessorialTotal: formData.accessorials?.reduce((sum: number, a: { amount: number }) => sum + a.amount, 0),
      totalCharges: formData.totalCharges,
    },
  });

  res.status(201).json(rc);
}

export async function getRateConfirmationsByLoad(req: AuthRequest, res: Response) {
  const rcs = await prisma.rateConfirmation.findMany({
    where: { loadId: req.params.loadId },
    include: {
      createdBy: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json(rcs);
}

export async function getRateConfirmationById(req: AuthRequest, res: Response) {
  const rc = await prisma.rateConfirmation.findUnique({
    where: { id: req.params.id },
    include: {
      load: {
        include: {
          poster: { select: { firstName: true, lastName: true, company: true, phone: true } },
          carrier: { select: { firstName: true, lastName: true, company: true, phone: true, carrierProfile: { select: { mcNumber: true, dotNumber: true } } } },
          customer: true,
        },
      },
      createdBy: { select: { firstName: true, lastName: true } },
    },
  });

  if (!rc) { res.status(404).json({ error: "Rate confirmation not found" }); return; }
  res.json(rc);
}

export async function updateRateConfirmation(req: AuthRequest, res: Response) {
  const existing = await prisma.rateConfirmation.findUnique({ where: { id: req.params.id } });
  if (!existing) { res.status(404).json({ error: "Rate confirmation not found" }); return; }
  if (existing.status !== "DRAFT") { res.status(400).json({ error: "Only draft rate confirmations can be edited" }); return; }

  const { formData } = updateRateConfirmationSchema.parse(req.body);

  const rc = await prisma.rateConfirmation.update({
    where: { id: req.params.id },
    data: {
      formData: formData as any,
      carrierRate: formData?.lineHaulRate,
      fuelSurcharge: formData?.fuelSurcharge,
      accessorialTotal: formData?.accessorials?.reduce((sum: number, a: { amount: number }) => sum + a.amount, 0),
      totalCharges: formData?.totalCharges,
    },
  });

  res.json(rc);
}

export async function sendRateConfirmation(req: AuthRequest, res: Response) {
  const { recipientEmail, recipientName, message } = sendRateConfirmationSchema.parse(req.body);

  const rc = await prisma.rateConfirmation.findUnique({
    where: { id: req.params.id },
    include: {
      load: {
        include: {
          carrier: { select: { firstName: true, lastName: true, company: true, phone: true, carrierProfile: { select: { mcNumber: true, dotNumber: true } } } },
          customer: true,
        },
      },
    },
  });

  if (!rc) { res.status(404).json({ error: "Rate confirmation not found" }); return; }

  // Generate PDF buffer
  const pdfDoc = generateEnhancedRateConfirmation(rc.load, rc.formData as Record<string, any>);
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    pdfDoc.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdfDoc.on("end", resolve);
    pdfDoc.on("error", reject);
  });
  const pdfBuffer = Buffer.concat(chunks);

  // Send email with PDF attachment
  await sendRateConfirmationEmail(
    recipientEmail,
    recipientName || "Carrier",
    rc.load.referenceNumber,
    pdfBuffer,
    message,
  );

  // Update status to SENT
  await prisma.rateConfirmation.update({
    where: { id: rc.id },
    data: { status: "SENT", sentAt: new Date(), sentToEmail: recipientEmail },
  });

  res.json({ success: true, message: "Rate confirmation sent successfully" });
}

export async function downloadRateConfirmationPdf(req: AuthRequest, res: Response) {
  const rc = await prisma.rateConfirmation.findUnique({
    where: { id: req.params.id },
    include: {
      load: {
        include: {
          carrier: { select: { id: true, firstName: true, lastName: true, company: true, phone: true, carrierProfile: { select: { mcNumber: true, dotNumber: true } } } },
          customer: true,
        },
      },
    },
  });

  if (!rc) { res.status(404).json({ error: "Rate confirmation not found" }); return; }

  const doc = generateEnhancedRateConfirmation(rc.load, rc.formData as Record<string, any>);
  const filename = `RC-${rc.load.referenceNumber}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  doc.pipe(res);
}

/**
 * Sign a rate confirmation — stores signer details and sets signed=true.
 */
export async function signRateConfirmation(req: AuthRequest, res: Response) {
  const { signerName, signerTitle, ipAddress } = signRateConfirmationSchema.parse(req.body);

  const rc = await prisma.rateConfirmation.findUnique({ where: { id: req.params.id } });
  if (!rc) { res.status(404).json({ error: "Rate confirmation not found" }); return; }
  if (rc.signed) { res.status(400).json({ error: "Rate confirmation already signed" }); return; }

  const existingFormData = (rc.formData as Record<string, any>) || {};
  const updatedFormData = {
    ...existingFormData,
    carrierSignature: signerName,
    carrierSignTitle: signerTitle,
    carrierSignDate: new Date().toISOString(),
    carrierSignIP: ipAddress || req.ip,
  };

  const updated = await prisma.rateConfirmation.update({
    where: { id: req.params.id },
    data: {
      signed: true,
      signedAt: new Date(),
      status: "SIGNED",
      formData: updatedFormData as any,
    },
  });

  res.json(updated);
}

/**
 * Send a shipper-facing Load Confirmation PDF (no carrier cost info).
 */
export async function sendToShipper(req: AuthRequest, res: Response) {
  const { recipientEmail, recipientName, message } = sendToShipperSchema.parse(req.body);

  const rc = await prisma.rateConfirmation.findUnique({
    where: { id: req.params.id },
    include: {
      load: {
        include: {
          carrier: { select: { firstName: true, lastName: true, company: true, phone: true, carrierProfile: { select: { mcNumber: true, dotNumber: true } } } },
          customer: true,
        },
      },
    },
  });

  if (!rc) { res.status(404).json({ error: "Rate confirmation not found" }); return; }

  // Generate shipper PDF (no carrier cost)
  const pdfDoc = generateShipperLoadConfirmation(rc.load, rc.formData as Record<string, any>);
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    pdfDoc.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdfDoc.on("end", resolve);
    pdfDoc.on("error", reject);
  });
  const pdfBuffer = Buffer.concat(chunks);

  const html = wrap(`
    <h2 style="color:#0f172a">Load Confirmation — ${rc.load.referenceNumber}</h2>
    <p>Hi ${recipientName || ""},</p>
    ${message ? `<p>${message}</p>` : ""}
    <p>Please find the attached Load Confirmation for load <strong>${rc.load.referenceNumber}</strong>.</p>
    <p>This document confirms the load details and schedule for your shipment.</p>
    <p>If you have any questions, please contact your account representative.</p>
  `);

  await sendEmail(
    recipientEmail,
    `Load Confirmation: ${rc.load.referenceNumber} — Silk Route Logistics`,
    html,
    [{ filename: `LC-${rc.load.referenceNumber}.pdf`, content: pdfBuffer }],
  );

  res.json({ success: true, message: "Load confirmation sent to shipper" });
}

/**
 * Finalize a rate confirmation — sets status to FINALIZED and updates the Load.
 */
export async function finalizeRateConfirmation(req: AuthRequest, res: Response) {
  const rc = await prisma.rateConfirmation.findUnique({
    where: { id: req.params.id },
    include: { load: true },
  });
  if (!rc) { res.status(404).json({ error: "Rate confirmation not found" }); return; }
  if (rc.status === "FINALIZED") { res.status(400).json({ error: "Already finalized" }); return; }

  const fd = (rc.formData as Record<string, any>) || {};

  // Update RC status
  await prisma.rateConfirmation.update({
    where: { id: rc.id },
    data: { status: "FINALIZED" },
  });

  // Update the Load with financial & dispatch fields from the RC
  const loadUpdate: Record<string, unknown> = {};

  if (fd.customerRate !== undefined) loadUpdate.customerRate = fd.customerRate;
  if (fd.lineHaulRate !== undefined) loadUpdate.carrierRate = fd.lineHaulRate;
  if (fd.rateType) loadUpdate.rateType = fd.rateType;
  if (fd.fuelSurcharge !== undefined) loadUpdate.fuelSurcharge = fd.fuelSurcharge;
  if (fd.fuelSurchargeType) loadUpdate.fuelSurchargeType = fd.fuelSurchargeType;
  if (fd.totalCharges !== undefined) loadUpdate.totalCarrierPay = fd.totalCharges;
  if (fd.carrierPaymentTier) loadUpdate.carrierPaymentTier = fd.carrierPaymentTier;
  if (fd.quickPayFeePercent !== undefined) loadUpdate.quickPayFeePercent = fd.quickPayFeePercent;
  if (fd.assignmentType) loadUpdate.assignmentType = fd.assignmentType;
  if (fd.driverName) loadUpdate.driverName = fd.driverName;
  if (fd.driverPhone) loadUpdate.driverPhone = fd.driverPhone;
  if (fd.truckNumber) loadUpdate.truckNumber = fd.truckNumber;
  if (fd.trailerNumber) loadUpdate.trailerNumber = fd.trailerNumber;
  if (fd.carrierDispatcherName || fd.dispatcherName) loadUpdate.carrierDispatcherName = fd.carrierDispatcherName || fd.dispatcherName;
  if (fd.carrierDispatcherPhone || fd.dispatcherPhone) loadUpdate.carrierDispatcherPhone = fd.carrierDispatcherPhone || fd.dispatcherPhone;
  if (fd.isMultiStop !== undefined) loadUpdate.isMultiStop = fd.isMultiStop;
  if (fd.stops) loadUpdate.stops = fd.stops;
  if (fd.extraStopPay !== undefined) loadUpdate.extraStopPay = fd.extraStopPay;
  if (fd.accessorials) loadUpdate.accessorials = fd.accessorials;
  if (fd.customTerms) loadUpdate.termsConditions = fd.customTerms;
  if (fd.specialInstructions) loadUpdate.specialInstructions = fd.specialInstructions;
  if (fd.pickupInstructions) loadUpdate.pickupInstructions = fd.pickupInstructions;
  if (fd.deliveryInstructions) loadUpdate.deliveryInstructions = fd.deliveryInstructions;

  // Recalculate margins if we have both rates
  const custRate = (fd.customerRate ?? rc.load.customerRate ?? rc.load.rate) as number;
  const carrRate = fd.lineHaulRate ?? rc.load.carrierRate;
  if (custRate && carrRate) {
    loadUpdate.grossMargin = custRate - carrRate;
    loadUpdate.marginPercent = Math.round(((custRate - carrRate) / custRate) * 10000) / 100;
  }
  const dist = rc.load.distance;
  if (dist && dist > 0) {
    if (custRate) loadUpdate.revenuePerMile = Math.round((custRate / dist) * 100) / 100;
    if (carrRate) loadUpdate.costPerMile = Math.round((carrRate / dist) * 100) / 100;
    if (custRate && carrRate) loadUpdate.marginPerMile = Math.round(((custRate - carrRate) / dist) * 100) / 100;
  }

  // Update load status to TENDERED or DISPATCHED
  const currentStatus = rc.load.status;
  if (["POSTED", "BOOKED", "CONFIRMED"].includes(currentStatus)) {
    loadUpdate.status = "TENDERED";
    loadUpdate.tenderedAt = new Date();
    loadUpdate.tenderedById = req.user!.id;
  } else if (currentStatus === "TENDERED") {
    loadUpdate.status = "DISPATCHED";
  }

  const updatedLoad = await prisma.load.update({
    where: { id: rc.loadId },
    data: loadUpdate,
  });

  res.json({ rateConfirmation: { id: rc.id, status: "FINALIZED" }, load: updatedLoad });
}
