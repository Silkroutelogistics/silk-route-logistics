-- Track 1 (2026-06-24): post-approval carrier activation.
--
-- The binding Broker-Carrier Agreement signature is recorded as a
-- CarrierAgreement{status:SIGNED} row via the existing carrier_agreements
-- table (no schema change there). These columns track the OPTIONAL,
-- reversible account-level Quick Pay opt-in (consent to the Caravan Quick
-- Pay Agreement) and the timestamp when the carrier finished activation.
--
-- Additive + prod-safe: quickPayEnabled defaults false (the opt-out state),
-- everything else is nullable. Per-load Quick Pay (Load.quickPayFeePercent,
-- LoadQuickPayOverride) is untouched. Quick Pay is never a hauling gate.
ALTER TABLE "public"."carrier_profiles" ADD COLUMN "quickPayEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "public"."carrier_profiles" ADD COLUMN "quickPayAgreedAt" TIMESTAMP(3);
ALTER TABLE "public"."carrier_profiles" ADD COLUMN "quickPayAgreedFromIp" TEXT;
ALTER TABLE "public"."carrier_profiles" ADD COLUMN "quickPayAgreedFromUserAgent" TEXT;
ALTER TABLE "public"."carrier_profiles" ADD COLUMN "quickPayVersion" TEXT;
ALTER TABLE "public"."carrier_profiles" ADD COLUMN "activatedAt" TIMESTAMP(3);
