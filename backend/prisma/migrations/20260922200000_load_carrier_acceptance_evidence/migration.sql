-- Acceptance evidence on a load: WHO accepted it, by WHAT act, and WHEN.
--
-- WHY A COLUMN AND NOT AN INFERENCE FROM STATUS. `Load.status` reaching
-- DISPATCHED is not evidence that a carrier accepted anything. Three SRL-side
-- paths reach DISPATCHED with no carrier act at all -- finalize
-- (rateConfirmationController), the waterfall on-behalf accept, and
-- PATCH /loads/:id/status -- and none of them is a defect; they simply stamp
-- nothing. A status column can also be moved again afterwards, so reading
-- acceptance out of it answers "where is this load now", not "did the carrier
-- ever agree to haul it". Those are different questions and a dispute asks the
-- second one.
--
-- carrier_accepted_carrier_id is stored even though it must equal carrier_id at
-- stamp time, because it is EVIDENCE rather than a pointer. A later release or
-- reassignment moves carrier_id; the record of who accepted must not move with
-- it.
--
-- ADDITIVE AND NULLABLE, NO BACKFILL, ON PURPOSE -- the bfy shape. A load
-- dispatched before this existed has no recorded acceptance, and inventing one
-- now would manufacture an execution record for an act nobody observed, on rows
-- a dispute could turn on. NULL is the true answer for those loads. It is also
-- unreconstructable: the paths that would have stamped are not distinguishable
-- after the fact from the ones that must not (R8c), which is the whole reason
-- the column exists.
--
-- NO INDEX. Nothing queries by these yet; the BOL gate (C4b) reads them on a
-- load it has already loaded by primary key. An index added now would be an
-- index nobody uses.
ALTER TABLE "public"."loads" ADD COLUMN "carrier_accepted_at" TIMESTAMP(3);
ALTER TABLE "public"."loads" ADD COLUMN "carrier_accepted_via" VARCHAR(32);
ALTER TABLE "public"."loads" ADD COLUMN "carrier_accepted_by_user_id" TEXT;
ALTER TABLE "public"."loads" ADD COLUMN "carrier_accepted_carrier_id" TEXT;
