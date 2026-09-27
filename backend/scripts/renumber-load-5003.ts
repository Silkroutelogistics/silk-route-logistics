/**
 * LOAD 5003 (ruled 2026-09-26): renumber it into the series ONLY IF no rate
 * confirmation and no bill of lading was issued for it; otherwise it stays.
 *
 * 5003 was issued on 2026-09-26 at 16:08Z to a real Beekeepers load by the code
 * then deployed, which still drew from the withdrawn 5001 series. The fail-safe
 * generator (v3.8.blh) issues 121498 onward and never below it.
 *
 * STATUS: AN OPEN DECISION. Written and run as a dry run only; executing it is
 * Wasi's call. Run it only after the arc carrying v3.8.blh is deployed, so the
 * generator that draws the new number is the one production runs.
 *
 * What "issued" is taken to mean, read from the database at run time:
 * - a rate confirmation row on the load;
 * - a shipper tracking token: printing a BOL mints one (generateBOLPrintToken),
 *   and any token means a link naming this load went out;
 * - any document on the load, and any invoice.
 * The script is stricter than the ruling in two places, both toward "it stays":
 * a tender (the tender email names the load to a carrier) and an assigned
 * carrier also refuse.
 *
 * Execute renumbers loadNumber, referenceNumber and srlBolNumber in one
 * transaction, drawing the number through generateLoadNumber, and records an
 * audit row and a load-activity line. Messages and logs that already say 5003
 * are history and are not rewritten.
 *
 * Dry run (read-only credential):
 *   npx tsx scripts/renumber-load-5003.ts --env-file=<backend/.env.production.readonly>
 * Execute (only on Wasi's go, after the deploy):
 *   PRISMA_TARGET=production RESEND_API_KEY= OPENPHONE_API_KEY= QUO_API_KEY= \
 *     npx tsx scripts/renumber-load-5003.ts --env-file=<backend/.env.production.local> --execute --target=prod
 */
import { openTarget } from "./_prodTarget";
import { RECORDED_BY } from "./_bknTipaltiPlan"; // Wasi Haider (ADMIN), who made the ruling

export const OUT_OF_SERIES = "5003";
const SOURCE = "scripts/renumber-load-5003.ts";

export interface RenumberFacts {
  /** Live loads holding 5003 in loadNumber or referenceNumber. */
  holders: number;
  rateConfirmations: number;
  trackingTokens: number;
  documents: number;
  invoices: number;
  tenders: number;
  carrierAssigned: boolean;
}

/** Pure: renumber, stay (with every reason), or nothing to do. */
export function planRenumber(f: RenumberFacts): { go?: true; stay?: string[]; noop?: string } {
  if (f.holders === 0) return { noop: `no live load holds ${OUT_OF_SERIES}` };
  const stay: string[] = [];
  if (f.holders > 1) stay.push(`${f.holders} live loads hold ${OUT_OF_SERIES}; expected one`);
  if (f.rateConfirmations > 0) stay.push(`${f.rateConfirmations} rate confirmation(s) exist for the load`);
  if (f.trackingTokens > 0) stay.push(`${f.trackingTokens} shipper tracking token(s) exist: a BOL print mints one, and any token means a link naming the load went out`);
  if (f.documents > 0) stay.push(`${f.documents} document(s) on the load`);
  if (f.invoices > 0) stay.push(`${f.invoices} invoice(s) on the load`);
  if (f.tenders > 0) stay.push(`${f.tenders} tender(s): the tender email names the load to a carrier`);
  if (f.carrierAssigned) stay.push("a carrier is assigned");
  return stay.length ? { stay } : { go: true };
}

