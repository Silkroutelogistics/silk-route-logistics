-- Waterfall Dispatch module foundation (Lane 1/8)
-- Adds: Waterfall, WaterfallPosition, LoadBid, LoadNote
-- Extends: Load (dispatch_method, visibility, waterfall_mode, direct_tender_carrier_id,
--                dispatched_at, dispatched_carrier_id, fallback timestamps)
--          LoadTender.waterfall_position_id link

-- ─── Load additions ────────────────────────────────────────
ALTER TABLE "loads"
  ADD COLUMN IF NOT EXISTS "dispatch_method"                    VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "visibility"                         VARCHAR(20) NOT NULL DEFAULT 'waterfall',
  ADD COLUMN IF NOT EXISTS "waterfall_mode"                     VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "direct_tender_carrier_id"           TEXT,
  ADD COLUMN IF NOT EXISTS "dispatched_at"                      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "dispatched_carrier_id"              TEXT,
  ADD COLUMN IF NOT EXISTS "fallback_chain_started_at"          TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "fallback_posted_to_loadboard_at"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "fallback_posted_to_dat_at"          TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "loads_dispatch_method_waterfall_mode_status_idx"
  ON "loads" ("dispatch_method", "waterfall_mode", "status");
CREATE INDEX IF NOT EXISTS "loads_visibility_idx" ON "loads" ("visibility");

-- ─── LoadTender linkage ────────────────────────────────────
ALTER TABLE "load_tenders"
  ADD COLUMN IF NOT EXISTS "waterfall_position_id" TEXT;

CREATE INDEX IF NOT EXISTS "load_tenders_waterfall_position_id_idx"
  ON "load_tenders" ("waterfall_position_id");

-- ─── Waterfall campaign ────────────────────────────────────
CREATE TABLE IF NOT EXISTS "waterfalls" (
  "id"                   TEXT NOT NULL,
  "load_id"              TEXT NOT NULL,
  "mode"                 VARCHAR(20) NOT NULL DEFAULT 'full_auto',
  "status"               VARCHAR(20) NOT NULL DEFAULT 'building',
  "started_at"           TIMESTAMP(3),
  "completed_at"         TIMESTAMP(3),
  "completed_carrier_id" TEXT,
  "total_positions"      INTEGER NOT NULL DEFAULT 0,
  "current_position"     INTEGER NOT NULL DEFAULT 0,
  "created_by_id"        TEXT,
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "waterfalls_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "waterfalls_load_id_idx" ON "waterfalls"("load_id");
CREATE INDEX IF NOT EXISTS "waterfalls_status_idx"  ON "waterfalls"("status");

ALTER TABLE "waterfalls"
  ADD CONSTRAINT "waterfalls_load_id_fkey"
  FOREIGN KEY ("load_id") REFERENCES "loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Waterfall positions (cascade steps) ───────────────────
CREATE TABLE IF NOT EXISTS "waterfall_positions" (
  "id"                     TEXT NOT NULL,
  "waterfall_id"           TEXT NOT NULL,
  "carrier_id"             TEXT,
  "position"               INTEGER NOT NULL,
  "match_score"            DECIMAL(5,2),
  "offered_rate"           DECIMAL(10,2),
  "offered_rate_per_mile"  DECIMAL(8,2),
  "margin_amount"          DECIMAL(10,2),
  "margin_percent"         DECIMAL(5,2),
  "status"                 VARCHAR(20) NOT NULL DEFAULT 'queued',
  "tender_sent_at"         TIMESTAMP(3),
  "tender_expires_at"      TIMESTAMP(3),
  "responded_at"           TIMESTAMP(3),
  "decline_reason"         TEXT,
  "is_fallback"            BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "waterfall_positions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "waterfall_positions_waterfall_id_position_idx"
  ON "waterfall_positions"("waterfall_id", "position");
CREATE INDEX IF NOT EXISTS "waterfall_positions_status_tender_expires_at_idx"
  ON "waterfall_positions"("status", "tender_expires_at");
CREATE INDEX IF NOT EXISTS "waterfall_positions_carrier_id_idx"
  ON "waterfall_positions"("carrier_id");

ALTER TABLE "waterfall_positions"
  ADD CONSTRAINT "waterfall_positions_waterfall_id_fkey"
  FOREIGN KEY ("waterfall_id") REFERENCES "waterfalls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "load_tenders"
  ADD CONSTRAINT "load_tenders_waterfall_position_id_fkey"
  FOREIGN KEY ("waterfall_position_id") REFERENCES "waterfall_positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Load bids (for open loadboard visibility) ─────────────
CREATE TABLE IF NOT EXISTS "load_bids" (
  "id"                 TEXT NOT NULL,
  "load_id"            TEXT NOT NULL,
  "carrier_id"         TEXT NOT NULL,
  "bid_rate"           DECIMAL(10,2) NOT NULL,
  "bid_rate_per_mile"  DECIMAL(8,2),
  "notes"              TEXT,
  "status"             VARCHAR(20) NOT NULL DEFAULT 'pending',
  "submitted_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewed_at"        TIMESTAMP(3),
  "reviewed_by_id"     TEXT,
  CONSTRAINT "load_bids_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "load_bids_load_id_status_idx" ON "load_bids"("load_id", "status");
CREATE INDEX IF NOT EXISTS "load_bids_carrier_id_idx"     ON "load_bids"("carrier_id");

ALTER TABLE "load_bids"
  ADD CONSTRAINT "load_bids_load_id_fkey"
  FOREIGN KEY ("load_id") REFERENCES "loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Load notes (structured note types) ────────────────────
CREATE TABLE IF NOT EXISTS "load_notes" (
  "id"              TEXT NOT NULL,
  "load_id"         TEXT NOT NULL,
  "note_type"       VARCHAR(32) NOT NULL DEFAULT 'internal',
  "content"         TEXT NOT NULL,
  "source"          VARCHAR(20) NOT NULL DEFAULT 'manual',
  "created_by_id"   TEXT,
  "created_by_name" TEXT,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "load_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "load_notes_load_id_created_at_idx" ON "load_notes"("load_id", "created_at");

ALTER TABLE "load_notes"
  ADD CONSTRAINT "load_notes_load_id_fkey"
  FOREIGN KEY ("load_id") REFERENCES "loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
