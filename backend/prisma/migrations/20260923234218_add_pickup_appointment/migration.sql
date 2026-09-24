-- ADD pickupAppointment, AND MOVE THE ONE EXISTING APPOINTMENT TO THE DELIVERY SIDE.
--
-- WHY. There was no pickup-appointment column. The pickup block carried a
-- release number, the delivery block carried an appointment, and a single
-- generic `appointmentNumber` sat further down the model with no side at all.
-- The AE form offered exactly ONE unqualified "Appt #" box. So an AE holding a
-- pickup appointment and a delivery appointment could record one of them, and
-- nothing anywhere recorded which one it was.
--
-- WHY EXISTING VALUES GO TO DELIVERY. The Track & Trace panel rendered
-- `appointmentNumber` inside its Destination section, labelled "Appt #". That is
-- the only place the platform ever told a human which side the number belonged
-- to, so it is the only defensible reading of what is already stored.
--
-- `appointmentNumber` IS NOT CLEARED. It keeps its value. Nulling it would
-- destroy the only copy of data whose side we are inferring rather than knowing,
-- and the inference above is a reading of a UI label, not a fact the AE
-- confirmed. Retiring the column is a separate decision with its own evidence.
--
-- ROW-COUNT GATE — RUN AGAINST PRODUCTION BEFORE THIS DEPLOYS (§13.3 Item 212:
-- a gate run after the write answers a question that is no longer answerable):
--
--   SELECT COUNT(*) FILTER (WHERE "appointmentNumber" IS NOT NULL)   AS will_move,
--          COUNT(*) FILTER (WHERE "deliveryAppointment" IS NOT NULL) AS already_set,
--          COUNT(*) FILTER (WHERE "appointmentNumber" IS NOT NULL
--                            AND  "deliveryAppointment" IS NOT NULL) AS would_skip
--   FROM loads WHERE "deletedAt" IS NULL;
--
-- Measured read-only on 2026-09-23 as srl_readonly: will_move 2, already_set 0,
-- would_skip 0. The two are SRL-121497 (15160360) and SRL-121493 (15163586).
-- If will_move has grown, that is expected — more loads created since. If
-- already_set is non-zero, STOP: something began writing deliveryAppointment
-- after this was authored and the WHERE below is no longer the whole story.

-- AlterTable
ALTER TABLE "loads" ADD COLUMN     "pickupAppointment" TEXT;

-- Move the single recorded appointment to the side the UI has been calling it.
-- Idempotent: the IS NULL guard means a re-run moves nothing, and a value an AE
-- has since corrected on the delivery side is never overwritten.
UPDATE "loads"
   SET "deliveryAppointment" = "appointmentNumber"
 WHERE "appointmentNumber" IS NOT NULL
   AND "deliveryAppointment" IS NULL;
