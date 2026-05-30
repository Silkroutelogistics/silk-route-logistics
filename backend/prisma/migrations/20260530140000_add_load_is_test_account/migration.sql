-- v3.8.alj §13.3 Item 192 full close — Load.isTestAccount for risk-engine
-- test-load exclusion. Set true by the seed script + E2E fixtures going
-- forward. No data backfill: existing prod stale-seed loads (Feb-2026
-- pickup dates) are caught by the risk engine's 14-day pickupDate
-- staleness guard, and the seed users overlap with real identities
-- (whaider@) so a poster-based backfill would wrongly mark real loads.
-- Additive + defaulted → safe no-lock ALTER at pre-revenue volume.
-- Manual-authored per §2.2 (avoid prisma migrate dev against
-- prod-pointed DATABASE_URL).

ALTER TABLE "public"."loads"
  ADD COLUMN "isTestAccount" BOOLEAN NOT NULL DEFAULT false;
