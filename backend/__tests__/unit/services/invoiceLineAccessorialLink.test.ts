// §13.3 Item 282a — every accessorial line on a customer invoice names the ledger
// row it bills or credits.
//
// Before this column existed, the customer leg's exactly-once was a mark on the
// LEDGER row (shipperInvoiceId) and the line item carried nothing back. So once a
// DRAFT had folded a $200 TONU in, the row was stamped, the line could not be
// found, and a later edit of the row to $250 billed $200 forever. The link is the
// precondition for re-pricing a draft line by line (282c) rather than by total.
//
// Two halves. The behavioural cases drive the real functions through a mocked
// Prisma whose ledger mock ANSWERS THE WHERE IT IS GIVEN — status and stamp —
// rather than returning one array to every caller, because a fixture built from
// the same assumption as the code under test proves nothing (§13.3 Item 273.10).
// The structural guard then freezes the inventory of writer sites, so a sixth
// accessorial-line writer added without the stamp fails here by file:line.
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { prisma } from "../../../src/config/database";
import {
  autoGenerateInvoice,
  syncInvoiceAccessorials,
  creditRejectedAccessorials,
} from "../../../src/services/invoiceService";

const mockPrisma = vi.mocked(prisma, true) as any;

// ── Fixture ──────────────────────────────────────────────────────────
// Two approved-and-unbilled charges, and one that was billed and then rejected.
const LEDGER = [
  { id: "acc-det", type: "DETENTION_DEL", amount: 150, customerAmount: null, quantity: null, notes: "5h dwell", billedTo: "SHIPPER", status: "APPROVED", shipperInvoiceId: null, rejectedReason: null },
  { id: "acc-lump", type: "LUMPER", amount: 150, customerAmount: null, quantity: null, notes: "receipt on file", billedTo: "SHIPPER", status: "APPROVED", shipperInvoiceId: null, rejectedReason: null },
  { id: "acc-rej", type: "DETENTION_PU", amount: 100, customerAmount: null, quantity: null, notes: null, billedTo: "SHIPPER", status: "REJECTED", shipperInvoiceId: "inv-base", rejectedReason: "no timestamps" },
];

/**
 * The ledger mock evaluates the query's WHERE against the fixture. The service
 * asks two different questions of this table — "APPROVED and unstamped" for the
 * charge path, "REJECTED and stamped" for the credit path — and a mock that
 * ignored the WHERE would hand the rejected row to the charge path and bill it.
 */
function ledgerAnsweringTheWhere(rows = LEDGER) {
  mockPrisma.loadAccessorial.findMany.mockImplementation(async ({ where }: any) => {
    return rows.filter((r) => {
      if (where?.status && r.status !== where.status) return false;
      if (where && "shipperInvoiceId" in where) {
        const w = where.shipperInvoiceId;
        if (w === null && r.shipperInvoiceId !== null) return false;
        if (w && typeof w === "object" && "not" in w && w.not === null && r.shipperInvoiceId === null) return false;
      }
      return true;
    });
  });
}

const LOAD = {
  id: "load-1",
  referenceNumber: "SRL-121485",
  loadNumber: "SRL-121485",
  posterId: "ae-1",
  customerRate: 3000,
  fuelSurcharge: 400,
  originCity: "Detroit",
  originState: "MI",
  destCity: "Chicago",
  destState: "IL",
  customer: null,
};

const BASE_DRAFT = {
  id: "inv-base",
  invoiceNumber: "INV-1043",
  srlDocNumber: "SRL-121485I",
  status: "DRAFT",
  userId: "ae-1",
  amount: 3400,
  totalAmount: 3400,
  accessorialsAmount: 0,
};

/** Every line handed to prisma.invoiceLineItem.createMany, across all calls. */
function writtenLines(): any[] {
  return mockPrisma.invoiceLineItem.createMany.mock.calls.flatMap((c: any) => c[0].data);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
  mockPrisma.invoiceLineItem.createMany.mockResolvedValue({ count: 1 });
  mockPrisma.invoiceLineItem.count.mockResolvedValue(0);
  // 282c reads the draft's lines back before folding; these drafts start empty.
  mockPrisma.invoiceLineItem.findMany.mockResolvedValue([]);
  mockPrisma.loadAccessorial.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.notification.create.mockResolvedValue({});
  mockPrisma.invoice.findMany.mockResolvedValue([]); // document-number scans
  mockPrisma.invoice.update.mockResolvedValue({});
  mockPrisma.load.findUnique.mockResolvedValue(LOAD);
});

