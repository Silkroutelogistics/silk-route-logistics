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
// Structural guard: TWO inventories of invoice-line writers, both frozen.
//
// The behavioural cases prove the five ledger-derived writers that exist today.
// This proves no SIXTH one appears without the stamp, and — after the pre-merge
// review found four writers OUTSIDE the service that the first cut of this guard
// could not see (§19 Sub-pattern 18: instrument reach) — that no writer anywhere
// in src/ escapes classification. Every `invoiceLineItem.create*(` and every
// nested `lineItems: { create }` on an invoice is found; a writer in the service
// must stamp; a writer elsewhere must be allow-listed with the reason it carries
// no key. A new writer in either place fails here by file:function.
//
// Spans are walked to the matching close paren skipping string and template
// contents (the descriptions contain `(`), with comments stripped so an
// `accessorialId:` in prose cannot satisfy the check, and an explicit
// `accessorialId: null` inside a ledger writer is a failure, not a stamp.
const SRC = path.resolve(__dirname, "../../../src");
const SERVICE = path.join(SRC, "services", "invoiceService.ts");
const EXPECTED_SERVICE_WRITERS = 5;

/**
 * Writers outside the service that legitimately carry no ledger key. Each entry
 * is the reason; a stale entry (function gone) fails, and a writer not listed
 * fails. The key is file#export the call sits in.
 */
const BODY_DRIVEN_WRITERS: Record<string, string> = {
  "controllers/invoiceController.ts#createInvoice": "POST /invoices — an AE-authored document from a request body; there is no ledger row to key to",
  "controllers/invoiceController.ts#updateInvoiceLineItems": "PUT /invoices/:id/line-items — replaces every line from a body that carries no key; a draft it touches is reported UNKEYED and not re-priced again (no frontend caller, Item 197)",
  "controllers/invoiceController.ts#generateInvoiceFromLoad": "POST /invoices/generate/:loadId — linehaul and fuel from the load only; NULL is correct on those",
  "controllers/accountingController.ts#updateInvoice": "PUT /accounting/invoices/:id — replaces every line from a body that carries no key; same consequence as the line-items editor (no frontend caller, Item 197)",
  "controllers/accountingController.ts#createInvoice": "POST /accounting/invoices — an AE-authored document from a request body (lineItems[] as sent); no ledger row to key to. Not named by the pre-merge review; found by this guard's first repo-wide run",
};

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}
function skipString(src: string, i: number): number {
  const q = src[i];
  i++;
  while (i < src.length && src[i] !== q) { if (src[i] === "\\") i++; i++; }
  return i + 1;
}
function walkTo(src: string, start: number, open: string, close: string): number {
  let depth = 1, i = start;
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") { i = skipString(src, i); continue; }
    if (ch === open) depth++;
    else if (ch === close) depth--;
    i++;
  }
  return i;
}
const lineOf = (src: string, idx: number) => src.slice(0, idx).split(/\r?\n/).length;
function enclosingExport(src: string, idx: number): string {
  const re = /export\s+(?:async\s+)?(?:function|const)\s+([A-Za-z0-9_]+)/g;
  let m: RegExpExecArray | null, name = "(module)";
  while ((m = re.exec(src)) && m.index < idx) name = m[1];
  return name;
}

/** Every invoice-line writer span in `src` (comments already stripped). */
function lineItemWriterSpans(src: string): { line: number; span: string; fn: string }[] {
  const out: { line: number; span: string; fn: string }[] = [];
  const direct = /invoiceLineItem\s*\.\s*create(?:Many)?\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = direct.exec(src))) {
    const end = walkTo(src, m.index + m[0].length, "(", ")");
    out.push({ line: lineOf(src, m.index), span: src.slice(m.index, end), fn: enclosingExport(src, m.index) });
  }
  // A nested create on an INVOICE write — lineItems: { create ... } whose nearest
  // preceding prisma call is on the invoice model. The same shape on a load is LoadLineItem.
  const nested = /lineItems\s*:\s*(?:[A-Za-z0-9_.?]+\s*\?\s*)?\{\s*create\s*:/g;
  while ((m = nested.exec(src))) {
    const before = src.slice(Math.max(0, m.index - 1500), m.index);
    const model = [...before.matchAll(/prisma\.([a-zA-Z]+)\s*\.\s*(?:create|update|upsert)\s*\(/g)].at(-1)?.[1];
    if (model !== "invoice") continue;
    const braceOpen = src.lastIndexOf("{", m.index + m[0].length);
    const end = walkTo(src, braceOpen + 1, "{", "}");
    out.push({ line: lineOf(src, m.index), span: src.slice(m.index, end), fn: enclosingExport(src, m.index) });
  }
  return out.sort((a, b) => a.line - b.line);
}
function walkTs(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkTs(full, acc);
    else if (/\.ts$/.test(e.name) && !/\.d\.ts$/.test(e.name)) acc.push(full);
  }
  return acc;
}
const stamps = (span: string) => /\baccessorialId\s*:/.test(span) && !/\baccessorialId\s*:\s*null\b/.test(span);

