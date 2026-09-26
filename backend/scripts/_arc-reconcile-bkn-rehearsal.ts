/**
 * Rehearsal for scripts/reconcile-bkn-tipalti.ts, LOCAL ONLY: seeds a container in production's
 * shape (ids, numbers, amounts, lines, ledger stamps and rate card from the 2026-09-26 read-only
 * snapshot); then wrong packets, an already-SENT invoice, a dry run, the write and a re-run.
 *   RESEND_API_KEY= OPENPHONE_API_KEY= QUO_API_KEY= DATABASE_URL=<local> npx tsx scripts/_arc-reconcile-bkn-rehearsal.ts
 */
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { hostOf, isLocalHost } from "./prisma-target-guard";
import { TARGETS, BKN_CUSTOMER_ID, RECORDED_BY, DELIVERED_AT, ISSUED_AT, DUE_DATE, BILLING, lineDescription, totalsFor } from "./_bknTipaltiPlan";

if (!isLocalHost(hostOf(process.env.DATABASE_URL ?? ""))) { console.error("REFUSED: a local DATABASE_URL only"); process.exit(2); }
const B = path.resolve(__dirname, "..");
const PACKETS = path.resolve(B, "../docs/sent-invoices/bkn-2026-09");
let p: any; // the shared client, pointed at DATABASE_URL (ownPrismaClientCensus)
const LOAD_IDS = TARGETS.map((t) => t.loadId);
let pass = 0, fail = 0; const check = (name: string, ok: boolean, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`); };
const run = (...args: string[]) => {
  const q = args.map((a) => (/\s/.test(a) ? `"${a}"` : a)); // npx needs a shell on Windows, which joins args unquoted
  const r = spawnSync("npx", ["tsx", "scripts/reconcile-bkn-tipalti.ts", ...q], { cwd: B, encoding: "utf8", shell: process.platform === "win32",
    env: { ...process.env, RESEND_API_KEY: "", OPENPHONE_API_KEY: "", QUO_API_KEY: "", PRISMA_TARGET: "" } });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
const strip = (row: any, drop: string[]) => Object.fromEntries(Object.entries(row).filter(([k, v]) => v !== null && !["id", "createdAt", "updatedAt", ...drop].includes(k)));
const LOAD_SHAPE: Record<string, object> = {
  "SRL-121492": { status: "TONU", customerRate: 2700, poNumbers: [] }, "SRL-121494": { status: "COMPLETED", customerRate: 2550, poNumbers: [] },
  "SRL-121495": { status: "COMPLETED", customerRate: 700, poNumbers: ["PO1861"] }, "SRL-121496": { status: "TONU", customerRate: 2600, poNumbers: ["TO3667"] },
};
// Production's three drafts, as the snapshot read them. 121492I does not exist.
const DRAFTS: Record<string, [string, number, number, string, string, string | null]> = {
  "121494I": ["SRL-121494I", 2550, 0, "Linehaul: Irving, TX → Hebron, KY", "LINEHAUL", null],
  "121495I": ["INV-1003", 700, 0, "Linehaul: Irving, TX → Northlake, TX", "LINEHAUL", null],
  "121496I": ["SRL-121496I", 200, 200, "Truck ordered not used (Customer caused the failure: customer is billed TONU and the carrier is paid TONU.)", "ACCESSORIAL", "cmugbqnog001dma2drryhcgxu"],
};

async function seed() {
  const invIds = (await p.invoice.findMany({ where: { loadId: { in: LOAD_IDS } }, select: { id: true } })).map((i: any) => i.id);
  await p.auditTrail.deleteMany({ where: { entityId: { in: [...invIds, BKN_CUSTOMER_ID] } } });
  await p.loadAccessorial.deleteMany({ where: { loadId: { in: LOAD_IDS } } });
  await p.invoiceLineItem.deleteMany({ where: { invoiceId: { in: invIds } } });
  await p.invoice.deleteMany({ where: { id: { in: invIds } } });
  await p.load.deleteMany({ where: { id: { in: LOAD_IDS } } });
  await p.customer.deleteMany({ where: { id: BKN_CUSTOMER_ID } });
  if (!(await p.user.findUnique({ where: { id: RECORDED_BY } })))
    await p.user.create({ data: { ...strip(await p.user.findFirst(), ["googleSub"]), id: RECORDED_BY, email: "wasi-rehearsal@srl.invalid" } });
  await p.customer.create({ data: { ...strip(await p.customer.findFirst(), ["userId", "defaultInvoiceChannel", ...Object.keys(BILLING), "billingEmail", "billingContactEmail"]),
    id: BKN_CUSTOMER_ID, name: "Beekeepers Naturals USA Inc.", defaultAccessorialRates: { TONU: 250 } } });
  const src = await p.load.findFirst({ where: { deletedAt: null } });
  for (const t of TARGETS) await p.load.create({ data: { ...strip(src, ["loadNumber", "referenceNumber", "shipperCode", "srlBolNumber", "trackingToken", "carrierId", "customerId", "posterId"]),
    id: t.loadId, loadNumber: t.loadNumber, referenceNumber: t.loadNumber, customerId: BKN_CUSTOMER_ID, posterId: RECORDED_BY, ...LOAD_SHAPE[t.loadNumber] } });
  for (const t of TARGETS.filter((x) => x.existingInvoiceId)) {
    const [invoiceNumber, total, acc, line, type, accessorialId] = DRAFTS[t.number];
    await p.invoice.create({ data: { id: t.existingInvoiceId, invoiceNumber, srlDocNumber: `SRL-${t.number}`, loadId: t.loadId, status: "DRAFT", invoiceKind: "BASE",
      amount: total, totalAmount: total, lineHaulAmount: total - acc, fuelSurchargeAmount: 0, accessorialsAmount: acc, createdAt: new Date("2026-09-24T12:02:13Z"),
      dueDate: new Date("2026-10-24T12:02:13Z"), userId: RECORDED_BY, createdById: RECORDED_BY,
      lineItems: { create: [{ description: line, quantity: 1, rate: total, amount: total, type, sortOrder: 0, accessorialId }] } } });
  }
  await p.loadAccessorial.create({ data: { id: "cmuiare9v0001w0ls934lhjsn", loadId: TARGETS[0].loadId, type: "TONU", amount: 250, status: "APPROVED", billedTo: "SHIPPER" } });
  await p.loadAccessorial.create({ data: { id: "cmugbqnog001dma2drryhcgxu", loadId: TARGETS[3].loadId, type: "TONU", amount: 200, status: "APPROVED", billedTo: "SHIPPER", shipperInvoiceId: TARGETS[3].existingInvoiceId } });
}
const untouched = async () => (await p.customer.findUnique({ where: { id: BKN_CUSTOMER_ID } }))?.defaultInvoiceChannel === "EMAIL"
  && (await p.invoice.count({ where: { loadId: { in: LOAD_IDS }, status: "SENT" } })) === 0 && (await p.auditTrail.count({ where: { entityId: BKN_CUSTOMER_ID } })) === 0;
(async () => {
  p = (await import("../src/config/database")).prisma;
  await seed();
  const junk = fs.mkdtempSync(path.join(os.tmpdir(), "bkn junk ")); // a space in the path, on purpose
  for (const t of TARGETS) fs.writeFileSync(path.join(junk, t.packet), Buffer.from(`not ${t.packet}`));
  let r = run(`--packets=${junk}`, "--execute");
  check("wrong packets: refused, nothing written", r.code === 2 && /is not the delivered/.test(r.out) && (await untouched()), `exit ${r.code}`);
  await p.invoice.update({ where: { id: TARGETS[1].existingInvoiceId }, data: { status: "SENT" } });
  r = run(`--packets=${PACKETS}`, "--execute");
  check("an invoice already SENT: refused, nothing else written", r.code === 2 && /is SENT, not DRAFT/.test(r.out) && (await p.customer.findUnique({ where: { id: BKN_CUSTOMER_ID } })).defaultInvoiceChannel === "EMAIL", `exit ${r.code}`);
  await seed();
  r = run(`--packets=${PACKETS}`);
  check("dry run: exits 0, writes nothing", r.code === 0 && /DRY RUN: nothing written/.test(r.out) && (await untouched()), `exit ${r.code}`);
  r = run(`--packets=${PACKETS}`, "--execute");
  check("execute: exits 0", r.code === 0 && /EXECUTED/.test(r.out), r.out.split("\n").filter((l) => /REFUSED|FAILED/.test(l)).join(" | "));
  const c = await p.customer.findUnique({ where: { id: BKN_CUSTOMER_ID } });
  check("3a: billing address and channel TIPALTI, no billing email", Object.entries(BILLING).every(([k, v]) => c[k] === v) && c.defaultInvoiceChannel === "TIPALTI" && c.billingEmail === null);
  const inv = await p.invoice.findMany({ where: { loadId: { in: LOAD_IDS } }, include: { lineItems: { orderBy: { sortOrder: "asc" } } } });
  for (const t of TARGETS) {
    const i = inv.find((x: any) => x.loadId === t.loadId), tot = totalsFor(t);
    check(`3b ${t.number}: number, totals, dates and lines match the packet`, !!i && i.invoiceNumber === t.number && i.srlDocNumber === t.number && i.totalAmount === tot.totalAmount
      && i.amount === tot.amount && i.lineHaulAmount === tot.lineHaulAmount && i.accessorialsAmount === tot.accessorialsAmount && +i.createdAt === +ISSUED_AT && +i.dueDate === +DUE_DATE
      && JSON.stringify(i.lineItems.map((l: any) => [l.description, l.amount, l.type, l.accessorialId])) === JSON.stringify(t.lines.map((l) => [lineDescription(l), l.amount, l.type, l.accessorialId ?? null])));
    check(`3c/3d ${t.number}: SENT via TIPALTI at 17:00 Toronto by Wasi, hash recorded, no archive link`, i?.status === "SENT" && i.deliveryChannel === "TIPALTI" && +i.deliveredAt === +DELIVERED_AT
      && +i.sentDate === +DELIVERED_AT && i.deliveredById === RECORDED_BY && i.deliveredFileHash === t.sha256 && i.archivedDocumentId === null);
  }
  const created = inv.find((x: any) => x.loadId === TARGETS[0].loadId);
  check("121492I's ledger row is stamped to the created invoice", !!created && (await p.loadAccessorial.findUnique({ where: { id: "cmuiare9v0001w0ls934lhjsn" } }))?.shipperInvoiceId === created.id);
  const ids = [...inv.map((x: any) => x.id), BKN_CUSTOMER_ID];
  const audits = await p.auditTrail.count({ where: { entityId: { in: ids }, changedFields: { path: ["source"], equals: "scripts/reconcile-bkn-tipalti.ts" } } });
  const marked = await p.auditTrail.count({ where: { entityId: { in: ids }, action: "STATUS_CHANGE", changedFields: { path: ["actionDetail"], equals: "INVOICE_MARKED_SENT" } } });
  check("9 audit rows naming the script, 4 of them the mark-sent record", audits === 9 && marked === 4, `${audits}, ${marked}`);
  r = run(`--packets=${PACKETS}`, "--execute");
  check("a second run is a no-op", r.code === 0 && /already reconciled/.test(r.out) && (await p.auditTrail.count({ where: { entityId: { in: ids } } })) === 9, `exit ${r.code}`);
  await p.$disconnect(); console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error(e); await p?.$disconnect(); process.exit(1); });
