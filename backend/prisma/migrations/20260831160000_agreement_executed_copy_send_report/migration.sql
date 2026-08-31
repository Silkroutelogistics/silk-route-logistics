-- v3.8.awn — the executed copy is emailed at execution, and the row says whether
-- it actually went.
--
-- ADDITIVE, nullable, no backfill. Every agreement executed before this commit
-- had no executed copy emailed, and `executedCopySent` NULL says exactly that —
-- distinct from `false`, which will mean "we tried and it failed" once the error
-- column is populated. Defaulting to false would assert a failed send that never
-- happened.
--
-- WHY NOT REUSE `sentAt`. It already exists on this table and means something
-- else: carrierVettingController writes it when an AE sends the agreement OUT
-- FOR SIGNATURE (status SENT). "Sent for signature" and "executed copy
-- delivered" are different events at opposite ends of the same lifecycle, and
-- one column cannot answer both without the reader having to know which flow
-- produced the row.

ALTER TABLE "public"."carrier_agreements" ADD COLUMN "executedCopySent" BOOLEAN;
ALTER TABLE "public"."carrier_agreements" ADD COLUMN "executedCopySentAt" TIMESTAMP(3);
ALTER TABLE "public"."carrier_agreements" ADD COLUMN "executedCopySendError" TEXT;
