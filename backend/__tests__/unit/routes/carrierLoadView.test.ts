/**
 * carrier-portal-upgrade G3/G4 — a carrier never receives the customer side of a Load.
 *
 * GET /carrier-loads/:id and GET /carrier/tenders returned the Load through an
 * unselected `include`, so every scalar went out: SRL's customer rate, gross
 * margin, margin per mile, and (on the detail) the shipper's contact name,
 * email and phone. Both now pass the load through lib/carrierLoadView.
 *
 * Three halves:
 *   1. census — every Load column named for margin, revenue, customer or cost
 *      is either hidden or on the reviewed allowlist below, so a new one fails
 *      here until somebody decides which side of the deal it is on;
 *   2. the detail route over HTTP (prisma mocked) returns none of them;
 *   3. the tender list controller returns none of them on its load.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import fs from "fs";
import path from "path";
import { prisma } from "../../../src/config/database";
import { CARRIER_HIDDEN_LOAD_FIELDS } from "../../../src/lib/carrierLoadView";

const mockPrisma = prisma as any;

vi.mock("../../../src/middleware/auth", async (orig) => {
  const actual = (await orig()) as any;
  return {
    ...actual,
    authenticate: (req: any, _res: any, next: any) => {
      req.user = { id: "u-carrier", email: "c@srl.invalid", role: "CARRIER" };
      next();
    },
  };
});
vi.mock("../../../src/middleware/rateLimiters", () => ({
  uploadLimiter: (_r: any, _s: any, n: any) => n(),
  staffUploadLimiter: (_r: any, _s: any, n: any) => n(),
}));

/** Load columns matching the money/customer pattern that a carrier MAY see, and why. */
const REVIEWED_VISIBLE: Record<string, string> = {
  carrierRate: "the carrier's own linehaul",
  carrierRatePerMile: "the carrier's own linehaul per mile",
  rateType: "flat or per-mile, says nothing about the customer price",
  rateConfirmationPdfUrl: "the carrier's own signed document",
  customerRef: "the shipper's reference, needed at pickup",
  rateConfirmations: "relation; carrier reads narrow it to signed-RC presence (signedRcPresence)",
};
const MONEY_OR_CUSTOMER = /margin|revenue|customer|cost|^rate/i;

function loadScalarNames(): string[] {
  const schema = fs.readFileSync(path.join(__dirname, "../../../prisma/schema.prisma"), "utf8");
  const block = schema.match(/^model Load \{([\s\S]*?)^\}/m);
  if (!block) throw new Error("model Load not found in schema.prisma");
  return block[1]
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//") && !l.startsWith("@@"))
    .map((l) => l.split(/\s+/)[0]);
}

const LEAKY = {
  rate: 5200, customerRate: 5200, customerRatePerMile: 4.1, grossMargin: 700, marginPercent: 13.5,
  marginPerMile: 0.55, revenuePerMile: 4.1, costPerMile: 3.55, targetCarrierCost: 4400,
  customerInvoiced: false, customerId: "c-1",
};
const HIDDEN_KEYS = [...CARRIER_HIDDEN_LOAD_FIELDS];

let theApp: express.Express;
beforeAll(async () => {
  const carrierLoads = (await import("../../../src/routes/carrierLoads")).default;
  theApp = express();
  theApp.use(express.json());
  theApp.use("/api/carrier-loads", carrierLoads);
}, 60_000);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("census", () => {
  it("every Load column named for margin, revenue, customer or cost is classified", () => {
    const names = loadScalarNames().filter((n) => MONEY_OR_CUSTOMER.test(n));
    expect(names.length).toBeGreaterThan(5); // the parser found the model, not an empty block
    const unclassified = names.filter((n) => !HIDDEN_KEYS.includes(n as any) && !(n in REVIEWED_VISIBLE));
    expect(unclassified).toEqual([]);
  });
});

describe("GET /carrier-loads/:id", () => {
  it("returns no customer-side field and no shipper contact, on an open board load", async () => {
    mockPrisma.load.findUnique.mockResolvedValue({
      id: "l1", status: "POSTED", carrierId: null, referenceNumber: "SRL-1", carrierRate: 4500,
      ...LEAKY,
      customer: { name: "Shipper Co", contactName: "Pat", email: "pat@shipper.invalid", phone: "555" },
      poster: { firstName: "Ann", lastName: "AE", company: "SRL", phone: "269", email: "ae@srl.invalid", role: "BROKER" },
      documents: [], tenders: [], rateConfirmations: [],
    });
    const res = await request(theApp).get("/api/carrier-loads/l1");
    expect(res.status).toBe(200);
    for (const k of HIDDEN_KEYS) expect(res.body).not.toHaveProperty(k);
    // G40 — an SRL rep's contact goes to the carrier; the role does not.
    expect(res.body.poster).toEqual({ firstName: "Ann", lastName: "AE", company: "SRL", phone: "269", email: "ae@srl.invalid" });
    expect(res.body.carrierRate).toBe(4500);
    const args = mockPrisma.load.findUnique.mock.calls[0][0];
    expect(args.include.customer).toBeUndefined();
  });
});

describe("GET /carrier/tenders (getCarrierTenders)", () => {
  it("returns each tender's load without its customer side", async () => {
    const { getCarrierTenders } = await import("../../../src/controllers/tenderController");
    mockPrisma.carrierProfile.findUnique.mockResolvedValue({ id: "cp-1", userId: "u-carrier" });
    mockPrisma.loadTender.findMany.mockResolvedValue([
      { id: "t1", status: "OFFERED", offeredRate: 4500, load: { id: "l1", referenceNumber: "SRL-1", ...LEAKY, poster: { id: "u-ae", firstName: "Ann", lastName: "AE", company: "SRL" } } },
    ]);
    mockPrisma.rateConfirmation.findMany.mockResolvedValue([]);
    let body: any;
    const res: any = { status: vi.fn(() => res), json: vi.fn((b) => { body = b; }) };
    await getCarrierTenders({ user: { id: "u-carrier", role: "CARRIER" } } as any, res);
    expect(body).toHaveLength(1);
    for (const k of HIDDEN_KEYS) expect(body[0].load).not.toHaveProperty(k);
    expect(body[0].offeredRate).toBe(4500);
    expect(body[0].load.referenceNumber).toBe("SRL-1");
  });
});

describe("G40: the poster's contact", () => {
  it("is withheld when the poster is not SRL staff", async () => {
    const { toCarrierLoadView } = await import("../../../src/lib/carrierLoadView");
    const view = toCarrierLoadView({ id: "l1", poster: { firstName: "Sam", lastName: "Shipper", company: "Acme", phone: "555", email: "sam@acme.invalid", role: "SHIPPER" } }) as any;
    expect(view.poster).toEqual({ firstName: "Sam", lastName: "Shipper", company: "Acme", phone: null, email: null });
  });
});
