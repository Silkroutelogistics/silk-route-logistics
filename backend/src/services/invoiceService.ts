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

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber,
      userId: load.carrierId,
      loadId: load.id,
      amount: load.rate,
      status: "SUBMITTED",
      dueDate,
    },
  });

  console.log(`[AutoInvoice] Created ${invoiceNumber} for load ${load.referenceNumber} — $${load.rate}`);

  // Notify carrier in-app
  await prisma.notification.create({
    data: {
      userId: load.carrierId,
      type: "INVOICE",
      title: "Invoice Auto-Generated",
      message: `Invoice ${invoiceNumber} has been created for load ${load.referenceNumber} — $${load.rate.toLocaleString()}.`,
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
      load.rate,
    );
  }

  return invoice;
}
