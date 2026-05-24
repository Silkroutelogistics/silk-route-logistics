-- v3.8.ajd Sprint 1 — Carrier onboarding 6-state lifecycle.
-- Merges legacy DOCUMENTS_SUBMITTED + UNDER_REVIEW into REVIEWING (single
-- "AE actively reviewing" state) and adds INFO_REQUESTED for the v3.8.aje
-- workflow where AE asks the carrier for additional info and the ball is
-- in the carrier's court.
--
-- Postgres can't drop enum values atomically, so we use the canonical
-- enum-swap pattern: build new type, cast both consuming columns with
-- CASE remapping, drop old type, rename new type to original name.
--
-- Consuming columns:
--   * carrier_profiles.onboardingStatus  — primary surface, has legacy data
--   * customers.onboardingStatus         — shipper side; only ever uses
--     PENDING/APPROVED/REJECTED/SUSPENDED in practice, but the column is
--     typed against the same enum, so it must be cast in the same step.
--
-- Default values preserved (PENDING on both columns) — schema defaults
-- continue to map cleanly across the swap.
--
-- Manually authored per CLAUDE.md §2.2 (avoid `prisma migrate dev` against
-- prod-pointed DATABASE_URL). Render's `prisma migrate deploy` applies
-- this on next push.

-- Step 1: Create new enum type with the 6 canonical states.
CREATE TYPE "OnboardingStatus_new" AS ENUM (
  'PENDING',
  'REVIEWING',
  'INFO_REQUESTED',
  'APPROVED',
  'REJECTED',
  'SUSPENDED'
);

-- Step 2: Drop existing column defaults so we can ALTER the type.
ALTER TABLE "public"."carrier_profiles"
  ALTER COLUMN "onboardingStatus" DROP DEFAULT;
ALTER TABLE "public"."customers"
  ALTER COLUMN "onboardingStatus" DROP DEFAULT;

-- Step 3: Cast columns with CASE remapping for legacy values.
ALTER TABLE "public"."carrier_profiles"
  ALTER COLUMN "onboardingStatus" TYPE "OnboardingStatus_new"
  USING (
    CASE "onboardingStatus"::text
      WHEN 'DOCUMENTS_SUBMITTED' THEN 'REVIEWING'
      WHEN 'UNDER_REVIEW' THEN 'REVIEWING'
      ELSE "onboardingStatus"::text
    END::"OnboardingStatus_new"
  );

ALTER TABLE "public"."customers"
  ALTER COLUMN "onboardingStatus" TYPE "OnboardingStatus_new"
  USING (
    CASE "onboardingStatus"::text
      WHEN 'DOCUMENTS_SUBMITTED' THEN 'REVIEWING'
      WHEN 'UNDER_REVIEW' THEN 'REVIEWING'
      ELSE "onboardingStatus"::text
    END::"OnboardingStatus_new"
  );

-- Step 4: Drop old enum, rename new enum to canonical name.
DROP TYPE "public"."OnboardingStatus";
ALTER TYPE "public"."OnboardingStatus_new" RENAME TO "OnboardingStatus";

-- Step 5: Restore PENDING defaults on both columns.
ALTER TABLE "public"."carrier_profiles"
  ALTER COLUMN "onboardingStatus" SET DEFAULT 'PENDING'::"OnboardingStatus";
ALTER TABLE "public"."customers"
  ALTER COLUMN "onboardingStatus" SET DEFAULT 'PENDING'::"OnboardingStatus";
