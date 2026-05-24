-- v3.8.aja Sprint E — BCA click-wrap audit trail.
-- Adds 4 nullable columns to capture the legal evidence required to
-- defend the Step 4 click-through agreement against later challenge:
--   * bcaAgreedAt           — server-side timestamp when the carrier
--                              submitted with agreeTerms=true
--   * bcaAgreedFromIp        — source IP from req.ip (Render forwards
--                              x-forwarded-for via app.set('trust proxy'))
--   * bcaAgreedFromUserAgent — full UA string from req.headers
--   * bcaVersion             — content version identifier of the BCA
--                              text that was shown at agreement time;
--                              lets us correlate signature to specific
--                              click-wrap revision if terms change later
--
-- Per CLAUDE.md §14 + §16: improves interim click-through
-- enforceability. Does NOT close the §16 first-carrier blocker which
-- requires standalone executable BCA + Michigan attorney review +
-- e-signature integration.
--
-- All nullable to preserve backward compatibility with pre-aja carriers
-- (whose rows will simply have NULLs for these fields).
--
-- Manually authored per §2.2 (avoid `prisma migrate dev` against
-- prod-pointed DATABASE_URL). Render's `prisma migrate deploy` applies
-- on next push.

ALTER TABLE "public"."carrier_profiles"
  ADD COLUMN "bcaAgreedAt"            TIMESTAMP(3),
  ADD COLUMN "bcaAgreedFromIp"        TEXT,
  ADD COLUMN "bcaAgreedFromUserAgent" TEXT,
  ADD COLUMN "bcaVersion"             TEXT;
