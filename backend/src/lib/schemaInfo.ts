// What SCHEMA is production actually on?
//
// WHY THIS EXISTS. On 2026-08-20 a column-drop migration reached production and
// `/api/health` reported `sha: 994994b0` — the commit BEFORE it — at the moment
// the columns were already gone. That reading was not a bug in the SHA; it was
// correct about the process and silent about the database.
//
// Render's build chain runs `prisma migrate deploy` during the BUILD, while the
// previous process keeps serving. So there is a window, one build long, in which
// the schema has already changed and every runtime signal still describes the
// old deploy. Anyone using the app to decide whether a migration landed is wrong
// for exactly that window — which is when it matters most, because that is when
// someone is watching to see whether their migration went out.
//
// The SHA answered "what code is running". This answers "what schema is it
// running against", from the only source that actually knows: the
// `_prisma_migrations` ledger Prisma itself writes.
//
// CACHED PER PROCESS, not per request. A migration cannot apply to a running
// process — `migrate deploy` runs at build time and the process restarts after —
// so within one process lifetime the answer is fixed. Caching keeps /health from
// putting a query on the database every time a load balancer polls it, and the
// value is still correct because a new migration implies a new process.
//
// NEVER THROWS. /health must keep answering when the database is unreachable;
// that is most of its job. A failure here reports null rather than degrading the
// endpoint that exists to tell you the endpoint is degraded.

import { prisma } from "../config/database";

export interface SchemaInfo {
  /** Name of the most recently applied migration, or null if unknown. */
  migration: string | null;
  /** When it was applied, ISO, or null. */
  appliedAt: string | null;
}

let cached: SchemaInfo | null = null;

export async function schemaInfo(): Promise<SchemaInfo> {
  if (cached) return cached;

  try {
    // Raw, because _prisma_migrations is Prisma's own bookkeeping table and is
    // deliberately absent from the generated client.
    const rows = await prisma.$queryRawUnsafe<Array<{ migration_name: string; finished_at: Date | null }>>(
      `SELECT migration_name, finished_at
         FROM _prisma_migrations
        WHERE finished_at IS NOT NULL
          AND rolled_back_at IS NULL
        ORDER BY finished_at DESC
        LIMIT 1;`,
    );

    const row = rows?.[0];
    cached = {
      migration: row?.migration_name ?? null,
      appliedAt: row?.finished_at ? new Date(row.finished_at).toISOString() : null,
    };
    return cached;
  } catch {
    // Not cached on failure: a transient database problem should not pin "null"
    // for the life of the process when the next call could answer properly.
    return { migration: null, appliedAt: null };
  }
}
