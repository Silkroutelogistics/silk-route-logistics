/**
 * §21.2 ruling — SHP-YYYY-NNN IS INTERNAL. The load number is what a customer or
 * a carrier ever sees.
 *
 * The audit found this already true, and that is exactly why it needs a guard.
 * A rule that holds because nobody has happened to break it yet is indis-
 * tinguishable, from the outside, from a rule nobody is keeping — and the cost of
 * discovering the difference is a second identifier reaching a customer who then
 * has two numbers for one shipment and no way to know which one SRL's inbox
 * recognises. That is the whole harm the numbering scheme exists to prevent, and
 * ruling 3 spent three commits removing it from the invoice.
 *
 * WHAT WAS VERIFIED, so the next reader does not have to re-derive it:
 *   - /shipments is gated to AE roles; neither CARRIER nor SHIPPER can reach it.
 *   - The tracking-gap email goes to broker.email with an AE-console actionUrl.
 *   - No PDF generator references shipmentNumber at all.
 *   - The shipper portal identifies a shipment by load.referenceNumber.
 *
 * The census below is FROZEN rather than pattern-matched. A hand-kept list of
 * "customer-facing files" is the artifact that goes stale silently — the new
 * carrier route nobody adds to it is precisely the one that leaks. Freezing the
 * whole set instead means ANY new file touching shipmentNumber fails until
 * somebody classifies it, which is the same shape as the carrier-picker census
 * and the scheduled-job inventory.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join } from "path";
import { stripComments } from "../../helpers/stripComments";

const BACKEND_SRC = join(__dirname, "../../../src");
const FRONTEND_SRC = join(__dirname, "../../../../frontend/src");

function walk(dir: string, exts: RegExp, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, exts, out);
    else if (exts.test(name)) out.push(p);
  }
  return out;
}

const backendFiles = walk(BACKEND_SRC, /\.ts$/);
const frontendFiles = walk(FRONTEND_SRC, /\.(ts|tsx)$/);
// A Windows path separator built from its char code rather than written as an
// escape: this file has already been mangled once by a shell layer eating the
// backslash out of a regex literal, which is the §19 Sub-pattern 22 shape.
const WIN_SEP = String.fromCharCode(92);
const toPosix = (p: string) => p.split(WIN_SEP).join("/");
const relBackend = (p: string) => toPosix(p).split("/backend/src/")[1];
const relFrontend = (p: string) => toPosix(p).split("/frontend/src/")[1];

const reads = (p: string, token: string) => stripComments(readFileSync(p, "utf8")).includes(token);

/**
 * Every file allowed to know a shipment number, each internal, each checked.
 * Adding a file here is a decision that it is AE-only — not a formality.
 */
const INTERNAL_ONLY = [
  // Allocates SHP- and serves the AE-only /shipments CRUD.
  "controllers/shipmentController.ts",
  // Creates the Shipment row when a tender is accepted. Never renders it.
  "controllers/tenderController.ts",
  // sendNoTrackingDataEmail — addressed to broker.email.
  "services/emailService.ts",
  // The tracking-gap sweep: an in-app notification to the AE plus that email.
  "services/schedulerService.ts",
];

describe("SHP- stays internal", () => {
  it("scanned a real corpus (vacuity tripwire)", () => {
    // A walk that silently stopped matching would report a clean tree, which is
    // the failure every assertion below would otherwise share.
    expect(backendFiles.length, "no backend sources walked").toBeGreaterThan(100);
    expect(frontendFiles.length, "no frontend sources walked").toBeGreaterThan(100);
    // and the token is findable where it legitimately lives
    const gen = backendFiles.find((p) => relBackend(p) === "controllers/shipmentController.ts");
    expect(gen, "the generator moved — repoint this guard").toBeTruthy();
    expect(reads(gen!, "shipmentNumber")).toBe(true);
  });

  it("is known to exactly the internal files, and no others", () => {
    const actual = backendFiles.filter((p) => reads(p, "shipmentNumber")).map(relBackend).sort();
    expect(
      actual,
      "a file gained a shipment number. If it is AE-only, add it to INTERNAL_ONLY with the reason; if it is reachable by a carrier or a customer, it must use the load number instead",
    ).toEqual([...INTERNAL_ONLY].sort());
  });

  it("has no stale entry in the allow-list", () => {
    // Dead permission is permission granted to a file that no longer needs it,
    // and it is how a list stops describing the code it governs.
    const stale = INTERNAL_ONLY.filter((rel) => {
      const p = backendFiles.find((f) => relBackend(f) === rel);
      return !p || !reads(p, "shipmentNumber");
    });
    expect(stale, "allow-listed files that no longer touch a shipment number").toEqual([]);
  });

  it("NEVER reaches the frontend — every portal lives there", () => {
    // The carrier portal, the shipper portal and the AE console are all in this
    // tree, so a reference here cannot be assumed internal.
    const hits = frontendFiles.filter((p) => reads(p, "shipmentNumber")).map(relFrontend);
    expect(hits, "a shipment number reached a portal — customers and carriers see the load number").toEqual([]);
  });

  it("builds the SHP- literal in exactly one place", () => {
    const builders = backendFiles.filter((p) => reads(p, "SHP-")).map(relBackend);
    expect(builders).toEqual(["controllers/shipmentController.ts"]);
  });

  it("grants /shipments to no CARRIER and no SHIPPER", () => {
    const routes = join(BACKEND_SRC, "routes/shipments.ts");
    expect(existsSync(routes), "routes/shipments.ts moved — repoint this guard").toBe(true);
    const src = stripComments(readFileSync(routes, "utf8"));
    expect(src).toContain("authorize("); // the file does gate, so the absence below means something
    expect(src, "a carrier can reach the shipment surface").not.toMatch(/authorize\([^)]*"CARRIER"/);
    expect(src, "a shipper can reach the shipment surface").not.toMatch(/authorize\([^)]*"SHIPPER"/);
  });

  it("identifies a shipment to the CUSTOMER by the load number", () => {
    // The shipper portal calls its rows "shipments", so this is the surface where
    // a shipment number would look most natural and be most wrong.
    const portal = join(BACKEND_SRC, "controllers/shipperPortalController.ts");
    const src = stripComments(readFileSync(portal, "utf8"));
    const i = src.indexOf("function mapLoadToShipment");
    expect(i, "mapLoadToShipment moved — repoint this guard").toBeGreaterThan(-1);
    const body = src.slice(i, i + 900);
    expect(body).toContain("load.referenceNumber");
    expect(body).not.toContain("shipmentNumber");
  });
});
