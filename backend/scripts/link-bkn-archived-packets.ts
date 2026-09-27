/**
 * D-2 (ruled 2026-09-26, amended): Wasi uploads the four delivered Beekeepers
 * packets through each load's Documents tab (121492, 121494, 121495, 121496).
 * This finds each upload, hashes its STORED bytes, and links it as the
 * invoice's archived copy (archivedDocumentId) only when the hash equals the
 * invoice's deliveredFileHash. After that a download returns those bytes
 * (lib/invoiceArchive), not a re-render.
 *
 * All four or none. A packet with no upload, or with no upload whose bytes
 * hash to the delivered file, STOPS the run: every packet is reported and
 * nothing is linked. An extra upload that does not match is reported and left
 * alone when another upload on the same load does match.
 *
 * Reading the stored bytes needs the storage credentials the service runs
 * with (S3_BUCKET_NAME, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION,
 * S3_ENDPOINT for R2). Pass them in a gitignored file with
 * --storage-env-file=; only the key names are printed.
 *
 * The storage service loads the server's env schema, which requires JWT_SECRET
 * and ENCRYPTION_KEY. This script neither signs nor decrypts, so the CI
 * placeholders serve (never the production values).
 *
 * Dry run (reads only; the database credential may be the read-only one):
 *   RESEND_API_KEY= OPENPHONE_API_KEY= QUO_API_KEY= JWT_SECRET=ci-test-secret ENCRYPTION_KEY=<64 hex, CI's> \
 *     npx tsx scripts/link-bkn-archived-packets.ts \
 *     --env-file=<backend/.env.production.readonly> --storage-env-file=<gitignored storage file>
 * Execute, after a clean dry run:
 *   PRISMA_TARGET=production ... --env-file=<backend/.env.production.local> --storage-env-file=<...> --execute --target=prod
 */
import { createHash } from "crypto";
import { openTarget } from "./_prodTarget";
import { readFromEnvFile } from "./prisma-target-guard";
import { TARGETS, RECORDED_BY } from "./_bknTipaltiPlan";

