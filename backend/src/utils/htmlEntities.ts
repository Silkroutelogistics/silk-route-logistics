/**
 * Decode HTML entities at the PDFKit input boundary.
 *
 * Upstream forms escape user input for XSS defense (e.g., `Dry Van 53'`
 * is stored as `Dry Van 53&#x27;`). PDFKit renders strings literally, so
 * without this decode the raw entities print into the PDF. Decoding is
 * scoped to the rendering boundary — DB values are left escaped so web
 * contexts stay safe.
 *
 * Handles: named entities (&amp; &lt; &gt; &quot; &apos; &nbsp;),
 * decimal numeric (&#39;), hex numeric (&#x27;).
 */

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeHtmlEntities(input: string | null | undefined): string {
  if (input == null) return "";
  return input.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const n = parseInt(body.slice(2), 16);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    if (body.startsWith("#")) {
      const n = parseInt(body.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return Object.prototype.hasOwnProperty.call(NAMED, body) ? NAMED[body] : match;
  });
}
