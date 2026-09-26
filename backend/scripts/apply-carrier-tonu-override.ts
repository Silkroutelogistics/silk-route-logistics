/**
 * apply-carrier-tonu-override — pay one carrier a TONU above the default, once.
 *
 *   npx tsx scripts/apply-carrier-tonu-override.ts --load=SRL-121492 --amount=250 \
 *     --reason="carrier negotiated TONU" --override-by="Wasi Haider" --env-file=<file>
 *   ... --execute --target=prod   (with PRISMA_TARGET=production) to write
 *
 * WHERE THE CARRIER'S TONU LIVES. The TONU ledger row's `amount` is what the
 * carrier is paid, and raiseTonuCarrierPayable / syncCarrierPayAccessorials read
 * it. There is no override column anywhere, so the override IS an edit of that
 * row (the Item 282 rule: edit the ledger row, never a document line), with the
 * reason and who overrode it written into the row's notes and an AuditTrail row.
 *
 * ON A LOAD WHOSE FLIP NEVER RECORDED THE TONU (SRL-121492: the 2026-09-21 write
 * failed silently) there is no row to edit and no payable. This script then
 * records the obligation through recordTonuObligation, sets its amount, and
 * raises the payable through raiseTonuCarrierPayable — the service paths, in
 * that order, so the payable is raised at the overridden figure. It creates no
 * customer invoice.
 *
 * Refuses a load that is not TONU, or whose fault side does not pay the carrier.
 */
import { openTarget } from "./_prodTarget";

export interface OverrideFacts {
  status: string;
  tonuFaultSide: string | null;
  hasCarrier: boolean;
  row: { id: string; amount: number } | null;
  hasPayable: boolean;
}

export type OverrideStep = "RECORD_OBLIGATION" | "SET_AMOUNT" | "RAISE_PAYABLE" | "SYNC_PAYABLE";

/** Pure: the writes, in order, or why not. */
export function planOverride(f: OverrideFacts, amount: number): { steps?: OverrideStep[]; refuse?: string } {
  if (f.status !== "TONU") return { refuse: `load is ${f.status}, not TONU` };
  if (f.tonuFaultSide !== "CUSTOMER" && f.tonuFaultSide !== "BROKER") return { refuse: `fault side ${f.tonuFaultSide} does not pay the carrier` };
  if (!f.hasCarrier) return { refuse: "no carrier on the load" };
  if (!Number.isFinite(amount) || amount <= 0) return { refuse: `amount ${amount} is not positive` };
  const steps: OverrideStep[] = [];
  if (!f.row) steps.push("RECORD_OBLIGATION");
  if (!f.row || f.row.amount !== amount) steps.push("SET_AMOUNT");
  steps.push(f.hasPayable ? "SYNC_PAYABLE" : "RAISE_PAYABLE");
  return { steps };
}

