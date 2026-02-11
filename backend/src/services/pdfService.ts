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

// ─── Enhanced Multi-Page Rate Confirmation ───────────────────

interface EnhancedRCLoadData {
  referenceNumber: string;
  originCity: string; originState: string; originZip: string;
  destCity: string; destState: string; destZip: string;
  weight?: number | null; pieces?: number | null; equipmentType: string; commodity?: string | null;
  rate: number; distance?: number | null;
  pickupDate: Date; deliveryDate: Date;
  notes?: string | null; specialInstructions?: string | null;
  carrier?: { firstName: string; lastName: string; company?: string | null; phone?: string | null; carrierProfile?: { mcNumber?: string | null; dotNumber?: string | null } | null } | null;
  customer?: { name: string; contactName?: string | null; address?: string | null; city?: string | null; state?: string | null; zip?: string | null; phone?: string | null; email?: string | null } | null;
}

function sectionTitle(doc: PDFDoc, title: string, y: number): number {
  doc.fontSize(11).fillColor("#D4A843").text(title, 50, y);
  doc.moveTo(50, y + 15).lineTo(560, y + 15).strokeColor("#D4A843").lineWidth(0.5).stroke();
  return y + 22;
}

function checkPageBreak(doc: PDFDoc, y: number, needed: number): number {
  if (y + needed > doc.page.height - 80) {
    addFooter(doc);
    doc.addPage();
    addHeader(doc, "RATE CONFIRMATION (cont.)");
    return 155;
  }
  return y;
}

