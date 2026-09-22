-- SRL's countersignature on a rate confirmation, applied by the system at the
-- instant SRL issues the document.
--
-- The BCA countersigns at the carrier's ACCEPTANCE, because acceptance is the
-- last act needed to form that agreement. A rate confirmation is the other way
-- round: SRL issues it, and issuing it is the broker's act. Same three columns,
-- same names, different triggering instant.
--
-- ADDITIVE AND NULLABLE, NO BACKFILL, ON PURPOSE. Rate confirmations already
-- issued were never countersigned. Writing a countersignature onto them now
-- would be manufacturing an execution record for an act that did not happen,
-- under a name and a timestamp, on rows a dispute could turn on. They stay NULL
-- and render with the broker date line open, which is true.
--
-- Their stored bytes are likewise untouched. contentHash is over the FROZEN PDF
-- (unlike CarrierAgreement.contentHash, which is over canonical text), so a
-- backfill could not have reached the document anyway: the countersignature has
-- to be in the bytes at render time or it is not in the artifact at all. That is
-- why the stamp is decided before the render and written in the same statement
-- as the hash.
--
-- No index: these columns are read with the row they belong to and are never a
-- query predicate.
ALTER TABLE "public"."rate_confirmations" ADD COLUMN "counterSignedByName" TEXT;
ALTER TABLE "public"."rate_confirmations" ADD COLUMN "counterSignedByTitle" TEXT;
ALTER TABLE "public"."rate_confirmations" ADD COLUMN "counterSignedAt" TIMESTAMP(3);
