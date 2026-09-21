-- §13.3 Item 282a (v3.8.bdv) — InvoiceLineItem.accessorialId: which ledger row a line bills or credits.
--
-- ADDITIVE. One nullable TEXT column and one index. No foreign key (the line must
-- outlive the row it was billed from), no backfill (a line written before this
-- column existed has no row to point at, and inventing one would be a guess on the
-- one record a dispute reads), no default. Nothing changes meaning for existing rows.
-- The two statements below are `prisma migrate diff` output against a container
-- carrying the full prior chain, not hand-typed — the column name is camelCase and
-- unmapped, so it is quoted exactly as Prisma emits it.

-- AlterTable
ALTER TABLE "invoice_line_items" ADD COLUMN     "accessorialId" TEXT;

-- CreateIndex
CREATE INDEX "invoice_line_items_accessorialId_idx" ON "invoice_line_items"("accessorialId");
