/**
 * THE Load -> Shipment mapping, and the census that keeps it the only one.
 *
 * The defect this closes was not a wrong mapping. It was a SECOND mapping --
 * loadController wrote Load.status raw into a column typed ShipmentStatus,
 * which has 8 of LoadStatus's 18 members. So the behavioural half here asserts
 * every mapped value against Prisma's RUNTIME enum object rather than against a
 * list I typed out: a list I typed could drift from the schema in exactly the
 * way the code did, and would agree with itself while being wrong.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { $Enums } from "@prisma/client";
import type { LoadStatus } from "@prisma/client";
import { shipmentSyncFor } from "../../../src/lib/shipmentStatusFor";
import { getAllowedNextStatuses } from "../../../src/lib/loadStateMachine";

/** The mapping under test, read through the one export that has a caller. */
const shipmentStatusFor = (ls: Parameters<typeof shipmentSyncFor>[0]) => shipmentSyncFor(ls).status;

const LOAD_STATUSES = Object.values($Enums.LoadStatus);
const SHIPMENT_STATUSES = new Set<string>(Object.values($Enums.ShipmentStatus));

describe("shipmentStatusFor — every LoadStatus lands on a real ShipmentStatus", () => {
  it("the enums are the shape this test assumes (vacuity tripwire)", () => {
    // If Prisma stopped exporting runtime enums, every case below would pass
    // over empty sets and prove nothing.
    expect(LOAD_STATUSES.length, "no LoadStatus members — the import is broken, not the map").toBeGreaterThan(10);
    expect(SHIPMENT_STATUSES.size).toBeGreaterThan(3);
    expect(SHIPMENT_STATUSES.size, "ShipmentStatus grew — Item 160's projection decision may have changed").toBeLessThan(LOAD_STATUSES.length);
  });

  it.each(LOAD_STATUSES)("%s maps to a ShipmentStatus member", (ls) => {
    const mapped = shipmentStatusFor(ls);
    expect(mapped, `${ls} mapped to "${mapped}", which is not a ShipmentStatus`).toBeDefined();
    expect(SHIPMENT_STATUSES.has(mapped)).toBe(true);
  });

  it("the nine that used to throw now map", () => {
    // Proven rejected by a real database before this mapper existed.
    for (const ls of ["AT_PICKUP", "LOADED", "AT_DELIVERY", "POD_RECEIVED", "TONU", "CONFIRMED", "TENDERED", "POSTED", "INVOICED"] as const) {
      expect(SHIPMENT_STATUSES.has(shipmentStatusFor(ls)), `${ls} still does not map`).toBe(true);
    }
  });

  it("preserves the carrier path's existing answers — except the one Item 317 corrected", () => {
    expect(shipmentStatusFor("LOADED")).toBe("PICKED_UP");
    expect(shipmentStatusFor("IN_TRANSIT")).toBe("IN_TRANSIT");
    expect(shipmentStatusFor("AT_DELIVERY")).toBe("DELIVERED");
    expect(shipmentStatusFor("DELIVERED")).toBe("DELIVERED");
  });

  it("AT_PICKUP reads as arrived, NOT as picked up (C2, Item 317)", () => {
    // The truck is at the shipper and the freight is not on it. DISPATCHED is
    // the nearest pre-pickup member; PICKED_UP asserted something that had not
    // happened, on the row the billing projection is built from.
    expect(shipmentStatusFor("AT_PICKUP")).toBe("DISPATCHED");
    // It must stay BEFORE the loaded answer rather than merging into it --
    // remapping it to PICKED_UP's neighbour would be the same claim again.
    expect(shipmentStatusFor("AT_PICKUP")).not.toBe(shipmentStatusFor("LOADED"));
  });

  it("a cancelled or TONU load does not read as live freight", () => {
    expect(shipmentStatusFor("CANCELLED")).toBe("CANCELLED");
    expect(shipmentStatusFor("TONU")).toBe("CANCELLED");
  });

  it("stamps pickup when the freight is on, delivery when it has arrived", () => {
    // AT_PICKUP no longer stamps: the timestamp and the status are ONE claim,
    // and a row reading DISPATCHED must not carry a pickup time (C2).
    expect(shipmentSyncFor("AT_PICKUP").setActualPickup).toBe(false);
    expect(shipmentSyncFor("LOADED").setActualPickup).toBe(true);
    expect(shipmentSyncFor("PICKED_UP").setActualPickup).toBe(true);
    expect(shipmentSyncFor("DISPATCHED").setActualPickup).toBe(false);
    expect(shipmentSyncFor("AT_DELIVERY").setActualDelivery).toBe(true);
    expect(shipmentSyncFor("DELIVERED").setActualDelivery).toBe(true);
    expect(shipmentSyncFor("IN_TRANSIT").setActualDelivery).toBe(false);
  });

  it("the stamp is DEFERRED by C2, never lost — every way out of AT_PICKUP stamps", () => {
    // The reason dropping the AT_PICKUP stamp is safe rather than a silent data
    // loss: both onward AE transitions from AT_PICKUP land on a status that
    // stamps, so the pickup time is still recorded, at the moment it is true.
    const onward = getAllowedNextStatuses("AT_PICKUP" as LoadStatus, "AE").filter(
      (s) => s !== "CANCELLED" && s !== "TONU",
    );
    expect(onward.length, "AT_PICKUP has no non-terminal onward move — re-read this").toBeGreaterThan(0);
    for (const s of onward) {
      expect(
        shipmentSyncFor(s).setActualPickup,
        `${s} follows AT_PICKUP and does not stamp — C2 would be losing the pickup time, not deferring it`,
      ).toBe(true);
    }
  });
});

