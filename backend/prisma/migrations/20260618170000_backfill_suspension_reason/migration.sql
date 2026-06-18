-- v3.8.ank (audit D2 / §13.3 Item 187) — unify the carrier auto-suspension reason
-- convention onto the canonical pair: autoSuspendReason / autoSuspendedAt.
--
-- Context: loadComplianceService (the load-assignment gate) and waterfallScoring
-- (carrier eligibility) READ autoSuspendedAt, but five auto-suspend writers
-- (insurance-expiry, monthly re-vetting, FMCSA authority change, FMCSA safety
-- rating, OFAC match) historically wrote the LEGACY pair suspensionReason /
-- suspendedAt instead. The carrier was still blocked (every writer also sets
-- onboardingStatus = 'SUSPENDED', which is the load-bearing gate at
-- loadComplianceService:166), but the specific auto-suspend REASON message + the
-- waterfall autoSuspendedAt signal did not fire for those carriers. The five
-- writers now write the canonical pair (code change shipped with this migration).
--
-- This backfill copies any historical legacy-pair suspension onto the canonical
-- pair where the canonical is still null, so existing suspended carriers surface
-- the specific reason consistently. The legacy columns are RETAINED (no reader
-- remains); a later migration may drop them after a verification window.
-- Data-only, idempotent (COALESCE + WHERE autoSuspendedAt IS NULL).
UPDATE "public"."carrier_profiles"
SET "autoSuspendReason" = COALESCE("autoSuspendReason", "suspensionReason"),
    "autoSuspendedAt"   = COALESCE("autoSuspendedAt", "suspendedAt")
WHERE "autoSuspendedAt" IS NULL AND "suspendedAt" IS NOT NULL;
