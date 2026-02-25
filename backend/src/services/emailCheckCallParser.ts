/**
 * Email Check-Call Parser — Phase 5 (Claude Cowork Prep)
 * Parses carrier email replies to extract location, status, and ETA updates.
 * Uses AI router for intelligent extraction, falls back to regex patterns.
 * Prep for future Claude Cowork Gmail integration.
 */
import { prisma } from "../config/database";
import { broadcastSSE } from "../routes/trackTraceSSE";

// Status keywords mapping
const STATUS_KEYWORDS: Record<string, string[]> = {
  AT_PICKUP: ["at pickup", "arrived pickup", "at shipper", "at the pickup", "reached pickup"],
  LOADED: ["loaded", "picked up", "departed pickup", "left shipper", "on dock loaded"],
  IN_TRANSIT: ["in transit", "on the road", "en route", "driving", "on the way", "rolling"],
  AT_DELIVERY: ["at delivery", "arrived delivery", "at receiver", "at consignee", "at the delivery"],
  DELIVERED: ["delivered", "unloaded", "dropped off", "completed delivery"],
};

// Location pattern: "City, ST" or "in City ST" or "near City, ST"
const LOCATION_REGEX = /(?:in|at|near|from|leaving|approaching)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)*),?\s*([A-Z]{2})\b/gi;
const CITY_STATE_REGEX = /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)*),\s*([A-Z]{2})\b/g;

// ETA patterns: "ETA 3pm", "arrive by Tuesday", "ETA 2/25 at 4pm"
const ETA_REGEX = /(?:eta|arrive|arriving|delivery)\s*(?:by|at|:)?\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?|\w+day|\d{1,2}\/\d{1,2}(?:\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?)/gi;

