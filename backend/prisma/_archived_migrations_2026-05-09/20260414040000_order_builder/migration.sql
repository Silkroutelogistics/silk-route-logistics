-- Order Builder v3.5 — Load field extensions + Order (quote/draft) model

-- ─── Load additions ───────────────────────────────────────
ALTER TABLE "loads"
  ADD COLUMN IF NOT EXISTS "mode"                    VARCHAR(10),
  ADD COLUMN IF NOT EXISTS "driver_mode"             VARCHAR(10),
  ADD COLUMN IF NOT EXISTS "live_or_drop"            VARCHAR(10),
  ADD COLUMN IF NOT EXISTS "cargo_value"             DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "temp_mode"               VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "fuel_surcharge_amount"   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "target_carrier_cost"     DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "customer_rate_per_mile"  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "lumper_estimate"         DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "origin_facility_id"      TEXT,
  ADD COLUMN IF NOT EXISTS "dest_facility_id"        TEXT,
  ADD COLUMN IF NOT EXISTS "origin_lat"              DECIMAL(10,6),
  ADD COLUMN IF NOT EXISTS "origin_lng"              DECIMAL(10,6),
  ADD COLUMN IF NOT EXISTS "dest_lat"                DECIMAL(10,6),
  ADD COLUMN IF NOT EXISTS "dest_lng"                DECIMAL(10,6),
  ADD COLUMN IF NOT EXISTS "check_call_protocol"     VARCHAR(20) NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS "shipment_priority"       VARCHAR(20) NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS "is_hot_load"             BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "tracking_link_auto_send" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "order_id"                TEXT;

CREATE INDEX IF NOT EXISTS "loads_is_hot_load_idx" ON "loads" ("is_hot_load");

-- ─── Order (quote/draft) model ────────────────────────────
CREATE TABLE IF NOT EXISTS "orders" (
  "id"                 TEXT NOT NULL,
  "order_number"       TEXT NOT NULL,
  "customer_id"        TEXT,
  "status"             VARCHAR(30) NOT NULL DEFAULT 'draft',
  "form_data"          JSONB NOT NULL DEFAULT '{}',
  "customer_rate"      DOUBLE PRECISION,
  "target_cost"        DOUBLE PRECISION,
  "equipment_type"     VARCHAR(50),
  "origin_city"        VARCHAR(100),
  "origin_state"       VARCHAR(50),
  "dest_city"          VARCHAR(100),
  "dest_state"         VARCHAR(50),
  "pickup_date"        TIMESTAMP(3),
  "delivery_date"      TIMESTAMP(3),
  "dispatch_method"    VARCHAR(20),
  "load_id"            TEXT,
  "quote_sent_at"      TIMESTAMP(3),
  "quote_approved_at"  TIMESTAMP(3),
  "created_by_id"      TEXT,
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "orders_order_number_key" ON "orders"("order_number");
CREATE INDEX IF NOT EXISTS "orders_customer_id_idx"           ON "orders"("customer_id");
CREATE INDEX IF NOT EXISTS "orders_status_idx"                ON "orders"("status");
CREATE INDEX IF NOT EXISTS "orders_created_by_id_status_idx"  ON "orders"("created_by_id", "status");

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "loads"
  ADD CONSTRAINT "loads_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
