-- v3.8.awh — DocumentExtraction: what a parser read, kept BESIDE what was typed.
--
-- Additive only. One new table, one unique FK to documents, two indexes. No
-- column on an existing table changes, so no backfill and no existing row moves.
--
-- ON DELETE CASCADE is deliberate: an extraction is a reading OF a document and
-- has no meaning once that document is gone.
CREATE TABLE "public"."DocumentExtraction" (
    "id"               TEXT NOT NULL,
    "documentId"       TEXT NOT NULL,
    "carrierProfileId" TEXT,
    "docType"          TEXT NOT NULL,
    "status"           TEXT NOT NULL,
    "confidence"       TEXT,
    "extracted"        JSONB,
    "discrepancies"    JSONB,
    "error"            TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DocumentExtraction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentExtraction_documentId_key" ON "public"."DocumentExtraction"("documentId");
CREATE INDEX "DocumentExtraction_carrierProfileId_idx" ON "public"."DocumentExtraction"("carrierProfileId");
CREATE INDEX "DocumentExtraction_status_idx" ON "public"."DocumentExtraction"("status");

ALTER TABLE "public"."DocumentExtraction"
  ADD CONSTRAINT "DocumentExtraction_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "public"."documents"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
