import { prisma } from "../config/database";
import { sendAutoInvoiceEmail } from "./emailService";

export async function autoGenerateInvoice(loadId: string) {
  // Prevent duplicate invoices for the same load
  const existing = await prisma.invoice.findFirst({ where: { loadId } });
  if (existing) {
    console.log(`[AutoInvoice] Invoice already exists for load ${loadId}: ${existing.invoiceNumber}`);
    return existing;
  }

  const load = await prisma.load.findUnique({
    where: { id: loadId },
    include: {
      carrier: { select: { id: true, email: true, firstName: true, lastName: true, company: true } },
      rateConfirmations: {
        where: { status: "SIGNED" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  if (!load || !load.carrierId) {
    console.log(`[AutoInvoice] No load or carrier found for ${loadId}`);
    return null;
  }

  // Generate next invoice number
  const lastInvoice = await prisma.invoice.findFirst({
    orderBy: { createdAt: "desc" },
    select: { invoiceNumber: true },
  });
  const lastNum = lastInvoice ? parseInt(lastInvoice.invoiceNumber.replace("INV-", ""), 10) : 1000;
  const invoiceNumber = `INV-${lastNum + 1}`;

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);

  // Build line items from load + rate confirmation
  const lineItems: { description: string; quantity: number; rate: number; amount: number; type: string; sortOrder: number }[] = [];
  const rc = load.rateConfirmations[0];

  // Linehaul
  lineItems.push({
    description: `Linehaul: ${load.originCity}, ${load.originState} → ${load.destCity}, ${load.destState}`,
    quantity: 1,
    rate: load.rate,
    amount: load.rate,
    type: "LINEHAUL",
    sortOrder: 0,
  });

  if (rc) {
    if (rc.fuelSurcharge && rc.fuelSurcharge > 0) {
      lineItems.push({
        description: "Fuel Surcharge",
        quantity: 1,
        rate: rc.fuelSurcharge,
        amount: rc.fuelSurcharge,
        type: "FUEL_SURCHARGE",
        sortOrder: 1,
      });
    }
    const accessorialAmt = rc.accessorialTotal || 0;
    if (accessorialAmt > 0) {
      lineItems.push({
        description: "Accessorial Charges",
        quantity: 1,
        rate: accessorialAmt,
        amount: accessorialAmt,
        type: "ACCESSORIAL",
        sortOrder: 2,
      });
    }
  }

  const totalAmount = lineItems.reduce((sum, li) => sum + li.amount, 0);

  const invoice = await prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.create({
      data: {
        invoiceNumber,
        userId: load.carrierId!,
        loadId: load.id,
        amount: totalAmount,
        status: "SUBMITTED",
        dueDate,
      },
    });

    if (lineItems.length > 0) {
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
    }

    return inv;
  });

  console.log(`[AutoInvoice] Created ${invoiceNumber} for load ${load.referenceNumber} — $${totalAmount}`);

  // Notify carrier in-app
  await prisma.notification.create({
    data: {
      userId: load.carrierId,
      type: "INVOICE",
      title: "Invoice Auto-Generated",
      message: `Invoice ${invoiceNumber} has been created for load ${load.referenceNumber} — $${totalAmount.toLocaleString()}.`,
      actionUrl: "/dashboard/invoices",
    },
  });

  // Send email to carrier
  if (load.carrier) {
    await sendAutoInvoiceEmail(
      load.carrier.email,
      load.carrier.firstName || load.carrier.company || "Carrier",
      load.referenceNumber,
      invoiceNumber,
      totalAmount,
    );
  }

  return invoice;
}
