import { Response } from "express";
import path from "path";
import fs from "fs";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { env } from "../config/env";
import { validateAndNotifyPOD } from "../services/shipperNotificationService";

// ─── POST /api/documents/upload ───────────────────────
export async function uploadDocuments(req: AuthRequest, res: Response) {
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    res.status(400).json({ error: "No files uploaded" });
    return;
  }

  const { loadId, invoiceId, entityType, entityId, docType } = req.body;

  const documents = await Promise.all(
    files.map((file) =>
      prisma.document.create({
        data: {
          fileName: file.originalname,
          fileUrl: `/uploads/${file.filename}`,
          fileType: file.mimetype,
          fileSize: file.size,
          userId: req.user!.id,
          loadId: loadId || null,
          invoiceId: invoiceId || null,
          entityType: entityType || null,
          entityId: entityId || null,
          docType: docType || null,
        },
      })
    )
  );

  // If POD uploaded for a load, trigger validation and shipper notification
  if (docType === "POD" && loadId) {
    for (const doc of documents) {
      validateAndNotifyPOD(loadId, doc.id).catch((e) => console.error("[ShipperNotify] POD validation error:", e.message));
    }
  }

  res.status(201).json(documents);
}

// ─── GET /api/documents ───────────────────────────────
export async function getDocuments(req: AuthRequest, res: Response) {
  const { loadId, invoiceId, entityType, entityId, docType, page = "1", limit = "50" } = req.query as Record<string, string>;
  const p = Math.max(1, parseInt(page));
  const l = Math.min(100, parseInt(limit) || 50);

  const where: Record<string, unknown> = {};
  if (loadId) where.loadId = loadId;
  if (invoiceId) where.invoiceId = invoiceId;
  if (entityType) where.entityType = entityType;
  if (entityId) where.entityId = entityId;
  if (docType) where.docType = docType;

  // Non-admin users can only see their own documents unless filtering by entity
  if (req.user!.role !== "ADMIN" && !entityType && !loadId && !invoiceId) {
    where.userId = req.user!.id;
  }

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (p - 1) * l,
      take: l,
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.document.count({ where }),
  ]);

  res.json({ documents, total, page: p, totalPages: Math.ceil(total / l) });
}

// ─── GET /api/documents/:id/download ──────────────────
export async function downloadDocument(req: AuthRequest, res: Response) {
  const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  const filePath = path.resolve(env.UPLOAD_DIR, path.basename(doc.fileUrl));
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "File not found on disk" });
    return;
  }

  res.setHeader("Content-Disposition", `attachment; filename="${doc.fileName}"`);
  res.setHeader("Content-Type", doc.fileType);
  fs.createReadStream(filePath).pipe(res);
}

// ─── POST /api/documents/rate-con/:loadId ─────────────
export async function generateRateConfirmation(req: AuthRequest, res: Response) {
  const { loadId } = req.params;

  const load = await prisma.load.findUnique({
    where: { id: loadId },
    include: {
      poster: { select: { firstName: true, lastName: true, company: true, phone: true, email: true } },
      carrier: { select: { firstName: true, lastName: true, company: true, phone: true, email: true } },
    },
  });

  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }

  // Generate a simple HTML-based rate confirmation
  const html = buildRateConHTML(load);

  // Store as a document record
  const fileName = `RateCon-${load.referenceNumber}-${Date.now()}.html`;
  const filePath = path.resolve(env.UPLOAD_DIR, fileName);
  fs.writeFileSync(filePath, html);

  const doc = await prisma.document.create({
    data: {
      fileName,
      fileUrl: `/uploads/${fileName}`,
      fileType: "text/html",
      fileSize: Buffer.byteLength(html),
      userId: req.user!.id,
      loadId: load.id,
      entityType: "LOAD",
      entityId: load.id,
      docType: "RATE_CON",
    },
  });

  // Also update the load with the rate confirmation URL
  await prisma.load.update({
    where: { id: load.id },
    data: { rateConfirmationPdfUrl: `/uploads/${fileName}` },
  });

  res.status(201).json(doc);
}

