-- v3.8.awo — a hash of what the agreement said, and a status for assent that is
-- not a signature.
--
-- ADDITIVE. The enum gains a value; the table gains a nullable column. No
-- backfill: agreements executed before this commit were never hashed, and
-- computing a hash for them NOW would attest to today's assembly of a document
-- signed months ago. NULL renders "unhashed", which is the truth.
--
-- WHY ACKNOWLEDGED IS NOT "SIGNED". The tender gate filters on
-- `status = 'SIGNED' AND templateName = 'broker-carrier'`
-- (complianceMonitorService.ts:423-427). A registration click-wrap row recorded
-- as SIGNED would satisfy that gate, making a carrier tenderable without the
-- in-portal signing that v3.8.awm made consent-gated — undoing that guarantee.
-- ACKNOWLEDGED records the assent and satisfies nothing. That is the entire
-- point of the value, and a test asserts the gate's condition is unchanged.
--
-- rate_confirmations gets NO contentHash column in this migration. The RC
-- generator split was halted at the sizing gate (1,081 lines, grid layout), so
-- there is no writer for it — and a column nothing writes is the dead-field
-- pattern this codebase keeps having to unpick.

ALTER TYPE "public"."AgreementStatus" ADD VALUE 'ACKNOWLEDGED';

ALTER TABLE "public"."carrier_agreements" ADD COLUMN "contentHash" TEXT;
