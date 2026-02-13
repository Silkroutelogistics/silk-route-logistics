import { prisma } from "../config/database";
import { Prisma } from "@prisma/client";

/**
 * Email Quote Service — AI-powered email quote processing.
 *
 * When a shipper sends an email requesting a quote, this service:
 *   1. Classifies the email (quote request, booking, status inquiry, etc.)
 *   2. Extracts structured data (origin, destination, dates, equipment, commodity)
 *   3. Generates a competitive rate using rate intelligence
 *   4. Logs everything for learning
 *
 * COMPETITIVE EDGE: Sub-minute email-to-quote response time (vs industry 30+ min).
 */

const toJson = (v: Record<string, unknown>): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

interface EmailClassification {
  type: "QUOTE_REQUEST" | "BOOKING_REQUEST" | "STATUS_INQUIRY" | "COMPLAINT" | "GENERAL" | "UNKNOWN";
  confidence: number;
}

interface ExtractedQuoteData {
  originCity?: string;
  originState?: string;
  originZip?: string;
  destCity?: string;
  destState?: string;
  destZip?: string;
  pickupDate?: string;
  deliveryDate?: string;
  equipmentType?: string;
  commodity?: string;
  weight?: number;
  specialRequirements?: string[];
  senderCompany?: string;
}

interface QuoteResponse {
  classification: EmailClassification;
  extractedData: ExtractedQuoteData;
  suggestedRate: number | null;
  rateConfidence: string;
  processingTimeMs: number;
  logId: string;
}

// ─── Classify Email ──────────────────────────────────────────────────────────

export function classifyEmail(subject: string, body: string): EmailClassification {
  const combined = `${subject} ${body}`.toLowerCase();

  // Simple keyword-based classification (to be replaced with AI)
  const quoteKeywords = ["quote", "rate", "pricing", "how much", "cost", "price for", "rfq", "bid"];
  const bookingKeywords = ["book", "confirm", "proceed", "accept", "lock in", "schedule"];
  const statusKeywords = ["status", "where is", "tracking", "update", "eta", "delivery time"];
  const complaintKeywords = ["complaint", "issue", "problem", "damaged", "late", "missing"];

  const quoteScore = quoteKeywords.filter((k) => combined.includes(k)).length;
  const bookingScore = bookingKeywords.filter((k) => combined.includes(k)).length;
  const statusScore = statusKeywords.filter((k) => combined.includes(k)).length;
  const complaintScore = complaintKeywords.filter((k) => combined.includes(k)).length;

  const scores = { quoteScore, bookingScore, statusScore, complaintScore };
  const max = Math.max(...Object.values(scores));

  if (max === 0) return { type: "GENERAL", confidence: 0.3 };

  const confidence = Math.min(0.95, 0.4 + max * 0.15);

  if (quoteScore === max) return { type: "QUOTE_REQUEST", confidence };
  if (bookingScore === max) return { type: "BOOKING_REQUEST", confidence };
  if (statusScore === max) return { type: "STATUS_INQUIRY", confidence };
  if (complaintScore === max) return { type: "COMPLAINT", confidence };

  return { type: "UNKNOWN", confidence: 0.2 };
}

// ─── Extract Quote Data from Email Body ──────────────────────────────────────

export function extractQuoteData(body: string): ExtractedQuoteData {
  const data: ExtractedQuoteData = {};

  // State abbreviation patterns
  const statePattern =
    /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/g;
  const states = body.match(statePattern);

  if (states && states.length >= 2) {
    data.originState = states[0];
    data.destState = states[1];
  }

  // ZIP code patterns
  const zipPattern = /\b(\d{5})\b/g;
  const zips = body.match(zipPattern);
  if (zips && zips.length >= 2) {
    data.originZip = zips[0];
    data.destZip = zips[1];
  } else if (zips && zips.length === 1) {
    data.originZip = zips[0];
  }

  // Date patterns
  const datePattern = /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/g;
  const dates = body.match(datePattern);
  if (dates && dates.length >= 1) data.pickupDate = dates[0];
  if (dates && dates.length >= 2) data.deliveryDate = dates[1];

  // Equipment type
  const lowerBody = body.toLowerCase();
  if (lowerBody.includes("reefer") || lowerBody.includes("refrigerated")) {
    data.equipmentType = "REEFER";
  } else if (lowerBody.includes("flatbed") || lowerBody.includes("flat bed")) {
    data.equipmentType = "FLATBED";
  } else if (lowerBody.includes("dry van") || lowerBody.includes("van")) {
    data.equipmentType = "DRY_VAN";
  }

  // Weight
  const weightMatch = body.match(/(\d{1,3},?\d{3})\s*(lbs?|pounds?)/i);
  if (weightMatch) {
    data.weight = parseInt(weightMatch[1].replace(",", ""));
  }

  // Commodity
  const commodityPatterns = ["produce", "electronics", "automotive", "food", "beverage", "chemicals", "machinery", "furniture"];
  for (const c of commodityPatterns) {
    if (lowerBody.includes(c)) {
      data.commodity = c.charAt(0).toUpperCase() + c.slice(1);
      break;
    }
  }

  return data;
}

