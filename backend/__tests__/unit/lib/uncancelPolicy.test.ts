/**
 * The un-cancel guards. Six of the seven ratified adversarial cases live here,
 * because six of them are refusals and a refusal is a pure function of facts.
 *
 * The seventh -- "the restored load has the SAME tracking link" -- is not a
 * refusal and cannot be asserted here; it belongs to the restore, which writes.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO is build its facts from a helper that
 * shares the policy's own idea of a valid snapshot. The fixture below is a
 * literal with every key spelled out, so "the policy requires ten keys" is
 * checked against a hand-written object rather than against a builder that
 * would agree with the code by construction.
 */
import { describe, it, expect } from "vitest";
import {
  assessUncancel,
  UNCANCEL_WINDOW_HOURS,
  type UncancelFacts,
} from "../../../src/lib/uncancelPolicy";

const CANCELLED_AT = new Date("2026-09-20T09:00:00.000Z");
const WITHIN = new Date("2026-09-22T08:00:00.000Z"); // 71h later
const BEFORE_CANCEL = new Date("2026-09-18T09:00:00.000Z"); // 2 days before the cancel
const AFTER_CANCEL = new Date("2026-09-20T10:00:00.000Z"); // 1h after the cancel

/** Every required key, spelled out. */
function snapshot(over: Record<string, unknown> = {}) {
  return {
    version: 1,
    takenAt: CANCELLED_AT.toISOString(),
    load: { status: "DISPATCHED", softDeleted: false },
    shipments: [{ id: "s1", status: "IN_TRANSIT" }],
    trackingTokenRevoked: true,
    shipperTrackingTokens: [{ id: "t1", expiresAt: "2026-12-01T00:00:00.000Z" }],
    rateConfirmations: [{ id: "rc1", status: "SENT" }],
    tenders: [{ id: "tn1", status: "ACCEPTED", deletedAt: null }],
    shipperCredit: null,
    carrierPays: [],
    ...over,
  };
}

function facts(over: Partial<UncancelFacts> = {}): UncancelFacts {
  return {
    load: { status: "CANCELLED", cancelledAt: CANCELLED_AT, cancellationSnapshot: snapshot() },
    actorRole: "ADMIN",
    now: WITHIN,
    tonuAccessorialCount: 0,
    tenders: [{ id: "tn1", status: "WITHDRAWN", createdAt: BEFORE_CANCEL, statusChangedAt: null }],
    ...over,
  };
}

describe("the happy path", () => {
  it("allows an ADMIN inside the window and says what to restore to", () => {
    const v = assessUncancel(facts());
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.restoreTo).toBe("DISPATCHED");
    expect(v.unhide).toBe(false);
  });

  it("CEO too", () => {
    expect(assessUncancel(facts({ actorRole: "CEO" })).ok).toBe(true);
  });

  it("carries unhide when the cancel also hid the load", () => {
    const v = assessUncancel(
      facts({
        load: {
          status: "CANCELLED",
          cancelledAt: CANCELLED_AT,
          cancellationSnapshot: snapshot({ load: { status: "BOOKED", softDeleted: true } }),
        },
      }),
    );
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.unhide).toBe(true);
    expect(v.restoreTo).toBe("BOOKED");
  });
});

describe("adversarial case 1 — the 72-hour window", () => {
  it("allows the last minute inside it", () => {
    const t = new Date(CANCELLED_AT.getTime() + UNCANCEL_WINDOW_HOURS * 3_600_000 - 60_000);
    expect(assessUncancel(facts({ now: t })).ok).toBe(true);
  });

  it("refuses at 72h + 1 minute", () => {
    const t = new Date(CANCELLED_AT.getTime() + UNCANCEL_WINDOW_HOURS * 3_600_000 + 60_000);
    const v = assessUncancel(facts({ now: t }));
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.code).toBe("UNCANCEL_WINDOW_EXPIRED");
    expect(v.message).toContain(String(UNCANCEL_WINDOW_HOURS));
  });

  it("measures from the snapshot when the column is null", () => {
    // A load cancelled before cancelledAt was populated still has a takenAt,
    // and the two are written in the same act.
    const t = new Date(CANCELLED_AT.getTime() + 100 * 3_600_000);
    const v = assessUncancel(facts({ now: t, load: { status: "CANCELLED", cancelledAt: null, cancellationSnapshot: snapshot() } }));
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.code).toBe("UNCANCEL_WINDOW_EXPIRED");
  });

  it("refuses rather than guessing when no cancel time exists at all", () => {
    const v = assessUncancel(
      facts({
        load: {
          status: "CANCELLED",
          cancelledAt: null,
          cancellationSnapshot: snapshot({ takenAt: "not-a-date" }),
        },
      }),
    );
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.code).toBe("UNCANCEL_WINDOW_UNKNOWN");
  });
});

