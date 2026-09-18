// B7a (2026-09-17) — replacing a compliance document takes a fresh
// authenticator code.
//
// A carrier's COI, W-9, authority letter, workers' comp certificate and BOC-3
// are the evidence complianceCheck reads to decide whether they may be
// tendered a load at all. A session that can swap them can swap the gate's own
// inputs — the reasoning that put the insurance PATCH behind requireStepUp in
// v3.8.atp. PODs and BOLs are frictionless: they travel with a load through
// /carrier-loads/:id/documents, and a driver at a dock is the wrong moment to
// ask for a code.
//
// Two mounts, two shapes. /documents/upload is shared by every portal and
// takes the type from the body, so the gate is conditional: CARRIER role AND a
// compliance docType. /carrier/documents exists only to receive compliance
// paper (its handler says so) and has no other caller, so routes/carrier.ts
// gates it outright with the same action. Both sit AFTER multer — the type is
// only known once the body is parsed — and BEFORE the handler, so a refusal
// stores nothing and records nothing.
//
// The gate keys on the DECLARED type, deliberately. It is also what the row
// stores and what every reader keys on, so a carrier who labels a COI as a
// POD lands it in the POD slot and replaces nothing. Normalised the way
// /carrier-loads normalises its own docType, so case cannot buy a bypass.

import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth";
import { requireStepUp } from "./requireStepUp";

export const COMPLIANCE_DOC_STEP_UP_ACTION = "compliance-document";

export const COMPLIANCE_DOC_TYPES: ReadonlySet<string> = new Set(["W9", "COI", "AUTHORITY", "WORKERS_COMP", "BOC3"]);

export function isComplianceDocType(docType: unknown): boolean {
  return typeof docType === "string" && COMPLIANCE_DOC_TYPES.has(docType.trim().toUpperCase());
}

/** A CARRIER replacing one of their own compliance documents. */
export function isCarrierComplianceUpload(req: AuthRequest): boolean {
  return req.user?.role === "CARRIER" && isComplianceDocType(req.body?.docType);
}

const gate = requireStepUp(COMPLIANCE_DOC_STEP_UP_ACTION);

/** The conditional gate for the shared /documents mount. Everyone else passes through. */
export function requireStepUpForCarrierComplianceDoc(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!isCarrierComplianceUpload(req)) {
    next();
    return;
  }
  gate(req, res, next);
}
