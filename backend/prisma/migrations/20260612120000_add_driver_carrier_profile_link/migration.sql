-- v3.8.amw — SRL Driver Academy Sprint T1: link drivers to carriers.
-- Additive + nullable: pre-existing AE-console fleet rows keep NULL and
-- remain invisible to carrier-portal roster queries (which always scope
-- on "carrierProfileId"). Manually authored per CLAUDE.md §2.2 (no
-- `prisma migrate dev` against the prod-pointed DATABASE_URL). Applied
-- by Render's `prisma migrate deploy` build step on next push.

-- AlterTable
ALTER TABLE "public"."drivers" ADD COLUMN "carrierProfileId" TEXT;

-- CreateIndex
CREATE INDEX "drivers_carrierProfileId_idx" ON "public"."drivers"("carrierProfileId");

-- AddForeignKey
ALTER TABLE "public"."drivers" ADD CONSTRAINT "drivers_carrierProfileId_fkey" FOREIGN KEY ("carrierProfileId") REFERENCES "public"."carrier_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
