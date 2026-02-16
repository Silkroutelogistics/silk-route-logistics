import { Response } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";

// ─── GET /api/communications ──────────────────────────
export async function getCommunications(req: AuthRequest, res: Response) {
  const { entity_type, entity_id, load_id, type, from: fromEmail, page = "1", limit = "50" } = req.query as Record<string, string>;
  const p = Math.max(1, parseInt(page));
  const l = Math.min(100, parseInt(limit) || 50);

  const where: any = {};
  if (entity_type) where.entityType = entity_type;
  if (entity_id) where.entityId = entity_id;
  if (load_id) where.loadId = load_id;
  if (type) where.type = type;
  if (fromEmail) where.from = { equals: fromEmail, mode: "insensitive" };

  const [communications, total] = await Promise.all([
    prisma.communication.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (p - 1) * l,
      take: l,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    }),
    prisma.communication.count({ where }),
  ]);

  res.json({ communications, total, page: p, totalPages: Math.ceil(total / l) });
}

// ─── POST /api/communications ─────────────────────────
export async function createCommunication(req: AuthRequest, res: Response) {
  const { type, direction, entityType, entityId, loadId, from, to, subject, body, phoneNumber, duration, metadata } = req.body;

  if (!type || !entityType || !entityId) {
    return res.status(400).json({ error: "type, entityType, and entityId are required" });
  }

  const comm = await prisma.communication.create({
    data: {
      type,
      direction: direction || (type.includes("OUTBOUND") ? "OUTBOUND" : type.includes("INBOUND") ? "INBOUND" : null),
      entityType,
      entityId,
      loadId: loadId || null,
      from: from || null,
      to: to || null,
      subject: subject || null,
      body: body || null,
      phoneNumber: phoneNumber || null,
      duration: duration ? parseInt(duration) : null,
      metadata: metadata || null,
      userId: req.user!.id,
    },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  res.status(201).json(comm);
}

// ─── POST /api/webhooks/openphone ─────────────────────
export async function openPhoneWebhook(req: AuthRequest | any, res: Response) {
  // OpenPhone webhook payload
  const payload = req.body;

  // Extract event data
  const eventType = payload.type || payload.event; // e.g., "call.completed", "message.received"
  const data = payload.data || payload;

  if (!eventType) {
    return res.status(400).json({ error: "Missing event type" });
  }

  let type: string;
  let direction: string;

  if (eventType.includes("call")) {
    direction = data.direction === "incoming" ? "INBOUND" : "OUTBOUND";
    type = direction === "INBOUND" ? "CALL_INBOUND" : "CALL_OUTBOUND";
  } else if (eventType.includes("message")) {
    direction = data.direction === "incoming" ? "INBOUND" : "OUTBOUND";
    type = direction === "INBOUND" ? "TEXT_INBOUND" : "TEXT_OUTBOUND";
  } else {
    // Unknown event type, acknowledge but don't store
    return res.status(200).json({ received: true });
  }

  const phoneNumber = data.from || data.phoneNumber || data.participants?.[0]?.phoneNumber;
  const body = data.body || data.text || data.transcript || null;
  const duration = data.duration || null;

  // Try to match phone number to a carrier or shipper
  let entityType = "CARRIER";
  let entityId = "";

  if (phoneNumber) {
    // Normalize phone
    const normalizedPhone = phoneNumber.replace(/\D/g, "").slice(-10);

    // Search carriers first
    const carrier = await prisma.user.findFirst({
      where: {
        role: "CARRIER",
        phone: { contains: normalizedPhone },
      },
    });

    if (carrier) {
      entityType = "CARRIER";
      entityId = carrier.id;
    } else {
      // Search customers/shippers
      const customer = await prisma.customer.findFirst({
        where: {
          OR: [
            { phone: { contains: normalizedPhone } },
            { contacts: { some: { phone: { contains: normalizedPhone } } } },
          ],
        },
      });

      if (customer) {
        entityType = "SHIPPER";
        entityId = customer.id;
      }
    }
  }

  // Store communication (even if entity not matched — use "UNKNOWN" entityId)
  await prisma.communication.create({
    data: {
      type,
      direction,
      entityType,
      entityId: entityId || "UNKNOWN",
      from: data.from || null,
      to: data.to || null,
      body,
      phoneNumber: phoneNumber || null,
      duration,
      metadata: payload,
      userId: "system", // Will need a system user or handle gracefully
    },
  });

  res.status(200).json({ received: true });
}
