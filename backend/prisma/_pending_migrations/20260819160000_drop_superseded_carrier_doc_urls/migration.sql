-- AUTHORED, NOT APPLIED. §2.2-pending — do not run without an explicit decision.
--
-- Pass 2 orphan-field triage (docs/audits/orphan-field-triage.md, section C1)
-- found three CarrierProfile columns with zero references anywhere in
-- backend/src or frontend/src, superseded by a mechanism that is unambiguously
-- live: carrier documents are stored as Document rows keyed by docType
-- (W9 / COI / AUTHORITY) with a companion *Uploaded boolean on CarrierProfile.
-- See carrierController.ts:352-354 for that mapping.
--
-- These three are the single-URL shape that predates it. Nothing writes them,
-- so nothing reads a value from them either — but "no code references it" is not
-- the same as "the column is empty", and this repo has production rows. Before
-- applying, confirm on the live database:
--
--   SELECT count(*) FILTER (WHERE "w9Url" IS NOT NULL)             AS w9,
--          count(*) FILTER (WHERE "coiUrl" IS NOT NULL)            AS coi,
--          count(*) FILTER (WHERE "authorityLetterUrl" IS NOT NULL) AS authority
--   FROM carrier_profiles;
--
-- A non-zero count means a historical URL exists that the Document table does
-- not carry, and dropping it destroys the only pointer to that file. In that
-- case backfill Document rows first, or leave the columns alone — they cost
-- nothing where they sit.
--
-- Batched deliberately: one migration for the whole triage, so a decision to
-- clean up is a single reviewable change rather than a drip of column drops.

ALTER TABLE "public"."carrier_profiles" DROP COLUMN IF EXISTS "w9Url";
ALTER TABLE "public"."carrier_profiles" DROP COLUMN IF EXISTS "coiUrl";
ALTER TABLE "public"."carrier_profiles" DROP COLUMN IF EXISTS "authorityLetterUrl";
