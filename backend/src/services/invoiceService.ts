import { prisma } from "../config/database";
import { log } from "../lib/logger";
import { createInvoiceWithRetry } from "../lib/invoiceNumber";

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
  // Prevent duplicate invoices for the same load
  const existing = await prisma.invoice.findFirst({ where: { loadId } });
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
  const totalAmount = customerRate + fuelSurcharge;

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
          // DRAFT — the AE reviews and sends. Hidden from the shipper portal
          // (getShipperInvoices excludes DRAFT/VOID) until the AE sends it.
          status: "DRAFT",
          dueDate,
        },
      });

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
