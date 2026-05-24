-- v3.8.ajo — AE geo-mismatch override + extended security timeline.
-- Three nullable columns capture the AE's decision to suppress a
-- false-positive country-jump alert (carrier traveling, ops VPN, etc).
ALTER TABLE "public"."carrier_profiles"
  ADD COLUMN "geoMismatchOverriddenAt"   TIMESTAMP(3),
  ADD COLUMN "geoMismatchOverriddenById" TEXT,
  ADD COLUMN "geoMismatchOverrideNote"   TEXT;
