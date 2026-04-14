-- Track & Trace Module foundation (Lane 1/8)
-- Adds: LoadException, LoadActivity, GeofenceEvent, DetentionRecord
-- Extends: Load (paperwork gates, region, shipper code), Document (upload_source, exception link, category)

-- ─── Load additions ─────────────────────────────────────────
ALTER TABLE "loads"
  ADD COLUMN IF NOT EXISTS "region_origin"       VARCHAR(32),
  ADD COLUMN IF NOT EXISTS "region_destination"  VARCHAR(32),
  ADD COLUMN IF NOT EXISTS "shipper_code"        VARCHAR(10),
  ADD COLUMN IF NOT EXISTS "pod_verified"        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "customer_invoiced"   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "carrier_settled"     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "closed_at"           TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "tracking_link_sent"  BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS "loads_shipper_code_key" ON "loads"("shipper_code");

-- ─── Document additions ────────────────────────────────────
ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "category"      TEXT,
  ADD COLUMN IF NOT EXISTS "upload_source" TEXT NOT NULL DEFAULT 'AE_CONSOLE',
  ADD COLUMN IF NOT EXISTS "exception_id"  TEXT;

CREATE INDEX IF NOT EXISTS "documents_loadId_docType_idx" ON "documents"("loadId", "docType");

-- ─── LoadException ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "load_exceptions" (
  "id"                          TEXT NOT NULL,
  "load_id"                     TEXT NOT NULL,
  "category"                    VARCHAR(100) NOT NULL,
  "unit_type"                   VARCHAR(20),
  "description"                 TEXT,
  "location_text"               TEXT,
  "location_lat"                DECIMAL(10,6),
  "location_lng"                DECIMAL(10,6),
  "reported_at"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reported_by_id"              TEXT,
  "reported_by_name"            TEXT,
  "reported_source"             VARCHAR(20) NOT NULL DEFAULT 'AE_CONSOLE',
  "status"                      VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  "resolved_at"                 TIMESTAMP(3),
  "resolved_by_id"              TEXT,
  "resolution_notes"            TEXT,
  "eta_impact_minutes"          INTEGER,
  "repair_shop_name"            TEXT,
  "repair_shop_phone"           TEXT,
  "repair_eta"                  TIMESTAMP(3),
  "repair_cost"                 DECIMAL(12,2),
  "repair_cost_responsibility"  VARCHAR(20),
  "receipt_status"              VARCHAR(20) NOT NULL DEFAULT 'NONE',
  "shipper_notified"            BOOLEAN NOT NULL DEFAULT FALSE,
  "shipper_notified_at"         TIMESTAMP(3),
  CONSTRAINT "load_exceptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "load_exceptions_load_id_idx"  ON "load_exceptions"("load_id");
CREATE INDEX IF NOT EXISTS "load_exceptions_status_idx"   ON "load_exceptions"("status");
CREATE INDEX IF NOT EXISTS "load_exceptions_category_idx" ON "load_exceptions"("category");

ALTER TABLE "load_exceptions"
  ADD CONSTRAINT "load_exceptions_load_id_fkey"
  FOREIGN KEY ("load_id") REFERENCES "loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "documents"
  ADD CONSTRAINT "documents_exception_id_fkey"
  FOREIGN KEY ("exception_id") REFERENCES "load_exceptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── LoadActivity ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "load_activity" (
  "id"           TEXT NOT NULL,
  "load_id"      TEXT NOT NULL,
  "event_type"   VARCHAR(64) NOT NULL,
  "description"  TEXT NOT NULL,
  "actor_type"   VARCHAR(20) NOT NULL DEFAULT 'SYSTEM',
  "actor_id"     TEXT,
  "actor_name"   TEXT,
  "metadata"     JSONB,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "load_activity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "load_activity_load_id_created_at_idx" ON "load_activity"("load_id", "created_at");
CREATE INDEX IF NOT EXISTS "load_activity_event_type_idx"         ON "load_activity"("event_type");

ALTER TABLE "load_activity"
  ADD CONSTRAINT "load_activity_load_id_fkey"
  FOREIGN KEY ("load_id") REFERENCES "loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── GeofenceEvent ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "geofence_events" (
  "id"            TEXT NOT NULL,
  "load_id"       TEXT NOT NULL,
  "event_type"    VARCHAR(40) NOT NULL,
  "facility_name" TEXT,
  "lat"           DECIMAL(10,6),
  "lng"           DECIMAL(10,6),
  "occurred_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "geofence_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "geofence_events_load_id_occurred_at_idx" ON "geofence_events"("load_id", "occurred_at");

ALTER TABLE "geofence_events"
  ADD CONSTRAINT "geofence_events_load_id_fkey"
  FOREIGN KEY ("load_id") REFERENCES "loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── DetentionRecord ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "detention_records" (
  "id"              TEXT NOT NULL,
  "load_id"         TEXT NOT NULL,
  "location_type"   VARCHAR(20) NOT NULL,
  "facility_name"   TEXT,
  "entered_at"      TIMESTAMP(3) NOT NULL,
  "departed_at"     TIMESTAMP(3),
  "elapsed_minutes" INTEGER,
  "billable"        BOOLEAN NOT NULL DEFAULT FALSE,
  "rate_per_hour"   DECIMAL(10,2),
  "total_charge"    DECIMAL(10,2) NOT NULL DEFAULT 0,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "detention_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "detention_records_load_id_idx" ON "detention_records"("load_id");

ALTER TABLE "detention_records"
  ADD CONSTRAINT "detention_records_load_id_fkey"
  FOREIGN KEY ("load_id") REFERENCES "loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
