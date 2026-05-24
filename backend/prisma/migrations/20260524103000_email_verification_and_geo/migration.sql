-- v3.8.aje Sprint A — Email verification gate + offline IP geolocation.
-- Adds four nullable columns split across two tables:
--
--   users.emailVerifiedAt              — DateTime when carrier clicked
--                                        the verification link sent
--                                        post-registration. Separate
--                                        from the legacy `isVerified`
--                                        bool which today is overloaded
--                                        to mean "AE-approved carrier"
--                                        (set at approval time, not at
--                                        email-confirm time). New field
--                                        is the canonical email-control
--                                        timestamp going forward.
--   users.emailVerifiedFromIp          — raw IP at click time. Not
--                                        hashed (single-use audit
--                                        material; chameleon already
--                                        hashes registration IP for
--                                        cross-reference).
--   users.emailVerifiedFromCountry     — ISO 3166-1 alpha-2 country
--                                        code resolved via geoip-lite
--                                        offline lookup at click time.
--   carrier_profiles.registrationCountry — ISO 3166-1 alpha-2 resolved
--                                        from req.ip at registration
--                                        time. Compared against
--                                        emailVerifiedFromCountry to
--                                        surface country-jump fraud
--                                        signals in the AE drawer.
--
-- All nullable to preserve backward compatibility with pre-aje rows
-- (legacy carriers' emailVerifiedAt stays NULL; the AE drawer shows
-- "not verified" rather than treating absence as a fraud signal).
--
-- No data backfill — existing carriers were AE-approved manually under
-- the legacy flow; we're not retroactively requiring email verification
-- on them. New registrations from this commit onward must verify.
--
-- Manually authored per CLAUDE.md §2.2 (avoid `prisma migrate dev`
-- against prod-pointed DATABASE_URL). Render's `prisma migrate deploy`
-- applies on next push.

ALTER TABLE "public"."users"
  ADD COLUMN "emailVerifiedAt"          TIMESTAMP(3),
  ADD COLUMN "emailVerifiedFromIp"      TEXT,
  ADD COLUMN "emailVerifiedFromCountry" TEXT;

ALTER TABLE "public"."carrier_profiles"
  ADD COLUMN "registrationCountry" TEXT;
