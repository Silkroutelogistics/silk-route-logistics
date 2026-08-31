/**
 * AI model configuration — one constant, four call sites.
 *
 * v3.8.awf — P0. `gemini-2.0-flash` was retired by Google and the string was
 * hardcoded in four places, so all four broke at once and silently:
 *
 *   coiReaderService        the COI parser (never triggered, so latent)
 *   chatController ×2       Marco Polo — PUBLIC, on the homepage
 *   shipperPortalController the shipper portal assistant
 *
 * Marco Polo did not error. It caught the failure and returned "I'm having
 * trouble connecting right now", which is a sentence a visitor reads as a
 * transient blip rather than an outage, so nothing surfaced it. The window is
 * unknown — see docs/regression-log.md.
 *
 * WHY A CONSTANT AND NOT FOUR EDITS. The failure was not that the model changed;
 * it was that four files had to be found to notice. One name, one place, and the
 * next retirement is one line — or zero, because GEMINI_MODEL overrides it
 * without a deploy, which is the point of the env var: a model retirement should
 * be a config change made in minutes, not a code change made after somebody
 * notices the chatbot has been dead for a while.
 *
 * The default is the successor Google named in the 404 body, verified live
 * (HTTP 200, correct completion) before shipping rather than trusted from the
 * error text. gemini-3.7-flash and the gemini-flash-latest alias also exist; the
 * pinned version is deliberate — an alias never retires but can change behaviour
 * underneath a prompt that was tuned against something else, and Marco Polo's
 * prompt is tuned (§20.8.5).
 */

/** Model for all generative calls. Override with GEMINI_MODEL; no deploy needed. */
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

/** REST endpoint for callers that build the URL themselves rather than use the SDK. */
export function geminiGenerateContentUrl(apiKey: string, model: string = GEMINI_MODEL): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
}
