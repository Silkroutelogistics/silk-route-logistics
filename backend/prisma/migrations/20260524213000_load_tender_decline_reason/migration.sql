-- v3.8.ajz Item 90 — Persist carrier decline reason on LoadTender.
-- Carrier portal already POSTs a categorized reason on /tenders/:id/decline
-- (since v3.8.aap, decline modal at carrier/dashboard/tenders/page.tsx
-- lines 16-24 + 117). Backend pre-ajz silently dropped the field at the
-- validator boundary because no schema column existed. Now persisted +
-- surfaced in the AE-facing decline email + the v3.8.ajw H3 audit log.
-- Nullable so existing rows (pre-ajz declines) stay untouched.
ALTER TABLE "public"."load_tenders"
  ADD COLUMN "declineReason" TEXT;
