import { prisma } from "../config/database";
import { log } from "../lib/logger";
import { createInvoiceWithRetry } from "../lib/invoiceNumber";
import { resolveLoadStem, withDocumentNumber } from "../lib/documentNumber";

/** Money rounding. Every cent figure in this module goes through it. */
function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Customer-facing label and invoice line type for an accessorial.
 *
 * The customer reads "Detention — pickup", not "DETENTION_PU". LineItemType has
 * dedicated DETENTION and LUMPER members; everything else lands on ACCESSORIAL.
 */
const ACCESSORIAL_PRESENTATION: Record<string, { label: string; type: string }> = {
  DETENTION_PU: { label: "Detention at pickup", type: "DETENTION" },
  DETENTION_DEL: { label: "Detention at delivery", type: "DETENTION" },
  LAYOVER: { label: "Layover", type: "ACCESSORIAL" },
  LUMPER: { label: "Lumper", type: "LUMPER" },
  TONU: { label: "Truck ordered not used", type: "ACCESSORIAL" },
  DEADHEAD: { label: "Deadhead", type: "ACCESSORIAL" },
  DRIVER_ASSIST: { label: "Driver assist", type: "ACCESSORIAL" },
  REEFER_FUEL: { label: "Reefer fuel", type: "ACCESSORIAL" },
  HAZMAT: { label: "Hazmat", type: "ACCESSORIAL" },
  INSIDE_DELIVERY: { label: "Inside delivery", type: "ACCESSORIAL" },
  LIFTGATE: { label: "Liftgate", type: "ACCESSORIAL" },
  PALLET_EXCHANGE: { label: "Pallet exchange", type: "ACCESSORIAL" },
};

function presentAccessorial(type: string): { label: string; type: string } {
  return ACCESSORIAL_PRESENTATION[type] ?? { label: String(type).replace(/_/g, " ").toLowerCase(), type: "ACCESSORIAL" };
}

/**
 * Approved accessorials that have not been billed to the customer yet.
 *
 * AT COST, per the ratified pass-through: the customer is billed exactly the
 * figure the carrier is owed, with no markup. Detention the carrier earned and
 * lumper the carrier fronted both pass straight through; SRL's margin lives in
 * the linehaul spread, not in a mark-up on a wait the customer caused.
 *
 * Two filters, both deliberate:
 *
 *   status APPROVED — a pending claim is not yet money in either direction, so
 *   it is not billed and not paid. The two sides stay in step by using the same
 *   gate.
 *
 *   billedTo not explicitly someone else — `applyStopDwellCharges` stamps
 *   "SHIPPER" on the detention and layover rows it writes, and an AE logging a
 *   line by hand can leave it null. Null bills through, because the pass-through
 *   is the ratified default and silently eating a lumper would be the wrong
 *   failure. An AE who types anything else has deliberately said this one is not
 *   the customer's, and that is honoured.
 *
 * `shipperInvoiceId` is the not-yet-billed marker. It is stamped when a line is
 * put on an invoice, which is what makes the supplemental path able to bill a
 * late accessorial exactly once.
 */
export async function unbilledCustomerAccessorials(loadId: string, client: any = prisma) {
  const rows = await client.loadAccessorial.findMany({
    where: { loadId, status: "APPROVED", shipperInvoiceId: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, type: true, amount: true, billedTo: true, notes: true },
  });
  return (rows || [])
    .filter((r: any) => !r.billedTo || String(r.billedTo).toUpperCase() === "SHIPPER")
    .map((r: any) => ({
      id: r.id,
      type: String(r.type),
      amount: round2(Number(r.amount)),
      notes: r.notes ?? null,
    }))
    .filter((r: any) => r.amount > 0);
}

/**
 * Accessorials that were billed to the customer and then rejected.
 *
 * `shipperInvoiceId` marks a line as billed; `status REJECTED` says SRL decided
 * the charge was not owed. A row carrying both is a charge sitting on a customer
 * document that SRL has since disowned, and nothing used to look for it:
 * `unbilledCustomerAccessorials` filters to APPROVED, so a rejection dropped out
 * of every query in this module and the customer stayed billed forever.
 *
 * The status and stamp are re-checked in JS for the same reason
 * `unbilledCustomerAccessorials` re-checks `billedTo` — this decides whether money
 * comes off a customer's bill, and the filter is worth stating twice.
 */
