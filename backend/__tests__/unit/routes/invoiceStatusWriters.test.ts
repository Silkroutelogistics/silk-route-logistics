/**
 * v3.8.bns — ruling 2026-09-27, 6: an invoice's status is not writable through
 * any edit or request-body path. Only the aging job, payment posting, send and
 * void set it.
 *
 * Two source guards, because the rule has two ends:
 *
 *   BACKEND   every prisma write to an invoice whose data names a status (or
 *             whose data the scanner cannot read) is on a named list with the
 *             act that sets it. A new writer fails here until someone decides
 *             it belongs; a stale entry fails too, since dead permission
 *             silently widens a guard.
 *   FRONTEND  no page sends a status to an invoice write endpoint.
 *
 * The scanner matches across line breaks and reads the `data:` object with
 * brace balancing, so a wrapped chain or a shorthand `{ status }` is seen
 * (§19 Sub-pattern 18). Its self-tests below are the gate, not the count.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const BACKEND_SRC = path.join(__dirname, "../../../src");
const FRONTEND_SRC = path.join(__dirname, "../../../../frontend/src");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!["node_modules", ".next", "out"].includes(e.name)) walk(p, out); }
    else if (/\.(ts|tsx)$/.test(p) && !/\.(test|spec)\.(ts|tsx)$/.test(p) && !p.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

/** The text between the bracket at `open` and its match. Comments are blanked by the caller. */
function balanced(src: string, open: number): string {
  const [o, c] = src[open] === "{" ? ["{", "}"] : ["(", ")"];
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === o) depth++;
    else if (src[i] === c && --depth === 0) return src.slice(open + 1, i);
  }
  return src.slice(open + 1);
}

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`])\/\/[^\n]*/g, (m, p) => p + " ".repeat(m.length - p.length));

/** Only the object's own keys: nested objects are blanked so `where: { status }` inside does not count. */
const ownKeysText = (obj: string) => {
  let out = "", depth = 0;
  for (const ch of obj) {
    if (ch === "{" || ch === "(" || ch === "[") depth++;
    if (depth === 0) out += ch;
    if (ch === "}" || ch === ")" || ch === "]") depth--;
  }
  return out;
};

export type Write = { key: string; kind: "status" | "unreadable"; line: number };

function scanInvoiceWrites(src: string, file: string): Write[] {
  const code = stripComments(src);
  const found: Write[] = [];
  const call = /\.invoice\s*\.\s*(create|createMany|update|updateMany|upsert)\s*\(/g;
  for (let m; (m = call.exec(code)); ) {
    const args = balanced(code, m.index + m[0].length - 1);
    const d = /\bdata\s*:\s*/.exec(args);
    let kind: Write["kind"] | null = null;
    if (!d) kind = /\bdata\b/.test(ownKeysText(args)) ? "unreadable" : null; // shorthand `{ data }`
    else if (args[d.index + d[0].length] !== "{") kind = "unreadable";
    else {
      const own = ownKeysText(balanced(args, d.index + d[0].length));
      if (/(^|[\s,])status\s*[:,}]|(^|[\s,])status\s*$/.test(own)) kind = "status";
      else if (/\.\.\./.test(own)) kind = "unreadable";
    }
    if (!kind) continue;
    const before = code.slice(0, m.index);
    // The enclosing named function. Arrow helpers (const build = () =>) are
    // skipped so the key names the handler, which is what the list decides on.
    const fns = [...before.matchAll(/function\s+(\w+)/g)];
    const fn = fns.length ? fns[fns.length - 1][1] : "<module>";
    found.push({ key: `${file}:${fn}`, kind, line: before.split("\n").length });
  }
  return found;
}

function scanBackend(): Write[] {
  return walk(BACKEND_SRC).flatMap((f) =>
    scanInvoiceWrites(fs.readFileSync(f, "utf8"), path.relative(BACKEND_SRC, f).split(path.sep).join("/")));
}

/** Every invoice write the backend may make that names a status, and the act it is. */
const STATUS_WRITERS: Record<string, string> = {
  // The four acts the ruling names.
  "services/invoiceAging.ts:markPastDueInvoicesOverdue": "aging job: OVERDUE",
  "controllers/accountingController.ts:markInvoicePaid": "payment posting: PAID or PARTIAL",
  "controllers/invoiceController.ts:markInvoicePaid": "payment posting: PAID or PARTIAL",
  "controllers/accountingController.ts:sendInvoice": "send: SENT once the email is accepted",
  "controllers/accountingController.ts:markInvoiceSent": "send: SENT for a delivery made outside SRL",
  "controllers/invoiceController.ts:generateInvoiceFromLoad": "created DRAFT; send: SENT once the email is accepted",
  "controllers/accountingController.ts:voidInvoice": "void: VOID",
  "services/integrationService.ts:onLoadCancelledOrTONU": "void: VOID when the load is cancelled",
  // Creation. A new invoice starts DRAFT; creating one is not setting a status.
  "controllers/accountingController.ts:createInvoice": "created DRAFT",
  "controllers/invoiceController.ts:createInvoice": "created from createInvoiceSchema output, which declares no status: DRAFT by default",
  "services/invoiceService.ts:autoGenerateInvoice": "created DRAFT",
  "services/invoiceService.ts:creditRejectedAccessorials": "created DRAFT (credit memo)",
  "services/invoiceService.ts:raiseTonuCustomerCharge": "created DRAFT",
  "services/invoiceService.ts:syncInvoiceAccessorials": "created DRAFT (supplemental)",
  // Not a status write; the scanner cannot read a hoisted payload. Checked below.
  "services/arCollectionsService.ts:processArReminders": "reminder flags only",
  // PENDING DECISION: outside the ruling's list. Neither takes a status from a
  // body. Raised for a ruling rather than removed.
  "controllers/invoiceController.ts:submitForFactoring": "PENDING DECISION: SUBMITTED when submitted for factoring",
  "controllers/customerController.ts:restoreCustomer": "PENDING DECISION: VOID back to SUBMITTED when a customer is restored",
};

/** Frontend invoice writes whose body is a variable the scanner cannot read, and what it holds. */
const FRONTEND_UNREADABLE: Record<string, string> = {
  "components/invoices/CreateInvoiceModal.tsx": "payload: loadId, amount, lineItems",
};

function scanFrontend(src: string, file: string): { status: string[]; unreadable: string[]; writes: number } {
  const code = stripComments(src);
  const status: string[] = [], unreadable: string[] = [];
  let writes = 0;
  const call = /\bapi\s*\.\s*(post|put|patch)\s*(?:<[^>()]*>)?\s*\(/g;
  for (let m; (m = call.exec(code)); ) {
    const args = balanced(code, m.index + m[0].length - 1);
    const comma = args.search(/,/);
    const url = comma < 0 ? args : args.slice(0, comma);
    if (!/invoices/.test(url)) continue;
    writes++;
    const line = code.slice(0, m.index).split("\n").length;
    const body = comma < 0 ? "" : args.slice(comma + 1).trim();
    if (!body) continue;
    if (body[0] !== "{") { unreadable.push(`${file}:${line}`); continue; }
    if (/(^|[\s,])status\s*[:,}]/.test(ownKeysText(balanced(body, 0)))) status.push(`${file}:${line}`);
  }
  if (/\/invoices\/batch\/status|\/invoices\/\$\{[^}]+\}\/status/.test(code)) status.push(`${file}:status-route`);
  return { status, unreadable, writes };
}

describe("the scanners see what they claim to (self-tests)", () => {
  const b = (s: string) => scanInvoiceWrites(s, "f.ts").map((w) => w.kind);
  it("backend: a wrapped chain, a shorthand and a spread are seen; a where clause is not", () => {
    expect(b(`function a(){ await prisma.invoice\n  .update({ where: { id }, data: { status: "X" } }) }`)).toEqual(["status"]);
    expect(b(`function a(){ tx.invoice.updateMany({ where: {}, data: { status } }) }`)).toEqual(["status"]);
    expect(b(`function a(){ prisma.invoice.update({ where: { status: "SENT" }, data: { notes: "x" } }) }`)).toEqual([]);
    expect(b(`function a(){ prisma.invoice.update({ where: {}, data: updateData }) }`)).toEqual(["unreadable"]);
    expect(b(`function a(){ prisma.invoice.create({ data: { ...body, amount } }) }`)).toEqual(["unreadable"]);
    expect(b(`function a(){ // prisma.invoice.update({ data: { status: "X" } })\n}`)).toEqual([]);
  });
  it("backend: the key names the enclosing function, not an arrow helper", () => {
    const [w] = scanInvoiceWrites(`export async function handler(){ const build = () => prisma.invoice.create({ data: { status: "DRAFT" } }); }`, "f.ts");
    expect(w.key).toBe("f.ts:handler");
  });
  it("frontend: a status in an invoice write body is seen; other bodies and other models are not", () => {
    const f = (s: string) => scanFrontend(s, "p.tsx").status.length;
    expect(f("api.patch(`/invoices/${id}`, {\n  status: \"APPROVED\",\n  fee: 1 })")).toBe(1);
    expect(f("api.post(\"/invoices/batch/status\", { ids })")).toBe(1);
    expect(f("api.put(`/accounting/invoices/${id}/mark-paid`, { paidAmount: 1 })")).toBe(0);
    expect(f("api.post(\"/loads/1\", { status: \"X\" })")).toBe(0);
  });
});