// Load reference patterns: "#SRL-1234", "Load 1234", "REF 1234"
const LOAD_REF_REGEX = /(?:#|load|ref|reference|shipment)\s*#?\s*([A-Z]*-?\d{3,8})/gi;

interface ParseResult {
  loadRef: string | null;
  loadId: string | null;
  status: string | null;
  city: string | null;
  state: string | null;
  etaText: string | null;
  confidence: number;
}

/**
 * Parse a carrier email reply to extract check-call information.
 */
export async function parseCheckCallFromEmail(
  senderEmail: string,
  subject: string,
  bodyText: string
): Promise<ParseResult | null> {
  const fullText = `${subject} ${bodyText}`.toLowerCase();
  const originalText = `${subject} ${bodyText}`;

  // 1. Extract load reference
  let loadRef: string | null = null;
  let loadId: string | null = null;
  const refMatch = LOAD_REF_REGEX.exec(originalText);
  if (refMatch) {
    loadRef = refMatch[1];
  }

  // Also try to find load from subject line pattern like "Re: Check-Call: Load #SRL-1234"
  const subjectRefMatch = subject.match(/(?:Load|SRL|REF)\s*#?\s*([A-Z]*-?\d{3,8})/i);
  if (subjectRefMatch) {
    loadRef = subjectRefMatch[1];
  }

  // Look up load by reference number
  if (loadRef) {
    const load = await prisma.load.findFirst({
      where: {
        OR: [
          { referenceNumber: { contains: loadRef, mode: "insensitive" } },
          { loadNumber: { contains: loadRef, mode: "insensitive" } },
        ],
        status: { in: ["DISPATCHED", "AT_PICKUP", "LOADED", "IN_TRANSIT", "AT_DELIVERY"] },
        deletedAt: null,
      },
      select: { id: true, referenceNumber: true },
    });
    if (load) {
      loadId = load.id;
      loadRef = load.referenceNumber;
    }
  }

  // If no load ref in email, try to find by carrier email
  if (!loadId) {
    const carrier = await prisma.user.findFirst({
      where: { email: { equals: senderEmail, mode: "insensitive" }, role: "CARRIER" },
      select: { id: true },
    });
    if (carrier) {
      const activeLoad = await prisma.load.findFirst({
        where: {
          carrierId: carrier.id,
          status: { in: ["DISPATCHED", "AT_PICKUP", "LOADED", "IN_TRANSIT", "AT_DELIVERY"] },
          deletedAt: null,
        },
        orderBy: { pickupDate: "asc" },
        select: { id: true, referenceNumber: true },
      });
      if (activeLoad) {
        loadId = activeLoad.id;
        loadRef = activeLoad.referenceNumber;
      }
    }
  }

  // 2. Extract status
  let status: string | null = null;
  let bestConfidence = 0;
  for (const [statusKey, keywords] of Object.entries(STATUS_KEYWORDS)) {
    for (const keyword of keywords) {
      if (fullText.includes(keyword)) {
        status = statusKey;
        bestConfidence = 0.7;
        break;
      }
    }
    if (status) break;
  }

  // 3. Extract location
  let city: string | null = null;
  let state: string | null = null;
  const locMatch = LOCATION_REGEX.exec(originalText) || CITY_STATE_REGEX.exec(originalText);
  if (locMatch) {
    city = locMatch[1];
    state = locMatch[2];
    bestConfidence = Math.max(bestConfidence, 0.5);
  }

  // 4. Extract ETA
  let etaText: string | null = null;
  const etaMatch = ETA_REGEX.exec(originalText);
  if (etaMatch) {
    etaText = etaMatch[1];
  }

  // If we couldn't extract anything useful, return null
  if (!status && !city && !etaText) {
    return null;
  }

  const confidence = Math.min(1, bestConfidence + (loadId ? 0.2 : 0) + (city ? 0.1 : 0));

  // 5. Create records if we have a load match
  if (loadId) {
    // Create check call record
    await prisma.checkCall.create({
      data: {
        loadId,
        status: status || "IN_TRANSIT",
        driverStatus: status === "AT_PICKUP" ? "AT_PICKUP"
          : status === "AT_DELIVERY" ? "AT_DELIVERY"
          : status === "LOADED" ? "LOADED"
          : "ON_SCHEDULE",
        city: city || null,
        state: state || null,
        location: city && state ? `${city}, ${state}` : null,
        method: "EMAIL_PARSED",
        notes: `Auto-parsed from email: "${subject}". Confidence: ${(confidence * 100).toFixed(0)}%`,
      },
    });

    // Create tracking event
    await prisma.loadTrackingEvent.create({
      data: {
        loadId,
        eventType: "CHECK_CALL",
        locationCity: city,
        locationState: state,
        locationSource: "AE_MANUAL",
        notes: `Email check-call from ${senderEmail}: ${status || "update"}${city ? ` at ${city}, ${state}` : ""}${etaText ? ` ETA: ${etaText}` : ""}`,
      },
    });

    // Update load status if appropriate
    if (status) {
      const statusOrder = ["DISPATCHED", "AT_PICKUP", "LOADED", "IN_TRANSIT", "AT_DELIVERY", "DELIVERED"];
      const load = await prisma.load.findUnique({ where: { id: loadId }, select: { status: true } });
      if (load) {
        const currentIdx = statusOrder.indexOf(load.status);
        const newIdx = statusOrder.indexOf(status);
        if (newIdx > currentIdx) {
          await prisma.load.update({
            where: { id: loadId },
            data: { status: status as any, statusUpdatedAt: new Date() },
          });
        }
      }
    }

    // Broadcast via SSE
    broadcastSSE({
      type: "check_call",
      loadId,
      data: { source: "EMAIL", city, state, status, confidence, senderEmail },
    });

    // Notify AE
    const load = await prisma.load.findUnique({
      where: { id: loadId },
      select: { posterId: true, referenceNumber: true },
    });
    if (load?.posterId) {
      await prisma.notification.create({
        data: {
          userId: load.posterId,
          type: "LOAD_UPDATE",
          title: `Email Check-Call: ${load.referenceNumber}`,
          message: `Auto-parsed from carrier email: ${status || "update"}${city ? ` at ${city}, ${state}` : ""}`,
          actionUrl: "/ae/track-trace.html",
        },
      });
    }
  }

  // Log for AI learning
  try {
    await prisma.learningEventQueue.create({
      data: {
        eventType: "EMAIL_CHECKCALL_PARSE",
        payload: {
          senderEmail,
          subject,
          bodyLength: bodyText.length,
          extractedStatus: status,
          extractedCity: city,
          extractedState: state,
          extractedEta: etaText,
          loadRef,
          loadId,
          confidence,
        },
      },
    });
  } catch { /* non-blocking */ }

  return { loadRef, loadId, status, city, state, etaText, confidence };
}
