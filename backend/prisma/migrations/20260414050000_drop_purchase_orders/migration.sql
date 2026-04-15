-- v3.5.d — Drop the orphaned Purchase Orders feature (Rule 5 cleanup).
-- The 954-line frontend page was never finished (field name mismatches
-- with the schema caused runtime errors), there was no seed data, and
-- nothing else in the codebase referenced these tables. Load.poNumbers
-- (a string array on the loads table) already covers the PO-reference
-- use case and is unrelated to these tables.

DROP TABLE IF EXISTS "po_load_links" CASCADE;
DROP TABLE IF EXISTS "po_line_items" CASCADE;
DROP TABLE IF EXISTS "purchase_orders" CASCADE;
