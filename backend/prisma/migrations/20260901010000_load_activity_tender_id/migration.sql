-- Tender lifecycle commit 1 — scope LoadActivity rows to a tender.
--
-- WHY NOT A NEW TABLE. The tender-lifecycle audit
-- (docs/audits/tender-lifecycle-audit.md §7) went looking for an existing table
-- that already models tender transitions before proposing a `TenderEvent`, and
-- found this one: `waterfallEventService` is a thin wrapper over
-- `logLoadActivity`, and `load_activity.event_type` already carries
-- `tender_sent` / `position_tendered` / `position_accepted` / etc. A second
-- table would have split one timeline across two stores.
--
-- WHAT THIS FIXES. `load_activity` is keyed to load_id only, so a load with
-- several tenders — the ordinary waterfall case — mixes their histories into a
-- single undifferentiated list. "What happened to THIS tender" had no answer.
--
-- ADDITIVE AND NULLABLE. Every existing row keeps its meaning: NULL reads as
-- "a load event, not a tender event", which is what all 100% of them are today
-- (nothing has ever written this column). No backfill is possible and none is
-- needed — historical rows genuinely predate the distinction, and inventing a
-- tender_id for them by guessing from timestamps would be fabrication.
--
-- ON DELETE SET NULL, not CASCADE. A tender's history must outlive the tender
-- row. The reason an offer was withdrawn is most interesting precisely when the
-- offer is gone; cascading would delete the record of what happened along with
-- the thing it happened to. Note `load_tenders` already cascades from `loads`,
-- so a deleted load still takes its activity with it via the existing
-- load_id FK — this only decouples activity from the TENDER's lifetime.
--
-- Environment-portable: adds a nullable column and one index. Runs identically
-- on an empty CI database and on production.

ALTER TABLE "public"."load_activity"
  ADD COLUMN "tender_id" TEXT;

ALTER TABLE "public"."load_activity"
  ADD CONSTRAINT "load_activity_tender_id_fkey"
  FOREIGN KEY ("tender_id") REFERENCES "public"."load_tenders"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Composite, ordered to serve the drawer's query directly: every tender-history
-- read is "rows for one tender, newest first".
CREATE INDEX "load_activity_tender_id_created_at_idx"
  ON "public"."load_activity"("tender_id", "created_at");
