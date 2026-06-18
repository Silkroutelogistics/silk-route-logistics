-- v3.8.anl (audit E1 / §13.3 Item 194 E1) — email send-outcome tracking.
-- emailService.sendEmail writes one row per send (SENT with the Resend id, or
-- FAILED with the error) non-blocking, so a silently-failing transactional email
-- is visible + queryable instead of vanishing into a log line. Additive, no FK.
CREATE TABLE "public"."email_logs" (
    "id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "resendId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "email_logs_status_createdAt_idx" ON "public"."email_logs"("status", "createdAt");