// ─────────────────────────────────────────────────────────────────────
describe("the stamp on every charge path", () => {
  it("BASE invoice: each accessorial line names its ledger row; linehaul and fuel are NULL", async () => {
    ledgerAnsweringTheWhere();
    mockPrisma.invoice.findFirst.mockResolvedValue(null); // no base yet
    mockPrisma.invoice.findUnique.mockResolvedValue(null); // credit path: nothing to look up
    mockPrisma.invoice.create.mockImplementation(async ({ data }: any) => ({ id: "inv-1", ...data }));

    await autoGenerateInvoice("load-1");

    const lines = writtenLines();
    expect(lines).toHaveLength(4);
    const byType = Object.fromEntries(lines.map((l: any) => [l.type, l]));
    expect(byType.LINEHAUL.accessorialId).toBeNull();
    expect(byType.FUEL_SURCHARGE.accessorialId).toBeNull();
    expect(byType.DETENTION.accessorialId).toBe("acc-det");
    expect(byType.LUMPER.accessorialId).toBe("acc-lump");
    // And the stamp is the same id the ledger row is marked with — one key, both directions.
    expect(mockPrisma.loadAccessorial.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["acc-det", "acc-lump"] } },
      data: { shipperInvoiceId: "inv-1" },
    });
  });

  it("DRAFT fold: the lines appended to an open draft carry the row ids", async () => {
    ledgerAnsweringTheWhere(LEDGER.filter((r) => r.status === "APPROVED"));
    mockPrisma.invoice.findFirst.mockResolvedValue(BASE_DRAFT);
    mockPrisma.invoice.findUnique.mockResolvedValue({ id: "inv-base" });

    await syncInvoiceAccessorials("load-1");

    expect(mockPrisma.invoice.create).not.toHaveBeenCalled();
    const lines = writtenLines();
    expect(lines.map((l: any) => l.accessorialId).sort()).toEqual(["acc-det", "acc-lump"]);
    expect(lines.every((l: any) => l.invoiceId === "inv-base")).toBe(true);
  });

  it("SUPPLEMENTAL: the lines on the new document carry the row ids", async () => {
    ledgerAnsweringTheWhere(LEDGER.filter((r) => r.status === "APPROVED"));
    mockPrisma.invoice.findFirst.mockResolvedValue({ ...BASE_DRAFT, status: "SENT" });
    mockPrisma.invoice.create.mockImplementation(async ({ data }: any) => ({ id: "inv-supp", ...data }));

    await syncInvoiceAccessorials("load-1");

    expect(mockPrisma.invoice.create.mock.calls[0][0].data.invoiceKind).toBe("SUPPLEMENTAL");
    const lines = writtenLines();
    expect(lines.map((l: any) => l.accessorialId).sort()).toEqual(["acc-det", "acc-lump"]);
    expect(lines.every((l: any) => l.invoiceId === "inv-supp")).toBe(true);
  });
});

