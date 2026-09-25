-- C1 — Load.status observation moves from the Prisma client to the database.
--
-- WHY. The observer hung off the `$allOperations` client extension, so it saw
-- only writes that went through the shared Prisma client. A script building its
-- own `new PrismaClient()` was invisible to the enforcement gate BY
-- CONSTRUCTION. SRL-121496 demonstrated it on 2026-09-24/25: reversed twice,
-- once by an untracked own-client script (audit row written, no counter row) and
-- once by the canonical endpoint (counter row written). Same act; counted or not
-- purely by which client wrote it. Three smaller blind spots went with it —
-- `take: 25` truncating a large updateMany, `$executeRaw`, and the
-- `{ status: { set: "X" } }` form.
--
-- A trigger has none of them. It fires on the row, inside the transaction, for
-- every writer including psql.
--
-- ADDITIVE AND REVERSIBLE. Creates one table and one trigger; touches no
-- existing column and no existing row. Dropping the trigger restores the prior
-- behaviour exactly, minus the rows already logged.

-- CreateTable
CREATE TABLE "public"."load_status_transitions" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "load_id" TEXT NOT NULL,
    "from_status" "public"."LoadStatus" NOT NULL,
    "to_status" "public"."LoadStatus" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "txid" VARCHAR(32) NOT NULL,

    CONSTRAINT "load_status_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "load_status_transitions_occurred_at_idx" ON "public"."load_status_transitions"("occurred_at");

-- CreateIndex
CREATE INDEX "load_status_transitions_load_id_occurred_at_idx" ON "public"."load_status_transitions"("load_id", "occurred_at");

-- The writer.
--
-- NO FOREIGN KEY on load_id, deliberately. A transition log records that
-- something happened; if the load is later hard-deleted the fact that it moved
-- through those states is exactly what an investigation still needs. A CASCADE
-- would erase the evidence with the subject, and a RESTRICT would make the log
-- prevent deletions it has no business preventing. This is the same reasoning
-- load_activity.tender_id uses ON DELETE SET NULL for, taken one step further
-- because there is no column here worth nulling.
CREATE OR REPLACE FUNCTION "public".log_load_status_transition() RETURNS trigger AS $$
BEGIN
  -- `AFTER UPDATE OF status` fires whenever status appears in the SET list, even
  -- when the value is unchanged — an idempotent re-write of the same status is
  -- common on these paths. IS DISTINCT FROM is null-safe; a plain <> would let a
  -- NULL on either side swallow the comparison and log nothing.
  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    INSERT INTO "public"."load_status_transitions"
      ("load_id", "from_status", "to_status", "occurred_at", "txid")
    VALUES
      (NEW."id", OLD."status", NEW."status", CURRENT_TIMESTAMP, txid_current()::text);
  END IF;
  -- AFTER ... FOR EACH ROW ignores the return value; NULL is the convention.
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- `OF status` narrows the trigger to statements that actually name the column,
-- so the ordinary load UPDATE that touches only a rate or a date does not pay
-- for a function call.
CREATE TRIGGER "load_status_transition_log"
AFTER UPDATE OF "status" ON "public"."loads"
FOR EACH ROW
EXECUTE FUNCTION "public".log_load_status_transition();

-- The read-only census role must be able to read the new table, or every census
-- written after this migration fails on it. ALTER DEFAULT PRIVILEGES already
-- covers tables created by neondb_owner (§13.3 Item 303.2 measured this and
-- corrected the instruction that said otherwise), so this GRANT is belt and
-- braces for environments where that default was never set — it is a no-op
-- where it was.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'srl_readonly') THEN
    GRANT SELECT ON "public"."load_status_transitions" TO "srl_readonly";
  END IF;
END
$$;
