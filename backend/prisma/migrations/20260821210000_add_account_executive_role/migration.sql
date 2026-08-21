-- v3.8.aue — add ACCOUNT_EXECUTIVE to the UserRole enum.
--
-- Additive and non-destructive: no row is written, no default changes, no
-- column is altered. Nothing holds the value when this lands (role assignment
-- is a separate task), so there is no backfill and no data-loss surface.
--
-- Postgres note: ALTER TYPE ... ADD VALUE is permitted inside a transaction
-- block from PG12 onward, PROVIDED the new value is not USED in that same
-- transaction. Prisma wraps each migration in a transaction, and this file
-- only adds the label, so it is safe. Do NOT add an UPDATE that writes
-- 'ACCOUNT_EXECUTIVE' to this file — that would fail with
-- "unsafe use of new value of enum type".
--
-- Appended at the end of the enum deliberately, so it matches the ordering
-- Prisma's own `migrate diff` would emit and no BEFORE/AFTER clause is needed.
--
-- The counterpart AE value is NOT dropped here. Postgres cannot DROP an enum
-- value without recreating the type; that is a separate housekeeping task.

ALTER TYPE "UserRole" ADD VALUE 'ACCOUNT_EXECUTIVE';
