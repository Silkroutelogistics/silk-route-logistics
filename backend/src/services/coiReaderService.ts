/**
 * AI COI (Certificate of Insurance) Reader Service
 * Uses Gemini Vision API to extract structured data from COI documents.
 * Falls back to basic text extraction if no AI API key is available.
 */

export interface COIExtractedData {
  insurerName: string | null;
  policyNumber: string | null;
  effectiveDate: string | null;
  expirationDate: string | null;
  // Coverage types
  generalLiability: { perOccurrence: number | null; aggregate: number | null } | null;
  autoLiability: { combinedSingleLimit: number | null } | null;
  cargoInsurance: { perOccurrence: number | null } | null;
  workersComp: { perAccident: number | null } | null;
  // Certificate holder
  certificateHolder: string | null;
  additionalInsured: boolean;
  waiverOfSubrogation: boolean;
  // Agent info
  agentName: string | null;
  agentEmail: string | null;
  agentPhone: string | null;
  agencyName: string | null;
  // Confidence
  confidence: "HIGH" | "MEDIUM" | "LOW";
  rawText: string;
}

const COI_PROMPT = `You are an insurance document reader. Extract the following information from this Certificate of Insurance (COI) document. Return ONLY valid JSON with these fields:
{
  "insurerName": "company name",
  "policyNumber": "policy number",
  "effectiveDate": "YYYY-MM-DD",
  "expirationDate": "YYYY-MM-DD",
  "generalLiability": { "perOccurrence": number_or_null, "aggregate": number_or_null },
  "autoLiability": { "combinedSingleLimit": number_or_null },
  "cargoInsurance": { "perOccurrence": number_or_null },
  "workersComp": { "perAccident": number_or_null },
  "certificateHolder": "name if SRL listed",
  "additionalInsured": true_or_false,
  "waiverOfSubrogation": true_or_false,
  "agentName": "agent name",
  "agentEmail": "agent@email.com",
  "agentPhone": "phone number",
  "agencyName": "agency name"
}
For dollar amounts, return as plain numbers (no commas or dollar signs). If a field is not found, use null.`;

/**
 * Extract COI data from a file buffer using Gemini Vision API.
 */
export async function extractCOIData(
  fileBuffer: Buffer,
  mimeType: string
): Promise<COIExtractedData> {
  const geminiKey = process.env.GEMINI_API_KEY;

  if (geminiKey) {
    return extractWithGemini(fileBuffer, mimeType, geminiKey);
  }

  // Fallback: basic text extraction
  return extractWithFallback(fileBuffer);
}

async function extractWithGemini(
  fileBuffer: Buffer,
  mimeType: string,
  apiKey: string
): Promise<COIExtractedData> {
  const base64Data = fileBuffer.toString("base64");

  const requestBody = {
    contents: [
      {
        parts: [
          { text: COI_PROMPT },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Data,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2048,
    },
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    console.error("[COI Reader] Gemini API error:", errText);
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const result = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const textContent =
    result?.candidates?.[0]?.content?.parts?.[0]?.text || "";

  // Parse JSON from response (may be wrapped in markdown code block)
  const jsonMatch = textContent.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error("[COI Reader] No JSON found in Gemini response:", textContent);
    throw new Error("Failed to parse COI data from AI response");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    console.error("[COI Reader] JSON parse error:", jsonMatch[0]);
    throw new Error("Invalid JSON in AI response");
  }

  // Determine confidence
  const majorFields = [
    parsed.insurerName,
    parsed.policyNumber,
    parsed.effectiveDate,
    parsed.expirationDate,
    parsed.generalLiability,
    parsed.autoLiability,
  ];
  const presentCount = majorFields.filter((f) => f !== null && f !== undefined).length;
  let confidence: "HIGH" | "MEDIUM" | "LOW" = "LOW";
  if (presentCount >= 5) confidence = "HIGH";
  else if (presentCount >= 3) confidence = "MEDIUM";

  return {
    insurerName: (parsed.insurerName as string) || null,
    policyNumber: (parsed.policyNumber as string) || null,
    effectiveDate: (parsed.effectiveDate as string) || null,
    expirationDate: (parsed.expirationDate as string) || null,
    generalLiability: parsed.generalLiability
      ? {
          perOccurrence: (parsed.generalLiability as any)?.perOccurrence ?? null,
          aggregate: (parsed.generalLiability as any)?.aggregate ?? null,
        }
      : null,
    autoLiability: parsed.autoLiability
      ? {
          combinedSingleLimit: (parsed.autoLiability as any)?.combinedSingleLimit ?? null,
        }
      : null,
    cargoInsurance: parsed.cargoInsurance
      ? {
          perOccurrence: (parsed.cargoInsurance as any)?.perOccurrence ?? null,
        }
      : null,
    workersComp: parsed.workersComp
      ? {
          perAccident: (parsed.workersComp as any)?.perAccident ?? null,
        }
      : null,
    certificateHolder: (parsed.certificateHolder as string) || null,
    additionalInsured: !!parsed.additionalInsured,
    waiverOfSubrogation: !!parsed.waiverOfSubrogation,
    agentName: (parsed.agentName as string) || null,
    agentEmail: (parsed.agentEmail as string) || null,
    agentPhone: (parsed.agentPhone as string) || null,
    agencyName: (parsed.agencyName as string) || null,
    confidence,
    rawText: textContent,
  };
}

/**
 * Fallback: basic regex-based extraction from PDF text.
 * Very limited — mainly for when no AI key is configured.
 */
async function extractWithFallback(
  fileBuffer: Buffer
): Promise<COIExtractedData> {
  // Convert buffer to string (works for text-based PDFs)
  const rawText = fileBuffer.toString("utf-8");

  // Basic regex patterns
  const policyMatch = rawText.match(/policy\s*(?:#|number|no\.?)\s*:?\s*([A-Z0-9-]+)/i);
  const dateMatch = rawText.match(
    /(?:effective|eff)\s*(?:date)?\s*:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i
  );
  const expMatch = rawText.match(
    /(?:expir|exp)\s*(?:ation|date)?\s*:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i
  );
  const emailMatch = rawText.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  const phoneMatch = rawText.match(/(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/);

  // Dollar amount extraction
  const amountPattern = /\$\s?([\d,]+(?:\.\d{2})?)/g;
  const amounts: number[] = [];
  let amountMatch;
  while ((amountMatch = amountPattern.exec(rawText)) !== null) {
    amounts.push(parseFloat(amountMatch[1].replace(/,/g, "")));
  }

  return {
    insurerName: null,
    policyNumber: policyMatch?.[1] || null,
    effectiveDate: dateMatch?.[1] || null,
    expirationDate: expMatch?.[1] || null,
    generalLiability:
      amounts.length > 0
        ? { perOccurrence: amounts[0] || null, aggregate: amounts[1] || null }
        : null,
    autoLiability:
      amounts.length > 2 ? { combinedSingleLimit: amounts[2] || null } : null,
    cargoInsurance: null,
    workersComp: null,
    certificateHolder: null,
    additionalInsured: /additional\s*insured/i.test(rawText),
    waiverOfSubrogation: /waiver\s*of\s*subrogation/i.test(rawText),
    agentName: null,
    agentEmail: emailMatch?.[1] || null,
    agentPhone: phoneMatch?.[1] || null,
    agencyName: null,
    confidence: "LOW",
    rawText: rawText.substring(0, 5000),
  };
}
