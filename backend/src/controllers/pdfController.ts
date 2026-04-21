import { Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { generateBOL, generateBOLFromLoad, generateRateConfirmation, generateEnhancedRateConfirmation, generateShipperLoadConfirmation, generateInvoicePDF, generateSettlementPDF } from "../services/pdfService";
import { generateBOLPrintToken } from "../services/shipperTrackingTokenService";
import { log } from "../lib/logger";

export async function downloadBOL(req: AuthRequest, res: Response) {
  try {
    const shipment = await prisma.shipment.findUnique({
      where: { id: req.params.shipmentId },
      include: { customer: true, driver: true, equipment: true },
    });

    if (!shipment) { res.status(404).json({ error: "Shipment not found" }); return; }

    const doc = await generateBOL(shipment);
    const filename = `BOL-${shipment.bolNumber || shipment.shipmentNumber}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    doc.pipe(res);
  } catch (e: any) {
    log.error({ err: e }, "[PDF] BOL generation error:");
    res.status(500).json({ error: "Failed to generate BOL PDF" });
  }
}

export async function downloadRateConfirmation(req: AuthRequest, res: Response) {
  try {
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
  } catch (e: any) {
    log.error({ err: e }, "[PDF] Rate confirmation generation error:");
    res.status(500).json({ error: "Failed to generate rate confirmation PDF" });
  }
}

export async function downloadEnhancedRateConfirmation(req: AuthRequest, res: Response) {
  try {
    const load = await prisma.load.findUnique({
      where: { id: req.params.loadId },
      include: {
        carrier: {
          select: { id: true, firstName: true, lastName: true, company: true, phone: true, carrierProfile: { select: { mcNumber: true, dotNumber: true, address: true, city: true, state: true, zip: true, contactPhone: true, contactEmail: true } } },
        },
        rateConfirmations: { where: { status: "SIGNED" }, orderBy: { createdAt: "desc" }, take: 1 },
        customer: { select: { name: true, contactName: true, email: true, phone: true } },
      },
    });

    if (!load) { res.status(404).json({ error: "Load not found" }); return; }

    const rc = load.rateConfirmations?.[0];
    const formData = (rc?.formData && typeof rc.formData === "object" && !Array.isArray(rc.formData) ? rc.formData : {}) as Record<string, any>;
    const doc = generateEnhancedRateConfirmation(load, formData);
    const filename = `RC-Enhanced-${load.referenceNumber}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    doc.pipe(res);
  } catch (e: any) {
    log.error({ err: e }, "[PDF] Enhanced rate confirmation error:");
    res.status(500).json({ error: "Failed to generate enhanced rate confirmation PDF" });
  }
}

export async function downloadShipperLoadConfirmation(req: AuthRequest, res: Response) {
  try {
    const load = await prisma.load.findUnique({
      where: { id: req.params.loadId },
      include: {
        customer: { select: { name: true, contactName: true, email: true, phone: true } },
      },
    });

    if (!load) { res.status(404).json({ error: "Load not found" }); return; }

    // Shippers can only see their own loads
    if (req.user!.role === "SHIPPER" && load.posterId !== req.user!.id) {
      res.status(403).json({ error: "Not authorized" });
      return;
    }

    const doc = generateShipperLoadConfirmation(load, {});
    const filename = `LoadConfirmation-${load.referenceNumber}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    doc.pipe(res);
  } catch (e: any) {
    log.error({ err: e }, "[PDF] Shipper load confirmation error:");
    res.status(500).json({ error: "Failed to generate load confirmation PDF" });
  }
}

export async function downloadInvoicePDF(req: AuthRequest, res: Response) {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.invoiceId },
      include: {
        load: { select: { referenceNumber: true, originCity: true, originState: true, destCity: true, destState: true, rate: true, pickupDate: true, deliveryDate: true } },
        user: { select: { firstName: true, lastName: true, company: true } },
        lineItems: { orderBy: { sortOrder: "asc" } },
      },
    });

    if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }

    const isOwner = req.user!.id === invoice.userId;
    const isEmployee = ["ADMIN", "BROKER", "DISPATCH", "OPERATIONS", "ACCOUNTING"].includes(req.user!.role);
    // Shippers can download invoices for their loads
    const isShipperOwner = req.user!.role === "SHIPPER" && invoice.load;
    if (!isOwner && !isEmployee && !isShipperOwner) { res.status(403).json({ error: "Not authorized" }); return; }

    const doc = generateInvoicePDF(invoice);
    const filename = `${invoice.invoiceNumber}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    doc.pipe(res);
  } catch (e: any) {
    log.error({ err: e }, "[PDF] Invoice generation error:");
    res.status(500).json({ error: "Failed to generate invoice PDF" });
  }
}

export async function downloadBOLFromLoad(req: AuthRequest, res: Response) {
  try {
    const load = await prisma.load.findUnique({
      where: { id: req.params.loadId },
      include: {
        customer: true,
        carrier: {
          select: { firstName: true, lastName: true, company: true, phone: true, carrierProfile: { select: { mcNumber: true, dotNumber: true } } },
        },
      },
    });

    if (!load) { res.status(404).json({ error: "Load not found" }); return; }

    // Phase 5E.a: auto-generate (or reuse) a STATUS_ONLY ShipperTrackingToken
    // on every BOL-print event. Token is plumbed through generateBOLFromLoad
    // context for 5E.b to encode into the QR. Idempotent per loadId — BOL
    // re-prints return the existing token.
    let trackingToken: string | undefined;
    if (load.customerId) {
      try {
        const tok = await generateBOLPrintToken(load.id, load.customerId);
        trackingToken = tok.token;
      } catch (err) {
        // Non-blocking: BOL download must succeed even if token gen fails.
        log.error({ err, loadId: load.id }, "[PDF] BOL tracking token generation failed (non-blocking)");
      }
    }

    const doc = await generateBOLFromLoad(load, { trackingToken });
    const filename = `BOL-${load.referenceNumber}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    doc.pipe(res);
  } catch (e: any) {
    log.error({ err: e }, "[PDF] BOL from load generation error:");
    res.status(500).json({ error: "Failed to generate BOL PDF" });
  }
}

export async function downloadSettlementPDF(req: AuthRequest, res: Response) {
  try {
    const settlement = await prisma.settlement.findUnique({
      where: { id: req.params.settlementId },
      include: {
        carrier: { select: { firstName: true, lastName: true, company: true } },
        carrierPays: {
          include: {
            load: { select: { referenceNumber: true, originCity: true, originState: true, destCity: true, destState: true, pickupDate: true, deliveryDate: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!settlement) { res.status(404).json({ error: "Settlement not found" }); return; }

    const doc = generateSettlementPDF(settlement);
    const filename = `${settlement.settlementNumber}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    doc.pipe(res);
  } catch (e: any) {
    log.error({ err: e }, "[PDF] Settlement generation error:");
    res.status(500).json({ error: "Failed to generate settlement PDF" });
  }
}
