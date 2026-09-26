/**
 * The Load Board's Rate Conf button serves the rate confirmation the carrier was
 * SENT — the frozen, hashed artifact — not a re-render (invoicing audit G-4,
 * queue B4).
 *
 * GET /pdf/rate-confirmation/:loadId (and its -enhanced twin) re-rendered from
 * the latest SIGNED row's formData with today's template. For a signed RC that is
 * a different document from the one the carrier holds, and its bytes no longer
 * match RateConfirmation.contentHash. With an issued RC on file both routes must
 * stream the stored object; with none they still render, as before.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/services/pdfService", () => ({
  generateBOLFromLoad: vi.fn(),
  generateEnhancedRateConfirmation: vi.fn(() => ({ pipe: vi.fn() })),
  generateShipperLoadConfirmation: vi.fn(),
  generateInvoicePDF: vi.fn(),
  generateSettlementPDF: vi.fn(),
}));
vi.mock("../../../src/services/shipperTrackingTokenService", () => ({ generateBOLPrintToken: vi.fn() }));
vi.mock("../../../src/lib/stopContact", () => ({ resolveStopContacts: vi.fn().mockResolvedValue([]) }));
const storedPipe = vi.fn();
vi.mock("../../../src/services/storageService", () => ({
  getFileStream: vi.fn().mockResolvedValue({ pipe: (...a: unknown[]) => storedPipe(...a) }),
}));

import { prisma } from "../../../src/config/database";
import { generateEnhancedRateConfirmation } from "../../../src/services/pdfService";
import { getFileStream } from "../../../src/services/storageService";
import { downloadRateConfirmation, downloadEnhancedRateConfirmation } from "../../../src/controllers/pdfController";

const mockPrisma = prisma as any;
const LOAD = { id: "load-1", posterId: "ae-1", carrierId: "c-1", referenceNumber: "SRL-121494", loadNumber: "SRL-121494", rateConfirmations: [] };
const ISSUED = { id: "rc-1", pdfUrl: "rc/SRL-121494R.pdf", contentHash: "sha256:abc", rateConNumber: "SRL-121494R",
  load: { referenceNumber: "SRL-121494", loadNumber: "SRL-121494" } };

const req = () => ({ params: { loadId: "load-1" }, user: { id: "ae-1", role: "ADMIN" } }) as never;
function res() {
  const r: any = { headers: {} };
  r.status = vi.fn(() => r);
  r.json = vi.fn(() => r);
  r.setHeader = vi.fn((k: string, v: string) => { r.headers[k] = v; });
  return r;
}

const HANDLERS = [["/pdf/rate-confirmation", downloadRateConfirmation], ["/pdf/rate-confirmation-enhanced", downloadEnhancedRateConfirmation]] as const;

describe("RC downloads serve the issued artifact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.load.findUnique.mockResolvedValue(LOAD);
  });

  for (const [route, handler] of HANDLERS) {
    it(`${route}: an issued RC streams the stored bytes with its hash, and nothing is re-rendered`, async () => {
      mockPrisma.rateConfirmation.findFirst.mockResolvedValue(ISSUED);
      const r = res();
      await handler(req(), r);
      expect(vi.mocked(getFileStream)).toHaveBeenCalledWith("rc/SRL-121494R.pdf");
      expect(storedPipe).toHaveBeenCalledWith(r);
      expect(r.headers["X-SRL-Content-Hash"]).toBe("sha256:abc");
      expect(vi.mocked(generateEnhancedRateConfirmation)).not.toHaveBeenCalled();
    });

    it(`${route}: only an issued RC counts — DRAFT/VOID are excluded from the lookup`, async () => {
      mockPrisma.rateConfirmation.findFirst.mockResolvedValue(ISSUED);
      await handler(req(), res());
      const where = mockPrisma.rateConfirmation.findFirst.mock.calls[0][0].where;
      expect(where).toEqual(expect.objectContaining({ loadId: "load-1", status: { notIn: ["DRAFT", "VOID"] } }));
    });

    it(`${route}: with no issued RC it still renders, as before`, async () => {
      mockPrisma.rateConfirmation.findFirst.mockResolvedValue(null);
      await handler(req(), res());
      expect(vi.mocked(getFileStream)).not.toHaveBeenCalled();
      expect(vi.mocked(generateEnhancedRateConfirmation)).toHaveBeenCalledTimes(1);
    });
  }
});
