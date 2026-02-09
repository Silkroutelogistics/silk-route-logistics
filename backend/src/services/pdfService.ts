import PDFDocument from "pdfkit";
import * as path from "path";
import * as fs from "fs";

type PDFDoc = InstanceType<typeof PDFDocument>;

const COMPANY = {
  name: "Silk Route Logistics Inc.",
  address: "4000 S Westnedge Ave",
  cityStateZip: "Kalamazoo, MI 49008",
  phone: "+1 (269) 555-0100",
  email: "info@silkroutelogistics.ai",
  website: "silkroutelogistics.ai",
};

const LOGO_PATH = path.resolve(__dirname, "../../assets/logo.png");
const hasLogo = fs.existsSync(LOGO_PATH);

function addHeader(doc: PDFDoc, title: string) {
  if (hasLogo) {
    doc.image(LOGO_PATH, 50, 40, { width: 60 });
  }
  doc.fontSize(8).fillColor("#666666");
  doc.text(COMPANY.name, 400, 40, { align: "right" });
  doc.text(COMPANY.address, 400, 52, { align: "right" });
  doc.text(COMPANY.cityStateZip, 400, 64, { align: "right" });
  doc.text(`${COMPANY.phone} | ${COMPANY.email}`, 400, 76, { align: "right" });

  doc.moveTo(50, 100).lineTo(560, 100).strokeColor("#D4A843").lineWidth(2).stroke();

  doc.fontSize(18).fillColor("#1E1E2F").text(title, 50, 115, { align: "center" });
  doc.moveDown(1.5);
}

