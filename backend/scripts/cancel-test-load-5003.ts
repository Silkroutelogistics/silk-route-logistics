/**
 * Load 5003 was a test load (ruled 2026-09-27): cancel it, reason "test load", and close its
 * risk alert. Do not renumber it.
 *
 * The cancel goes through the real status handler (loadController.updateLoadStatus), not a
 * copy of it: the reason/fault record, the cancel cascade (shipment, tracking token), the
 * reversal and the lifecycle audit row are the platform's own, written once. The reason
 * policy needs a note of at least 10 characters for OTHER, and "test load" is 9, so the note
 * is "test load, not real freight" -- the ruled words, nothing added but what the ruling says.
 *
 * Its risk alert: the risk cron scans active statuses only, so CANCELLED stops the flagging.
 * The unread "RISK RED" notification(s) for the load are marked read, one audit row each.
 *
 * What the cancel does NOT do, by design: send an email (the status path has none for
 * CANCELLED); void the SIGNED rate confirmation (executed RCs are evidence, never voided);
 * clear the carrier (cancelling is not releasing). The assigned carrier gets the platform's
 * in-app "Load Cancelled" notice.
 *
 * Refuses if the load is not 5003, holds a POD, an invoice or a live carrier pay (then it
 * was not only a test), or is already TONU. Dry run by default; writing needs
 * PRISMA_TARGET=production --execute --target=prod --env-file=<production file>.
 */
import { openTarget } from "./_prodTarget";
import { RECORDED_BY } from "./_bknTipaltiPlan";

const SOURCE = "scripts/cancel-test-load-5003.ts";
export const LOAD_ID = "cmuil3jkx001bmz2hczbd9xct";
export const REASON_CODE = "OTHER";
export const NOTE = "test load, not real freight";

export interface CancelState {
  loadNumber: string | null; status: string; podOnFile: boolean; invoices: number; liveCarrierPays: number;
  cancellationReasonCode: string | null; cancellationReason: string | null;
}

/** Pure. */
export function planCancel(s: CancelState): { go?: true; done?: string; refuse: string[] } {
  const refuse: string[] = [];
  if (s.loadNumber !== "5003") refuse.push(`load ${LOAD_ID} is numbered ${s.loadNumber}, not 5003`);
  if (s.status === "CANCELLED") {
    return s.cancellationReasonCode === REASON_CODE && (s.cancellationReason ?? "").startsWith("test load")
      ? { done: "already cancelled as a test load", refuse }
      : { refuse: [...refuse, `already CANCELLED with another reason (${s.cancellationReasonCode}: ${s.cancellationReason}); not rewriting it`] };
  }
  if (s.status === "TONU") refuse.push("the load is TONU, which carries an obligation; not a test-load cancel");
  if (s.podOnFile) refuse.push("a POD is on file: the load was delivered");
  if (s.invoices > 0) refuse.push(`${s.invoices} invoice(s) on the load`);
  if (s.liveCarrierPays > 0) refuse.push(`${s.liveCarrierPays} live carrier pay(s) on the load`);
  if (NOTE.length < 10) refuse.push("the note is shorter than the policy's 10 characters");
  return refuse.length ? { refuse } : { go: true, refuse };
}

if (require.main === module) {
  const target = openTarget("cancel-5003");
  (async () => {
    const { prisma } = await import("../src/config/database");
    const { updateLoadStatus } = await import("../src/controllers/loadController");
    const { updateLoadStatusSchema } = await import("../src/validators/load");
    try {
      const load = await prisma.load.findUnique({ where: { id: LOAD_ID }, select: { loadNumber: true, status: true, podUrl: true, podReceivedAt: true, cancellationReasonCode: true, cancellationReason: true } });
      if (!load) { console.error("[cancel-5003] REFUSED: load not found"); process.exit(2); }
      const state: CancelState = {
        loadNumber: load.loadNumber, status: load.status, podOnFile: !!(load.podUrl || load.podReceivedAt),
        invoices: await prisma.invoice.count({ where: { loadId: LOAD_ID, deletedAt: null, status: { not: "VOID" } } }),
        liveCarrierPays: await prisma.carrierPay.count({ where: { loadId: LOAD_ID, status: { notIn: ["VOID"] } } }),
        cancellationReasonCode: load.cancellationReasonCode, cancellationReason: load.cancellationReason,
      };
      const plan = planCancel(state);
      if (plan.refuse.length) { for (const r of plan.refuse) console.error(`[cancel-5003] REFUSED: ${r}`); process.exit(2); }
      const riskNotes = await prisma.notification.findMany({ where: { title: { contains: "RISK" }, read: false, OR: [{ title: { contains: "5003" } }, { message: { contains: "5003" } }] }, select: { id: true, title: true } });
      console.log(`[cancel-5003] ${plan.done ?? `PLAN ${load.status} -> CANCELLED, ${REASON_CODE}: "${NOTE}"`}; unread risk notices to close: ${riskNotes.length}`);
      if (!target.write) { console.log("[cancel-5003] DRY RUN: nothing written"); return; }

      if (plan.go) {
        const actor = await prisma.user.findUnique({ where: { id: RECORDED_BY }, select: { id: true, email: true, role: true, firstName: true, lastName: true } });
        const body = updateLoadStatusSchema.parse({ status: "CANCELLED", cancellationReasonCode: REASON_CODE, cancellationReason: NOTE });
        let status = 200, payload: any = null;
        const res: any = { status(c: number) { status = c; return this; }, json(b: any) { payload = b; return this; } };
        await updateLoadStatus({ params: { id: LOAD_ID }, body, user: actor, ip: "script", headers: { "user-agent": SOURCE }, get: () => undefined } as any, res);
        if (status >= 400) { console.error(`[cancel-5003] the handler refused: ${status} ${JSON.stringify(payload)}`); process.exit(1); }
        console.log(`[cancel-5003] handler ${status}: status ${payload?.status}, reason ${payload?.cancellationReasonCode} "${payload?.cancellationReason}"`);
        // The reversal (onLoadCancelledOrTONU) is fire-and-forget in the handler. Its first write is
        // the before-image on cancellationSnapshot; wait for it, then give the rest a moment.
        for (let i = 0; i < 40; i++) {
          const snap = (await prisma.load.findUnique({ where: { id: LOAD_ID }, select: { cancellationSnapshot: true } }))?.cancellationSnapshot as any;
          if (snap && snap.tenders) break;
          await new Promise((r) => setTimeout(r, 500));
        }
        await new Promise((r) => setTimeout(r, 4000));
      }
      if (riskNotes.length) {
        await prisma.$transaction(async (tx: any) => {
          for (const n of riskNotes) {
            await tx.notification.update({ where: { id: n.id }, data: { read: true, readAt: new Date() } });
            await tx.auditTrail.create({ data: { entityType: "Notification", entityId: n.id, action: "UPDATE", performedById: RECORDED_BY, ipAddress: "script",
              changedFields: { actionDetail: "RISK_ALERT_CLOSED", loadId: LOAD_ID, title: n.title, reason: "load 5003 cancelled as a test load", source: SOURCE } } });
          }
        });
        console.log(`[cancel-5003] risk notices closed: ${riskNotes.length}`);
      }
      console.log("[cancel-5003] EXECUTED");
    } finally {
      await prisma.$disconnect();
    }
  })().catch((e) => { console.error("[cancel-5003] FAILED:", e?.message ?? e); process.exit(1); });
}
