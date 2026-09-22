/**
 * Carrier-archive recut C2 (2026-09-19) — the guard decides, it never writes.
 *
 * The lib is pure: the reason contract (assessArchiveInput → the load-side
 * 422 shape) and the status vocabulary the census reads (PRE_POD_STATUSES,
 * BINDING_TENDER_STATES). The census itself lives in lib/carrierReferences.ts
 * and is tested there; what is pinned HERE is that the vocabulary means what
 * CLAUDE.md §14 says — DELIVERED-pre-POD is in flight, settled tenders never
 * bind — and that it is DERIVED from the state machine rather than copied, so
 * a change to the machine that changes the meaning goes red in this file.
 *
 * Adversarially verified at authoring — see the commit message for the matrix.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CarrierArchiveReason, LoadStatus } from "@prisma/client";
import { getAllowedNextStatuses } from "../../../src/lib/loadStateMachine";
import { HOLDS_LOAD, LIVE_STATES, SETTLED_STATES } from "../../../src/lib/tenderLifecycle";
import {
  assessArchiveInput,
  isInFlightStatus,
  PRE_POD_STATUSES,
  BINDING_TENDER_STATES,
  CARRIER_ARCHIVE_REASONS,
  CARRIER_ARCHIVED_WITHDRAW_REASON,
} from "../../../src/lib/carrierArchiveGuard";

describe("PRE_POD_STATUSES — derived from the machine, pinned here", () => {
  it("is non-empty and reads the pipeline the way §14 rules it: DELIVERED is in flight, POD_RECEIVED and after are history", () => {
    expect(PRE_POD_STATUSES.length).toBeGreaterThan(0); // vacuity tripwire
    for (const s of ["POSTED", "TENDERED", "BOOKED", "DISPATCHED", "AT_PICKUP", "LOADED", "IN_TRANSIT", "AT_DELIVERY", "DELIVERED"]) {
      expect(PRE_POD_STATUSES, `${s} must be in flight`).toContain(s);
    }
    for (const s of ["POD_RECEIVED", "INVOICED", "COMPLETED", "CANCELLED", "TONU"]) {
      expect(PRE_POD_STATUSES, `${s} must be history`).not.toContain(s);
    }
  });

  it("is the reachability set the state machine gives, recomputed independently", () => {
    const all = Object.values(LoadStatus) as LoadStatus[];
    const next = (s: LoadStatus) => [...getAllowedNextStatuses(s, "AE"), ...getAllowedNextStatuses(s, "CARRIER")];
    const reaches = (start: LoadStatus) => {
      const seen = new Set<LoadStatus>([start]);
      const q = [start];
      while (q.length) {
        for (const n of next(q.shift() as LoadStatus)) {
          if (n === "POD_RECEIVED") return true;
          if (!seen.has(n)) { seen.add(n); q.push(n); }
        }
      }
      return false;
    };
    const expected = all.filter((s) => s !== "POD_RECEIVED" && reaches(s));
    expect([...PRE_POD_STATUSES].sort()).toEqual([...expected].sort());
    expect(expected.length).toBeGreaterThan(5); // the recomputation is not vacuous either
  });

  it("isInFlightStatus answers from the same set, and says no to a status the enum does not have", () => {
    expect(isInFlightStatus("DELIVERED")).toBe(true);
    expect(isInFlightStatus("DISPATCHED")).toBe(true);
    expect(isInFlightStatus("POD_RECEIVED")).toBe(false);
    expect(isInFlightStatus("CANCELLED")).toBe(false);
    expect(isInFlightStatus("NOT_A_STATUS")).toBe(false);
  });
});

describe("BINDING_TENDER_STATES — every open offer and every committed hold, nothing settled", () => {
  it("is exactly LIVE ∪ HOLDS_LOAD, and the two halves do not overlap", () => {
    expect([...BINDING_TENDER_STATES].sort()).toEqual(["ACCEPTED", "CONFIRMED", "COUNTERED", "OFFERED", "RC_SENT"]);
    expect(LIVE_STATES.filter((s) => (HOLDS_LOAD as string[]).includes(s))).toEqual([]);
    expect([...BINDING_TENDER_STATES].sort()).toEqual([...LIVE_STATES, ...HOLDS_LOAD].sort());
  });

  it("binds on no settled state — a DECLINED, WITHDRAWN, EXPIRED or RELEASED tender is history", () => {
    for (const s of SETTLED_STATES) expect(BINDING_TENDER_STATES).not.toContain(s);
    expect(SETTLED_STATES.length).toBeGreaterThan(0);
  });

  it("names the withdraw reason the transaction writes onto an open offer", () => {
    expect(CARRIER_ARCHIVED_WITHDRAW_REASON).toBe("carrier_archived");
  });
});

describe("assessArchiveInput — the load-side 422 contract", () => {
  it("requires a reason", () => {
    for (const body of [undefined, {}, { reason: "" }, { reason: null }]) {
      const v = assessArchiveInput(body);
      expect(v.ok).toBe(false);
      if (v.ok) throw new Error("unreachable");
      expect(v.code).toBe("ARCHIVE_REASON_REQUIRED");
      expect(v.message).toContain("DUPLICATE_RECORD");
    }
  });

  it("refuses a reason outside the enum", () => {
    const v = assessArchiveInput({ reason: "BECAUSE" });
    expect(v).toMatchObject({ ok: false, code: "ARCHIVE_REASON_INVALID" });
  });

  it("accepts every enum member, trims the note, and turns an empty note into null", () => {
    expect(CARRIER_ARCHIVE_REASONS.length).toBe(7); // the ratified vocabulary
    expect([...CARRIER_ARCHIVE_REASONS].sort()).toEqual(Object.values(CarrierArchiveReason).sort());
    for (const reason of CARRIER_ARCHIVE_REASONS) {
      expect(assessArchiveInput({ reason })).toEqual({ ok: true, reason, note: null });
    }
    expect(assessArchiveInput({ reason: "RELATIONSHIP_ENDED", archiveNote: "  moved to Landstar  " })).toEqual({
      ok: true,
      reason: "RELATIONSHIP_ENDED",
      note: "moved to Landstar",
    });
    expect(assessArchiveInput({ reason: "RELATIONSHIP_ENDED", archiveNote: "   " })).toEqual({
      ok: true,
      reason: "RELATIONSHIP_ENDED",
      note: null,
    });
  });

  it("caps the note at 500 characters", () => {
    const v = assessArchiveInput({ reason: "CEASED_OPERATIONS", archiveNote: "x".repeat(501) });
    expect(v).toMatchObject({ ok: false, code: "ARCHIVE_NOTE_INVALID" });
    expect(assessArchiveInput({ reason: "CEASED_OPERATIONS", archiveNote: "x".repeat(500) }).ok).toBe(true);
  });
});

describe("the guard decides and never writes (structural)", () => {
  const src = readFileSync(path.join(__dirname, "../../../src/lib/carrierArchiveGuard.ts"), "utf8");

  it("imports no database client and calls no Prisma write", () => {
    expect(src.length).toBeGreaterThan(1000); // the file was read
    expect(src).not.toMatch(/config\/database/);
    expect(src).not.toMatch(/\bprisma\./);
    expect(src).not.toMatch(/\.(update|updateMany|create|createMany|delete|deleteMany|upsert)\s*\(/);
  });

  it("derives the in-flight set from the machine rather than keeping a list of statuses", () => {
    expect(src).toMatch(/getAllowedNextStatuses\(s, "AE"\)/);
    expect(src).toMatch(/getAllowedNextStatuses\(s, "CARRIER"\)/);
    // No hand list of pipeline statuses anywhere in the module: the only status
    // literal it may name is the target of the walk.
    const literals = src.match(/"(POSTED|TENDERED|BOOKED|DISPATCHED|AT_PICKUP|LOADED|IN_TRANSIT|AT_DELIVERY|DELIVERED|INVOICED|COMPLETED|CANCELLED|TONU)"/g) || [];
    expect(literals).toEqual([]);
  });
});
