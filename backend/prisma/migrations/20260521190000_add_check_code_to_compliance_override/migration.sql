-- v3.8.ahl — scoped overrides for the authority-age gate
-- (Item 182 sprint 3 of 5, commit 1 of 2 in the ahl arc).
--
-- Pre-ahl: ComplianceOverride was BLANKET — any active row caused
-- complianceCheck() to short-circuit allowed=true, silently waiving
-- every downstream check (insurance, OFAC, FMCSA status, etc.).
--
-- Post-ahl: a nullable checkCode field binds the override to a
-- specific check. NULL preserves the pre-ahl blanket semantic
-- (backwards-compatible with every existing override row).
-- Non-null values like "AUTHORITY_TOO_YOUNG" are consulted by their
-- specific check branch and do NOT trigger the blanket short-circuit.
--
-- Additive + nullable: existing rows default to NULL on column add,
-- preserving prior blanket behavior. No backfill needed.

ALTER TABLE "public"."compliance_overrides" ADD COLUMN "checkCode" TEXT;
