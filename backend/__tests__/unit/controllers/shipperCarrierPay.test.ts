/**
 * F-D2 — the shipper portal must never expose the carrier invoice or carrier pay.
 *
 * Four surfaces, one case each, every one driven through the real handler. The prisma
 * mocks ANSWER THEIR QUERY: they read the where and select they were called with and
 * return only what that query would return. A mock that returned fixed rows would pass
 * whatever the query said, so it could not see the defect (the select or the allowlist)
 * this file exists to pin.
 *
 *   1. Open Quotes (getShipperDashboard): the rate is the load's customerRate, never the
 *      tender's offeredRate / counterRate (SRL's offer to the carrier, the carrier's counter).
 *   2. Documents list (getShipperDocuments): INVOICE (the carrier's invoice since ruling 6)
 *      and RATE_CON are not listed; BOL and POD are.
 *   3. Disputes (getShipperDisputes): carrierPayment.netAmount (the carrier's net pay) is
 *      not in the response.
 *   4. Download (downloadDocument): a shipper is bounded by the allowlist whether it is the
 *      load's customer OR its poster; a carrier on its own load is not affected.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";
import { getShipperDashboard, getShipperDocuments, getShipperDisputes } from "../../../src/controllers/shipperPortalController";
import { downloadDocument } from "../../../src/controllers/documentController";

const mockPrisma = vi.mocked(prisma);
// The shared setup mock's paymentDispute has only `count`. findMany is added here, in this
// file only, the same way shipperPortalController.test.ts adds loadTrackingEvent: a model
// method added to the shared setup is a contract every test file inherits.
(prisma as any).paymentDispute.findMany = vi.fn();
const SHIPPER = "user-shipper";
const CARRIER = "user-carrier";
const AE = "user-ae";

function reqRes(user: { id: string; role: string }, params: Record<string, string> = {}) {
  const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), redirect: vi.fn(), setHeader: vi.fn(), send: vi.fn() };
  return { req: { body: {}, user, params, query: {}, headers: {} } as any, res };
}

/** Keep only the keys a prisma `select` asked for. */
function pick(row: Record<string, unknown>, select: Record<string, boolean> | undefined) {
  if (!select) return row;
  return Object.fromEntries(Object.entries(row).filter(([k]) => select[k]));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.customer.findUnique.mockResolvedValue({ id: "cust-1", userId: SHIPPER } as any);
});

describe("F-D2 surface 1 — Open Quotes shows the customer rate, never the carrier tender", () => {
  it("prints the load's customerRate and none of the tender's rates", async () => {
    // Every figure is unique to its role (Sub-pattern 21): distance 1432 so "1850" can only
    // come from the carrier's offer. (A first draft used distance 1850 and the check fired on
    // "1850 mi" — the fixture, not a leak.)
    const LOAD_ROW = { originCity: "Lebanon", originState: "NH", destCity: "North Lake", destState: "TX", equipmentType: "Reefer", distance: 1432, customerRate: 2600, carrierRate: 1850 };
    mockPrisma.load.count.mockResolvedValue(0 as any);
    // The quote query only runs when the shipper has loads, so every load.findMany in the
    // dashboard answers with one load id (the other calls read customerRate / dates, which
    // are absent and default).
    mockPrisma.load.findMany.mockResolvedValue([{ id: "load-1" }] as any);
    mockPrisma.loadTender.count.mockResolvedValue(1 as any);
    mockPrisma.loadTender.findMany.mockImplementation((async (args: any) => [
      { id: "tender-abcd", status: "COUNTERED", offeredRate: 1850, counterRate: 1975, expiresAt: new Date(), load: pick(LOAD_ROW, args?.include?.load?.select) },
    ]) as any);

    const { req, res } = reqRes({ id: SHIPPER, role: "SHIPPER" });
    await getShipperDashboard(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.openQuotes).toHaveLength(1);
    expect(body.openQuotes[0].rate).toBe("$2,600");
    const wire = JSON.stringify(body.openQuotes);
    for (const carrierFigure of ["1,850", "1850", "1,975", "1975"]) {
      expect(wire, `carrier figure ${carrierFigure} reached the shipper`).not.toContain(carrierFigure);
    }
  });
});

