// D-2, changed (ruled 2026-09-28): link each invoice to its packet document only when a file
// Wasi downloaded from the TMS hashes to the invoice's deliveredFileHash. Any mismatch stops.
import { describe, it, expect } from "vitest";
import { planLocalLinks, type LocalFile, type InvoiceState } from "../../../scripts/link-bkn-stored-packets";
import { TARGETS } from "../../../scripts/_bknTipaltiPlan";

// The four packets as uploaded 2026-09-27 (sizes from production) and downloaded unchanged.
const SIZES: Record<string, number> = { "121492I": 319456, "121494I": 1032322, "121495I": 1795360, "121496I": 311263 };
const files = (): LocalFile[] => TARGETS.map((t) => ({ name: `dl-${t.number}.pdf`, size: SIZES[t.number], sha256: t.sha256 }));
const invoices = (docType = "OTHER"): InvoiceState[] => TARGETS.map((t) => ({
  number: t.number, storedHash: t.sha256, archivedDocumentId: null,
  docs: [{ id: `doc-${t.number}`, fileName: t.packet, fileSize: SIZES[t.number], docType }],
}));

describe("planLocalLinks", () => {
  it("links all four when every downloaded file is a delivered packet", () => {
    const plan = planLocalLinks(files(), invoices());
    expect(plan.stop).toEqual([]);
    expect(plan.link.map((l) => `${l.number}->${l.documentId}`)).toEqual(TARGETS.map((t) => `${t.number}->doc-${t.number}`));
  });

  it("accepts the packet documents as CUSTOMER_INVOICE_COPY too, so the retype order does not matter", () => {
    expect(planLocalLinks(files(), invoices("CUSTOMER_INVOICE_COPY")).link).toHaveLength(4);
  });

  it("a downloaded file that is no delivered packet stops the run", () => {
    const plan = planLocalLinks([...files(), { name: "scan.pdf", size: 10, sha256: "e".repeat(64) }], invoices());
    expect(plan.stop.join(" ")).toMatch(/stored\/scan\.pdf hashes to eeeeeeeeeeee, which is no delivered packet/);
    expect(plan.link).toEqual([]);
  });

  it("a packet with no downloaded copy stops the run", () => {
    const plan = planLocalLinks(files().slice(1), invoices());
    expect(plan.stop.join(" ")).toMatch(/121492I: no file in stored\/ hashes to the delivered/);
    expect(plan.link).toEqual([]);
  });

  it("an empty stored/ stops the run", () => {
    expect(planLocalLinks([], invoices()).stop.join(" ")).toMatch(/stored\/ holds no files/);
  });

  it("a size that differs from the document's stops the run", () => {
    const inv = invoices(); inv[1].docs[0] = { ...inv[1].docs[0], fileSize: 1 };
    expect(planLocalLinks(files(), inv).stop.join(" ")).toMatch(/121494I: document doc-121494I is 1 bytes, the downloaded file 1032322/);
  });

  it("the document must still be the packet: INVOICE, another name, or two copies each stop", () => {
    for (const docs of [[{ id: "d", fileName: TARGETS[2].packet, fileSize: SIZES["121495I"], docType: "INVOICE" }],
                        [{ id: "d", fileName: "other.pdf", fileSize: SIZES["121495I"], docType: "OTHER" }],
                        [{ id: "a", fileName: TARGETS[2].packet, fileSize: SIZES["121495I"], docType: "OTHER" }, { id: "b", fileName: TARGETS[2].packet, fileSize: SIZES["121495I"], docType: "OTHER" }]]) {
      const inv = invoices(); inv[2].docs = docs;
      expect(planLocalLinks(files(), inv).stop.join(" ")).toMatch(/121495I: \d packet documents named/);
    }
  });

  it("an invoice whose deliveredFileHash is not the plan's stops the run", () => {
    const inv = invoices(); inv[3].storedHash = "9".repeat(64);
    expect(planLocalLinks(files(), inv).stop.join(" ")).toMatch(/121496I: the invoice's deliveredFileHash is 999999999999/);
  });

  it("an already-linked invoice is reported and not relinked", () => {
    const inv = invoices(); inv[0].archivedDocumentId = "doc-old";
    const plan = planLocalLinks(files(), inv);
    expect(plan.already).toEqual(["121492I: already linked to doc-old"]);
    expect(plan.link.map((l) => l.number)).toEqual(["121494I", "121495I", "121496I"]);
  });
});
