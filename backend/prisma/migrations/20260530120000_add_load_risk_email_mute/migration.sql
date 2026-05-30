-- v3.8.ali §13.3 Item 192 — per-load risk-email kill switch.
-- AE can silence the external risk-alert email on a specific load they
-- are actively handling. In-app notification + RiskLog are unaffected
-- (email-only mute). Permanent toggle; audit fields capture who/when.
-- Manual-authored per §2.2 (avoid prisma migrate dev against
-- prod-pointed DATABASE_URL). All three columns additive + nullable
-- (or defaulted) so the migration is a safe no-lock-risk ALTER at
-- pre-revenue load volume.

ALTER TABLE "public"."loads"
  ADD COLUMN "riskEmailMuted"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "riskEmailMutedAt"   TIMESTAMP(3),
  ADD COLUMN "riskEmailMutedById" TEXT;