async function rejectedBilledCustomerAccessorials(loadId: string, client: any = prisma) {
  const rows = await client.loadAccessorial.findMany({
    where: { loadId, status: "REJECTED", shipperInvoiceId: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { id: true, type: true, amount: true, notes: true, status: true, rejectedReason: true, shipperInvoiceId: true },
  });
  return (rows || [])
    .filter((r: any) => String(r.status).toUpperCase() === "REJECTED" && !!r.shipperInvoiceId)
    .map((r: any) => ({
      id: r.id,
      type: String(r.type),
      amount: round2(Number(r.amount)),
      notes: r.notes ?? null,
      rejectedReason: r.rejectedReason ?? null,
      invoiceId: String(r.shipperInvoiceId),
    }))
    .filter((r: any) => r.amount > 0);
}

/** The credit line for a rejected charge. Negative, and it says why. */
function creditLine(a: { type: string; notes: string | null; rejectedReason: string | null; amount: number }, sortOrder: number) {
  const p = presentAccessorial(a.type);
  const why = a.rejectedReason ? `rejected: ${a.rejectedReason}` : "rejected";
  return {
    description: `Credit — ${p.label}${a.notes ? ` (${a.notes})` : ""} (${why})`,
    quantity: 1,
    rate: -a.amount,
    amount: -a.amount,
    type: p.type,
    sortOrder,
  };
}

/**
 * Take a rejected charge back off the customer's bill.
 *
 * The mirror of `syncInvoiceAccessorials`, and it branches on the same question:
 * can the document still be changed?
 *
 *   VOID    — the whole document is dead and nothing on it is owed. Clear the
 *             stamp so no row is left pointing at a bill that no longer exists.
 *   DRAFT   — nothing has left the building. Fold a credit line in and take the
 *             money back off the totals. The line stays visible rather than being
 *             deleted, because an AE reviewing the draft is owed the reason the
 *             charge came off, and `InvoiceLineItem` carries no link back to the
 *             accessorial to delete precisely by.
 *   SENT+   — the customer holds this document and may have entered it in their
 *             payables. Editing it makes their copy disagree with ours, which is
 *             the exact reason the supplemental path exists. So the credit gets
 *             its own document off the same load stem, DRAFT for the AE to review
 *             and send, just like a supplemental charge.
 *
 * Exactly-once runs in both directions off `shipperInvoiceId`: crediting clears the
 * stamp, so a re-run finds nothing and a row that is later approved again bills
 * again, correctly.
 */
export async function creditRejectedAccessorials(loadId: string) {
  const rejected = await rejectedBilledCustomerAccessorials(loadId);
  if (!rejected.length) return null;

  const load = await prisma.load.findUnique({
    where: { id: loadId },
    select: { id: true, referenceNumber: true, loadNumber: true, posterId: true },
  });
  if (!load) return null;

  const byInvoice = new Map<string, typeof rejected>();
  for (const r of rejected) {
    const list = byInvoice.get(r.invoiceId) ?? [];
    list.push(r);
    byInvoice.set(r.invoiceId, list);
  }

  let lastCredit: any = null;

  for (const [invoiceId, rows] of byInvoice) {
    const ids = rows.map((r: any) => r.id);
    const credited = round2(rows.reduce((s: number, r: any) => s + r.amount, 0));

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, invoiceNumber: true, srlDocNumber: true, status: true, userId: true, amount: true, totalAmount: true, accessorialsAmount: true },
    });

    // The invoice was deleted out from under the stamp. Nothing to credit, but
    // the row must not keep claiming it was billed.
    if (!invoice) {
      await prisma.loadAccessorial.updateMany({ where: { id: { in: ids } }, data: { shipperInvoiceId: null } });
      continue;
    }

    if (invoice.status === "VOID") {
      await prisma.loadAccessorial.updateMany({ where: { id: { in: ids } }, data: { shipperInvoiceId: null } });
      log.info(
        `[AutoInvoice] $${credited.toFixed(2)} of rejected accessorials released from VOID invoice ${invoice.srlDocNumber ?? invoice.invoiceNumber} on load ${load.referenceNumber}`,
      );
      continue;
    }

    if (invoice.status === "DRAFT") {
      const existingCount = await prisma.invoiceLineItem.count({ where: { invoiceId: invoice.id } });
      const priorTotal = Number(invoice.totalAmount ?? invoice.amount) || 0;

      await prisma.$transaction(async (tx) => {
        await tx.invoiceLineItem.createMany({
          data: rows.map((r: any, i: number) => {
            const li = creditLine(r, existingCount + i);
            return { invoiceId: invoice.id, description: li.description, quantity: li.quantity, rate: li.rate, amount: li.amount, type: li.type as any, sortOrder: li.sortOrder };
          }),
        });
        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            accessorialsAmount: round2((Number(invoice.accessorialsAmount) || 0) - credited),
            amount: round2(priorTotal - credited),
            totalAmount: round2(priorTotal - credited),
          },
        });
        await tx.loadAccessorial.updateMany({ where: { id: { in: ids } }, data: { shipperInvoiceId: null } });
      });

      log.info(
        `[AutoInvoice] Credited $${credited.toFixed(2)} of rejected accessorials off draft invoice ${invoice.invoiceNumber} for load ${load.referenceNumber}`,
      );
      lastCredit = await prisma.invoice.findUnique({ where: { id: invoice.id } });
      continue;
    }

    // Sent or beyond. The customer holds it, so the credit is its own document.
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);
    const stem = resolveLoadStem(load);

    const buildCredit = (srlDocNumber: string | null) =>
      createInvoiceWithRetry((invoiceNumber) =>
        prisma.$transaction(async (tx) => {
          const inv = await tx.invoice.create({
            data: {
              invoiceNumber,
              srlDocNumber,
              userId: invoice.userId,
              loadId: load.id,
              // SUPPLEMENTAL with a negative total is a credit memo. InvoiceKind
              // has no CREDIT member and inventing one is a schema migration for
              // a document that is arithmetically identical to this one; the
              // negative amount is what makes it a credit, and it nets correctly
              // everywhere invoices are summed.
              invoiceKind: "SUPPLEMENTAL",
              supplementsInvoiceId: invoice.id,
              amount: -credited,
              totalAmount: -credited,
              lineHaulAmount: 0,
              fuelSurchargeAmount: 0,
              accessorialsAmount: -credited,
              status: "DRAFT",
              dueDate,
            },
          });

          await tx.invoiceLineItem.createMany({
            data: rows.map((r: any, i: number) => {
              const li = creditLine(r, i);
              return { invoiceId: inv.id, description: li.description, quantity: li.quantity, rate: li.rate, amount: li.amount, type: li.type as any, sortOrder: li.sortOrder };
            }),
          });

          await tx.loadAccessorial.updateMany({ where: { id: { in: ids } }, data: { shipperInvoiceId: null } });

          return inv;
        }),
      );

    const credit = stem ? await withDocumentNumber("SUPPLEMENTAL_INVOICE", stem, buildCredit) : await buildCredit(null);
    lastCredit = credit;

    log.info(
      `[AutoInvoice] Credit ${credit.srlDocNumber ?? credit.invoiceNumber} raised for load ${load.referenceNumber} — $${credited.toFixed(2)} of accessorials rejected after ${invoice.srlDocNumber ?? invoice.invoiceNumber} went out`,
    );

    if (load.posterId) {
      await prisma.notification
        .create({
          data: {
            userId: load.posterId,
            type: "INVOICE",
            title: "Credit drafted",
            message: `Load ${load.referenceNumber} had $${credited.toLocaleString()} of accessorials rejected after invoice ${invoice.srlDocNumber ?? invoice.invoiceNumber} went out. Credit ${credit.srlDocNumber ?? credit.invoiceNumber} is drafted. Review and send.`,
            actionUrl: "/dashboard/invoices",
          },
        })
        .catch((e: any) => log.error(`[AutoInvoice] AE notify failed for credit: ${e?.message}`));
    }
  }

  return lastCredit;
}

