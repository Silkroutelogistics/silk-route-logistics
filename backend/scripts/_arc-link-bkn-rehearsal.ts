/**
 * Rehearsal for scripts/link-bkn-archived-packets.ts, LOCAL ONLY. Run it after
 * _arc-reconcile-bkn-rehearsal.ts, which leaves the container in production's
 * post-reconcile state. It uploads the delivered packets the way the Documents
 * tab stores them (local disk here), then: no uploads stops the run, a wrong
 * file stops it, an extra wrong file beside the right one is left alone, execute
 * links all four and the download path reads the delivered bytes back, and a
 * second run does nothing.
 *   RESEND_API_KEY= OPENPHONE_API_KEY= QUO_API_KEY= DATABASE_URL=<local> UPLOAD_DIR=<temp dir> \
 *     npx tsx scripts/_arc-link-bkn-rehearsal.ts
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { hostOf, isLocalHost } from "./prisma-target-guard";
import { TARGETS, RECORDED_BY } from "./_bknTipaltiPlan";

if (!isLocalHost(hostOf(process.env.DATABASE_URL ?? ""))) { console.error("REFUSED: a local DATABASE_URL only"); process.exit(2); }
if (!process.env.UPLOAD_DIR) { console.error("REFUSED: set UPLOAD_DIR to a temporary directory"); process.exit(2); }
const B = path.resolve(__dirname, "..");
const PACKETS = path.resolve(B, "../docs/sent-invoices/bkn-2026-09");
let p: any; // the shared client (ownPrismaClientCensus)
let pass = 0, fail = 0; const check = (name: string, ok: boolean, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`); };
const run = (...args: string[]) => {
  const r = spawnSync("npx", ["tsx", "scripts/link-bkn-archived-packets.ts", ...args], { cwd: B, encoding: "utf8", shell: process.platform === "win32",
    env: { ...process.env, RESEND_API_KEY: "", OPENPHONE_API_KEY: "", QUO_API_KEY: "", PRISMA_TARGET: "" } });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
const linked = async () => p.invoice.findMany({ where: { loadId: { in: TARGETS.map((t) => t.loadId) }, archivedDocumentId: { not: null } }, select: { id: true } });

(async () => {
  p = (await import("../src/config/database")).prisma;
  const { uploadFile } = await import("../src/services/storageService");
  const upload = async (loadId: string, name: string, bytes: Buffer) => {
    const fileUrl = await uploadFile(bytes, `rehearsal/${loadId}/${Date.now()}-${name}`, "application/pdf");
    return p.document.create({ data: { fileName: name, fileUrl, fileType: "application/pdf", fileSize: bytes.length, entityType: "LOAD", entityId: loadId,
      loadId, docType: "INVOICE", uploadSource: "AE_CONSOLE", userId: RECORDED_BY } });
  };
  const bytes = (i: number) => fs.readFileSync(path.join(PACKETS, TARGETS[i].packet));
  const invs = await p.invoice.findMany({ where: { srlDocNumber: { in: TARGETS.map((t) => t.number) } }, select: { deliveredFileHash: true } });
  if (invs.length !== 4 || invs.some((i: any) => !i.deliveredFileHash)) { console.error("REFUSED: run _arc-reconcile-bkn-rehearsal.ts first"); process.exit(2); }

  let r = run();
  check("no uploads: stops, names all four, links nothing", r.code === 2 && TARGETS.every((t) => r.out.includes(`STOP ${t.number}: no upload`)) && (await linked()).length === 0, `exit ${r.code}`);

  const wrong = await upload(TARGETS[0].loadId, "121492I-looks-right.pdf", bytes(1)); // 121494's packet on 121492's load
  for (const i of [1, 2, 3]) await upload(TARGETS[i].loadId, TARGETS[i].packet, bytes(i));
  r = run("--execute");
  check("a wrong file with nothing matching: stops, links nothing", r.code === 2 && r.out.includes(`STOP 121492I: 121492I-looks-right.pdf (${wrong.id}) hashes to ${TARGETS[1].sha256.slice(0, 12)}`) && (await linked()).length === 0, `exit ${r.code}`);

  const right = await upload(TARGETS[0].loadId, TARGETS[0].packet, bytes(0));
  r = run();
  check("dry run with the right file present: plans four, notes the extra, writes nothing",
    r.code === 0 && r.out.includes(`PLAN 121492I -> document ${right.id}`) && /NOTE 121492I: 121492I-looks-right\.pdf .* left unlinked/.test(r.out) && /DRY RUN/.test(r.out) && (await linked()).length === 0, `exit ${r.code}`);

  r = run("--execute");
  check("execute: links four, each read back through the download path", r.code === 0 && (r.out.match(/download reads back the delivered bytes/g) ?? []).length === 4, `exit ${r.code}`);
  const inv0 = await p.invoice.findFirst({ where: { srlDocNumber: "121492I" }, select: { archivedDocumentId: true } });
  check("121492I links the matching upload, not the wrong one", inv0?.archivedDocumentId === right.id, String(inv0?.archivedDocumentId));
  const audits = await p.auditTrail.count({ where: { changedFields: { path: ["actionDetail"], equals: "LINK_DELIVERED_INVOICE_COPY" } } });
  check("four audit rows name the link", audits === 4, String(audits));

  r = run("--execute");
  check("a second run does nothing", r.code === 0 && (r.out.match(/already linked/g) ?? []).length === 4 && /nothing to do/.test(r.out)
    && (await p.auditTrail.count({ where: { changedFields: { path: ["actionDetail"], equals: "LINK_DELIVERED_INVOICE_COPY" } } })) === 4, `exit ${r.code}`);
  await p.$disconnect(); console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error(e); await p?.$disconnect(); process.exit(1); });
