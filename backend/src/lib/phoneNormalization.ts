// v3.8.ala — US-only E.164 phone normalization for registration
// duplicate-checks + future indexed-column refactor at ~10K+ rows.
//
// Why DIY instead of libphonenumber-js: the registration flow is US-only
// today (no country picker in the onboarding form per onboarding/page.tsx
// audit); adding the ~140KB libphonenumber-js + its country-metadata
// payload to the backend bundle is over-engineering for the current
// scope. Swap target: when international registration opens, replace
// the body of normalizePhoneE164 with a libphonenumber-js call and
// every caller inherits the upgrade.
//
// Scope-mapping note: chameleonDetectionService.ts + crossReferenceService
// .ts each carry a local 10-digit strip helper for fingerprint hashing —
// those are intentionally separate from this E.164 normalization
// because fingerprint hashing wants a stable 10-digit representation,
// not the +1 prefix. Do NOT consolidate them without an audit pass.

const US_DIGIT_COUNT = 10;

/**
 * Normalize a US phone number to E.164 format (+1XXXXXXXXXX).
 *
 * Strips all non-digit characters, drops a leading "1" country code if
 * the input parses to 11 digits, and prepends "+1" to the 10-digit US
 * national number. Returns null on any input that does not normalize
 * to exactly 10 US digits — caller decides whether null is a duplicate-
 * check skip (registration "carrier didn't provide phone") or a
 * validation rejection.
 *
 * Examples:
 *   normalizePhoneE164("(269) 220-6760")   → "+12692206760"
 *   normalizePhoneE164("269-220-6760")     → "+12692206760"
 *   normalizePhoneE164("12692206760")      → "+12692206760"
 *   normalizePhoneE164("+1 269 220 6760")  → "+12692206760"
 *   normalizePhoneE164("2692206760")       → "+12692206760"
 *   normalizePhoneE164("")                 → null
 *   normalizePhoneE164(null)               → null
 *   normalizePhoneE164("12345")            → null  (too short)
 *   normalizePhoneE164("123456789012345")  → null  (too long)
 */
export function normalizePhoneE164(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== US_DIGIT_COUNT) return null;
  return `+1${digits}`;
}

/**
 * Returns true if two raw phone strings normalize to the same E.164
 * value. Null-safe — two nulls are NOT considered equal (a missing
 * phone field on a stored record should not collide with a missing
 * phone on an incoming registration; both are absences, not values).
 */
export function phoneNumbersMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const normA = normalizePhoneE164(a);
  const normB = normalizePhoneE164(b);
  if (!normA || !normB) return false;
  return normA === normB;
}
