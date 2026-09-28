// CONTAIN (ruled 2026-09-27): the four Beekeepers packets, stored as INVOICE on upload, are
// retyped to OTHER -- exactly those four, only while they are still the packets on their loads.
import { describe, it, expect } from "vitest";
import { planRetype, PACKET_DOCUMENTS, FROM_TYPE, TO_TYPE, REASON, type DocState } from "../../../scripts/retype-bkn-packet-documents";
import { TARGETS } from "../../../scripts/_bknTipaltiPlan";

const asUploaded = (): DocState[] => PACKET_DOCUMENTS.map((p) => {
  const t = TARGETS.find((x) => x.number === p.number)!;
  return { id: p.documentId, loadId: t.loadId, fileName: t.packet, docType: FROM_TYPE };
});

describe("planRetype", () => {
  it("retypes all four as the census found them", () => {
    const plan = planRetype(asUploaded());
    expect(plan.refuse).toEqual([]);
    expect(plan.retype).toEqual(PACKET_DOCUMENTS.map((p) => p.documentId));
    expect([FROM_TYPE, TO_TYPE, REASON]).toEqual(["INVOICE", "OTHER", "SRL customer invoice copy, mis-typed on upload"]);
  });

  it("a second run finds them done and writes nothing", () => {
    const plan = planRetype(asUploaded().map((d) => ({ ...d, docType: TO_TYPE })));
    expect(plan).toEqual({ retype: [], done: PACKET_DOCUMENTS.map((p) => p.documentId), refuse: [] });
  });

  it("a document on another load refuses the whole run", () => {
    const docs = asUploaded(); docs[1] = { ...docs[1], loadId: "someone-elses-load" };
    const plan = planRetype(docs);
    expect(plan.refuse.join(" ")).toMatch(/121494I: .* is on someone-elses-load, not SRL-121494/);
    expect(plan.retype).toEqual([]);
  });

  it("a document that is not the packet refuses the whole run", () => {
    const docs = asUploaded(); docs[0] = { ...docs[0], fileName: "carrier-invoice.pdf" };
    expect(planRetype(docs).refuse.join(" ")).toMatch(/121492I: .* is "carrier-invoice.pdf", not the packet "121492I-Invoice-and-BOL.pdf"/);
    expect(planRetype(docs).retype).toEqual([]);
  });

  it("a document already retyped to something else refuses rather than guessing", () => {
    const docs = asUploaded(); docs[3] = { ...docs[3], docType: "POD" };
    expect(planRetype(docs).refuse.join(" ")).toMatch(/121496I: .* is POD, expected INVOICE/);
  });

  it("a missing document refuses the whole run", () => {
    expect(planRetype(asUploaded().slice(1)).refuse.join(" ")).toMatch(/121492I: document cmukgu2lp001gmn2dmh7g7x4a not found/);
    expect(planRetype(asUploaded().slice(1)).retype).toEqual([]);
  });

  it("never touches the fifth upload (the Jetex TONU confirmation, RATE_CON)", () => {
    expect(PACKET_DOCUMENTS.map((p) => p.documentId)).not.toContain("cmukgv6b5001ymn2dd47tajev");
  });
});
