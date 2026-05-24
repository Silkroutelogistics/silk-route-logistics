-- v3.8.aji — InfoRequest file attachments.
-- Extends the Document model with a nullable infoRequestId FK so file
-- uploads landed during the carrier's resolution flow (updated COI,
-- voided check, etc.) can be linked back to the originating request
-- for AE-side display. Documents stay in the carrier's regular doc
-- history (entityType=CARRIER + entityId=carrierProfileId) — the
-- infoRequestId is additional metadata, not a replacement.
--
-- ON DELETE SET NULL on the FK: deleting an InfoRequest doesn't
-- cascade-delete its attachments. Carrier's document history is
-- the source of truth; the FK is an optional thread-linkage.
--
-- Indexed for the AE "list info requests with attachments" query.
--
-- Manually authored per CLAUDE.md §2.2.

ALTER TABLE "public"."documents"
  ADD COLUMN "info_request_id" TEXT;

ALTER TABLE "public"."documents"
  ADD CONSTRAINT "documents_info_request_id_fkey"
  FOREIGN KEY ("info_request_id") REFERENCES "public"."info_requests"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "documents_info_request_id_idx"
  ON "public"."documents"("info_request_id");
