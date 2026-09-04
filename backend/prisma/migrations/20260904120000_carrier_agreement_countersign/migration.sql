-- SRL's countersignature on a carrier agreement, applied by the system at the
-- instant the carrier accepts.
--
-- ADDITIVE AND NULLABLE, NO BACKFILL, ON PURPOSE. Two BCAs are already executed
-- on the archived 2026-06-27-v1 body and neither was countersigned. Writing a
-- countersignature onto them now would be manufacturing an execution record for
-- an act that did not happen — and it would say so under a name and a
-- timestamp, on rows a dispute could turn on. They stay NULL and render "not
-- countersigned", which is true.
--
-- Their stored contentHash is likewise untouched. The hash is computed once, at
-- signing, and nothing in the codebase recomputes or re-verifies it, so adding
-- a countersign segment to the canonical assembly changes future hashes only.
--
-- No index: these columns are read with the row they belong to and are never a
-- query predicate.
ALTER TABLE "public"."carrier_agreements" ADD COLUMN "counterSignedByName" TEXT;
ALTER TABLE "public"."carrier_agreements" ADD COLUMN "counterSignedByTitle" TEXT;
ALTER TABLE "public"."carrier_agreements" ADD COLUMN "counterSignedAt" TIMESTAMP(3);
