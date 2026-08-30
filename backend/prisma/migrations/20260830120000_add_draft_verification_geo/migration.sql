-- Arc launch-fix — where the mailbox was proven from.
--
-- ADDITIVE. Three nullable columns, no drop, no default, no backfill. Drafts
-- verified before this shipped keep NULL, which is the honest answer: nobody
-- recorded it at the time, and inventing a value would put a fabricated origin
-- on a fraud-signal surface.
--
-- These are captured server-side at the verifying click or code entry and are
-- carried onto the User at registration, which is what makes the AE carrier
-- panel show the FIRST verification rather than a second one the carrier had to
-- be asked for.

ALTER TABLE "onboarding_drafts"
  ADD COLUMN "verifiedFromIp"      TEXT,
  ADD COLUMN "verifiedFromCountry" TEXT,
  ADD COLUMN "verifiedUserAgent"   TEXT;
