-- v3.8.aku §13.3 Item 182 sprint 5/5 — Authority-age waiting list.
-- Captures /onboarding visitors whose FMCSA authority is younger than
-- 12 months OR has no resolvable grant date. Cron-driven auto-notify
-- when carrier crosses 18-month threshold is a separate follow-up
-- sprint; this table is write-only in Sprint 5.

CREATE TABLE "public"."waiting_list" (
  "id"                    TEXT NOT NULL,
  "email"                 TEXT NOT NULL,
  "dotNumber"             TEXT NOT NULL,
  "mcNumber"              TEXT,
  "authorityGrantedDate"  TIMESTAMP(3),
  "eligibilityDate"       TIMESTAMP(3),
  "notifiedAt"            TIMESTAMP(3),
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "waiting_list_pkey" PRIMARY KEY ("id")
);

-- Dedup on (email, dotNumber) — same carrier filling the form twice
-- should update the existing row, not create duplicates.
CREATE UNIQUE INDEX "waiting_list_email_dotNumber_key"
  ON "public"."waiting_list"("email", "dotNumber");

-- Eligibility-date index for the future Sprint 6 cron-notify query
-- (SELECT * WHERE eligibilityDate <= NOW() AND notifiedAt IS NULL).
CREATE INDEX "waiting_list_eligibilityDate_idx"
  ON "public"."waiting_list"("eligibilityDate");

-- Index on notifiedAt for the dedup query (avoid re-notifying).
CREATE INDEX "waiting_list_notifiedAt_idx"
  ON "public"."waiting_list"("notifiedAt");
