/**
 * The digits of a carrier's stored MC number, whatever prefix it was saved with.
 *
 * WHY. `CarrierProfile.mcNumber` is free text and nothing normalizes it on the
 * way in. The FMCSA lookups hand the onboarding form `MC-116980`, and the form
 * saves what it was given, so 8 of the 9 live carriers on 2026-09-28 stored the
 * prefix. Every surface that printed "MC# " or "MC-" in front of the raw value
 * then printed it twice: "MC-MC-116980" on a carrier's own dashboard, "MC# MC-"
 * in the subject line of the email SRL sends a carrier's insurance agent.
 *
 * A surface keeps its own label ("MC# ", "MC-", "MC: ") and passes the stored
 * value through here, so there is one rule for what the number is.
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
