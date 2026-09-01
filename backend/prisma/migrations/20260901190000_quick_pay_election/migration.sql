-- Quick Pay election: the record of WHO chose a per-load Quick Pay speed,
-- WHEN, and THROUGH WHAT CHANNEL. Tender Lifecycle Residue row 7.
--
-- STRICTLY ADDITIVE. Two new enums, one new table, no column dropped, no
-- column altered, NO BACKFILL. Existing elections have no provenance because
-- none was ever captured; inventing a decider for them would put a confident
-- value on a guess, on rows a fee dispute would read.
--
-- Load.quickPaySpeed and Load.quickPayFeePercent are UNCHANGED and remain the
-- frozen projection that the charge path and the PDF read. This table is the
-- decision record, not a second source of truth for the terms.
--
-- ROW COUNT GATE (run against the target BEFORE deploying, per Item 212):
--   SELECT count(*) FROM quick_pay_elections;
-- Expected 0 on every environment. A non-zero count means the table already
-- exists from somewhere else and this migration is not the one that created it.

-- CreateEnum
CREATE TYPE "QuickPayDecisionChannel" AS ENUM ('PORTAL', 'CARVAN', 'EMAIL_LINK', 'ON_BEHALF');

-- CreateEnum
CREATE TYPE "QuickPayElectionStatus" AS ENUM ('ELECTED', 'VOIDED');

-- CreateTable
CREATE TABLE "quick_pay_elections" (
    "id" TEXT NOT NULL,
    "tender_id" TEXT NOT NULL,
    "load_id" TEXT NOT NULL,
    "carrier_profile_id" TEXT NOT NULL,
    "speed" "QuickPaySpeed" NOT NULL,
    "fee_percent" DOUBLE PRECISION NOT NULL,
    "status" "QuickPayElectionStatus" NOT NULL DEFAULT 'ELECTED',
    "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_via" "QuickPayDecisionChannel" NOT NULL,
    "decided_by_user_id" TEXT,
    "evidence_type" "TenderEvidenceType",
    "evidence_ref" TEXT,
    "signer_ip" TEXT,
    "signer_user_agent" TEXT,
    "voided_at" TIMESTAMP(3),
    "voided_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quick_pay_elections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quick_pay_elections_tender_id_status_idx" ON "quick_pay_elections"("tender_id", "status");

-- CreateIndex
CREATE INDEX "quick_pay_elections_load_id_idx" ON "quick_pay_elections"("load_id");

-- CreateIndex
CREATE INDEX "quick_pay_elections_carrier_profile_id_decided_at_idx" ON "quick_pay_elections"("carrier_profile_id", "decided_at");

-- AddForeignKey
ALTER TABLE "quick_pay_elections" ADD CONSTRAINT "quick_pay_elections_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "load_tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quick_pay_elections" ADD CONSTRAINT "quick_pay_elections_load_id_fkey" FOREIGN KEY ("load_id") REFERENCES "loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quick_pay_elections" ADD CONSTRAINT "quick_pay_elections_carrier_profile_id_fkey" FOREIGN KEY ("carrier_profile_id") REFERENCES "carrier_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quick_pay_elections" ADD CONSTRAINT "quick_pay_elections_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- At most ONE live election per tender, enforced by the database rather than
-- by the service alone.
--
-- A PARTIAL unique index rather than `tender_id UNIQUE`, which is what the
-- Phase A audit proposed: a rate change reverts the SAME tender row to OFFERED
-- with a version bump, so one tender can legitimately carry a second election
-- after re-acceptance. A plain unique constraint would refuse that and force
-- the service to delete history to proceed. This allows the history while still
-- making "two live elections on one tender" unrepresentable.
CREATE UNIQUE INDEX "quick_pay_elections_one_live_per_tender"
  ON "quick_pay_elections"("tender_id")
  WHERE "status" = 'ELECTED';
