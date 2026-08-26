-- Arc 34 — one session record for all four portals.
--
-- ADDITIVE. No column dropped, no row deleted, no table renamed. The table keeps
-- the name staff_sessions even though it now holds carrier, shipper and driver
-- sessions too: a rename would read better and would conflict with the
-- concurrent session's commits against `staffSession`. The name is the smaller
-- cost, and `portal` is the discriminator that makes it honest.
--
-- The six existing rows are all SSO staff logins, so the AE default describes
-- them correctly and no backfill statement is needed. Verified by census before
-- this was written: 6 rows, zero sign-ins in 7 days.

CREATE TYPE "SessionPortal" AS ENUM ('AE', 'CARRIER', 'SHIPPER', 'DRIVER');

ALTER TABLE "staff_sessions"
  ADD COLUMN "portal" "SessionPortal" NOT NULL DEFAULT 'AE';

CREATE INDEX "staff_sessions_portal_idx" ON "staff_sessions"("portal");
