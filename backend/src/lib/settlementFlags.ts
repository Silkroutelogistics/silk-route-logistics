import { prisma } from "../config/database";
import { log } from "./logger";
import type { CarrierPayStatus } from "@prisma/client";

/**
 * Keep `Load.carrierSettled` in step with the CarrierPay rows behind it.
 *
 * WHY THIS EXISTS. `carrierSettled` was written by exactly one site — the
 * `POST /accounting/payments/:id/mark-paid` endpoint (v3.8.ati) — and no
 * frontend calls that endpoint. The three settle paths the product actually
 * uses (`settlementController.markSettlementPaid`,
 * `carrierPayController.updateCarrierPay`, `batchUpdateCarrierPays`) never set
 * it. The Track & Trace "delivered" tab ORs on `carrierSettled: false`, so a
 * fully paid load stayed on the tab forever — the exact defect §13.3 Item 211
 * set out to fix, wired to the one endpoint nobody calls. (§13.3 Item 221.3.)
 *
 * WHY IT IS DERIVED RATHER THAN SET. Four call sites setting a boolean is four
 * chances to forget, and a fifth settle path added later inherits nothing. This
 * asks the question the flag is shorthand for — *are all of this load's carrier
 * pays settled?* — and answers it from the rows. A path that pays a carrier
 * calls this and is correct; a path that half-pays one is also correct, because
 * the answer comes out false. VOID counts as settled: a voided pay is not
 * outstanding, and a load whose only pay was voided should not sit on the
 * delivered tab waiting for money that will never move.
 *
 * NON-FATAL BY CONSTRUCTION. This is a board-visibility flag, not money. A
 * failure here must never roll back a payment that already happened, so every
 * caller invokes it after its own transaction has committed and it swallows its
 * own errors into a log line.
 */

/** Statuses that mean "no longer awaiting payment". */
const SETTLED_STATUSES: CarrierPayStatus[] = ["PAID", "VOID"];

/**
 * Recompute `carrierSettled` for one load from its CarrierPay rows.
 *
 * Safe to call repeatedly and safe to call on a load that has no pays at all —
 * with nothing to settle the flag stays false, which is the honest answer for a
 * delivered load nobody has raised a settlement against yet.
 */
export async function syncCarrierSettled(loadId: string | null | undefined): Promise<void> {
  if (!loadId) return;
  try {
    const [total, settled] = await Promise.all([
      prisma.carrierPay.count({ where: { loadId } }),
      prisma.carrierPay.count({ where: { loadId, status: { in: SETTLED_STATUSES } } }),
    ]);
    const isSettled = total > 0 && settled === total;

    // Only write on a change. This runs inside batch settle loops, and a
    // no-op UPDATE per load would be pure write amplification.
    const current = await prisma.load.findUnique({
      where: { id: loadId },
      select: { carrierSettled: true },
    });
    if (!current || current.carrierSettled === isSettled) return;

    await prisma.load.update({ where: { id: loadId }, data: { carrierSettled: isSettled } });
  } catch (err) {
    log.error({ err, loadId }, "[Settlement] carrierSettled flag not synced (non-fatal)");
  }
}

/** Recompute for several loads at once, deduplicated. Used by batch settle. */
export async function syncCarrierSettledForPays(payIds: string[]): Promise<void> {
  if (!payIds.length) return;
  try {
    const pays = await prisma.carrierPay.findMany({
      where: { id: { in: payIds } },
      select: { loadId: true },
    });
    const loadIds = [...new Set(pays.map((p) => p.loadId).filter(Boolean))] as string[];
    for (const id of loadIds) await syncCarrierSettled(id);
  } catch (err) {
    log.error({ err, count: payIds.length }, "[Settlement] batch carrierSettled sync failed (non-fatal)");
  }
}
