-- v3.8.ajh — InfoRequest workflow.
-- AE creates an InfoRequest against a carrier when REVIEWING surfaces
-- a gap (missing/expired COI, unclear safety record, voided check for
-- Quick Pay setup, etc.). Carrier resolves from their portal by typing
-- a text response. File-upload attachments are deferred to v3.8.aji.
--
-- Two new enums + one table. Foreign keys to users (createdById +
-- cancelledById) and carrier_profiles (carrierId). Cascading delete
-- from carrier_profiles ensures orphan InfoRequest rows don't linger
-- when a carrier is hard-deleted; createdBy + cancelledBy use NO
-- ACTION (default) since AEs shouldn't be cascade-deleted with their
-- audit trail.
--
-- Manually authored per CLAUDE.md §2.2.

-- Step 1: Create new enums.
CREATE TYPE "public"."InfoRequestCategory" AS ENUM (
  'COI_UPDATE',
  'W9_UPDATE',
  'AUTHORITY_LETTER',
  'SAFETY_CLARIFICATION',
  'EIN_VERIFICATION',
  'VOIDED_CHECK',
  'ADDRESS_PROOF',
  'REFERENCES',
  'OTHER'
);

CREATE TYPE "public"."InfoRequestStatus" AS ENUM (
  'OPEN',
  'RESOLVED',
  'CANCELLED'
);

-- Step 2: Create info_requests table.
CREATE TABLE "public"."info_requests" (
  "id"            TEXT NOT NULL,
  "carrierId"     TEXT NOT NULL,
  "createdById"   TEXT NOT NULL,
  "cancelledById" TEXT,
  "category"      "public"."InfoRequestCategory" NOT NULL DEFAULT 'OTHER',
  "message"       TEXT NOT NULL,
  "status"        "public"."InfoRequestStatus"   NOT NULL DEFAULT 'OPEN',
  "resolvedNote"  TEXT,
  "resolvedAt"    TIMESTAMP(3),
  "cancelledAt"   TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "info_requests_pkey" PRIMARY KEY ("id")
);

-- Step 3: Foreign keys.
ALTER TABLE "public"."info_requests"
  ADD CONSTRAINT "info_requests_carrierId_fkey"
  FOREIGN KEY ("carrierId") REFERENCES "public"."carrier_profiles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."info_requests"
  ADD CONSTRAINT "info_requests_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "public"."users"("id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "public"."info_requests"
  ADD CONSTRAINT "info_requests_cancelledById_fkey"
  FOREIGN KEY ("cancelledById") REFERENCES "public"."users"("id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

-- Step 4: Indices.
CREATE INDEX "info_requests_carrierId_status_idx"
  ON "public"."info_requests"("carrierId", "status");

CREATE INDEX "info_requests_createdAt_idx"
  ON "public"."info_requests"("createdAt");
