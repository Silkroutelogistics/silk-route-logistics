// Which version of each signed document a carrier is currently on, and whether
// that is still the current one.
//
// THE DEFECT THIS ADDRESSES. complianceCheck accepts any SIGNED broker-carrier
// agreement regardless of version (complianceMonitorService.ts:270-278 — it
// filters on templateName and status, and orders by signedAt, but never looks at
// `version`). So bumping BCA_VERSION in data/agreements.ts when an attorney
// updates the paper has exactly zero effect on carriers who already signed: they
// keep hauling under a version nobody can produce a signature for.
//
// WHAT THIS FILE DOES, AND DELIBERATELY DOES NOT DO. It reports drift. It does
// not gate. Enforcement is banked, and that is a decision rather than an
// omission — see the note at the bottom.

import { BCA_VERSION, QP_VERSION } from "../data/agreements";

/**
 * The version of each document a carrier is expected to hold.
 *
 * Keyed by `CarrierAgreement.templateName`, so registering a new document type
 * (NOA is the known future candidate) is a line here plus its constant — no
 * schema change, because CarrierAgreement already carries templateName and
 * version. Extending that model rather than paralleling it is the rule.
 */
export const CURRENT_VERSIONS: Record<string, string> = {
  "broker-carrier": BCA_VERSION,
  "quick-pay": QP_VERSION,
};

/**
 * The version of the Rate Confirmation's governing terms.
 *
 * DELIBERATELY NOT A `CURRENT_VERSIONS` ENTRY. That map is keyed by
 * `CarrierAgreement.templateName` and `assessVersions` reports any key with no
 * signed row as `missing` — and no CarrierAgreement row is ever a rate
 * confirmation. Adding it there would mark EVERY carrier as missing a document
 * that cannot exist, which is a drift report that cries wolf on its first run.
 *
 * The RC is per-load, not per-carrier: the terms version belongs on the
 * `RateConfirmation` row it was issued under, not on a carrier's signature
 * history. Stamped at issuance (`sendRateConfirmation`), never at render, so
 * re-rendering an old RC reproduces the terms version it was issued with rather
 * than today's.
 *
 * BUMP THIS whenever the governing clauses change — they are built in
 * `pdfService.governingClauses`, and several are interpolated from
 * `accessorialPolicy`, so changing a constant there changes the terms too.
 *
 * v1 (2026-08-31) is the first version stamp. Rate confirmations issued before
 * it carry NULL and render "unversioned", which is honest: the terms they were
 * issued under were never recorded and cannot be reconstructed.
 */
export const RC_TERMS_VERSION = "2026-08-31-v1";

export type DocumentKey = keyof typeof CURRENT_VERSIONS;

export interface VersionDrift {
  templateName: string;
  signedVersion: string;
  currentVersion: string;
  signedAt: Date;
}

export interface CarrierVersionStatus {
  carrierId: string;
  /** Documents held at a version that is no longer current. */
  drifted: VersionDrift[];
  /** Documents in CURRENT_VERSIONS with no signed row at all. */
  missing: string[];
}

/**
 * Compare a carrier's latest signature per templateName against the registry.
 *
 * Takes rows rather than querying, so it is pure and testable and the caller
 * decides the query. Only SIGNED rows should be passed; a superseded or
 * terminated row is not evidence of anything current.
 */
export function assessVersions(
  carrierId: string,
  signedRows: Array<{ templateName: string; version: string; signedAt: Date }>,
): CarrierVersionStatus {
  const latest = new Map<string, { version: string; signedAt: Date }>();
  for (const r of signedRows) {
    const held = latest.get(r.templateName);
    if (!held || r.signedAt > held.signedAt) {
      latest.set(r.templateName, { version: r.version, signedAt: r.signedAt });
    }
  }

  const drifted: VersionDrift[] = [];
  const missing: string[] = [];

  for (const [templateName, currentVersion] of Object.entries(CURRENT_VERSIONS)) {
    const held = latest.get(templateName);
    if (!held) { missing.push(templateName); continue; }
    if (held.version !== currentVersion) {
      drifted.push({ templateName, signedVersion: held.version, currentVersion, signedAt: held.signedAt });
    }
  }

  return { carrierId, drifted, missing };
}

/** Register a document type at runtime — used by tests to prove the shape accepts a new one without a schema change. */
export function registerDocumentVersion(templateName: string, version: string): void {
  CURRENT_VERSIONS[templateName] = version;
}

// ─────────────────────────────────────────────────────────────────────────────
// ENFORCEMENT IS BANKED, AND THIS IS THE REASONING.
//
// The obvious next step is to make complianceCheck reject a drifted BCA after a
// grace window. Three things say do the detection first and the gate second:
//
// 1. THE PAPER DOES NOT ASK FOR IT. The Broker-Carrier Agreement contains no
//    amendment or re-consent clause — no "continued use constitutes acceptance",
//    no stated re-signature obligation. The only notice period either document
//    states is BCA §244's "Broker reserves the right to modify program criteria
//    with 30 days' notice", and that governs Caravan program criteria, not the
//    agreement body. So forcing re-signature is a business policy SRL would be
//    adopting, not a contractual right it already holds. That is Wasi's call and
//    counsel's, not a default to code in. (§16 #1 — the BCA has still not been
//    through a Michigan commercial attorney.)
//
// 2. GATING WITHOUT A RE-CONSENT SURFACE LOCKS CARRIERS OUT. A version bump is a
//    single-constant commit. If the gate shipped with it, every already-signed
//    carrier would drift on that deploy, and at grace expiry they would be
//    blocked from tendering with no in-portal path to re-sign. The sign
//    endpoints exist and re-record consent to a new version idempotently, but
//    nothing on the carrier side prompts or routes them there. Detection is safe
//    today; the gate is not safe until that surface exists.
//
// 3. THE RC IS THE WEAKEST LINK AND IS NOT VERSIONED AT ALL. RateConfirmation
//    records `signed`, `signedAt`, `signedUrl`, `carrierSignature` (a name) —
//    no IP, no user agent, and no version. The BCA and Quick Pay both capture
//    typed name + IP + user agent + version + an executed PDF. So the per-load
//    document that actually governs a given haul carries materially weaker
//    evidence than the master agreements, and a dispute over a specific load
//    cannot establish which terms governed it. Stamping the version on the load
//    is a prerequisite for the per-load half of any version policy, and it is a
//    schema change that should land on its own.
//
// Banked with resume state in §13.3. What exists now is honest: the drift is
// visible and reportable, and nobody is locked out by a constant bump.
// ─────────────────────────────────────────────────────────────────────────────
