-- v3.8.awt — convert Load.rateConfirmationPdfUrl to the api-client-relative path.
--
-- Pre-aws the send path wrote `/api/rate-confirmations/{id}/pdf`, a ROOT-RELATIVE
-- path. The carrier portal rendered it into an href, and the portal is served
-- from silkroutelogistics.ai while the API is api.silkroutelogistics.ai — so the
-- browser resolved it against the Pages host and got the Next.js 404 page where
-- the PDF belonged. Two carrier pages, three link sites, one stored value.
--
-- The writer now stores the path the api client consumes (no host, no `/api`).
-- This converts the rows written before that change.
--
-- DATA-ONLY. No schema change, nothing dropped, nothing nullable made non-null.
--
-- IDEMPOTENT AND NARROW. The LIKE guard matches only the pre-aws shape, so
-- re-running is a no-op and a row already in the new shape is never touched.
-- substring(... from 5) removes exactly the 4-character `/api` prefix;
-- `/api/rate-confirmations/x/pdf` -> `/rate-confirmations/x/pdf`.
--
-- Environment-portable: a database with no such rows (CI, a fresh container)
-- matches nothing and the statement succeeds having changed nothing.
--
-- Row count at authoring time, read from production 2026-08-31: 20 loads exist,
-- 1 carries a rateConfirmationPdfUrl, and that 1 is the pre-aws shape. This
-- statement is expected to update exactly that row.
UPDATE "public"."loads"
SET "rateConfirmationPdfUrl" = substring("rateConfirmationPdfUrl" FROM 5)
WHERE "rateConfirmationPdfUrl" LIKE '/api/rate-confirmations/%';
