-- AlterDatabase: add FuelIndexCache table for weekly EIA diesel-price feed.
-- Feeds the EXISTING FuelSurchargeTable.lookupFuelSurcharge pipeline; does not replace it.
-- One row per EIA region (NATIONAL + PADD1..PADD5 + CA); upsert-by-region keeps the table small.
-- Phase 1 (foundation) per Item 191 / Sprint v3.8.aip — schema + env + region map only;
-- service + cron land in Sprint v3.8.aiq.

CREATE TABLE "public"."fuel_index_cache" (
    "region" TEXT NOT NULL,
    "index_price" DOUBLE PRECISION NOT NULL,
    "index_date" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'EIA_DOE',
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fuel_index_cache_pkey" PRIMARY KEY ("region")
);

-- CreateIndex
CREATE INDEX "fuel_index_cache_expires_at_idx" ON "public"."fuel_index_cache"("expires_at");