describe("F-D2 surface 2 — the shipper's document list", () => {
  it("lists BOL and POD, never the carrier's INVOICE or the RATE_CON", async () => {
    const DOCS = ["BOL", "POD", "INVOICE", "RATE_CON"].map((t, i) => ({ id: `doc-${i}`, docType: t, fileName: `${t}.pdf`, fileSize: 1, createdAt: new Date(), load: { referenceNumber: "SRL-1" } }));
    mockPrisma.load.findMany.mockResolvedValue([{ id: "load-1" }] as any);
    mockPrisma.document.findMany.mockImplementation((async (args: any) =>
      DOCS.filter((d) => (args?.where?.docType?.in ?? []).includes(d.docType))) as any);

    const { req, res } = reqRes({ id: SHIPPER, role: "SHIPPER" });
    await getShipperDocuments(req, res);

    const types = res.json.mock.calls[0][0].documents.map((d: any) => d.type).sort();
    expect(types).toEqual(["BOL", "POD"]);
  });
});

describe("F-D2 surface 3 — the shipper's disputes", () => {
  it("never carries the carrier's net pay", async () => {
    mockPrisma.load.findMany.mockResolvedValue([{ id: "load-1" }] as any);
    (mockPrisma as any).paymentDispute.findMany.mockImplementation(async (args: any) => [
      { id: "dsp-1", loadId: "load-1", disputedAmount: 200, status: "OPEN", carrierPayment: pick({ paymentNumber: "CP-1", netAmount: 1795.5 }, args?.include?.carrierPayment?.select) },
    ]);

    const { req, res } = reqRes({ id: SHIPPER, role: "SHIPPER" });
    await getShipperDisputes(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body).toHaveLength(1);
    expect(body[0].carrierPayment).toEqual({ paymentNumber: "CP-1" });
    expect(JSON.stringify(body)).not.toContain("1795.5");
    expect(JSON.stringify(body)).not.toContain("netAmount");
  });
});

describe("F-D2 surface 4 — the download gate bounds a shipper on every path", () => {
  // A local fileUrl that does not exist: a download that PASSES the gate ends at 404
  // "File not found on disk"; one the gate refuses ends at 403. The two are distinct, so
  // "allowed" is proven by reaching the file step, not by the absence of a 403.
  function doc(docType: string, load: { posterId: string | null; carrierId: string | null; customerUserId: string | null }) {
    return {
      id: `doc-${docType}`, userId: AE, docType, fileUrl: "uploads/does-not-exist.pdf", fileName: "x.pdf", fileType: "application/pdf",
      load: { posterId: load.posterId, carrierId: load.carrierId, customer: load.customerUserId ? { userId: load.customerUserId } : null },
    };
  }
  async function download(user: { id: string; role: string }, d: ReturnType<typeof doc>) {
    mockPrisma.document.findUnique.mockResolvedValue(d as any);
    const { req, res } = reqRes(user, { id: d.id });
    await downloadDocument(req, res);
    return res.status.mock.calls[0]?.[0];
  }

  const asCustomer = { posterId: AE, carrierId: CARRIER, customerUserId: SHIPPER };
  const asPoster = { posterId: SHIPPER, carrierId: CARRIER, customerUserId: null };

  it("a shipper who is the load's CUSTOMER cannot download INVOICE or RATE_CON, and can download BOL and POD", async () => {
    expect(await download({ id: SHIPPER, role: "SHIPPER" }, doc("INVOICE", asCustomer))).toBe(403);
    expect(await download({ id: SHIPPER, role: "SHIPPER" }, doc("RATE_CON", asCustomer))).toBe(403);
    expect(await download({ id: SHIPPER, role: "SHIPPER" }, doc("BOL", asCustomer))).toBe(404);
    expect(await download({ id: SHIPPER, role: "SHIPPER" }, doc("POD", asCustomer))).toBe(404);
  });

  it("a shipper who POSTED the load is bounded too: INVOICE and RATE_CON refused, BOL allowed", async () => {
    expect(await download({ id: SHIPPER, role: "SHIPPER" }, doc("INVOICE", asPoster))).toBe(403);
    expect(await download({ id: SHIPPER, role: "SHIPPER" }, doc("RATE_CON", asPoster))).toBe(403);
    expect(await download({ id: SHIPPER, role: "SHIPPER" }, doc("BOL", asPoster))).toBe(404);
  });

  it("control: the carrier on its own load still downloads its INVOICE and the RATE_CON", async () => {
    expect(await download({ id: CARRIER, role: "CARRIER" }, doc("INVOICE", asCustomer))).toBe(404);
    expect(await download({ id: CARRIER, role: "CARRIER" }, doc("RATE_CON", asCustomer))).toBe(404);
  });

  it("control: a shipper with no part in the load is refused whatever the type", async () => {
    expect(await download({ id: "user-other-shipper", role: "SHIPPER" }, doc("BOL", asCustomer))).toBe(403);
  });
});