/**
 * Auto-draft the SHIPPER accounts-receivable invoice on delivery/POD.
 *
 * go-live audit fix: this used to bill `load.rate` (= the CARRIER's accepted
 * rate) owned to the carrier, and the shipper portal surfaced it as "what you
 * owe" — leaking the carrier rate to the shipper and under-billing SRL's margin
 * (shipper billed $2,000 instead of the $2,400 customer rate). Carrier payables
 * flow through CarrierPay/settlement, NOT Invoice, so the carrier side of this
 * function was never load-bearing for paying carriers.
 *
 * Now it produces a proper shipper AR invoice at `load.customerRate`, owned to
 * the load poster (AE), in DRAFT (the AE reviews + sends; DRAFT is hidden from
 * the shipper portal). If the customer rate isn't set yet, it does NOT invoice
 * (never falls back to the carrier rate) and instead notifies the AE to set the
 * rate and bill manually.
 */
export async function autoGenerateInvoice(loadId: string) {
  // Prevent duplicate invoices for the same load.
  //
  // BASE and not VOID, matching syncInvoiceAccessorials, which has always looked
  // for the base invoice that way. This used to be `{ loadId }` with no status
  // filter, so a VOID invoice blocked the load from ever being invoiced again:
  // the AE voided a wrong invoice, nothing could replace it, and every accessorial
  // on that load became permanently unbillable, because the supplemental path also
  // skips a VOID base and returns null. Voiding is how an AE says "that document
  // was wrong"; it must not also say "and this load is never billed".
  //
  // The kind filter keeps a supplemental from standing in for a base. If a base
  // was voided and only its supplemental survives, this correctly drafts a new base.
  const existing = await prisma.invoice.findFirst({
    where: { loadId, invoiceKind: "BASE", status: { not: "VOID" } },
  });
  if (existing) {
    log.info(`[AutoInvoice] Invoice already exists for load ${loadId}: ${existing.invoiceNumber}`);
    return existing;
  }

  const load = await prisma.load.findUnique({
    where: { id: loadId },
    select: {
      id: true,
      referenceNumber: true,
      posterId: true,
      customerRate: true,
      fuelSurcharge: true,
      originCity: true,
      originState: true,
      destCity: true,
      destState: true,
    },
  });
  if (!load) {
    log.info(`[AutoInvoice] No load found for ${loadId}`);
    return null;
  }
  // The AR invoice is owned to the load poster (the AE). Without a poster we
  // can't own it correctly; skip rather than mis-own it.
  if (!load.posterId) {
    log.warn(`[AutoInvoice] Load ${loadId} has no posterId — cannot own the shipper AR invoice; skipping.`);
    return null;
  }

  // Bill the CUSTOMER rate, never load.rate (the carrier rate). If it isn't set,
  // do NOT auto-invoice — notify the AE to set the customer rate + bill manually.
  const customerRate = load.customerRate ?? 0;
  if (customerRate <= 0) {
    log.warn(`[AutoInvoice] Load ${loadId} delivered with no customerRate set — skipping auto-invoice; AE must set the customer rate and bill.`);
    await prisma.notification
      .create({
        data: {
          userId: load.posterId,
          type: "INVOICE",
          title: "Set customer rate to invoice",
          message: `Load ${load.referenceNumber} was delivered but has no customer rate on file. Set the customer rate and generate the shipper invoice.`,
          actionUrl: "/dashboard/invoices",
        },
      })
      .catch((e: any) => log.error(`[AutoInvoice] AE notify failed for ${loadId}: ${e?.message}`));
    return null;
  }

  const fuelSurcharge = load.fuelSurcharge && load.fuelSurcharge > 0 ? load.fuelSurcharge : 0;

  // v3.8.asb — approved accessorials reach the customer invoice. Before this
  // the total was linehaul + fuel and nothing else, so detention the carrier
  // was owed and lumper the carrier fronted were paid out by SRL and billed to
  // nobody. Billed AT COST and itemised, so the customer can see what the
  // charge is rather than finding it folded into a larger number.
  const accessorialLines = await unbilledCustomerAccessorials(load.id);
  const accessorialsAmount = round2(accessorialLines.reduce((s: number, a: any) => s + a.amount, 0));
  const totalAmount = round2(customerRate + fuelSurcharge + accessorialsAmount);

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);

  const lineItems: { description: string; quantity: number; rate: number; amount: number; type: string; sortOrder: number }[] = [
    {
      description: `Linehaul: ${load.originCity}, ${load.originState} → ${load.destCity}, ${load.destState}`,
      quantity: 1,
      rate: customerRate,
      amount: customerRate,
      type: "LINEHAUL",
      sortOrder: 0,
    },
  ];
  if (fuelSurcharge > 0) {
    lineItems.push({
      description: "Fuel Surcharge",
      quantity: 1,
      rate: fuelSurcharge,
      amount: fuelSurcharge,
      type: "FUEL_SURCHARGE",
      sortOrder: 1,
    });
  }
  accessorialLines.forEach((a: any, i: number) => {
    const p = presentAccessorial(a.type);
    lineItems.push({
      description: a.notes ? `${p.label} (${a.notes})` : p.label,
      quantity: 1,
      rate: a.amount,
      amount: a.amount,
      type: p.type,
      sortOrder: 2 + i,
    });
  });

  const invoice = await createInvoiceWithRetry((invoiceNumber) =>
    prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.create({
        data: {
          invoiceNumber,
          userId: load.posterId!,
          loadId: load.id,
          amount: totalAmount,
          totalAmount,
          lineHaulAmount: customerRate,
          fuelSurchargeAmount: fuelSurcharge,
          accessorialsAmount,
          // DRAFT — the AE reviews and sends. Hidden from the shipper portal
          // (getShipperInvoices excludes DRAFT/VOID) until the AE sends it.
          status: "DRAFT",
          dueDate,
        },
      });

      // Mark these accessorials billed, in the same transaction that bills
      // them. This is what stops the supplemental path from billing the same
      // detention a second time.
      if (accessorialLines.length) {
        await tx.loadAccessorial.updateMany({
          where: { id: { in: accessorialLines.map((a: any) => a.id) } },
          data: { shipperInvoiceId: inv.id },
        });
      }

      await tx.invoiceLineItem.createMany({
        data: lineItems.map((li) => ({
          invoiceId: inv.id,
          description: li.description,
          quantity: li.quantity,
          rate: li.rate,
          amount: li.amount,
          type: li.type as any,
          sortOrder: li.sortOrder,
        })),
      });

      return inv;
    }),
  );

  log.info(`[AutoInvoice] Drafted shipper invoice ${invoice.invoiceNumber} for load ${load.referenceNumber} — $${totalAmount} (customer rate)`);

  // Notify the AE (load poster) to review + send the shipper invoice.
  await prisma.notification
    .create({
      data: {
        userId: load.posterId,
        type: "INVOICE",
        title: "Shipper invoice drafted",
        message: `Invoice ${invoice.invoiceNumber} drafted for load ${load.referenceNumber} — $${totalAmount.toLocaleString()} (customer rate). Review and send.`,
        actionUrl: "/dashboard/invoices",
      },
    })
    .catch((e: any) => log.error(`[AutoInvoice] AE notify failed for ${invoice.invoiceNumber}: ${e?.message}`));

  return invoice;
}

