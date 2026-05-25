-- v3.8.ako §13.3 Items 180.6 + 180.7 — Customer revenue-protect fields.
-- defaultAccessorialRates: JSON map of { [accessorialType]: rate } for
-- the Order Builder accessorial picker auto-fill.
-- minMarginPercent: per-customer override of the global 10% margin floor;
-- OrderSidebar surfaces a red alert chip when target cost would produce
-- a margin below this value.
-- Both nullable; existing customers default to null (frontend falls back
-- to manual entry + 10% global floor respectively).

ALTER TABLE "public"."customers"
  ADD COLUMN "default_accessorial_rates" JSONB,
  ADD COLUMN "min_margin_percent"        DOUBLE PRECISION;
