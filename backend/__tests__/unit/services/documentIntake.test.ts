/**
 * Document intake — the safety rules, each pinned.
 *
 * v3.8.awh. These four properties were ratified and never built, and they are
 * the difference between a parser that helps and a parser that quietly decides
 * things. Each is a rule, and each has a test that fails if it is removed.
 *
 *   1. A parse failure never fails the upload.
 *   2. Extracted values never overwrite typed values.
 *   3. A failed or low-confidence parse produces a REVIEW state — never a silent
 *      zero, never an auto-pass.
 *   4. A disagreement is a visible flag, never an auto-verdict.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { COIExtractedData } from "../../../src/services/coiReaderService";
import { findCoiDiscrepancies, runDocumentIntake } from "../../../src/services/documentIntakeService";
import { prisma } from "../../../src/config/database";
import * as storage from "../../../src/services/storageService";
import * as reader from "../../../src/services/coiReaderService";

const coi = (over: Partial<COIExtractedData> = {}): COIExtractedData => ({
  insurerName: "Continental Western Indemnity",
  policyNumber: "CWI-AL-7734920",
  effectiveDate: "2026-03-01",
  expirationDate: "2027-03-01",
  generalLiability: { perOccurrence: 2_000_000, aggregate: null },
  autoLiability: { combinedSingleLimit: 1_000_000 },
  cargoInsurance: { perOccurrence: 250_000 },
  workersComp: { perAccident: 500_000 },
  certificateHolder: "Blue Ridge Freight Systems Inc",
  additionalInsured: true,
  waiverOfSubrogation: true,
  agentName: "Dana Whitfield",
  agentEmail: "dana@meridianrisk.example",
  agentPhone: "(312) 555-0184",
  agencyName: "Meridian Risk Partners LLC",
  confidence: "HIGH",
  rawText: "",
  ...over,
});

const typed = {
  autoLiabilityAmount: 1_000_000,
  cargoInsuranceAmount: 250_000,
  generalLiabilityAmount: 2_000_000,
  workersCompAmount: 500_000,
  insuranceExpiry: new Date("2027-03-01T00:00:00Z"),
  companyName: "Blue Ridge Freight Systems Inc",
};

describe("discrepancy detection", () => {
  it("agreement produces no flags", () => {
    expect(findCoiDiscrepancies(coi(), typed)).toEqual([]);
  });

  it("catches the arc's own scenario — typed $1M, COI says $750K", () => {
    const d = findCoiDiscrepancies(coi({ autoLiability: { combinedSingleLimit: 750_000 } }), typed);
    expect(d).toHaveLength(1);
    expect(d[0]).toEqual({ field: "Auto liability", typed: 1_000_000, extracted: 750_000 });
  });

  it("catches a COI belonging to a different company", () => {
    // The single most consequential thing a reader can catch: a certificate for
    // somebody else entirely, which a busy AE will not notice by eye.
    const d = findCoiDiscrepancies(coi({ certificateHolder: "Cascade Haulage LLC" }), typed);
    expect(d.map((x) => x.field)).toContain("Named party");
  });

  it("tolerates punctuation and suffix noise in the company name", () => {
    // A COI and a registration form never agree on "Inc." vs "Inc" vs ", Inc.".
    // Flagging that would bury the real mismatches under noise.
    const d = findCoiDiscrepancies(coi({ certificateHolder: "BLUE RIDGE FREIGHT SYSTEMS, INC." }), typed);
    expect(d.map((x) => x.field)).not.toContain("Named party");
  });

  it("does not flag a formatting difference in an amount", () => {
    const d = findCoiDiscrepancies(coi({ autoLiability: { combinedSingleLimit: 1_000_000.0 } }), typed);
    expect(d).toEqual([]);
  });

  it("catches an expiry that disagrees by a day", () => {
    const d = findCoiDiscrepancies(coi({ expirationDate: "2027-02-28" }), typed);
    expect(d.map((x) => x.field)).toContain("Insurance expiry");
  });

  it("a MISSING typed value is not a disagreement", () => {
    // An unanswered question is not a contradiction. Reporting it as one would
    // put a flag on every carrier who left a field blank, and the real
    // disagreements would stop being read.
    const d = findCoiDiscrepancies(coi(), { ...typed, cargoInsuranceAmount: null });
    expect(d).toEqual([]);
  });

  it("a MISSING extracted value is not a disagreement either", () => {
    const d = findCoiDiscrepancies(coi({ cargoInsurance: null }), typed);
    expect(d).toEqual([]);
  });
});


describe("the review state is WRITTEN, not merely mentioned", () => {
  // These EXERCISE runDocumentIntake. The text pins below cannot tell a call
  // from a call behind `if (false)` — proven by injecting exactly that and
  // watching them stay green. Presence is not function (§19 Sub-pattern 16),
  // committed in a guard written against that very failure.
  beforeEach(() => {
    vi.restoreAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma as any).documentExtraction.upsert.mockReset();
  });

  const args = {
    documentId: "doc_1", docType: "COI", entityType: "CARRIER",
    entityId: "carrier_1", fileUrl: "s3://b/k.pdf", fileType: "application/pdf",
  };

  it("a storage failure writes status FAILED — the corrupted-document case", async () => {
    vi.spyOn(storage, "getFileStream").mockRejectedValue(new Error("object unreadable"));
    await runDocumentIntake(args);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = (prisma as any).documentExtraction.upsert.mock.calls[0]?.[0];
    expect(call, "a failed parse must still leave a row — never a silent zero").toBeTruthy();
    expect(call.create.status).toBe("FAILED");
    expect(call.create.error).toMatch(/unreadable/);
  });

  it("a parser throw writes status FAILED too, and never rethrows", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(storage, "getFileStream").mockResolvedValue(require("stream").Readable.from([Buffer.from("x")]) as any);
    vi.spyOn(reader, "extractCOIData").mockRejectedValue(new Error("model 404"));
    // The absence of a rejection here IS the "never fails the upload" rule.
    await expect(runDocumentIntake(args)).resolves.toBeUndefined();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((prisma as any).documentExtraction.upsert.mock.calls[0][0].create.status).toBe("FAILED");
  });

  it("an unreadable-but-successful parse is LOW_CONFIDENCE, not OK", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(storage, "getFileStream").mockResolvedValue(require("stream").Readable.from([Buffer.from("x")]) as any);
    vi.spyOn(reader, "extractCOIData").mockResolvedValue(
      coi({ policyNumber: null, insurerName: null, expirationDate: null, confidence: "LOW" }),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma as any).carrierProfile.findUnique.mockResolvedValue(null);
    await runDocumentIntake(args);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = (prisma as any).documentExtraction.upsert.mock.calls[0][0];
    expect(call.create.status).toBe("LOW_CONFIDENCE");
  });

  it("a docType nobody parses is left alone entirely", async () => {
    await runDocumentIntake({ ...args, docType: "AUTHORITY" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((prisma as any).documentExtraction.upsert).not.toHaveBeenCalled();
  });

  it("an UPLOAD_FAILED row (no fileUrl) is left alone — there is nothing to read", async () => {
    await runDocumentIntake({ ...args, fileUrl: "" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((prisma as any).documentExtraction.upsert).not.toHaveBeenCalled();
  });
});

describe("the safety rules are declared in the service", () => {
  // These are properties of the intake path that a unit test cannot exercise
  // without a database and object storage; the chain selftest exercises them
  // end to end. Pinned here so removing one is a visible edit, not a silent one.
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "../../../src/services/documentIntakeService.ts"),
    "utf8",
  );

  it("never writes extracted values onto CarrierProfile", () => {
    // The pre-existing ?apply=true path did exactly this. The whole design of
    // this service is that it does not.
    expect(src).not.toMatch(/carrierProfile\.update/);
  });

  it("is fire-and-forget, so a parse cannot fail an upload", () => {
    expect(src).toMatch(/export function queueDocumentIntake/);
    expect(src).toMatch(/void runDocumentIntake\(args\)\.catch/);
  });

  it("records a review state rather than nothing when a parse fails", () => {
    expect(src).toMatch(/record\("FAILED"/);
    expect(src).toMatch(/LOW_CONFIDENCE/);
  });

  it("treats an empty read as low-confidence, not as a successful empty document", () => {
    // The worst available outcome: a blank extraction that looks like a clean
    // read of a document containing nothing.
    expect(src).toMatch(/emptyRead/);
  });
});
