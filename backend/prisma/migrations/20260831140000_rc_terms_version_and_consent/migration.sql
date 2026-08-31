-- v3.8.awm — RC terms version, and an explicit electronic-records consent stamp.
--
-- ADDITIVE ONLY. Both columns are nullable with no default and no backfill:
-- neither value existed before, and inventing one would assert a consent or a
-- terms version that was never given or recorded.
--
-- WHAT IS DELIBERATELY NOT HERE. The slice brief also called for dropping
-- CarrierProfile.bcaAgreedAt and quickPayAgreedAt as dead mirrors. A read-only
-- re-confirmation against production refused both:
--
--   * bcaAgreedAt is set on THREE carriers, and all three have NO signed
--     broker-carrier CarrierAgreement row. Registration (carrierController)
--     writes this column WITHOUT creating an agreement row; only the portal
--     sign-bca path creates one. So for those carriers this column is the ONLY
--     record that they accepted the click-through. Dropping it destroys
--     click-wrap consent evidence for real carriers.
--
--   * quickPayAgreedAt is READ at carrierAuth.ts:965 and returned to the client
--     as `quickPay.agreedAt`, with the agreement row only as a fallback. The
--     audit finding that both had "zero readers" was wrong about this one.
--
-- Both are recorded in the regression log with that evidence. Dropping either is
-- a decision the falsified premise no longer supports.

ALTER TABLE "public"."rate_confirmations" ADD COLUMN "rcTermsVersion" TEXT;

ALTER TABLE "public"."carrier_agreements" ADD COLUMN "consentAt" TIMESTAMP(3);
