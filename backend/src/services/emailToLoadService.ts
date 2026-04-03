/**
 * Email-to-Load Parser Service
 *
 * Parses incoming shipper emails and automatically creates load records
 * in DRAFT status for human review.
 */

import { prisma } from "../config/database";

// ─── Types ──────────────────────────────────────────────

export interface ParsedLoad {
  originCity?: string;
  originState?: string;
  destCity?: string;
  destState?: string;
  equipmentType?: string;
  weight?: number;
  pieces?: number;
  pickupDate?: string;
  deliveryDate?: string;
  commodity?: string;
  rate?: number;
  specialInstructions?: string;
  hazmat?: boolean;
  hazmatUnNumber?: string;
  temperatureControlled?: boolean;
  tempMin?: number;
  tempMax?: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  missingFields: string[];
  rawText: string;
}

// ─── US States + DC + Canadian Provinces ────────────────

const STATE_MAP: Record<string, string> = {
  // US States
  "alabama": "AL",
  "alaska": "AK",
  "arizona": "AZ",
  "arkansas": "AR",
  "california": "CA",
  "colorado": "CO",
  "connecticut": "CT",
  "delaware": "DE",
  "florida": "FL",
  "georgia": "GA",
  "hawaii": "HI",
  "idaho": "ID",
  "illinois": "IL",
  "indiana": "IN",
  "iowa": "IA",
  "kansas": "KS",
  "kentucky": "KY",
  "louisiana": "LA",
  "maine": "ME",
  "maryland": "MD",
  "massachusetts": "MA",
  "michigan": "MI",
  "minnesota": "MN",
  "mississippi": "MS",
  "missouri": "MO",
  "montana": "MT",
  "nebraska": "NE",
  "nevada": "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  "ohio": "OH",
  "oklahoma": "OK",
  "oregon": "OR",
  "pennsylvania": "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  "tennessee": "TN",
  "texas": "TX",
  "utah": "UT",
  "vermont": "VT",
  "virginia": "VA",
  "washington": "WA",
  "west virginia": "WV",
  "wisconsin": "WI",
  "wyoming": "WY",
  // DC
  "district of columbia": "DC",
  "washington dc": "DC",
  "washington d.c.": "DC",
  // Canadian Provinces
  "ontario": "ON",
  "british columbia": "BC",
  "alberta": "AB",
  "manitoba": "MB",
  "saskatchewan": "SK",
  "quebec": "QC",
  "nova scotia": "NS",
  "new brunswick": "NB",
  "prince edward island": "PE",
  "newfoundland": "NL",
  "newfoundland and labrador": "NL",
};

// Valid 2-letter state/province codes for validation
const VALID_CODES = new Set(Object.values(STATE_MAP));

// Equipment type normalization
const EQUIPMENT_MAP: Record<string, string> = {
  "dry van": "DRY_VAN",
  "dryvan": "DRY_VAN",
  "van": "DRY_VAN",
  "reefer": "REEFER",
  "refer": "REEFER",
  "refrigerated": "REEFER",
  "flatbed": "FLATBED",
  "flat bed": "FLATBED",
  "flat": "FLATBED",
  "step deck": "STEP_DECK",
  "stepdeck": "STEP_DECK",
  "step-deck": "STEP_DECK",
  "lowboy": "LOWBOY",
  "power only": "POWER_ONLY",
  "container": "CONTAINER",
  "tanker": "TANKER",
  "hopper": "HOPPER",
  "conestoga": "CONESTOGA",
  "rgn": "RGN",
  "double drop": "DOUBLE_DROP",
  "hotshot": "HOTSHOT",
  "sprinter": "SPRINTER",
  "box truck": "BOX_TRUCK",
};

// ─── Helper: resolve state abbreviation ─────────────────

function resolveState(input: string): string | undefined {
  const trimmed = input.trim();
  const upper = trimmed.toUpperCase();
  if (upper.length === 2 && VALID_CODES.has(upper)) return upper;
  const mapped = STATE_MAP[trimmed.toLowerCase()];
  if (mapped) return mapped;
  return undefined;
}

// ─── Helper: parse relative dates ───────────────────────

