/**
 * Shipment-selecting jobs must ask the load whether it still matters.
 *
 * runPreTracing and runLateDetection select on Shipment.status and never looked
 * at the load. deleteLoad cascades deletedAt to three of Load's thirty-one
 * children and Shipment is not one of them, so a shipment left IN_TRANSIT under
 * a cancelled load kept runLateDetection emailing the broker every 30 minutes —
 * verified against production on 2026-09-02, two BKN shipments still BOOKED and
 * IN_TRANSIT under loads cancelled hours earlier.
 *
 * v3.8.ayv cascades the shipment to CANCELLED at the source. This is the
 * BACKSTOP: a shipment created before that cascade existed would otherwise
 * depend on a one-off data run alone, and these jobs should not assume a cascade
 * has ever run.
 *
 * Structural rather than behavioural on purpose. Both jobs are module-private,
 * registered through withLock inside startSchedulers, so there is no exported
 * function to drive. What is checkable — and what actually regressed — is
 * whether the where-clause carries the filter.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.resolve(__dirname, "../../../src/services/schedulerService.ts");
const src = fs.readFileSync(SRC, "utf8");

/** Strip comments: prose naming the filter must not satisfy a check about code. */
function codeOnly(s: string): string {
  return s.replace(new RegExp("/\\*[\\s\\S]*?\\*/", "g"), "").replace(new RegExp("^[ \\t]*//.*$", "gm"), "");
}
const code = codeOnly(src);

/** The where-clause body of every prisma.shipment.findMany in the file. */
function shipmentSelections(): string[] {
  // Matched across line breaks — this formatter wraps long prisma chains and a
  // single-line pattern silently undercounts (§19 Sub-pattern 18).
  const re = new RegExp("prisma\\s*\\.\\s*shipment\\s*\\.\\s*findMany\\s*\\(\\s*\\{([\\s\\S]*?)\\n\\s*\\}\\s*\\)", "g");
  return [...code.matchAll(re)].map((m) => m[1]);
}

const LOAD_GUARD = 'load: { is: { deletedAt: null, status: { not: "CANCELLED" } } }';

/**
 * Does this load filter exclude cancelled loads?
 *
 * TWO FORMS ARE CORRECT, AND THE PROPERTY IS THE SUBJECT RATHER THAN THE
 * SPELLING. The direct form is `status: { not: "CANCELLED" }`. runPreTracing
 * now uses a derived set instead -- `status: { notIn: PRE_TRACING_SKIP_STATUSES }`
 * -- because that job must ALSO skip loads that have reached the dock, and
 * CANCELLED is pinned by name inside that constant precisely so this backstop
 * survives the derivation. Asserting the literal would have meant weakening a
 * live filter to keep a test green, which is the wrong way round.
 *
 * IT RESOLVES THE IDENTIFIER RATHER THAN TRUSTING IT. A `notIn:` naming a set
 * that does not pin CANCELLED is REFUSED, so this cannot be satisfied by
 * pointing at any set at all -- which is how a widened guard usually goes blind.
 */
function excludesCancelled(flatWhere: string, source: string = code): boolean {
  if (flatWhere.includes('status: { not: "CANCELLED" }')) return true;

  // DELIBERATELY REGEX-FREE. This file is edited by patch scripts, and a
  // backslash eaten on the way in yields a matcher that still compiles and
  // matches nothing — which would report every job guarded, forever, and that
  // failure looks exactly like success. It happened three times while this
  // helper was being written (§19 Sub-pattern 22). indexOf cannot be
  // mis-escaped.
  const MARKER = "status: { notIn: ";
  const at = flatWhere.indexOf(MARKER);
  if (at === -1) return false;
  const rest = flatWhere.slice(at + MARKER.length);
  const cut = rest.indexOf(" ");
  const ident = (cut === -1 ? rest : rest.slice(0, cut)).trim();
  if (!ident) return false;

  // Resolve the identifier in the source rather than trusting its name.
  for (const kw of ["const ", "let ", "var "]) {
    let from = 0;
    for (;;) {
      const d = source.indexOf(kw + ident, from);
      if (d === -1) break;
      from = d + 1;
      // Reject a prefix hit: a lookup for FOO must not be answered by FOOBAR.
      const after = source[d + kw.length + ident.length];
      if (after !== undefined && (after === "_" || after === "$" || /[a-zA-Z0-9]/.test(after))) {
        continue;
      }
      const eq = source.indexOf("=", d);
      if (eq === -1) continue;
      const semi = source.indexOf(";", eq);
      if (semi === -1) continue;
      return source.slice(eq, semi).includes('"CANCELLED"');
    }
  }
  return false;
}

