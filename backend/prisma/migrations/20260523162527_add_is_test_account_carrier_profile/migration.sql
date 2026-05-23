-- v3.8.aim — test-carrier load-assignment fence (Build 1).
--
-- Adds an admin-controlled `isTestAccount` boolean to CarrierProfile so
-- that test/seed carrier records can be retained for ongoing manual
-- regression testing without being eligible for real load assignment.
-- The corresponding read-path exclusions land in this same commit at
-- smartMatchService.matchCarriersForLoad (the canonical picker),
-- carrierController.getAllCarriers (Tender/RC modal picker), and
-- routes/carrier.ts /capacity-feed (dispatch-visible availability
-- stream). Tier 2 analytics + Tier 3 compliance paths intentionally
-- not touched this build per the Phase A audit boundary.
--
-- Additive + default-false: every existing row defaults to false on
-- column add. No backfill needed for the general population.
--
-- Per-row data flip: the three test carriers identified in the
-- read-only classification audit (2026-05-23) are flipped to true in
-- the same migration. Match-by-MC# (stable identifier verified via
-- FMCSA QCMobile lookup) rather than by primary key so the UPDATE is
-- a safe no-op against any environment that doesn't have these MC#s:
--
--   MC-1794414 (DOT 4526880)  C1 SRL Transport LLC — old seed remnant,
--                             SRL's own broker MC# used as test fixture
--                             before Sprint 38 seed fix. User is
--                             explicitly "Decommissioned TestAccount".
--   MC-156588  (DOT 245330)   C2 BISON TRANSPORT INC — Wasi self-test
--                             via rs2649089@gmail.com personal gmail
--                             with name "Wasin Haider" (typo of "Wasi").
--                             Real Canadian carrier DOT used during a
--                             registerCarrier walkthrough; 0 activity.
--   MC-596655  (DOT 1911857)  C3 INTEGRITY EXPRESS LOGISTICS LLC —
--                             ops walkthrough test carrier via
--                             aliabbas6361@gmail.com (also referenced
--                             in Item 174 close as test fixture). Real
--                             US carrier DOT; 3 test loads + 6 tenders
--                             of in-progress test activity.
--
-- The carriers stay at onboardingStatus=APPROVED and deletedAt=null —
-- not hard- or soft-deleted. isTestAccount is the canonical "retained
-- for testing, excluded from real-load surfaces" signal; deletedAt is
-- the separate "no longer a carrier" signal and is not touched here.

ALTER TABLE "public"."carrier_profiles" ADD COLUMN "isTestAccount" BOOLEAN NOT NULL DEFAULT false;

UPDATE "public"."carrier_profiles"
SET "isTestAccount" = true
WHERE "mcNumber" IN ('MC-1794414', 'MC-156588', 'MC-596655');