function addFooter(doc: PDFDoc) {
  const y = doc.page.height - 60;
  doc.moveTo(50, y).lineTo(560, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
  doc.fontSize(7).fillColor("#999999");
  doc.text(`${COMPANY.name} | ${COMPANY.address}, ${COMPANY.cityStateZip}`, 50, y + 8, { align: "center" });
  doc.text(`${COMPANY.phone} | ${COMPANY.email} | ${COMPANY.website}`, 50, y + 18, { align: "center" });
}

function labelValue(doc: PDFDoc, label: string, value: string, x: number, y: number) {
  doc.fontSize(8).fillColor("#888888").text(label, x, y);
  doc.fontSize(10).fillColor("#1E1E2F").text(value || "—", x, y + 12);
}

interface ShipmentData {
  shipmentNumber: string; proNumber?: string | null; bolNumber?: string | null;
  originCity: string; originState: string; originZip: string;
  destCity: string; destState: string; destZip: string;
  weight?: number | null; pieces?: number | null; commodity?: string | null;
  equipmentType: string; rate: number; specialInstructions?: string | null;
  pickupDate: Date; deliveryDate: Date;
  customer?: { name: string; contactName?: string | null; address?: string | null; city?: string | null; state?: string | null; zip?: string | null; phone?: string | null } | null;
  driver?: { firstName: string; lastName: string; phone?: string | null } | null;
  equipment?: { unitNumber: string; type: string } | null;
}

export function generateBOL(shipment: ShipmentData): PDFDoc {
  const doc = new PDFDocument({ margin: 50, size: "LETTER" });

  addHeader(doc, "BILL OF LADING");

  let y = 155;

  // Reference Numbers
  doc.fontSize(9).fillColor("#1E1E2F");
  labelValue(doc, "BOL Number", shipment.bolNumber || shipment.shipmentNumber, 50, y);
  labelValue(doc, "PRO Number", shipment.proNumber || "—", 200, y);
  labelValue(doc, "Date", new Date().toLocaleDateString(), 400, y);

  y += 40;
  doc.moveTo(50, y).lineTo(560, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
  y += 15;

  // Shipper
  doc.fontSize(11).fillColor("#D4A843").text("SHIPPER", 50, y);
  y += 16;
  doc.fontSize(10).fillColor("#1E1E2F");
  doc.text(shipment.customer?.name || "—", 50, y);
  if (shipment.customer?.address) doc.text(`${shipment.customer.address}`, 50, y + 14);
  if (shipment.customer?.city) doc.text(`${shipment.customer.city}, ${shipment.customer.state} ${shipment.customer.zip}`, 50, y + 28);
  if (shipment.customer?.phone) doc.text(`Tel: ${shipment.customer.phone}`, 50, y + 42);

  // Consignee
  doc.fontSize(11).fillColor("#D4A843").text("CONSIGNEE", 310, y - 16);
  doc.fontSize(10).fillColor("#1E1E2F");
  doc.text(`${shipment.destCity}, ${shipment.destState} ${shipment.destZip}`, 310, y);

  y += 70;
  doc.moveTo(50, y).lineTo(560, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
  y += 15;

  // Carrier
  doc.fontSize(11).fillColor("#D4A843").text("CARRIER", 50, y);
  y += 16;
  doc.fontSize(10).fillColor("#1E1E2F");
  doc.text(COMPANY.name, 50, y);
  doc.text(`${COMPANY.address}, ${COMPANY.cityStateZip}`, 50, y + 14);
  if (shipment.driver) doc.text(`Driver: ${shipment.driver.firstName} ${shipment.driver.lastName}`, 310, y);
  if (shipment.equipment) doc.text(`Equipment: ${shipment.equipment.unitNumber} (${shipment.equipment.type})`, 310, y + 14);

  y += 50;
  doc.moveTo(50, y).lineTo(560, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
  y += 15;

  // Commodity Details
  doc.fontSize(11).fillColor("#D4A843").text("COMMODITY DETAILS", 50, y);
  y += 20;

  // Table header
  doc.fontSize(8).fillColor("#888888");
  doc.text("Description", 50, y);
  doc.text("Weight (lbs)", 250, y);
  doc.text("Pieces", 350, y);
  doc.text("Equipment", 430, y);

  y += 15;
  doc.moveTo(50, y).lineTo(560, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
  y += 8;

  doc.fontSize(10).fillColor("#1E1E2F");
  doc.text(shipment.commodity || "General Freight", 50, y);
  doc.text(shipment.weight ? `${shipment.weight.toLocaleString()}` : "—", 250, y);
  doc.text(shipment.pieces ? `${shipment.pieces}` : "—", 350, y);
  doc.text(shipment.equipmentType, 430, y);

  y += 30;

  // Dates
  labelValue(doc, "Pickup Date", shipment.pickupDate.toLocaleDateString(), 50, y);
  labelValue(doc, "Delivery Date", shipment.deliveryDate.toLocaleDateString(), 250, y);

  if (shipment.specialInstructions) {
    y += 40;
    doc.fontSize(9).fillColor("#D4A843").text("SPECIAL INSTRUCTIONS", 50, y);
    y += 14;
    doc.fontSize(9).fillColor("#1E1E2F").text(shipment.specialInstructions, 50, y, { width: 510 });
  }

  // Signatures
  y = 580;
  doc.moveTo(50, y).lineTo(560, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
  y += 20;

  doc.fontSize(8).fillColor("#888888");
  doc.text("Shipper Signature", 50, y);
  doc.text("Carrier Signature", 220, y);
  doc.text("Driver Signature", 400, y);

  doc.moveTo(50, y + 35).lineTo(180, y + 35).strokeColor("#1E1E2F").lineWidth(0.5).stroke();
  doc.moveTo(220, y + 35).lineTo(370, y + 35).strokeColor("#1E1E2F").lineWidth(0.5).stroke();
  doc.moveTo(400, y + 35).lineTo(550, y + 35).strokeColor("#1E1E2F").lineWidth(0.5).stroke();

  addFooter(doc);
  doc.end();
  return doc;
}

interface LoadBOLData {
  referenceNumber: string;
  originCity: string; originState: string; originZip: string;
  destCity: string; destState: string; destZip: string;
  weight?: number | null; pieces?: number | null; equipmentType: string; commodity?: string | null;
  rate: number; distance?: number | null;
  pickupDate: Date; deliveryDate: Date;
  specialInstructions?: string | null; notes?: string | null;
  customer?: { name: string; contactName?: string | null; address?: string | null; city?: string | null; state?: string | null; zip?: string | null; phone?: string | null } | null;
  carrier?: { firstName: string; lastName: string; company?: string | null; phone?: string | null; carrierProfile?: { mcNumber?: string | null } | null } | null;
}

export function generateBOLFromLoad(load: LoadBOLData): PDFDoc {
  const doc = new PDFDocument({ margin: 50, size: "LETTER" });

  addHeader(doc, "BILL OF LADING");

  let y = 155;

  labelValue(doc, "BOL Number", `BOL-${load.referenceNumber}`, 50, y);
  labelValue(doc, "Reference", load.referenceNumber, 200, y);
  labelValue(doc, "Date", new Date().toLocaleDateString(), 400, y);

  y += 40;
  doc.moveTo(50, y).lineTo(560, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
  y += 15;

  // Shipper
  doc.fontSize(11).fillColor("#D4A843").text("SHIPPER", 50, y);
  y += 16;
  doc.fontSize(10).fillColor("#1E1E2F");
  doc.text(load.customer?.name || "—", 50, y);
  if (load.customer?.address) doc.text(load.customer.address, 50, y + 14);
  if (load.customer?.city) doc.text(`${load.customer.city}, ${load.customer.state} ${load.customer.zip}`, 50, y + 28);
  if (load.customer?.phone) doc.text(`Tel: ${load.customer.phone}`, 50, y + 42);

  // Consignee
  doc.fontSize(11).fillColor("#D4A843").text("CONSIGNEE", 310, y - 16);
  doc.fontSize(10).fillColor("#1E1E2F");
  doc.text(`${load.destCity}, ${load.destState} ${load.destZip}`, 310, y);

  y += 70;
  doc.moveTo(50, y).lineTo(560, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
  y += 15;

  // Carrier
  doc.fontSize(11).fillColor("#D4A843").text("CARRIER", 50, y);
  y += 16;
  doc.fontSize(10).fillColor("#1E1E2F");
  if (load.carrier) {
    doc.text(load.carrier.company || `${load.carrier.firstName} ${load.carrier.lastName}`, 50, y);
    if (load.carrier.carrierProfile?.mcNumber) doc.text(`MC#: ${load.carrier.carrierProfile.mcNumber}`, 50, y + 14);
  } else {
    doc.text(COMPANY.name, 50, y);
    doc.text(`${COMPANY.address}, ${COMPANY.cityStateZip}`, 50, y + 14);
  }

  y += 50;
  doc.moveTo(50, y).lineTo(560, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
  y += 15;

  // Commodity Details
  doc.fontSize(11).fillColor("#D4A843").text("COMMODITY DETAILS", 50, y);
  y += 20;

  doc.fontSize(8).fillColor("#888888");
  doc.text("Description", 50, y);
  doc.text("Weight (lbs)", 250, y);
  doc.text("Pieces", 350, y);
  doc.text("Equipment", 430, y);

  y += 15;
  doc.moveTo(50, y).lineTo(560, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
  y += 8;

  doc.fontSize(10).fillColor("#1E1E2F");
  doc.text(load.commodity || "General Freight", 50, y);
  doc.text(load.weight ? `${load.weight.toLocaleString()}` : "—", 250, y);
  doc.text(load.pieces ? `${load.pieces}` : "—", 350, y);
  doc.text(load.equipmentType, 430, y);

  y += 30;
  labelValue(doc, "Pickup Date", load.pickupDate.toLocaleDateString(), 50, y);
  labelValue(doc, "Delivery Date", load.deliveryDate.toLocaleDateString(), 250, y);

  const instructions = load.specialInstructions || load.notes;
  if (instructions) {
    y += 40;
    doc.fontSize(9).fillColor("#D4A843").text("SPECIAL INSTRUCTIONS", 50, y);
    y += 14;
    doc.fontSize(9).fillColor("#1E1E2F").text(instructions, 50, y, { width: 510 });
  }

  // Signatures
  y = 580;
  doc.moveTo(50, y).lineTo(560, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
  y += 20;

  doc.fontSize(8).fillColor("#888888");
  doc.text("Shipper Signature", 50, y);
  doc.text("Carrier Signature", 220, y);
  doc.text("Driver Signature", 400, y);

  doc.moveTo(50, y + 35).lineTo(180, y + 35).strokeColor("#1E1E2F").lineWidth(0.5).stroke();
  doc.moveTo(220, y + 35).lineTo(370, y + 35).strokeColor("#1E1E2F").lineWidth(0.5).stroke();
  doc.moveTo(400, y + 35).lineTo(550, y + 35).strokeColor("#1E1E2F").lineWidth(0.5).stroke();

  addFooter(doc);
  doc.end();
  return doc;
}

interface LoadData {
  referenceNumber: string;
  originCity: string; originState: string; originZip: string;
  destCity: string; destState: string; destZip: string;
  weight?: number | null; equipmentType: string; commodity?: string | null;
  rate: number; distance?: number | null;
  pickupDate: Date; deliveryDate: Date; notes?: string | null;
  carrier?: { id: string; firstName: string; lastName: string; company?: string | null; phone?: string | null; carrierProfile?: { mcNumber?: string | null } | null } | null;
}

export function generateRateConfirmation(load: LoadData): PDFDoc {
  const doc = new PDFDocument({ margin: 50, size: "LETTER" });

  addHeader(doc, "RATE CONFIRMATION");

  let y = 155;

  labelValue(doc, "Reference Number", load.referenceNumber, 50, y);
  labelValue(doc, "Date", new Date().toLocaleDateString(), 400, y);

  y += 40;
  doc.moveTo(50, y).lineTo(560, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
  y += 15;

  // Broker Info
  doc.fontSize(11).fillColor("#D4A843").text("BROKER", 50, y);
  y += 16;
  doc.fontSize(10).fillColor("#1E1E2F");
  doc.text(COMPANY.name, 50, y);
  doc.text(`${COMPANY.address}, ${COMPANY.cityStateZip}`, 50, y + 14);
  doc.text(`${COMPANY.phone} | ${COMPANY.email}`, 50, y + 28);

  // Carrier Info
  doc.fontSize(11).fillColor("#D4A843").text("CARRIER", 310, y - 16);
  doc.fontSize(10).fillColor("#1E1E2F");
  if (load.carrier) {
    doc.text(load.carrier.company || `${load.carrier.firstName} ${load.carrier.lastName}`, 310, y);
    if (load.carrier.carrierProfile?.mcNumber) doc.text(`MC#: ${load.carrier.carrierProfile.mcNumber}`, 310, y + 14);
    if (load.carrier.phone) doc.text(`Tel: ${load.carrier.phone}`, 310, y + 28);
  }

  y += 55;
  doc.moveTo(50, y).lineTo(560, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
  y += 15;

  // Load Details
  doc.fontSize(11).fillColor("#D4A843").text("LOAD DETAILS", 50, y);
  y += 20;

  labelValue(doc, "Origin", `${load.originCity}, ${load.originState} ${load.originZip}`, 50, y);
  labelValue(doc, "Destination", `${load.destCity}, ${load.destState} ${load.destZip}`, 310, y);
  y += 35;
  labelValue(doc, "Pickup Date", load.pickupDate.toLocaleDateString(), 50, y);
  labelValue(doc, "Delivery Date", load.deliveryDate.toLocaleDateString(), 200, y);
  labelValue(doc, "Equipment", load.equipmentType, 350, y);
  y += 35;
  labelValue(doc, "Commodity", load.commodity || "General Freight", 50, y);
  if (load.weight) labelValue(doc, "Weight", `${load.weight.toLocaleString()} lbs`, 200, y);
  if (load.distance) labelValue(doc, "Distance", `${load.distance.toLocaleString()} mi`, 350, y);

  y += 45;
  doc.moveTo(50, y).lineTo(560, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
  y += 15;

  // Rate
  doc.fontSize(11).fillColor("#D4A843").text("COMPENSATION", 50, y);
  y += 20;

  doc.fontSize(10).fillColor("#1E1E2F");
  doc.text("Linehaul Rate:", 50, y);
  doc.text(`$${load.rate.toLocaleString()}`, 200, y, { align: "left" });
  y += 18;
  doc.fontSize(12).fillColor("#1E1E2F").text("Total:", 50, y);
  doc.text(`$${load.rate.toLocaleString()}`, 200, y);

  if (load.notes) {
    y += 35;
    doc.fontSize(9).fillColor("#D4A843").text("SPECIAL INSTRUCTIONS", 50, y);
    y += 14;
    doc.fontSize(9).fillColor("#1E1E2F").text(load.notes, 50, y, { width: 510 });
  }

  // Signatures
  y = 580;
  doc.moveTo(50, y).lineTo(560, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
  y += 20;

  doc.fontSize(8).fillColor("#888888");
  doc.text("Authorized by Silk Route Logistics", 50, y);
  doc.text("Accepted by Carrier", 350, y);

  doc.moveTo(50, y + 35).lineTo(250, y + 35).strokeColor("#1E1E2F").lineWidth(0.5).stroke();
  doc.moveTo(350, y + 35).lineTo(550, y + 35).strokeColor("#1E1E2F").lineWidth(0.5).stroke();

  addFooter(doc);
  doc.end();
  return doc;
}

interface InvoiceData {
  invoiceNumber: string; amount: number; status: string;
  factoringFee?: number | null; advanceAmount?: number | null;
  dueDate?: Date | null; createdAt: Date;
  load: { referenceNumber: string; originCity: string; originState: string; destCity: string; destState: string; rate: number; pickupDate: Date; deliveryDate: Date };
  user: { firstName: string; lastName: string; company?: string | null };
}

export function generateInvoicePDF(invoice: InvoiceData): PDFDoc {
  const doc = new PDFDocument({ margin: 50, size: "LETTER" });

  addHeader(doc, "INVOICE");

  let y = 155;

  labelValue(doc, "Invoice Number", invoice.invoiceNumber, 50, y);
  labelValue(doc, "Date", invoice.createdAt.toLocaleDateString(), 250, y);
  labelValue(doc, "Status", invoice.status, 400, y);

  y += 40;
  doc.moveTo(50, y).lineTo(560, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
  y += 15;

  // Bill To
  doc.fontSize(11).fillColor("#D4A843").text("BILL TO", 50, y);
  y += 16;
  doc.fontSize(10).fillColor("#1E1E2F");
  doc.text(invoice.user.company || `${invoice.user.firstName} ${invoice.user.lastName}`, 50, y);

  // From
  doc.fontSize(11).fillColor("#D4A843").text("FROM", 310, y - 16);
  doc.fontSize(10).fillColor("#1E1E2F");
  doc.text(COMPANY.name, 310, y);
  doc.text(`${COMPANY.address}, ${COMPANY.cityStateZip}`, 310, y + 14);

  y += 50;
  doc.moveTo(50, y).lineTo(560, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
  y += 15;

  // Load Details
  doc.fontSize(11).fillColor("#D4A843").text("LOAD DETAILS", 50, y);
  y += 20;

  labelValue(doc, "Reference", invoice.load.referenceNumber, 50, y);
  labelValue(doc, "Route", `${invoice.load.originCity}, ${invoice.load.originState} → ${invoice.load.destCity}, ${invoice.load.destState}`, 200, y);
  y += 35;
  labelValue(doc, "Pickup", invoice.load.pickupDate.toLocaleDateString(), 50, y);
  labelValue(doc, "Delivery", invoice.load.deliveryDate.toLocaleDateString(), 200, y);

  y += 45;
  doc.moveTo(50, y).lineTo(560, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
  y += 15;

  // Amount
  doc.fontSize(11).fillColor("#D4A843").text("AMOUNT", 50, y);
  y += 20;

  doc.fontSize(10).fillColor("#1E1E2F");
  doc.text("Load Rate:", 50, y); doc.text(`$${invoice.load.rate.toLocaleString()}`, 250, y);
  y += 18;
  if (invoice.factoringFee) {
    doc.text("Factoring Fee:", 50, y); doc.text(`-$${invoice.factoringFee.toLocaleString()}`, 250, y);
    y += 18;
  }
  doc.fontSize(14).fillColor("#1E1E2F");
  doc.text("Total Due:", 50, y); doc.text(`$${invoice.amount.toLocaleString()}`, 250, y);

  if (invoice.dueDate) {
    y += 25;
    doc.fontSize(9).fillColor("#888888").text(`Due Date: ${invoice.dueDate.toLocaleDateString()}`, 50, y);
  }

  // Payment Instructions
  y += 40;
  doc.fontSize(9).fillColor("#D4A843").text("PAYMENT INSTRUCTIONS", 50, y);
  y += 14;
  doc.fontSize(9).fillColor("#1E1E2F");
  doc.text("Please remit payment to Silk Route Logistics Inc.", 50, y);
  doc.text("For questions, contact accounting@silkroutelogistics.ai", 50, y + 14);

  addFooter(doc);
  doc.end();
  return doc;
}
