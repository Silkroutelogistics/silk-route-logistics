import { prisma } from "../config/database";
import { log } from "../lib/logger";

const OPENPHONE_BASE = "https://api.openphone.com/v1";

function getHeaders() {
  const key = process.env.OPENPHONE_API_KEY;
  if (!key) throw new Error("OPENPHONE_API_KEY is not configured");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

// ─── Phone Numbers ──────────────────────────────────────

export async function listPhoneNumbers() {
  const res = await fetch(`${OPENPHONE_BASE}/phone-numbers`, { headers: getHeaders() });
  if (!res.ok) throw new Error(`OpenPhone API error: ${res.status}`);
  return res.json();
}

// ─── Calls ──────────────────────────────────────────────

export async function listCalls(params: { phoneNumberId?: string; after?: string; before?: string; maxResults?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.phoneNumberId) qs.set("phoneNumberId", params.phoneNumberId);
  if (params.after) qs.set("after", params.after);
  if (params.before) qs.set("before", params.before);
  if (params.maxResults) qs.set("maxResults", String(params.maxResults));

  const res = await fetch(`${OPENPHONE_BASE}/calls?${qs}`, { headers: getHeaders() });
  if (!res.ok) throw new Error(`OpenPhone calls error: ${res.status}`);
  return res.json();
}

export async function getCall(callId: string) {
  const res = await fetch(`${OPENPHONE_BASE}/calls/${callId}`, { headers: getHeaders() });
  if (!res.ok) throw new Error(`OpenPhone call error: ${res.status}`);
  return res.json();
}

// ─── Messages (SMS/MMS) ─────────────────────────────────

export async function sendSMS(to: string, content: string, fromPhoneNumberId?: string) {
  const phoneNumberId = fromPhoneNumberId || process.env.OPENPHONE_PHONE_NUMBER_ID;
  if (!phoneNumberId) throw new Error("OPENPHONE_PHONE_NUMBER_ID not configured");

  const normalizedTo = to.startsWith("+1") ? to : `+1${to.replace(/\D/g, "")}`;

  const res = await fetch(`${OPENPHONE_BASE}/messages`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      from: phoneNumberId,
      to: [normalizedTo],
      content,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    log.error({ to, status: res.status, err }, "[OpenPhone] SMS send failed");
    throw new Error(`OpenPhone SMS error: ${res.status} — ${err}`);
  }

  const data: any = await res.json();
  log.info({ to, messageId: data.data?.id }, "[OpenPhone] SMS sent");
  return data;
}

export async function listMessages(params: { phoneNumberId?: string; after?: string; maxResults?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.phoneNumberId) qs.set("phoneNumberId", params.phoneNumberId);
  if (params.after) qs.set("after", params.after);
  if (params.maxResults) qs.set("maxResults", String(params.maxResults));

  const res = await fetch(`${OPENPHONE_BASE}/messages?${qs}`, { headers: getHeaders() });
  if (!res.ok) throw new Error(`OpenPhone messages error: ${res.status}`);
  return res.json();
}

// ─── Contacts ───────────────────────────────────────────

export async function createContact(data: {
  firstName: string;
  lastName?: string;
  company?: string;
  emails?: { value: string; type?: string }[];
  phoneNumbers?: { value: string; type?: string }[];
  customFields?: Record<string, string>;
}) {
  const res = await fetch(`${OPENPHONE_BASE}/contacts`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`OpenPhone contact create error: ${res.status}`);
  return res.json();
}

export async function updateContact(contactId: string, data: Record<string, any>) {
  const res = await fetch(`${OPENPHONE_BASE}/contacts/${contactId}`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`OpenPhone contact update error: ${res.status}`);
  return res.json();
}

export async function searchContacts(query: string) {
  const qs = new URLSearchParams({ query });
  const res = await fetch(`${OPENPHONE_BASE}/contacts?${qs}`, { headers: getHeaders() });
  if (!res.ok) throw new Error(`OpenPhone contacts search error: ${res.status}`);
  return res.json();
}

// ─── Sync TMS Contact → OpenPhone ───────────────────────

export async function syncCarrierToOpenPhone(carrierId: string) {
  const carrier = await prisma.carrierProfile.findUnique({
    where: { id: carrierId },
    include: { user: { select: { firstName: true, lastName: true, email: true, phone: true } } },
  });
  if (!carrier) throw new Error("Carrier not found");

  const contact = await createContact({
    firstName: carrier.contactName?.split(" ")[0] || carrier.user.firstName,
    lastName: carrier.contactName?.split(" ").slice(1).join(" ") || carrier.user.lastName,
    company: carrier.companyName || undefined,
    emails: carrier.contactEmail ? [{ value: carrier.contactEmail, type: "work" }] : undefined,
    phoneNumbers: carrier.contactPhone ? [{ value: carrier.contactPhone, type: "work" }] : undefined,
    customFields: {
      "MC Number": carrier.mcNumber || "",
      "DOT Number": carrier.dotNumber || "",
      "Entity Type": "CARRIER",
      "TMS ID": carrier.id,
      "Tier": carrier.tier,
    },
  });

  log.info({ carrierId, openPhoneContactId: (contact as any).data?.id }, "[OpenPhone] Carrier synced");
  return contact;
}

export async function syncShipperToOpenPhone(customerId: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new Error("Customer not found");

  const nameParts = (customer.contactName || customer.name || "").split(" ");
  const contact: any = await createContact({
    firstName: nameParts[0] || customer.name,
    lastName: nameParts.slice(1).join(" ") || "",
    company: customer.name,
    emails: customer.email ? [{ value: customer.email, type: "work" }] : undefined,
    phoneNumbers: customer.phone ? [{ value: customer.phone, type: "work" }] : undefined,
    customFields: {
      "Entity Type": "SHIPPER",
      "TMS ID": customer.id,
      "Industry": customer.industryType || "",
      "Payment Terms": customer.paymentTerms || "",
    },
  });

  log.info({ customerId, openPhoneContactId: contact.data?.id }, "[OpenPhone] Shipper synced");
  return contact;
}

// ─── Webhook Event Processing ───────────────────────────

export async function processWebhookEvent(payload: any) {
  const eventType = payload.type || payload.event;
  const data = payload.data || payload;

  if (!eventType) return { processed: false, reason: "Missing event type" };

  // Determine type and direction
  let commType: string;
  let direction: string;
  let recordingUrl: string | null = null;
  let transcript: string | null = null;
  let voicemailUrl: string | null = null;

  if (eventType === "call.transcript.completed" || eventType === "call.summary.completed") {
    // Update existing communication with transcript/summary — don't create a new record
    const callId = data.callId || data.id;
    if (callId) {
      const existing = await prisma.communication.findFirst({
        where: { metadata: { path: ["openPhoneCallId"], equals: callId } },
      });
      if (existing) {
        const meta = (existing.metadata as any) || {};
        if (eventType === "call.transcript.completed") meta.transcript = data.transcript || data.text;
        if (eventType === "call.summary.completed") meta.callSummary = data.summary || data.text;
        await prisma.communication.update({ where: { id: existing.id }, data: { metadata: meta } });
        log.info({ eventType, callId, commId: existing.id }, "[OpenPhone] Updated call with transcript/summary");
        return { processed: true, updated: true, communicationId: existing.id };
      }
    }
    // If no existing record found, fall through to create new one
    direction = data.direction === "incoming" || data.direction === "inbound" ? "INBOUND" : "OUTBOUND";
    commType = direction === "INBOUND" ? "CALL_INBOUND" : "CALL_OUTBOUND";
    transcript = data.transcript || data.summary || data.text || null;
  } else if (eventType.startsWith("call")) {
    direction = data.direction === "incoming" || data.direction === "inbound" ? "INBOUND" : "OUTBOUND";
    commType = direction === "INBOUND" ? "CALL_INBOUND" : "CALL_OUTBOUND";
    recordingUrl = data.recordingUrl || data.recording?.url || null;
    transcript = data.transcript || data.voicemail?.transcription || null;
    voicemailUrl = data.voicemail?.url || null;
  } else if (eventType === "contact.updated" || eventType === "contact.deleted") {
    // Contact events — log but don't create communication record
    log.info({ eventType, contactId: data.id }, "[OpenPhone] Contact event");
    return { processed: true, reason: "Contact event logged" };
  } else if (eventType.startsWith("message")) {
    direction = data.direction === "incoming" || data.direction === "inbound" ? "INBOUND" : "OUTBOUND";
    commType = direction === "INBOUND" ? "TEXT_INBOUND" : "TEXT_OUTBOUND";
  } else if (eventType.startsWith("voicemail")) {
    commType = "CALL_INBOUND";
    direction = "INBOUND";
    transcript = data.transcription || data.voicemail?.transcription || null;
    voicemailUrl = data.url || data.voicemail?.url || null;
  } else {
    return { processed: false, reason: `Unknown event type: ${eventType}` };
  }

  // Extract phone numbers
  const fromPhone = data.from || data.participants?.[0]?.phoneNumber || null;
  const toPhone = data.to || data.participants?.[1]?.phoneNumber || null;
  const matchPhone = direction === "INBOUND" ? fromPhone : toPhone;
  const body = data.body || data.content || data.text || transcript || null;
  const duration = data.duration || data.completedAt && data.answeredAt
    ? Math.round((new Date(data.completedAt).getTime() - new Date(data.answeredAt).getTime()) / 1000)
    : null;

  // Match to entity
  let entityType = "CARRIER";
  let entityId = "";
  let matchedUser: { id: string } | null = null;

  if (matchPhone) {
    const normalized = matchPhone.replace(/\D/g, "").slice(-10);

    // Try carrier
    const carrier = await prisma.carrierProfile.findFirst({
      where: { OR: [
        { contactPhone: { contains: normalized } },
        { user: { phone: { contains: normalized } } },
      ] },
      select: { id: true, userId: true },
    });

    if (carrier) {
      entityType = "CARRIER";
      entityId = carrier.id;
    } else {
      // Try customer/shipper
      const customer = await prisma.customer.findFirst({
        where: { OR: [
          { phone: { contains: normalized } },
          { contacts: { some: { phone: { contains: normalized } } } },
        ] },
      });
      if (customer) {
        entityType = "SHIPPER";
        entityId = customer.id;
      }
    }
  }

  // Try to match OpenPhone userId to SRL user
  if (data.userId) {
    // For now, use the first admin user — in production, map OpenPhone userIds to SRL userIds
    const admin = await prisma.user.findFirst({ where: { role: "ADMIN", isActive: true }, select: { id: true } });
    matchedUser = admin;
  }

  // Store communication
  const comm = await prisma.communication.create({
    data: {
      type: commType,
      direction,
      entityType,
      entityId: entityId || "UNKNOWN",
      from: fromPhone,
      to: toPhone,
      body,
      phoneNumber: matchPhone,
      duration,
      subject: eventType === "voicemail.received" ? "Voicemail" : null,
      metadata: {
        source: "OpenPhone",
        eventType,
        openPhoneCallId: data.id || null,
        recordingUrl,
        transcript,
        voicemailUrl,
        voicemailTranscript: transcript,
        openPhoneUserId: data.userId || null,
        status: data.status || null,
        answeredAt: data.answeredAt || null,
        completedAt: data.completedAt || null,
      },
      userId: matchedUser?.id || (await getSystemUserId()),
    },
  });

  // Create notification for missed calls
  if (eventType === "call.completed" && data.status === "missed" && entityId) {
    const admins = await prisma.user.findMany({ where: { role: { in: ["ADMIN", "CEO", "BROKER"] }, isActive: true }, select: { id: true } });
    for (const admin of admins) {
      await prisma.notification.create({
        data: {
          userId: admin.id,
          type: "GENERAL",
          title: `Missed Call from ${entityType === "CARRIER" ? "Carrier" : "Shipper"}`,
          message: `Missed call from ${fromPhone}${transcript ? ` — Voicemail: "${transcript.slice(0, 100)}"` : ""}`,
          link: "/dashboard/communications",
        },
      });
    }
  }

  log.info({ eventType, commType, entityType, entityId: entityId || "UNKNOWN", commId: comm.id }, "[OpenPhone] Webhook processed");
  return { processed: true, communicationId: comm.id, entityType, entityId };
}

// ─── System User Helper ─────────────────────────────────

let cachedSystemUserId: string | null = null;

async function getSystemUserId(): Promise<string> {
  if (cachedSystemUserId) return cachedSystemUserId;
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
  });
  cachedSystemUserId = admin?.id || "system";
  return cachedSystemUserId;
}

