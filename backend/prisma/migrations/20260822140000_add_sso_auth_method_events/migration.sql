-- v3.8.auj — Google Workspace SSO groundwork: googleSub, authMethod, auth_events, staff_sessions.
--
-- Entirely additive. No existing row changes behaviour: authMethod defaults to
-- PASSWORD, which is exactly the login path every account already uses, and
-- googleSub is nullable so no backfill is required.
--
-- CREATE TYPE followed by use in the same transaction is safe. The "unsafe use
-- of new enum value" restriction applies to ALTER TYPE ... ADD VALUE on a
-- PRE-EXISTING type, not to a type created in this same transaction.

-- ── authMethod enum ─────────────────────────────────────────────────────────
CREATE TYPE "AuthMethod" AS ENUM ('PASSWORD', 'SSO_ONLY', 'HYBRID');

-- ── users: SSO identity + allowed auth paths ────────────────────────────────
ALTER TABLE "users" ADD COLUMN "googleSub" TEXT;
ALTER TABLE "users" ADD COLUMN "authMethod" "AuthMethod" NOT NULL DEFAULT 'PASSWORD';

-- Unique so one Google identity can never be bound to two accounts. Postgres
-- unique indexes permit many NULLs, which is what makes this safe while almost
-- every row has no googleSub.
CREATE UNIQUE INDEX "users_googleSub_key" ON "users"("googleSub");

-- ── auth_events: append-only record of every auth OUTCOME ───────────────────
-- userId is nullable on purpose: an unknown Google identity or a wrong-domain
-- attempt never resolves to a User, and those are precisely the events worth
-- keeping. email always carries the asserted identity.
CREATE TABLE "auth_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "userId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "auth_events_type_createdAt_idx" ON "auth_events"("type", "createdAt");
CREATE INDEX "auth_events_email_idx" ON "auth_events"("email");
CREATE INDEX "auth_events_userId_idx" ON "auth_events"("userId");

-- ── staff_sessions: PERSISTED idle clock ────────────────────────────────────
-- The existing idle timeout lives in an in-memory Map that resets on every
-- process restart, so on Render a deploy silently refreshed everyone's idle
-- clock. lastSeenAt is persisted so the 7-day rolling idle survives that.
-- The 30-day hard ceiling is derived from the JWT iat claim instead, so it
-- holds even when no row here exists.
CREATE TABLE "staff_sessions" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rememberMe" BOOLEAN NOT NULL DEFAULT false,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_sessions_tokenHash_key" ON "staff_sessions"("tokenHash");
CREATE INDEX "staff_sessions_userId_idx" ON "staff_sessions"("userId");
CREATE INDEX "staff_sessions_lastSeenAt_idx" ON "staff_sessions"("lastSeenAt");
