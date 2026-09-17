-- B3a (2026-09-17) — structured LOGIN details + the composite index the audit
-- list query has always run without.
--
-- Additive and nullable. No backfill: a LOGIN row written before this column
-- existed had no structured details, and inventing them would put a
-- confident-looking value on a guess (the Item 250 rule). audit_logs holds
-- ~665 rows in production; ADD COLUMN of a nullable JSONB is metadata-only and
-- the index build is sub-second at that size.
ALTER TABLE "public"."audit_logs" ADD COLUMN "details" JSONB;

CREATE INDEX "audit_logs_userId_action_createdAt_idx"
  ON "public"."audit_logs"("userId" ASC, "action" ASC, "createdAt" ASC);
