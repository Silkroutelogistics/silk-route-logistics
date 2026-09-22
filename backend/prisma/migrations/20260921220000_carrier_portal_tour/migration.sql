-- v3.8.bei — one-time carrier welcome tour. Additive, nullable, NO backfill:
-- NULL means "not yet shown", so every approved carrier sees the tour once on
-- their next portal visit. Stamped by POST /carrier-auth/portal-tour/complete.
ALTER TABLE "carrier_profiles" ADD COLUMN "portalTourCompletedAt" TIMESTAMP(3);
