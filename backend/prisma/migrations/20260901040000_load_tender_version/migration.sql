-- Tender lifecycle commit 7 — which revision of the terms a tender is on.
--
-- WHY. A rate confirmation is issued against a tender's rate. When a carrier
-- counters, the rate changes and any RC already issued is stale — but nothing
-- recorded that, so "which rate did the carrier actually sign for" was
-- answerable only by comparing timestamps, which is guesswork. In a dispute,
-- guesswork is the thing you cannot afford.
--
-- Starts at 1 and increments when the RATE CHANGES. Today that means a counter
-- offer; a future AE-side rate edit after acceptance (gap-table row 11) will
-- use the same counter.
--
-- DEFAULT 1, NOT NULL, additive. Every existing row becomes version 1, which is
-- true of all of them: none has ever been re-termed, because there was no
-- mechanism to do so. No backfill is needed and none would be honest — an
-- existing tender's history cannot be reconstructed into revisions that were
-- never recorded.
--
-- Environment-portable: adds one column with a default. Runs identically on an
-- empty CI database and on production.

ALTER TABLE "public"."load_tenders"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
