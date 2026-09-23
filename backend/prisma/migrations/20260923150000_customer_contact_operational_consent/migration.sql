-- Operational-mail consent on a customer contact.
--
-- WHY. Until now "who gets pickup / transit / delivery / milestone / delay mail"
-- was answered by `isPrimary OR receives_tracking_link`. Being the primary
-- CONTACT is not consent to be MAILED, and the tracking tag governs a different
-- artifact entirely -- so an AE who turned the tracking tag off, expecting the
-- mail to stop, changed nothing. That fired in production on 2026-09-23: ten
-- operational emails reached logistics@beekeepersnaturals.com for SRL-121494, a
-- load whose tracking link had never been sent.
--
-- ADDITIVE AND FAIL-CLOSED. NOT NULL DEFAULT false backfills every existing row
-- to false in the same statement, so no separate UPDATE is needed and no
-- contact is opted in by accident. The deliberate consequence, measured on
-- production 2026-09-23: 13 contacts exist, 8 of them primary and 0 carrying
-- the tracking tag, so customer operational mail goes to ZERO recipients on
-- deploy until an AE ticks the new box. That is the ruling (R1), not a defect.
--
-- Nothing is dropped and no existing column changes meaning.
ALTER TABLE "public"."customer_contacts"
  ADD COLUMN "receives_operational_updates" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "customer_contacts_receives_operational_updates_idx"
  ON "public"."customer_contacts"("receives_operational_updates");