describe("adversarial case 2 — a billed TONU", () => {
  it("refuses", () => {
    const v = assessUncancel(facts({ tonuAccessorialCount: 1 }));
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.code).toBe("TONU_BILLED");
  });
});

describe("adversarial case 3 — role", () => {
  it.each(["AE", "BROKER", "OPERATIONS", "DISPATCH", "ACCOUNTING", "CARRIER", "SHIPPER"])(
    "refuses %s",
    (role) => {
      const v = assessUncancel(facts({ actorRole: role }));
      expect(v.ok).toBe(false);
      if (v.ok) return;
      expect(v.code).toBe("UNCANCEL_ROLE_FORBIDDEN");
    },
  );

  it("is checked before anything else, so a wrong role learns nothing about the load", () => {
    // An AE asking about a load that is not cancelled, has no snapshot and is
    // out of window still gets exactly one answer: not your call.
    const v = assessUncancel(
      facts({
        actorRole: "AE",
        now: new Date("2027-01-01T00:00:00.000Z"),
        load: { status: "DELIVERED", cancelledAt: null, cancellationSnapshot: null },
      }),
    );
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.code).toBe("UNCANCEL_ROLE_FORBIDDEN");
  });
});

describe("adversarial case 7 — a cancel that predates the snapshot", () => {
  it("refuses, and never guesses", () => {
    const v = assessUncancel(
      facts({ load: { status: "CANCELLED", cancelledAt: CANCELLED_AT, cancellationSnapshot: null } }),
    );
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.code).toBe("NO_SNAPSHOT");
    expect(v.message, "the refusal has to tell an AE what to do instead").toMatch(/by hand|re-create/i);
  });

  it.each([
    "version", "takenAt", "load", "shipments", "trackingTokenRevoked",
    "shipperTrackingTokens", "rateConfirmations", "tenders", "shipperCredit", "carrierPays",
  ])("refuses when %s is absent, and names it", (key) => {
    const s = snapshot();
    delete (s as Record<string, unknown>)[key];
    const v = assessUncancel(
      facts({ load: { status: "CANCELLED", cancelledAt: CANCELLED_AT, cancellationSnapshot: s } }),
    );
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.code).toBe("SNAPSHOT_INCOMPLETE");
    expect(v.message).toContain(key);
  });

  it("a PRESENT key holding null or [] is a recorded nothing, not an absence", () => {
    // This is the distinction ruling 1 turns on: shipperCredit is null on every
    // load that was never delivered, and that must not read as unrecorded.
    const v = assessUncancel(
      facts({
        load: {
          status: "CANCELLED",
          cancelledAt: CANCELLED_AT,
          cancellationSnapshot: snapshot({ shipperCredit: null, carrierPays: [], tenders: [] }),
        },
        tenders: [],
      }),
    );
    expect(v.ok).toBe(true);
  });

  it("refuses a snapshot that is not an object at all", () => {
    for (const junk of ["", "null", 0, [], "a string"]) {
      const v = assessUncancel(
        facts({ load: { status: "CANCELLED", cancelledAt: CANCELLED_AT, cancellationSnapshot: junk } }),
      );
      expect(v.ok, "accepted " + JSON.stringify(junk) + " as a snapshot").toBe(false);
    }
  });
});

describe("carrier released, and re-tendered", () => {
  it("refuses when a carrier was released AFTER the cancel", () => {
    const v = assessUncancel(
      facts({ tenders: [{ id: "tn1", status: "RELEASED", createdAt: BEFORE_CANCEL, statusChangedAt: AFTER_CANCEL }] }),
    );
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.code).toBe("CARRIER_RELEASED");
  });

  it("ALLOWS when the release predates the cancel — the snapshot is the baseline", () => {
    // Released before the cancel and recorded as such: the cancel did not
    // release anybody, so there is nothing here the un-cancel would undo.
    // Without the baseline these two states are indistinguishable.
    const v = assessUncancel(
      facts({
        load: {
          status: "CANCELLED",
          cancelledAt: CANCELLED_AT,
          cancellationSnapshot: snapshot({ tenders: [{ id: "tn1", status: "RELEASED", deletedAt: null }] }),
        },
        tenders: [{ id: "tn1", status: "RELEASED", createdAt: BEFORE_CANCEL, statusChangedAt: BEFORE_CANCEL }],
      }),
    );
    expect(v.ok).toBe(true);
  });

  it("refuses when a tender exists that the before-image never saw", () => {
    const v = assessUncancel(
      facts({
        tenders: [
          { id: "tn1", status: "WITHDRAWN", createdAt: BEFORE_CANCEL, statusChangedAt: null },
          { id: "tn2", status: "OFFERED", createdAt: AFTER_CANCEL, statusChangedAt: null },
        ],
      }),
    );
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.code).toBe("LOAD_RETENDERED");
  });
});

