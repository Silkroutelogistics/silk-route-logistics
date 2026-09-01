-- Tender lifecycle commit 2b, part 2 of 2 — reclassify historical sibling
-- withdrawals that were recorded as carrier declines.
--
-- Separate file from 20260901020000 because Postgres refuses to USE a new enum
-- value in the transaction that ADDED it. That file added WITHDRAWN; this one
-- is the first that may write it.
--
-- WHAT IS BEING CORRECTED. Before v3.8.aww, accepting a load marked every
-- sibling offer DECLINED — by SRL, on behalf of carriers who had done nothing.
-- Those rows are still on carriers' records and still feed
-- carrierController's tendersDeclined and acceptanceRate, and §9 scores
-- acceptance rate at 10% of Compass. Fixing the writer stops new ones; this
-- fixes the ones already written.
--
-- THE PREDICATE, and its one ambiguity, stated rather than hidden.
--
--   status = DECLINED
--   AND declineReason IS NULL
--   AND a DIFFERENT tender on the same load reached ACCEPTED
--
-- A carrier declining through the portal has set declineReason since v3.8.ajz;
-- the sibling-withdraw writers never set it. So on any load that somebody
-- covered, a DECLINED row with no reason is a withdrawal in all but name.
--
-- The ambiguity: a genuine carrier decline made BEFORE v3.8.ajz also has a null
-- declineReason, because the backend silently dropped the field then. On a load
-- that was later covered, such a row is indistinguishable from a withdrawal and
-- will be converted.
--
-- That is accepted deliberately, and the direction matters. Converting a real
-- decline to a withdrawal REMOVES a mark from a carrier's record; leaving SRL's
-- own mass-withdrawals in place ADDS marks to carriers who did nothing. Between
-- two imperfect classifications of the same ambiguous rows, erring toward the
-- carrier is the defensible one — especially for a signal that feeds a score
-- the carrier is judged and paid on.
--
-- respondedAt is deliberately NOT used as the discriminator, even though it
-- looks sharper. The tenderController sibling writers left it null, but
-- carrierLoads.ts:267 (the load-board accept) SET it, so a respondedAt-based
-- predicate would silently miss every withdrawal from that path.
--
-- statusReason is stamped so the converted rows are self-describing and can be
-- told apart from rows written natively by the new code path (which is also
-- load_covered — intentionally, they are the same event).
--
-- IDEMPOTENT: re-running matches nothing, because the first run leaves no
-- DECLINED rows satisfying the predicate.
--
-- ENVIRONMENT-PORTABLE: a database with no such rows (CI, a fresh container)
-- matches nothing and the statement succeeds having changed nothing.
--
-- ROW-COUNT GATE — RUN THIS AGAINST THE TARGET BEFORE DEPLOYING, and record the
-- number. It is the only chance to know what this changed:
--
--   SELECT count(*) FROM load_tenders t
--   WHERE t.status = 'DECLINED' AND t."declineReason" IS NULL
--     AND EXISTS (SELECT 1 FROM load_tenders s
--                 WHERE s."loadId" = t."loadId" AND s.id <> t.id
--                   AND s.status = 'ACCEPTED');
--
-- Verified on a container seeded with both shapes: converts the sibling
-- withdrawals, leaves genuine declines (declineReason set) untouched, and
-- leaves DECLINED rows on loads nobody ever accepted untouched.

UPDATE "public"."load_tenders" t
SET "status" = 'WITHDRAWN',
    "statusReason" = 'load_covered'
WHERE t."status" = 'DECLINED'
  AND t."declineReason" IS NULL
  AND EXISTS (
    SELECT 1 FROM "public"."load_tenders" s
    WHERE s."loadId" = t."loadId"
      AND s."id" <> t."id"
      AND s."status" = 'ACCEPTED'
  );
