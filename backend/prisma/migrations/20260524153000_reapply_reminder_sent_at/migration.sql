-- v3.8.ajm — Reapply-eligibility reminder dedup column.
-- Set when daily cron fires "you can reapply now" email. Null until
-- first fire. Cleared by v3.8.ajn Lift Rejection so re-rejection
-- reminders still fire on future cycles.
ALTER TABLE "public"."carrier_profiles"
  ADD COLUMN "reapplyReminderSentAt" TIMESTAMP(3);