/**
 * THE CENSUS. A second mapping is what broke; this is what stops a third.
 *
 * Every `shipment.update|updateMany|create` in backend/src either derives its
 * status from the mapper, or is listed here with the reason it does not.
 */
const ALLOWED_WITHOUT_MAPPER: Record<string, string> = {
  "src/controllers/shipmentController.ts":
    "direct shipment CRUD — the AE sets ShipmentStatus itself, validated against the enum; nothing is derived from a Load",
  "src/controllers/checkCallController.ts":
    "writes lastLocation only, never status",
  "src/controllers/tenderController.ts":
    "creates the shipment at accept with the literal BOOKED — there is no prior load status to map",
  "src/services/cancelCascade.ts":
    "the cancel cascade writes the literal CANCELLED; the snapshot records what it overwrote",
};

describe("census — only lib/shipmentStatusFor derives Shipment.status from Load.status", () => {
  const SRC = path.resolve(__dirname, "../../../src");
  const walk = (d: string): string[] =>
    fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(d, e.name);
      return e.isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
    });

  const files = walk(SRC);
  const writers = files
    .map((f) => ({ f, body: fs.readFileSync(f, "utf8") }))
    .filter(({ body }) => /\bshipment\s*\.\s*(update|updateMany|create|upsert)\s*\(/.test(stripComments(body)))
    .map(({ f, body }) => ({
      rel: path.relative(path.resolve(SRC, ".."), f).split(path.sep).join("/"),
      body,
    }));

  it("finds the writers at all (vacuity tripwire)", () => {
    expect(writers.length, "the scanner matched nothing — it is broken, not the tree").toBeGreaterThan(3);
    expect(files.length).toBeGreaterThan(100);
  });

  it("every writer uses the mapper or is listed with a reason", () => {
    const unexplained = writers
      // NOT w.body: an `import { shipmentSyncFor }` that nothing calls satisfies a
      // plain substring test, so this census passed 27/27 with the raw-status
      // write restored. Presence is not function (§19 Sub-pattern 16); the
      // import block is stripped so the identifier has to appear in real code.
      .filter((w) => !/shipmentSyncFor|shipmentStatusFor/.test(stripImports(stripComments(w.body))))
      .filter((w) => !ALLOWED_WITHOUT_MAPPER[w.rel])
      .map((w) => w.rel);
    expect(unexplained, `writes Shipment without the Load->Shipment mapper and without a recorded reason:\n  ${unexplained.join("\n  ")}`).toEqual([]);
  });

  it("no listed exemption has gone stale", () => {
    // Dead permission silently widens the census.
    const present = new Set(writers.map((w) => w.rel));
    const stale = Object.keys(ALLOWED_WITHOUT_MAPPER).filter((k) => !present.has(k));
    expect(stale, `listed as exempt but no longer writes Shipment:\n  ${stale.join("\n  ")}`).toEqual([]);
  });

  it("nobody rebuilds the map inline", () => {
    const offenders = writers
      .filter((w) => /AT_PICKUP\s*:\s*["']PICKED_UP["']|loadToShipmentStatus/.test(stripComments(w.body)))
      .map((w) => w.rel);
    expect(offenders, `a second Load->Shipment map:\n  ${offenders.join("\n  ")}`).toEqual([]);
  });
});

/**
 * Line-wise on purpose. The regex version of this helper reached the file with
 * every backslash eaten -- `\s` became `s` -- so it matched nothing, stripped
 * nothing, and the census went on passing with the defect in place. That is
 * §19 Sub-pattern 22 (escapes eaten through layers) landing inside the fix for
 * Sub-pattern 16. No escapes here means no layer can eat one.
 */
function stripImports(s: string): string {
  const out: string[] = [];
  let inImport = false;
  for (const line of s.split("\n")) {
    const t = line.trim();
    if (inImport) {
      if (t.includes("from ")) inImport = false;
      continue;
    }
    if (t.startsWith("import ")) {
      // A single-line import ends with its source on the same line.
      if (!t.includes("from ") && t.endsWith("{")) inImport = true;
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}
