-- CRM Upgrade + SEC Credit Check foundation (Lane 1/8)

-- ─── Customer additions ───────────────────────────────────
ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "credit_check_source" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "credit_check_result" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "credit_check_notes"  TEXT,
  ADD COLUMN IF NOT EXISTS "sec_cik_number"      VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "account_rep_id"      TEXT;

ALTER TABLE "customers"
  ADD CONSTRAINT "customers_account_rep_id_fkey"
  FOREIGN KEY ("account_rep_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── CustomerContact additions ────────────────────────────
ALTER TABLE "customer_contacts"
  ADD COLUMN IF NOT EXISTS "receives_tracking_link" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "is_billing"             BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "role"                   VARCHAR(50);

CREATE INDEX IF NOT EXISTS "customer_contacts_receives_tracking_link_idx"
  ON "customer_contacts"("receives_tracking_link");

-- ─── CustomerFacility ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS "customer_facilities" (
  "id"                           TEXT NOT NULL,
  "customer_id"                  TEXT NOT NULL,
  "name"                         TEXT NOT NULL,
  "address"                      TEXT,
  "city"                         TEXT,
  "state"                        VARCHAR(50),
  "zip"                          VARCHAR(20),
  "lat"                          DECIMAL(10,6),
  "lng"                          DECIMAL(10,6),
  "facility_type"                VARCHAR(20) NOT NULL DEFAULT 'both',
  "is_primary"                   BOOLEAN     NOT NULL DEFAULT FALSE,
  "contact_name"                 TEXT,
  "contact_phone"                TEXT,
  "contact_email"                TEXT,
  "operating_hours"              JSONB,
  "dock_info"                    TEXT,
  "load_type"                    VARCHAR(20) NOT NULL DEFAULT 'live',
  "estimated_load_time_minutes"  INTEGER,
  "appointment_required"         BOOLEAN     NOT NULL DEFAULT FALSE,
  "appointment_instructions"     TEXT,
  "lumper_info"                  TEXT,
  "special_instructions"         TEXT,
  "created_at"                   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"                   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_facilities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "customer_facilities_customer_id_idx" ON "customer_facilities"("customer_id");

ALTER TABLE "customer_facilities"
  ADD CONSTRAINT "customer_facilities_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── CustomerNote ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "customer_notes" (
  "id"              TEXT NOT NULL,
  "customer_id"     TEXT NOT NULL,
  "note_type"       VARCHAR(40) NOT NULL,
  "facility_id"     TEXT,
  "title"           TEXT,
  "content"         TEXT NOT NULL,
  "follow_up_date"  DATE,
  "source"          VARCHAR(20) NOT NULL DEFAULT 'manual',
  "created_by_id"   TEXT,
  "created_by_name" TEXT,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "customer_notes_customer_id_note_type_idx" ON "customer_notes"("customer_id", "note_type");
CREATE INDEX IF NOT EXISTS "customer_notes_facility_id_idx" ON "customer_notes"("facility_id");

ALTER TABLE "customer_notes"
  ADD CONSTRAINT "customer_notes_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_notes"
  ADD CONSTRAINT "customer_notes_facility_id_fkey"
  FOREIGN KEY ("facility_id") REFERENCES "customer_facilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── CustomerActivity ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS "customer_activity" (
  "id"           TEXT NOT NULL,
  "customer_id"  TEXT NOT NULL,
  "event_type"   VARCHAR(64) NOT NULL,
  "description"  TEXT NOT NULL,
  "actor_type"   VARCHAR(20) NOT NULL DEFAULT 'SYSTEM',
  "actor_id"     TEXT,
  "actor_name"   TEXT,
  "metadata"     JSONB,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_activity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "customer_activity_customer_id_created_at_idx" ON "customer_activity"("customer_id", "created_at");
CREATE INDEX IF NOT EXISTS "customer_activity_event_type_idx" ON "customer_activity"("event_type");

ALTER TABLE "customer_activity"
  ADD CONSTRAINT "customer_activity_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
