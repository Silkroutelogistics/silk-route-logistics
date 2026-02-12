import { Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { createClaimSchema, updateClaimSchema } from "../validators/claim";
import { sendEmail, wrap } from "../services/emailService";

export async function createClaim(req: AuthRequest, res: Response) {
  const data = createClaimSchema.parse(req.body);

  const load = await prisma.load.findUnique({
    where: { id: data.loadId },
    include: {
      customer: { select: { email: true, contactName: true, name: true } },
      carrier: { select: { email: true, firstName: true, lastName: true, company: true } },
    },
  });
  if (!load) { res.status(404).json({ error: "Load not found" }); return; }

  // Generate claim number
  const lastClaim = await prisma.claim.findFirst({ orderBy: { createdAt: "desc" }, select: { claimNumber: true } });
  const lastNum = lastClaim ? parseInt(lastClaim.claimNumber.replace("CLM-", ""), 10) : 1000;
  const claimNumber = `CLM-${lastNum + 1}`;

  const claim = await prisma.claim.create({
    data: {
      claimNumber,
      loadId: data.loadId,
      claimType: data.claimType,
      description: data.description,
      estimatedValue: data.estimatedValue,
      photos: data.photos || [],
      notes: [{ date: new Date().toISOString(), author: `${req.user!.firstName} ${req.user!.lastName}`, text: "Claim filed." }],
      filedById: req.user!.id,
    } as any,
    include: { load: { select: { referenceNumber: true } } },
  });

  // Notify carrier
  if (load.carrier?.email) {
    const body = `
      <h2 style="color:#1e293b">Claim Filed: ${claimNumber}</h2>
      <p style="color:#475569">A claim has been filed for load <strong>${load.referenceNumber}</strong>.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b">Type</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0">${data.claimType}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b">Est. Value</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0">${data.estimatedValue ? '$' + data.estimatedValue.toLocaleString() : 'TBD'}</td></tr>
        <tr><td style="padding:8px;color:#64748b">Description</td>
            <td style="padding:8px">${data.description}</td></tr>
      </table>
    `;
    sendEmail(load.carrier.email, `Claim Filed: ${claimNumber} — Load ${load.referenceNumber}`, wrap(body)).catch((e: any) => console.error("[Claims] Carrier email error:", e.message));
  }

  // Notify shipper
  if (load.customer?.email) {
    const body = `
      <h2 style="color:#1e293b">Claim Filed: ${claimNumber}</h2>
      <p style="color:#475569">A claim has been filed for your shipment <strong>${load.referenceNumber}</strong>. We will keep you updated on the investigation.</p>
      <p style="color:#475569"><strong>Type:</strong> ${data.claimType}<br><strong>Estimated Value:</strong> ${data.estimatedValue ? '$' + data.estimatedValue.toLocaleString() : 'TBD'}</p>
    `;
    sendEmail(load.customer.email, `Claim Filed: ${claimNumber} — Shipment ${load.referenceNumber}`, wrap(body)).catch((e: any) => console.error("[Claims] Shipper email error:", e.message));
  }

  res.status(201).json(claim);
}

export async function getClaims(req: AuthRequest, res: Response) {
  const { status, claimType, page = "1", limit = "50" } = req.query;
  const where: Record<string, unknown> = {};
  if (status && status !== "ALL") where.status = status;
  if (claimType && claimType !== "ALL") where.claimType = claimType;

  const [claims, total] = await Promise.all([
    prisma.claim.findMany({
      where,
      include: {
        load: { select: { referenceNumber: true, originCity: true, originState: true, destCity: true, destState: true } },
        filedBy: { select: { firstName: true, lastName: true } },
        assignedTo: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (parseInt(page as string) - 1) * parseInt(limit as string),
      take: parseInt(limit as string),
    }),
    prisma.claim.count({ where }),
  ]);

  res.json({ claims, total, page: parseInt(page as string), totalPages: Math.ceil(total / parseInt(limit as string)) });
}

export async function getClaimById(req: AuthRequest, res: Response) {
  const claim = await prisma.claim.findUnique({
    where: { id: req.params.id },
    include: {
      load: {
        select: {
          referenceNumber: true, originCity: true, originState: true, destCity: true, destState: true,
          carrier: { select: { company: true, firstName: true, lastName: true } },
          customer: { select: { name: true, contactName: true } },
        },
      },
      filedBy: { select: { firstName: true, lastName: true, email: true } },
      assignedTo: { select: { firstName: true, lastName: true, email: true } },
    },
  });

  if (!claim) { res.status(404).json({ error: "Claim not found" }); return; }
  res.json(claim);
}

export async function updateClaim(req: AuthRequest, res: Response) {
  const data = updateClaimSchema.parse(req.body);

  const existing = await prisma.claim.findUnique({
    where: { id: req.params.id },
    include: {
      load: {
        include: {
          customer: { select: { email: true, name: true } },
          carrier: { select: { email: true, company: true } },
        },
      },
    },
  });
  if (!existing) { res.status(404).json({ error: "Claim not found" }); return; }

  const updateData: Record<string, unknown> = {};
  if (data.status) {
    updateData.status = data.status;
    if (data.status === "RESOLVED") updateData.resolvedAt = new Date();
    if (data.status === "CLOSED") updateData.closedAt = new Date();
  }
  if (data.assignedToId) updateData.assignedToId = data.assignedToId;
  if (data.resolvedValue !== undefined) updateData.resolvedValue = data.resolvedValue;

  // Add note if provided
  if (data.notes) {
    const existingNotes = (existing.notes as any[]) || [];
    existingNotes.push({
      date: new Date().toISOString(),
      author: `${req.user!.firstName} ${req.user!.lastName}`,
      text: data.notes,
    });
    updateData.notes = existingNotes;
  }

  // Add status change note
  if (data.status && data.status !== existing.status) {
    const existingNotes = (updateData.notes || existing.notes || []) as any[];
    existingNotes.push({
      date: new Date().toISOString(),
      author: `${req.user!.firstName} ${req.user!.lastName}`,
      text: `Status changed from ${existing.status} to ${data.status}`,
    });
    updateData.notes = existingNotes;
  }

  const claim = await prisma.claim.update({
    where: { id: req.params.id },
    data: updateData,
    include: {
      load: { select: { referenceNumber: true } },
      filedBy: { select: { firstName: true, lastName: true } },
    },
  });

  // Notify carrier and shipper on status changes
  if (data.status && data.status !== existing.status) {
    const ref = existing.load.referenceNumber;
    const body = `
      <h2 style="color:#1e293b">Claim Update: ${existing.claimNumber}</h2>
      <p style="color:#475569">The claim for load <strong>${ref}</strong> has been updated to <strong>${data.status.replace(/_/g, " ")}</strong>.</p>
      ${data.resolvedValue ? `<p style="color:#475569">Resolved value: <strong>$${data.resolvedValue.toLocaleString()}</strong></p>` : ""}
      ${data.notes ? `<p style="color:#475569">Note: ${data.notes}</p>` : ""}
    `;

    if (existing.load.carrier?.email) {
      sendEmail(existing.load.carrier.email, `Claim ${data.status}: ${existing.claimNumber}`, wrap(body)).catch(() => {});
    }
    if (existing.load.customer?.email) {
      sendEmail(existing.load.customer.email, `Claim ${data.status}: ${existing.claimNumber}`, wrap(body)).catch(() => {});
    }
  }

  res.json(claim);
}
