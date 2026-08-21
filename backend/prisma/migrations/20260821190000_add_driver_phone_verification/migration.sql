-- ARC 19 — verified driver phone + consented ping capture.
--
-- Additive only. Every column is nullable and the new table is new, so no
-- existing row changes meaning and no backfill is required: a load with a null
-- driver_phone_verified_at is a load whose driver was never verified, which is
-- the honest state for every load that predates this.
--
-- Authored by hand per §2.2 rather than by `prisma migrate dev`, because
-- backend/.env points at production.

ALTER TABLE "public"."loads" ADD COLUMN "driver_phone_verified" TEXT;
ALTER TABLE "public"."loads" ADD COLUMN "driver_phone_verified_at" TIMESTAMP(3);
ALTER TABLE "public"."loads" ADD COLUMN "driver_consent_at" TIMESTAMP(3);
ALTER TABLE "public"."loads" ADD COLUMN "driver_consent_text" TEXT;

CREATE TABLE "public"."driver_phone_verifications" (
    "id" TEXT NOT NULL,
    "load_id" TEXT NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "verified_at" TIMESTAMP(3),
    "consent_text" TEXT,
    "consent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_phone_verifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "driver_phone_verifications_load_id_phone_idx" ON "public"."driver_phone_verifications"("load_id", "phone");
CREATE INDEX "driver_phone_verifications_expires_at_idx" ON "public"."driver_phone_verifications"("expires_at");

ALTER TABLE "public"."driver_phone_verifications"
  ADD CONSTRAINT "driver_phone_verifications_load_id_fkey"
  FOREIGN KEY ("load_id") REFERENCES "public"."loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
