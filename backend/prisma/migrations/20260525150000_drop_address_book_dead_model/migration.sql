-- v3.8.akr — §13.3 Item 8.5 close: drop AddressBook dead model.
-- Phase A audit confirmed zero consumers (frontend/src/ + backend/src/services/
-- both returned empty grep). CustomerFacility (via FacilityPicker) is the active
-- canonical address primitive. Indexes drop automatically via CASCADE on table drop.

DROP TABLE IF EXISTS "public"."address_book" CASCADE;
