/**
 * v3.8.bjx — one answer to "how many loads and how much revenue has this
 * customer given us", read by the CRM Loads tab, the customer drawer header and
 * the Order Builder sidebar.
 *
 * Before this, the Loads tab summed customerRate over every load including
 * CANCELLED ones, and the drawer header summed Shipment.rate — the CARRIER rate,
 * with no status filter — so the two surfaces disagreed with each other and both
 * disagreed with what the customer was billed.
 *
 * THE RULES, stated once:
 *   - A CANCELLED or soft-deleted load is out of every figure. It is still listed
 *     in Recent Loads, with its badge, because the history is real.
 *   - Revenue is EARNED revenue only:
 *       an invoiced load        → its non-VOID, non-REJECTED, live invoices
 *       a TONU load, uninvoiced  → the TONU charge the customer is billed from the
 *                                  ledger (never the linehaul that never ran)
 *       delivered, uninvoiced    → customerRate
 *       anything still open      → nothing yet; it has not been earned
 *   - Avg margin is over delivered-or-later loads that carry a margin, divided by
 *     THAT count (it used to divide by every load, margin or not). A TONU is left
 *     out: its marginPercent was computed on a linehaul that was never billed.
 *     No such load → null, rendered "—", never a confident 0.
 *   - A lane is origin city+state → destination city+state. It used to key on the
 *     state pair only, so Irving TX → Hebron KY was counted under whichever TX
 *     city appeared first.
 */
import { customerPriceFor } from "../services/invoiceService";

export const EARNED_LOAD_STATUSES = new Set(["DELIVERED", "POD_RECEIVED", "INVOICED", "COMPLETED"]);
const EXCLUDED_INVOICE_STATUSES = new Set(["VOID", "REJECTED"]);

export interface StatsInvoice {
  status: string;
  totalAmount: number | null;
  amount: number;
  deletedAt?: Date | null;
}

export interface StatsAccessorial {
  type: string;
  status: string;
  billedTo: string | null;
  amount: unknown;
  customerAmount?: unknown;
  quantity?: unknown;
  unit?: unknown;
}

export interface StatsLoad {
  status: string;
  deletedAt?: Date | null;
  customerRate: number | null;
  marginPercent: number | null;
  originCity: string | null;
  originState: string | null;
  destCity: string | null;
  destState: string | null;
  invoices: StatsInvoice[];
  loadAccessorials: StatsAccessorial[];
}

export interface TopLane {
  origin: string;
  dest: string;
  count: number;
  /** Mean customerRate over the lane's non-TONU loads that carry one; null if none. */
  avgRate: number | null;
}

export interface CustomerLoadStats {
  totalLoads: number;
  earnedRevenue: number;
  avgMargin: number | null;
  topLanes: TopLane[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function countsTowardStats(load: Pick<StatsLoad, "status" | "deletedAt">): boolean {
  return load.status !== "CANCELLED" && !load.deletedAt;
}

export function earnedRevenueFor(load: StatsLoad, negotiated: Record<string, number> | null | undefined): number {
  if (!countsTowardStats(load)) return 0;

  const invoices = (load.invoices ?? []).filter(
    (i) => !i.deletedAt && !EXCLUDED_INVOICE_STATUSES.has(String(i.status)),
  );
  if (invoices.length > 0) {
    return round2(invoices.reduce((s, i) => s + Number(i.totalAmount ?? i.amount ?? 0), 0));
  }

  if (load.status === "TONU") {
    // Same filter the billing path uses (invoiceService.unbilledCustomerAccessorials):
    // approved, billed to the shipper or unassigned. A broker- or carrier-fault
    // TONU bills the customer nothing, so it earns nothing here either.
    const rows = (load.loadAccessorials ?? []).filter(
      (a) =>
        String(a.type) === "TONU" &&
        String(a.status) === "APPROVED" &&
        (!a.billedTo || String(a.billedTo).toUpperCase() === "SHIPPER"),
    );
    return round2(rows.reduce((s, a) => s + customerPriceFor(a as any, negotiated), 0));
  }

  if (EARNED_LOAD_STATUSES.has(load.status)) return round2(Number(load.customerRate ?? 0));
  return 0;
}

export function summarizeCustomerLoads(
  loads: StatsLoad[],
  negotiated: Record<string, number> | null | undefined,
): CustomerLoadStats {
  const live = loads.filter(countsTowardStats);

  const earnedRevenue = round2(live.reduce((s, l) => s + earnedRevenueFor(l, negotiated), 0));

  const withMargin = live.filter(
    (l) => EARNED_LOAD_STATUSES.has(l.status) && l.marginPercent != null && Number.isFinite(l.marginPercent),
  );
  const avgMargin = withMargin.length
    ? round2(withMargin.reduce((s, l) => s + Number(l.marginPercent), 0) / withMargin.length)
    : null;

  const lanes = new Map<string, { origin: string; dest: string; count: number; rateSum: number; rateN: number }>();
  for (const l of live) {
    const origin = `${(l.originCity ?? "").trim()}, ${(l.originState ?? "").trim()}`;
    const dest = `${(l.destCity ?? "").trim()}, ${(l.destState ?? "").trim()}`;
    const key = `${origin}|${dest}`.toLowerCase();
    const lane = lanes.get(key) ?? { origin, dest, count: 0, rateSum: 0, rateN: 0 };
    lane.count++;
    if (l.status !== "TONU" && l.customerRate != null && Number(l.customerRate) > 0) {
      lane.rateSum += Number(l.customerRate);
      lane.rateN++;
    }
    lanes.set(key, lane);
  }
  const topLanes = Array.from(lanes.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((l) => ({ origin: l.origin, dest: l.dest, count: l.count, avgRate: l.rateN ? Math.round(l.rateSum / l.rateN) : null }));

  return { totalLoads: live.length, earnedRevenue, avgMargin, topLanes };
}

/** The select every caller uses, so the query and the rules cannot drift apart. */
export const CUSTOMER_STATS_LOAD_SELECT = {
  status: true,
  deletedAt: true,
  customerRate: true,
  marginPercent: true,
  originCity: true,
  originState: true,
  destCity: true,
  destState: true,
  invoices: { select: { status: true, totalAmount: true, amount: true, deletedAt: true } },
  loadAccessorials: {
    where: { type: "TONU" as const },
    select: { type: true, status: true, billedTo: true, amount: true, customerAmount: true, quantity: true, unit: true },
  },
} as const;

export async function loadCustomerLoadStats(db: any, customerId: string): Promise<CustomerLoadStats> {
  const [customer, loads] = await Promise.all([
    db.customer.findUnique({ where: { id: customerId }, select: { defaultAccessorialRates: true } }),
    db.load.findMany({
      where: { customerId, deletedAt: null, status: { not: "CANCELLED" } },
      select: CUSTOMER_STATS_LOAD_SELECT,
    }),
  ]);
  const negotiated = (customer?.defaultAccessorialRates ?? null) as Record<string, number> | null;
  return summarizeCustomerLoads(loads ?? [], negotiated);
}