describe("the stamp on both credit paths", () => {
  it("DRAFT credit: the negative line names the rejected row it takes off", async () => {
    ledgerAnsweringTheWhere();
    mockPrisma.invoice.findUnique.mockResolvedValue(BASE_DRAFT); // the stamped invoice, still a draft

    await creditRejectedAccessorials("load-1");

    const lines = writtenLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ invoiceId: "inv-base", accessorialId: "acc-rej", amount: -100 });
    expect(lines[0].description).toContain("rejected: no timestamps");
    expect(mockPrisma.invoice.create).not.toHaveBeenCalled();
  });

  it("SUPPLEMENTAL credit memo: the negative line on the new document names the rejected row", async () => {
    ledgerAnsweringTheWhere();
    mockPrisma.invoice.findUnique.mockResolvedValue({ ...BASE_DRAFT, status: "SENT" });
    mockPrisma.invoice.create.mockImplementation(async ({ data }: any) => ({ id: "inv-credit", ...data }));

    await creditRejectedAccessorials("load-1");

    const memo = mockPrisma.invoice.create.mock.calls[0][0].data;
    expect(memo.invoiceKind).toBe("SUPPLEMENTAL");
    expect(memo.totalAmount).toBe(-100);
    const lines = writtenLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ invoiceId: "inv-credit", accessorialId: "acc-rej", amount: -100 });
  });

  it("the ledger mock is not vacuous: the charge path never sees the rejected row", async () => {
    // If the WHERE were ignored, the REJECTED row would be billed as a charge.
    ledgerAnsweringTheWhere();
    mockPrisma.invoice.findFirst.mockResolvedValue(null);
    mockPrisma.invoice.findUnique.mockResolvedValue(null);
    mockPrisma.invoice.create.mockImplementation(async ({ data }: any) => ({ id: "inv-1", ...data }));

    await autoGenerateInvoice("load-1");

    expect(writtenLines().map((l: any) => l.accessorialId)).not.toContain("acc-rej");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Structural guard: the inventory of accessorial-line writers.
//
// The behavioural cases prove the five writers that exist today. This proves no
// SIXTH one appears without the stamp. It walks every `invoiceLineItem.createMany(`
// in the service, takes the span to the matching close paren — skipping string
// and template-literal contents, because the descriptions contain `(` — and
// asserts `accessorialId` is set inside it. The count is FROZEN: it may not grow
// without this file being updated, so the new writer is read rather than assumed.
const SERVICE = path.resolve(__dirname, "../../../src/services/invoiceService.ts");
const EXPECTED_WRITERS = 5;

/** Every createMany call span in `src`, with the 1-indexed line it starts on. */
function lineItemWriterSpans(src: string): { line: number; span: string }[] {
  const out: { line: number; span: string }[] = [];
  const re = /invoiceLineItem\s*\.\s*createMany\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const start = m.index + m[0].length;
    let depth = 1;
    let i = start;
    while (i < src.length && depth > 0) {
      const ch = src[i];
      if (ch === '"' || ch === "'" || ch === "`") {
        const q = ch;
        i++;
        while (i < src.length && src[i] !== q) {
          if (src[i] === "\\") i++;
          i++;
        }
      } else if (ch === "(") depth++;
      else if (ch === ")") depth--;
      i++;
    }
    const line = src.slice(0, m.index).split(/\r?\n/).length;
    out.push({ line, span: src.slice(m.index, i) });
  }
  return out;
}

describe("the writer inventory is frozen and every writer stamps", () => {
  const src = fs.readFileSync(SERVICE, "utf8");
  const spans = lineItemWriterSpans(src);

  it(`finds exactly ${EXPECTED_WRITERS} accessorial-line writers (a new one must be read, not assumed)`, () => {
    expect(spans.length).toBeGreaterThan(0); // the walker still matches the real file
    expect(spans.map((s) => s.line)).toHaveLength(EXPECTED_WRITERS);
  });

  it("every writer sets accessorialId inside its createMany", () => {
    const unstamped = spans.filter((s) => !/\baccessorialId\s*:/.test(s.span));
    expect(unstamped.map((s) => `invoiceService.ts:${s.line}`)).toEqual([]);
  });

  // The walker's own fixtures. A guard that stopped matching, or that lost the
  // span at the first `(` inside a description string, would report a clean
  // file either way — so it is tested against the shapes it must handle.
  it("walker: an unstamped writer is reported by line, a stamped one is not", () => {
    const fixture = [
      "a();",
      "await tx.invoiceLineItem.createMany({ data: rows.map((r) => ({ invoiceId: inv.id, description: `${p.label} (${r.notes})`, amount: r.amount })) });",
      "b();",
      "await tx.invoiceLineItem.createMany({ data: rows.map((r) => ({ invoiceId: inv.id, accessorialId: r.id, description: 'x (y)', amount: r.amount })) });",
    ].join("\n");
    const found = lineItemWriterSpans(fixture);
    expect(found.map((s) => s.line)).toEqual([2, 4]);
    // The template literal's `(` did not end the first span early: the span runs to its real close.
    expect(found[0].span.endsWith("})) })")).toBe(true);
    expect(found.filter((s) => !/\baccessorialId\s*:/.test(s.span)).map((s) => s.line)).toEqual([2]);
  });

  it("walker: survives CRLF and an escaped quote inside a string", () => {
    const fixture = "x\r\ntx.invoiceLineItem.createMany({ data: [{ description: \"it\\\"s (open\", accessorialId: id }] });\r\n";
    const found = lineItemWriterSpans(fixture);
    expect(found).toHaveLength(1);
    expect(found[0].line).toBe(2);
    expect(found[0].span.endsWith("}] })")).toBe(true);
  });
});
