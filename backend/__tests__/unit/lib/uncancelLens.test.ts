/**
 * The UNCANCEL lens, as a predicate.
 *
 * The DERIVATION is pinned in statusMachineCounters.test.ts, because the gate is
 * unexpected_cumulative and a correct predicate wired in wrongly still leaves the
 * gate wrong. This file pins the predicate itself, including the two structural
 * properties that keep the observer and the durable reader from drifting apart.
 *
 * Adversarial in both directions throughout. A lens that authorised everything and
 * a lens that authorised nothing are both catastrophic, in opposite ways: the first
 * hides a raw CANCELLED -> X write, the second pins the enforcement gate open for
 * an act the platform was built to support.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  UNCANCEL_ACTION_DETAIL,
  UNCANCEL_WINDOW_MS,
  isUncancelEdge,
  authorises,
  authorisedTarget,
  wasAuthorisedUncancel,
  authorisedCountForEdge,
  type AuthorisingRow,
} from "../../../src/lib/uncancelLens";

const AT = new Date("2026-09-25T00:31:58.115Z");

function rowFor(over: Partial<Record<string, unknown>> = {}, at: Date = AT): AuthorisingRow {
  return {
    entityId: "load_1",
    performedById: "user_1",
    performedAt: at,
    changedFields: {
      actionDetail: UNCANCEL_ACTION_DETAIL,
      reason: "Need to issue TONU",
      previous: { status: "CANCELLED" },
      new: { status: "DISPATCHED" },
      actor: { kind: "USER", userId: "user_1", email: "a@b.c" },
      ...over,
    },
  };
}

describe("isUncancelEdge names a cancellation reversal and nothing else", () => {
  it("any CANCELLED -> X is a reversal", () => {
    for (const to of ["BOOKED", "DISPATCHED", "AT_PICKUP", "IN_TRANSIT", "AT_DELIVERY", "TONU"]) {
      expect(isUncancelEdge("CANCELLED", to), `CANCELLED -> ${to}`).toBe(true);
    }
  });

  it("CANCELLED -> CANCELLED is not one", () => {
    // The observer already drops from === to, but the predicate must not depend on
    // its caller having done that.
    expect(isUncancelEdge("CANCELLED", "CANCELLED")).toBe(false);
  });

  it("nothing that starts anywhere else is one", () => {
    expect(isUncancelEdge("BOOKED", "DISPATCHED")).toBe(false);
    expect(isUncancelEdge("DELIVERED", "CANCELLED")).toBe(false);
    expect(isUncancelEdge("TONU", "DISPATCHED")).toBe(false);
  });

  it("is not a fixed target list", () => {
    // The canonical path restores to whatever the snapshot recorded
    // (uncancelPolicy.ts: `restoreTo: snapshot.load.status`), so a target nobody
    // enumerated must still register as a reversal. A target allow-list here would
    // silently stop counting the first time a load was cancelled from an unusual
    // status.
    expect(isUncancelEdge("CANCELLED", "SOME_STATUS_ADDED_LATER")).toBe(true);
  });
});

describe("authorises demands actor AND reason, not merely the marker", () => {
  it("accepts a well-formed row", () => {
    expect(authorises(rowFor())).toBe(true);
  });

  it("refuses a row with the wrong actionDetail", () => {
    expect(authorises(rowFor({ actionDetail: "LOAD_RESTORED" }))).toBe(false);
    expect(authorises(rowFor({ actionDetail: undefined }))).toBe(false);
  });

  it("refuses a row with no reason, or a blank one", () => {
    expect(authorises(rowFor({ reason: null }))).toBe(false);
    expect(authorises(rowFor({ reason: "" }))).toBe(false);
    expect(authorises(rowFor({ reason: "    " })), "whitespace is not a reason").toBe(false);
  });

  it("refuses a row with no actor at all", () => {
    const r = { ...rowFor({ actor: null }), performedById: null };
    expect(authorises(r)).toBe(false);
  });

  it("accepts an actor from EITHER the column or changedFields", () => {
    // They are written together, and a reader should not care which survived a
    // future schema change.
    expect(authorises({ ...rowFor({ actor: null }), performedById: "user_1" })).toBe(true);
    expect(authorises({ ...rowFor(), performedById: null })).toBe(true);
  });

  it("refuses a changedFields that is not an object", () => {
    for (const cf of [null, undefined, "LOAD_UNCANCELLED", 42, ["LOAD_UNCANCELLED"]]) {
      expect(
        authorises({ entityId: "l", performedById: "u", performedAt: AT, changedFields: cf }),
        `changedFields = ${JSON.stringify(cf)}`,
      ).toBe(false);
    }
  });
});

describe("authorisedTarget reads the restored status", () => {
  it("reads changedFields.new.status", () => {
    expect(authorisedTarget(rowFor())).toBe("DISPATCHED");
    expect(authorisedTarget(rowFor({ new: { status: "BOOKED" } }))).toBe("BOOKED");
  });

  it("returns null rather than guessing when it is absent", () => {
    expect(authorisedTarget(rowFor({ new: {} }))).toBeNull();
    expect(authorisedTarget(rowFor({ new: null }))).toBeNull();
    expect(authorisedTarget({ entityId: "l", performedById: "u", performedAt: AT, changedFields: null })).toBeNull();
  });
});

describe("wasAuthorisedUncancel is the strict per-event rule", () => {
  const OBS = new Date("2026-09-25T00:31:58.095Z");

  it("authorises the same load, same target, inside the window", () => {
    expect(wasAuthorisedUncancel([rowFor()], "load_1", "DISPATCHED", OBS)).toBe(true);
  });

  it("refuses a DIFFERENT load", () => {
    // The property the aggregate path cannot check and this one can. A reversal of
    // load A must never authorise a raw write on load B.
    expect(wasAuthorisedUncancel([rowFor()], "load_2", "DISPATCHED", OBS)).toBe(false);
  });

  it("refuses a different target", () => {
    expect(wasAuthorisedUncancel([rowFor()], "load_1", "BOOKED", OBS)).toBe(false);
  });

  it("enforces the window in both directions", () => {
    const early = new Date(OBS.getTime() - (UNCANCEL_WINDOW_MS - 100));
    const late = new Date(OBS.getTime() + (UNCANCEL_WINDOW_MS - 100));
    const tooEarly = new Date(OBS.getTime() - (UNCANCEL_WINDOW_MS + 100));
    const tooLate = new Date(OBS.getTime() + (UNCANCEL_WINDOW_MS + 100));

    expect(wasAuthorisedUncancel([rowFor({}, early)], "load_1", "DISPATCHED", OBS)).toBe(true);
    expect(wasAuthorisedUncancel([rowFor({}, late)], "load_1", "DISPATCHED", OBS)).toBe(true);
    expect(wasAuthorisedUncancel([rowFor({}, tooEarly)], "load_1", "DISPATCHED", OBS)).toBe(false);
    expect(wasAuthorisedUncancel([rowFor({}, tooLate)], "load_1", "DISPATCHED", OBS)).toBe(false);
  });

  it("refuses an empty set", () => {
    expect(wasAuthorisedUncancel([], "load_1", "DISPATCHED", OBS)).toBe(false);
  });
});

describe("authorisedCountForEdge counts within the row's own observed span", () => {
  const FIRST = new Date("2026-09-25T00:31:58.095Z");
  const LAST = new Date("2026-09-25T00:35:00.000Z");

  it("counts a row inside the span", () => {
    expect(authorisedCountForEdge([rowFor({}, FIRST)], "DISPATCHED", FIRST, LAST)).toBe(1);
    expect(authorisedCountForEdge([rowFor({}, LAST)], "DISPATCHED", FIRST, LAST)).toBe(1);
  });

  it("counts a row inside the window PADDING at either end", () => {
    const beforeFirst = new Date(FIRST.getTime() - (UNCANCEL_WINDOW_MS - 1));
    const afterLast = new Date(LAST.getTime() + (UNCANCEL_WINDOW_MS - 1));
    expect(authorisedCountForEdge([rowFor({}, beforeFirst)], "DISPATCHED", FIRST, LAST)).toBe(1);
    expect(authorisedCountForEdge([rowFor({}, afterLast)], "DISPATCHED", FIRST, LAST)).toBe(1);
  });

  it("refuses a row outside the padded span at either end", () => {
    const wayBefore = new Date(FIRST.getTime() - (UNCANCEL_WINDOW_MS + 1));
    const wayAfter = new Date(LAST.getTime() + (UNCANCEL_WINDOW_MS + 1));
    expect(
      authorisedCountForEdge([rowFor({}, wayBefore)], "DISPATCHED", FIRST, LAST),
      "a reversal well before the first observation cannot authorise it",
    ).toBe(0);
    expect(
      authorisedCountForEdge([rowFor({}, wayAfter)], "DISPATCHED", FIRST, LAST),
      "nor one well after the last",
    ).toBe(0);
  });

  it("counts each authorising row once, so two reversals clear two observations", () => {
    const two = [rowFor({}, FIRST), { ...rowFor({}, LAST), entityId: "load_2" }];
    expect(authorisedCountForEdge(two, "DISPATCHED", FIRST, LAST)).toBe(2);
  });

  it("ignores rows for another target and rows that do not authorise", () => {
    const mixed = [
      rowFor({ new: { status: "BOOKED" } }, FIRST),
      rowFor({ reason: null }, FIRST),
      rowFor({ actionDetail: "LOAD_RESTORED" }, FIRST),
    ];
    expect(authorisedCountForEdge(mixed, "DISPATCHED", FIRST, LAST)).toBe(0);
  });
});

// ─── Structural: the two sides cannot drift apart ────────────────────────────
//
// The whole design rests on the observer and the durable reader sharing ONE
// definition. If either re-implemented "is this a reversal" locally, the log tag
// and the gate could disagree about the same edge — which is the drift
// statusMachineCounters' own header calls out as the thing to prevent.
describe("one definition, imported by both sides", () => {
  const SRC = path.join(__dirname, "../../../src");
  const observer = fs.readFileSync(path.join(SRC, "lib/loadTransitionObserver.ts"), "utf8");
  const counters = fs.readFileSync(path.join(SRC, "lib/statusMachineCounters.ts"), "utf8");

  /** Comments stripped: prose naming a symbol must not satisfy a check about code. */
  function codeOnly(s: string): string {
    return s
      .replace(new RegExp("/\\*[\\s\\S]*?\\*/", "g"), "")
      .replace(new RegExp("^[ \\t]*//.*$", "gm"), "");
  }

  it("read real files (vacuity tripwire)", () => {
    // A path that silently stopped resolving would make every assertion below
    // pass over an empty string, and that failure looks exactly like success.
    expect(observer.length, "observer source looks empty — the path is wrong").toBeGreaterThan(2_000);
    expect(counters.length, "counters source looks empty — the path is wrong").toBeGreaterThan(2_000);
    expect(codeOnly(observer)).toContain("observeLoadTransition");
    expect(codeOnly(counters)).toContain("cumulativeStatusMachineCounters");
  });

  it("the observer imports isUncancelEdge rather than re-testing CANCELLED itself", () => {
    const code = codeOnly(observer);
    expect(code, "observer must import the shared predicate").toMatch(
      /import\s*\{[^}]*isUncancelEdge[^}]*\}\s*from\s*"\.\/uncancelLens"/,
    );
    expect(code).toContain("isUncancelEdge(from, to)");
  });

  it("the durable reader imports the same module", () => {
    const code = codeOnly(counters);
    expect(code).toMatch(/from\s*"\.\/uncancelLens"/);
    expect(code).toContain("isUncancelEdge(");
    expect(code).toContain("authorisedCountForEdge(");
  });

  it("the reader subtracts rather than skipping the whole edge", () => {
    // A `continue` on any authorisation would clear an edge carrying BOTH an
    // authorised reversal and a raw write — the case the derivation test proves
    // behaviourally, pinned here structurally so the shape cannot regress to the
    // simpler, wrong version.
    const code = codeOnly(counters);
    expect(code).toMatch(/Math\.max\(0,\s*r\.count\s*-\s*authorisedHere\)/);
  });

  it("nothing in the lens writes", () => {
    // It is a READ. The directive's explicit prohibition is that the counter row
    // must never be written to in order to classify it, and the cheapest way to
    // keep that true is for this module to hold no writer at all.
    const lens = codeOnly(fs.readFileSync(path.join(SRC, "lib/uncancelLens.ts"), "utf8"));
    for (const forbidden of ["upsert", "\.create(", "update(", "updateMany", "delete", "$executeRaw"]) {
      expect(lens.includes(forbidden), `uncancelLens must not contain ${forbidden}`).toBe(false);
    }
  });
});
