-- Phase 3 v3.7.a — pre-migration backup of CarrierProfile rows at tier=BRONZE
-- Generated 2026-04-19T02:34:48.423Z
-- Restore: (a) re-add BRONZE to the CarrierTier enum, then (b) run:
--   BEGIN;
--   UPDATE carrier_profiles SET tier='BRONZE' WHERE id IN ('cmmtzjp79000tcr1t39bhbdqp');
--   COMMIT;
-- The rows themselves are NOT deleted — only their tier changed to SILVER.

-- id=cmmtzjp79000tcr1t39bhbdqp  userId=cmmtzjp79000scr1t79uayzpr  mc=MC-156588  company="-"
