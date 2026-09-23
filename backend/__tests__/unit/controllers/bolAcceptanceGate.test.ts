/**
 * C4b — the bill of lading is gated on the ACCEPTANCE, not on a status column.
 *
 * The gate read `LoadTender.status === "CONFIRMED"`. That answers "where is
 * this tender now", not "did this carrier commit to this load", and R8a forbids
 * inferring an act from a column that can be moved again afterwards. Three
 * SRL-side paths reach a dispatched-looking state with no carrier act at all.
 *
 * The BOL is the document that sends a truck to a shipper's dock, so the
 * question it has to answer is the second one.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/services/pdfService", () => ({
  generateBOLFromLoad: vi.fn(() => ({ pipe: vi.fn() })),
  generateEnhancedRateConfirmation: vi.fn(),
  generateShipperLoadConfirmation: vi.fn(),
  generateInvoicePDF: vi.fn(),
  generateSettlementPDF: vi.fn(),
}));
vi.mock("../../../src/services/shipperTrackingTokenService", () => ({
  generateBOLPrintToken: vi.fn().mockResolvedValue({ token: "tok-1" }),
}));

import { prisma } from "../../../src/config/database";
import { downloadBOLFromLoad } from "../../../src/controllers/pdfController";

const mockPrisma = prisma as any;
const LOAD = "load-1";
const CARRIER = "u-carrier";

function req(user: Record<string, unknown> = { id: CARRIER, role: "CARRIER" }) {
  return { params: { loadId: LOAD }, user } as never;
}
function res() {
  const r: any = { statusCode: 200, body: null, headers: {} };
  r.status = vi.fn((c: number) => { r.statusCode = c; return r; });
  r.json = vi.fn((d: unknown) => { r.body = d; return r; });
  r.setHeader = vi.fn((k: string, v: string) => { r.headers[k] = v; });
  return r;
}

/** A load in a dispatched-looking state, with the acceptance columns settable. */
function load(over: Record<string, unknown> = {}) {
  return {
    id: LOAD,
    carrierId: CARRIER,
    customerId: "cust-1",
    status: "DISPATCHED",
    carrierAcceptedAt: null,
    carrierAcceptedVia: null,
    driverPhoneVerified: null,
    customer: { id: "cust-1", name: "Acme" },
    carrier: { id: CARRIER },
    lineItems: [],
    stops: [],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.load.findUnique = vi.fn().mockResolvedValue(load());
  mockPrisma.rateConfirmation.findFirst = vi.fn().mockResolvedValue(null);
  mockPrisma.loadTender.findFirst = vi.fn().mockResolvedValue(null);
});

describe("a load that reached DISPATCHED with no carrier act is blocked", () => {
  it("blocks the finalize shape: DISPATCHED, a CONFIRMED tender, and no carrier act", async () => {
    // The full shape the OLD gate let through. finalize moves the load to
    // DISPATCHED from the SRL side; a tender can read CONFIRMED without any
    // carrier having done anything. The load looks finished. Nobody accepted
    // it, and no rate confirmation was signed.
    mockPrisma.loadTender.findFirst.mockResolvedValue({ id: "t-1" });
    const r = res();
    await downloadBOLFromLoad(req(), r);

    expect(r.statusCode).toBe(403);
    expect(r.body.error).toBe("RC_NOT_SIGNED");
  });

  it("the refusal names acceptance, not only signature", async () => {
    const r = res();
    await downloadBOLFromLoad(req(), r);
    expect(r.body.message).toMatch(/accept this load/i);
    expect(r.body.message).toMatch(/signing the rate confirmation both count|rate confirmation/i);
  });
});

describe("either act opens the gate", () => {
  it("allows a tender-accepted load that has NOT been signed", async () => {
    mockPrisma.load.findUnique.mockResolvedValue(
      load({ carrierAcceptedAt: new Date(), carrierAcceptedVia: "TENDER_ACCEPT", status: "BOOKED" }),
    );
    const r = res();
    await downloadBOLFromLoad(req(), r);

    expect(r.statusCode).toBe(200);
    // Not even asked: the acceptance settled it.
    expect(mockPrisma.rateConfirmation.findFirst).not.toHaveBeenCalled();
  });

  it("allows a token-signed load", async () => {
    mockPrisma.load.findUnique.mockResolvedValue(
      load({ carrierAcceptedAt: new Date(), carrierAcceptedVia: "RC_SIGNATURE" }),
    );
    const r = res();
    await downloadBOLFromLoad(req(), r);
    expect(r.statusCode).toBe(200);
  });

  it("allows a bid-awarded load", async () => {
    mockPrisma.load.findUnique.mockResolvedValue(
      load({ carrierAcceptedAt: new Date(), carrierAcceptedVia: "BID_AWARD_ACCEPT" }),
    );
    const r = res();
    await downloadBOLFromLoad(req(), r);
    expect(r.statusCode).toBe(200);
  });

  it("allows a pre-C4a load with no stamp but a signed rate confirmation", async () => {
    // The columns are deliberately un-backfilled, so a load signed before C4a
    // has no stamp and never will. Testing acceptance alone would have locked
    // every pre-C4a carrier out of their own bill of lading.
    mockPrisma.rateConfirmation.findFirst.mockResolvedValue({ id: "rc-1" });
    const r = res();
    await downloadBOLFromLoad(req(), r);
    expect(r.statusCode).toBe(200);
  });
});

describe("the gate no longer consults the tender status", () => {
  it("a tender at CONFIRMED does not by itself open the gate", async () => {
    // The old gate would have allowed this. A status column can be moved by a
    // path that observed no carrier act, which is why it is not the question.
    mockPrisma.loadTender.findFirst.mockResolvedValue({ id: "t-1" });
    const r = res();
    await downloadBOLFromLoad(req(), r);
    expect(r.statusCode).toBe(403);
  });
});

describe("the AE bypass is unchanged", () => {
  it("an AE downloads a BOL on a load with no acceptance at all", async () => {
    const r = res();
    await downloadBOLFromLoad(req({ id: "u-ae", role: "BROKER" }), r);
    // AE roles need the BOL while they are arranging the signature; gating them
    // would make it unreachable by exactly the person chasing it.
    expect(r.statusCode).toBe(200);
  });
});
