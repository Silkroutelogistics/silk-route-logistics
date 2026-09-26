/**
 * RECONCILE step 3 (ruled 2026-09-26): what the four Beekeepers invoices must say
 * once they are recorded as delivered. Every value is read off the packet SRL
 * uploaded to Tipalti on 2026-09-25 (docs/sent-invoices/bkn-2026-09/README.md
 * records their SHA-256), not off the drafts the system held. Pure: no database.
 */
import crypto from "crypto";

export const BKN_CUSTOMER_ID = "cmndk2zmj000wdd1tztdws071";
/** Wasi Haider, who uploaded the four packets. */
export const RECORDED_BY = "cmltshz1z0000ccgogcq02shf";
/** 2026-09-25 17:00 America/Toronto (EDT, UTC-4). */
export const DELIVERED_AT = new Date("2026-09-25T21:00:00.000Z");
/** DATE ISSUED on every packet (the renderer prints createdAt there). */
export const ISSUED_AT = DELIVERED_AT;
/** DUE DATE Oct 25, 2026, stored at midnight UTC: the renderer formats in UTC (G-14). */
export const DUE_DATE = new Date("2026-10-25T00:00:00.000Z");
/** The ruling's billing address. No email: the channel is Tipalti. */
export const BILLING = {
  billingContactName: "Accounts Payable",
  billingAddress: "440 N Barranca Ave #9223",
  billingCity: "Covina",
  billingState: "CA",
  billingZip: "91723",
} as const;

export type LineType = "LINEHAUL" | "FUEL_SURCHARGE" | "ACCESSORIAL";
export interface TargetLine { title: string; detail: string; type: LineType; amount: number; accessorialId?: string }
export interface TargetInvoice {
  number: string; loadId: string; loadNumber: string;
  /** null: 121492I was delivered and never recorded. */
  existingInvoiceId: string | null;
  packet: string; sha256: string; lines: TargetLine[];
}

const TONU = "Truck ordered, not used (TONU)";
const FUEL: TargetLine = { title: "Fuel", detail: "Included in line haul", type: "FUEL_SURCHARGE", amount: 0 };

export const TARGETS: TargetInvoice[] = [
  {
    number: "121492I", loadId: "cmu78p8lr00eamb2dehub3qdl", loadNumber: "SRL-121492", existingInvoiceId: null,
    packet: "121492I-Invoice-and-BOL.pdf", sha256: "c7495a679528951007c1946a6fbd4b529a79e119229b62a0ff116f62758d0776",
    lines: [{ title: TONU, type: "ACCESSORIAL", amount: 250, accessorialId: "cmuiare9v0001w0ls934lhjsn",
      detail: "Load SRL-121492 · cancelled by shipper Sep 18, 2026, day of pickup, after carrier dispatched · freight not released at origin" }],
  },
  {
    number: "121494I", loadId: "cmubrf8on00qoh02dujll2ltb", loadNumber: "SRL-121494", existingInvoiceId: "cmufhf5rn002jom2gacxv5w5p",
    packet: "121494I-Invoice-BOL-POD.pdf", sha256: "3e12b2d342e67c8e2458ca7f6466062fea52f6453bcc19e72bc19a6ef80cdace",
    lines: [{ title: "Line haul", type: "LINEHAUL", amount: 2550,
      detail: "Load SRL-121494 · Irving, TX to Hebron, KY · 8 pallets · wellness supplements" }, FUEL],
  },
  {
    number: "121495I", loadId: "cmuct8gnk001vma2db2hbgrsj", loadNumber: "SRL-121495", existingInvoiceId: "cmueogl120071iv2d0mi4d61w",
    packet: "121495I-Invoice-POD.pdf", sha256: "d3b69992057dda1dd90b8d72a47e01572a8bcbc4808a4b1f8f460f4e596a007e",
    lines: [{ title: "Line haul", type: "LINEHAUL", amount: 700,
      detail: "Load SRL-121495 · Irving, TX to Northlake, TX · 22 pallets · wellness supplements" }, FUEL],
  },
  {
    number: "121496I", loadId: "cmucx7p69007vma2dhwglh3zb", loadNumber: "SRL-121496", existingInvoiceId: "cmugbqnwg001rma2drvhzetlw",
    packet: "121496I-Invoice-and-BOL.pdf", sha256: "8d59af11fb1579dafe7ca9e29150168510f665ae9c968c326a723740b2871d14",
    lines: [{ title: TONU, type: "ACCESSORIAL", amount: 250, accessorialId: "cmugbqnog001dma2drryhcgxu",
      detail: "Load SRL-121496 · truck pulled from the dock during loading Sep 23, 2026, at customer request, after the load was rerouted to Reach Logistics, Las Vegas, NV · freight not transported" }],
  },
];

/** The printed line is a title over its detail; both are kept. */
export const lineDescription = (l: TargetLine) => `${l.title}\n${l.detail}`;

export function totalsFor(t: TargetInvoice) {
  const of = (type: LineType) => t.lines.filter((l) => l.type === type).reduce((s, l) => s + l.amount, 0);
  const total = t.lines.reduce((s, l) => s + l.amount, 0);
  return { amount: total, totalAmount: total, lineHaulAmount: of("LINEHAUL"), fuelSurchargeAmount: of("FUEL_SURCHARGE"), accessorialsAmount: of("ACCESSORIAL") };
}

export const sha256 = (bytes: Buffer) => crypto.createHash("sha256").update(bytes).digest("hex");

/** The files offered must be the delivered ones, byte for byte. Returns problems, [] when all match. */
export function checkPackets(read: (name: string) => Buffer, targets: TargetInvoice[] = TARGETS): string[] {
  const problems: string[] = [];
  for (const t of targets) {
    let bytes: Buffer;
    try { bytes = read(t.packet); } catch { problems.push(`${t.packet}: not readable`); continue; }
    const h = sha256(bytes);
    if (h !== t.sha256) problems.push(`${t.packet}: SHA-256 ${h.slice(0, 12)}… is not the delivered ${t.sha256.slice(0, 12)}…`);
  }
  return problems;
}
