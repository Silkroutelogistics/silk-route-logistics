-- v3.8.axo — when this tender last MOVED, as opposed to when the row last changed.
--
-- Nullable with no backfill, deliberately. A historical tender genuinely has no
-- recorded moment of transition, and back-dating one from createdAt would put a
-- confident-looking timestamp on a guess — which is worse than a null, because a
-- null reads as "not recorded" and a guess does not.
--
-- Every SLA in the lifecycle asks this question: an RC out longer than
-- RC_SIGN_SLA_HOURS, a release inside the last day, an offer near expiry. It is
-- written only by the transition service, so it means the same thing everywhere.
ALTER TABLE "public"."load_tenders" ADD COLUMN "statusChangedAt" TIMESTAMP(3);

CREATE INDEX "load_tenders_status_statusChangedAt_idx"
  ON "public"."load_tenders"("status", "statusChangedAt");
