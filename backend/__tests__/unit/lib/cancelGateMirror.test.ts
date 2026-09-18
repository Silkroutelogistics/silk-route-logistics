/**
 * The frontend's cancel/TONU gates must equal the backend's AE map.
 *
 * frontend/src/lib/loadStatusActions.ts keeps CANCELLABLE_FROM and TONU_FROM as
 * literal arrays because the browser cannot import the Prisma-typed backend map.
 * A literal copy drifts, and the drift already cost a real load: the Load Board
 * rendered Cancel for POSTED|BOOKED|DISPATCHED while the map allowed TENDERED
 * too, so a load at TENDERED had no button (2026-09-18).
 *
 * This guard reads the frontend file as text and holds each array equal to the
 * set DERIVED from the backend map — so it fails when EITHER side moves: a
 * status added to or removed from the frontend list, or a transition added to
 * or removed from AE_ALLOWED_TRANSITIONS. Neither side is the oracle for the
 * other; the equality is the assertion.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import type { LoadStatus } from "@prisma/client";
import { getAllowedNextStatuses } from "../../../src/lib/loadStateMachine";

const REPO = path.join(__dirname, "../../../..");
const FRONTEND_FILE = path.join(REPO, "frontend/src/lib/loadStatusActions.ts");

const ALL: LoadStatus[] = [
  "DRAFT", "PLANNED", "POSTED", "TENDERED", "CONFIRMED", "BOOKED", "DISPATCHED",
  "AT_PICKUP", "LOADED", "PICKED_UP", "IN_TRANSIT", "AT_DELIVERY", "DELIVERED",
  "POD_RECEIVED", "INVOICED", "COMPLETED", "TONU", "CANCELLED",
] as LoadStatus[];

/** Statuses from which the AE map allows `to`. Derived, never listed. */
function mapSourcesFor(to: LoadStatus): string[] {
  return ALL.filter((s) => s !== to && getAllowedNextStatuses(s, "AE").includes(to)).sort();
}

/** Pull `export const NAME = [ ... ] as const;` out of the frontend source. */
function frontendArray(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const;`));
  if (!m) throw new Error(`${name} not found in loadStatusActions.ts`);
  return Array.from(m[1].matchAll(/"([A-Z_]+)"/g)).map((x) => x[1]).sort();
}

describe("cancel/TONU gate mirror — frontend list == backend AE map", () => {
  const src = fs.readFileSync(FRONTEND_FILE, "utf8");

  it("extractor self-test (vacuity tripwire)", () => {
    expect(frontendArray(`export const X = ["A", "B"] as const;`, "X")).toEqual(["A", "B"]);
    expect(() => frontendArray("nothing here", "X")).toThrow();
  });

  it("CANCELLABLE_FROM equals the statuses the AE map allows CANCELLED from", () => {
    const fromMap = mapSourcesFor("CANCELLED");
    expect(fromMap.length, "tripwire: the map must allow CANCELLED from somewhere").toBeGreaterThan(0);
    expect(frontendArray(src, "CANCELLABLE_FROM")).toEqual(fromMap);
  });

  it("TONU_FROM equals the statuses the AE map allows TONU from", () => {
    const fromMap = mapSourcesFor("TONU");
    expect(fromMap.length, "tripwire: the map must allow TONU from somewhere").toBeGreaterThan(0);
    expect(frontendArray(src, "TONU_FROM")).toEqual(fromMap);
  });

  it("TENDERED is on the cancel gate — the trigger case", () => {
    expect(frontendArray(src, "CANCELLABLE_FROM")).toContain("TENDERED");
  });
});
