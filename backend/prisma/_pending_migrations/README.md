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
| `20260819160000_drop_superseded_carrier_doc_urls` | `docs/audits/orphan-field-triage.md` §C1 | Run the row-count query in the file header. A non-zero count means the column holds the only pointer to a stored file. |
