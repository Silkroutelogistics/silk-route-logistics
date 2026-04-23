-- v3.7.o Phase 5E.b.1 — BOL v2.9 data model foundation.
--
-- Adds released-value form state (Carmack § 14706), piecesTendered/Received
-- event-capture fields, and a proNumber reference column to Load. All new
-- columns are nullable or defaulted; no backfill of existing rows.
-- Commit 1 of 4 in the sequenced v2.9 rollout (v3.7.o / .p / .q / .r).

-- 1. New enum for Carmack released-value basis
CREATE TYPE "ReleasedValueBasis" AS ENUM (
  'PER_POUND',
  'PER_PIECE',
  'TOTAL',
  'NVD'
);

-- 2. New columns on loads
ALTER TABLE "loads"
  ADD COLUMN IF NOT EXISTS "proNumber"             TEXT,
  ADD COLUMN IF NOT EXISTS "releasedValueDeclared" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "releasedValueBasis"    "ReleasedValueBasis",
  ADD COLUMN IF NOT EXISTS "piecesTendered"        INTEGER,
  ADD COLUMN IF NOT EXISTS "piecesReceived"        INTEGER;
