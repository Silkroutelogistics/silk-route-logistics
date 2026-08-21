-- PENDING, NOT SCHEDULED. This file sits under _pending_migrations/ on purpose.
-- Render runs `migrate deploy` on every push, so anything under
-- prisma/migrations/ is SCHEDULED, not pending.
--
-- It was going to be a hold/ branch, per §2.2. It is here instead because a
-- CONCURRENT SESSION was editing prisma/schema.prisma while this arc ran
-- (ACCOUNT_EXECUTIVE role work, same v3.8.aud letter). Producing a branch would
-- have meant committing my schema edit over their uncommitted one. Racing a
-- live editor in a shared file to save an hour is how somebody's work gets
-- destroyed, and this drop was always going to be held anyway.
--
-- TO RELEASE: once the concurrent schema work has landed, remove the fleet
-- models, the four enums, and the Load/Driver columns below from schema.prisma
-- on a hold/retire-fleet-module branch, move this file into prisma/migrations/,
-- and apply the release conditions stated below.
--
-- HELD. Do not merge this branch until BOTH conditions below are met.
--
-- Arc 23 retired the fleet module from the application: the /dashboard/fleet
-- page, its routes and controller, driver<->equipment assignment, the VIN
-- verification service and its Compass check, and the seed blocks. This
-- migration removes what that left behind in the schema.
--
-- WHY THESE COLUMNS AND TABLES:
--   SRL is a pure broker. §5 forbids ever claiming "our fleet" / "our trucks".
--   `trucks` and `trailers` carried NO owner column at all — not a carrier, not
--   SRL — and the only two things that ever created a row were the fleet
--   module's own POST and the seed. They modelled an asset-carrier operation
--   SRL will never run. `Load.truckId` / `Load.trailerId` are FKs into those
--   tables and were never written by anything. The three `Driver.assigned*`
--   columns include the stranded field banked at §13.3 Item 228.4.
--   The four enums are used by these two tables and nothing else.
--
-- RELEASE CONDITIONS — BOTH, not either:
--   1. v3.8.aud (the application-side retirement) is deployed and has soaked.
--      Nothing may reference these tables when this runs.
--   2. RENDER_DEPLOY_HOOK_URL exists so CI gates the deploy. Until it does,
--      Render auto-deploys on push and merging this branch would apply the
--      drop the moment it lands rather than when somebody decided it should.
--      This is Item 212's lesson: a commit held back by POSITION is not held
--      back. That is why this is a branch and not the tip of main.
--
-- DO NOT MERGE WITH hold/retire-load-rate. They answer to different release
-- conditions, and merging couples two unrelated decisions so that reverting
-- either reverts both. They share only condition 2.
--
-- ROW-COUNT GATE — RUN THIS AGAINST PRODUCTION BEFORE MERGING, and read the
-- answer rather than assuming it. Identifiers are quoted because these columns
-- are camelCase in Postgres with no @map; unquoted names would ERROR rather
-- than answer, and the tempting fix when a gate errors is to drop the gate.
--
--   SELECT
--     (SELECT COUNT(*) FROM "trucks")                                    AS trucks,
--     (SELECT COUNT(*) FROM "trailers")                                  AS trailers,
--     (SELECT COUNT(*) FROM "loads"   WHERE "truckId"   IS NOT NULL)     AS loads_with_truck,
--     (SELECT COUNT(*) FROM "loads"   WHERE "trailerId" IS NOT NULL)     AS loads_with_trailer,
--     (SELECT COUNT(*) FROM "drivers" WHERE "assignedTruckId"     IS NOT NULL) AS drv_truck,
--     (SELECT COUNT(*) FROM "drivers" WHERE "assignedTrailerId"   IS NOT NULL) AS drv_trailer,
--     (SELECT COUNT(*) FROM "drivers" WHERE "assignedEquipmentId" IS NOT NULL) AS drv_equip;
--
--   Expected: trucks/trailers may hold seeded rows; every other count 0,
--   because no writer for those columns has ever existed. A NON-ZERO in any
--   of the last five means something wrote them after this was authored —
--   stop and find out what before dropping.
--
-- No IF EXISTS anywhere below: a wrong name must FAIL the deploy, not silently
-- match nothing and leave the schema and the database disagreeing.

ALTER TABLE "loads" DROP CONSTRAINT IF EXISTS "loads_truckId_fkey";
ALTER TABLE "loads" DROP CONSTRAINT IF EXISTS "loads_trailerId_fkey";
ALTER TABLE "drivers" DROP CONSTRAINT IF EXISTS "drivers_assignedTruckId_fkey";
ALTER TABLE "drivers" DROP CONSTRAINT IF EXISTS "drivers_assignedTrailerId_fkey";

ALTER TABLE "loads" DROP COLUMN "truckId";
ALTER TABLE "loads" DROP COLUMN "trailerId";

ALTER TABLE "drivers" DROP COLUMN "assignedTruckId";
ALTER TABLE "drivers" DROP COLUMN "assignedTrailerId";
-- assignedEquipmentId is NOT dropped: it FKs to Equipment, a separate LIVE
-- model with its own controller, and equipmentController reads the back-relation
-- from the Equipment side. Arc 22 read it as stranded because the field NAME
-- appears nowhere in src — the relation is consumed from the other end, which
-- is a limitation of that scan, not evidence of deadness.

DROP TABLE "trailers";
DROP TABLE "trucks";

DROP TYPE "TruckType";
DROP TYPE "TrailerType";
DROP TYPE "OwnershipType";
DROP TYPE "AssetStatus";
