/**
 * The four driver fields a carrier may set on a load, read from a request
 * body as PRESENT-ONLY keys.
 *
 * POST /carrier-loads/:id/accept used to write all four unconditionally as
 * `value || null`, and the portal's accept button posts no body, so accepting
 * a load erased whatever an AE had already entered on it. PATCH /:id/driver
 * had the present-only rule and accept did not. One helper now serves both,
 * so the two rules cannot drift again.
 *
 * An absent key leaves the column alone. An explicit empty string (or null)
 * clears it. Values are trimmed. Zod already guarantees strings on both
 * routes; the type check is belt and braces for any future caller.
 *
 * Phase 0 of the mandatory-ELD arc.
 */
export const DRIVER_FIELD_KEYS = ["driverName", "driverPhone", "truckNumber", "trailerNumber"] as const;
export type DriverFieldKey = (typeof DRIVER_FIELD_KEYS)[number];
export type DriverFields = Partial<Record<DriverFieldKey, string | null>>;

export function driverFieldsFromBody(body: unknown): DriverFields {
  const out: DriverFields = {};
  if (!body || typeof body !== "object") return out;
  const b = body as Record<string, unknown>;
  for (const key of DRIVER_FIELD_KEYS) {
    if (!(key in b) || b[key] === undefined) continue;
    const v = b[key];
    if (v === null) {
      out[key] = null;
      continue;
    }
    if (typeof v !== "string") continue;
    const trimmed = v.trim();
    out[key] = trimmed === "" ? null : trimmed;
  }
  return out;
}

export function hasDriverFields(fields: DriverFields): boolean {
  return Object.keys(fields).length > 0;
}