describe("invoice status writers (ruling 2026-09-27, 6)", () => {
  const writes = scanBackend();

  it("every backend write that names a status is on the list, and every list entry still writes one", () => {
    const seen = [...new Set(writes.map((w) => w.key))].sort();
    expect(writes.length).toBeGreaterThan(10); // vacuity: the scanner found the known writers
    expect(seen).toEqual(Object.keys(STATUS_WRITERS).sort());
  });

  it("the reminder job's hoisted payload carries no status", () => {
    const src = fs.readFileSync(path.join(BACKEND_SRC, "services/arCollectionsService.ts"), "utf8");
    const start = src.indexOf("const updateData");
    const block = src.slice(start, src.indexOf("prisma.invoice.update", start));
    expect(start).toBeGreaterThan(-1);
    expect(block).not.toMatch(/\bstatus\b/);
  });

  it("no frontend page sends a status to an invoice write endpoint", () => {
    const files = walk(FRONTEND_SRC);
    const scans = files.map((f) => scanFrontend(fs.readFileSync(f, "utf8"), path.relative(FRONTEND_SRC, f).split(path.sep).join("/")));
    expect(scans.reduce((n, s) => n + s.writes, 0)).toBeGreaterThanOrEqual(6); // vacuity
    expect(scans.flatMap((s) => s.status)).toEqual([]);
    const unreadable = [...new Set(scans.flatMap((s) => s.unreadable).map((u) => u.replace(/:\d+$/, "")))].sort();
    expect(unreadable).toEqual(Object.keys(FRONTEND_UNREADABLE).sort());
  });
});
