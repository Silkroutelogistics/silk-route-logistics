-- Carrier-archive arc B5 (2026-09-21) — RECORD CUSTODY: the seven foreign keys
-- that today CASCADE or SET NULL when a carrier_profiles row is hard-deleted
-- become RESTRICT. A carrier with history cannot be hard-deleted; it is archived
-- (§14 CARRIER ARCHIVE — "Nothing is deleted"). This migration makes the
-- database enforce that sentence rather than the application remembering it.
--
-- AUTHORED, NOT APPLIED. Lives in prisma/_pending_migrations/ on purpose: Render
-- runs `migrate deploy` on every push, so a file in prisma/migrations/ is
-- scheduled, not pending (see ../README.md and §13.3 Item 212). It moves into
-- prisma/migrations/ together with the schema.prisma hunk below, as one change,
-- only after the gate at the bottom has been run against PRODUCTION and read
-- 5 x 'c', 2 x 'n', every orphan count 0.
--
-- WHY SEVEN AND NOT SIX. The directive said six. Both schema.prisma and the live
-- migration SQL were read; there are seven relations onto carrier_profiles whose
-- ON DELETE is destructive. Derived from source, like 291.1's seven pickers.
--
--   CASCADE  load_tenders.carrierId                           load_tenders_carrierId_fkey
--   CASCADE  quick_pay_enrollments.carrier_profile_id         quick_pay_enrollments_carrier_profile_id_fkey
--   CASCADE  quick_pay_elections.carrier_profile_id           quick_pay_elections_carrier_profile_id_fkey
--   CASCADE  carrier_training_requirements.carrierProfileId   carrier_training_requirements_carrierProfileId_fkey
--   CASCADE  info_requests.carrierId                          info_requests_carrierId_fkey
--   SET NULL drivers.carrierProfileId                         drivers_carrierProfileId_fkey
--   SET NULL dock_schedules.carrierId                         dock_schedules_carrierId_fkey
--
-- The other 17 relations onto carrier_profiles are already RESTRICT (Prisma's
-- default for a required relation) and are not touched.
--
-- WHAT CHANGES AT RUNTIME: only `DELETE FROM carrier_profiles`. No row is
-- dropped, no column moves, no backfill. The one production caller that
-- hard-deletes a profile (services/documentChainSelftest.ts cleanup) creates
-- none of the seven child rows and is unaffected; prisma/seed.ts TRUNCATEs;
-- e2e/ never hard-deletes a carrier. ~28 backend/scripts/_*proof.ts cleanups
-- rely on CASCADE and will fail their cleanup on a container built after this
-- applies — dev-only residue, recorded in §13.3 Item 291, not fixed here.
--
-- NO `IF EXISTS`, DELIBERATELY. A constraint name that does not match
-- production FAILS the deploy loudly rather than half-applying (Item 208).
-- That is why the gate below reads the names off production first.
--
-- ==================== GATE — RUN AGAINST PRODUCTION FIRST ====================
-- Read-only. Expected: exactly seven rows, confdeltype 'c' on the five CASCADE
-- names and 'n' on the two SET NULL names, and every orphan count 0. Any other
-- shape (a missing name, an 'a'/'r' where 'c'/'n' is expected, a non-zero
-- orphan) means production differs from the migration history (Item 273.8's
-- class) and this file must be corrected BEFORE it moves. On a LOCAL copy the
-- runner is `npx tsx scripts/_b5-fk-gate.ts --expect pre` (read-only, refuses
-- a non-local host). Against PRODUCTION the two statements are run BY HAND
-- (psql / Neon SQL editor) — outside the rail and a deliberate choice, per §2.2;
-- the runner has no production mode on purpose (see its header).
--
--   SELECT conname, confdeltype
--     FROM pg_constraint
--    WHERE contype = 'f'
--      AND confrelid = 'public.carrier_profiles'::regclass
--      AND conname IN (
--        'load_tenders_carrierId_fkey',
--        'quick_pay_enrollments_carrier_profile_id_fkey',
--        'quick_pay_elections_carrier_profile_id_fkey',
--        'carrier_training_requirements_carrierProfileId_fkey',
--        'info_requests_carrierId_fkey',
--        'drivers_carrierProfileId_fkey',
--        'dock_schedules_carrierId_fkey')
--    ORDER BY conname;
--
--   SELECT 'load_tenders' AS t, count(*) FROM load_tenders c LEFT JOIN carrier_profiles p ON p.id = c."carrierId" WHERE p.id IS NULL
--   UNION ALL SELECT 'quick_pay_enrollments', count(*) FROM quick_pay_enrollments c LEFT JOIN carrier_profiles p ON p.id = c.carrier_profile_id WHERE p.id IS NULL
--   UNION ALL SELECT 'quick_pay_elections', count(*) FROM quick_pay_elections c LEFT JOIN carrier_profiles p ON p.id = c.carrier_profile_id WHERE p.id IS NULL
--   UNION ALL SELECT 'carrier_training_requirements', count(*) FROM carrier_training_requirements c LEFT JOIN carrier_profiles p ON p.id = c."carrierProfileId" WHERE p.id IS NULL
--   UNION ALL SELECT 'info_requests', count(*) FROM info_requests c LEFT JOIN carrier_profiles p ON p.id = c."carrierId" WHERE p.id IS NULL
--   UNION ALL SELECT 'drivers', count(*) FROM drivers c LEFT JOIN carrier_profiles p ON p.id = c."carrierProfileId" WHERE c."carrierProfileId" IS NOT NULL AND p.id IS NULL
--   UNION ALL SELECT 'dock_schedules', count(*) FROM dock_schedules c LEFT JOIN carrier_profiles p ON p.id = c."carrierId" WHERE c."carrierId" IS NOT NULL AND p.id IS NULL;
--
-- ============ COMPANION schema.prisma HUNK (moves with this file) ============
--   LoadTender.carrier                        onDelete: Cascade -> onDelete: Restrict
--   QuickPayEnrollment.carrierProfile         onDelete: Cascade -> onDelete: Restrict
--   QuickPayElection.carrierProfile           onDelete: Cascade -> onDelete: Restrict
--   CarrierTrainingRequirement.carrierProfile onDelete: Cascade -> onDelete: Restrict
--   InfoRequest.carrier                       onDelete: Cascade -> onDelete: Restrict
--   Driver.carrierProfile ("CarrierDrivers")  (default SetNull) -> add onDelete: Restrict
--   DockSchedule.carrier ("DockCarrier")      (default SetNull) -> add onDelete: Restrict
-- Verified 2026-09-21 on a from-zero postgres:16 container: the full 75-migration
-- chain applied clean (`migrate deploy`), then this file via psql (14 ALTERs);
-- `prisma migrate diff --from-url <that container> --to-schema-datamodel <schema
-- with the hunk>` reports "No difference detected", and against the UNMODIFIED
-- schema reports the seven reverse ADDs (the vacuity check). The 14 statements
-- above are byte-for-byte the set Prisma generates for the hunk. A hard delete
-- of a carrier holding a driver is refused (23503) on that container and
-- silently NULLs the driver on a container built from the unmodified schema.

