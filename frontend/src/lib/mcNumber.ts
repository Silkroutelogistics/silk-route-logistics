/**
 * The digits of a carrier's stored MC number, whatever prefix it was saved with.
 *
 * WHY. `CarrierProfile.mcNumber` is free text and nothing normalizes it on the
 * way in. The FMCSA lookups hand the onboarding form `MC-116980`, and the form
 * saves what it was given, so most carriers store the prefix. A surface that
 * printed "MC-" in front of the raw value then showed "MC-MC-116980", which is
 * what a carrier saw on their own dashboard.
 *
 * A surface keeps its own label ("MC# ", "MC-", "MC: ") and passes the stored
 * value through here. The backend has the same rule in backend/src/lib/mcNumber.ts;
 * a test holds the two equal.
 *
 * Strips only when digits follow the prefix, so a value that merely begins
 * with the letters MC and is not a docket number is left as it was.
 */
export function mcDigits(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const value = String(raw).trim();
  // A prefix with nothing after it ("MC-", "MC#") is no number at all.
  if (/^MC[\s#:-]*$/i.test(value)) return null;
  const digits = value.replace(/^MC[\s#:-]*(?=\d)/i, "").trim();
  return digits || null;
}
