import { prisma } from "../config/database";

interface LoadData {
  id: string;
  referenceNumber: string;
  originCity: string;
  originState: string;
  originZip: string;
  destCity: string;
  destState: string;
  destZip: string;
  weight?: number | null;
  pieces?: number | null;
  equipmentType: string;
  commodity?: string | null;
  rate: number;
  distance?: number | null;
  pickupDate: Date;
  deliveryDate: Date;
  hazmat?: boolean;
  tempMin?: number | null;
  tempMax?: number | null;
  specialInstructions?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
}

// EDI 204 — Motor Carrier Load Tender
export async function generate204(load: LoadData, carrierId?: string) {
  const payload = {
    transactionSet: "204",
    purpose: "00", // Original
    referenceNumber: load.referenceNumber,
    shipmentId: load.id,
    equipmentType: mapEquipmentToEDI(load.equipmentType),
    weight: load.weight || 0,
    weightUnit: "LB",
    pieces: load.pieces || 1,
    hazmat: load.hazmat || false,
    stops: [
      {
        stopSequence: 1,
        type: "PU", // Pickup
        city: load.originCity,
        state: load.originState,
        zip: load.originZip,
        date: load.pickupDate.toISOString(),
        contactName: load.contactName || "",
        contactPhone: load.contactPhone || "",
      },
      {
        stopSequence: 2,
        type: "DL", // Delivery
        city: load.destCity,
        state: load.destState,
        zip: load.destZip,
        date: load.deliveryDate.toISOString(),
      },
    ],
    commodity: load.commodity || "FAK",
    rate: load.rate,
    rateQualifier: "FR", // Flat Rate
    specialInstructions: load.specialInstructions || "",
    temperatureControl: load.tempMin != null ? { min: load.tempMin, max: load.tempMax, unit: "FA" } : null,
  };

  const transaction = await prisma.eDITransaction.create({
    data: {
      transactionSet: "204",
      direction: "OUTBOUND",
      loadId: load.id,
      carrierId: carrierId || null,
      rawPayload: JSON.stringify(payload),
      status: "SENT",
      processedAt: new Date(),
    },
  });

  return { transaction, payload };
}

// EDI 990 — Response to Load Tender
export async function parse990(payload: string) {
  const data = JSON.parse(payload);
  const { referenceNumber, response, reason } = data;

  const load = await prisma.load.findUnique({ where: { referenceNumber } });
  if (!load) throw new Error(`Load ${referenceNumber} not found`);

  const transaction = await prisma.eDITransaction.create({
    data: {
      transactionSet: "990",
      direction: "INBOUND",
      loadId: load.id,
      carrierId: data.carrierId || null,
      rawPayload: payload,
      status: "RECEIVED",
      processedAt: new Date(),
    },
  });

  // Auto-process response
  if (response === "A") {
    await prisma.load.update({ where: { id: load.id }, data: { status: "BOOKED" } });
  } else if (response === "D") {
    // Decline — notification only
  }

  return { transaction, accepted: response === "A", reason };
}

// EDI 214 — Transportation Carrier Shipment Status
export async function generate214(load: LoadData, statusCode: string, location?: string) {
  const statusMap: Record<string, string> = {
    DISPATCHED: "D1", PICKED_UP: "X3", IN_TRANSIT: "X6", DELIVERED: "D1", COMPLETED: "X1",
  };

  const payload = {
    transactionSet: "214",
    referenceNumber: load.referenceNumber,
    shipmentId: load.id,
    statusCode: statusMap[statusCode] || "X6",
    statusDescription: statusCode,
    date: new Date().toISOString(),
    location: location || "",
    equipmentNumber: "",
  };

  const transaction = await prisma.eDITransaction.create({
    data: {
      transactionSet: "214",
      direction: "OUTBOUND",
      loadId: load.id,
      rawPayload: JSON.stringify(payload),
      status: "SENT",
      processedAt: new Date(),
    },
  });

  return { transaction, payload };
}

// EDI 210 — Motor Carrier Freight Details and Invoice
export async function generate210(invoice: { id: string; invoiceNumber: string; amount: number; loadId: string; load?: { referenceNumber: string; originCity: string; originState: string; destCity: string; destState: string; weight?: number | null; distance?: number | null } }) {
  const payload = {
    transactionSet: "210",
    invoiceNumber: invoice.invoiceNumber,
    referenceNumber: invoice.load?.referenceNumber || "",
    totalCharge: invoice.amount,
    origin: invoice.load ? `${invoice.load.originCity}, ${invoice.load.originState}` : "",
    destination: invoice.load ? `${invoice.load.destCity}, ${invoice.load.destState}` : "",
    weight: invoice.load?.weight || 0,
    distance: invoice.load?.distance || 0,
    date: new Date().toISOString(),
  };

  const transaction = await prisma.eDITransaction.create({
    data: {
      transactionSet: "210",
      direction: "OUTBOUND",
      loadId: invoice.loadId,
      rawPayload: JSON.stringify(payload),
      status: "SENT",
      processedAt: new Date(),
    },
  });

  return { transaction, payload };
}

function mapEquipmentToEDI(type: string): string {
  const map: Record<string, string> = {
    "Dry Van": "TL", "Reefer": "RL", "Flatbed": "FL", "Step Deck": "SD",
    "Car Hauler": "CA", "Power Only": "PO", "Tanker": "TK",
  };
  return map[type] || "TL";
}
