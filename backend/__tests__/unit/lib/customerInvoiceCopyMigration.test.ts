// D (ruled 2026-09-28): the migration that moves the four Beekeepers packets from OTHER to
// CUSTOMER_INVOICE_COPY in the same deploy that introduces the type. It is a data write to
// production, so its shape is pinned here: exactly the documents A1 retyped, only while they
// are still OTHER, to the type lib/documentTypes names, one audit row each, nothing else.
// Its behaviour against Postgres is proven separately on a throwaway container (see the
// handoff); this holds the text so a later edit cannot widen what it touches.
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PACKET_DOCUMENTS, TO_TYPE } from "../../../scripts/retype-bkn-packet-documents";
import { RECORDED_BY } from "../../../scripts/_bknTipaltiPlan";
import { SRL_INTERNAL_LOAD_DOC_TYPES } from "../../../src/lib/documentTypes";

const DIR = path.join(__dirname, "../../../prisma/migrations/20260928120000_document_customer_invoice_copy");
const raw = fs.readFileSync(path.join(DIR, "migration.sql"), "utf8");
// Code only: a comment naming a table or an id must not satisfy an assertion about the SQL.
const sql = raw.split(/\r?\n/).map((l) => l.replace(/--.*$/, "")).join("\n");

describe("the customer-invoice-copy migration", () => {
  it("names exactly the four documents A1 retyped, and no other id", () => {
    const ids = [...sql.matchAll(/'(c[a-z0-9]{24})'/g)].map((m) => m[1]);
    expect(ids.filter((id) => id !== RECORDED_BY).sort()).toEqual(PACKET_DOCUMENTS.map((p) => p.documentId).sort());
  });

  it("moves them only while they are still OTHER, the type A1 left them in", () => {
    expect(TO_TYPE).toBe("OTHER");
    expect(sql).toMatch(/AND\s+"docType"\s*=\s*'OTHER'/);
  });

  it("moves them to the type lib/documentTypes names as SRL-internal", () => {
    expect(SRL_INTERNAL_LOAD_DOC_TYPES).toEqual(["CUSTOMER_INVOICE_COPY"]);
    expect(sql).toMatch(/SET\s+"docType"\s*=\s*'CUSTOMER_INVOICE_COPY'/);
  });

  it("writes one audit row per document it moved, performed by the recording user, and nothing else", () => {
    expect(sql).toMatch(/UPDATE\s+"documents"[\s\S]*RETURNING[\s\S]*INSERT INTO "audit_trails"[\s\S]*FROM moved m/);
    expect(sql).toContain(`JOIN "users" u ON u."id" = '${RECORDED_BY}'`);
    const statements = [...sql.matchAll(/\b(UPDATE|INSERT INTO|DELETE|DROP|TRUNCATE|ALTER|CREATE)\b\s+"?(\w+)"?/gi)].map((m) => `${m[1].toUpperCase()} ${m[2]}`);
    expect(statements).toEqual(["UPDATE documents", "INSERT INTO audit_trails"]);
  });
});
