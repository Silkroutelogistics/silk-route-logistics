-- Arc 2 Item 5 — records whose failure caused a TONU.
-- Additive and nullable, so existing rows keep their meaning and no backfill is
-- needed. Historical TONU loads have no fault side because nobody was ever asked
-- for one; that is accurate rather than a gap to fill in.
ALTER TABLE "public"."loads" ADD COLUMN "tonuFaultSide" TEXT;
