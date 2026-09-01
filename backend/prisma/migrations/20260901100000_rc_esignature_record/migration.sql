-- v3.8 commit 11a — the rate confirmation's e-signature record.
--
-- ADDITIVE ONLY. Every column is nullable with no default, so every existing
-- row keeps its current meaning: NULL reads as "issued before there was a
-- signature record", never as "unsigned" or "unhashed but should be". No
-- backfill, because there is nothing true to backfill with — the IP and user
-- agent of a signature taken before this commit were never captured, and
-- inventing them would put a confident-looking value on a guess.
--
-- Rows signed before this commit keep their evidence where it has always been:
-- formData.carrierSignature / carrierSignIP / carrierSignUserAgent. That JSON
-- is not migrated into the columns for the same reason — it would imply the
-- columns were the source when they were not.

ALTER TABLE "rate_confirmations" ADD COLUMN "contentHash" TEXT;
ALTER TABLE "rate_confirmations" ADD COLUMN "signTokenId" TEXT;
ALTER TABLE "rate_confirmations" ADD COLUMN "signTokenHash" TEXT;
ALTER TABLE "rate_confirmations" ADD COLUMN "signTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "rate_confirmations" ADD COLUMN "signTokenUsedAt" TIMESTAMP(3);
ALTER TABLE "rate_confirmations" ADD COLUMN "signerName" TEXT;
ALTER TABLE "rate_confirmations" ADD COLUMN "signerIp" TEXT;
ALTER TABLE "rate_confirmations" ADD COLUMN "signerUserAgent" TEXT;

-- The signing link resolves an RC by its token hash. Without this the lookup is
-- a sequential scan of every rate confirmation ever issued.
CREATE INDEX "rate_confirmations_signTokenHash_idx" ON "rate_confirmations"("signTokenHash");