async function readFacts(db: any): Promise<{ facts: RenumberFacts; load: any | null }> {
  const loads = await db.load.findMany({
    where: { deletedAt: null, OR: [{ loadNumber: OUT_OF_SERIES }, { referenceNumber: OUT_OF_SERIES }] },
    select: { id: true, loadNumber: true, referenceNumber: true, srlBolNumber: true, status: true, carrierId: true, customerId: true, createdAt: true },
  });
  const load = loads.length === 1 ? loads[0] : null;
  const count = async (model: string, where: object) => (load ? db[model].count({ where }) : 0);
  const facts: RenumberFacts = {
    holders: loads.length,
    rateConfirmations: await count("rateConfirmation", { loadId: load?.id }),
    trackingTokens: await count("shipperTrackingToken", { loadId: load?.id }),
    documents: await count("document", { OR: [{ loadId: load?.id }, { entityType: "LOAD", entityId: load?.id }] }),
    invoices: await count("invoice", { loadId: load?.id }),
    tenders: await count("loadTender", { loadId: load?.id }),
    carrierAssigned: !!load?.carrierId,
  };
  return { facts, load };
}

async function main() {
  const t = openTarget("renumber-5003");
  const { prisma } = await import("../src/config/database");
  const { generateLoadNumber, formatDocumentNumber } = await import("../src/lib/documentNumber");
  const { loadNumberSeqInfo } = await import("../src/lib/loadNumberSeqInfo");
  try {
    const { facts, load } = await readFacts(prisma);
    console.log("[renumber-5003] BEFORE", JSON.stringify({ load, facts }));
    const plan = planRenumber(facts);
    if (plan.noop) { console.log(`[renumber-5003] nothing to do: ${plan.noop}`); return; }
    if (plan.stay) { for (const r of plan.stay) console.log(`[renumber-5003] STAYS: ${r}`); process.exit(2); }

    const seq = await loadNumberSeqInfo(prisma);
    console.log(`[renumber-5003] PLAN ${OUT_OF_SERIES} -> ${seq.next ?? "(unknown)"} (sequence ${seq.range ?? "unknown"}); loadNumber, referenceNumber, srlBolNumber`);
    if (!t.write) { console.log("[renumber-5003] DRY RUN — nothing written."); return; }

    const n: string = await prisma.$transaction(async (tx: any) => {
      const again = await readFacts(tx);
      const recheck = planRenumber(again.facts);
      if (!recheck.go || again.load?.id !== load.id) throw new Error(`state moved since the check: ${JSON.stringify(recheck)}`);
      const next = await generateLoadNumber(tx);
      const to = { loadNumber: next, referenceNumber: next, srlBolNumber: formatDocumentNumber(next, "BOL") };
      const r = await tx.load.updateMany({ where: { id: load.id, loadNumber: load.loadNumber, referenceNumber: load.referenceNumber }, data: to });
      if (r.count !== 1) throw new Error(`expected to renumber 1 load, matched ${r.count}`);
      const from = { loadNumber: load.loadNumber, referenceNumber: load.referenceNumber, srlBolNumber: load.srlBolNumber };
      await tx.auditTrail.create({ data: { entityType: "Load", entityId: load.id, action: "UPDATE", performedById: RECORDED_BY, ipAddress: "script",
        changedFields: { actionDetail: "RENUMBER_OUT_OF_SERIES_LOAD", from, to, ruling: "2026-09-26: renumber only if no RC or BOL was issued", source: SOURCE } } });
      await tx.loadActivity.create({ data: { loadId: load.id, eventType: "load_renumbered", actorType: "SYSTEM", actorName: "SRL",
        description: `Load ${OUT_OF_SERIES} renumbered to ${next}: ${OUT_OF_SERIES} was issued outside the load-number series, before any rate confirmation or BOL`,
        metadata: { from, to, source: SOURCE } } });
      return next;
    }, { timeout: 30_000 });
    console.log(`[renumber-5003] EXECUTED: ${OUT_OF_SERIES} -> ${n}`);
    const after = await prisma.load.findUnique({ where: { id: load.id }, select: { loadNumber: true, referenceNumber: true, srlBolNumber: true } });
    console.log("[renumber-5003] AFTER", JSON.stringify(after));
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => { console.error("[renumber-5003] FAILED:", e?.message ?? e); process.exit(1); });
}
