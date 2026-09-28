/**
 * F-D6 (ruled 2026-09-28, option b) — GET /loads/:id and GET /loads are scoped by party.
 *
 *   :id   staff see the whole load; the assigned carrier, and a shipper who posted it or is
 *         its customer, see it without the other side's money; anyone else gets 403.
 *   list  staff unchanged; a carrier's rows carry no customer money or margin; a shipper's
 *         carry no carrier money or margin; any other role lists nothing.
 *
 * Every figure below is unique to its field (Sub-pattern 21), so a figure absent from the
 * response can only mean that field was withheld. The findUnique mock returns `customer`
 * only when the query asked for it, so dropping it from the include makes the customer
 * shipper a non-party and the test goes red.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";
import { getLoadById, getLoads } from "../../../src/controllers/loadController";

const mockPrisma = vi.mocked(prisma);
const CARRIER = "user-carrier";
const OTHER_CARRIER = "user-carrier-2";
const POSTER_SHIPPER = "user-shipper-poster";
const CUSTOMER_SHIPPER = "user-shipper-customer";

// customer side / carrier side / margin — one distinctive figure each
const CUSTOMER_FIGURES = { customerRate: 3117, rate: 3117, customerRatePerMile: 2.37, revenuePerMile: 2.39 };
const CARRIER_FIGURES = { carrierRate: 2468, totalCarrierPay: 2531, costPerMile: 1.83, targetCarrierCost: 2409, extraStopPay: 77, quickPayFeePercent: 2.5, carrierPaymentTier: "PRIORITY", carrierPaymentMethod: "ACH" };
const MARGIN_FIGURES = { grossMargin: 649, marginPercent: 20.82, marginPerMile: 0.54, fuelSurcharge: 181, fuelSurchargeAmount: 183, lumperEstimate: 97 };

function loadRow() {
  return {
    id: "load-1", referenceNumber: "SRL-900001", status: "BOOKED", distance: 1311, weight: 42000,
    carrierId: CARRIER, posterId: POSTER_SHIPPER, deletedAt: null, cancellationSnapshot: null,
    ...CUSTOMER_FIGURES, ...CARRIER_FIGURES, ...MARGIN_FIGURES,
    poster: { id: POSTER_SHIPPER, company: "Poster Co" },
    carrier: { id: CARRIER, company: "Haul Co", carrierProfile: { tier: "GOLD", quickPayEnabled: true } },
    tenders: [
      { id: "t-own", offeredRate: 2468, carrier: { userId: CARRIER, user: { company: "Haul Co" } } },
      { id: "t-other", offeredRate: 2355, carrier: { userId: OTHER_CARRIER, user: { company: "Rival Co" } } },
    ],
    documents: [{ id: "d-1", docType: "BOL" }, { id: "d-2", docType: "CUSTOMER_INVOICE_COPY" }],
    messages: [],
    delays: [],
  };
}

function reqRes(user: { id: string; role: string }, params: Record<string, string> = {}, query: Record<string, string> = {}) {
  const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  return { req: { user, params, query, body: {}, headers: {} } as any, res };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.load.findUnique.mockImplementation((async (args: any) => {
    const row: any = loadRow();
    if (args?.include?.customer) row.customer = { userId: CUSTOMER_SHIPPER };
    return row;
  }) as any);
});

async function byId(user: { id: string; role: string }) {
  const { req, res } = reqRes(user, { id: "load-1" });
  await getLoadById(req, res);
  return { status: res.status.mock.calls[0]?.[0] ?? 200, body: res.json.mock.calls[0]?.[0] };
}

function absent(body: unknown, figures: Record<string, unknown>) {
  for (const [k, v] of Object.entries(figures)) {
    expect((body as any)[k], `${k} reached the caller`).toBeUndefined();
    if (typeof v === "number" && String(v).length >= 3) expect(JSON.stringify(body), `${k}=${v} reached the caller`).not.toContain(String(v));
  }
}
function present(body: unknown, figures: Record<string, unknown>) {
  for (const [k, v] of Object.entries(figures)) expect((body as any)[k], `${k} missing`).toBe(v);
}

describe("GET /loads/:id — a non-party is refused", () => {
  it("a carrier not assigned to the load gets 403 NOT_A_LOAD_PARTY", async () => {
    const r = await byId({ id: OTHER_CARRIER, role: "CARRIER" });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("NOT_A_LOAD_PARTY");
  });
  it("a shipper who neither posted the load nor is its customer gets 403", async () => {
    expect((await byId({ id: "user-shipper-stranger", role: "SHIPPER" })).status).toBe(403);
  });
  it("any other non-staff role gets 403", async () => {
    expect((await byId({ id: "user-factor", role: "FACTOR" })).status).toBe(403);
  });
});

describe("GET /loads/:id — each party sees only its own side", () => {
  it("the assigned carrier: carrier money yes; customer money and margin no; only its own tender", async () => {
    const r = await byId({ id: CARRIER, role: "CARRIER" });
    expect(r.status).toBe(200);
    present(r.body, { carrierRate: 2468 });
    absent(r.body, CUSTOMER_FIGURES);
    absent(r.body, MARGIN_FIGURES);
    expect(r.body.tenders.map((t: any) => t.id)).toEqual(["t-own"]);
    expect(JSON.stringify(r.body)).not.toContain("2355");
    expect(r.body.documents.map((d: any) => d.docType)).toEqual(["BOL"]);
    expect("customer" in r.body).toBe(false);
  });

  it("the shipper who posted it: customer money yes; carrier money, margin, tenders and carrier terms no", async () => {
    const r = await byId({ id: POSTER_SHIPPER, role: "SHIPPER" });
    expect(r.status).toBe(200);
    present(r.body, { customerRate: 3117, rate: 3117 });
    absent(r.body, CARRIER_FIGURES);
    absent(r.body, MARGIN_FIGURES);
    expect(r.body.tenders).toEqual([]);
    expect(r.body.carrier.carrierProfile).toBeUndefined();
    expect(r.body.carrier.company).toBe("Haul Co");
  });

  it("the shipper who is the load's customer is a party too", async () => {
    const r = await byId({ id: CUSTOMER_SHIPPER, role: "SHIPPER" });
    expect(r.status).toBe(200);
    absent(r.body, CARRIER_FIGURES);
  });

  it("staff see the whole load; the party-check field is never sent", async () => {
    const r = await byId({ id: "user-ae", role: "BROKER" });
    expect(r.status).toBe(200);
    present(r.body, { ...CUSTOMER_FIGURES, ...CARRIER_FIGURES, ...MARGIN_FIGURES });
    expect(r.body.tenders).toHaveLength(2);
    expect("customer" in r.body).toBe(false);
  });
});

describe("GET /loads — the list strips the other side by role", () => {
  async function list(user: { id: string; role: string }) {
    // Answer the query: the list includes poster and carrier only, so the row carries no
    // tenders, documents, messages or delays. (A first draft returned them all, and the
    // tender's 2468 "leaked" to a shipper through a relation the list never fetches.)
    mockPrisma.load.findMany.mockImplementation((async (args: any) => {
      const row: any = loadRow();
      for (const rel of ["tenders", "documents", "messages", "delays", "poster", "carrier"]) if (!args?.include?.[rel]) delete row[rel];
      return [row];
    }) as any);
    mockPrisma.load.count.mockResolvedValue(1 as any);
    mockPrisma.invoice.findMany.mockResolvedValue([{ loadId: "load-1", amount: 3163, totalAmount: 3163 }] as any);
    const { req, res } = reqRes(user);
    await getLoads(req, res);
    return res.json.mock.calls[0][0];
  }

  it("a carrier's rows: no customer money, no billed total, no margin; carrier rate kept", async () => {
    const body = await list({ id: CARRIER, role: "CARRIER" });
    const row = body.loads[0];
    present(row, { carrierRate: 2468 });
    absent(row, { ...CUSTOMER_FIGURES, invoicedTotal: 3163 });
    absent(row, MARGIN_FIGURES);
  });

  it("a shipper's rows: no carrier money, no margin; customer rate and billed total kept", async () => {
    const row = (await list({ id: POSTER_SHIPPER, role: "SHIPPER" })).loads[0];
    present(row, { customerRate: 3117, invoicedTotal: 3163 });
    absent(row, CARRIER_FIGURES);
    absent(row, MARGIN_FIGURES);
  });

  it("staff rows are whole", async () => {
    const row = (await list({ id: "user-ae", role: "BROKER" })).loads[0];
    present(row, { ...CUSTOMER_FIGURES, ...CARRIER_FIGURES, ...MARGIN_FIGURES, invoicedTotal: 3163 });
  });

  it("any other non-staff role lists nothing, without querying", async () => {
    const { req, res } = reqRes({ id: "user-factor", role: "FACTOR" });
    mockPrisma.load.findMany.mockClear();
    await getLoads(req, res);
    expect(res.json.mock.calls[0][0]).toEqual(expect.objectContaining({ loads: [], total: 0 }));
    expect(mockPrisma.load.findMany).not.toHaveBeenCalled();
  });
});
