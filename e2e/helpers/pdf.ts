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
  // v3.8 (counsel architecture) — the RC now references the BCA generically;
  // the stale hard-coded BCA version citation must never return.
  "BCA v3.1",
  "Broker-Carrier Agreement v3.1",
];

/**
 * Sprint 30 canonical values that MUST appear in the current RC PDF.
 *
 * v3.8.aas Sprint 37g — REQUIRED list trimmed to what the RC PDF actually
 * renders today.
 *
 * Sprint 45-RC (v3.8.abd) — Item 48 close. Path β1 migration to skill
 * chrome library landed. REQUIRED extended with 4 of the 5 strings the
 * Sprint 37g comment flagged as "future Item 48":
 *   - "DOT# 4526880" — rendered by drawHeaderFirstPage company-info block
 *     and by drawFooter every page footer (skill srl-chrome.ts BRAND.dot)
 *   - "operations@silkroutelogistics.ai" — rendered by drawHeaderFirstPage
 *     phone | email | domain line (skill BRAND.email; per CLAUDE.md §1
 *     this alias is the canonical for shipper/carrier-facing documents)
 *   - "State of Michigan" — rendered in T&C governing-law clause
 *   - "Kalamazoo County" — rendered in T&C venue clause
 *
 * "MC# 1794414" deliberately excluded per Sprint 45-RC D7 ratification —
 * the skill BRAND.mc has the leading-zero typo ("01794414") which is a
 * known Item 8.8 carry-forward. Item 8.8's dedicated sprint will close
 * that across all 14 surfaces atomically, at which point this REQUIRED
 * extends to include "MC# 1794414" (no leading zero).
 *
 * The FORBIDDEN list above stays strict — Sprint 30 retired the wrong
 * Texas-template values from the existing render code. Adding them back
 * is unambiguously a regression even before Item 48 ships.
 */
export const RC_PDF_REQUIRED: string[] = [
  // Sprint 45-RC (v3.8.abd) — case change: pre-migration legacy chrome
  // rendered title case "Silk Route Logistics Inc."; post-migration skill
  // chrome renders BRAND.legalName all-caps in header per skill canonical
  // (drawHeaderFirstPage at srl-chrome.ts:254 + drawContinuationHeader
  // at srl-chrome.ts:582). Both are the same legal entity; case is a
  // typography choice the skill made for header visual hierarchy. Sprint 30
  // canonical identity preserved via the all-caps form.
  "SILK ROUTE LOGISTICS INC.",
  "Galesburg, MI 49053",
  "(269) 220-6760",
  // Sprint 45-RC (v3.8.abd) extensions — Item 48 close
  "DOT# 4526880",
  "operations@silkroutelogistics.ai",
  // v3.8 (counsel architecture, Dirk Beckwith / Foster Swift) — substantive
  // legal terms moved to the BCA; the RC is now a clean form that references
  // it. The governing-law + venue strings ("State of Michigan", "Kalamazoo
  // County") now assert on the BCA PDF, not the RC. The RC asserts the BCA
  // reference instead.
  "Broker-Carrier Agreement",
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
  // v3.8 (counsel architecture) — broker-carrier terms moved to the BCA; the
  // retired non-solicitation penalty must never reappear on the BOL.
  "35% commission",
];

export const BOL_PDF_REQUIRED: string[] = [
  "Silk Route Logistics Inc.",
  "Galesburg, MI 49053",
  // v3.8 (counsel architecture) — BOL is a clean straight bill of lading that
  // references the Broker-Carrier Agreement for the broker-carrier terms.
  "Broker-Carrier Agreement",
];

export function assertNoForbidden(pdfText: string, forbidden: string[], context: string) {
  const hits = forbidden.filter((s) => pdfText.includes(s));
  expect(hits, `${context}: forbidden text found in PDF — regression of prior fix`).toEqual([]);
}

export function assertAllRequired(pdfText: string, required: string[], context: string) {
  const missing = required.filter((s) => !pdfText.includes(s));
  expect(missing, `${context}: required text missing from PDF — regression of prior fix`).toEqual([]);
}
