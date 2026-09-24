/**
 * §21.2 ruling 6 — WHAT A SEARCH BOX DOES WITH A DOCUMENT NUMBER.
 *
 * Exact document number first, then the legacy SRL- form of the same term, then
 * substring matches after. One definition, because the alternative is what this
 * codebase keeps having to unpick: five search boxes, five hand-written OR
 * blocks, and no two agreeing on which columns a number can live in. The invoice
 * box already searched srlDocNumber and the load board did not, so the same
 * number pasted into two screens found it in one of them.
 *
 * WHY ORDER MATTERS ENOUGH TO COST A SECOND QUERY. Under the bare scheme a load
 * number is a short run of digits, so "5001" is a substring of 50010, 15001 and
 * every accessorial number hanging off them. A single substring OR therefore
 * buries the row the AE actually pasted somewhere in a list of near-misses,
 * ordered by whatever the table's default sort happens to be. The exact pass is
 * what puts the load they asked for at the top.
 *
 * THE LEGACY PASS IS A CONVENIENCE, NOT A FALLBACK. An AE reading SRL-121485 off
 * a printed document types the part that varies — 121485 — and the prefix is
 * noise they skip. Trying "SRL-" + term as its own exact pass means that works
 * without making the exact pass fuzzy, which would defeat the point of it.
 */

import { legacySearchForm } from "./documentNumber";

/** `load.referenceNumber` -> `{ load: { referenceNumber: <match> } }` */
function nest(path: string, match: Record<string, unknown>): Record<string, unknown> {
  const parts = path.split(".");
  let out: Record<string, unknown> = match;
  for (let i = parts.length - 1; i >= 0; i--) out = { [parts[i]]: out };
  return out;
}

export interface DocumentSearchFields {
  /**
   * Columns holding an ISSUED number — a load number, a document number, an
   * invoice number. These are matched exactly first and by substring last.
   */
  numberFields: string[];
  /**
   * Columns that are only ever matched by substring: a city, a commodity, a
   * carrier's company name. Matching these exactly would be noise — nobody
   * pastes a city name expecting an exact-match ranking.
   */
  textFields?: string[];
}

export interface DocumentSearchPasses {
  /** Exact on any number column, including the legacy SRL- form. Small by nature. */
  exact: Record<string, unknown> | null;
  /** Substring across number and text columns. This is the old behaviour. */
  substring: Record<string, unknown> | null;
}

/**
 * Build the ordered passes for a search term.
 *
 * Returns nulls rather than empty ORs for a blank term: `{ OR: [] }` matches
 * NOTHING in Prisma, so a caller that spread it into an existing where would
 * silently return zero rows for an empty search box rather than the unfiltered
 * list. A null says "no clause" and cannot be mistaken for "match nothing".
 */
export function buildDocumentSearch(
  rawTerm: string | null | undefined,
  fields: DocumentSearchFields,
): DocumentSearchPasses {
  const term = String(rawTerm ?? "").trim();
  if (!term) return { exact: null, substring: null };

  const { numberFields, textFields = [] } = fields;
  const insensitive = { mode: "insensitive" as const };

  // Pass 1 + 2 collapse into one clause deliberately. They are both exact, so
  // ordering BETWEEN them buys nothing an AE can perceive: a term cannot be both
  // an issued bare number and an issued SRL- number on two different rows often
  // enough to be worth a third round trip. What matters is that exact beats
  // substring, and that is the split below.
  const exactTerms = [term];
  const legacy = legacySearchForm(term);
  if (legacy) exactTerms.push(legacy);

  const exactOr = numberFields.flatMap((f) =>
    exactTerms.map((t) => nest(f, { equals: t, ...insensitive })),
  );
  const substringOr = [...numberFields, ...textFields].map((f) =>
    nest(f, { contains: term, ...insensitive }),
  );

  return {
    exact: exactOr.length ? { OR: exactOr } : null,
    substring: substringOr.length ? { OR: substringOr } : null,
  };
}

/**
 * The substring pass with the exact hits removed, so a row cannot appear twice
 * in one result list. Prisma has no "except" so this is an explicit id filter;
 * callers pass the ids the exact pass returned.
 */
export function excludingIds(
  clause: Record<string, unknown> | null,
  ids: string[],
): Record<string, unknown> | null {
  if (!clause) return null;
  if (!ids.length) return clause;
  return { AND: [clause, { id: { notIn: ids } }] };
}

/**
 * Run the two passes and return one page spanning both.
 *
 * Extracted after the second caller, not the first, and before the third: three
 * hand-written copies of this arithmetic is how two search boxes come to
 * disagree about whether page 2 repeats a row, and that is the failure this
 * whole scheme exists to stop being possible.
 *
 * The exact pass is fetched WHOLE and sliced in memory rather than offset in
 * SQL. It matches issued numbers, so it is bounded by nature — a term cannot be
 * more than a handful of them — and slicing is what lets a page straddle the
 * boundary between the two passes without a third query to find out where that
 * boundary is.
 *
 * With no search term both clauses are null, the exact query is skipped, and
 * this costs exactly the findMany + count a caller made before it existed.
 */
export async function runRankedSearch<T extends { id: string }>(opts: {
  exact: Record<string, unknown> | null;
  substring: Record<string, unknown> | null;
  /** Filters that apply to BOTH passes — status, date range, ownership. */
  baseWhere: Record<string, unknown>;
  skip: number;
  take: number;
  findMany: (where: Record<string, unknown>, skip: number, take: number) => Promise<T[]>;
  /**
   * Optional, because not every caller reports a total. A board that fetches a
   * bounded set and returns all of it has no page count to compute, and making
   * it pay for a COUNT query it never reads would be a real cost on an endpoint
   * that already does a heavy include. When it is absent `total` comes back
   * null rather than 0, so a caller cannot mistake "not counted" for "none".
   */
  count?: (where: Record<string, unknown>) => Promise<number>;
  /**
   * A backstop, not a page size. Past it the substring pass carries the rest,
   * so a pathological term degrades to the old behaviour instead of loading an
   * unbounded exact set into memory.
   */
  exactCap?: number;
}): Promise<{ rows: T[]; total: number | null }> {
  const { exact, substring, baseWhere, skip, take, findMany, count, exactCap = 50 } = opts;

  const exactHits = exact ? await findMany({ ...baseWhere, ...exact }, 0, exactCap) : [];
  const restClause = excludingIds(substring, exactHits.map((r) => r.id));
  const restWhere = restClause ? { ...baseWhere, ...restClause } : baseWhere;

  const head = exactHits.slice(Math.min(skip, exactHits.length), Math.min(skip + take, exactHits.length));
  const remaining = take - head.length;
  const restSkip = Math.max(0, skip - exactHits.length);

  const [restRows, restTotal] = await Promise.all([
    remaining > 0 ? findMany(restWhere, restSkip, remaining) : Promise.resolve([] as T[]),
    count ? count(restWhere) : Promise.resolve(null),
  ]);

  return {
    rows: [...head, ...restRows],
    total: restTotal === null ? null : exactHits.length + restTotal,
  };
}