function buildRateConHTML(load: any): string {
  const carrierRate = load.carrierRate || load.rate || 0;
  const pickup = load.pickupDate ? new Date(load.pickupDate).toLocaleDateString("en-US") : "--";
  const delivery = load.deliveryDate ? new Date(load.deliveryDate).toLocaleDateString("en-US") : "--";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Rate Confirmation - ${load.referenceNumber}</title>
<style>
body { font-family: Arial, sans-serif; margin: 0; padding: 20px; color: #333; }
.header { background: #0D1B2A; color: #C8963E; padding: 24px; margin: -20px -20px 24px; }
.header h1 { margin: 0; font-size: 22px; }
.header p { margin: 4px 0 0; color: #94a3b8; font-size: 13px; }
h2 { color: #0D1B2A; font-size: 16px; border-bottom: 2px solid #C8963E; padding-bottom: 6px; margin-top: 24px; }
table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; }
td { padding: 6px 12px; border: 1px solid #e2e8f0; font-size: 13px; }
td:first-child { font-weight: bold; width: 160px; background: #f8fafc; color: #64748b; }
.total { font-size: 20px; color: #C8963E; font-weight: bold; }
.footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center; }
.sig-line { margin-top: 40px; border-top: 1px solid #333; width: 250px; display: inline-block; }
.sig-label { font-size: 11px; color: #64748b; }
</style></head>
<body>
<div class="header">
  <h1>RATE CONFIRMATION</h1>
  <p>Silk Route Logistics &middot; Ref: ${load.referenceNumber}</p>
</div>

<h2>Load Details</h2>
<table>
  <tr><td>Reference</td><td>${load.referenceNumber}</td></tr>
  <tr><td>Origin</td><td>${load.originCity}, ${load.originState} ${load.originZip}${load.originCompany ? ' (' + load.originCompany + ')' : ''}</td></tr>
  <tr><td>Destination</td><td>${load.destCity}, ${load.destState} ${load.destZip}${load.destCompany ? ' (' + load.destCompany + ')' : ''}</td></tr>
  <tr><td>Equipment</td><td>${(load.equipmentType || '').replace(/_/g, ' ')}</td></tr>
  <tr><td>Weight</td><td>${load.weight ? load.weight.toLocaleString() + ' lbs' : '--'}</td></tr>
  <tr><td>Commodity</td><td>${load.commodity || '--'}</td></tr>
  <tr><td>Distance</td><td>${load.distance ? load.distance.toLocaleString() + ' miles' : '--'}</td></tr>
</table>

<h2>Schedule</h2>
<table>
  <tr><td>Pickup Date</td><td>${pickup}${load.pickupTimeStart ? ' (' + load.pickupTimeStart + '-' + (load.pickupTimeEnd || '') + ')' : ''}</td></tr>
  <tr><td>Delivery Date</td><td>${delivery}${load.deliveryTimeStart ? ' (' + load.deliveryTimeStart + '-' + (load.deliveryTimeEnd || '') + ')' : ''}</td></tr>
</table>

<h2>Carrier Information</h2>
<table>
  <tr><td>Carrier</td><td>${load.carrier ? (load.carrier.company || load.carrier.firstName + ' ' + load.carrier.lastName) : 'TBD'}</td></tr>
  <tr><td>Contact</td><td>${load.carrier ? (load.carrier.phone || load.carrier.email || '--') : '--'}</td></tr>
  <tr><td>Driver</td><td>${load.driverName || 'TBD'}</td></tr>
  <tr><td>Driver Phone</td><td>${load.driverPhone || '--'}</td></tr>
  <tr><td>Truck #</td><td>${load.truckNumber || '--'}</td></tr>
  <tr><td>Trailer #</td><td>${load.trailerNumber || '--'}</td></tr>
</table>

<h2>Rate</h2>
<table>
  <tr><td>Carrier Rate</td><td class="total">$${carrierRate.toLocaleString('en-US', {minimumFractionDigits: 2})}</td></tr>
  <tr><td>Fuel Surcharge</td><td>$${(load.fuelSurcharge || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td></tr>
  <tr><td>Total Carrier Pay</td><td class="total">$${((carrierRate + (load.fuelSurcharge || 0)).toLocaleString('en-US', {minimumFractionDigits: 2}))}</td></tr>
</table>

${load.specialInstructions ? '<h2>Special Instructions</h2><p>' + load.specialInstructions + '</p>' : ''}

<h2>Terms & Conditions</h2>
<p style="font-size:11px;color:#64748b;line-height:1.6">
Carrier agrees to transport the above-described shipment in accordance with all applicable federal and state regulations.
Carrier shall maintain proper insurance coverage at all times. Payment terms: Net 30 days from receipt of signed POD and invoice.
${load.checkCallFrequency ? 'Check calls required every ' + load.checkCallFrequency + '.' : ''}
</p>

<div style="margin-top:40px;display:flex;justify-content:space-between">
  <div>
    <div class="sig-line"></div><br>
    <span class="sig-label">Broker Signature / Date</span>
  </div>
  <div>
    <div class="sig-line"></div><br>
    <span class="sig-label">Carrier Signature / Date</span>
  </div>
</div>

<div class="footer">
  <p>Silk Route Logistics &middot; Generated ${new Date().toLocaleDateString("en-US")} &middot; This document constitutes the rate confirmation agreement.</p>
</div>
</body></html>`;
}

// ─── DELETE /api/documents/:id ────────────────────────
export async function deleteDocument(req: AuthRequest, res: Response) {
  const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  if (doc.userId !== req.user!.id && req.user!.role !== "ADMIN") {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  await prisma.document.delete({ where: { id: req.params.id } });
  res.status(204).send();
}
