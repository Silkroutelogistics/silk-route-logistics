/**
 * Ligature-preservation shim for BOL v2.9 PDFKit rendering.
 *
 * PDFKit (via fontkit) applies OpenType `liga` substitution on DM Sans
 * by default. Observed failure during v3.7.o Batch B smoke: "classified"
 * rendered as "classifed" (the i of the fi ligature glyph dropped on
 * scale-down). The `features: []` monkey-patch path was abandoned after
 * it failed to suppress the substitution in practice.
 *
 * This shim sidesteps ligature lookup entirely by inserting a
 * zero-width non-joiner (U+200C) between f and the following i or l —
 * fontkit's GSUB lookups see a broken sequence and fall back to
 * rendering the glyphs individually. ZWNJ has zero advance width in
 * most renderers, so the visible kerning cost is negligible.
 *
 * Order matters: the triple-letter sequences (ffi, ffl) must be
 * handled before the pairwise (fi, fl) rules, otherwise the greedy
 * pairwise rule breaks the triple into ff + i with a ZWNJ between
 * f and i inside the ff.
 */

const ZWNJ = "‌";

export function preserveLigatures(input: string): string {
  return input
    .replace(/ffi/g, `ff${ZWNJ}i`)
    .replace(/ffl/g, `ff${ZWNJ}l`)
    .replace(/fi/g, `f${ZWNJ}i`)
    .replace(/fl/g, `f${ZWNJ}l`);
}
