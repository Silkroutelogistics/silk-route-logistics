import { describe, it, expect } from "vitest";
import type { LoadStatus } from "@prisma/client";
import { assessCancellability, TERMINAL_ABORTS } from "../../../src/lib/cancellationGuard";
import { getAllowedNextStatuses } from "../../../src/lib/loadStateMachine";

const S = (s: string) => s as LoadStatus;

const ALL: LoadStatus[] = [
  "DRAFT", "PLANNED", "POSTED", "TENDERED", "CONFIRMED", "BOOKED", "DISPATCHED",
  "AT_PICKUP", "LOADED", "PICKED_UP", "IN_TRANSIT", "AT_DELIVERY", "DELIVERED",
  "POD_RECEIVED", "INVOICED", "COMPLETED", "TONU", "CANCELLED",
].map(S);

describe("cancellationGuard — assessCancellability", () => {
  it("allows the pre-pickup states the AE map allows, including TENDERED (the trigger)", () => {
    for (const status of ["DRAFT", "PLANNED", "POSTED", "TENDERED", "CONFIRMED", "BOOKED", "DISPATCHED", "AT_PICKUP"]) {
      const v = assessCancellability({ status: S(status), podUrl: null });
      expect(v.allowed, status).toBe(true);
    }
  });

  it("refuses once freight is loaded — the ratified cut-off (decision 1)", () => {
    for (const status of ["LOADED", "PICKED_UP", "IN_TRANSIT", "AT_DELIVERY", "DELIVERED", "POD_RECEIVED", "INVOICED", "COMPLETED"]) {
      const v = assessCancellability({ status: S(status), podUrl: null });
      expect(v.allowed, status).toBe(false);
      if (!v.allowed) expect(v.code).toBe("NOT_CANCELLABLE_STATUS");
    }
  });

  it("refuses on a POD regardless of status, and names the POD not the status", () => {
    const v = assessCancellability({ status: S("DISPATCHED"), podUrl: "s3://pod.pdf" });
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.code).toBe("POD_ON_FILE");
    const v2 = assessCancellability({ status: S("BOOKED"), podUrl: null, podReceivedAt: new Date() });
    expect(v2.allowed).toBe(false);
    if (!v2.allowed) expect(v2.code).toBe("POD_ON_FILE");
  });

  it("an already-cancelled load passes as a no-op, never a 409", () => {
    const v = assessCancellability({ status: S("CANCELLED"), podUrl: null });
    expect(v).toEqual({ allowed: true, alreadyCancelled: true });
  });

  it("TONU is terminal for a cancel — the archive path handles it separately", () => {
    expect(assessCancellability({ status: S("TONU"), podUrl: null }).allowed).toBe(false);
    expect(TERMINAL_ABORTS).toEqual(["CANCELLED", "TONU"]);
  });

  // VACUITY TRIPWIRE + the property that matters: the guard keeps no list of
  // its own. Its allow-set must equal, exactly, the set of AE-map sources that
  // carry CANCELLED. Hardcoding a list in the guard — even a correct one today —
  // fails this the first time the map moves.
  it("derives its allow-set from the AE map, not from a second list", () => {
    const fromGuard = ALL.filter((s) => s !== "CANCELLED" && assessCancellability({ status: s, podUrl: null }).allowed);
    const fromMap = ALL.filter((s) => s !== "CANCELLED" && getAllowedNextStatuses(s, "AE").includes(S("CANCELLED")));
    expect(fromMap.length, "tripwire: the map must allow CANCELLED from somewhere").toBeGreaterThan(0);
    expect(fromGuard.sort()).toEqual(fromMap.sort());
  });
});
