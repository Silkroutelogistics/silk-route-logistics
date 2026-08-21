-- ARC 20 — STOP/HELP handling. Additive: one new table, nothing altered.
--
-- Keyed on the phone number rather than a load or a driver, because a STOP is a
-- statement about a handset and outlives all three. Authored by hand per §2.2.

CREATE TABLE "public"."sms_opt_outs" (
    "id" TEXT NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "opted_out_at" TIMESTAMP(3) NOT NULL,
    "keyword" VARCHAR(20) NOT NULL,
    "opted_in_again_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_opt_outs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sms_opt_outs_phone_key" ON "public"."sms_opt_outs"("phone");
CREATE INDEX "sms_opt_outs_opted_in_again_at_idx" ON "public"."sms_opt_outs"("opted_in_again_at");
