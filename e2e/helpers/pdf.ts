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
  // ── v3.8.arn — superseded money terms ────────────────────────────────────
  // Pre-arn the repo held five detention rates ($0/hr, $50, $65, $75, and
  // tier-varying), three TONU figures ($200/$250/$350) and two layover figures
  // ($250/$350). One canonical set now prints; every superseded figure is
  // locked out here so the divergence cannot be reintroduced silently.
  //
  // Token choice is deliberate. Matching is substring-based (`includes()` in
  // assertNoForbidden below), so a bare "$75" would also match a legitimate
  // "$750.00" line-haul figure in the rate breakdown and fail a clean PDF.
  // "/hr" renders ONLY in the DETENTION cell and "/day" ONLY in the LAYOVER
  // cell (srl-chrome.ts drawRateConTerms), so the suffixed forms are
  // unambiguous. Verified: no other RC surface renders either suffix.
  "$0/hr",
  "$65/hr",
  "$75/hr",
  // TONU renders as `$<amount> (truck-order-not-used)` with NO decimals, so a
  // bare "$250.00" could never match a TONU regression while it COULD match a
  // legitimate $250.00 accessorial. Anchored on the label instead.
  "$250 (truck-order-not-used)",
  "$350 (truck-order-not-used)",
  "$350/day",
  // Paperwork is due within 24 hours of delivery, never 48. Verified: nothing
  // else in the RC render path emits "48 hours".
  "48 hours",
  // ── Document numbering — retired PREFIX scheme ───────────────────────────
  // The RC's document id is a SUFFIX on the load stem (SRL-121485R, and
  // SRL-121485R2 on a re-issue), so every document for one load sorts together.
  // It was `RC-SRL-${referenceNumber}`, and because referenceNumber already
  // carries the "SRL-" stem that rendered RC-SRL-SRL-121488 in production, on
  // the page-1 header and on every continuation header and footer.
  //
  // Locking the doubled fragment rather than a bare "RC-SRL-" is deliberate: it
  // is unambiguous, and it catches the exact defect that shipped. Verified: no
  // other RC surface emits this sequence.
  //
  // There is no matching REQUIRED entry because the correct value is per-load
  // (SRL-<seq>R) and cannot be written as a literal here. The renderer's own
  // gate is scripts/verify-rc-matrix.ts, which renders the fixtures and whose
  // capture at docs/rc-references/_CURRENT_SRL_RC_RENDERED.txt shows the
  // expected form.
  "RC-SRL-SRL-",
  // ── v3.8.asb — the retired Quick Pay PRICE LIST ──────────────────────────
  // The Quick Pay panel used to render a hardcoded 4-cell grid of all three
  // tiers whenever a tier was set — TIER / STANDARD / 7-DAY QP / SAME-DAY QP —
  // and never said which of those prices was taken on this load. A carrier
  // charged 3% could read the whole ladder and still not find their own fee.
  // The panel now states the applied speed and fee, so these two headers can
  // only come back by reinstating the price list in place of the applied
  // number.
  //
  // Both tokens are anchored on the "QP" suffix, which renders nowhere else on
  // the document: the applied panel's headers are "QUICK PAY FEE",
  // "FEE ON THIS RATE" and "NET ON THIS RATE", and the not-elected panel's
  // context line spells the tiers out in prose ("Silver 3% · Gold 2% ·
  // Platinum 1% at 7 days") rather than as grid headers.
  "7-DAY QP",
  "SAME-DAY QP",
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
  // ── v3.8.arn — canonical money terms ─────────────────────────────────────
  // Uniform for every carrier and every equipment type: no tier split, no
  // reefer/dry-van split. Mirrors CLAUDE.md §5.
  //
  // The detention entry is asserted as one long string on purpose. The
  // DETENTION cell is drawn with `lineBreak: false` (srl-chrome.ts
  // drawRateConTerms), so PDFKit emits it as a single unwrapped run and
  // pdf-parse cannot split it — the §19 Sub-pattern 9 false-negative class
  // ("freight \ncharges") only affects wrapped body copy. Keeping it whole
  // locks rate, free hours, and cap in one adjacency: a regression that
  // dropped the cap while keeping the rate would still fail. If the renderer
  // ever gains wrapping here, split this into "$50/hr after 2 hrs free" and
  // "$250/stop cap" rather than deleting it.
  //
  // The cap reads "$250/stop cap" and NOT "capped at $250/stop" for a measured
  // reason: the grid cell draws with lineBreak:false, and "capped at $250/stop
  // · notify" measures 216.6pt against 202pt of available width, so it would
  // overprint the adjacent TONU label. The only way to keep "capped at" is to
  // drop the deliberate Sprint 50 " · notify" suffix, which is a real control.
  // If you are tempted to make this string read better, measure it first.
  // (Trailing " · notify" is appended after the cap, so it does not affect
  // this match.)
  "$50/hr after 2 hrs free, $250/stop cap",
  "$200 (truck-order-not-used)",
  "$250/day",
  // Paperwork deadline, from the GOVERNING TERMS clause block: "Signed BOL,
  // POD, and supporting paperwork are due within 24 hours of delivery."
  // NOTE: that block IS wrapped (`width: CONTENT_W`), so if a future edit to
  // an earlier clause shifts the wrap point to land between "24" and "hours",
  // pdf-parse will insert a newline and this assertion will fail on an
  // otherwise-correct PDF. If that fires, the fix is a shorter token or
  // whitespace normalization in the matcher — NOT deleting the lock.
  "24 hours",
  // ── v3.8.asb — the Quick Pay position is stated on every rate confirmation ─
  //
  // "QUICK PAY" is the meta-strip cell label, the panel label, and the
  // OPERATIONAL TERMS grid label. It renders in BOTH states — elected and not
  // elected — which is the point: a load with no election says so rather than
  // leaving the carrier to infer it. Losing this string means the surface
  // stopped rendering, which is how the fee went unstated in the first place.
  //
  // The state-specific assertions deliberately live in
  // backend/scripts/verify-rc-matrix.ts instead of here. That gate renders
  // both states from fixed formData, so it can assert the exact applied
  // strings ("3% · 7-day", "$123.00", "Not elected on this load"). This e2e
  // path takes whatever election the live flow produced, so pinning either
  // state's copy here would fail on a correct PDF of the other state.
  "QUICK PAY",
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
  // Document numbering — retired PREFIX scheme. The BOL's number is a suffix on
  // the load stem (SRL-121485B); it was `BOL-SRL-121485`, which sorted every BOL
  // away from its own load in any text-sorted column. Verified: the BOL renders
  // this token nowhere else.
  "BOL-SRL-",
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
