-- v3.8.akm §13.3 Item 180.2 — Order templates table.
-- Named + reusable order presets per customer for repeat-lane workflows.
-- formData JSONB carries the same shape as Order.formData so prefill is
-- a direct copy minus the dated fields (pickup/delivery, rate) that AE
-- adjusts per use.
-- CASCADE on customer delete so dropping a customer cleans up their
-- templates without leaving orphaned rows.
-- Unique (customerId, name) so AE can't accidentally create two templates
-- with the same name under one customer.

CREATE TABLE "public"."order_templates" (
    "id"            TEXT NOT NULL,
    "name"          VARCHAR(120) NOT NULL,
    "customer_id"   TEXT NOT NULL,
    "form_data"     JSONB NOT NULL DEFAULT '{}',
    "created_by_id" TEXT,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "order_templates_customer_id_name_key" ON "public"."order_templates"("customer_id", "name");
CREATE INDEX "order_templates_customer_id_idx" ON "public"."order_templates"("customer_id");

ALTER TABLE "public"."order_templates"
    ADD CONSTRAINT "order_templates_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
