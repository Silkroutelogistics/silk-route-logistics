-- Ruled 2026-09-28 (D): SRL's copy of its invoice to the customer is its own document type,
-- CUSTOMER_INVOICE_COPY. It is staff only, never paperwork, never the carrier's invoice, and never
-- served to a carrier or a customer (lib/documentTypes SRL_INTERNAL_LOAD_DOC_TYPES).
--
-- On 2026-09-27 the four Beekeepers invoice packets were uploaded through the Documents tab's
-- "Invoice" row as INVOICE, which is the carrier's invoice. At 2026-09-28 00:07Z they were
-- retyped to OTHER to contain them (scripts/retype-bkn-packet-documents.ts, one audit row
-- each). This moves exactly those four, by id and only while they are still OTHER, to the new
-- type, and records one audit row per document moved.
--
-- In any other database the ids do not exist and the migration changes nothing. The audit
-- insert joins the recording user, so it inserts nothing where that user does not exist.
-- Settlement flags are unaffected: neither OTHER nor CUSTOMER_INVOICE_COPY is a settlement type.
WITH moved AS (
  UPDATE "documents"
  SET "docType" = 'CUSTOMER_INVOICE_COPY'
  WHERE "id" IN (
    'cmukgu2lp001gmn2dmh7g7x4a', -- 121492I
    'cmukgrqvz000ymn2dlxg1v8vz', -- 121494I
    'cmukgt5tp0019mn2duyesoq8o', -- 121495I
    'cmukguq75001rmn2d7v6hb1uu'  -- 121496I
  )
  AND "docType" = 'OTHER'
  RETURNING "id", "loadId", "fileName"
)
INSERT INTO "audit_trails" ("id", "entityType", "entityId", "action", "changedFields", "performedById", "ipAddress")
SELECT
  'mig20260928_' || m."id",
  'Document',
  m."id",
  'UPDATE'::"AuditAction",
  jsonb_build_object(
    'actionDetail', 'RETYPE_DOCUMENT',
    'docType', jsonb_build_object('from', 'OTHER', 'to', 'CUSTOMER_INVOICE_COPY'),
    'reason', 'SRL customer invoice copy: its own document type, ruled 2026-09-28',
    'loadId', m."loadId",
    'fileName', m."fileName",
    'source', 'prisma/migrations/20260928120000_document_customer_invoice_copy'
  ),
  u."id",
  'migration'
FROM moved m
JOIN "users" u ON u."id" = 'cmltshz1z0000ccgogcq02shf';
