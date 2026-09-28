/**
 * Beekeepers' customer reference numbers (ruled 2026-09-27): TO3665 on SRL-121492, PO1861 on
 * SRL-121494 and SRL-121495. They go on Load.poNumbers -- the field the invoice template reads
 * (pdfService.generateInvoicePDF prints "PO: <poNumbers>" from the load record only, v3.8.blv).
 *
 * The SENT invoices and their archived copies are not touched: an invoice renders its PO from
 * the load at render time, and a delivered invoice is served from its archived bytes once
 * linked. This changes what a re-render prints, nothing that was delivered.
 *
 * A load that already carries the reference is left alone; a load carrying a DIFFERENT
 * reference refuses the whole run rather than overwrite it. One transaction, an audit row per
 * changed load. Sends nothing: a poNumbers write touches no notifier (the load write hook
 * observes status only). Dry run by default; writing needs PRISMA_TARGET=production --execute
 * --target=prod --env-file=<production file>.
 */
import { openTarget } from "./_prodTarget";
import { RECORDED_BY } from "./_bknTipaltiPlan";

const SOURCE = "scripts/set-bkn-customer-references.ts";
export const REFERENCES = [
  { loadId: "cmu78p8lr00eamb2dehub3qdl", loadNumber: "SRL-121492", reference: "TO3665" },
  { loadId: "cmubrf8on00qoh02dujll2ltb", loadNumber: "SRL-121494", reference: "PO1861" },
  { loadId: "cmuct8gnk001vma2db2hbgrsj", loadNumber: "SRL-121495", reference: "PO1861" },
] as const;

export interface RefState { id: string; loadNumber: string | null; poNumbers: string[] }

/** Pure. */
export function planReferences(found: RefState[]): { set: { loadId: string; from: string[]; to: string[] }[]; done: string[]; refuse: string[] } {
  const set: { loadId: string; from: string[]; to: string[] }[] = [], done: string[] = [], refuse: string[] = [];
  for (const r of REFERENCES) {
    const l = found.find((x) => x.id === r.loadId);
    if (!l) { refuse.push(`${r.loadNumber}: load ${r.loadId} not found`); continue; }
    if (l.loadNumber !== r.loadNumber) { refuse.push(`${r.loadId} is ${l.loadNumber}, not ${r.loadNumber}`); continue; }
    const current = l.poNumbers.map((p) => p.trim()).filter(Boolean);
    if (current.length === 1 && current[0] === r.reference) { done.push(r.loadNumber); continue; }
    if (current.length > 0) { refuse.push(`${r.loadNumber} already carries ${current.join(", ")}; not overwriting it with ${r.reference}`); continue; }
    set.push({ loadId: r.loadId, from: l.poNumbers, to: [r.reference] });
  }
  return { set: refuse.length ? [] : set, done, refuse };
}

if (require.main === module) {
  const target = openTarget("bkn-references");
  (async () => {
    const { prisma } = await import("../src/config/database");
    try {
      const found = await prisma.load.findMany({ where: { id: { in: REFERENCES.map((r) => r.loadId) } }, select: { id: true, loadNumber: true, poNumbers: true } });
      const plan = planReferences(found);
      if (plan.refuse.length) { for (const r of plan.refuse) console.error(`[bkn-references] REFUSED: ${r}`); process.exit(2); }
      for (const d of plan.done) console.log(`[bkn-references] already set: ${d}`);
      for (const s of plan.set) console.log(`[bkn-references] PLAN ${REFERENCES.find((r) => r.loadId === s.loadId)!.loadNumber}: poNumbers ${JSON.stringify(s.from)} -> ${JSON.stringify(s.to)}`);
      if (!plan.set.length) { console.log("[bkn-references] nothing to do"); return; }
      if (!target.write) { console.log("[bkn-references] DRY RUN: nothing written"); return; }
      await prisma.$transaction(async (tx: any) => {
        for (const s of plan.set) {
          const moved = await tx.load.updateMany({ where: { id: s.loadId, poNumbers: { equals: s.from } }, data: { poNumbers: s.to } });
          if (moved.count !== 1) throw new Error(`${s.loadId} changed while this ran`);
          await tx.auditTrail.create({ data: { entityType: "Load", entityId: s.loadId, action: "UPDATE", performedById: RECORDED_BY, ipAddress: "script",
            changedFields: { actionDetail: "SET_CUSTOMER_REFERENCE", poNumbers: { from: s.from, to: s.to }, reason: "Beekeepers' customer reference number, as ruled 2026-09-27", source: SOURCE } } });
        }
      });
      console.log(`[bkn-references] EXECUTED: ${plan.set.length} load(s) set, ${plan.set.length} audit row(s)`);
    } finally {
      await prisma.$disconnect();
    }
  })().catch((e) => { console.error("[bkn-references] FAILED:", e?.message ?? e); process.exit(1); });
}