describe("a load that is not cancelled", () => {
  it.each(["DISPATCHED", "DELIVERED", "TONU", "COMPLETED"])("refuses %s", (status) => {
    const v = assessUncancel(
      facts({ load: { status, cancelledAt: CANCELLED_AT, cancellationSnapshot: snapshot() } }),
    );
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.code).toBe("LOAD_NOT_CANCELLED");
    expect(v.message).toContain(status);
  });
});


/**
 * Finding B. A tender absent from the before-image was read as new. It is only
 * new if its OWN clock says so: createdAt after the snapshot takenAt.
 *
 * The snapshot only ever recorded the tenders the cancel WITHDREW, so a
 * CONFIRMED tender -- one the cancel correctly never touched -- was missing
 * from it, and its absence read as a retender. That refused the reversal on
 * exactly the loads most likely to need one: the ones with a committed carrier.
 */
describe("Finding B -- a tender is new only if it was created after the cancel", () => {
  it("(a) a committed-carrier load reverses", () => {
    const v = assessUncancel(
      facts({
        load: {
          status: "CANCELLED",
          cancelledAt: CANCELLED_AT,
          cancellationSnapshot: snapshot({ tenders: [{ id: "tn1", status: "CONFIRMED", deletedAt: null }] }),
        },
        tenders: [{ id: "tn1", status: "CONFIRMED", createdAt: BEFORE_CANCEL, statusChangedAt: null }],
      }),
    );
    expect(v.ok, v.ok ? "" : "refused with " + v.code).toBe(true);
  });

  it("(b) a tender created AFTER the cancel still refuses", () => {
    const v = assessUncancel(
      facts({ tenders: [{ id: "tn9", status: "OFFERED", createdAt: AFTER_CANCEL, statusChangedAt: null }] }),
    );
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.code).toBe("LOAD_RETENDERED");
  });

  it("(c) the SRL-121496 shape: a v1 snapshot with tenders:[] and a tender predating takenAt", () => {
    const v = assessUncancel(
      facts({
        load: {
          status: "CANCELLED",
          cancelledAt: CANCELLED_AT,
          cancellationSnapshot: snapshot({ version: 1, tenders: [] }),
        },
        tenders: [{ id: "tn1", status: "CONFIRMED", createdAt: BEFORE_CANCEL, statusChangedAt: null }],
      }),
    );
    expect(v.ok, v.ok ? "" : "the frozen v1 row still refuses: " + v.code).toBe(true);
    if (!v.ok) return;
    expect(v.restoreTo).toBe("DISPATCHED");
  });

  it("(d) a genuine release since the cancel still refuses", () => {
    const v = assessUncancel(
      facts({
        load: {
          status: "CANCELLED",
          cancelledAt: CANCELLED_AT,
          cancellationSnapshot: snapshot({ tenders: [{ id: "tn1", status: "CONFIRMED", deletedAt: null }] }),
        },
        tenders: [{ id: "tn1", status: "RELEASED", createdAt: BEFORE_CANCEL, statusChangedAt: AFTER_CANCEL }],
      }),
    );
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.code).toBe("CARRIER_RELEASED");
  });

  it("(d2) a release BEFORE the cancel, absent from a v1 row, does not refuse", () => {
    const v = assessUncancel(
      facts({
        load: {
          status: "CANCELLED",
          cancelledAt: CANCELLED_AT,
          cancellationSnapshot: snapshot({ version: 1, tenders: [] }),
        },
        tenders: [{ id: "tn1", status: "RELEASED", createdAt: BEFORE_CANCEL, statusChangedAt: BEFORE_CANCEL }],
      }),
    );
    expect(v.ok, v.ok ? "" : "a pre-cancel release read as released-since: " + v.code).toBe(true);
  });
});