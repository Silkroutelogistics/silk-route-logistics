/**
 * AT_PICKUP_OR_LATER is derived from the machine, and pre-tracing uses it.
 *
 * WHAT THIS PROTECTS. `runPreTracing` emails a carrier to ask whether they are
 * on schedule for a pickup. It selected on SHIPMENT status, which carries no
 * AT_PICKUP at all, so a carrier standing on the dock still read BOOKED or
 * DISPATCHED and was asked whether they would make it. The fix keys the filter
 * on Load.status instead, and the set of "has reached the dock" statuses is
 * derived from the transition maps rather than written out by hand.
 *
 * THE FAILURE MODES THIS CATCHES ARE ALL SILENT.
 *
 *   - a hand-edit replaces the derivation with a literal list, and the list
 *     then drifts from the enum the next time a status is added
 *   - somebody adds a BACKWARD edge out of AT_PICKUP, at which point forward
 *     reachability swallows the whole pipeline and pre-tracing goes QUIET for
 *     every load — no error, no test, just an email nobody receives
 *   - PICKED_UP, the legacy alias, drops out of the set and loads sitting on it
 *     start being chased for a pickup that already happened
 *   - schedulerService stops using the set and reverts to the shipment's status
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { LoadStatus } from "@prisma/client";
import {
  AT_PICKUP_OR_LATER,
  hasReachedPickup,
  getAllowedNextStatuses,
} from "../../../src/lib/loadStateMachine";

const ROOT = path.resolve(__dirname, "../../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
/** Strip comments, so prose about the old shape is never read as the shape. */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const SCHEDULER = "src/services/schedulerService.ts";

describe("AT_PICKUP_OR_LATER", () => {
  it("derives a non-trivial set (vacuity tripwire)", () => {
    // A derivation that silently returned [] or everything would make every
    // assertion below either vacuous or trivially true.
    const all = Object.values(LoadStatus) as string[];
    expect(AT_PICKUP_OR_LATER.length).toBeGreaterThan(1);
    expect(AT_PICKUP_OR_LATER.length).toBeLessThan(all.length);
  });

  it("partitions the enum — every status is either at-the-dock-or-past, or awaiting pickup", () => {
    const all = Object.values(LoadStatus) as string[];
    const inSet = all.filter((s) => hasReachedPickup(s));
    const out = all.filter((s) => !hasReachedPickup(s));
    expect(inSet.length + out.length).toBe(all.length);
    // Nothing in the set may also be outside it.
    expect(inSet.some((s) => out.includes(s))).toBe(false);
  });

  it("contains AT_PICKUP itself and everything after it on the pipeline", () => {
    for (const s of [
      "AT_PICKUP",
      "LOADED",
      "IN_TRANSIT",
      "AT_DELIVERY",
      "DELIVERED",
      "POD_RECEIVED",
      "INVOICED",
      "COMPLETED",
    ]) {
      expect(hasReachedPickup(s), `${s} should count as at-the-dock-or-past`).toBe(true);
    }
  });

  it("contains PICKED_UP — the legacy alias a hand-written list would miss", () => {
    // It reaches the set only via the AE map's AT_PICKUP -> PICKED_UP edge.
    // A load sitting on it has been picked up; chasing it for a pickup is the
    // exact defect this set exists to prevent.
    expect(hasReachedPickup("PICKED_UP")).toBe(true);
  });

  it("excludes every status where a pickup chase is still the right thing to do", () => {
    for (const s of ["DRAFT", "PLANNED", "POSTED", "TENDERED", "CONFIRMED", "BOOKED", "DISPATCHED"]) {
      expect(hasReachedPickup(s), `${s} is still awaiting pickup and must stay chaseable`).toBe(
        false,
      );
    }
  });

  it("contains the terminal exits, because neither is awaiting a truck", () => {
    // Both are reachable from AT_PICKUP so they arrive by derivation, and both
    // are correct to exclude. TONU is the one that was NOT previously filtered:
    // a truck-ordered-not-used load with a future pickup inside the window
    // could be emailed "are you on schedule?" about freight nobody is moving.
    expect(hasReachedPickup("CANCELLED")).toBe(true);
    expect(hasReachedPickup("TONU")).toBe(true);
  });

  it("AT_PICKUP has no BACKWARD edge — the property the derivation rests on", () => {
    // This is the load-bearing invariant. Forward reachability is only a valid
    // definition of "or later" while nothing leads from AT_PICKUP back to an
    // earlier stage. Add AT_PICKUP -> POSTED and the set quietly becomes the
    // entire enum, which stops pre-tracing for every load in the system.
    const EARLIER = ["DRAFT", "PLANNED", "POSTED", "TENDERED", "CONFIRMED", "BOOKED", "DISPATCHED"];
    const onward = [
      ...getAllowedNextStatuses("AT_PICKUP" as LoadStatus, "AE"),
      ...getAllowedNextStatuses("AT_PICKUP" as LoadStatus, "CARRIER"),
    ] as string[];
    const backward = onward.filter((s) => EARLIER.includes(s));
    expect(
      backward,
      `AT_PICKUP now leads back to ${backward.join(", ")}. Forward reachability is no ` +
        "longer a sound definition of 'or later' — the derivation must be replaced with " +
        "an explicit pipeline order before this set is trusted again.",
    ).toEqual([]);
  });

  it("pre-tracing keys on the LOAD, not the shipment, and uses the derived set", () => {
    const src = code(read(SCHEDULER));
    // The constant exists and is built from the derivation, not a literal list.
    expect(src, "PRE_TRACING_SKIP_STATUSES is gone").toContain("PRE_TRACING_SKIP_STATUSES");
    expect(
      src,
      "the skip list no longer derives from AT_PICKUP_OR_LATER — a literal list here " +
        "drifts from the enum silently",
    ).toMatch(/PRE_TRACING_SKIP_STATUSES[\s\S]{0,200}AT_PICKUP_OR_LATER/);
    // CANCELLED stays pinned by name so the backstop survives a change to the machine.
    expect(src, "CANCELLED is no longer pinned by name in the skip list").toMatch(
      /PRE_TRACING_SKIP_STATUSES[\s\S]{0,200}"CANCELLED"/,
    );
    // And the filter actually applies it to the LOAD.
    expect(
      src,
      "runPreTracing's load filter no longer applies the skip list",
    ).toContain("status: { notIn: PRE_TRACING_SKIP_STATUSES }");
  });

  it("does NOT touch late detection, which asks a different question", () => {
    // runLateDetection selects IN_TRANSIT shipments and is out of scope. Its
    // load filter is byte-identical to the one pre-tracing used, so a
    // whole-file replace would have silently changed it too.
    const src = read(SCHEDULER);
    const lines = src.split(/\r?\n/);
    const lateStart = lines.findIndex((l) => /function runLateDetection\(/.test(l));
    expect(lateStart, "runLateDetection is gone — re-read this assertion").toBeGreaterThan(-1);
    const lateBody = lines.slice(lateStart, lateStart + 90).join("\n");
    expect(
      lateBody,
      "late detection has acquired the pre-tracing skip list — it asks whether a load " +
        "in transit has gone quiet, which has nothing to do with reaching the dock",
    ).not.toContain("PRE_TRACING_SKIP_STATUSES");
  });
});
