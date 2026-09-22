/**
 * E1c (2026-09-21) — the load-document seam: one answer to "what does
 * recording a POD set in motion", whichever route carried it.
 *
 * The P0 this closes: POST /carrier-loads/:id/documents advanced
 * AT_DELIVERY → POD_RECEIVED past DELIVERED and fired nothing, so a carrier who
 * uploaded the POD at delivery — the common case, by the route's own comment —
 * got no CarrierPay, ever. The P1: the same route ran neither onPODUploaded
 * nor syncSettlementDocFlags, so the settlement stayed at dueDate null /
 * docPod false even when DELIVERED had been flipped first.
 *
 * These cases pin the CONTROL FLOW with the hooks mocked. Exactly-once on the
 * CarrierPay row itself is proven against a real database by
 * scripts/_arc-e1-pod-proof.ts (E1d), which a mock cannot do.
 *
 * Adversarially verified at authoring: re-instating the AT_DELIVERY skip
 * (deleting the onLoadDelivered call) turns the two "delivery event" cases
 * red; dropping the `before !== "DELIVERED"` guard turns the double-fire case
 * red.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const hooks = vi.hoisted(() => ({
  onLoadDelivered: vi.fn().mockResolvedValue(undefined),
  onPODUploaded: vi.fn().mockResolvedValue(undefined),
  syncSettlementDocFlags: vi.fn().mockResolvedValue({ updated: true }),
  uploadFile: vi.fn().mockResolvedValue("https://s3.test/documents/x.pdf"),
  validateBufferSignature: vi.fn().mockReturnValue(true),
  autoGenerateInvoice: vi.fn().mockResolvedValue(undefined),
  sendPODToContact: vi.fn().mockResolvedValue(undefined),
  logLoadActivity: vi.fn().mockResolvedValue(undefined),
  broadcastSSE: vi.fn(),
  notifyAccountingOfCarrierInvoice: vi.fn().mockResolvedValue({ emailed: true, rows: 1 }),
}));

vi.mock("../../../src/services/integrationService", () => ({
  onLoadDelivered: hooks.onLoadDelivered,
  onPODUploaded: hooks.onPODUploaded,
  syncSettlementDocFlags: hooks.syncSettlementDocFlags,
}));
vi.mock("../../../src/services/storageService", () => ({
  uploadFile: hooks.uploadFile,
  validateBufferSignature: hooks.validateBufferSignature,
}));
vi.mock("../../../src/services/invoiceService", () => ({ autoGenerateInvoice: hooks.autoGenerateInvoice }));
vi.mock("../../../src/services/shipperLoadNotifyService", () => ({ sendPODToContact: hooks.sendPODToContact }));
vi.mock("../../../src/services/loadActivityService", () => ({ logLoadActivity: hooks.logLoadActivity }));
vi.mock("../../../src/routes/trackTraceSSE", () => ({ broadcastSSE: hooks.broadcastSSE }));
vi.mock("../../../src/services/carrierInvoiceNotifyService", () => ({ notifyAccountingOfCarrierInvoice: hooks.notifyAccountingOfCarrierInvoice }));
vi.mock("../../../src/lib/logger", () => ({ log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));

import { prisma } from "../../../src/config/database";
import { recordLoadDocument, LoadDocumentRefusal, POD_ADVANCING_STATUSES } from "../../../src/services/loadDocumentService";

const mockPrisma = prisma as any;
const file = { buffer: Buffer.from("%PDF-1.4 probe"), originalname: "pod.pdf", mimetype: "application/pdf", size: 14 };
const actor = { id: "u-carrier", email: "c@x.test", role: "CARRIER" };

function armLoad(status: string, extra: Record<string, unknown> = {}) {
  mockPrisma.load.findUnique.mockResolvedValue({
    id: "load-1",
    status,
    referenceNumber: "SRL-1",
    posterId: "u-ae",
    destCompany: "Receiver Inc",
    actualPickupDatetime: null,
    actualDeliveryDatetime: null,
    customer: { contactName: "Pat" },
    ...extra,
  });
  mockPrisma.document.create.mockResolvedValue({ id: "doc-1", docType: "POD", fileUrl: "https://s3.test/documents/x.pdf" });
  mockPrisma.load.update.mockResolvedValue({});
  mockPrisma.notification.create.mockResolvedValue({});
}

const record = (docType: string, source: "CARRIER_PORTAL" | "AE_CONSOLE" = "CARRIER_PORTAL") =>
  recordLoadDocument({ loadId: "load-1", docType, file, actor, uploadSource: source });

const loadUpdateData = () => mockPrisma.load.update.mock.calls[0][0].data;

describe("a POD is the delivery event when it arrives before DELIVERED", () => {
  beforeEach(() => vi.clearAllMocks());

  it("POD at AT_DELIVERY: advances to POD_RECEIVED and fires onLoadDelivered — the P0", async () => {
    armLoad("AT_DELIVERY");
    const r = await record("POD");
    expect(r.status).toEqual({ before: "AT_DELIVERY", after: "POD_RECEIVED" });
    expect(loadUpdateData().status).toBe("POD_RECEIVED");
    expect(loadUpdateData().actualDeliveryDatetime).toBeInstanceOf(Date);
    expect(hooks.onLoadDelivered).toHaveBeenCalledTimes(1);
    expect(hooks.onLoadDelivered).toHaveBeenCalledWith("load-1");
    expect(r.deliveryHooksFired).toBe(true);
  });

  it("POD at LOADED: the same — the skip was the same skip", async () => {
    armLoad("LOADED");
    await record("POD");
    expect(loadUpdateData().status).toBe("POD_RECEIVED");
    expect(hooks.onLoadDelivered).toHaveBeenCalledTimes(1);
  });

  it("the advancing set is exactly the three the route always used", () => {
    expect([...POD_ADVANCING_STATUSES].sort()).toEqual(["AT_DELIVERY", "DELIVERED", "LOADED"]);
  });
});

describe("a POD is NOT the delivery event when DELIVERED already happened", () => {
  beforeEach(() => vi.clearAllMocks());

  it("POD at DELIVERED: advances to POD_RECEIVED and does NOT fire onLoadDelivered — the flip already did", async () => {
    // onLoadDelivered increments cppTotalLoads; firing it twice double-counts.
    armLoad("DELIVERED");
    const r = await record("POD");
    expect(loadUpdateData().status).toBe("POD_RECEIVED");
    expect(hooks.onLoadDelivered).not.toHaveBeenCalled();
    expect(r.deliveryHooksFired).toBe(false);
  });

  it("a second POD at POD_RECEIVED: status stays, no delivery event, the settlement hooks still run", async () => {
    armLoad("POD_RECEIVED");
    const r = await record("POD");
    expect(r.status).toEqual({ before: "POD_RECEIVED", after: "POD_RECEIVED" });
    expect(hooks.onLoadDelivered).not.toHaveBeenCalled();
    expect(hooks.onPODUploaded).toHaveBeenCalledTimes(1);
    expect(hooks.syncSettlementDocFlags).toHaveBeenCalledTimes(1);
  });

  it("a POD at IN_TRANSIT does not auto-advance — the truck has not arrived", async () => {
    armLoad("IN_TRANSIT");
    const r = await record("POD");
    expect(r.status.after).toBe("IN_TRANSIT");
    expect(hooks.onLoadDelivered).not.toHaveBeenCalled();
    expect(hooks.autoGenerateInvoice).not.toHaveBeenCalled();
  });
});

describe("the P1: every POD starts the clock and flips the flags, on every route", () => {
  beforeEach(() => vi.clearAllMocks());

  for (const status of ["AT_DELIVERY", "DELIVERED"]) {
    it(`POD at ${status}: onPODUploaded, syncSettlementDocFlags, invoice, AE row, ONE shipper email`, async () => {
      armLoad(status);
      await record("POD");
      expect(hooks.onPODUploaded).toHaveBeenCalledWith("load-1");
      expect(hooks.syncSettlementDocFlags).toHaveBeenCalledWith("load-1");
      expect(hooks.autoGenerateInvoice).toHaveBeenCalledWith("load-1");
      expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);
      expect(hooks.sendPODToContact).toHaveBeenCalledTimes(1);
    });
  }

  it("the AE route is the same seam: an AE uploading the POD gets no self-notification", async () => {
    armLoad("DELIVERED", { posterId: "u-ae" });
    await recordLoadDocument({ loadId: "load-1", docType: "POD", file, actor: { id: "u-ae", role: "ADMIN" }, uploadSource: "AE_CONSOLE" });
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    expect(hooks.onPODUploaded).toHaveBeenCalledTimes(1);
  });

  it("the delivery hooks are awaited and their failure propagates — never caught into a 200", async () => {
    armLoad("AT_DELIVERY");
    hooks.onLoadDelivered.mockRejectedValueOnce(new Error("db down"));
    await expect(record("POD")).rejects.toThrow("db down");
  });
});

describe("a non-POD document", () => {
  beforeEach(() => vi.clearAllMocks());

  it("INVOICE: stored, flags synced, load untouched, no POD hooks", async () => {
    armLoad("POD_RECEIVED");
    const r = await record("INVOICE");
    expect(mockPrisma.document.create.mock.calls[0][0].data.docType).toBe("INVOICE");
    expect(mockPrisma.load.update).not.toHaveBeenCalled();
    expect(hooks.onPODUploaded).not.toHaveBeenCalled();
    expect(hooks.onLoadDelivered).not.toHaveBeenCalled();
    expect(hooks.syncSettlementDocFlags).toHaveBeenCalledTimes(1);
    expect(r.status).toEqual({ before: "POD_RECEIVED", after: "POD_RECEIVED" });
  });
});

describe("refusals happen before any write", () => {
  beforeEach(() => vi.clearAllMocks());

  it("an unknown docType is a 400 refusal and nothing is uploaded or stored", async () => {
    armLoad("DELIVERED");
    await expect(record("FOO")).rejects.toMatchObject({ status: 400, code: "UNKNOWN_DOC_TYPE" });
    expect(hooks.uploadFile).not.toHaveBeenCalled();
    expect(mockPrisma.document.create).not.toHaveBeenCalled();
  });

  it("a buffer that does not match its claimed MIME type is a 400 refusal, nothing stored", async () => {
    armLoad("DELIVERED");
    hooks.validateBufferSignature.mockReturnValueOnce(false);
    await expect(record("POD")).rejects.toMatchObject({ status: 400, code: "FILE_CONTENT_MISMATCH" });
    expect(hooks.uploadFile).not.toHaveBeenCalled();
  });

  it("an unknown load is a 404, nothing uploaded", async () => {
    mockPrisma.load.findUnique.mockResolvedValue(null);
    await expect(record("POD")).rejects.toBeInstanceOf(LoadDocumentRefusal);
    expect(hooks.uploadFile).not.toHaveBeenCalled();
  });
});

describe("E5 (ruling 4) — an INVOICE tells accounting, once, after the settlement sync", () => {
  beforeEach(() => vi.clearAllMocks());
  it("INVOICE at DELIVERED: the doc flags sync first, then accounting is notified with the DOCUMENT id", async () => {
    armLoad("DELIVERED");
    mockPrisma.document.create.mockResolvedValue({ id: "doc-inv-9", docType: "INVOICE", fileUrl: "https://s3.test/documents/inv.pdf" });
    const order: string[] = [];
    hooks.syncSettlementDocFlags.mockImplementation(async () => { order.push("sync"); return { updated: true }; });
    hooks.notifyAccountingOfCarrierInvoice.mockImplementation(async () => { order.push("notify"); return { emailed: true, rows: 1 }; });
    await record("INVOICE");
    expect(hooks.notifyAccountingOfCarrierInvoice).toHaveBeenCalledTimes(1);
    expect(hooks.notifyAccountingOfCarrierInvoice).toHaveBeenCalledWith("load-1", "doc-inv-9");
    expect(order).toEqual(["sync", "notify"]);
    // An invoice is not a delivery event and not a POD.
    expect(hooks.onLoadDelivered).not.toHaveBeenCalled();
    expect(hooks.onPODUploaded).not.toHaveBeenCalled();
  });

  it("a POD does not notify accounting; a scale ticket does not either", async () => {
    armLoad("DELIVERED");
    await record("POD");
    await record("RECEIPT_SCALE");
    expect(hooks.notifyAccountingOfCarrierInvoice).not.toHaveBeenCalled();
  });
});
