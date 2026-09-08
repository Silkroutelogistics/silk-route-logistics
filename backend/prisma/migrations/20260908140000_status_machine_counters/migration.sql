-- A2 — the Load.status enforcement gate survives a deploy.
--
-- /api/health has reported status_machine.violations_since_boot and
-- unexpected_since_boot since v3.8.ayh. Both are per-process and reset on boot,
-- which the field names state honestly -- and which makes them unable to answer
-- the question the gate actually asks. §13.3 Item 194 sets enforcement on "a
-- FULL DEPLOY CYCLE keeps unexpected_since_boot at zero", and a counter that
-- resets on every deploy cannot express a deploy cycle. The one clean reading
-- recorded on 2026-09-01 was a 2h18m window on a platform with almost no
-- traffic, and Item 194 says so itself: "This is one clean window, not the gate."
--
-- GRAIN IS THE EDGE, NOT THE EVENT. One row per (fromStatus, toStatus) pair with
-- a running count, so the table is bounded by the number of distinct illegal
-- edges rather than by load volume. That also matches what the reconciliation
-- needs: Item 194's resume state says to read the unexpected edges first,
-- because each is either a real defect or a transition nobody documented.
--
-- NO `expected` COLUMN. Whether an edge is accounted for is derived from the
-- AUTO map at read time. A stored flag would freeze what was true when the row
-- was written and then disagree with the map that governs today -- and the whole
-- point of the soak is that reconciling the map is what ends it.
--
-- STRICTLY ADDITIVE. A new table only: no column added to an existing table, no
-- backfill, no drop, nothing changes meaning. Every existing row of every
-- existing table is untouched. The row-count gate for this migration is
-- therefore not "how many rows will change" -- it is "does this table already
-- exist in production", asked before the push.
--
-- Manually authored per CLAUDE.md §2.2.

CREATE TABLE "public"."status_machine_counters" (
    "id" TEXT NOT NULL,
    "fromStatus" "public"."LoadStatus" NOT NULL,
    "toStatus" "public"."LoadStatus" NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "status_machine_counters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "status_machine_counters_fromStatus_toStatus_key"
    ON "public"."status_machine_counters"("fromStatus", "toStatus");

CREATE INDEX "status_machine_counters_lastSeenAt_idx"
    ON "public"."status_machine_counters"("lastSeenAt");
