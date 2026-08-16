-- v3.8.asb — document numbers, the Quick Pay pilot, and the accessorial
-- uniqueness constraint that closes the KNOWN GAP in lib/detentionLayover.ts.
--
-- Hand-authored per CLAUDE.md §2.2. NOT APPLIED by the authoring session.
-- Additive throughout: every new column is nullable, or NOT NULL with a
-- DEFAULT (the same shape as the 2026-06-24 quickPayEnabled column, which set
-- the house precedent). No column is dropped, renamed, or retyped.
--
-- ONE step in this file is not additive and needs a human eye before it runs:
-- section 6 de-duplicates load_accessorials. It has to, because the unique
-- index cannot build while duplicates exist, and those duplicates ARE the
-- defect — the second row is money the ratified schedule never priced. Read
-- the SELECT in section 6 first.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. New enums
-- ─────────────────────────────────────────────────────────────────────────

CREATE TYPE "public"."QuickPayEnrollmentStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'WITHDRAWN');
CREATE TYPE "public"."QuickPaySpeed" AS ENUM ('STANDARD', 'SEVEN_DAY', 'SAME_DAY');
CREATE TYPE "public"."InvoiceKind" AS ENUM ('BASE', 'SUPPLEMENTAL');

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Load — SRL's own BOL document number, and the per-load Quick Pay speed
--
-- srlBolNumber is deliberately NOT "bolNumber". bolNumber is the SHIPPER's
-- reference for this load; srlBolNumber is the number SRL prints on its own
-- BOL (SRL-121485B). Overloading one column would lose the customer's own
-- reference, which is the thing their AP department searches on.
--
-- quickPaySpeed is stored rather than derived from quickPayFeePercent because
-- derivation is already ambiguous: 3% is both Silver/7-day and
-- Platinum/same-day, tiers move as carriers advance, and LoadQuickPayOverride
-- can put a fee off the ladder entirely.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "public"."loads" ADD COLUMN "srlBolNumber" TEXT;
ALTER TABLE "public"."loads" ADD COLUMN "quickPaySpeed" "public"."QuickPaySpeed";

CREATE UNIQUE INDEX "loads_srlBolNumber_key" ON "public"."loads"("srlBolNumber");

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Invoice — SRL document number, the RC that priced the load, and the
--    supplemental accessorial invoice
--
-- srlDocNumber is a NEW column rather than a repointing of invoiceNumber.
-- invoiceNumber is occupied: lib/invoiceNumber.ts computes the next value by
-- scanning `startsWith: "INV-"` and retries on P2002, and two legacy formats
-- already coexist inside it. Writing SRL-stem values into that column would
-- corrupt the sequence computation.
--
-- The supplemental invoice is a SEPARATE ROW, not a flag: it carries its own
-- document number (…S), its own amount, dueDate, status, reminder ladder and
-- payment, and the base invoice can be PAID while it is still SENT. One row
-- cannot hold two of any of those. loadId was never unique, so multiple
-- invoices per load already fit the model, and LoadAccessorial.shipperInvoiceId
-- already points at a single invoice — so accessorials attach to the
-- supplemental row with no further wiring.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "public"."invoices" ADD COLUMN "srlDocNumber" TEXT;
ALTER TABLE "public"."invoices" ADD COLUMN "rateConfirmationId" TEXT;
ALTER TABLE "public"."invoices" ADD COLUMN "invoiceKind" "public"."InvoiceKind" NOT NULL DEFAULT 'BASE';
ALTER TABLE "public"."invoices" ADD COLUMN "supplementsInvoiceId" TEXT;

CREATE UNIQUE INDEX "invoices_srlDocNumber_key" ON "public"."invoices"("srlDocNumber");
CREATE INDEX "invoices_loadId_invoiceKind_idx" ON "public"."invoices"("loadId", "invoiceKind");
CREATE INDEX "invoices_rateConfirmationId_idx" ON "public"."invoices"("rateConfirmationId");
CREATE INDEX "invoices_supplementsInvoiceId_idx" ON "public"."invoices"("supplementsInvoiceId");

ALTER TABLE "public"."invoices"
  ADD CONSTRAINT "invoices_rateConfirmationId_fkey"
  FOREIGN KEY ("rateConfirmationId") REFERENCES "public"."rate_confirmations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."invoices"
  ADD CONSTRAINT "invoices_supplementsInvoiceId_fkey"
  FOREIGN KEY ("supplementsInvoiceId") REFERENCES "public"."invoices"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. CarrierPay — the carrier-facing per-load settlement document number
--
-- "P" for pay, because "S" belongs to the supplemental invoice and the two
-- must not collide. paymentNumber keeps its internal CP-YYYYMMDD-XXXX
-- sequence, which has writers, a search filter and CSV export columns.
--
-- Settlement is untouched. settlementNumber already exists, is @unique and
-- NOT NULL, and is read at pdfService.ts:2820. Settlement is a per-carrier,
-- per-period rollup spanning many loads, so a per-load stem does not apply to
-- it. Nothing is missing there.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "public"."carrier_pays" ADD COLUMN "srlDocNumber" TEXT;

