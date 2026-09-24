-- v3.8.biu -- the before-image the un-cancel replays.
--
-- ADDITIVE ONLY. One nullable column, no default, no backfill.
--
-- WHY. Most of the cancel cascade is recoverable today only because it HAPPENS
-- to be reconstructible from audit rows, and one row already is not: the
-- shipment sync overwrites Shipment.status in place and records no prior value,
-- so the inverse would have to guess it. A snapshot makes the un-cancel a replay
-- rather than a reconstruction, and means a column added to the cascade later is
-- not silently unrecoverable.
--
-- EVERY KEY IS WRITTEN, EVEN WHEN EMPTY. An absent key must mean "this cancel
-- predates the snapshot", never "there was nothing to record" -- otherwise the
-- un-cancel cannot tell a load it can restore from one it can only guess at. It
-- refuses the absent case by name.
--
-- NO BACKFILL, DELIBERATELY. The loads already CANCELLED in production have no
-- before-image and no way to derive one. They stay unrestorable.

ALTER TABLE "loads" ADD COLUMN "cancellationSnapshot" JSONB;
