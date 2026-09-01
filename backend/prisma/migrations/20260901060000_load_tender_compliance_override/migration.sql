-- v3.8.axm — record the override a tender was created under.
--
-- Additive and nullable. Null is the ordinary case (the carrier was simply
-- compliant), so no backfill: a historical tender genuinely has no recorded
-- override, and inventing one would be worse than the gap.
--
-- FK rather than copied columns. compliance_overrides already holds who
-- (adminId), why (reason) and when (createdAt); duplicating them here would
-- create a second answer to "who waived this" that can drift from the first.
--
-- ON DELETE SET NULL: an override row is evidence and is not expected to be
-- deleted, but if one ever is, losing the link must not take the tender with it.
ALTER TABLE "public"."load_tenders" ADD COLUMN "complianceOverrideId" TEXT;

CREATE INDEX "load_tenders_complianceOverrideId_idx" ON "public"."load_tenders"("complianceOverrideId");

ALTER TABLE "public"."load_tenders"
  ADD CONSTRAINT "load_tenders_complianceOverrideId_fkey"
  FOREIGN KEY ("complianceOverrideId") REFERENCES "public"."compliance_overrides"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
