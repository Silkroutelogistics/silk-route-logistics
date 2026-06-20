-- v3.8.aob (Sprint E1) — public certificate-verification code.
-- Additive: one nullable unique column on driver_course_progress, lazily
-- populated when a cert is first generated. Safe on a live DB.

ALTER TABLE "public"."driver_course_progress" ADD COLUMN "verifyCode" TEXT;

CREATE UNIQUE INDEX "driver_course_progress_verifyCode_key"
    ON "public"."driver_course_progress"("verifyCode");
