-- v3.8.bok (Item 342): the tender a rate confirmation was drafted for.
-- Additive, nullable, no backfill. See schema.prisma RateConfirmation.tenderId.
ALTER TABLE "rate_confirmations" ADD COLUMN "tenderId" TEXT;

CREATE INDEX "rate_confirmations_tenderId_idx" ON "rate_confirmations"("tenderId");
