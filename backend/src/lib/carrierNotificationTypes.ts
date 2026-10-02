/**
 * carrier-portal-upgrade M2 — the notification types a carrier's bell may show.
 *
 * An ALLOWLIST, by owner ruling: a type nobody has reviewed stays off a
 * carrier's bell until somebody adds it here. Every value below has a writer
 * whose recipient is the carrier's own User.id (A12 audit, 2026-10-01).
 *
 * Internal types (AE alerts, compliance and re-vet alerts, accounting, credit,
 * invoices, check-call reminders, inbound email) are absent by construction.
 *
 * Type is not the only barrier, and it is not the strongest. GENERAL,
 * LOAD_UPDATE and SYSTEM_ALERT are also written to staff, so what keeps an
 * internal row off a carrier's bell today is that every writer picks the right
 * recipient. This list is the second wall, enforced at the read.
 */
export const CARRIER_NOTIFICATION_TYPES = [
  "ONBOARDING",
  "GENERAL",
  "LOAD",
  "LOAD_UPDATE",
  "LOAD_STATUS",
  "LOAD_TENDERED",
  "TENDER",
  "TENDER_RECEIVED",
  "TENDER_ACCEPTED",
  "TONU",
  "POD_RECEIVED",
  "POD_REMINDER",
  "COMPLIANCE",
  "PAYMENT_APPROVED",
  "PAYMENT_RECEIVED",
  "SYSTEM_ALERT",
  "DISPUTE_FILED",
  "DISPUTE_RESOLVED",
] as const;

/** The extra `where` a notification read adds for a carrier; nothing for anyone else. */
export function carrierNotificationScope(role: string | undefined): { type?: { in: string[] } } {
  return role === "CARRIER" ? { type: { in: [...CARRIER_NOTIFICATION_TYPES] } } : {};
}
