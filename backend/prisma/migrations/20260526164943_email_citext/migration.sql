-- v3.8.ale — Email DB-level case-insensitive uniqueness via citext.
--
-- Backs the v3.8.ald findFirst + caseInsensitiveEmailFilter assumption
-- that email uniqueness is case-insensitive (the application-level
-- mode: "insensitive" filter, but with no DB-side constraint enforcing
-- it). Pre-ale: the @unique on `email` was case-sensitive — two
-- concurrent registrations of "Test@x.com" + "test@x.com" could both
-- pass the application-level findFirst check, both insert, and the
-- @unique B-tree (case-sensitive) would accept both as distinct.
--
-- Path β chosen over Path α (UNIQUE INDEX on LOWER(email)) because
-- Prisma's mode: "insensitive" compiles to ILIKE — Postgres planner
-- won't reliably substitute a functional LOWER-based index. citext
-- moves case-insensitivity to the column's equality operator,
-- automatically retrofitting the existing users_email_key UNIQUE
-- INDEX as case-insensitive (operator class shifts text_ops →
-- citext_ops, index rebuilds in-place).
--
-- Pre-migration dedupe scan v3.8.ale Phase A reported CLEAN (0 case-
-- duplicate rows in prod). Safe to apply additively.
--
-- ALTER TABLE ALTER COLUMN TYPE acquires ACCESS EXCLUSIVE briefly to
-- rewrite the column + rebuild the index. At 10 rows this completes
-- in <100ms; not a noticeable lock at pre-revenue scale.

CREATE EXTENSION IF NOT EXISTS citext;

ALTER TABLE users ALTER COLUMN email TYPE citext;