/**
 * Bill an accessorial that was approved after the load was already invoiced.
 *
 * WHEN A SUPPLEMENTAL IS ISSUED, and when it is not.
 *
 * The base invoice is still a DRAFT — nothing has left the building. The
 * accessorial is folded straight into it. Issuing a second document for freight
 * the customer has not been billed for once would give them two pieces of paper
 * to reconcile for no reason.
 *
 * The base invoice has been SENT, or gone past sent — the customer has that
 * document, may have entered it in their payables, may have paid it. Editing it
 * changes a number they already hold and makes their copy disagree with ours.
 * So the late accessorial gets its own invoice, carrying its own document
 * number off the same load stem: SRL-121485I becomes SRL-121485S. That is what
 * the S suffix is for, and it is why the schema already carries invoiceKind and
 * supplementsInvoiceId — this is the writer they were waiting for.
 *
 * The base invoice is VOID, or there is no invoice yet — nothing to supplement.
 * autoGenerateInvoice reads the ledger when it runs, so a load that has not
 * been invoiced picks the accessorial up on its own.
 *
 * Exactly-once is enforced by `LoadAccessorial.shipperInvoiceId`, stamped in
 * the same transaction that bills the line. Re-running this after an approval
 * finds nothing unbilled and returns null.
 */
export async function syncInvoiceAccessorials(loadId: string) {
  // Reconcile in both directions, because this is what the reject route calls too.
  //
  // `pushAccessorialToMoneyPaths` fires on approve AND on reject, and this
  // function only ever read the approved-and-unbilled side, so a rejection was a
  // no-op here: the charge stayed on the customer's invoice permanently, with no
  // credit memo anywhere in the system to take it off.
  const credited = await creditRejectedAccessorials(loadId);

  const pending = await unbilledCustomerAccessorials(loadId);
  if (!pending.length) return credited;

  const base = await prisma.invoice.findFirst({
    where: { loadId, invoiceKind: "BASE", status: { not: "VOID" } },
    orderBy: { createdAt: "asc" },
    // `amount` as well as `totalAmount`: totalAmount is nullable and older
    // invoices carry the figure only in `amount`. Folding into one of those
    // while reading the null would replace the invoice total with the
    // accessorial instead of adding to it.
    select: { id: true, invoiceNumber: true, srlDocNumber: true, status: true, userId: true, amount: true, totalAmount: true, accessorialsAmount: true },
  });
  // Not invoiced yet. autoGenerateInvoice will read the ledger when it runs.
  if (!base) return null;

  const load = await prisma.load.findUnique({
    where: { id: loadId },
    select: { id: true, referenceNumber: true, loadNumber: true, posterId: true },
  });
  if (!load) return null;

  const added = round2(pending.reduce((s: number, a: any) => s + a.amount, 0));
  const isDraft = base.status === "DRAFT";

  if (isDraft) {
    // Fold into the draft. Line items append after whatever is already there.
    const existingCount = await prisma.invoiceLineItem.count({ where: { invoiceId: base.id } });

    await prisma.$transaction(async (tx) => {
      await tx.invoiceLineItem.createMany({
        data: pending.map((a: any, i: number) => {
          const p = presentAccessorial(a.type);
          return {
            invoiceId: base.id,
            description: a.notes ? `${p.label} (${a.notes})` : p.label,
            quantity: 1,
            rate: a.amount,
            amount: a.amount,
            type: p.type as any,
            sortOrder: existingCount + i,
          };
        }),
      });
      const priorTotal = Number(base.totalAmount ?? base.amount) || 0;
      await tx.invoice.update({
        where: { id: base.id },
        data: {
          accessorialsAmount: round2((Number(base.accessorialsAmount) || 0) + added),
          amount: round2(priorTotal + added),
          totalAmount: round2(priorTotal + added),
        },
      });
      await tx.loadAccessorial.updateMany({
        where: { id: { in: pending.map((a: any) => a.id) } },
        data: { shipperInvoiceId: base.id },
      });
    });

    log.info(
      `[AutoInvoice] Folded $${added.toFixed(2)} of accessorials into draft invoice ${base.invoiceNumber} for load ${load.referenceNumber}`,
    );
    return prisma.invoice.findUnique({ where: { id: base.id } });
  }

  // Sent or beyond — the customer holds the base. Issue the supplemental.
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);
  const stem = resolveLoadStem(load);

  const buildSupplemental = (srlDocNumber: string | null) =>
    createInvoiceWithRetry((invoiceNumber) =>
      prisma.$transaction(async (tx) => {
        const inv = await tx.invoice.create({
          data: {
            invoiceNumber,
            srlDocNumber,
            userId: base.userId,
            loadId: load.id,
            invoiceKind: "SUPPLEMENTAL",
            supplementsInvoiceId: base.id,
            amount: added,
            totalAmount: added,
            lineHaulAmount: 0,
            fuelSurchargeAmount: 0,
            accessorialsAmount: added,
            // DRAFT, like the base: the AE reviews and sends. A supplemental
            // that posted itself to the shipper portal unreviewed would be the
            // one document on the platform nobody had looked at.
            status: "DRAFT",
            dueDate,
          },
        });

        await tx.invoiceLineItem.createMany({
          data: pending.map((a: any, i: number) => {
            const p = presentAccessorial(a.type);
            return {
              invoiceId: inv.id,
              description: a.notes ? `${p.label} (${a.notes})` : p.label,
              quantity: 1,
              rate: a.amount,
              amount: a.amount,
              type: p.type as any,
              sortOrder: i,
            };
          }),
        });

        await tx.loadAccessorial.updateMany({
          where: { id: { in: pending.map((a: any) => a.id) } },
          data: { shipperInvoiceId: inv.id },
        });

        return inv;
      }),
    );

  const supplemental = stem
    ? await withDocumentNumber("SUPPLEMENTAL_INVOICE", stem, buildSupplemental)
    : await buildSupplemental(null);

  log.info(
    `[AutoInvoice] Supplemental invoice ${supplemental.srlDocNumber ?? supplemental.invoiceNumber} raised for load ${load.referenceNumber} — $${added.toFixed(2)} of accessorials approved after ${base.srlDocNumber ?? base.invoiceNumber} was sent`,
  );

  if (load.posterId) {
    await prisma.notification
      .create({
        data: {
          userId: load.posterId,
          type: "INVOICE",
          title: "Supplemental invoice drafted",
          message: `Load ${load.referenceNumber} picked up $${added.toLocaleString()} of accessorials after invoice ${base.srlDocNumber ?? base.invoiceNumber} went out. Supplemental ${supplemental.srlDocNumber ?? supplemental.invoiceNumber} is drafted. Review and send.`,
          actionUrl: "/dashboard/invoices",
        },
      })
      .catch((e: any) => log.error(`[AutoInvoice] AE notify failed for supplemental: ${e?.message}`));
  }

  return supplemental;
}
