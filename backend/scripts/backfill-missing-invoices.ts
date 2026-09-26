/**
 * backfill-missing-invoices — find loads that should carry a customer invoice
 * and do not (invoicing audit G-2, queue B2c).
 *
 *   npx tsx scripts/backfill-missing-invoices.ts            # DRY RUN (default): list only
 *   npx tsx scripts/backfill-missing-invoices.ts --execute                  # write — LOCAL databases only
 *   npx tsx scripts/backfill-missing-invoices.ts --execute --target=prod    # write — production, both flags
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
 * WRITES NEED --execute, AND A NON-LOCAL HOST ALSO NEEDS --target=prod. Either
 * flag alone against production refuses (planWrite). The pair is the explicit
 * statement that this run is a production write.
 *
 * THE TONU AMOUNT IS THE CUSTOMER'S. The ledger row carries the carrier amount
 * (TONU_AMOUNT) with customerAmount null, and the invoice line is priced from
 * the customer's rate card, Customer.defaultAccessorialRates.TONU — $250 for
 * Beekeepers — falling back to the default. Nothing here prices a TONU.
 *
 * THE NUMBER FOLLOWS THE LOAD: its digits plus I, a legacy load's included
 * (SRL-121492 -> 121492I, 121498 -> 121498I). An invoice already issued keeps
 * its number. The dry run prints the number each invoice would take; the
 * service assigns it.
 */
import { hostOf, isLocalHost } from "./prisma-target-guard";
import { resolveTonuBilling } from "../src/lib/tonuPolicy";
import { formatDocumentNumber, resolveLoadStem } from "../src/lib/documentNumber";

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

/** Pure: may this run write, and if not, why. */
export function planWrite(argv: string[], host: string): { write: boolean; refuse?: string } {
  const execute = argv.includes("--execute");
  const targetProd = argv.includes("--target=prod");
  if (argv.includes("--commit")) return { write: false, refuse: "--commit is retired; use --execute (and --target=prod for production)." };
  if (!execute) return { write: false, refuse: targetProd ? "--target=prod without --execute is a dry run; add --execute to write." : undefined };
  if (!isLocalHost(host) && !targetProd) return { write: false, refuse: `non-local host ${host} needs --target=prod as well as --execute.` };
  if (isLocalHost(host) && targetProd) return { write: false, refuse: `--target=prod but the host is local (${host}). Refusing a mismatched run.` };
  return { write: true };
}

/** Pure: the number an invoice on this load takes — its digits plus I. */
export function invoiceNumberFor(load: { loadNumber?: string | null; referenceNumber?: string | null }): string | null {
  const stem = resolveLoadStem(load);
  return stem ? formatDocumentNumber(stem, "INVOICE") : null;
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const host = url ? hostOf(url) : "(unset)";
  const plan = planWrite(process.argv, host);
  if (plan.refuse && process.argv.includes("--execute")) {
    console.error(`[backfill] REFUSED: ${plan.refuse}`);
    process.exit(2);
  }
  if (plan.refuse) console.log(`[backfill] note: ${plan.refuse}`);
  const commit = plan.write;
  console.log(`[backfill] target ${host} · mode ${commit ? "EXECUTE" : "DRY RUN"}`);

  const { prisma } = await import("../src/config/database");
  const loads = await prisma.load.findMany({
    where: { deletedAt: null, status: { in: [...INVOICEABLE_STATUSES, "TONU"] as any } },
    select: {
      id: true, referenceNumber: true, loadNumber: true, status: true, tonuFaultSide: true, customerRate: true,
      invoices: { where: { invoiceKind: "BASE", status: { not: "VOID" } }, select: { invoiceNumber: true } },
      loadAccessorials: { where: { type: "TONU", status: { not: "REJECTED" } }, select: { id: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const found: { ref: string; status: string; action: Exclude<BackfillAction, null>; id: string; faultSide: string | null; number: string | null }[] = [];
  for (const l of loads) {
    const action = classify({
      status: l.status, tonuFaultSide: l.tonuFaultSide,
      hasBaseInvoice: l.invoices.length > 0, hasTonuLedgerRow: l.loadAccessorials.length > 0,
    });
    if (action) found.push({ ref: l.referenceNumber, status: l.status, action, id: l.id, faultSide: l.tonuFaultSide, number: invoiceNumberFor(l) });
  }

  console.log(`[backfill] scanned ${loads.length} load(s); ${found.length} missing an invoice`);
  for (const f of found) console.log(`  ${f.ref.padEnd(14)} ${f.status.padEnd(13)} -> ${f.action.padEnd(24)} invoice ${f.number ?? "(no stem)"}`);

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
