-- Arc 33 — AE carrier invitations, and the onboarding funnel as an explicit field.
--
-- ADDITIVE. No column is dropped, no row is deleted. This rides the normal
-- deploy rather than going to a hold branch: §2.2's hold rule is for changes
-- whose release conditions are unmet, and this has none — the feature 500s
-- without the table, so holding it back would ship a broken surface.
--
-- WHY A SEPARATE INVITE TABLE rather than columns on onboarding_drafts: the two
-- have different lifetimes and different secrets. An invitation lives 7 days;
-- the 6-digit OTP lives 10 minutes. Sharing `codeExpiresAt` between them would
-- have given the code a week of life. One column, one meaning.
--
-- WHY A STATUS COLUMN rather than deriving from nullable timestamps: two
-- surfaces reading the same nullable columns eventually disagree about what
-- they mean. The Carrier Pool funnel renders this field.
--
-- BACKFILL: existing drafts are moved to their derivable state in this same
-- migration, so no row is left at a default that misdescribes it. There are no
-- INVITED rows to backfill because invitations did not exist before this.

CREATE TYPE "OnboardingDraftStatus" AS ENUM (
  'STARTED',
  'INVITED',
  'LINK_CLICKED',
  'DRAFT_VERIFIED',
  'SUBMITTED'
);

CREATE TABLE "onboarding_invites" (
  "id"          TEXT NOT NULL,
  "tokenHash"   TEXT NOT NULL,
  "email"       TEXT NOT NULL,
  "invitedById" TEXT NOT NULL,
  "company"     TEXT,
  "mcNumber"    TEXT,
  "note"        TEXT,
  "expiresAt"   TIMESTAMP(3) NOT NULL,
  "consumedAt"  TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "onboarding_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "onboarding_invites_tokenHash_key" ON "onboarding_invites"("tokenHash");
CREATE INDEX "onboarding_invites_email_idx"     ON "onboarding_invites"("email");
CREATE INDEX "onboarding_invites_expiresAt_idx" ON "onboarding_invites"("expiresAt");

ALTER TABLE "onboarding_invites"
  ADD CONSTRAINT "onboarding_invites_invitedById_fkey"
  FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "onboarding_drafts"
  ADD COLUMN "status"      "OnboardingDraftStatus" NOT NULL DEFAULT 'STARTED',
  ADD COLUMN "invitedById" TEXT,
  ADD COLUMN "invitedAt"   TIMESTAMP(3);

-- A verified draft whose email now has a User row got all the way through.
-- users.email is citext (v3.8.ale) and draft emails are stored lowercased, so
-- the cast is explicit rather than relying on the implicit one.
UPDATE "onboarding_drafts" d
   SET "status" = 'SUBMITTED'
 WHERE d."verifiedAt" IS NOT NULL
   AND EXISTS (SELECT 1 FROM "users" u WHERE LOWER(u."email"::text) = d."email");

-- Verified but never registered: the carrier proved the mailbox and stopped.
UPDATE "onboarding_drafts"
   SET "status" = 'DRAFT_VERIFIED'
 WHERE "verifiedAt" IS NOT NULL
   AND "status" = 'STARTED';

-- Everything else is a self-serve draft that never proved its email, which is
-- what STARTED means, so the default is already correct for those rows.