// ─── Call History & Stats ───────────────────────────────

export async function getCallHistory(filters: {
  entityType?: string;
  entityId?: string;
  type?: string;
  dateFrom?: string;
  dateTo?: string;
  page: number;
  limit: number;
}) {
  const where: any = {
    type: { in: ["CALL_INBOUND", "CALL_OUTBOUND", "TEXT_INBOUND", "TEXT_OUTBOUND"] },
  };
  if (filters.entityType) where.entityType = filters.entityType;
  if (filters.entityId) where.entityId = filters.entityId;
  if (filters.type) where.type = filters.type;
  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
  }

  const [items, total] = await Promise.all([
    prisma.communication.findMany({
      where,
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
    prisma.communication.count({ where }),
  ]);

  return { items, total, totalPages: Math.ceil(total / filters.limit) };
}

export async function getPhoneStats(dateFrom?: string) {
  const since = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const where = { createdAt: { gte: since } };

  const [inboundCalls, outboundCalls, inboundSms, outboundSms, missedCalls, totalDuration] = await Promise.all([
    prisma.communication.count({ where: { ...where, type: "CALL_INBOUND" } }),
    prisma.communication.count({ where: { ...where, type: "CALL_OUTBOUND" } }),
    prisma.communication.count({ where: { ...where, type: "TEXT_INBOUND" } }),
    prisma.communication.count({ where: { ...where, type: "TEXT_OUTBOUND" } }),
    prisma.communication.count({ where: { ...where, type: "CALL_INBOUND", metadata: { path: ["status"], equals: "missed" } } }),
    prisma.communication.aggregate({ where: { ...where, type: { in: ["CALL_INBOUND", "CALL_OUTBOUND"] }, duration: { not: null } }, _sum: { duration: true }, _avg: { duration: true } }),
  ]);

  return {
    inboundCalls, outboundCalls, inboundSms, outboundSms, missedCalls,
    totalCalls: inboundCalls + outboundCalls,
    totalSms: inboundSms + outboundSms,
    totalDurationMinutes: Math.round((totalDuration._sum.duration || 0) / 60),
    avgCallDurationSeconds: Math.round(totalDuration._avg.duration || 0),
  };
}
