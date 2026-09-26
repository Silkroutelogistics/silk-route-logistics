-- v3.8.blg — AR helpers stop sharing the reminder checklist.
--
-- WHY. Three jobs wrote the Invoice.reminderSent* fields and only one of them
-- sends email (arCollectionsService.processArReminders). The other two ticked
-- the boxes first, so once reminders are switched on the sender would find most
-- of them ticked and skip: "due today", "7 days late" and the final notice would
-- usually never go out, while the invoice said they had.
--
-- One of those two, the daily job that also blocked credit at 90 days overdue,
-- used reminderSent90 as its memory of "I already blocked for this invoice".
-- Its job moves to services/overdueCreditBlock and gets its own column below.
-- The other, the monthly job, only ticked boxes and is retired.
--
-- 1. ADDITIVE. One Boolean column, default false.
ALTER TABLE "public"."invoices" ADD COLUMN "creditBlockApplied" BOOLEAN NOT NULL DEFAULT false;

-- 2. EXACT BACKFILL. reminderSent90 was written by one writer only, the old
--    daily job, in the same step that applied the 90-day block. So every row
--    where it is true is a row where the block was already applied, and no row
--    is marked on a guess. Without this, the first run would re-block every
--    customer an admin had deliberately unblocked.
UPDATE "public"."invoices" SET "creditBlockApplied" = true WHERE "reminderSent90" = true;

-- 3. RETIRE THE MONTHLY JOB'S REGISTRY ROW. The seed only upserts, so without
--    this the row would stay on the monitoring page, described as "Invoice
--    reminder emails monthly", for a job that no longer exists and never sent
--    an email. No other table references cron_registry.
DELETE FROM "public"."cron_registry" WHERE "jobName" = 'monthly-invoice-reminders';
