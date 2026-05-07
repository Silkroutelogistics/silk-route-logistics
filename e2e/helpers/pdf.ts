/**
 * E2E PDF helper — text extraction + brand-skill conformance assertions.
 *
 * Sprint 37 B10-B12: assert that customer-facing PDFs (BOL, RC, Invoice)
 * never regress on Sprint-30 / Sprint-33 / future brand-skill fixes.
 *
 * Strategy: download PDF blob via authenticated request, parse text
 * with pdf-parse, run forbidden + required text assertions.
 *
 * Forbidden: strings that MUST NOT appear (legacy/wrong values that
 *   prior sprints removed). Catching one means a regression.
 * Required: strings that MUST appear (canonical values that prior
 *   sprints established). Missing one means a regression.
 *
 * Both lists are append-only — every future canonical brand fix
 * adds to required, every retired template value adds to forbidden.
 */
import { expect } from "@playwright/test";
// @ts-expect-error pdf-parse has no bundled types until @types/pdf-parse installs
import pdfParse from "pdf-parse";

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer);
  return data.text || "";
}

/**
 * Sprint 30 closed: Houston address + MC-/DOT- hyphenated format +
 *   dispatch@ alias + State of Texas governing law.
 * Sprint 33 closed: Flash/Express/Priority/Partner/Elite Pay legacy
 *   payment-tier 6-card scheme.
 *
 * RC PDF must NOT contain any of these post-Sprint-30 / Sprint-33.
 */
export const RC_PDF_FORBIDDEN: string[] = [
  // Sprint 30 — Houston template provenance
  "Westheimer",
  "Houston, TX 77063",
  "MC-1794414",
  "DOT-4526880",
  "dispatch@silkroutelogistics",
  "State of Texas",
  // Sprint 33 — legacy 6-tier payment scheme
  "Flash Pay",
  "Express Pay",
  "Priority Pay",
  "Partner Pay",
  "Elite Pay",
];

/**
 * Sprint 30 + Sprint 33 + Sprint 35 canonical values that MUST appear.
 * Some fields are conditional on test load state (e.g., payment tier
 * only fires when AE selected one). Required-list is the strict subset
 * that always appears regardless of test state.
 */
export const RC_PDF_REQUIRED: string[] = [
  // Sprint 30 — canonical SRL identity per CLAUDE.md §1
  "Silk Route Logistics Inc.",
  "Galesburg, MI 49053",
  "MC# 1794414",
  "DOT# 4526880",
  "operations@silkroutelogistics.ai",
  "(269) 220-6760",
  // Sprint 30 — Michigan governing law per §14
  "State of Michigan",
  "Kalamazoo County",
];

/**
 * BOL PDF assertions. Same Sprint 30 SRL identity assertions; BOL
 * doesn't have payment-tier section (RC-only) so no Sprint 33
 * forbidden list here.
 */
export const BOL_PDF_FORBIDDEN: string[] = [
  "Westheimer",
  "Houston, TX 77063",
  "MC-1794414",
  "DOT-4526880",
];

export const BOL_PDF_REQUIRED: string[] = [
  "Silk Route Logistics Inc.",
  "Galesburg, MI 49053",
];

export function assertNoForbidden(pdfText: string, forbidden: string[], context: string) {
  const hits = forbidden.filter((s) => pdfText.includes(s));
  expect(hits, `${context}: forbidden text found in PDF — regression of prior fix`).toEqual([]);
}

export function assertAllRequired(pdfText: string, required: string[], context: string) {
  const missing = required.filter((s) => !pdfText.includes(s));
  expect(missing, `${context}: required text missing from PDF — regression of prior fix`).toEqual([]);
}