// ─── Generate Rate for Quote ─────────────────────────────────────────────────

async function generateRate(extracted: ExtractedQuoteData): Promise<{
  rate: number | null;
  confidence: string;
}> {
  if (!extracted.originState || !extracted.destState) {
    return { rate: null, confidence: "NONE" };
  }

  const laneKey = `${extracted.originState}:${extracted.destState}`;
  const equipment = extracted.equipmentType || "DRY_VAN";

  // Check rate intelligence
  const intel = await prisma.rateIntelligence.findUnique({
    where: { laneKey_equipmentType: { laneKey, equipmentType: equipment } },
  });

  if (intel && intel.sampleSize >= 3) {
    return {
      rate: Math.round(intel.predictedRate ?? intel.avgRate),
      confidence: intel.confidence >= 0.7 ? "HIGH" : intel.confidence >= 0.4 ? "MEDIUM" : "LOW",
    };
  }

  // Fallback: check lane intelligence for RPM estimate
  const laneIntel = await prisma.laneIntelligence.findUnique({
    where: { laneKey },
  });

  if (laneIntel && laneIntel.avgRate > 0) {
    return { rate: Math.round(laneIntel.avgRate), confidence: "LOW" };
  }

  // Last resort: RPM estimate
  if (laneIntel && laneIntel.avgMiles > 0) {
    const baseRpm = equipment === "REEFER" ? 3.2 : equipment === "FLATBED" ? 3.5 : 2.8;
    return {
      rate: Math.round(laneIntel.avgMiles * baseRpm),
      confidence: "VERY_LOW",
    };
  }

  return { rate: null, confidence: "NONE" };
}

// ─── Process an Incoming Email ───────────────────────────────────────────────

export async function processQuoteEmail(
  subject: string,
  body: string,
  sender: string
): Promise<QuoteResponse> {
  const startTime = Date.now();

  // Step 1: Classify
  const classification = classifyEmail(subject, body);

  // Step 2: Extract data
  const extractedData = extractQuoteData(body);

  // Step 3: Generate rate (only for quote requests)
  let suggestedRate: number | null = null;
  let rateConfidence = "NONE";

  if (classification.type === "QUOTE_REQUEST") {
    const rateResult = await generateRate(extractedData);
    suggestedRate = rateResult.rate;
    rateConfidence = rateResult.confidence;
  }

  const processingTimeMs = Date.now() - startTime;

  // Step 4: Log
  const log = await prisma.emailQuoteLog.create({
    data: {
      emailSubject: subject.slice(0, 500),
      sender,
      classification: classification.type,
      classificationConfidence: classification.confidence,
      extractedDataJson: toJson(extractedData as Record<string, unknown>),
      generatedRate: suggestedRate,
      rateConfidence,
      outcome: "PROCESSED",
      processingTimeMs,
    },
  });

  return {
    classification,
    extractedData,
    suggestedRate,
    rateConfidence,
    processingTimeMs,
    logId: log.id,
  };
}

// ─── Get Email Quote Analytics ───────────────────────────────────────────────

export async function getEmailQuoteAnalytics(days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);

  const logs = await prisma.emailQuoteLog.findMany({
    where: { createdAt: { gte: since } },
  });

  const total = logs.length;
  const quoteRequests = logs.filter((l) => l.classification === "QUOTE_REQUEST").length;
  const withRate = logs.filter((l) => l.generatedRate != null).length;
  const avgProcessingTime =
    logs.reduce((s, l) => s + (l.processingTimeMs ?? 0), 0) / Math.max(1, total);

  const byClassification: Record<string, number> = {};
  for (const log of logs) {
    const cls = log.classification ?? "UNKNOWN";
    byClassification[cls] = (byClassification[cls] ?? 0) + 1;
  }

  return {
    total,
    quoteRequests,
    withRateGenerated: withRate,
    avgProcessingTimeMs: Math.round(avgProcessingTime),
    byClassification,
  };
}
