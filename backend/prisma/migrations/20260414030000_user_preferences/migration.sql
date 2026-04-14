-- v3.4.u — User.preferences JSON for free-form client preferences.
-- First consumer: waterfall automation mode (manual/semi_auto/full_auto).
-- Rule 9 (DB over localStorage) — replaces localStorage preference.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "preferences" JSONB;
