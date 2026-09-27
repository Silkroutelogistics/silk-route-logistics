// D-2 (ruled 2026-09-26, amended): link each uploaded packet as its invoice's
// archived copy only when the stored bytes hash to deliveredFileHash. A packet
// with no upload, or no matching upload, stops the run and nothing is linked.
import { describe, it, expect } from "vitest";
import { planLinks, type PacketState } from "../../../scripts/link-bkn-archived-packets";

const H = (c: string) => c.repeat(64);
const packet = (n: number, over: Partial<PacketState> = {}): PacketState => ({
  number: `12149${n}I`, expected: H(String(n)), storedHash: H(String(n)), archivedDocumentId: null,
  candidates: [{ id: `doc-${n}`, fileName: `12149${n}I.pdf`, sha256: H(String(n)) }], ...over,
});
const four = () => [packet(2), packet(4), packet(5), packet(6)];

describe("planLinks", () => {
  it("links all four when every upload hashes to its delivered file", () => {
    const plan = planLinks(four());
    expect(plan.stop).toEqual([]);
    expect(plan.link).toEqual([
      { number: "121492I", documentId: "doc-2" }, { number: "121494I", documentId: "doc-4" },
      { number: "121495I", documentId: "doc-5" }, { number: "121496I", documentId: "doc-6" },
    ]);
  });

  it("a packet with no upload stops the run and nothing is linked", () => {
    const plan = planLinks([...four().slice(0, 3), packet(6, { candidates: [] })]);
    expect(plan.stop.join(" ")).toMatch(/121496I: no upload/);
    expect(plan.link).toEqual([]);
  });

  it("an upload whose bytes do not match stops the run and nothing is linked", () => {
    const plan = planLinks([packet(2, { candidates: [{ id: "doc-x", fileName: "wrong.pdf", sha256: H("f") }] }), ...four().slice(1)]);
    expect(plan.stop.join(" ")).toMatch(/121492I: wrong\.pdf \(doc-x\) hashes to ffffffffffff, not 222222222222/);
    expect(plan.link).toEqual([]);
  });

  it("an unreadable upload with nothing matching stops the run", () => {
    const plan = planLinks([packet(2, { candidates: [{ id: "doc-x", fileName: "a.pdf", sha256: null, readError: "no storage credentials" }] }), ...four().slice(1)]);
    expect(plan.stop.join(" ")).toMatch(/could not be read \(no storage credentials\)/);
    expect(plan.link).toEqual([]);
  });

  it("an extra upload that does not match is reported and left unlinked when another matches", () => {
    const plan = planLinks([packet(2, { candidates: [
      { id: "doc-scan", fileName: "scan.pdf", sha256: H("e") }, { id: "doc-2", fileName: "121492I.pdf", sha256: H("2") },
    ] }), ...four().slice(1)]);
    expect(plan.stop).toEqual([]);
    expect(plan.link[0]).toEqual({ number: "121492I", documentId: "doc-2" });
    expect(plan.notes.join(" ")).toMatch(/scan\.pdf \(doc-scan\) hashes to eeeeeeeeeeee.*left unlinked/);
  });

  it("an invoice whose stored hash is not the delivered file's stops the run", () => {
    const plan = planLinks([packet(2, { storedHash: H("9") }), ...four().slice(1)]);
    expect(plan.stop.join(" ")).toMatch(/121492I: the invoice's deliveredFileHash is 999999999999/);
    expect(plan.link).toEqual([]);
  });

  it("an invoice already linked is reported and not linked again", () => {
    const plan = planLinks([packet(2, { archivedDocumentId: "doc-old" }), ...four().slice(1)]);
    expect(plan.already).toEqual(["121492I: already linked to doc-old"]);
    expect(plan.link.map((l) => l.number)).toEqual(["121494I", "121495I", "121496I"]);
  });
});
