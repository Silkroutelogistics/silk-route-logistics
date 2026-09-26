/**
 * backfill-missing-invoices — find loads that should carry a customer invoice
 * and do not (invoicing audit G-2, queue B2c).
 *
 *   npx tsx scripts/backfill-missing-invoices.ts            # DRY RUN (default): list only
 *   npx tsx scripts/backfill-missing-invoices.ts --commit   # write — LOCAL databases only
 *
 * WHY: SRL-121492 went TONU on 2026-09-21 and its ledger write failed silently,
 * so it has no TONU row and no invoice. Nothing in the platform lists loads in
 * that state. This does.
 *
 * WHAT COUNTS AS MISSING, per load (see `classify`):
 *   - DELIVERED / POD_RECEIVED / INVOICED / COMPLETED with no non-VOID BASE
 *     invoice                                  -> autoGenerateInvoice (linehaul)
 *   - TONU whose fault side bills the customer, with no TONU ledger row
 *                                              -> recordTonuObligation, then
 *                                                 raiseTonuCustomerCharge
 *   - TONU with its ledger row but no BASE invoice -> raiseTonuCustomerCharge
 * A TONU is NEVER routed through autoGenerateInvoice: that bills the linehaul for
 * a truck that never moved (Item 205).
 *
 * --commit REFUSES ANY NON-LOCAL DATABASE HOST, by construction, using the same
 * host test as prisma-target-guard. A production run is a decision (open
 * decision D2 in the audit), not a flag — this script does not offer one.
 *
 * The amount a TONU is recorded at is the policy default the service writes
 * (TONU_AMOUNT). A negotiated figure (121492 was agreed at $250) is corrected
 * afterwards by editing the ledger row, never the invoice line (Item 282 rule).
 */
import { hostOf, isLocalHost } from "./prisma-target-guard";
import { resolveTonuBilling } from "../src/lib/tonuPolicy";

export const INVOICEABLE_STATUSES = ["DELIVERED", "POD_RECEIVED", "INVOICED", "COMPLETED"] as const;

export type BackfillAction = "AUTO_INVOICE" | "RECORD_TONU_THEN_CHARGE" | "RAISE_TONU_CHARGE" | null;

export interface LoadFacts {
  status: string;
  tonuFaultSide: string | null;
  hasBaseInvoice: boolean;
  hasTonuLedgerRow: boolean;
}

/** Pure: what, if anything, a load is missing. */
export function classify(l: LoadFacts): BackfillAction {
  if ((INVOICEABLE_STATUSES as readonly string[]).includes(l.status)) {
    return l.hasBaseInvoice ? null : "AUTO_INVOICE";
  }
  if (l.status === "TONU") {
    if (!l.tonuFaultSide) return null; // nothing billable until a fault side exists
    if (!resolveTonuBilling(l.tonuFaultSide as any).billCustomer) return null;
    if (!l.hasTonuLedgerRow) return "RECORD_TONU_THEN_CHARGE";
    return l.hasBaseInvoice ? null : "RAISE_TONU_CHARGE";
  }
  return null;
}

async function main() {
  const commit = process.argv.includes("--commit");
  const url = process.env.DATABASE_URL ?? "";
  const host = url ? hostOf(url) : "(unset)";
  if (commit && !isLocalHost(host)) {
    console.error(`[backfill] REFUSED: --commit against non-local host ${host}. A production run is a decision, not a flag.`);
    process.exit(2);
  }
  console.log(`[backfill] target ${host} · mode ${commit ? "COMMIT" : "DRY RUN"}`);

  const { prisma } = await import("../src/config/database");
  const loads = await prisma.load.findMany({
    where: { deletedAt: null, status: { in: [...INVOICEABLE_STATUSES, "TONU"] as any } },
    select: {
      id: true, referenceNumber: true, status: true, tonuFaultSide: true, customerRate: true,
      invoices: { where: { invoiceKind: "BASE", status: { not: "VOID" } }, select: { invoiceNumber: true } },
      loadAccessorials: { where: { type: "TONU", status: { not: "REJECTED" } }, select: { id: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const found: { ref: string; status: string; action: Exclude<BackfillAction, null>; id: string; faultSide: string | null }[] = [];
  for (const l of loads) {
    const action = classify({
      status: l.status, tonuFaultSide: l.tonuFaultSide,
      hasBaseInvoice: l.invoices.length > 0, hasTonuLedgerRow: l.loadAccessorials.length > 0,
    });
    if (action) found.push({ ref: l.referenceNumber, status: l.status, action, id: l.id, faultSide: l.tonuFaultSide });
  }

  console.log(`[backfill] scanned ${loads.length} load(s); ${found.length} missing an invoice`);
  for (const f of found) console.log(`  ${f.ref.padEnd(14)} ${f.status.padEnd(13)} -> ${f.action}`);

  if (commit) {
    const { autoGenerateInvoice, raiseTonuCustomerCharge } = await import("../src/services/invoiceService");
    const { recordTonuObligation } = await import("../src/services/tonuBillingService");
    for (const f of found) {
      if (f.action === "AUTO_INVOICE") await autoGenerateInvoice(f.id);
      if (f.action === "RECORD_TONU_THEN_CHARGE") await recordTonuObligation(f.id, f.faultSide as any);
      if (f.action === "RECORD_TONU_THEN_CHARGE" || f.action === "RAISE_TONU_CHARGE") await raiseTonuCustomerCharge(f.id);
      console.log(`  done ${f.ref}`);
    }
  }
  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
