// v3.8.bod — owner ruling 2026-09-28: once a carrier holds the load, they can
// download its rate confirmation. The ARC 19 driver-verification gate (§13.3
// Item 225) is lifted; an unverified handset stays a risk signal to the AE.
// The ownership gate is unchanged, and this file holds both sides of it.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/services/storageService", () => ({ getFileStream: vi.fn(), uploadFile: vi.fn(), uploadFileToPath: vi.fn() }));
vi.mock("../../../src/lib/stopContact", () => ({ resolveStopContacts: vi.fn().mockResolvedValue([]) }));

import { prisma } from "../../../src/config/database";
import { getFileStream } from "../../../src/services/storageService";
import { downloadRateConfirmationPdf } from "../../../src/controllers/rateConfirmationController";
const mockPrisma = prisma as any;

const RC = {
  id: "rc-5003", loadId: "load-5003", rateConNumber: "5003",
  pdfUrl: "s3://srl-documents/rate-confirmations/rc-5003.pdf", contentHash: "0e1a97152c26",
  formData: {}, status: "SIGNED",
  load: { id: "load-5003", carrierId: "carrier-user-1", referenceNumber: "5003", loadNumber: "5003",
    // No driver assigned and nothing verified: the state a load is in the moment it is accepted.
    driverName: null, driverPhone: null, driverPhoneVerified: null, driverPhoneVerifiedAt: null,
    carrier: null, customer: null, poster: null, tenders: [] },
};
function res() {
  const r: any = { headers: {} };
  for (const m of ["status", "json", "send"]) r[m] = vi.fn(() => r);
  r.setHeader = vi.fn((k: string, v: string) => { r.headers[k] = v; });
  return r;
}
const asCarrier = (id: string) => ({ params: { id: "rc-5003" }, user: { id, role: "CARRIER" } }) as never;

describe("GET /rate-confirmations/:id/pdf as the carrier", () => {
  let piped: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.clearAllMocks();
    piped = vi.fn();
    vi.mocked(getFileStream).mockResolvedValue({ pipe: piped } as never);
    mockPrisma.rateConfirmation.findUnique.mockResolvedValue(RC);
    // If anything still asks whether the driver is verified, it is told "no".
    mockPrisma.load.findUnique.mockResolvedValue(RC.load);
  });

  it("streams the stored RC to the load's carrier with no driver verified", async () => {
    const r = res();
    await downloadRateConfirmationPdf(asCarrier("carrier-user-1"), r);
    expect(r.status).not.toHaveBeenCalledWith(403);
    expect(r.json).not.toHaveBeenCalled();
    expect(getFileStream).toHaveBeenCalledWith(RC.pdfUrl);
    expect(piped).toHaveBeenCalledWith(r);
    expect(r.headers["X-SRL-Content-Hash"]).toBe(RC.contentHash);
  });

  it("still refuses a carrier who does not hold the load", async () => {
    const r = res();
    await downloadRateConfirmationPdf(asCarrier("someone-else"), r);
    expect(r.status).toHaveBeenCalledWith(403);
    expect(getFileStream).not.toHaveBeenCalled();
  });
});
