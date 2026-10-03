-- coi-verify-email-fix C2. Endorsements become three-state; each policy gets its insurer
-- and NAIC; workers comp gets statutory + employer's-liability limits; the insurance
-- record gets its AE review time; the agent-email hold moves from code to a column.

-- Endorsements: drop default(false) and NOT NULL, then false becomes null. The default
-- asserted "not provided" for every carrier nobody had checked. A true was entered by
-- someone and stays true.
ALTER TABLE "carrier_profiles" ALTER COLUMN "additionalInsuredSRL" DROP DEFAULT, ALTER COLUMN "additionalInsuredSRL" DROP NOT NULL;
ALTER TABLE "carrier_profiles" ALTER COLUMN "waiverOfSubrogation" DROP DEFAULT, ALTER COLUMN "waiverOfSubrogation" DROP NOT NULL;
ALTER TABLE "carrier_profiles" ALTER COLUMN "thirtyDayCancellationNotice" DROP DEFAULT, ALTER COLUMN "thirtyDayCancellationNotice" DROP NOT NULL;
UPDATE "carrier_profiles" SET "additionalInsuredSRL" = NULL WHERE "additionalInsuredSRL" = false;
UPDATE "carrier_profiles" SET "waiverOfSubrogation" = NULL WHERE "waiverOfSubrogation" = false;
UPDATE "carrier_profiles" SET "thirtyDayCancellationNotice" = NULL WHERE "thirtyDayCancellationNotice" = false;

-- Additive, nullable, no backfill.
ALTER TABLE "carrier_profiles"
  ADD COLUMN "autoLiabilityInsurerName" TEXT,
  ADD COLUMN "autoLiabilityInsurerNaic" TEXT,
  ADD COLUMN "generalLiabilityInsurerName" TEXT,
  ADD COLUMN "generalLiabilityInsurerNaic" TEXT,
  ADD COLUMN "cargoInsuranceInsurerName" TEXT,
  ADD COLUMN "cargoInsuranceInsurerNaic" TEXT,
  ADD COLUMN "workersCompInsurerName" TEXT,
  ADD COLUMN "workersCompInsurerNaic" TEXT,
  ADD COLUMN "workersCompStatutory" BOOLEAN,
  ADD COLUMN "workersCompElEachAccident" DOUBLE PRECISION,
  ADD COLUMN "workersCompElDiseaseEachEmployee" DOUBLE PRECISION,
  ADD COLUMN "workersCompElDiseasePolicyLimit" DOUBLE PRECISION,
  ADD COLUMN "insuranceReviewedAt" TIMESTAMP(3),
  ADD COLUMN "agentEmailHoldUntil" TIMESTAMP(3);

-- JETEX FREIGHT LLC (MC 585393), held in code since v3.8.bqh after the 2026-10-02
-- incorrect COI request. Moves onto the column; lifting it is now a data change.
UPDATE "carrier_profiles" SET "agentEmailHoldUntil" = TIMESTAMP '9999-12-31 00:00:00' WHERE "id" = 'cmublocyz00flh02dhyvwqwky';