-- DropForeignKey
ALTER TABLE "load_tenders" DROP CONSTRAINT "load_tenders_carrierId_fkey";
-- AddForeignKey
ALTER TABLE "load_tenders" ADD CONSTRAINT "load_tenders_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "carrier_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE "quick_pay_enrollments" DROP CONSTRAINT "quick_pay_enrollments_carrier_profile_id_fkey";
-- AddForeignKey
ALTER TABLE "quick_pay_enrollments" ADD CONSTRAINT "quick_pay_enrollments_carrier_profile_id_fkey" FOREIGN KEY ("carrier_profile_id") REFERENCES "carrier_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE "quick_pay_elections" DROP CONSTRAINT "quick_pay_elections_carrier_profile_id_fkey";
-- AddForeignKey
ALTER TABLE "quick_pay_elections" ADD CONSTRAINT "quick_pay_elections_carrier_profile_id_fkey" FOREIGN KEY ("carrier_profile_id") REFERENCES "carrier_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE "carrier_training_requirements" DROP CONSTRAINT "carrier_training_requirements_carrierProfileId_fkey";
-- AddForeignKey
ALTER TABLE "carrier_training_requirements" ADD CONSTRAINT "carrier_training_requirements_carrierProfileId_fkey" FOREIGN KEY ("carrierProfileId") REFERENCES "carrier_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE "info_requests" DROP CONSTRAINT "info_requests_carrierId_fkey";
-- AddForeignKey
ALTER TABLE "info_requests" ADD CONSTRAINT "info_requests_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "carrier_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE "drivers" DROP CONSTRAINT "drivers_carrierProfileId_fkey";
-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_carrierProfileId_fkey" FOREIGN KEY ("carrierProfileId") REFERENCES "carrier_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE "dock_schedules" DROP CONSTRAINT "dock_schedules_carrierId_fkey";
-- AddForeignKey
ALTER TABLE "dock_schedules" ADD CONSTRAINT "dock_schedules_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "carrier_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
