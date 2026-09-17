// B3b (2026-09-17) — the structured half of an audit row, as the AE console
// reads it. Kept out of page.tsx because the App Router forbids extra exports
// from a page module, and because the Security Signals card (B6b) reads the
// same shape. Keys are optional: rows written before audit_logs.details
// existed carry null, and B4 (geo) and B5 (flags) add keys over time.

export interface LoginDetailsView {
  authMethod?: string;
  otpChannel?: string;
  mfaUsed?: boolean;
  device?: string;
  geo?: { city?: string | null; region?: string | null; country?: string | null } | null;
  flags?: string[];
}

/** One line an AE can read at a glance; null when the row predates the column. */
export function summarizeDetails(d: LoginDetailsView | null | undefined): string | null {
  if (!d) return null;
  const parts: string[] = [];
  if (d.device) parts.push(d.device);
  if (d.otpChannel) parts.push(d.otpChannel === "EMAIL+SMS" ? "code by email + SMS" : "code by email");
  if (d.mfaUsed === true) parts.push("2FA");
  else if (d.mfaUsed === false) parts.push("no 2FA");
  return parts.length ? parts.join(" · ") : null;
}
