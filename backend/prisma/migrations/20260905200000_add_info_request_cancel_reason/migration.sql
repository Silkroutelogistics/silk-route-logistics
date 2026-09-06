-- G1 — a system cancel reason on info_requests.
--
-- When a carrier transitions to APPROVED, REJECTED or SUSPENDED, every OPEN
-- info request on that carrier is now closed in the same transaction. Without
-- this column the row would record only that it stopped, not why — and an AE
-- looking at a CANCELLED request could not tell "I withdrew this" from "the
-- status change closed it".
--
-- A SECOND column rather than a reuse of resolvedNote. That field is the
-- CARRIER writing their answer; this is SRL writing its own reason. Same
-- distinction the tender arc drew between declineReason and statusReason, and
-- for the same reason: merging two authors into one column makes the two
-- indistinguishable exactly where somebody needs to tell them apart.
--
-- ADDITIVE AND NULLABLE. Every existing row keeps NULL, which is honest: those
-- were cancelled by a human through the AE thread, and inventing a reason for
-- them would be manufacturing a record. No backfill.
--
-- Manually authored per CLAUDE.md §2.2.

ALTER TABLE "public"."info_requests"
  ADD COLUMN "cancelReason" TEXT;
