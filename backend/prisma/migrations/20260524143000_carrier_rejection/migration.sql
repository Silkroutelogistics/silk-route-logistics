-- v3.8.ajk — Carrier rejection workflow with per-reason reapply windows.
-- Adds 5 nullable columns to carrier_profiles + 1 new enum.
--
-- Existing REJECTED carriers (legacy) get NULL for all new fields —
-- the AE will see "no reason recorded" in the new RejectedSection
-- but the historical record stays intact. Going forward every
-- rejection captures reason + reapply date.
--
-- Manually authored per CLAUDE.md §2.2.

-- Step 1: New enum.
CREATE TYPE "public"."RejectionReason" AS ENUM (
  'MISSING_DOCUMENTS',
  'EXPIRED_INSURANCE',
  'AUTHORITY_NOT_ACTIVE',
  'SAFETY_RATING_UNSATISFACTORY',
  'COMPLIANCE_VIOLATION',
  'FRAUD_DETECTED',
  'IDENTITY_FRAUD',
  'DUPLICATE_APPLICATION',
  'OTHER'
);

-- Step 2: Add nullable columns.
ALTER TABLE "public"."carrier_profiles"
  ADD COLUMN "rejectionReason"   "public"."RejectionReason",
  ADD COLUMN "rejectedAt"        TIMESTAMP(3),
  ADD COLUMN "rejectedById"      TEXT,
  ADD COLUMN "rejectionNote"     TEXT,
  ADD COLUMN "reapplyEligibleAt" TIMESTAMP(3);
