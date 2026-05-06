/**
 * Decode HTML entities at frontend rendering boundaries.
 *
 * Mirrors backend util at `backend/src/utils/htmlEntities.ts`.
 * Pre-v3.8.d.2 `sanitizeInput` middleware HTML-escaped string values
 * stored in DB (legacy data carries `&amp;`, `&#x27;`, `&#39;` etc.
 * even after the middleware was rewritten). React JSX renders strings
 * as text nodes without entity decoding, so legacy escaped values
 * print literally.
 *
 * Per CLAUDE.md §11 architectural finding: defense-in-depth at output
 * boundary — apply this decoder where legacy data may surface (e.g.,
 * `customerName()` in invoices page). Backend DB cleanup is a separate
 * sprint scope with explicit migration authorization.
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
  nbsp: " ",
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