/** Pure: the note the row carries. */
export function overrideNote(amount: number, reason: string, by: string, existing: string | null): string {
  return `Carrier TONU override: ${amount.toFixed(2)} (one-time) · reason: ${reason} · overrideBy: ${by}` + (existing ? `\n${existing}` : "");
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

async function snapshot(prisma: any, ref: string) {
  return prisma.load.findUnique({
    where: { referenceNumber: ref },
    select: {
      id: true, referenceNumber: true, status: true, tonuFaultSide: true, carrierId: true,
      carrier: { select: { carrierProfile: { select: { companyName: true } } } },
      loadAccessorials: { where: { type: "TONU" }, select: { id: true, amount: true, customerAmount: true, status: true, billedTo: true, notes: true, shipperInvoiceId: true } },
      carrierPays: { select: { id: true, paymentNumber: true, status: true, amount: true, netAmount: true, accessorialsTotal: true, dueDate: true } },
      invoices: { select: { id: true, srlDocNumber: true, status: true, totalAmount: true } },
    },
  });
}

async function main() {
  const t = openTarget("tonu-override");
  const ref = arg("load");
  const amount = Number(arg("amount"));
  const reason = arg("reason") ?? "";
  const by = arg("override-by") ?? "";
  const actorEmail = arg("by") ?? "whaider@silkroutelogistics.ai";
  if (!ref || !reason || !by) { console.error("[tonu-override] REFUSED: --load, --reason and --override-by are required."); process.exit(2); }

  const { prisma } = await import("../src/config/database");
  try {
    const before = await snapshot(prisma, ref);
    if (!before) { console.error(`[tonu-override] REFUSED: no load ${ref}.`); process.exit(2); }
    console.log("[tonu-override] BEFORE", JSON.stringify(before));
    const live = before.loadAccessorials.find((r: any) => r.status !== "REJECTED") ?? null;
    const facts: OverrideFacts = {
      status: before.status, tonuFaultSide: before.tonuFaultSide, hasCarrier: !!before.carrierId,
      row: live ? { id: live.id, amount: Number(live.amount) } : null,
      hasPayable: before.carrierPays.some((p: any) => p.status !== "VOID"),
    };
    const plan = planOverride(facts, amount);
    if (plan.refuse) { console.error(`[tonu-override] REFUSED: ${plan.refuse}`); process.exit(2); }
    console.log("[tonu-override] PLAN", JSON.stringify({ steps: plan.steps, amount, note: overrideNote(amount, reason, by, null) }));
    if (!t.write) { console.log("[tonu-override] DRY RUN — nothing written."); return; }

    const performer = await prisma.user.findFirst({ where: { email: { equals: actorEmail, mode: "insensitive" } }, select: { id: true } });
    if (!performer) { console.error(`[tonu-override] REFUSED: no user ${actorEmail}.`); process.exit(2); }

    const { recordTonuObligation } = await import("../src/services/tonuBillingService");
    const { raiseTonuCarrierPayable, syncCarrierPayAccessorials } = await import("../src/services/integrationService");

    let rowId = facts.row?.id ?? null;
    let rowNotes: string | null = live?.notes ?? null;
    // The amount the audit row says it moved FROM. For a row recorded in this
    // run that is the figure recordTonuObligation wrote, not null — the first
    // production run (2026-09-26, SRL-121492) logged from: null before this fix.
    let fromAmount: number | null = facts.row?.amount ?? null;
    for (const step of plan.steps!) {
      if (step === "RECORD_OBLIGATION") {
        const r = await recordTonuObligation(before.id, before.tonuFaultSide as any, performer.id);
        console.log("[tonu-override] RECORD_OBLIGATION", JSON.stringify(r));
        rowId = r.accessorialId ?? null;
        fromAmount = typeof r.amount === "number" ? r.amount : null;
        const row = rowId ? await prisma.loadAccessorial.findUnique({ where: { id: rowId }, select: { notes: true } }) : null;
        rowNotes = row?.notes ?? null;
        if (!rowId) throw new Error("recordTonuObligation returned no row");
      }
      if (step === "SET_AMOUNT") {
        const from = fromAmount;
        await prisma.$transaction(async (tx: any) => {
          await tx.loadAccessorial.update({ where: { id: rowId }, data: { amount, notes: overrideNote(amount, reason, by, rowNotes) } });
          await tx.auditTrail.create({
            data: {
              entityType: "LoadAccessorial", entityId: rowId, action: "UPDATE", performedById: performer.id,
              changedFields: {
                actionDetail: "CARRIER_TONU_OVERRIDE", load: ref, amount: { from, to: amount },
                reason, overrideBy: by, oneTime: true, via: "scripts/apply-carrier-tonu-override.ts",
              },
            },
          });
        });
        console.log(`[tonu-override] SET_AMOUNT ${from} -> ${amount}`);
      }
      if (step === "RAISE_PAYABLE") console.log("[tonu-override] RAISE_PAYABLE", JSON.stringify(await raiseTonuCarrierPayable(before.id)));
      if (step === "SYNC_PAYABLE") { await syncCarrierPayAccessorials(before.id); console.log("[tonu-override] SYNC_PAYABLE done"); }
    }
    console.log("[tonu-override] AFTER", JSON.stringify(await snapshot(prisma, ref)));
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
