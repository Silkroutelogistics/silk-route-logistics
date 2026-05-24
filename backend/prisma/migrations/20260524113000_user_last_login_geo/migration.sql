-- v3.8.ajf Sprint 3 — Unusual-activity dual-channel OTP.
-- Adds two nullable columns to users for last-login geo tracking:
--
--   users.lastLoginIp       — raw IP at the last successful login. Set
--                              inside the OTP-verify (and TOTP-verify)
--                              handlers after JWT issuance, so it
--                              reflects "last successfully completed
--                              login" rather than "last attempt".
--   users.lastLoginCountry  — ISO 3166-1 alpha-2 resolved via geoip-lite
--                              offline lookup. Compared against the
--                              current login's resolved country at OTP
--                              creation time — when they differ, the
--                              login is classified "unusual" and the
--                              OTP is sent via BOTH email AND SMS
--                              (via OpenPhone) instead of email only.
--
-- Both nullable. Pre-ajf rows (existing carriers + admins) have no
-- last-login geo recorded; their FIRST login post-deploy populates
-- the fields, and from that point forward the country-comparison gate
-- is live for that user. First-login behavior is "no comparison data"
-- → not unusual → email-only OTP. This is intentional — we don't want
-- to flag every existing user as "unusual" the day this ships.
--
-- Manually authored per CLAUDE.md §2.2. Render's `prisma migrate
-- deploy` applies on next push.

ALTER TABLE "public"."users"
  ADD COLUMN "lastLoginIp"      TEXT,
  ADD COLUMN "lastLoginCountry" TEXT;
