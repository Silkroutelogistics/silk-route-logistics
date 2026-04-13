import { prisma } from "../config/database";
import { log } from "../lib/logger";

/**
 * Document OCR / Email-to-Order Pipeline
 *
 * Architecture:
 * 1. Email arrives → parsed by emailIngestService
 * 2. Attachments extracted (PDF, images)
 * 3. OCR engine extracts text (Tesseract / Google Vision / AWS Textract)
 * 4. AI model (Claude) classifies document type and extracts fields
 * 5. Extracted data creates draft load or PO
 *
 * Supported document types:
 * - Rate Confirmations → Extract carrier, rate, lanes, dates
 * - BOL (Bill of Lading) → Extract shipper, consignee, items, weight
 * - POD (Proof of Delivery) → Extract delivery confirmation, signatures
 * - Invoices → Extract line items, amounts, carrier info
 * - Load Tenders → Extract load details, requirements
 * - Purchase Orders → Extract PO#, SKUs, quantities
 */

export interface OcrExtractionResult {
  documentType: "RATE_CONFIRMATION" | "BOL" | "POD" | "INVOICE" | "LOAD_TENDER" | "PURCHASE_ORDER" | "UNKNOWN";
  confidence: number; // 0-100
  extractedFields: Record<string, any>;
  rawText: string;
  sourceFileName: string;
  processingTimeMs: number;
}

export interface EmailIngestResult {
  emailId: string;
  from: string;
  subject: string;
  receivedAt: Date;
  attachments: { fileName: string; mimeType: string; size: number }[];
  extractedLoads: { id: string; status: string }[];
  extractedPOs: { id: string; poNumber: string }[];
}

// ─── OCR Processing ─────────────────────────────────────

export async function processDocument(fileUrl: string, fileName: string): Promise<OcrExtractionResult> {
  const startTime = Date.now();

  // TODO: Integrate actual OCR engine
  // Options:
  // 1. Tesseract.js (free, local) — npm install tesseract.js
  // 2. Google Cloud Vision API — high accuracy, paid
  // 3. AWS Textract — structured document extraction, paid
  // 4. Claude Vision — multimodal AI, can read images and PDFs directly

  log.info({ fileName }, "[OCR] Processing document");

  // Placeholder: return structured result
  return {
    documentType: "UNKNOWN",
    confidence: 0,
    extractedFields: {},
    rawText: "",
    sourceFileName: fileName,
    processingTimeMs: Date.now() - startTime,
  };
}

// ─── Email-to-Order Pipeline ────────────────────────────

export async function processInboundEmail(emailData: {
  from: string;
  subject: string;
  body: string;
  attachments?: { fileName: string; content: string; mimeType: string }[];
}): Promise<EmailIngestResult> {
  log.info({ from: emailData.from, subject: emailData.subject }, "[EmailIngest] Processing inbound email");

  // TODO: Implement full pipeline:
  // 1. Parse email for load request keywords
  // 2. Extract structured data from body (origin, dest, dates, equipment, rate)
  // 3. Process any attachments through OCR
  // 4. Create draft load or match to existing load
  // 5. Notify dispatcher for review

  return {
    emailId: `email_${Date.now()}`,
    from: emailData.from,
    subject: emailData.subject,
    receivedAt: new Date(),
    attachments: (emailData.attachments || []).map((a) => ({
      fileName: a.fileName,
      mimeType: a.mimeType,
      size: a.content.length,
    })),
    extractedLoads: [],
    extractedPOs: [],
  };
}

// ─── AI Classification ──────────────────────────────────

export async function classifyDocument(text: string): Promise<{ type: string; confidence: number }> {
  // TODO: Use Claude API for intelligent document classification
  // const response = await anthropic.messages.create({
  //   model: "claude-sonnet-4-20250514",
  //   messages: [{ role: "user", content: `Classify this logistics document: ${text.slice(0, 2000)}` }],
  // });

  // Simple keyword-based classification as placeholder
  const lower = text.toLowerCase();
  if (lower.includes("rate confirmation") || lower.includes("rate con")) return { type: "RATE_CONFIRMATION", confidence: 80 };
  if (lower.includes("bill of lading") || lower.includes("b/l")) return { type: "BOL", confidence: 80 };
  if (lower.includes("proof of delivery") || lower.includes("pod")) return { type: "POD", confidence: 80 };
  if (lower.includes("invoice") || lower.includes("amount due")) return { type: "INVOICE", confidence: 70 };
  if (lower.includes("purchase order") || lower.includes("p.o.")) return { type: "PURCHASE_ORDER", confidence: 70 };
  if (lower.includes("load tender") || lower.includes("load offer")) return { type: "LOAD_TENDER", confidence: 70 };
  return { type: "UNKNOWN", confidence: 0 };
}

// ─── Stats ──────────────────────────────────────────────

export async function getOcrStats() {
  // Count documents processed (from SystemLog)
  const processed = await prisma.systemLog.count({
    where: { logType: "API_CALL", message: { contains: "OCR" } },
  });

  return {
    documentsProcessed: processed,
    avgConfidence: 0, // placeholder
    topDocumentTypes: [],
    pipelineStatus: "READY", // READY, PROCESSING, ERROR
  };
}
