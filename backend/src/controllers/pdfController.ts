import { Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { generateBOL, generateBOLFromLoad, generateRateConfirmation, generateInvoicePDF } from "../services/pdfService";

export async function downloadBOL(req: AuthRequest, res: Response) {
  const shipment = await prisma.shipment.findUnique({
    where: { id: req.params.shipmentId },
    include: { customer: true, driver: true, equipment: true },
  });

  if (!shipment) { res.status(404).json({ error: "Shipment not found" }); return; }

  const doc = generateBOL(shipment);
  const filename = `BOL-${shipment.bolNumber || shipment.shipmentNumber}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  doc.pipe(res);
}

export async function downloadRateConfirmation(req: AuthRequest, res: Response) {
  const load = await prisma.load.findUnique({
    where: { id: req.params.loadId },
    include: {
      carrier: {
        select: { id: true, firstName: true, lastName: true, company: true, phone: true, carrierProfile: { select: { mcNumber: true } } },
      },
    },
  });

  if (!load) { res.status(404).json({ error: "Load not found" }); return; }

  const isPoster = load.posterId === req.user!.id;
  const isAssignedCarrier = load.carrierId === req.user!.id;
  const isEmployee = ["ADMIN", "BROKER", "DISPATCH", "OPERATIONS"].includes(req.user!.role);
  if (!isPoster && !isAssignedCarrier && !isEmployee) { res.status(403).json({ error: "Not authorized" }); return; }

  const doc = generateRateConfirmation(load);
  const filename = `RC-${load.referenceNumber}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  doc.pipe(res);
}

export async function downloadInvoicePDF(req: AuthRequest, res: Response) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: req.params.invoiceId },
    include: {
      load: { select: { referenceNumber: true, originCity: true, originState: true, destCity: true, destState: true, rate: true, pickupDate: true, deliveryDate: true } },
      user: { select: { firstName: true, lastName: true, company: true } },
    },
  });

  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }

  const isOwner = req.user!.id === invoice.userId;
  const isEmployee = ["ADMIN", "BROKER", "DISPATCH", "OPERATIONS"].includes(req.user!.role);
  if (!isOwner && !isEmployee) { res.status(403).json({ error: "Not authorized" }); return; }

  const doc = generateInvoicePDF(invoice);
  const filename = `${invoice.invoiceNumber}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  doc.pipe(res);
}

export async function downloadBOLFromLoad(req: AuthRequest, res: Response) {
  const load = await prisma.load.findUnique({
    where: { id: req.params.loadId },
    include: {
      customer: true,
      carrier: {
        select: { firstName: true, lastName: true, company: true, phone: true, carrierProfile: { select: { mcNumber: true } } },
      },
    },
  });

  if (!load) { res.status(404).json({ error: "Load not found" }); return; }

  const doc = generateBOLFromLoad(load);
  const filename = `BOL-${load.referenceNumber}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  doc.pipe(res);
}
