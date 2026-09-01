-- v3.8.axo — the two states between "the carrier has it" and "the terms are executed".
--
-- Its own migration because Postgres refuses to USE a new enum value in the
-- transaction that ADDED it. Learned the hard way in 20260901020000 and again
-- in 20260901050000.
--
-- Nothing writes these yet, deliberately and briefly: the derived-status
-- selector and the Load Board / Track & Trace partition are written against the
-- full ratified set in this commit, so the commit that adds the writers is
-- purely additive rather than a rewrite of the queries.
ALTER TYPE "public"."TenderStatus" ADD VALUE IF NOT EXISTS 'RC_SENT' AFTER 'DECLINED';
ALTER TYPE "public"."TenderStatus" ADD VALUE IF NOT EXISTS 'CONFIRMED' AFTER 'RC_SENT';
