-- How a load offers itself: one carrier at a time, or all at once.
--
-- ADDITIVE with a DEFAULT, so every existing row becomes SEQUENTIAL, which is
-- what every existing row already is in practice: broadcast is the only path
-- that creates simultaneous live tenders, and it will set PARALLEL itself from
-- this commit forward.
--
-- NO BACKFILL of historical broadcast loads. A load whose broadcast has already
-- resolved has no live tenders left, so the flag would change nothing about it,
-- and guessing which historical loads were broadcast would put a value on an
-- inference. The uniqueness rule only ever looks at LIVE tenders.
--
-- ROW COUNT GATE (run against the target BEFORE deploying):
--   SELECT count(*) FROM loads WHERE "tenderFanout" IS NULL;
-- Expected 0 -- the column is NOT NULL with a default.
CREATE TYPE "TenderFanout" AS ENUM ('SEQUENTIAL', 'PARALLEL');

ALTER TABLE "loads" ADD COLUMN "tenderFanout" "TenderFanout" NOT NULL DEFAULT 'SEQUENTIAL';
