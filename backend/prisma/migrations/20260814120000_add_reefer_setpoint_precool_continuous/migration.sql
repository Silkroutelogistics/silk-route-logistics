-- v3.8.art — reefer setpoint / pre-cool / run mode on Load.
--
-- Order Builder already captures temperatureControlled + tempMin + tempMax, but
-- a driver dials in ONE number, not a range: Schneider prints "Expected Min Temp
-- / Expected Max Temp / Temp Setting" as three separate fields. MoLo carries
-- "Pre-Cool To" as its own column. Run mode is mandated continuous across the
-- reference corpus (Scotlynn prints "Reefer Mode: Continuous Required"), hence
-- the DEFAULT true.
--
-- Fahrenheit throughout — no unit column by design. SRL is a US domestic broker
-- and an unused unit column invites two loads disagreeing.
--
-- Additive and safe on a live DB: two nullable columns plus one boolean carrying
-- a default, so every existing row stays valid with no backfill. Authored by
-- hand per CLAUDE.md §2.2 — backend/.env points at production Neon, so
-- `prisma migrate dev` must not be run here.

ALTER TABLE "public"."loads" ADD COLUMN "tempSetpoint" DOUBLE PRECISION;
ALTER TABLE "public"."loads" ADD COLUMN "preCoolTo" DOUBLE PRECISION;
ALTER TABLE "public"."loads" ADD COLUMN "reeferContinuous" BOOLEAN NOT NULL DEFAULT true;
