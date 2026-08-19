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

-- ─────────────────────────────────────────────────────────────────────────────
-- Added 2026-08-19 (Arc 6 Phase 4/5): LoadAccessorial.carrierInvoiceId.
--
-- Its sibling shipperInvoiceId is load-bearing — invoiceService calls it "the
-- not-yet-billed marker", unbilledCustomerAccessorials selects on it being
-- null, and voiding an invoice clears it. carrierInvoiceId has no reader and no
-- writer.
--
-- CORROBORATION, which is why this is a deletion rather than a gap to fill:
--
--   git log -S "carrierInvoiceId" --all -- backend/src   ->   NO COMMITS.
--
-- The column has never been referenced in application code at any point in the
-- repository's history. It was introduced by a Track & Trace commit (49d0da79)
-- as one half of a designed pair and the half was never built.
--
-- It is not needed. The carrier leg reaches exactly-once a DIFFERENT way, and
-- that way is complete: syncCarrierPayAccessorials compares the ledger total
-- against CarrierPay.accessorialsTotal and acts on the delta — re-pricing in
-- place while the settlement is open, escalating a separate payment once it is
-- committed. That is reconciliation by total, not by row marking. Adding a
-- per-row marker would introduce a SECOND source of truth for "has this been
-- paid", which is the dual-status class this codebase has repeatedly had to
-- unpick (dual suspension columns, dual onboarding status).
--
-- Same gate as above: no code reference does not prove no stored value.
--
--   SELECT count(*) FROM load_accessorials WHERE "carrierInvoiceId" IS NOT NULL;

ALTER TABLE "public"."load_accessorials" DROP COLUMN IF EXISTS "carrierInvoiceId";
