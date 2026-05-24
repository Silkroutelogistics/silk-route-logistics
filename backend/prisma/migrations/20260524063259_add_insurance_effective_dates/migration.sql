-- v3.8.aiw — Add *Effective DateTime? columns paired with existing *Expiry
-- on the carrier_profiles table for industry-standard COI verification.
-- Without effective date the platform can only verify "policy not expired"
-- but cannot verify "policy currently in force" (pre-issued policy with
-- future effective date would be wrongly accepted as active).
--
-- All columns are nullable to preserve backward compatibility with
-- existing carrier rows. Frontend Step 3 captures these on registration;
-- backend gracefully accepts them via Zod .strip() on the validator.
--
-- Manually authored per CLAUDE.md §2.2 (avoid `prisma migrate dev`
-- against prod-pointed DATABASE_URL). Render's `prisma migrate deploy`
-- applies on next push as part of the canonical build chain.

ALTER TABLE "public"."carrier_profiles"
  ADD COLUMN "autoLiabilityEffective"    TIMESTAMP(3),
  ADD COLUMN "cargoInsuranceEffective"   TIMESTAMP(3),
  ADD COLUMN "generalLiabilityEffective" TIMESTAMP(3),
  ADD COLUMN "workersCompEffective"      TIMESTAMP(3);
