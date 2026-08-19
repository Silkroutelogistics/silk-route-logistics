// Version drift detection for signed carrier documents.
//
// complianceCheck accepts any SIGNED broker-carrier agreement regardless of
// version, so bumping BCA_VERSION when an attorney updates the paper reaches
// nobody who already signed. This is the detection half; enforcement is banked
// deliberately (see the note at the bottom of lib/agreementVersions.ts).

import { describe, it, expect, afterEach } from "vitest";
import {
  assessVersions,
  registerDocumentVersion,
  CURRENT_VERSIONS,
} from "../../../src/lib/agreementVersions";
import { BCA_VERSION, QP_VERSION } from "../../../src/data/agreements";

const at = (iso: string) => new Date(iso);

afterEach(() => {
  // registerDocumentVersion mutates the shared registry; a synthetic type from
  // one test must not leak into another's expectations.
  for (const k of Object.keys(CURRENT_VERSIONS)) {
    if (k !== "broker-carrier" && k !== "quick-pay") delete CURRENT_VERSIONS[k];
  }
});

describe("assessVersions", () => {
  it("reports no drift for a carrier on current versions", () => {
    const s = assessVersions("c1", [
      { templateName: "broker-carrier", version: BCA_VERSION, signedAt: at("2026-07-01T00:00:00Z") },
      { templateName: "quick-pay", version: QP_VERSION, signedAt: at("2026-07-01T00:00:00Z") },
    ]);
    expect(s.drifted).toEqual([]);
    expect(s.missing).toEqual([]);
  });

  it("flags a carrier holding a superseded BCA — the case the gate cannot see", () => {
    const s = assessVersions("c2", [
      { templateName: "broker-carrier", version: "2026-01-01-vOLD", signedAt: at("2026-01-02T00:00:00Z") },
      { templateName: "quick-pay", version: QP_VERSION, signedAt: at("2026-07-01T00:00:00Z") },
    ]);
    expect(s.drifted).toHaveLength(1);
    expect(s.drifted[0].templateName).toBe("broker-carrier");
    expect(s.drifted[0].signedVersion).toBe("2026-01-01-vOLD");
    expect(s.drifted[0].currentVersion).toBe(BCA_VERSION);
  });

  it("reports a document never signed as missing, not drifted", () => {
    // Different problem, different remedy: missing means sign, drifted means
    // re-sign. A gate that conflates them tells a carrier who HAS a BCA that
    // they have none.
    const s = assessVersions("c3", [
      { templateName: "broker-carrier", version: BCA_VERSION, signedAt: at("2026-07-01T00:00:00Z") },
    ]);
    expect(s.missing).toEqual(["quick-pay"]);
    expect(s.drifted).toEqual([]);
  });

  it("judges on the LATEST signature per document, not the first it sees", () => {
    // A carrier who signed the old version and then re-signed the current one is
    // current. Ordering by signedAt is what makes re-consent actually clear the
    // drift.
    const s = assessVersions("c4", [
      { templateName: "broker-carrier", version: "2026-01-01-vOLD", signedAt: at("2026-01-02T00:00:00Z") },
      { templateName: "broker-carrier", version: BCA_VERSION, signedAt: at("2026-08-01T00:00:00Z") },
      { templateName: "quick-pay", version: QP_VERSION, signedAt: at("2026-08-01T00:00:00Z") },
    ]);
    expect(s.drifted).toEqual([]);
  });

  it("does not let an out-of-order row mask a re-signature", () => {
    const s = assessVersions("c5", [
      { templateName: "broker-carrier", version: BCA_VERSION, signedAt: at("2026-08-01T00:00:00Z") },
      { templateName: "broker-carrier", version: "2026-01-01-vOLD", signedAt: at("2026-01-02T00:00:00Z") },
      { templateName: "quick-pay", version: QP_VERSION, signedAt: at("2026-08-01T00:00:00Z") },
    ]);
    expect(s.drifted).toEqual([]);
  });

  it("treats a carrier with no signatures as missing everything", () => {
    const s = assessVersions("c6", []);
    expect(s.missing.sort()).toEqual(["broker-carrier", "quick-pay"]);
    expect(s.drifted).toEqual([]);
  });
});

describe("future document types", () => {
  it("accepts a new templateName with no schema change", () => {
    // NOA is the known future candidate. CarrierAgreement already carries
    // templateName and version, so registering one is a registry line — the
    // model is extended, never paralleled.
    registerDocumentVersion("notice-of-assignment", "2026-09-01-v1");

    const s = assessVersions("c7", [
      { templateName: "broker-carrier", version: BCA_VERSION, signedAt: at("2026-08-01T00:00:00Z") },
      { templateName: "quick-pay", version: QP_VERSION, signedAt: at("2026-08-01T00:00:00Z") },
      { templateName: "notice-of-assignment", version: "2026-08-01-vOLD", signedAt: at("2026-08-01T00:00:00Z") },
    ]);

    expect(s.drifted.map((d) => d.templateName)).toContain("notice-of-assignment");
  });

  it("reports a newly registered document as missing for carriers who never signed it", () => {
    registerDocumentVersion("notice-of-assignment", "2026-09-01-v1");
    const s = assessVersions("c8", [
      { templateName: "broker-carrier", version: BCA_VERSION, signedAt: at("2026-08-01T00:00:00Z") },
      { templateName: "quick-pay", version: QP_VERSION, signedAt: at("2026-08-01T00:00:00Z") },
    ]);
    expect(s.missing).toContain("notice-of-assignment");
  });
});

describe("registry", () => {
  it("tracks the live constants rather than copies of them", () => {
    // A hardcoded version string here would drift from agreements.ts silently,
    // which is the same class of bug this whole file exists to detect.
    expect(CURRENT_VERSIONS["broker-carrier"]).toBe(BCA_VERSION);
    expect(CURRENT_VERSIONS["quick-pay"]).toBe(QP_VERSION);
  });
});