describe("the writer inventories are frozen and every ledger writer stamps", () => {
  const serviceSrc = stripComments(fs.readFileSync(SERVICE, "utf8"));
  const serviceSpans = lineItemWriterSpans(serviceSrc);

  it(`the service holds exactly ${EXPECTED_SERVICE_WRITERS} ledger-derived writers (a new one must be read, not assumed)`, () => {
    expect(serviceSpans.length).toBeGreaterThan(0); // the walker still matches the real file
    expect(serviceSpans.map((s) => s.line)).toHaveLength(EXPECTED_SERVICE_WRITERS);
  });

  it("every service writer sets accessorialId inside its createMany, and never to a literal null", () => {
    const unstamped = serviceSpans.filter((s) => !stamps(s.span));
    expect(unstamped.map((s) => `invoiceService.ts:${s.line}`)).toEqual([]);
  });

  it("every writer OUTSIDE the service is allow-listed with its reason, and every allow-list entry still exists", () => {
    const found = new Map<string, number>();
    for (const file of walkTs(SRC)) {
      if (path.resolve(file) === path.resolve(SERVICE)) continue;
      const src = stripComments(fs.readFileSync(file, "utf8"));
      for (const w of lineItemWriterSpans(src)) {
        found.set(`${path.relative(SRC, file).replace(/\\/g, "/")}#${w.fn}`, w.line);
      }
    }
    expect(found.size).toBeGreaterThan(0); // vacuity: the repo-wide walk still finds the known writers
    const unlisted = [...found].filter(([k]) => !(k in BODY_DRIVEN_WRITERS)).map(([k, l]) => `${k}:${l}`);
    expect(unlisted).toEqual([]);
    const stale = Object.keys(BODY_DRIVEN_WRITERS).filter((k) => !found.has(k));
    expect(stale).toEqual([]);
  });

  // The walker's own fixtures. A guard that stopped matching, that lost the span at
  // the first `(` inside a description, that read a comment as a stamp, or that
  // accepted a null stamp would report a clean file either way.
  it("walker: an unstamped writer is reported by line, a stamped one is not", () => {
    const fixture = stripComments([
      "export async function a() {",
      "await tx.invoiceLineItem.createMany({ data: rows.map((r) => ({ invoiceId: inv.id, description: `${p.label} (${r.notes})`, amount: r.amount })) });",
      "}",
      "export async function b() {",
      "await tx.invoiceLineItem.createMany({ data: rows.map((r) => ({ invoiceId: inv.id, accessorialId: r.id, description: 'x (y)', amount: r.amount })) });",
      "}",
    ].join("\n"));
    const found = lineItemWriterSpans(fixture);
    expect(found.map((s) => [s.line, s.fn])).toEqual([[2, "a"], [5, "b"]]);
    expect(found[0].span.endsWith("})) })")).toBe(true); // the template literal's "(" did not end the span early
    expect(found.filter((s) => !stamps(s.span)).map((s) => s.line)).toEqual([2]);
  });

  it("walker: a stamp in a comment does not count, and a literal null is not a stamp", () => {
    const commented = stripComments("tx.invoiceLineItem.createMany({ data: rows.map((r) => ({ invoiceId: inv.id, /* accessorialId: r.id */ amount: r.amount })) });");
    expect(stamps(lineItemWriterSpans(commented)[0].span)).toBe(false);
    const nulled = "tx.invoiceLineItem.createMany({ data: rows.map((r) => ({ invoiceId: inv.id, accessorialId: null, amount: r.amount })) });";
    expect(stamps(lineItemWriterSpans(nulled)[0].span)).toBe(false);
  });

  it("walker: a nested create on an invoice is a writer; the same shape on a load is not", () => {
    const onInvoice = "export async function up() { await prisma.invoice.update({ where: { id }, data: { lineItems: lineItems?.length ? { create: lineItems.map((i) => ({ description: i.d })) } : undefined } }); }";
    expect(lineItemWriterSpans(onInvoice).map((s) => s.fn)).toEqual(["up"]);
    const onLoad = "export async function mk() { await prisma.load.create({ data: { ...(lineItems ? { lineItems: { create: lineItems } } : {}) } }); }";
    expect(lineItemWriterSpans(onLoad)).toEqual([]);
  });

  it("walker: survives CRLF and an escaped quote inside a string", () => {
    const fixture = "x\r\ntx.invoiceLineItem.createMany({ data: [{ description: \"it\\\"s (open\", accessorialId: id }] });\r\n";
    const found = lineItemWriterSpans(fixture);
    expect(found).toHaveLength(1);
    expect(found[0].line).toBe(2);
    expect(found[0].span.endsWith("}] })")).toBe(true);
  });
});
