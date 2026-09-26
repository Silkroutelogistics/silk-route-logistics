/**
 * RECONCILE step 3 (ruled 2026-09-26): record the four Beekeepers invoices delivered through
 * Tipalti on 2026-09-25 as what they were (values: scripts/_bknTipaltiPlan.ts). 3a billing
 * address + channel TIPALTI; 3b each invoice matches its PDF, 121492I created; 3c SENT via
 * TIPALTI as mark-sent records it; 3d deliveredFileHash. The stored copy (archivedDocumentId)
 * is not written: storing the bytes needs storage credentials this terminal does not hold.
 * Refuses before writing unless the packets are the delivered bytes and the database is in
 * the state the plan expects. One transaction. Dry run by default; writing needs
 * PRISMA_TARGET=production --execute --target=prod, plus --env-file= and --packets=<folder>.
 */
import fs from "fs";
import path from "path";
import { openTarget } from "./_prodTarget";
import { TARGETS, BKN_CUSTOMER_ID, RECORDED_BY, DELIVERED_AT, ISSUED_AT, DUE_DATE, BILLING, lineDescription, totalsFor, checkPackets } from "./_bknTipaltiPlan";

const SOURCE = "scripts/reconcile-bkn-tipalti.ts";
const target = openTarget("reconcile-bkn");
const refuse = (problems: string[]): never => { for (const p of problems) console.error(`[reconcile-bkn] REFUSED: ${p}`); process.exit(2); };

