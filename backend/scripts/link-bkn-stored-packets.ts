/**
 * D-2 (ruled 2026-09-28, changed): no admin credential and no storage keys. Wasi downloads each
 * stored packet from the TMS UI into docs/sent-invoices/bkn-2026-09/stored/. This hashes THOSE
 * local files, verifies each equals an invoice's deliveredFileHash, and sets archivedDocumentId
 * on the four packet documents (typed OTHER after the 2026-09-28 retype, CUSTOMER_INVOICE_COPY
 * once that type ships -- either is accepted, so the order of the two does not matter).
 *
 * The download is the evidence that ties a local file to a document: the file came from that
 * document, so its bytes are the stored bytes. The script checks what it can without storage:
 *   - every file in stored/ hashes to one of the four delivered hashes (any other file: STOP);
 *   - every packet has a downloaded file with its delivered hash (missing: STOP);
 *   - exactly one packet document on the load, named as the packet, with the file's size
 *     (none, several, or a size that differs: STOP);
 *   - the invoice's deliveredFileHash is the plan's (differs: STOP).
 * All four or none. Already-linked invoices are reported, never relinked.
 *
 * Dry run (the database credential may be the read-only one):
 *   RESEND_API_KEY= OPENPHONE_API_KEY= QUO_API_KEY= npx tsx scripts/link-bkn-stored-packets.ts \
 *     --env-file=<backend/.env.production.readonly> --stored=<folder>
 * Execute: PRISMA_TARGET=production ... --env-file=<backend/.env.production.local> --stored=<folder> --execute --target=prod
 */
import fs from "fs";
import path from "path";
import { openTarget } from "./_prodTarget";
import { TARGETS, RECORDED_BY, sha256 } from "./_bknTipaltiPlan";

const SOURCE = "scripts/link-bkn-stored-packets.ts";
export const PACKET_DOC_TYPES = ["OTHER", "CUSTOMER_INVOICE_COPY"];

export interface LocalFile { name: string; size: number; sha256: string }
export interface PacketDoc { id: string; fileName: string; fileSize: number; docType: string | null }
export interface InvoiceState { number: string; storedHash: string | null; archivedDocumentId: string | null; docs: PacketDoc[] }

const short = (h: string | null) => (h ? h.slice(0, 12) : "none");

/** Pure: which document links to which invoice, or why the run stops. */
export function planLocalLinks(files: LocalFile[], invoices: InvoiceState[]) {
  const link: { number: string; documentId: string; file: string }[] = [], already: string[] = [], stop: string[] = [];
  const expected = new Map(TARGETS.map((t) => [t.sha256, t.number] as const));
  for (const f of files) if (!expected.has(f.sha256)) stop.push(`stored/${f.name} hashes to ${short(f.sha256)}, which is no delivered packet`);
  if (!files.length) stop.push("stored/ holds no files: download the four packets from the TMS first");
  for (const t of TARGETS) {
    const inv = invoices.find((i) => i.number === t.number);
    if (!inv) { stop.push(`${t.number}: invoice not found`); continue; }
    if (inv.storedHash !== t.sha256) { stop.push(`${t.number}: the invoice's deliveredFileHash is ${short(inv.storedHash)}, expected ${short(t.sha256)}`); continue; }
    if (inv.archivedDocumentId) { already.push(`${t.number}: already linked to ${inv.archivedDocumentId}`); continue; }
    const file = files.find((f) => f.sha256 === t.sha256);
    if (!file) { stop.push(`${t.number}: no file in stored/ hashes to the delivered ${short(t.sha256)}`); continue; }
    const docs = inv.docs.filter((d) => PACKET_DOC_TYPES.includes(d.docType ?? "") && d.fileName === t.packet);
    if (docs.length !== 1) { stop.push(`${t.number}: ${docs.length} packet documents named ${t.packet} on the load, expected exactly 1`); continue; }
    if (docs[0].fileSize !== file.size) { stop.push(`${t.number}: document ${docs[0].id} is ${docs[0].fileSize} bytes, the downloaded file ${file.size}`); continue; }
    link.push({ number: t.number, documentId: docs[0].id, file: file.name });
  }
  return { link: stop.length ? [] : link, already, stop };
}

if (require.main === module) {
  const target = openTarget("link-bkn-stored");
  (async () => {
    const arg = process.argv.find((a) => a.startsWith("--stored="));
    const dir = path.resolve(arg ? arg.slice("--stored=".length) : path.join(__dirname, "../../docs/sent-invoices/bkn-2026-09/stored"));
    const names = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => fs.statSync(path.join(dir, n)).isFile()) : [];
    const files: LocalFile[] = names.map((n) => { const b = fs.readFileSync(path.join(dir, n)); return { name: n, size: b.length, sha256: sha256(b) }; });
    for (const f of files) console.log(`[link-bkn-stored] stored/${f.name}: ${f.size} bytes, sha256 ${short(f.sha256)}`);
    const { prisma } = await import("../src/config/database");
    try {
      const invoices: (InvoiceState & { id: string | null })[] = [];
      for (const t of TARGETS) {
        const inv = await prisma.invoice.findFirst({ where: { loadId: t.loadId, srlDocNumber: t.number, deletedAt: null, status: { not: "VOID" } }, select: { id: true, deliveredFileHash: true, archivedDocumentId: true } });
        const docs = await prisma.document.findMany({ where: { loadId: t.loadId }, select: { id: true, fileName: true, fileSize: true, docType: true } });
        invoices.push({ number: t.number, id: inv?.id ?? null, storedHash: inv?.deliveredFileHash ?? null, archivedDocumentId: inv?.archivedDocumentId ?? null, docs });
      }
      const plan = planLocalLinks(files, invoices);
      for (const a of plan.already) console.log(`[link-bkn-stored] ${a}`);
      if (plan.stop.length) { for (const s of plan.stop) console.error(`[link-bkn-stored] STOP ${s}`); console.error("[link-bkn-stored] nothing linked"); process.exit(2); }
      if (!plan.link.length) { console.log("[link-bkn-stored] nothing to do"); return; }
      for (const l of plan.link) console.log(`[link-bkn-stored] PLAN ${l.number} -> document ${l.documentId} (stored/${l.file} hashes to the delivered file)`);
      if (!target.write) { console.log("[link-bkn-stored] DRY RUN: nothing written"); return; }
      await prisma.$transaction(async (tx: any) => {
        for (const l of plan.link) {
          const t = TARGETS.find((x) => x.number === l.number)!;
          const inv = invoices.find((i) => i.number === l.number)!;
          const r = await tx.invoice.updateMany({ where: { id: inv.id!, archivedDocumentId: null, deliveredFileHash: t.sha256 }, data: { archivedDocumentId: l.documentId } });
          if (r.count !== 1) throw new Error(`${l.number}: expected to link 1 invoice, matched ${r.count}`);
          await tx.auditTrail.create({ data: { entityType: "Invoice", entityId: inv.id!, action: "UPDATE", performedById: RECORDED_BY, ipAddress: "script",
            changedFields: { actionDetail: "LINK_DELIVERED_INVOICE_COPY", archivedDocumentId: { from: null, to: l.documentId }, sha256: t.sha256,
              evidence: `downloaded from the TMS to stored/${l.file}; sha256 equals deliveredFileHash`, source: SOURCE } } });
        }
      });
      console.log(`[link-bkn-stored] EXECUTED: ${plan.link.length} linked, ${plan.link.length} audit rows`);
    } finally {
      await prisma.$disconnect();
    }
  })().catch((e) => { console.error("[link-bkn-stored] FAILED:", e?.message ?? e); process.exit(1); });
}
