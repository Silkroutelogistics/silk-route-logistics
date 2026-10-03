// Form values arrive as strings, and "" means the field was left empty. These
// turn "" into null and refuse anything that would reach Prisma as NaN or an
// Invalid Date: the first throws a 500, the second is written silently
// (coi-verify-email-fix C3: insuranceExpiry "" threw, safetyScore "" wrote NaN).

export class FieldError extends Error {
  constructor(public field: string, reason: string) {
    super(`${field} ${reason}`);
  }
}

const blank = (v: unknown) => v === null || (typeof v === "string" && v.trim() === "");

export function numOrNull(field: string, v: unknown, opts: { int?: boolean } = {}): number | null | undefined {
  if (v === undefined) return undefined;
  if (blank(v)) return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) throw new FieldError(field, "must be a number");
  if (opts.int && !Number.isInteger(n)) throw new FieldError(field, "must be a whole number");
  return n;
}

export function dateOrNull(field: string, v: unknown): Date | null | undefined {
  if (v === undefined) return undefined;
  if (blank(v)) return null;
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) throw new FieldError(field, "must be a valid date");
  return d;
}

// Three-state: "" or null is null (not stated), never collapsed to false.
export function boolOrNull(field: string, v: unknown): boolean | null | undefined {
  if (v === undefined) return undefined;
  if (blank(v)) return null;
  if (v === true || v === "true") return true;
  if (v === false || v === "false") return false;
  throw new FieldError(field, "must be true, false or null");
}
