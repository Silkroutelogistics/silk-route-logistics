/**
 * Rehearsal for scripts/link-bkn-stored-packets.ts, LOCAL ONLY. Run it after
 * _arc-reconcile-bkn-rehearsal.ts, which leaves the container in production's post-reconcile
 * state. It stores the four packets the way the Documents tab does (local disk here), typed
 * OTHER as the 2026-09-28 retype left them, plus an INVOICE decoy that must be ignored. It then
 * drives the script: an empty stored/ stops; a stray file and a missing packet stop; the dry run
 * plans four and writes nothing; execute links four and the download path reads the delivered
 * bytes back; a second run does nothing.
 *   RESEND_API_KEY= OPENPHONE_API_KEY= QUO_API_KEY= DATABASE_URL=<local> UPLOAD_DIR=<temp dir> \
 *     npx tsx scripts/_arc-link-bkn-stored-rehearsal.ts
 */
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { hostOf, isLocalHost } from "./prisma-target-guard";
import { TARGETS, RECORDED_BY } from "./_bknTipaltiPlan";

if (!isLocalHost(hostOf(process.env.DATABASE_URL ?? ""))) { console.error("REFUSED: a local DATABASE_URL only"); process.exit(2); }
if (!process.env.UPLOAD_DIR) { console.error("REFUSED: set UPLOAD_DIR to a temporary directory"); process.exit(2); }
const B = path.resolve(__dirname, "..");
const PACKETS = path.resolve(B, "../docs/sent-invoices/bkn-2026-09");
const STORED = fs.mkdtempSync(path.join(os.tmpdir(), "bkn-stored-"));
let p: any; // the shared client (ownPrismaClientCensus)
let pass = 0, fail = 0; const check = (name: string, ok: boolean, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`); };
const run = (...args: string[]) => {
  const r = spawnSync("npx", ["tsx", "scripts/link-bkn-stored-packets.ts", `--stored=${STORED}`, ...args], { cwd: B, encoding: "utf8", shell: process.platform === "win32",
    env: { ...process.env, RESEND_API_KEY: "", OPENPHONE_API_KEY: "", QUO_API_KEY: "", PRISMA_TARGET: "" } });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
const linked = async () => p.invoice.count({ where: { loadId: { in: TARGETS.map((t) => t.loadId) }, archivedDocumentId: { not: null } } });
const bytes = (i: number) => fs.readFileSync(path.join(PACKETS, TARGETS[i].packet));
const put = (i: number, name = `dl-${TARGETS[i].number}.pdf`) => fs.writeFileSync(path.join(STORED, name), bytes(i));

(async () => {
  p = (await import("../src/config/database")).prisma;
  const { uploadFile } = await import("../src/services/storageService");
  const { readArchivedInvoice } = await import("../src/lib/invoiceArchive");
  const invs = await p.invoice.findMany({ where: { srlDocNumber: { in: TARGETS.map((t) => t.number) } }, select: { id: true, srlDocNumber: true, deliveredFileHash: true } });
  if (invs.length !== 4 || invs.some((i: any) => !i.deliveredFileHash)) { console.error("REFUSED: run _arc-reconcile-bkn-rehearsal.ts first"); process.exit(2); }
  const docIds: Record<string, string> = {};
  for (let i = 0; i < 4; i++) {
    const t = TARGETS[i]; const b = bytes(i);
    const fileUrl = await uploadFile(b, `rehearsal/${t.loadId}/${Date.now()}-${t.packet}`, "application/pdf");
    docIds[t.number] = (await p.document.create({ data: { fileName: t.packet, fileUrl, fileType: "application/pdf", fileSize: b.length, entityType: "LOAD", entityId: t.loadId,
      loadId: t.loadId, docType: "OTHER", uploadSource: "AE_CONSOLE", userId: RECORDED_BY } })).id;
  }
  await p.document.create({ data: { fileName: TARGETS[2].packet, fileUrl: "local://decoy", fileType: "application/pdf", fileSize: bytes(2).length, entityType: "LOAD", entityId: TARGETS[2].loadId,
    loadId: TARGETS[2].loadId, docType: "INVOICE", uploadSource: "AE_CONSOLE", userId: RECORDED_BY } });

  let r = run();
  check("an empty stored/ stops and links nothing", r.code === 2 && /stored\/ holds no files/.test(r.out) && (await linked()) === 0, `exit ${r.code}`);

  for (const i of [1, 2, 3]) put(i);
  fs.writeFileSync(path.join(STORED, "stray.pdf"), Buffer.from("%PDF-1.4 not a packet"));
  r = run("--execute");
  check("a stray file and a missing packet both stop, nothing linked", r.code === 2 && /stored\/stray\.pdf hashes to .* which is no delivered packet/.test(r.out)
    && /121492I: no file in stored\/ hashes to the delivered/.test(r.out) && (await linked()) === 0, `exit ${r.code}`);

  fs.unlinkSync(path.join(STORED, "stray.pdf")); put(0);
  r = run();
  check("dry run plans four, ignores the INVOICE decoy, writes nothing", r.code === 0 && (r.out.match(/PLAN 1214\d\dI -> document/g) ?? []).length === 4
    && r.out.includes(`PLAN 121495I -> document ${docIds["121495I"]}`) && /DRY RUN/.test(r.out) && (await linked()) === 0, `exit ${r.code}`);

  r = run("--execute");
  check("execute links four", r.code === 0 && /EXECUTED: 4 linked, 4 audit rows/.test(r.out) && (await linked()) === 4, `exit ${r.code}`);
  for (const t of TARGETS) {
    const inv = await p.invoice.findFirst({ where: { srlDocNumber: t.number }, select: { archivedDocumentId: true, deliveredFileHash: true } });
    const back = await readArchivedInvoice({ archivedDocumentId: inv.archivedDocumentId, deliveredFileHash: inv.deliveredFileHash });
    check(`${t.number}: linked to its OTHER packet document, and the download reads the delivered bytes`, inv.archivedDocumentId === docIds[t.number] && back.ok === true, back.ok ? "" : String(back.code));
  }
  const audits = await p.auditTrail.count({ where: { changedFields: { path: ["actionDetail"], equals: "LINK_DELIVERED_INVOICE_COPY" } } });
  check("four audit rows name the link", audits === 4, String(audits));

  r = run("--execute");
  check("a second run does nothing", r.code === 0 && (r.out.match(/already linked/g) ?? []).length === 4 && /nothing to do/.test(r.out), `exit ${r.code}`);
  fs.rmSync(STORED, { recursive: true, force: true });
  await p.$disconnect(); console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error(e); await p?.$disconnect(); process.exit(1); });
