# Pending migrations — authored, deliberately not applied

Migrations here are **outside** `prisma/migrations/`, and that placement is the
point.

Render's build chain runs `npx prisma migrate deploy` on every push (CLAUDE.md
§2.2). A migration file dropped into `prisma/migrations/` is therefore not
"pending" in any meaningful sense — it is *scheduled*, and it applies the moment
the next commit deploys. For a `DROP COLUMN` that is irreversible against
production rows.

A pending drop in `prisma/migrations/` would also drift from `schema.prisma`,
which still declares the columns. `migrate deploy` would remove them, the schema
would still expect them, and the next `migrate status` would report drift caused
by our own file.

So: authored here, reviewed here, and moved into `prisma/migrations/` only
together with the matching `schema.prisma` edit, as one deliberate change.

## Contents

| Migration | Source | Gate before applying |
|---|---|---|
| ~~`20260819160000_drop_superseded_carrier_doc_urls`~~ | `docs/audits/orphan-field-triage.md` §C1 | **APPLIED 2026-08-20, gate NOT run.** It was moved into `prisma/migrations/`, rode a push, and Render applied it during the build. §13.3 Item 212. Listed here so the table is a record rather than only a queue. |
| `20260821040000_drop_dead_load_ref_fallbacks` | `docs/audits/read-never-written-triage.md`, carrier-visible tier | Run the row-count query in the file header. Expected 0 and 0. A non-zero count means something wrote the column outside the application and the values are the only copy. |
