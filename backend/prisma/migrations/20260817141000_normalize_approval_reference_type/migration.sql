-- Normalise ApprovalQueue.referenceType so escalations can actually be resolved.
--
-- Hand-authored per CLAUDE.md §2.2. Data-only: no column added, dropped or
-- retyped, nothing deleted. Idempotent — re-running changes nothing.
--
-- WHY. referenceType is a free-form String and it drifted into two spellings.
-- Twelve writers wrote "CarrierPay"; every reader compared against "CARRIER_PAY".
-- The comparison silently failed, referenceData resolved null, and the review
-- screen could not action the row.
--
-- The row that matters most is the accessorial shortfall escalation: raised when
-- an accessorial is approved after a settlement has already been committed, it is
-- the one mechanism in the system that records a carrier is still owed money. It
-- was written under the spelling nothing reads.
--
-- Rows already in the table keep the old spelling until this runs, so the code
-- change alone would have fixed only new escalations and left the existing
-- backlog permanently unresolvable. Both halves are needed.
--
-- lib/approvalQueueRefs.ts still accepts the legacy spellings on read, so this
-- migration and that fallback are belt and braces: neither depends on the other.

-- NOTE ON THE COLUMN NAME. ApprovalQueue.referenceType carries no @map, so the
-- physical column is camelCase and must be quoted. The model does use @@map for
-- the table ("approval_queue"), which is the mismatch that makes this easy to get
-- wrong — the first draft of this file assumed snake_case for both and would have
-- failed the deploy with "column reference_type does not exist".

UPDATE "public"."approval_queue"
   SET "referenceType" = 'CARRIER_PAY'
 WHERE "referenceType" IN ('CarrierPay', 'carrierPay');

UPDATE "public"."approval_queue"
   SET "referenceType" = 'INVOICE'
 WHERE "referenceType" IN ('Invoice', 'invoice');
