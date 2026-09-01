-- Tender lifecycle commit 2, part 1 of 2 — add WITHDRAWN and the SRL-side reason.
--
-- WHY THE SPLIT INTO TWO MIGRATIONS. Postgres refuses to USE a new enum value
-- in the transaction that ADDED it, and Prisma wraps each migration file in one
-- transaction. Verified against a real database rather than assumed:
--
--   BEGIN; ALTER TYPE "TenderStatus" ADD VALUE 'WITHDRAWN';
--          UPDATE load_tenders SET status='WITHDRAWN' WHERE false; COMMIT;
--   ERROR:  unsafe use of new value "WITHDRAWN" of enum type "TenderStatus"
--   HINT:   New enum values must be committed before they can be used.
--
-- So this file adds the value and the column; 20260901030000 does the backfill.
--
-- WHY THE VALUE EXISTS. When a carrier accepts, every sibling offer on that
-- load was being marked DECLINED — by SRL, on behalf of carriers who had done
-- nothing. That is not cosmetic. `carrierController` derives `tendersDeclined`
-- and `acceptanceRate = accepted / tenders.length` from these rows, and §9
-- scores acceptance rate at 10% of Compass. A carrier offered ten waterfall
-- loads who wins one and loses nine to faster carriers was being shown at a 10%
-- acceptance rate. WITHDRAWN separates "the carrier said no" from "SRL took it
-- back" so the performance read can exclude the second.
--
-- ONLY WITHDRAWN IS ADDED HERE. RC_SENT / CONFIRMED / RELEASED are ratified but
-- have no writer yet, and an enum value nothing writes is the dead-field
-- pattern this codebase keeps having to unpick. They land with their writers.
--
-- ADDITIVE. No existing row changes meaning in this file.

ALTER TYPE "public"."TenderStatus" ADD VALUE 'WITHDRAWN';

-- The SRL-side counterpart to declineReason. Separate column on purpose: the
-- two have different authors and different readers, and merging them would put
-- SRL's words into the carrier's performance record.
ALTER TABLE "public"."load_tenders" ADD COLUMN "statusReason" TEXT;
