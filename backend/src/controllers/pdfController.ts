import { Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { generateBOL, generateBOLFromLoad, generateEnhancedRateConfirmation, generateShipperLoadConfirmation, generateInvoicePDF, generateSettlementPDF } from "../services/pdfService";
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
          select: { id: true, firstName: true, lastName: true, company: true, phone: true, carrierProfile: { select: { mcNumber: true, dotNumber: true, address: true, city: true, state: true, zip: true, contactPhone: true, contactEmail: true } } },
        },
        rateConfirmations: { where: { status: "SIGNED" }, orderBy: { createdAt: "desc" }, take: 1 },
        customer: { select: { name: true, contactName: true, email: true, phone: true, address: true, city: true, state: true, zip: true } }, // v3.8.arr — address fields needed for the §3.9 last-resort fallback
      },
    });

    if (!load) { res.status(404).json({ error: "Load not found" }); return; }

    const isPoster = load.posterId === req.user!.id;
    const isAssignedCarrier = load.carrierId === req.user!.id;
    const isEmployee = ["ADMIN", "BROKER", "DISPATCH", "OPERATIONS"].includes(req.user!.role);
    if (!isPoster && !isAssignedCarrier && !isEmployee) { res.status(403).json({ error: "Not authorized" }); return; }

    // v3.8.aqk — this route now renders the BRANDED rate confirmation (skill
    // chrome). It previously called the legacy off-canonical generator, so the
    // Load Board's "Rate Confirmation" button produced an off-brand PDF while
    // the branded generator sat behind an endpoint no frontend ever called.
    const rc = load.rateConfirmations?.[0];
    const formData = (rc?.formData && typeof rc.formData === "object" && !Array.isArray(rc.formData) ? rc.formData : {}) as Record<string, any>;
    const doc = generateEnhancedRateConfirmation(load, formData);
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
        customer: { select: { name: true, contactName: true, email: true, phone: true, address: true, city: true, state: true, zip: true } }, // v3.8.arr — address fields needed for the §3.9 last-resort fallback
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
        customer: { select: { name: true, contactName: true, email: true, phone: true, address: true, city: true, state: true, zip: true } }, // v3.8.arr — address fields needed for the §3.9 last-resort fallback
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
    // go-live audit: the shipper frontend may pass the invoiceNumber (mapInvoice
    // exposes it as the row id) — match on either id or invoiceNumber.
    const invoiceId = req.params.invoiceId;
    const invoice = await prisma.invoice.findFirst({
      where: { OR: [{ id: invoiceId }, { invoiceNumber: invoiceId }] },
      include: {
        load: { select: { referenceNumber: true, originCity: true, originState: true, destCity: true, destState: true, pickupDate: true, deliveryDate: true, posterId: true, customer: { select: { userId: true, name: true, contactName: true, billingContactName: true, paymentTerms: true, address: true, city: true, state: true, zip: true, billingAddress: true, billingCity: true, billingState: true, billingZip: true } } } },
        user: { select: { firstName: true, lastName: true, company: true } },
        lineItems: { orderBy: { sortOrder: "asc" } },
      },
    });

    if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }

    const isOwner = req.user!.id === invoice.userId;
    const isEmployee = ["ADMIN", "BROKER", "DISPATCH", "OPERATIONS", "ACCOUNTING"].includes(req.user!.role);
    // go-live audit IDOR fix: a SHIPPER may download an invoice PDF ONLY when the
    // invoice's load is actually theirs (load linked to their Customer, or a load
    // they posted). Previously `role === "SHIPPER" && invoice.load` let any shipper
    // pull ANY invoice PDF that had a load — including other parties' financials.
    const isShipperOwner =
      req.user!.role === "SHIPPER" &&
      !!invoice.load &&
      (invoice.load.customer?.userId === req.user!.id || invoice.load.posterId === req.user!.id);
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
          select: {
            id: true,
            firstName: true,
            lastName: true,
            company: true,
            phone: true,
            carrierProfile: {
              select: {
                mcNumber: true,
                dotNumber: true,
                companyName: true,
                contactName: true,
              },
            },
          },
        },
        driver: {
          select: { firstName: true, lastName: true, phone: true },
        },
        // v3.8.a — multi-line shipment items, ordered for render.
        // v3.8.c template will consume these; current template still
        // uses flat fields so presence here is a no-op visually.
        lineItems: {
          orderBy: { lineNumber: "asc" },
        },
      },
    });

    if (!load) { res.status(404).json({ error: "Load not found" }); return; }

    // v3.8.awu — per-record ownership gate, so CARRIER can be admitted at the
    // route without admitting carriers to each other's freight.
    //
    // Until now the BOL had NO carrier-portal path at all: this route excluded
    // CARRIER and Load.bolPdfUrl is written by nothing, so the only bill of
    // lading a carrier could reach was an off-brand HTML re-render in the portal
    // (§13.3 Item 221 banked the seam; the audit found the renderer). The AE was
    // the only route to the dock.
    //
    // Mirrors rateConfirmationController's C1 gate exactly, and for the same
    // reason: `authorize()` proves a ROLE, never a RELATIONSHIP. Without this,
    // admitting CARRIER would let any logged-in carrier enumerate load ids and
    // pull the BOL for freight that is not theirs — shipper and consignee
    // identity, addresses, contacts and appointment windows.
    //
    // AE-side roles bypass deliberately: they need any load's BOL during normal
    // dispatch. The check keys on Load.carrierId, which is a User id (the same
    // convention the RC gate uses).
    if (req.user!.role === "CARRIER" && load.carrierId !== req.user!.id) {
      res.status(403).json({ error: "Not authorized to download this bill of lading" });
      return;
    }

    // ── AND THE RATE CONFIRMATION MUST BE SIGNED FIRST ──
    //
    // The bill of lading is the document that sends a truck to a shipper's
    // dock. Handing it to a carrier who has not signed the rate confirmation
    // means freight moves on terms nobody executed -- and if it then goes
    // wrong, the only paper SRL holds is a rate confirmation the carrier never
    // agreed to. Signing is a few minutes; unwinding an unpapered load is not.
    //
    // CARRIER ONLY. AE roles need the BOL while they are arranging the
    // signature, and gating them would make the document unreachable by
    // exactly the person chasing it. Same split as the rate-confirmation
    // download and the driver-verification gate above it.
    if (req.user!.role === "CARRIER") {
      const confirmed = await prisma.loadTender.findFirst({
        where: { loadId: load.id, status: "CONFIRMED", deletedAt: null },
        select: { id: true },
      });
      if (!confirmed) {
        res.status(403).json({
          error: "RC_NOT_SIGNED",
          message:
            "Sign the rate confirmation before downloading the bill of lading. The signing link is in " +
            "the rate confirmation email; if it has expired, ask your dispatcher to send a new one.",
          action: { href: "/carrier/dashboard/my-loads", label: "View this load" },
        });
        return;
      }
    }

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

    // v3.7.o — derive identity fields for LoadBOLData. Drawing code doesn't
    // consume these yet (Commit 2 / v3.7.p); controller populates them now
    // so the data path is ready.
    const driverFullName = load.driver
      ? `${load.driver.firstName ?? ""} ${load.driver.lastName ?? ""}`.trim() || null
      : null;
    const bolData = {
      ...load,
      carrierLegalName:
        load.carrier?.carrierProfile?.companyName ?? load.carrier?.company ?? null,
      carrierContactName: load.carrier?.carrierProfile?.contactName ?? null,
      driverName: load.driverName || driverFullName,
      driverPhone: load.driverPhone || load.driver?.phone || null,
    };

    const doc = await generateBOLFromLoad(bolData, { trackingToken });
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
