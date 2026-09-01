-- v3.8.axq — how SRL knows the carrier agreed, when an AE accepted for them.
--
-- Additive and nullable: an ordinary carrier accept has no evidence to record
-- because the carrier clicked it themselves, and null is the correct reading of
-- that. No backfill — a historical on-behalf accept genuinely has no recorded
-- reference, and inventing one would be worse than the gap.
--
-- The type is an enum rather than free text so the reference points at
-- something findable (an inbox, a phone log, a thread) instead of prose nobody
-- can follow six months later in a dispute.
CREATE TYPE "public"."TenderEvidenceType" AS ENUM ('EMAIL_SUBJECT', 'CALL_TIMESTAMP', 'QUO_MESSAGE_ID');

ALTER TABLE "public"."load_tenders" ADD COLUMN "evidenceType" "public"."TenderEvidenceType";
ALTER TABLE "public"."load_tenders" ADD COLUMN "evidenceRef" TEXT;