(async () => {
  const dirArg = process.argv.find((a) => a.startsWith("--packets="));
  if (!dirArg) refuse(["--packets=<folder with the four delivered PDFs> is required"]);
  const dir = path.resolve(dirArg!.slice("--packets=".length));
  const bad = checkPackets((n) => fs.readFileSync(path.join(dir, n)));
  if (bad.length) refuse(bad);
  console.log("[reconcile-bkn] packets: 4 of 4 are the delivered bytes");

  const { prisma } = await import("../src/config/database");
  const { assertInvoiceNumberFree } = await import("../src/lib/invoiceNumber");
  const { priorSentBaseInvoice } = await import("../src/lib/invoiceSendGuard");
  try {
    const loadIds = TARGETS.map((t) => t.loadId);
    const customer: any = await prisma.customer.findUnique({ where: { id: BKN_CUSTOMER_ID } });
    const loads = await prisma.load.findMany({ where: { id: { in: loadIds } }, select: { id: true, loadNumber: true, customerId: true } });
    const invoices: any[] = await prisma.invoice.findMany({ where: { loadId: { in: loadIds }, deletedAt: null, status: { not: "VOID" } }, include: { lineItems: { orderBy: { sortOrder: "asc" } } } });
    const ledger: any[] = await prisma.loadAccessorial.findMany({ where: { id: { in: TARGETS.flatMap((t) => t.lines.flatMap((l) => (l.accessorialId ? [l.accessorialId] : []))) } } });

    if (customer?.defaultInvoiceChannel === "TIPALTI" && TARGETS.every((t) => invoices.some((i) => i.loadId === t.loadId && i.srlDocNumber === t.number && i.status === "SENT" && i.deliveredFileHash === t.sha256))) {
      console.log("[reconcile-bkn] already reconciled: nothing to do");
      return;
    }
    const problems: string[] = [];
    if (!customer) problems.push("the Beekeepers customer is missing");
    for (const t of TARGETS) {
      const load = loads.find((l) => l.id === t.loadId);
      if (load?.loadNumber !== t.loadNumber || load?.customerId !== BKN_CUSTOMER_ID) problems.push(`${t.loadNumber}: missing, renumbered or not Beekeepers'`);
      const onLoad = invoices.filter((i) => i.loadId === t.loadId);
      const want = t.existingInvoiceId ? 1 : 0;
      if (onLoad.length !== want || (t.existingInvoiceId && onLoad[0]?.id !== t.existingInvoiceId)) problems.push(`${t.number}: ${onLoad.length} live invoice(s) on ${t.loadNumber}, expected ${t.existingInvoiceId ?? "none"}`);
      else if (t.existingInvoiceId && onLoad[0].status !== "DRAFT") problems.push(`${t.number}: ${t.existingInvoiceId} is ${onLoad[0].status}, not DRAFT`);
      for (const l of t.lines.filter((x) => x.accessorialId)) {
        const row = ledger.find((r) => r.id === l.accessorialId);
        if (row?.loadId !== t.loadId || row?.type !== "TONU" || row?.status !== "APPROVED") problems.push(`${t.number}: ${l.accessorialId} is not the approved TONU on ${t.loadNumber}`);
        else if ((row.shipperInvoiceId ?? null) !== t.existingInvoiceId) problems.push(`${t.number}: ${l.accessorialId} is stamped to ${row.shipperInvoiceId ?? "nothing"}`);
      }
      await assertInvoiceNumberFree(t.number, { excludeId: t.existingInvoiceId ?? undefined }).catch((e) => problems.push(`${t.number}: ${e.message}`));
    }
    if (problems.length) refuse(problems);

    const billingFrom = Object.fromEntries(Object.keys(BILLING).map((k) => [k, customer[k] ?? null]));
    console.log("[reconcile-bkn] 3a", JSON.stringify({ from: { ...billingFrom, defaultInvoiceChannel: customer.defaultInvoiceChannel }, to: { ...BILLING, defaultInvoiceChannel: "TIPALTI" } }));
    for (const t of TARGETS) {
      const inv = invoices.find((i) => i.id === t.existingInvoiceId);
      console.log(`[reconcile-bkn] 3b ${inv ? `${inv.invoiceNumber}/${inv.srlDocNumber} ${inv.totalAmount}` : "(new)"} -> ${t.number} ${totalsFor(t).totalAmount}; lines ${inv?.lineItems.length ?? 0} -> ${t.lines.length}; 3c SENT TIPALTI ${DELIVERED_AT.toISOString()}; 3d ${t.sha256.slice(0, 12)}…`);
    }
    if (!target.write) { console.log("[reconcile-bkn] DRY RUN: nothing written"); return; }

    await prisma.$transaction(async (tx: any) => {
      const audit = (entityType: string, entityId: string, action: string, changedFields: object) =>
        tx.auditTrail.create({ data: { entityType, entityId, action, performedById: RECORDED_BY, ipAddress: "script", changedFields: { ...changedFields, source: SOURCE } } });
      await tx.customer.update({ where: { id: BKN_CUSTOMER_ID }, data: { ...BILLING, defaultInvoiceChannel: "TIPALTI" } });
      await audit("Customer", BKN_CUSTOMER_ID, "UPDATE", { actionDetail: "RECONCILE_BKN_TIPALTI_BILLING", from: { ...billingFrom, defaultInvoiceChannel: customer.defaultInvoiceChannel }, to: { ...BILLING, defaultInvoiceChannel: "TIPALTI" } });
      for (const t of TARGETS) {
        const before = invoices.find((i) => i.id === t.existingInvoiceId);
        const fields = { invoiceNumber: t.number, srlDocNumber: t.number, ...totalsFor(t), createdAt: ISSUED_AT, dueDate: DUE_DATE, deliveredFileHash: t.sha256 };
        const lines = t.lines.map((l, i) => ({ description: lineDescription(l), quantity: 1, rate: l.amount, amount: l.amount, type: l.type, sortOrder: i, accessorialId: l.accessorialId ?? null }));
        let id = t.existingInvoiceId;
        if (id) {
          await tx.invoice.update({ where: { id }, data: fields });
          await tx.invoiceLineItem.deleteMany({ where: { invoiceId: id } });
          await tx.invoiceLineItem.createMany({ data: lines.map((l) => ({ ...l, invoiceId: id })) });
        } else {
          id = (await tx.invoice.create({ data: { ...fields, loadId: t.loadId, status: "DRAFT", invoiceKind: "BASE", userId: RECORDED_BY, createdById: RECORDED_BY, lineItems: { create: lines } } })).id;
          for (const l of t.lines.filter((x) => x.accessorialId)) await tx.loadAccessorial.update({ where: { id: l.accessorialId }, data: { shipperInvoiceId: id } });
        }
        await audit("Invoice", id!, before ? "UPDATE" : "CREATE", { actionDetail: "RECONCILE_MATCH_DELIVERED_PDF", packet: t.packet, sha256: t.sha256,
          from: before ? { invoiceNumber: before.invoiceNumber, srlDocNumber: before.srlDocNumber, totalAmount: before.totalAmount, createdAt: before.createdAt, dueDate: before.dueDate, lines: before.lineItems.map((l: any) => ({ description: l.description, amount: l.amount })) } : null,
          to: { ...fields, lines: lines.map((l) => ({ description: l.description, amount: l.amount })) } });
        if (await priorSentBaseInvoice(t.loadId, id!, "BASE", tx)) throw new Error(`${t.number}: another BASE invoice on ${t.loadNumber} is already sent`);
        const moved = await tx.invoice.updateMany({ where: { id, status: { in: ["DRAFT", "SUBMITTED"] } }, data: { status: "SENT", sentDate: DELIVERED_AT, deliveryChannel: "TIPALTI", deliveredAt: DELIVERED_AT, deliveredById: RECORDED_BY } });
        if (moved.count !== 1) throw new Error(`${t.number}: changed while this ran`);
        await audit("Invoice", id!, "STATUS_CHANGE", { status: { from: "DRAFT", to: "SENT" }, deliveryChannel: "TIPALTI", deliveredAt: DELIVERED_AT.toISOString(), actionDetail: "INVOICE_MARKED_SENT" });
      }
    }, { timeout: 60_000 });
    console.log("[reconcile-bkn] EXECUTED: 1 customer, 4 invoices (1 created), 9 audit rows");
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => { console.error("[reconcile-bkn] FAILED, nothing written:", e?.message ?? e); process.exit(1); });
