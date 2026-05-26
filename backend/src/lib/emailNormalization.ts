// v3.8.ald — Email normalization helper, mirroring phoneNormalization.ts.
// Single source of truth for the case-insensitivity contract across
// registration writes + every email-keyed lookup site. See CLAUDE.md
// §11 v3.8.ald row for full inventory of the 8 sites this serves.
//
// Storage strategy: registration write canonicalizes to lowercase via
// normalizeEmail() so new rows land consistent. Read-path lookups use
// caseInsensitiveEmailFilter() — Prisma mode: "insensitive" on Postgres
// (ILIKE under the hood) — so BOTH lowercased new rows AND any pre-alb
// mixed-case legacy rows resolve. Pre-revenue volumes mean ILIKE
// bypassing the unique B-tree index is acceptable; citext / lower
// (email) unique-index migration is the proper performance fix at
// scale (banked from v3.8.alb).

/**
 * Lowercase + trim an email string. Returns null on invalid input
 * (non-string, empty after trim). Callers decide whether null means
 * "validation reject" (registration) or "treat as no match" (lookup
 * with absent email).
 *
 * Examples:
 *   normalizeEmail("Test@Example.com")  → "test@example.com"
 *   normalizeEmail("  user@x.com  ")    → "user@x.com"
 *   normalizeEmail("")                  → null
 *   normalizeEmail(null)                → null
 */
export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Build a Prisma `where.email` clause that matches case-insensitively.
 * Use with findFirst/findMany on Postgres — Prisma compiles this to
 * ILIKE which catches both lowercased + mixed-case stored rows.
 *
 * Usage:
 *   prisma.user.findFirst({ where: caseInsensitiveEmailFilter(email) })
 *   prisma.user.findFirst({ where: { ...caseInsensitiveEmailFilter(email), role: "CARRIER" } })
 *
 * Returns null-safe shape — if normalizeEmail() returns null, the
 * filter would match every row (Prisma treats undefined as absent
 * constraint), so callers MUST null-check the input before passing
 * to a Prisma query that's meant to find a specific user.
 */
export function caseInsensitiveEmailFilter(email: string): { email: { equals: string; mode: "insensitive" } } {
  return { email: { equals: email, mode: "insensitive" } };
}
