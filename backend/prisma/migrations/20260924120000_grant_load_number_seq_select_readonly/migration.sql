-- v3.8.biq -- let srl_readonly read load_number_seq.
--
-- GRANT-ONLY. No schema change, nothing created, altered or dropped. Prisma's
-- model has no concept of a grant, so schema.prisma is untouched and no drift
-- follows. (Precedent for raw-only migrations: 20260526164943_email_citext,
-- 20260901000000_rc_pdf_url_api_relative.)
--
-- WHY. §13.3 Item 303.2 recorded that srl_readonly's default ACL is scoped to
-- objtype 'r' -- tables -- and that sequences are "not covered at all
-- (irrelevant to a SELECT-only census)". On 2026-09-24 it became relevant:
-- `SELECT last_value, is_called FROM load_number_seq` returned 42501 for that
-- role, so a census could not answer which range the load number series was
-- issuing from. The question was instead answered from pg_sequences
-- .start_value, which is the CREATE-time value and is NOT changed by ALTER
-- SEQUENCE ... RESTART -- so it could not distinguish "never restarted" from
-- "restarted to 5001", and the reading published from it was wrong. Settling
-- it took the owner credential. This closes that for THIS sequence.
--
-- DELIBERATELY NARROW. The general fix is ALTER DEFAULT PRIVILEGES ... GRANT
-- SELECT ON SEQUENCES, which would cover every sequence created hereafter.
-- That is a wider change to a role's standing grants and is not this commit's
-- to make; Item 303.2 keeps it.
--
-- WHY IT IS GUARDED RATHER THAN BARE. This migration must be a no-op on a
-- database that has neither the role nor the sequence, and both cases are
-- ordinary here:
--   * srl_readonly is a production role. It does not exist on a local
--     container, and CI builds its database with `prisma db push`, which
--     ignores this directory entirely.
--   * load_number_seq is created LAZILY by generateLoadNumber at the first
--     load creation, so a freshly migrated database does not have it yet.
-- A bare GRANT would ERROR on either, and a failed migration blocks every
-- later one in the chain -- including on the from-empty `migrate deploy` runs
-- this repo uses as proofs. Guarded, it applies in production and is silently
-- correct everywhere else. Re-running it is free.
--
-- NOT DURABLE ACROSS A DROP. generateLoadNumber's `CREATE SEQUENCE IF NOT
-- EXISTS` will not re-grant. If load_number_seq is ever dropped and recreated,
-- this grant goes with it and health reports the read as unknown -- which is
-- the honest answer, not a silent one.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'srl_readonly')
     AND EXISTS (SELECT 1 FROM pg_class WHERE relname = 'load_number_seq' AND relkind = 'S')
  THEN
    EXECUTE 'GRANT SELECT ON SEQUENCE load_number_seq TO srl_readonly';
  END IF;
END
$$;
