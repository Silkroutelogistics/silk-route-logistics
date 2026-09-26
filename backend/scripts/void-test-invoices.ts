/**
 * void-test-invoices — void invoices that were test entries, by explicit id.
 *
 *   npx tsx scripts/void-test-invoices.ts --ids=<id>,<id>                          # DRY RUN
 *   npx tsx scripts/void-test-invoices.ts --ids=<id>,<id> --execute                # LOCAL host
 *   PRISMA_TARGET=production RESEND_API_KEY= OPENPHONE_API_KEY= QUO_API_KEY= \
 *     npx tsx scripts/void-test-invoices.ts --ids=<id>,<id> --env-file=<file> --execute --target=prod
 *
 * Reaches a database only through scripts/_prodTarget.ts, the gate every other
 * production write script uses: a non-local write needs --execute, --target=prod
 * AND PRISMA_TARGET=production; the URL can come from an explicit --env-file; any
 * outbound key that is set refuses the run; the host is printed masked.
 *
 * WHY: INV-1001 (Gail & Rice) and INV-1002 (Graphic Packaging) are test entries
 * (ruled 2026-09-26) that sat OVERDUE and were dunned. Nothing in the console
 * voids by explicit id with a record of who did it and why.
 *
 * WHAT A VOID DOES here, mirroring accountingController.voidInvoice so the two
 * paths leave the same state: status VOID; notes prefixed "VOIDED: test entry";
 * any accessorial stamped to the invoice released back to the unbilled pool,
 * in the same transaction. Plus an AuditTrail STATUS_CHANGE row naming the
 * performer, the reason and the previous status.
 *
 * REMINDER FLAGS ARE SET TO TRUE, NOT CLEARED. Each reminderSent* flag means
 * "that reminder already went", and both AR jobs send the ones that are FALSE.
 * Clearing them would re-arm the whole ladder on any invoice that later left
 * VOID. VOID status is what excludes the invoice from both jobs today; the
 * flags set to true are the second lock.
 *
 * Refuses a PAID invoice (a void is not a credit memo) and an id it cannot find.
 * Skips one already VOID. Ids only — never a search, never a pattern.
 */
import { openTarget } from "./_prodTarget";

export const VOID_REASON = "test entry";

export const REMINDER_FLAGS = [
  "reminderSentPre7", "reminderSentDue", "reminderSent7", "reminderSent31",
  "reminderSent45", "reminderSent60", "reminderSent90",
] as const;

export interface VoidCandidate { id: string; invoiceNumber: string; status: string }

export type VoidStep =
  | { id: string; action: "VOID"; invoiceNumber: string; from: string }
  | { id: string; action: "SKIP"; reason: string }
  | { id: string; action: "REFUSE"; reason: string };

/** Pure: what happens to each requested id. A REFUSE anywhere stops the run. */
export function planVoid(ids: string[], found: VoidCandidate[]): VoidStep[] {
  return ids.map((id) => {
    const row = found.find((r) => r.id === id);
    if (!row) return { id, action: "REFUSE", reason: "not found" };
    if (row.status === "PAID") return { id, action: "REFUSE", reason: "PAID — issue a credit memo, not a void" };
    if (row.status === "VOID") return { id, action: "SKIP", reason: "already VOID" };
    return { id, action: "VOID", invoiceNumber: row.invoiceNumber, from: row.status };
  });
}

/** Pure: the invoice update for one void. */
export function voidData(existingNotes: string | null) {
  const flags = Object.fromEntries(REMINDER_FLAGS.map((f) => [f, true]));
  return { status: "VOID" as const, notes: `VOIDED: ${VOID_REASON}\n${existingNotes ?? ""}`, ...flags };
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

async function main() {
  const ids = (arg("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) {
    console.error("[void] REFUSED: pass --ids=<invoice id>,<invoice id>. Ids only.");
    process.exit(2);
  }
  const by = arg("by") ?? "whaider@silkroutelogistics.ai";
  const plan = openTarget("void");
  console.log(`[void] performer ${by}`);

  const { prisma } = await import("../src/config/database");
  try {
    const performer = await prisma.user.findFirst({ where: { email: { equals: by, mode: "insensitive" } }, select: { id: true } });
    if (!performer) {
      console.error(`[void] REFUSED: no user ${by} to record as performer.`);
      process.exit(2);
    }
    const rows = await prisma.invoice.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, invoiceNumber: true, srlDocNumber: true, status: true, notes: true, totalAmount: true, amount: true,
        dueDate: true, sentDate: true, lastReminderAt: true,
        reminderSentPre7: true, reminderSentDue: true, reminderSent7: true, reminderSent31: true,
        reminderSent45: true, reminderSent60: true, reminderSent90: true,
        load: { select: { referenceNumber: true, customer: { select: { name: true } } } },
      },
    });
    for (const r of rows) console.log("[void] BEFORE", JSON.stringify(r));

    const steps = planVoid(ids, rows);
    for (const s of steps) console.log("[void] PLAN", JSON.stringify(s));
    if (steps.some((s) => s.action === "REFUSE")) {
      console.error("[void] REFUSED: a requested id cannot be voided. Nothing written.");
      process.exit(2);
    }
    if (!plan.write) {
      console.log("[void] DRY RUN — nothing written.");
      return;
    }

    for (const s of steps) {
      if (s.action !== "VOID") continue;
      const existing = rows.find((r) => r.id === s.id)!;
      await prisma.$transaction(async (tx: any) => {
        await tx.invoice.update({ where: { id: s.id }, data: voidData(existing.notes) });
        const { count } = await tx.loadAccessorial.updateMany({ where: { shipperInvoiceId: s.id }, data: { shipperInvoiceId: null } });
        await tx.auditTrail.create({
          data: {
            entityType: "Invoice",
            entityId: s.id,
            action: "STATUS_CHANGE",
            performedById: performer.id,
            changedFields: {
              actionDetail: "INVOICE_VOID_TEST_ENTRY",
              invoiceNumber: s.invoiceNumber,
              status: { from: s.from, to: "VOID" },
              reason: VOID_REASON,
              accessorialsReleased: count,
              via: "scripts/void-test-invoices.ts",
            },
          },
        });
      });
      console.log(`[void] VOIDED ${s.invoiceNumber} (was ${s.from})`);
    }

    const after = await prisma.invoice.findMany({
      where: { id: { in: ids } },
      select: { id: true, invoiceNumber: true, status: true, notes: true, reminderSentPre7: true, reminderSentDue: true, reminderSent90: true },
    });
    for (const r of after) console.log("[void] AFTER", JSON.stringify(r));
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
