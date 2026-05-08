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
 * Sprint 30 canonical values that MUST appear in the current RC PDF.
 *
 * v3.8.aas Sprint 37g — REQUIRED list trimmed to what the RC PDF actually
 * renders today. The fuller identity block (MC#, DOT#, operations@ alias,
 * governing-law clause) is tracked in CLAUDE.md §13.3 Item 48 as a separate
 * post-BKN architectural sprint reconciling the RC PDF against the
 * `srl-brand-design` skill canonical (parallels BOL v2.9 epic shape, est.
 * 200-400 LOC across pdfService.ts). Adding those strings to REQUIRED
 * before Item 48 ships would assert future-state, not current-state.
 *
 * When Item 48 lands, that sprint extends this array with:
 *   "MC# 1794414", "DOT# 4526880", "operations@silkroutelogistics.ai",
 *   "State of Michigan", "Kalamazoo County"
 *
 * The FORBIDDEN list above stays strict — Sprint 30 retired the wrong
 * Texas-template values from the existing render code. Adding them back
 * is unambiguously a regression even before Item 48 ships.
 */
export const RC_PDF_REQUIRED: string[] = [
  "Silk Route Logistics Inc.",
  "Galesburg, MI 49053",
  "(269) 220-6760",
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
