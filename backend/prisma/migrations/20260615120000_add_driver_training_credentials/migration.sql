-- v3.8.amz — SRL Driver Academy Sprint T2: driver training-portal credentials.
-- All additive + nullable (trainingFailedAttempts defaults 0), so existing
-- driver rows stay valid and un-invited. Manually authored per CLAUDE.md §2.2
-- (no `prisma migrate dev` against the prod-pointed DATABASE_URL). Applied by
-- Render's `prisma migrate deploy` build step on next push.

-- AlterTable
ALTER TABLE "public"."drivers" ADD COLUMN "trainingPinHash" TEXT;
ALTER TABLE "public"."drivers" ADD COLUMN "trainingPinSetAt" TIMESTAMP(3);
ALTER TABLE "public"."drivers" ADD COLUMN "trainingInviteSentAt" TIMESTAMP(3);
ALTER TABLE "public"."drivers" ADD COLUMN "trainingFailedAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "public"."drivers" ADD COLUMN "trainingLockedUntil" TIMESTAMP(3);
ALTER TABLE "public"."drivers" ADD COLUMN "trainingLastLoginAt" TIMESTAMP(3);
