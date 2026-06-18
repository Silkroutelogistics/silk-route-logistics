import { describe, it, expect } from "vitest";
import type { LoadStatus } from "@prisma/client";
import {
  validateLoadStatusTransition,
  getAllowedNextStatuses,
} from "../../../src/lib/loadStateMachine";

// Pure validator (no DB). LoadStatus values are plain strings at runtime, so we
// cast string literals to satisfy the type without importing the enum object.
const S = (v: string): LoadStatus => v as LoadStatus;

describe("loadStateMachine — validateLoadStatusTransition", () => {
  it("idempotent same-state transition is always allowed (no-op safety net)", () => {
    expect(validateLoadStatusTransition(S("BOOKED"), S("BOOKED"), "CARRIER").allowed).toBe(true);
    expect(validateLoadStatusTransition(S("COMPLETED"), S("COMPLETED"), "AE").allowed).toBe(true);
  });

  describe("CARRIER actor (forward-only subset)", () => {
    it("allows the legitimate next step", () => {
      expect(validateLoadStatusTransition(S("BOOKED"), S("AT_PICKUP"), "CARRIER").allowed).toBe(true);
      expect(validateLoadStatusTransition(S("AT_PICKUP"), S("LOADED"), "CARRIER").allowed).toBe(true);
      expect(validateLoadStatusTransition(S("IN_TRANSIT"), S("AT_DELIVERY"), "CARRIER").allowed).toBe(true);
      expect(validateLoadStatusTransition(S("AT_DELIVERY"), S("DELIVERED"), "CARRIER").allowed).toBe(true);
    });

    it("treats DISPATCHED and CONFIRMED as interchangeable upstream states", () => {
      expect(validateLoadStatusTransition(S("DISPATCHED"), S("AT_PICKUP"), "CARRIER").allowed).toBe(true);
      expect(validateLoadStatusTransition(S("CONFIRMED"), S("AT_PICKUP"), "CARRIER").allowed).toBe(true);
    });

    it("BLOCKS the canonical bug: BOOKED → DELIVERED skip (the reason this module exists)", () => {
      const r = validateLoadStatusTransition(S("BOOKED"), S("DELIVERED"), "CARRIER");
      expect(r.allowed).toBe(false);
      expect(r.code).toBe("SKIP_NOT_ALLOWED");
      expect(r.allowedNext).toEqual(["AT_PICKUP"]);
    });

    it("blocks backwards jumps", () => {
      const r = validateLoadStatusTransition(S("AT_PICKUP"), S("BOOKED"), "CARRIER");
      expect(r.allowed).toBe(false);
      expect(r.code).toBe("SKIP_NOT_ALLOWED");
    });

    it("blocks updates before the load is BOOKED (wrong starting state)", () => {
      const r = validateLoadStatusTransition(S("POSTED"), S("AT_PICKUP"), "CARRIER");
      expect(r.allowed).toBe(false);
      expect(r.code).toBe("WRONG_STARTING_STATE");
    });

    it("does NOT let a carrier reach terminal aborts (TONU / CANCELLED)", () => {
      expect(validateLoadStatusTransition(S("BOOKED"), S("TONU"), "CARRIER").allowed).toBe(false);
      expect(validateLoadStatusTransition(S("DISPATCHED"), S("CANCELLED"), "CARRIER").allowed).toBe(false);
    });
  });

  describe("AE actor (superset)", () => {
    it("allows authoring + dispatch progression", () => {
      expect(validateLoadStatusTransition(S("DRAFT"), S("POSTED"), "AE").allowed).toBe(true);
      expect(validateLoadStatusTransition(S("POSTED"), S("TENDERED"), "AE").allowed).toBe(true);
      expect(validateLoadStatusTransition(S("BOOKED"), S("DISPATCHED"), "AE").allowed).toBe(true);
      expect(validateLoadStatusTransition(S("DELIVERED"), S("POD_RECEIVED"), "AE").allowed).toBe(true);
      expect(validateLoadStatusTransition(S("INVOICED"), S("COMPLETED"), "AE").allowed).toBe(true);
    });

    it("allows the documented un-tender backward step (TENDERED → POSTED)", () => {
      expect(validateLoadStatusTransition(S("TENDERED"), S("POSTED"), "AE").allowed).toBe(true);
    });

    it("allows terminal aborts from active states", () => {
      expect(validateLoadStatusTransition(S("POSTED"), S("CANCELLED"), "AE").allowed).toBe(true);
      expect(validateLoadStatusTransition(S("BOOKED"), S("TONU"), "AE").allowed).toBe(true);
    });

    it("still blocks AE skip-ahead (BOOKED → DELIVERED)", () => {
      const r = validateLoadStatusTransition(S("BOOKED"), S("DELIVERED"), "AE");
      expect(r.allowed).toBe(false);
      expect(r.code).toBe("SKIP_NOT_ALLOWED");
    });

    it("blocks any transition out of a terminal state", () => {
      const completed = validateLoadStatusTransition(S("COMPLETED"), S("INVOICED"), "AE");
      expect(completed.allowed).toBe(false);
      expect(completed.code).toBe("TERMINAL_NOT_ALLOWED");
      const cancelled = validateLoadStatusTransition(S("CANCELLED"), S("POSTED"), "AE");
      expect(cancelled.allowed).toBe(false);
      expect(cancelled.code).toBe("TERMINAL_NOT_ALLOWED");
    });
  });

  describe("actor scoping", () => {
    it("a transition legal for AE can be illegal for CARRIER", () => {
      // POSTED → TENDERED is an AE authoring step; a carrier has no business there.
      expect(validateLoadStatusTransition(S("POSTED"), S("TENDERED"), "AE").allowed).toBe(true);
      expect(validateLoadStatusTransition(S("POSTED"), S("TENDERED"), "CARRIER").allowed).toBe(false);
    });
  });
});

describe("loadStateMachine — getAllowedNextStatuses", () => {
  it("returns the carrier next-set for a mid-flight load", () => {
    expect(getAllowedNextStatuses(S("BOOKED"), "CARRIER")).toEqual(["AT_PICKUP"]);
    expect(getAllowedNextStatuses(S("AT_DELIVERY"), "CARRIER")).toEqual(["DELIVERED"]);
  });

  it("returns the wider AE next-set", () => {
    expect(getAllowedNextStatuses(S("BOOKED"), "AE")).toEqual(["DISPATCHED", "CANCELLED", "TONU"]);
  });

  it("returns [] for terminal or unknown starting states", () => {
    expect(getAllowedNextStatuses(S("COMPLETED"), "AE")).toEqual([]);
    expect(getAllowedNextStatuses(S("POSTED"), "CARRIER")).toEqual([]); // carrier can't start from POSTED
  });
});