export function generateEnhancedRateConfirmation(load: EnhancedRCLoadData, formData: Record<string, any>): PDFDoc {
  const doc = new PDFDocument({ margin: 50, size: "LETTER" });
  const fd = formData || {};

  // Page 1
  addHeader(doc, "RATE CONFIRMATION");

  let y = 155;

  // Reference & Date
  labelValue(doc, "Reference Number", fd.referenceNumber || load.referenceNumber, 50, y);
  labelValue(doc, "Load Number", fd.loadNumber || load.referenceNumber, 250, y);
  labelValue(doc, "Date", new Date().toLocaleDateString(), 450, y);

  y += 40;
  doc.moveTo(50, y).lineTo(560, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
  y += 10;

  // Section 2 — Shipper / Origin
  y = sectionTitle(doc, "SHIPPER / ORIGIN", y);
  doc.fontSize(10).fillColor("#1E1E2F");
  doc.text(fd.shipperName || load.customer?.name || "—", 50, y);
  if (fd.shipperAddress || load.customer?.address) doc.text(fd.shipperAddress || load.customer?.address || "", 50, y + 14);
  const shipperCSZ = fd.shipperCity || load.customer?.city
    ? `${fd.shipperCity || load.customer?.city || ""}, ${fd.shipperState || load.customer?.state || ""} ${fd.shipperZip || load.customer?.zip || ""}`
    : `${load.originCity}, ${load.originState} ${load.originZip}`;
  doc.text(shipperCSZ, 50, y + 28);
  if (fd.shipperContact) labelValue(doc, "Contact", fd.shipperContact, 310, y);
  if (fd.shipperPhone || load.customer?.phone) labelValue(doc, "Phone", fd.shipperPhone || load.customer?.phone || "", 310, y + 20);
  if (fd.shipperRefNumber) labelValue(doc, "Ref #", fd.shipperRefNumber, 450, y);

  y += 60;

  // Section 3 — Consignee / Destination
  y = checkPageBreak(doc, y, 80);
  y = sectionTitle(doc, "CONSIGNEE / DESTINATION", y);
  doc.fontSize(10).fillColor("#1E1E2F");
  doc.text(fd.consigneeName || "—", 50, y);
  if (fd.consigneeAddress) doc.text(fd.consigneeAddress, 50, y + 14);
  const consigneeCSZ = fd.consigneeCity
    ? `${fd.consigneeCity}, ${fd.consigneeState || ""} ${fd.consigneeZip || ""}`
    : `${load.destCity}, ${load.destState} ${load.destZip}`;
  doc.text(consigneeCSZ, 50, y + 28);
  if (fd.consigneeContact) labelValue(doc, "Contact", fd.consigneeContact, 310, y);
  if (fd.consigneePhone) labelValue(doc, "Phone", fd.consigneePhone, 310, y + 20);
  if (fd.consigneeRefNumber) labelValue(doc, "Ref #", fd.consigneeRefNumber, 450, y);

  y += 60;

  // Section 4 — Carrier Information
  y = checkPageBreak(doc, y, 100);
  y = sectionTitle(doc, "CARRIER INFORMATION", y);
  doc.fontSize(10).fillColor("#1E1E2F");
  const carrierName = fd.carrierName || load.carrier?.company || (load.carrier ? `${load.carrier.firstName} ${load.carrier.lastName}` : "—");
  doc.text(carrierName, 50, y);
  if (fd.carrierMcNumber || load.carrier?.carrierProfile?.mcNumber) {
    doc.text(`MC#: ${fd.carrierMcNumber || load.carrier?.carrierProfile?.mcNumber}`, 50, y + 14);
  }
  if (fd.carrierDotNumber || load.carrier?.carrierProfile?.dotNumber) {
    doc.text(`DOT#: ${fd.carrierDotNumber || load.carrier?.carrierProfile?.dotNumber}`, 200, y + 14);
  }
  if (fd.carrierAddress) doc.text(fd.carrierAddress, 50, y + 28);
  if (fd.carrierCity) doc.text(`${fd.carrierCity}, ${fd.carrierState || ""} ${fd.carrierZip || ""}`, 50, y + 42);

  if (fd.carrierContact || load.carrier?.phone) labelValue(doc, "Contact", fd.carrierContact || "", 310, y);
  if (fd.carrierPhone || load.carrier?.phone) labelValue(doc, "Phone", fd.carrierPhone || load.carrier?.phone || "", 310, y + 20);
  if (fd.driverName) labelValue(doc, "Driver", fd.driverName, 310, y + 40);
  if (fd.truckNumber) labelValue(doc, "Truck #", fd.truckNumber, 450, y + 40);
  if (fd.trailerNumber) labelValue(doc, "Trailer #", fd.trailerNumber, 450, y + 60);

  y += 85;

  // Section 5 — Equipment & Commodity
  y = checkPageBreak(doc, y, 60);
  y = sectionTitle(doc, "EQUIPMENT & COMMODITY", y);
  labelValue(doc, "Equipment", fd.equipmentType || load.equipmentType, 50, y);
  labelValue(doc, "Commodity", fd.commodity || load.commodity || "General Freight", 200, y);
  labelValue(doc, "Weight", load.weight ? `${load.weight.toLocaleString()} lbs` : (fd.weight ? `${fd.weight} lbs` : "—"), 380, y);
  y += 25;
  if (fd.pieces || load.pieces) labelValue(doc, "Pieces", String(fd.pieces || load.pieces), 50, y);
  if (fd.dims) labelValue(doc, "Dimensions", fd.dims, 200, y);
  if (fd.hazmat) labelValue(doc, "Hazmat", "Yes", 380, y);
  if (fd.tempRequirements) labelValue(doc, "Temp Req", fd.tempRequirements, 450, y);

  y += 35;

  // Section 6 — Dates & Times
  y = checkPageBreak(doc, y, 50);
  y = sectionTitle(doc, "DATES & TIMES", y);
  labelValue(doc, "Pickup Date", fd.pickupDate || load.pickupDate.toLocaleDateString(), 50, y);
  labelValue(doc, "Pickup Window", fd.pickupTimeWindow || "—", 200, y);
  labelValue(doc, "Delivery Date", fd.deliveryDate || load.deliveryDate.toLocaleDateString(), 350, y);
  labelValue(doc, "Delivery Window", fd.deliveryTimeWindow || "—", 500, y);

  y += 35;

  // Section 7 — Rates & Charges
  y = checkPageBreak(doc, y, 120);
  y = sectionTitle(doc, "RATES & CHARGES", y);
  doc.fontSize(10).fillColor("#1E1E2F");

  const linehaul = fd.lineHaulRate ?? load.rate;
  doc.text("Line Haul Rate:", 50, y); doc.text(`$${Number(linehaul).toLocaleString()}`, 250, y);
  y += 16;

  if (fd.fuelSurcharge) {
    doc.text("Fuel Surcharge:", 50, y); doc.text(`$${Number(fd.fuelSurcharge).toLocaleString()}`, 250, y);
    y += 16;
  }

  if (fd.detentionRate) {
    doc.text("Detention Rate:", 50, y); doc.text(`$${Number(fd.detentionRate).toLocaleString()}/hr`, 250, y);
    y += 16;
  }

  if (fd.accessorials && Array.isArray(fd.accessorials)) {
    for (const acc of fd.accessorials) {
      doc.text(`${acc.description}:`, 50, y); doc.text(`$${Number(acc.amount).toLocaleString()}`, 250, y);
      y += 16;
    }
  }

  y += 4;
  doc.moveTo(50, y).lineTo(350, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
  y += 8;
  const total = fd.totalCharges ?? linehaul;
  doc.fontSize(13).fillColor("#1E1E2F").text("TOTAL:", 50, y);
  doc.text(`$${Number(total).toLocaleString()}`, 250, y);
  y += 20;

  if (fd.paymentTerms) {
    doc.fontSize(9).fillColor("#888888").text(`Payment Terms: ${fd.paymentTerms}`, 50, y);
    y += 16;
  }

  // Section 8 — Special Instructions
  const instructions = fd.specialInstructions || load.specialInstructions || load.notes;
  if (instructions || fd.pickupInstructions || fd.deliveryInstructions) {
    y = checkPageBreak(doc, y, 80);
    y = sectionTitle(doc, "SPECIAL INSTRUCTIONS", y);
    doc.fontSize(9).fillColor("#1E1E2F");
    if (instructions) { doc.text(instructions, 50, y, { width: 510 }); y += doc.heightOfString(instructions, { width: 510 }) + 8; }
    if (fd.pickupInstructions) { doc.text(`Pickup: ${fd.pickupInstructions}`, 50, y, { width: 510 }); y += 16; }
    if (fd.deliveryInstructions) { doc.text(`Delivery: ${fd.deliveryInstructions}`, 50, y, { width: 510 }); y += 16; }
    if (fd.appointmentRequired) { doc.fillColor("#dc2626").text("** APPOINTMENT REQUIRED **", 50, y); y += 16; }
  }

  // Section 9 — Terms & Conditions
  y = checkPageBreak(doc, y, 100);
  y = sectionTitle(doc, "TERMS & CONDITIONS", y);
  doc.fontSize(7).fillColor("#666666");
  const defaultTerms = "Carrier agrees to transport the above-described shipment under the terms and conditions set forth herein. " +
    "Carrier shall maintain cargo insurance of not less than $100,000 and auto liability of not less than $1,000,000 combined single limit. " +
    "Carrier shall comply with all applicable federal, state, and local laws and regulations. " +
    "This rate confirmation, when signed by both parties, constitutes a binding contract.";
  const terms = fd.customTerms || defaultTerms;
  doc.text(terms, 50, y, { width: 510 });
  y += doc.heightOfString(terms, { width: 510 }) + 15;

  // Section 10 — Signatures
  y = checkPageBreak(doc, y, 100);
  y = sectionTitle(doc, "SIGNATURES", y);
  y += 5;

  doc.fontSize(8).fillColor("#888888");
  doc.text("Authorized by Broker", 50, y);
  doc.text("Accepted by Carrier", 310, y);
  y += 15;

  if (fd.brokerSignature) {
    doc.fontSize(12).fillColor("#1E1E2F").text(fd.brokerSignature, 50, y);
  }
  if (fd.carrierSignature) {
    doc.fontSize(12).fillColor("#1E1E2F").text(fd.carrierSignature, 310, y);
  }

  y += 20;
  doc.moveTo(50, y).lineTo(250, y).strokeColor("#1E1E2F").lineWidth(0.5).stroke();
  doc.moveTo(310, y).lineTo(550, y).strokeColor("#1E1E2F").lineWidth(0.5).stroke();
  y += 5;

  doc.fontSize(7).fillColor("#888888");
  doc.text(fd.brokerSignDate || "Date: _______________", 50, y);
  doc.text(fd.carrierSignDate || "Date: _______________", 310, y);

  addFooter(doc);
  doc.end();
  return doc;
}

interface InvoiceLineItemData {
  description: string;
  type: string;
  quantity: number;
  rate: number;
  amount: number;
}

interface InvoiceData {
  invoiceNumber: string; amount: number; status: string;
  factoringFee?: number | null; advanceAmount?: number | null;
  dueDate?: Date | null; createdAt: Date;
  load: { referenceNumber: string; originCity: string; originState: string; destCity: string; destState: string; rate: number; pickupDate: Date; deliveryDate: Date };
  user: { firstName: string; lastName: string; company?: string | null };
  lineItems?: InvoiceLineItemData[];
}

export function generateInvoicePDF(invoice: InvoiceData): PDFDoc {
  const doc = new PDFDocument({ margin: 50, size: "LETTER" });
  const hasLineItems = invoice.lineItems && invoice.lineItems.length > 0;

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

  if (hasLineItems) {
    // Line Items Table
    doc.fontSize(11).fillColor("#D4A843").text("LINE ITEMS", 50, y);
    y += 20;

    // Table header
    doc.fontSize(8).fillColor("#888888");
    doc.text("Description", 50, y);
    doc.text("Type", 250, y);
    doc.text("Qty", 340, y);
    doc.text("Rate", 390, y);
    doc.text("Amount", 470, y);
    y += 14;
    doc.moveTo(50, y).lineTo(560, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
    y += 8;

    // Table rows
    doc.fontSize(9).fillColor("#1E1E2F");
    for (const li of invoice.lineItems!) {
      if (y > 650) { addFooter(doc); doc.addPage(); addHeader(doc, "INVOICE (cont.)"); y = 155; }
      doc.text(li.description, 50, y, { width: 195 });
      doc.text(li.type.replace(/_/g, " "), 250, y);
      doc.text(String(li.quantity), 340, y);
      doc.text(`$${li.rate.toLocaleString()}`, 390, y);
      doc.text(`$${li.amount.toLocaleString()}`, 470, y);
      y += 18;
    }

    // Subtotal
    y += 5;
    doc.moveTo(380, y).lineTo(560, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
    y += 8;

    const subtotal = invoice.lineItems!.reduce((s, li) => s + li.amount, 0);
    doc.fontSize(10).fillColor("#1E1E2F");
    doc.text("Subtotal:", 390, y); doc.text(`$${subtotal.toLocaleString()}`, 470, y);
    y += 18;

    if (invoice.factoringFee) {
      doc.text("Factoring Fee:", 390, y); doc.text(`-$${invoice.factoringFee.toLocaleString()}`, 470, y);
      y += 18;
    }

    doc.fontSize(13).fillColor("#1E1E2F");
    doc.text("Total Due:", 390, y); doc.text(`$${invoice.amount.toLocaleString()}`, 470, y);
    y += 25;
  } else {
    // Simple amount layout (fallback)
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
    y += 25;
  }

  if (invoice.dueDate) {
    doc.fontSize(9).fillColor("#888888").text(`Due Date: ${invoice.dueDate.toLocaleDateString()}`, 50, y);
    y += 20;
  }

  // Payment Instructions
  y += 15;
  doc.fontSize(9).fillColor("#D4A843").text("PAYMENT INSTRUCTIONS", 50, y);
  y += 14;
  doc.fontSize(9).fillColor("#1E1E2F");
  doc.text("Please remit payment to Silk Route Logistics Inc.", 50, y);
  doc.text("For questions, contact accounting@silkroutelogistics.ai", 50, y + 14);

  addFooter(doc);
  doc.end();
  return doc;
}

// ─── Settlement PDF ──────────────────────────────────

interface SettlementPDFData {
  settlementNumber: string;
  periodStart: Date;
  periodEnd: Date;
  period: string;
  grossPay: number;
  deductions: number;
  netSettlement: number;
  status: string;
  carrier: { firstName: string; lastName: string; company?: string | null };
  carrierPays: {
    load: { referenceNumber: string; originCity: string; originState: string; destCity: string; destState: string; pickupDate: Date; deliveryDate: Date };
    amount: number;
    quickPayDiscount: number | null;
    netAmount: number;
  }[];
}

export function generateSettlementPDF(settlement: SettlementPDFData): PDFDoc {
  const doc = new PDFDocument({ margin: 50, size: "LETTER" });

  addHeader(doc, "CARRIER SETTLEMENT STATEMENT");

  let y = 155;

  // Settlement info
  labelValue(doc, "Settlement #", settlement.settlementNumber, 50, y);
  labelValue(doc, "Period", `${settlement.periodStart.toLocaleDateString()} — ${settlement.periodEnd.toLocaleDateString()}`, 200, y);
  labelValue(doc, "Status", settlement.status, 450, y);

  y += 40;
  doc.moveTo(50, y).lineTo(560, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
  y += 15;

  // Carrier info
  doc.fontSize(11).fillColor("#D4A843").text("CARRIER", 50, y);
  y += 16;
  doc.fontSize(10).fillColor("#1E1E2F");
  doc.text(settlement.carrier.company || `${settlement.carrier.firstName} ${settlement.carrier.lastName}`, 50, y);

  // From
  doc.fontSize(11).fillColor("#D4A843").text("ISSUED BY", 310, y - 16);
  doc.fontSize(10).fillColor("#1E1E2F");
  doc.text(COMPANY.name, 310, y);
  doc.text(`${COMPANY.address}, ${COMPANY.cityStateZip}`, 310, y + 14);

  y += 50;
  doc.moveTo(50, y).lineTo(560, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
  y += 15;

  // Loads table
  doc.fontSize(11).fillColor("#D4A843").text("LOADS", 50, y);
  y += 20;

  // Table header
  doc.fontSize(8).fillColor("#888888");
  doc.text("Reference", 50, y);
  doc.text("Route", 150, y);
  doc.text("Pickup", 340, y);
  doc.text("Delivery", 420, y);
  doc.text("Gross Pay", 500, y);
  y += 14;
  doc.moveTo(50, y).lineTo(560, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
  y += 8;

  // Table rows
  doc.fontSize(9).fillColor("#1E1E2F");
  for (const cp of settlement.carrierPays) {
    if (y > 630) { addFooter(doc); doc.addPage(); addHeader(doc, "SETTLEMENT (cont.)"); y = 155; }
    doc.text(cp.load.referenceNumber, 50, y);
    doc.text(`${cp.load.originCity}, ${cp.load.originState} → ${cp.load.destCity}, ${cp.load.destState}`, 150, y, { width: 185 });
    doc.text(cp.load.pickupDate.toLocaleDateString(), 340, y);
    doc.text(cp.load.deliveryDate.toLocaleDateString(), 420, y);
    doc.text(`$${cp.amount.toLocaleString()}`, 500, y);
    y += 18;
  }

  y += 10;
  doc.moveTo(50, y).lineTo(560, y).strokeColor("#EEEEEE").lineWidth(0.5).stroke();
  y += 15;

  // Deductions section
  doc.fontSize(11).fillColor("#D4A843").text("SUMMARY", 50, y);
  y += 20;

  doc.fontSize(10).fillColor("#1E1E2F");
  doc.text("Gross Pay:", 50, y); doc.text(`$${settlement.grossPay.toLocaleString()}`, 250, y);
  y += 18;

  // QuickPay deductions
  const quickPayTotal = settlement.carrierPays.reduce((s, cp) => s + (cp.quickPayDiscount || 0), 0);
  if (quickPayTotal > 0) {
    doc.text("QuickPay Discount:", 50, y); doc.text(`-$${quickPayTotal.toLocaleString()}`, 250, y);
    y += 18;
  }

  const otherDeductions = settlement.deductions - quickPayTotal;
  if (otherDeductions > 0) {
    doc.text("Other Deductions:", 50, y); doc.text(`-$${otherDeductions.toLocaleString()}`, 250, y);
    y += 18;
  }

  y += 5;
  doc.moveTo(50, y).lineTo(350, y).strokeColor("#D4A843").lineWidth(1).stroke();
  y += 10;

  doc.fontSize(14).fillColor("#1E1E2F");
  doc.text("Net Settlement:", 50, y); doc.text(`$${settlement.netSettlement.toLocaleString()}`, 250, y);

  // Payment instructions
  y += 40;
  doc.fontSize(9).fillColor("#D4A843").text("PAYMENT INSTRUCTIONS", 50, y);
  y += 14;
  doc.fontSize(9).fillColor("#1E1E2F");
  doc.text("Payment will be remitted via ACH or check within the standard payment terms.", 50, y);
  doc.text("For questions, contact accounting@silkroutelogistics.ai", 50, y + 14);

  addFooter(doc);
  doc.end();
  return doc;
}
