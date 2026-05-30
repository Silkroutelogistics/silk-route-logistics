-- Compass "Tracking compliance" factor — Build C (2026-05-30).
-- Per-carrier ELD/telematics credential storage so the existing
-- motiveService / samsaraService / eldService adapters can pull live pings
-- when a carrier shares their API key. Additive + nullable; safe no-op on any
-- environment. eldProvider already existed (added earlier); these four are new.
ALTER TABLE "public"."carrier_profiles"
  ADD COLUMN "eldApiKeyEncrypted" TEXT,
  ADD COLUMN "eldExternalAccountId" TEXT,
  ADD COLUMN "eldEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "eldConnectedAt" TIMESTAMP(3);
