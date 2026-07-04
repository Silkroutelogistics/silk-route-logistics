-- Single active session per driver: rotated on login/set-pin, embedded as the
-- session JWT `sid` claim, checked by authenticateDriver. Additive + nullable
-- (null = no post-feature login yet), so existing sessions keep working until
-- the next login rotates the id.
ALTER TABLE "public"."drivers" ADD COLUMN "trainingSessionId" TEXT;