function resolveRelativeDate(text: string): string | undefined {
  const lower = text.toLowerCase().trim();
  const now = new Date();

  if (lower === "today") {
    return now.toISOString().split("T")[0];
  }
  if (lower === "tomorrow") {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  }
  if (lower === "next week") {
    const d = new Date(now);
    d.setDate(d.getDate() + 7);
    return d.toISOString().split("T")[0];
  }

  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const dayIdx = dayNames.indexOf(lower);
  if (dayIdx !== -1) {
    const d = new Date(now);
    const currentDay = d.getDay();
    let daysAhead = dayIdx - currentDay;
    if (daysAhead <= 0) daysAhead += 7;
    d.setDate(d.getDate() + daysAhead);
    return d.toISOString().split("T")[0];
  }

  return undefined;
}

// ─── Helper: parse date string ──────────────────────────

const MONTH_MAP: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function parseDateString(text: string): string | undefined {
  const trimmed = text.trim();

  // Try relative first
  const relative = resolveRelativeDate(trimmed);
  if (relative) return relative;

  // M/D or M/D/YY or M/D/YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (slashMatch) {
    const month = parseInt(slashMatch[1], 10);
    const day = parseInt(slashMatch[2], 10);
    let year = slashMatch[3] ? parseInt(slashMatch[3], 10) : new Date().getFullYear();
    if (year < 100) year += 2000;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // "April 15" or "April 15, 2026" or "Apr 15"
  const monthNameMatch = trimmed.match(/^([a-zA-Z]+)\s+(\d{1,2})(?:[,\s]+(\d{4}))?$/);
  if (monthNameMatch) {
    const monthNum = MONTH_MAP[monthNameMatch[1].toLowerCase()];
    if (monthNum) {
      const day = parseInt(monthNameMatch[2], 10);
      const year = monthNameMatch[3] ? parseInt(monthNameMatch[3], 10) : new Date().getFullYear();
      return `${year}-${String(monthNum).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  return undefined;
}

// ─── Main Parser ────────────────────────────────────────

export function parseShipperEmail(emailBody: string, _senderEmail: string): ParsedLoad {
  const text = emailBody.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lower = text.toLowerCase();

  const parsed: ParsedLoad = {
    confidence: "LOW",
    missingFields: [],
    rawText: text,
  };

  // ── Origin / Destination ──────────────────────────────

  // Pattern: "from <City> <ST> to <City> <ST>"
  const fromToPattern = /from\s+([A-Za-z\s.'-]+?)[,\s]+([A-Za-z]{2,})\s+to\s+([A-Za-z\s.'-]+?)[,\s]+([A-Za-z]{2,})/i;
  let m = text.match(fromToPattern);
  if (m) {
    const oState = resolveState(m[2]);
    const dState = resolveState(m[4]);
    if (oState) { parsed.originCity = m[1].trim(); parsed.originState = oState; }
    if (dState) { parsed.destCity = m[3].trim(); parsed.destState = dState; }
  }

  // Pattern: "City, ST -> City, ST" or with arrow
  if (!parsed.originCity) {
    const arrowPattern = /([A-Za-z\s.'-]+?)[,\s]+([A-Za-z]{2,})\s*(?:→|->|➡|to)\s*([A-Za-z\s.'-]+?)[,\s]+([A-Za-z]{2,})/i;
    m = text.match(arrowPattern);
    if (m) {
      const oState = resolveState(m[2]);
      const dState = resolveState(m[4]);
      if (oState) { parsed.originCity = m[1].trim(); parsed.originState = oState; }
      if (dState) { parsed.destCity = m[3].trim(); parsed.destState = dState; }
    }
  }

  // Pattern: "origin: City ST" / "pickup: City ST"
  if (!parsed.originCity) {
    const originPattern = /(?:origin|pickup|pick\s*up|pu|ship\s*from)\s*[:\-]?\s*([A-Za-z\s.'-]+?)[,\s]+([A-Za-z]{2,})/i;
    m = text.match(originPattern);
    if (m) {
      const st = resolveState(m[2]);
      if (st) { parsed.originCity = m[1].trim(); parsed.originState = st; }
    }
  }

  // Pattern: "destination: City ST" / "deliver to: City ST"
  if (!parsed.destCity) {
    const destPattern = /(?:destination|deliver(?:y)?\s*(?:to)?|del|dest|consignee|drop)\s*[:\-]?\s*([A-Za-z\s.'-]+?)[,\s]+([A-Za-z]{2,})/i;
    m = text.match(destPattern);
    if (m) {
      const st = resolveState(m[2]);
      if (st) { parsed.destCity = m[1].trim(); parsed.destState = st; }
    }
  }

  // ── Equipment Type ────────────────────────────────────

  for (const [keyword, normalized] of Object.entries(EQUIPMENT_MAP)) {
    if (lower.includes(keyword)) {
      parsed.equipmentType = normalized;
      break;
    }
  }

  // ── Weight ────────────────────────────────────────────

  // "42000 lbs", "42,000 lbs", "42K lbs", "weight: 42000"
  const weightPatterns = [
    /(?:weight|wt)\s*[:\-]?\s*([\d,]+)\s*(?:lbs?|pounds?)?/i,
    /([\d,]+)\s*(?:lbs?|pounds?)/i,
    /(\d+)\s*[kK]\s*(?:lbs?|pounds?)/i,
  ];
  for (const pat of weightPatterns) {
    const wm = text.match(pat);
    if (wm) {
      let wStr = wm[1].replace(/,/g, "");
      if (/\d+\s*[kK]/.test(wm[0])) {
        parsed.weight = parseInt(wStr, 10) * 1000;
      } else {
        parsed.weight = parseInt(wStr, 10);
      }
      if (parsed.weight > 0) break;
    }
  }

  // ── Pieces / Pallets ─────────────────────────────────

  const piecesPatterns = [
    /(?:pieces?|pcs?|skids?|pallets?)\s*[:\-]?\s*(\d+)/i,
    /(\d+)\s*(?:pallets?|pieces?|pcs|skids?)/i,
  ];
  for (const pat of piecesPatterns) {
    const pm = text.match(pat);
    if (pm) {
      parsed.pieces = parseInt(pm[1], 10);
      if (parsed.pieces > 0) break;
    }
  }

  // ── Dates ─────────────────────────────────────────────

  // Pickup date
  const pickupPatterns = [
    /(?:pickup|pick\s*up|pu)\s*[:\-]?\s*(?:date\s*[:\-]?\s*)?([A-Za-z0-9\/\s,]+?)(?:\n|$|;|\.|delivery|del|drop)/i,
  ];
  for (const pat of pickupPatterns) {
    const dm = text.match(pat);
    if (dm) {
      const dateStr = parseDateString(dm[1]);
      if (dateStr) { parsed.pickupDate = dateStr; break; }
    }
  }

  // Delivery date
  const deliveryPatterns = [
    /(?:delivery|deliver|del|drop)\s*(?:by|date)?\s*[:\-]?\s*([A-Za-z0-9\/\s,]+?)(?:\n|$|;|\.)/i,
  ];
  for (const pat of deliveryPatterns) {
    const dm = text.match(pat);
    if (dm) {
      const dateStr = parseDateString(dm[1]);
      if (dateStr) { parsed.deliveryDate = dateStr; break; }
    }
  }

  // ── Rate ──────────────────────────────────────────────

  const ratePatterns = [
    /(?:rate|budget|willing\s+to\s+pay|pay|price)\s*[:\-]?\s*\$?([\d,]+(?:\.\d{2})?)/i,
    /\$([\d,]+(?:\.\d{2})?)/i,
  ];
  for (const pat of ratePatterns) {
    const rm = text.match(pat);
    if (rm) {
      parsed.rate = parseFloat(rm[1].replace(/,/g, ""));
      if (parsed.rate > 0) break;
    }
  }

  // ── Commodity ─────────────────────────────────────────

  const commodityPatterns = [
    /(?:commodity|shipping|hauling|freight|cargo|product|goods)\s*[:\-]?\s*([A-Za-z0-9\s&,'-]+?)(?:\n|$|;|\.|\d)/i,
  ];
  for (const pat of commodityPatterns) {
    const cm = text.match(pat);
    if (cm) {
      const val = cm[1].trim();
      if (val.length > 1 && val.length < 100) {
        parsed.commodity = val;
        break;
      }
    }
  }

  // ── Hazmat ────────────────────────────────────────────

  if (/hazmat|hazardous/i.test(text)) {
    parsed.hazmat = true;
    const unMatch = text.match(/UN\s*(\d{4})/i);
    if (unMatch) parsed.hazmatUnNumber = `UN${unMatch[1]}`;
  }

  // ── Temperature ───────────────────────────────────────

  if (/temp(?:erature)?\s*(?:controlled|control)|frozen|chilled/i.test(text) || parsed.equipmentType === "REEFER") {
    parsed.temperatureControlled = true;
    const tempRange = text.match(/temp\s*[:\-]?\s*(-?\d+)\s*[-–]\s*(-?\d+)/i);
    if (tempRange) {
      parsed.tempMin = parseFloat(tempRange[1]);
      parsed.tempMax = parseFloat(tempRange[2]);
    }
  }

  // ── Special Instructions ──────────────────────────────

  const instrPatterns = [
    /(?:special\s*instructions?|notes?|requirements?|instructions?)\s*[:\-]?\s*(.+?)(?:\n\n|$)/is,
  ];
  for (const pat of instrPatterns) {
    const im = text.match(pat);
    if (im) {
      const val = im[1].trim();
      if (val.length > 2 && val.length < 500) {
        parsed.specialInstructions = val;
        break;
      }
    }
  }

  // ── Confidence Scoring ────────────────────────────────

  const missing: string[] = [];
  if (!parsed.originCity || !parsed.originState) missing.push("origin");
  if (!parsed.destCity || !parsed.destState) missing.push("destination");
  if (!parsed.equipmentType) missing.push("equipmentType");
  if (!parsed.pickupDate) missing.push("pickupDate");
  if (!parsed.deliveryDate) missing.push("deliveryDate");
  if (!parsed.weight) missing.push("weight");
  if (!parsed.rate) missing.push("rate");
  parsed.missingFields = missing;

  const hasOrigin = !!(parsed.originCity && parsed.originState);
  const hasDest = !!(parsed.destCity && parsed.destState);

  if (hasOrigin && hasDest && parsed.equipmentType && parsed.pickupDate) {
    parsed.confidence = "HIGH";
  } else if (hasOrigin && hasDest) {
    parsed.confidence = "MEDIUM";
  } else {
    parsed.confidence = "LOW";
  }

  return parsed;
}

// ─── Create Load from Parsed Email ──────────────────────

export async function createLoadFromEmail(
  parsed: ParsedLoad,
  senderEmail: string,
  needsReview: boolean = false
) {
  // Look up sender as customer
  const customer = await prisma.customer.findFirst({
    where: { email: { equals: senderEmail, mode: "insensitive" } },
  });

  // Find a system admin user to act as poster
  const systemUser = await prisma.user.findFirst({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
  });

  if (!systemUser) {
    throw new Error("No active ADMIN user found to create load");
  }

  // Default dates if not parsed
  const now = new Date();
  const pickupDate = parsed.pickupDate
    ? new Date(parsed.pickupDate + "T08:00:00Z")
    : new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const deliveryDate = parsed.deliveryDate
    ? new Date(parsed.deliveryDate + "T17:00:00Z")
    : new Date(pickupDate.getTime() + 2 * 24 * 60 * 60 * 1000);

  const load = await prisma.load.create({
    data: {
      status: "DRAFT",
      originCity: parsed.originCity || "TBD",
      originState: parsed.originState || "XX",
      originZip: "00000",
      destCity: parsed.destCity || "TBD",
      destState: parsed.destState || "XX",
      destZip: "00000",
      equipmentType: parsed.equipmentType || "DRY_VAN",
      weight: parsed.weight || null,
      pieces: parsed.pieces || null,
      pickupDate,
      deliveryDate,
      commodity: parsed.commodity || null,
      rate: parsed.rate || 0,
      specialInstructions: parsed.specialInstructions || null,
      hazmat: parsed.hazmat || false,
      hazmatUnNumber: parsed.hazmatUnNumber || null,
      temperatureControlled: parsed.temperatureControlled || false,
      tempMin: parsed.tempMin || null,
      tempMax: parsed.tempMax || null,
      posterId: systemUser.id,
      customerId: customer?.id || null,
      notes: [
        `[Email-to-Load] Created from email by ${senderEmail}`,
        `Confidence: ${parsed.confidence}`,
        needsReview ? "NEEDS MANUAL REVIEW" : "",
        parsed.missingFields.length > 0 ? `Missing: ${parsed.missingFields.join(", ")}` : "",
      ].filter(Boolean).join("\n"),
    },
  });

  // Notify all BROKER and ADMIN users
  const notifyUsers = await prisma.user.findMany({
    where: {
      role: { in: ["BROKER", "ADMIN"] },
      isActive: true,
    },
    select: { id: true },
  });

  const lane = `${parsed.originCity || "?"} → ${parsed.destCity || "?"}`;

  if (notifyUsers.length > 0) {
    await prisma.notification.createMany({
      data: notifyUsers.map((u) => ({
        userId: u.id,
        type: "EMAIL_LOAD",
        title: needsReview ? "Email load needs review" : "New load from email",
        message: `New load created from email: ${lane}. Confidence: ${parsed.confidence}. ${
          needsReview ? "Manual review required." : ""
        }`.trim(),
        link: `/loads`,
      })),
    });
  }

  console.log(`[EmailToLoad] Created load ${load.referenceNumber} (${lane}) — confidence ${parsed.confidence}`);
  return load;
}

// ─── Process Inbound Email (Webhook Handler) ────────────

export async function processInboundEmail(
  from: string,
  subject: string,
  body: string
) {
  // Strip HTML tags
  const plainBody = body
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

  // Extract sender email
  const senderEmail = (from.match(/<([^>]+)>/) || [null, from])[1]!.toLowerCase().trim();

  const fullText = `${subject}\n${plainBody}`;

  console.log(`[EmailToLoad] Processing email from ${senderEmail}, subject: "${subject}"`);

  const parsed = parseShipperEmail(fullText, senderEmail);

  // Find a system user for logging
  const systemUser = await prisma.user.findFirst({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
  });

  // Log everything
  await prisma.systemLog.create({
    data: {
      logType: "INTEGRATION",
      severity: "INFO",
      source: "EmailToLoadParser",
      endpoint: "/webhooks/inbound-email-load",
      userId: systemUser?.id || null,
      message: `Email-to-Load parse: confidence=${parsed.confidence}, from=${senderEmail}`,
      details: {
        from: senderEmail,
        subject,
        parsed: {
          originCity: parsed.originCity,
          originState: parsed.originState,
          destCity: parsed.destCity,
          destState: parsed.destState,
          equipmentType: parsed.equipmentType,
          weight: parsed.weight,
          pickupDate: parsed.pickupDate,
          deliveryDate: parsed.deliveryDate,
          confidence: parsed.confidence,
          missingFields: parsed.missingFields,
        },
      } as any,
    },
  });

  if (parsed.confidence === "HIGH") {
    const load = await createLoadFromEmail(parsed, senderEmail, false);
    return { action: "CREATED", loadId: load.id, referenceNumber: load.referenceNumber, confidence: "HIGH" };
  }

  if (parsed.confidence === "MEDIUM") {
    const load = await createLoadFromEmail(parsed, senderEmail, true);
    return { action: "CREATED_FOR_REVIEW", loadId: load.id, referenceNumber: load.referenceNumber, confidence: "MEDIUM" };
  }

  // LOW confidence — just notify, don't create a load
  const notifyUsers = await prisma.user.findMany({
    where: { role: { in: ["BROKER", "ADMIN"] }, isActive: true },
    select: { id: true },
  });

  if (notifyUsers.length > 0) {
    await prisma.notification.createMany({
      data: notifyUsers.map((u) => ({
        userId: u.id,
        type: "EMAIL_LOAD",
        title: "Email load parse failed",
        message: `Could not parse email from ${senderEmail} — manual entry needed. Subject: "${subject}"`,
        link: "/loads",
      })),
    });
  }

  console.log(`[EmailToLoad] LOW confidence for ${senderEmail} — notification only`);
  return { action: "NOTIFICATION_ONLY", confidence: "LOW", missingFields: parsed.missingFields };
}
