-- Phase 6.2 Lead Hunter / CRM separation. Adds approval-event metadata
-- to the customers table. Pure additive: both columns nullable, no
-- backfill needed for existing rows. Hand-authored per CLAUDE.md §2
-- (migrate dev not usable — migration history has shadow-DB drift).
--
-- Pairs with POST /customers/:id/approve endpoint. Audit 39de1ad
-- documented the gap.

ALTER TABLE "customers"
  ADD COLUMN "approved_at"    TIMESTAMP(3),
  ADD COLUMN "approved_by_id" TEXT;
