// The settlement document checklist becomes data (Arc 8 Phase 3).
//
// Seven booleans on CarrierPay describe a per-settlement document checklist and
// nothing ever wrote them. The AE surface added in v3.8.atb renders them, and
// the field-usage classifier (v3.8.atg) independently reported docSignedBol as
// READ-never-WRITTEN — a screen showing a value nothing produces. Item 204 named
// writing them as the ordered FIRST step, before any decision about gating
// payment on them.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    carrierPay: { findFirst: vi.fn(), update: vi.fn() },
    document: { findMany: vi.fn() },
    rateConfirmation: { findFirst: vi.fn() },
  },
}));

vi.mock("../../../src/config/database", () => ({ prisma: mockPrisma }));
vi.mock("../../../src/lib/logger", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { syncSettlementDocFlags } from "../../../src/services/integrationService";

function arm(docTypes: string[], signedRc = false) {
  mockPrisma.carrierPay.findFirst.mockResolvedValue({ id: "pay-1" });
  mockPrisma.document.findMany.mockResolvedValue(docTypes.map((t) => ({ docType: t })));
  mockPrisma.rateConfirmation.findFirst.mockResolvedValue(signedRc ? { id: "rc-1" } : null);
  mockPrisma.carrierPay.update.mockResolvedValue({});
}

const written = () => mockPrisma.carrierPay.update.mock.calls[0][0].data;

describe("each column flips when its own source event fires", () => {
  beforeEach(() => vi.resetAllMocks());

  it("a POD satisfies docSignedBol — the signed BOL at delivery IS the POD here", async () => {
    arm(["POD"]);
    await syncSettlementDocFlags("load-1");
    expect(written().docSignedBol).toBe(true);
  });

  it("an explicitly signed delivery BOL also satisfies it", async () => {
    arm(["SIGNED_BOL_DEL"]);
    await syncSettlementDocFlags("load-1");
    expect(written().docSignedBol).toBe(true);
  });

  it("a carrier invoice flips docCarrierInvoice", async () => {
    arm(["INVOICE"]);
    await syncSettlementDocFlags("load-1");
    expect(written().docCarrierInvoice).toBe(true);
  });

  it("a lumper receipt flips docLumperReceipt", async () => {
    arm(["RECEIPT_LUMPER"]);
    await syncSettlementDocFlags("load-1");
    expect(written().docLumperReceipt).toBe(true);
  });

  it("a scale ticket flips docScaleTicket", async () => {
    arm(["RECEIPT_SCALE"]);
    await syncSettlementDocFlags("load-1");
    expect(written().docScaleTicket).toBe(true);
  });

  it("a temp log flips docTempLog", async () => {
    // TEMP_LOG did not exist in the docType vocabulary before this change, so
    // this column could never have become true no matter what was uploaded —
    // and it is the evidence in a reefer claim.
    arm(["TEMP_LOG"]);
    await syncSettlementDocFlags("load-1");
    expect(written().docTempLog).toBe(true);
  });

  it("a SIGNED rate confirmation flips docSignedRateCon, with no document involved", async () => {
    // A signature event, not an uploaded file, so it is read from the record it
    // actually lives on.
    arm([], true);
    await syncSettlementDocFlags("load-1");
    expect(written().docSignedRateCon).toBe(true);
  });

  it("leaves every other column false — one event flips one thing", async () => {
    arm(["RECEIPT_SCALE"]);
    await syncSettlementDocFlags("load-1");
    const d = written();
    expect(d.docScaleTicket).toBe(true);
    expect(d.docSignedBol).toBe(false);
    expect(d.docCarrierInvoice).toBe(false);
    expect(d.docLumperReceipt).toBe(false);
    expect(d.docTempLog).toBe(false);
    expect(d.docSignedRateCon).toBe(false);
  });
});

describe("allDocsVerified", () => {
  beforeEach(() => vi.resetAllMocks());

  it("is true only when all seven are recorded", async () => {
    arm(["POD", "INVOICE", "RECEIPT_LUMPER", "RECEIPT_SCALE", "TEMP_LOG"], true);
    await syncSettlementDocFlags("load-1");
    expect(written().allDocsVerified).toBe(true);
  });

  it("stays false while one is missing", async () => {
    // Missing the temp log — the document that decides a reefer claim.
    arm(["POD", "INVOICE", "RECEIPT_LUMPER", "RECEIPT_SCALE"], true);
    await syncSettlementDocFlags("load-1");
    expect(written().allDocsVerified).toBe(false);
  });
});

describe("recompute-from-source, not increment", () => {
  beforeEach(() => vi.resetAllMocks());

  it("is idempotent on re-fire — the same documents produce the same flags", async () => {
    arm(["POD", "RECEIPT_SCALE"]);
    await syncSettlementDocFlags("load-1");
    const first = written();

    mockPrisma.carrierPay.update.mockClear();
    await syncSettlementDocFlags("load-1");
    const second = mockPrisma.carrierPay.update.mock.calls[0][0].data;

    expect(second).toEqual(first);
  });

  it("self-heals when an earlier event was missed", async () => {
    // The point of recomputing rather than flipping: a dropped event does not
    // leave the checklist permanently wrong, because the next one re-derives
    // everything from what actually exists.
    arm(["POD", "INVOICE", "RECEIPT_SCALE"]);
    await syncSettlementDocFlags("load-1");
    const d = written();
    expect(d.docSignedBol).toBe(true);
    expect(d.docCarrierInvoice).toBe(true);
    expect(d.docScaleTicket).toBe(true);
  });

  it("writes nothing when there is no settlement to write to", async () => {
    // A document can arrive long before delivery creates the CarrierPay.
    // createCarrierPayOnDelivery calls this after creating one, so the flags are
    // correct from birth instead of waiting for the next upload.
    mockPrisma.carrierPay.findFirst.mockResolvedValue(null);

    const r = await syncSettlementDocFlags("load-1");

    expect(r.updated).toBe(false);
    expect(mockPrisma.carrierPay.update).not.toHaveBeenCalled();
  });

  it("ignores a VOID settlement", async () => {
    arm(["POD"]);
    await syncSettlementDocFlags("load-1");
    expect(mockPrisma.carrierPay.findFirst.mock.calls[0][0].where.status).toEqual({ not: "VOID" });
  });
});

describe("no backfill", () => {
  it("only ever runs from a source event, never over history", async () => {
    // Historical settlements keep their false flags and keep rendering "not
    // recorded", which is the honest state: nobody recorded them. A retroactive
    // guess would put a checkmark against a document no one confirmed, on the
    // screen an AE reads during a claim.
    const fs = await import("fs");
    const path = await import("path");
    const root = path.join(__dirname, "../../../src");

    const callers: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (p.endsWith(".ts") && fs.readFileSync(p, "utf8").includes("syncSettlementDocFlags(")) {
          callers.push(path.relative(root, p).split(path.sep).join("/"));
        }
      }
    };
    walk(root);

    // Its own definition plus exactly the three source events.
    expect(callers.sort()).toEqual([
      "controllers/documentController.ts",
      "controllers/rateConfirmationController.ts",
      "services/integrationService.ts",
    ]);
  });
});
