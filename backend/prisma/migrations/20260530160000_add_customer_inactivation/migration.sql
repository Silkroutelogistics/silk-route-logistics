-- v3.8.alr §13.3 Item 8.1 — Customer inactivation workflow.
-- Additive, default true so all existing customers stay active. No backfill.
ALTER TABLE "public"."customers" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "public"."customers" ADD COLUMN "inactivation_reason" TEXT;
ALTER TABLE "public"."customers" ADD COLUMN "inactivated_at" TIMESTAMP(3);
ALTER TABLE "public"."customers" ADD COLUMN "inactivated_by_id" TEXT;
