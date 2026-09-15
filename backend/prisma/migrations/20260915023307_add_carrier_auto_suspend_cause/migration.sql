-- Sprint A0 (v3.8.bbt): structured suspension cause on CarrierProfile.
--
-- ADDITIVE AND NULLABLE. No backfill, no drop, no default. The auto-reversal
-- (complianceMonitorService.checkAutoReversal) switches on this column; a
-- SUSPENDED row whose cause is NULL is held for an AE rather than reinstated.
--
-- ROW-COUNT GATE, run read-only against production before this merges:
--   SELECT count(*) FROM carrier_profiles
--    WHERE "onboardingStatus" = 'SUSPENDED' OR "autoSuspendedAt" IS NOT NULL;
-- Result 2026-09-14 (scripts/_a0-rowcount-gate.ts, default_transaction_read_only=on): 0.
-- So no existing row lands with a NULL cause on deploy.
--
-- NOTE: `prisma migrate dev` also emitted two statements that are NOT part of
-- this change and were removed by hand: a drop-and-recreate of the two
-- info_requests user FKs (NO ACTION in 20260524123000 vs Prisma's Restrict /
-- SetNull defaults) and `training_questions.options DROP DEFAULT`
-- (20260615170000 declared a default the schema does not). Both are
-- pre-existing drift between hand-authored migrations and schema.prisma,
-- banked at §13.3, and must not ride in an unrelated migration.

-- CreateEnum
CREATE TYPE "AutoSuspendCause" AS ENUM ('FMCSA_AUTHORITY', 'FMCSA_OUT_OF_SERVICE', 'FMCSA_RATING', 'INSURANCE_EXPIRED', 'VETTING_CRITICAL', 'OFAC_MATCH', 'AE_MANUAL');

-- AlterTable
ALTER TABLE "carrier_profiles" ADD COLUMN "autoSuspendCause" "AutoSuspendCause";
