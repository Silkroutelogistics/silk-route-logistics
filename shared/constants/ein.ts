// A carrier's Employer Identification Number, in the one shape each side needs.
//
// Stored as nine digits. Printed as XX-XXXXXXX, the way the IRS prints it and
// the way a carrier reads it off their own W-9. One definition for the
// onboarding field that captures it, the registration route that stores it and
// the agreement that prints it, so the three cannot disagree about what counts
// as an EIN.

/** Nine digits, or null. Punctuation and spaces are ignored. */
export function einDigits(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits.length === 9 ? digits : null;
}

/** XX-XXXXXXX, or null when the value is not a complete EIN. */
export function formatEin(raw: string | null | undefined): string | null {
  const d = einDigits(raw);
  return d ? `${d.slice(0, 2)}-${d.slice(2)}` : null;
}

/** Progressive formatting for an input field: digits only, dash after two. */
export function formatEinInput(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 9);
  return d.length <= 2 ? d : `${d.slice(0, 2)}-${d.slice(2)}`;
}
