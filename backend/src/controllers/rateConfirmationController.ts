import { Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { createRateConfirmationSchema, updateRateConfirmationSchema, sendRateConfirmationSchema } from "../validators/rateConfirmation";
import { generateEnhancedRateConfirmation } from "../services/pdfService";
import { sendRateConfirmationEmail } from "../services/emailService";

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
    data: { status: "SENT", sentAt: new Date() },
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
