/**
 * The delivered file (item 3, ruled 2026-09-26). An invoice records the SHA-256
 * of the exact bytes the customer received (deliveredFileHash) and links the
 * stored copy of those bytes (archivedDocumentId).
 *
 * Each property pinned here has a way of failing that looks like success:
 *   - schema and migration agree. A column in one and not the other either
 *     fails the deploy or leaves the client asking for a column the database
 *     does not have, and tsc sees neither.
 *   - UNIQUE: one stored file is the archive of one invoice.
 *   - RESTRICT: the archive cannot be deleted while an invoice names it.
 *     Cascade would delete the invoice with its file; SetNull would quietly
 *     forget which file was delivered. Both compile.
 *   - both columns stay nullable, with no backfill: an invoice sent before
 *     this existed has no recorded file, and inventing one would put a
 *     confident value on a guess.
 * scripts/_arc-invoice-archive-proof.ts exercises the same properties against
 * a real database.
 */
import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";

const schema = fs.readFileSync(path.resolve(__dirname, "../../../prisma/schema.prisma"), "utf8");
const sql = fs.readFileSync(
  path.resolve(__dirname, "../../../prisma/migrations/20260926140000_invoice_delivery_channel/migration.sql"),
  "utf8",
);

function model(name: string): string {
  const m = schema.match(new RegExp(`\\nmodel ${name} \\{([\\s\\S]*?)\\n\\}`));
  if (!m) throw new Error(`model ${name} not found in schema.prisma`);
  return m[1];
}
// SQL comments are prose: the header names UNIQUE and RESTRICT too.
const statements = sql.replace(/--[^\n]*/g, "");

describe("the invoice's delivered file", () => {
  it("schema: both columns nullable, the link unique, the relation RESTRICT from both sides", () => {
    const invoice = model("Invoice");
    expect(invoice).toMatch(/\n\s+deliveredFileHash\s+String\?\s*\n/);
    expect(invoice).toMatch(/\n\s+archivedDocumentId\s+String\?\s+@unique\s*\n/);
    expect(invoice).toMatch(
      /archivedDocument\s+Document\?\s+@relation\("InvoiceArchivedDocument",\s*fields:\s*\[archivedDocumentId\],\s*references:\s*\[id\],\s*onDelete:\s*Restrict\)/,
    );
    expect(model("Document")).toMatch(/archivedForInvoice\s+Invoice\?\s+@relation\("InvoiceArchivedDocument"\)/);
  });

  it("migration: the same two columns, the unique index and the RESTRICT foreign key", () => {
    expect(statements).toMatch(/ADD COLUMN\s+"deliveredFileHash" TEXT[,;]/);
    expect(statements).toMatch(/ADD COLUMN\s+"archivedDocumentId" TEXT[,;]/);
    expect(statements).toMatch(/CREATE UNIQUE INDEX "invoices_archivedDocumentId_key" ON "invoices"\("archivedDocumentId"\);/);
    expect(statements).toMatch(
      /FOREIGN KEY \("archivedDocumentId"\) REFERENCES "documents"\("id"\) ON DELETE RESTRICT/,
    );
  });

  it("migration: neither column is NOT NULL and nothing is backfilled", () => {
    expect(statements).not.toMatch(/"(deliveredFileHash|archivedDocumentId)"[^,;]*NOT NULL/);
    // Statement-level: "ON UPDATE CASCADE" in the foreign key is not a backfill.
    expect(statements).not.toMatch(/^\s*UPDATE\s/m);
  });
});
