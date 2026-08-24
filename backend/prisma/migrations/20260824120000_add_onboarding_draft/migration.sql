-- Arc 32 — onboarding_drafts: a carrier's Step 1 answers, held server-side so
-- their email can be verified BEFORE the account exists.
--
-- ENTIRELY ADDITIVE. One new table, no change to any existing one, no backfill.
-- A read-only production census on 2026-08-24 found 4 carrier profiles (3
-- APPROVED, 1 PENDING) and 4 CARRIER users; the single real application is
-- already past registration, so nothing in flight is affected.
--
-- Not an OtpCode row: OtpCode.userId is a required FK to User, and there is no
-- User at Step 1. Follows the DriverPhoneVerification precedent instead.

CREATE TABLE "onboarding_drafts" (
    "id"                TEXT NOT NULL,
    "email"             TEXT NOT NULL,
    "mcNumber"          TEXT NOT NULL,
    "dotNumber"         TEXT,
    "company"           TEXT,
    "firstName"         TEXT,
    "lastName"          TEXT,
    "phone"             TEXT,
    "address"           TEXT,
    "city"              TEXT,
    "state"             TEXT,
    "zip"               TEXT,
    "code"              TEXT,
    "codeExpiresAt"     TIMESTAMP(3),
    "attempts"          INTEGER NOT NULL DEFAULT 0,
    "lastSentAt"        TIMESTAMP(3),
    "linkTokenHash"     TEXT,
    "nonce"             TEXT NOT NULL,
    "verifiedAt"        TIMESTAMP(3),
    "emailIsDisposable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_drafts_pkey" PRIMARY KEY ("id")
);

-- Re-submitting the same email + MC updates the draft rather than duplicating it.
CREATE UNIQUE INDEX "onboarding_drafts_email_mcNumber_key" ON "onboarding_drafts"("email", "mcNumber");
CREATE INDEX "onboarding_drafts_linkTokenHash_idx" ON "onboarding_drafts"("linkTokenHash");
CREATE INDEX "onboarding_drafts_codeExpiresAt_idx" ON "onboarding_drafts"("codeExpiresAt");
