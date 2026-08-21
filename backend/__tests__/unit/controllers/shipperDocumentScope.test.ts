// A shipper must not be able to download the carrier's rate confirmation.
//
// THE DEFECT (Arc 15). getShipperDocuments queried
// `document.findMany({ where: { loadId: { in: loadIds } } })` with no docType
// filter, and returned `url: doc.fileUrl` for every row. documentController
// persists the rate confirmation against the LOAD as docType "RATE_CON", and
// that document's body prints "Carrier Rate" and "Total Carrier Pay".
//
// So a shipper could open their own portal, list documents for their own load,
// and download the carrier's pay document — reading SRL's entire margin on
// their freight. Nothing errored. It looked like a working documents tab.
//
// This is not the same defect as "the invoice must not expose carrier pay",
// which a prior arc checked and found clean. The invoice is clean. The margin
// reached the customer through a different door, which is the argument for
// testing the SCOPE of an endpoint rather than the content of one document.
//
// STATIC, and said plainly: there is no HTTP-level test harness for this
// controller here, so this reads the source. It cannot prove the query runs;
// it can prove the filter is still written, and that the list still excludes
// the document that caused the problem.

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../../../src/controllers/shipperPortalController.ts"),
  "utf8",
);

/** The allowlist as the source declares it. */
function allowlist(): string[] {
  const m = src.match(/const SHIPPER_VISIBLE_DOC_TYPES = \[([^\]]*)\]/);
  expect(m, "SHIPPER_VISIBLE_DOC_TYPES is gone — the shipper document scope is unbounded").toBeTruthy();
  return [...m![1].matchAll(/"([A-Z_]+)"/g)].map((x) => x[1]);
}

describe("shipper document scope", () => {
  it("declares an allowlist at all", () => {
    expect(allowlist().length).toBeGreaterThan(0);
  });

  it("never exposes the carrier's rate confirmation", () => {
    // The specific document that caused this. If it ever reappears here, the
    // customer can read what we pay the carrier.
    expect(allowlist()).not.toContain("RATE_CON");
  });

  it("never exposes carrier settlement or pay documents", () => {
    for (const t of ["SETTLEMENT", "CARRIER_INVOICE", "CARRIER_PAY"]) {
      expect(allowlist(), `${t} is carrier-side and must not be shipper-visible`).not.toContain(t);
    }
  });

  it("never exposes carrier onboarding paperwork", () => {
    // Another carrier's authority letter, COI or W-9 is not the shipper's to read.
    for (const t of ["AUTHORITY", "COI", "W9", "WORKERS_COMP"]) {
      expect(allowlist()).not.toContain(t);
    }
  });

  it("does not fall back to OTHER, which is unbounded by definition", () => {
    // OTHER is the bucket every unclassified upload lands in. Allowing it
    // reopens the hole with extra steps.
    expect(allowlist()).not.toContain("OTHER");
  });

  it("applies the allowlist to the document query itself", () => {
    // The constant existing proves nothing if the query stopped using it.
    const q = src.slice(src.indexOf("export async function getShipperDocuments"));
    const find = q.indexOf("prisma.document.findMany");
    expect(find).toBeGreaterThan(-1);
    expect(q.slice(find, find + 300)).toContain("SHIPPER_VISIBLE_DOC_TYPES");
  });
});
