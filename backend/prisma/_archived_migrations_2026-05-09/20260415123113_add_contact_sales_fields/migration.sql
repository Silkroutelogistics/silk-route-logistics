-- v3.6.b — Add sales-role taxonomy, introduced-via provenance, and
-- do-not-contact flag to CustomerContact. Leaves the legacy `role`
-- column untouched (it's currently unused in the CRM frontend).

-- 1. New enum for sales-stage contact roles
CREATE TYPE "ContactSalesRole" AS ENUM (
  'DECISION_MAKER',
  'CHAMPION',
  'GATEKEEPER',
  'TECHNICAL',
  'BILLING',
  'OTHER'
);

-- 2. New columns on customer_contacts
ALTER TABLE "customer_contacts"
  ADD COLUMN "sales_role"      "ContactSalesRole",
  ADD COLUMN "introduced_via"  VARCHAR(120),
  ADD COLUMN "do_not_contact"  BOOLEAN NOT NULL DEFAULT false;

-- 3. Backfill: existing contacts attached to prospect-stage customers
--    get a default provenance of 'Apollo Cold Outreach'.
UPDATE "customer_contacts" cc
SET "introduced_via" = 'Apollo Cold Outreach'
FROM "customers" c
WHERE cc."customerId" = c."id"
  AND cc."introduced_via" IS NULL
  AND c."status" IN ('Prospect', 'Contacted', 'Qualified', 'Proposal');

-- 4. Index for filtering DNC contacts out of outreach queries
CREATE INDEX "customer_contacts_do_not_contact_idx"
  ON "customer_contacts" ("do_not_contact");