const SOURCE = "scripts/link-bkn-archived-packets.ts";
/** RECONCILE ran at 2026-09-26T21:35Z; a D-2 upload necessarily comes after it. */
export const UPLOADS_FROM = new Date("2026-09-26T21:35:00.000Z");
const STORAGE_KEYS = ["S3_BUCKET_NAME", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION", "S3_ENDPOINT"];

export interface Candidate { id: string; fileName: string; sha256: string | null; readError?: string }
export interface PacketState {
  number: string;
  expected: string;
  /** The invoice's deliveredFileHash as stored; must equal `expected`. */
  storedHash: string | null;
  archivedDocumentId: string | null;
  /** Uploads on the load or invoice since UPLOADS_FROM, oldest first. */
  candidates: Candidate[];
}

const short = (h: string | null) => (h ? h.slice(0, 12) : "unreadable");

/** Pure: which upload links to which invoice, or why the run stops. */
export function planLinks(packets: PacketState[]): { link: { number: string; documentId: string }[]; already: string[]; notes: string[]; stop: string[] } {
  const link: { number: string; documentId: string }[] = [];
  const already: string[] = [];
  const notes: string[] = [];
  const stop: string[] = [];
  for (const p of packets) {
    if (p.storedHash !== p.expected) { stop.push(`${p.number}: the invoice's deliveredFileHash is ${short(p.storedHash)}, expected ${short(p.expected)}`); continue; }
    if (p.archivedDocumentId) { already.push(`${p.number}: already linked to ${p.archivedDocumentId}`); continue; }
    if (p.candidates.length === 0) { stop.push(`${p.number}: no upload on the load since ${UPLOADS_FROM.toISOString()}`); continue; }
    const match = p.candidates.find((c) => c.sha256 === p.expected);
    for (const c of p.candidates) {
      if (c === match) continue;
      const why = c.readError ? `could not be read (${c.readError})` : `hashes to ${short(c.sha256)}, not ${short(p.expected)}`;
      (match ? notes : stop).push(`${p.number}: ${c.fileName} (${c.id}) ${why}${match ? "; left unlinked" : ""}`);
    }
    if (match) link.push({ number: p.number, documentId: match.id });
  }
  return { link: stop.length ? [] : link, already, notes, stop };
}

function loadStorageEnv(): string[] {
  const arg = process.argv.find((a) => a.startsWith("--storage-env-file="));
  if (!arg) return [];
  const file = arg.slice("--storage-env-file=".length);
  const found: string[] = [];
  for (const k of STORAGE_KEYS) {
    const v = readFromEnvFile(file, k);
    if (v) { process.env[k] = v; found.push(k); }
  }
  return found;
}

async function main() {
  const t = openTarget("link-bkn");
  const keys = loadStorageEnv(); // before the service modules read the environment
  console.log(`[link-bkn] storage keys loaded: ${keys.length ? keys.join(", ") : "none"}`);
  const { prisma } = await import("../src/config/database");
  const { getFileStream, isS3Active, isS3Url } = await import("../src/services/storageService");
  const { readArchivedInvoice } = await import("../src/lib/invoiceArchive");
  const hashOf = async (fileUrl: string): Promise<string> => {
    if (isS3Url(fileUrl) && !isS3Active()) throw new Error("stored in S3 and no storage credentials are loaded here (--storage-env-file=)");
    const h = createHash("sha256");
    for await (const chunk of await getFileStream(fileUrl)) h.update(Buffer.from(chunk));
    return h.digest("hex");
  };
  try {
    const packets: (PacketState & { invoiceId: string | null })[] = [];
    for (const target of TARGETS) {
      const inv = await prisma.invoice.findFirst({ where: { loadId: target.loadId, srlDocNumber: target.number, deletedAt: null, status: { not: "VOID" } },
        select: { id: true, deliveredFileHash: true, archivedDocumentId: true } });
      const docs = await prisma.document.findMany({
        where: { createdAt: { gte: UPLOADS_FROM }, archivedForInvoice: null,
          OR: [{ loadId: target.loadId }, { entityType: "LOAD", entityId: target.loadId }, ...(inv ? [{ invoiceId: inv.id }] : [])] },
        orderBy: { createdAt: "asc" }, select: { id: true, fileName: true, fileUrl: true } });
      const candidates: Candidate[] = [];
      for (const d of docs) {
        try { candidates.push({ id: d.id, fileName: d.fileName, sha256: await hashOf(d.fileUrl) }); }
        catch (e: any) { candidates.push({ id: d.id, fileName: d.fileName, sha256: null, readError: String(e?.message ?? e).slice(0, 160) }); }
      }
      packets.push({ number: target.number, expected: target.sha256, storedHash: inv?.deliveredFileHash ?? null,
        archivedDocumentId: inv?.archivedDocumentId ?? null, candidates, invoiceId: inv?.id ?? null });
      console.log(`[link-bkn] ${target.number}: invoice ${inv ? "found" : "MISSING"}; ${docs.length} upload(s): ${candidates.map((c) => `${c.fileName} ${short(c.sha256)}`).join(", ") || "none"}`);
    }
    const plan = planLinks(packets);
    for (const a of plan.already) console.log(`[link-bkn] ${a}`);
    for (const n of plan.notes) console.log(`[link-bkn] NOTE ${n}`);
    if (plan.stop.length) { for (const s of plan.stop) console.error(`[link-bkn] STOP ${s}`); console.error("[link-bkn] nothing linked"); process.exit(2); }
    if (!plan.link.length) { console.log("[link-bkn] nothing to do"); return; }
    for (const l of plan.link) console.log(`[link-bkn] PLAN ${l.number} -> document ${l.documentId} (sha256 verified)`);
    if (!t.write) { console.log("[link-bkn] DRY RUN — nothing written."); return; }

    await prisma.$transaction(async (tx: any) => {
      for (const l of plan.link) {
        const p = packets.find((x) => x.number === l.number)!;
        const r = await tx.invoice.updateMany({ where: { id: p.invoiceId!, archivedDocumentId: null, deliveredFileHash: p.expected }, data: { archivedDocumentId: l.documentId } });
        if (r.count !== 1) throw new Error(`${l.number}: expected to link 1 invoice, matched ${r.count}`);
        await tx.auditTrail.create({ data: { entityType: "Invoice", entityId: p.invoiceId!, action: "UPDATE", performedById: RECORDED_BY, ipAddress: "script",
          changedFields: { actionDetail: "LINK_DELIVERED_INVOICE_COPY", archivedDocumentId: { from: null, to: l.documentId }, sha256: p.expected, source: SOURCE } } });
      }
    });
    for (const l of plan.link) {
      const p = packets.find((x) => x.number === l.number)!;
      const back = await readArchivedInvoice({ archivedDocumentId: l.documentId, deliveredFileHash: p.expected });
      console.log(`[link-bkn] LINKED ${l.number} -> ${l.documentId}; download reads back ${back.ok ? `the delivered bytes (${short(back.hash)})` : back.code}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => { console.error("[link-bkn] FAILED:", e?.message ?? e); process.exit(1); });
}
