-- v3.8.a — Multi-line shipment foundation. Adds LoadLineItem model
-- with PackageType enum for BOLs with multiple commodity breakdowns
-- (mixed freight, LTL consolidation, per-item hazmat).
--
-- Purely additive: new enum, new table, new FK to loads(id) with
-- ON DELETE CASCADE. No modifications to existing Load rows, no
-- backfill. Hand-authored per CLAUDE.md §2 (migrate dev not
-- usable — migration history has shadow-DB drift).
-- Commit 1 of 4 in the v3.8 epic (v3.8.a / .b / .c / .d).

-- 1. PackageType enum — industry-standard unit-of-handling values
CREATE TYPE "PackageType" AS ENUM (
  'PLT',
  'SKID',
  'CTN',
  'BOX',
  'DRUM',
  'BALE',
  'BUNDLE',
  'CRATE',
  'ROLL',
  'OTHER'
);

-- 2. load_line_items table
CREATE TABLE IF NOT EXISTS "load_line_items" (
  "id"                        TEXT              NOT NULL,
  "load_id"                   TEXT              NOT NULL,
  "line_number"               INTEGER           NOT NULL,
  "pieces"                    INTEGER           NOT NULL,
  "package_type"              "PackageType"     NOT NULL,
  "description"               TEXT              NOT NULL,
  "weight"                    DOUBLE PRECISION  NOT NULL,
  "dimensions_length"         DOUBLE PRECISION,
  "dimensions_width"          DOUBLE PRECISION,
  "dimensions_height"         DOUBLE PRECISION,
  "freight_class"             TEXT,
  "nmfc_code"                 TEXT,
  "hazmat"                    BOOLEAN           NOT NULL DEFAULT FALSE,
  "hazmat_un_number"          TEXT,
  "hazmat_class"              TEXT,
  "hazmat_emergency_contact"  TEXT,
  "hazmat_placard_required"   BOOLEAN,
  "stackable"                 BOOLEAN           NOT NULL DEFAULT TRUE,
  "turnable"                  BOOLEAN           NOT NULL DEFAULT TRUE,
  "created_at"                TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"                TIMESTAMP(3)      NOT NULL,
  CONSTRAINT "load_line_items_pkey" PRIMARY KEY ("id")
);

-- 3. Indexes (one plain on loadId, one unique composite on [loadId, lineNumber])
CREATE INDEX IF NOT EXISTS "load_line_items_load_id_idx"
  ON "load_line_items"("load_id");
CREATE UNIQUE INDEX IF NOT EXISTS "load_line_items_load_id_line_number_key"
  ON "load_line_items"("load_id", "line_number");

-- 4. FK constraint to loads(id) with ON DELETE CASCADE
ALTER TABLE "load_line_items"
  ADD CONSTRAINT "load_line_items_load_id_fkey"
  FOREIGN KEY ("load_id") REFERENCES "loads"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
