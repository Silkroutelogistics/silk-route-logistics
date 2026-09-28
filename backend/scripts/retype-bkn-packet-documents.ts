/**
 * CONTAIN (ruled 2026-09-27, after item 0): the four Beekeepers packets were uploaded on the
 * Documents tab's "Invoice" row, so they were stored as docType INVOICE -- which everywhere
 * downstream means the CARRIER's invoice. That cleared the carrier-pay approval gate on four
 * settlements, listed SRL's customer invoice (customer rate beside carrier rate) in the
 * carrier's portal, and emailed accounting four times. This retypes exactly those four
 * documents INVOICE -> OTHER, with an audit row each, then recomputes each settlement's
 * document flags through the one writer (syncSettlementDocFlags).
 *
 * Refuses, writing nothing, unless each document is on its load, named as its packet, and
 * INVOICE (OTHER means already done). One transaction for the retype; the flag recompute runs
 * after it commits, reading what now exists. Sends nothing: it touches no notifier.
 * Dry run by default; writing needs PRISMA_TARGET=production --execute --target=prod
 * --env-file=<production file>. The env schema needs JWT_SECRET and ENCRYPTION_KEY set (CI
 * placeholders are fine: nothing here signs or decrypts).
 */
import { openTarget } from "./_prodTarget";
import { TARGETS, RECORDED_BY } from "./_bknTipaltiPlan";

const SOURCE = "scripts/retype-bkn-packet-documents.ts";
export const REASON = "SRL customer invoice copy, mis-typed on upload";
export const FROM_TYPE = "INVOICE";
export const TO_TYPE = "OTHER";

/** The four uploads, as the item 0 census found them (2026-09-27 23:42-23:45Z). */
export const PACKET_DOCUMENTS = [
  { number: "121492I", documentId: "cmukgu2lp001gmn2dmh7g7x4a" },
  { number: "121494I", documentId: "cmukgrqvz000ymn2dlxg1v8vz" },
  { number: "121495I", documentId: "cmukgt5tp0019mn2duyesoq8o" },
  { number: "121496I", documentId: "cmukguq75001rmn2d7v6hb1uu" },
] as const;

export interface DocState { id: string; loadId: string | null; fileName: string; docType: string | null }

/** Pure: which of the four to retype, which are already done, and what refuses the whole run. */
export function planRetype(found: DocState[]): { retype: string[]; done: string[]; refuse: string[] } {
  const retype: string[] = [], done: string[] = [], refuse: string[] = [];
  for (const p of PACKET_DOCUMENTS) {
    const t = TARGETS.find((x) => x.number === p.number)!;
    const d = found.find((x) => x.id === p.documentId);
    if (!d) { refuse.push(`${p.number}: document ${p.documentId} not found`); continue; }
    if (d.loadId !== t.loadId) { refuse.push(`${p.number}: ${p.documentId} is on ${d.loadId ?? "no load"}, not ${t.loadNumber}`); continue; }
    if (d.fileName !== t.packet) { refuse.push(`${p.number}: ${p.documentId} is "${d.fileName}", not the packet "${t.packet}"`); continue; }
    if (d.docType === TO_TYPE) done.push(p.documentId);
    else if (d.docType === FROM_TYPE) retype.push(p.documentId);
    else refuse.push(`${p.number}: ${p.documentId} is ${d.docType ?? "untyped"}, expected ${FROM_TYPE} (or ${TO_TYPE} if already done)`);
  }
  return { retype: refuse.length ? [] : retype, done, refuse };
}

if (require.main === module) {
  const target = openTarget("retype-bkn-docs");
  (async () => {
    const { prisma } = await import("../src/config/database");
    const { syncSettlementDocFlags } = await import("../src/services/integrationService");
    try {
      const ids = PACKET_DOCUMENTS.map((p) => p.documentId);
      const found = await prisma.document.findMany({ where: { id: { in: ids } }, select: { id: true, loadId: true, fileName: true, docType: true } });
      const plan = planRetype(found);
      if (plan.refuse.length) { for (const r of plan.refuse) console.error(`[retype-bkn-docs] REFUSED: ${r}`); process.exit(2); }
      for (const id of plan.done) console.log(`[retype-bkn-docs] already ${TO_TYPE}: ${id}`);
      for (const id of plan.retype) console.log(`[retype-bkn-docs] PLAN ${id}: ${FROM_TYPE} -> ${TO_TYPE} ("${REASON}")`);
      if (!plan.retype.length) { console.log("[retype-bkn-docs] nothing to retype"); }
      else if (!target.write) { console.log("[retype-bkn-docs] DRY RUN: nothing written"); return; }
      else {
        await prisma.$transaction(async (tx: any) => {
          for (const id of plan.retype) {
            const d = found.find((x) => x.id === id)!;
            const moved = await tx.document.updateMany({ where: { id, docType: FROM_TYPE }, data: { docType: TO_TYPE } });
            if (moved.count !== 1) throw new Error(`${id} changed while this ran`);
            await tx.auditTrail.create({ data: { entityType: "Document", entityId: id, action: "UPDATE", performedById: RECORDED_BY, ipAddress: "script",
              changedFields: { actionDetail: "RETYPE_DOCUMENT", docType: { from: FROM_TYPE, to: TO_TYPE }, reason: REASON, loadId: d.loadId, fileName: d.fileName, source: SOURCE } } });
          }
        });
        console.log(`[retype-bkn-docs] EXECUTED: ${plan.retype.length} retyped, ${plan.retype.length} audit rows`);
      }
      // The flags are a recompute of the documents that exist now; run it whatever the retype did,
      // so a run after a partial or manual fix still leaves them true to the documents.
      if (target.write) {
        for (const loadId of [...new Set(found.map((d) => d.loadId).filter(Boolean))] as string[]) {
          const r = await syncSettlementDocFlags(loadId);
          console.log(`[retype-bkn-docs] settlement flags recomputed for ${loadId}: ${JSON.stringify(r)}`);
        }
      }
    } finally {
      await prisma.$disconnect();
    }
  })().catch((e) => { console.error("[retype-bkn-docs] FAILED:", e?.message ?? e); process.exit(1); });
}