CREATE UNIQUE INDEX "carrier_pays_srlDocNumber_key" ON "public"."carrier_pays"("srlDocNumber");

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Quick Pay pilot enrolment
--
-- Request-then-approve. A dedicated table rather than columns on
-- carrier_profiles because a carrier can be declined and re-request, or be
-- withdrawn and re-approved; flattened columns would overwrite the previous
-- attempt each time and lose the pilot's own history.
--
-- carrier_profiles.quickPayEnabled is NOT dropped. It is the live read-gate on
-- the money path and its meaning narrows instead: it becomes a cache of
-- "this carrier has an APPROVED enrolment", written only alongside an
-- enrolment transition, in the same transaction.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE "public"."quick_pay_enrollments" (
    "id" TEXT NOT NULL,
    "carrier_profile_id" TEXT NOT NULL,
    "status" "public"."QuickPayEnrollmentStatus" NOT NULL DEFAULT 'PENDING',
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_id" TEXT,
    "review_note" TEXT,
    "withdrawn_at" TIMESTAMP(3),
    "withdrawn_by_id" TEXT,
    "withdrawal_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quick_pay_enrollments_pkey" PRIMARY KEY ("id")
);

-- The AE pending queue: oldest request first.
CREATE INDEX "quick_pay_enrollments_status_requested_at_idx"
  ON "public"."quick_pay_enrollments"("status", "requested_at");
CREATE INDEX "quick_pay_enrollments_carrier_profile_id_status_idx"
  ON "public"."quick_pay_enrollments"("carrier_profile_id", "status");

-- At most ONE live enrolment per carrier. A carrier may accumulate any number
-- of DECLINED and WITHDRAWN rows — that history is the point — but may never
-- hold two simultaneous live ones, so "current standing" is unambiguous
-- without denormalising anything.
--
-- Prisma cannot express the WHERE clause, so this index is hand-authored here
-- and the model carries a comment pointing at it. It is intentionally absent
-- from schema.prisma; `migrate deploy` does not drift-check, and `migrate dev`
-- is forbidden by §2.2 anyway.
CREATE UNIQUE INDEX "quick_pay_enrollment_one_live"
  ON "public"."quick_pay_enrollments"("carrier_profile_id")
  WHERE "status" IN ('PENDING', 'APPROVED');

ALTER TABLE "public"."quick_pay_enrollments"
  ADD CONSTRAINT "quick_pay_enrollments_carrier_profile_id_fkey"
  FOREIGN KEY ("carrier_profile_id") REFERENCES "public"."carrier_profiles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."quick_pay_enrollments"
  ADD CONSTRAINT "quick_pay_enrollments_reviewed_by_id_fkey"
  FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."quick_pay_enrollments"
  ADD CONSTRAINT "quick_pay_enrollments_withdrawn_by_id_fkey"
  FOREIGN KEY ("withdrawn_by_id") REFERENCES "public"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. load_accessorials — the concurrency defect
--
-- applyStopDwellCharges is findFirst-then-create across an await, with five
-- entry points, two of them crons and one an ELD webhook. Nothing in the
-- database stops two rows of the same type on one stop, so a forced interleave
-- writes $1000 on a stop the ratified schedule prices at $500.
--
-- lib/detentionLayover.ts prescribes a PARTIAL index (WHERE stop_id IS NOT
-- NULL) on the assumption that load-level rows, which legitimately repeat with
-- a NULL stop_id, would collide under a plain unique. They do not: Postgres
-- unique indexes treat NULLs as DISTINCT unless NULLS NOT DISTINCT is declared
-- (PG15+ opt-in), and neither Prisma nor this repo declares it anywhere. So the
-- plain composite is equivalent for the NULL case and strictly better twice
-- over — it is expressible in schema.prisma, so there is no drift, and Prisma
-- `upsert` can target it, which is precisely what part 2 of the documented fix
-- needs. The partial index would have forced raw SQL or P2002-catch-and-retry.
--
-- CREATE INDEX CONCURRENTLY is also dropped from the prescription: Prisma wraps
-- each migration in a transaction and CONCURRENTLY cannot run inside one. The
-- table is small at pre-revenue volume; the brief lock is not a concern.
--
-- REVIEW THIS BEFORE RUNNING. Inspect what would be removed first:
--
--   SELECT load_id, stop_id, type, count(*), array_agg(id), array_agg(status)
--   FROM load_accessorials
--   WHERE stop_id IS NOT NULL
--   GROUP BY load_id, stop_id, type
--   HAVING count(*) > 1;
--
-- The de-duplication keeps, per (load_id, stop_id, type): any row a human has
-- decided on (status <> 'PENDING') ahead of an automation row still PENDING,
-- then the earliest created, with id as a deterministic tiebreak. So an
-- APPROVED or REJECTED decision is never discarded in favour of a duplicate
-- automation wrote.

DELETE FROM "public"."load_accessorials"
WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id",
           ROW_NUMBER() OVER (
             PARTITION BY "load_id", "stop_id", "type"
             ORDER BY ("status" = 'PENDING') ASC, "created_at" ASC, "id" ASC
           ) AS rn
    FROM "public"."load_accessorials"
    WHERE "stop_id" IS NOT NULL
  ) ranked
  WHERE rn > 1
);

CREATE UNIQUE INDEX "load_accessorial_stop_type"
  ON "public"."load_accessorials"("load_id", "stop_id", "type");