describe("shipment-selecting jobs guard on the load", () => {
  const selections = shipmentSelections();

  it("finds the shipment selections at all (vacuity tripwire)", () => {
    // A regex that stopped matching would report every selection guarded,
    // forever, and that failure looks exactly like success.
    expect(
      selections.length,
      "the shipment-selection scanner matched nothing — it is broken, not the file",
    ).toBeGreaterThanOrEqual(2);
  });

  it("every shipment selection filters on the load", () => {
    const unguarded = selections
      .map((w, i) => ({ i, w: w.replace(/\s+/g, " ").trim() }))
      .filter((x) => !/load:\s*\{\s*is:\s*\{/.test(x.w))
      .map((x) => `selection #${x.i}: ${x.w.slice(0, 110)}`);
    expect(
      unguarded,
      "a shipment selection with no load filter — a cancelled load's shipment would keep firing",
    ).toEqual([]);
  });

  it("the filter excludes BOTH cancelled and soft-deleted loads, not just one", () => {
    // Either alone is insufficient: the two BKN rows were cancelled AND
    // soft-deleted, but a load can be cancelled through the status path without
    // being deleted, and deleteLoad sets both.
    for (const w of selections) {
      const flat = w.replace(/\s+/g, " ");
      expect(flat, "missing deletedAt in the load filter").toContain("deletedAt: null");
      expect(
        excludesCancelled(flat),
        "the load filter no longer excludes cancelled loads -- neither directly nor via a " +
          "notIn set that pins CANCELLED. A shipment under a cancelled load starts firing again.",
      ).toBe(true);
    }
  });

  it("both named jobs carry it", () => {
    for (const fn of ["runPreTracing", "runLateDetection"]) {
      const i = code.indexOf(`function ${fn}`);
      expect(i, `${fn} not found — renamed?`).toBeGreaterThan(-1);
      const body = code.slice(i, i + 2000).replace(/\s+/g, " ");
      expect(body, `${fn} dropped the soft-delete half of the load filter`).toContain(
        "deletedAt: null",
      );
      expect(
        excludesCancelled(body),
        `${fn} dropped the cancelled-load half of the load filter`,
      ).toBe(true);
    }
  });

  it("runLateDetection still selects on IN_TRANSIT — the guard narrows, it does not replace", () => {
    // Without this the suite would pass on a job whose original selection had
    // been gutted and replaced by the load filter alone.
    const i = code.indexOf("function runLateDetection");
    const body = code.slice(i, i + 2000);
    expect(body).toContain('status: "IN_TRANSIT"');
    expect(body).toContain("lastLocationAt");
  });

  it("runPreTracing still selects on BOOKED/DISPATCHED and the pickup window", () => {
    const i = code.indexOf("function runPreTracing");
    const body = code.slice(i, i + 2000);
    expect(body).toContain('"BOOKED", "DISPATCHED"');
    expect(body).toContain("pickupDate");
  });

  it("the cancelled-exclusion check accepts both forms and refuses a set that omits CANCELLED", () => {
    // The widening is the risky part of this guard, so it is fixtured in BOTH
    // directions. Without the negative cases, a check that had quietly started
    // returning true for everything would report every job guarded, forever --
    // and that failure looks exactly like success.
    expect(
      excludesCancelled('load: { is: { deletedAt: null, status: { not: "CANCELLED" } } }'),
      "the direct form must still be accepted",
    ).toBe(true);
    expect(
      excludesCancelled(
        "status: { notIn: SOME_SET }",
        'const SOME_SET: LoadStatus[] = ["CANCELLED", "TONU"];',
      ),
      "a notIn set that pins CANCELLED must be accepted",
    ).toBe(true);
    expect(
      excludesCancelled(
        "status: { notIn: SOME_SET }",
        'const SOME_SET: LoadStatus[] = ["TONU", "DELIVERED"];',
      ),
      "a notIn set that does NOT pin CANCELLED must be refused -- otherwise any set satisfies it",
    ).toBe(false);
    expect(
      excludesCancelled("status: { notIn: NO_SUCH_CONSTANT }"),
      "an unresolvable identifier must be refused, not assumed safe",
    ).toBe(false);
    expect(
      excludesCancelled("load: { is: { deletedAt: null } }"),
      "a filter with no status clause at all must be refused",
    ).toBe(false);
  });
});
