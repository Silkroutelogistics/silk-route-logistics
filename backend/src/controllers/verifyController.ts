import { Request, Response } from "express";
import crypto from "crypto";
import { prisma } from "../config/database";
import { ENTITY_NAME, MC_NUMBER, DOT_NUMBER, OPERATIONS_EMAIL } from "../config/authority";

/**
 * Sprint 51 (Item 129) — RC verification token + public verifier endpoint.
 *
 * Anti-fraud pattern per FreightWaves 2026 fake-rate-con landscape.
 * Carriers receive thousands of phishing RC PDFs annually impersonating
 * legitimate brokers; the verification URL lets honest carriers confirm
 * an RC PDF came from the system before committing to the load.
 *
 * Token strategy: deterministic SHA-256 hash of (load.id + referenceNumber
 * + salt), truncated to 12 hex chars. Public-shareable; no signing needed
 * because fraudsters already fake entire PDFs — the verification surface
 * is for honest carriers to confirm legitimacy, not to gate access.
 *
 * Sprint 80+ migration path: §13.3 Item 146 — when load volume reaches
 * ~10K cumulative records, the hash-scan-lookup below may slow. At that
 * point migrate to a Load.verifyToken schema field with unique index for
 * O(1) lookup. Defer until performance signal fires.
 */

const TOKEN_SALT = "silkroutelogistics-rc";

export function rcVerifyToken(load: { id: string; referenceNumber: string }): string {
  const input = `${load.id}|${load.referenceNumber}|${TOKEN_SALT}`;
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 12);
}

export async function verifyRC(req: Request, res: Response) {
  const token = String(req.params.token || "");
  if (!token || !/^[a-f0-9]{12}$/.test(token)) {
    res.status(400).json({ valid: false, error: "Malformed token" });
    return;
  }

  // Hash-scan last 90 days of loads. Acceptable at current volume; Item 146
  // tracks the schema-field migration when N grows.
  // v3.8.arl — was 90 days. A carrier holding a legitimate 91-day-old rate
  // confirmation got "not found or verification expired" from our own
  // anti-fraud tool — the strongest possible fraud signal, for a valid
  // document. Widened to 18 months to match the 49 U.S.C. 14705(a) window in
  // which a carrier can still be invoicing against that load, so any RC worth
  // verifying verifies. Item 146 tracks the O(1) schema-field migration.
  const since = new Date(Date.now() - 548 * 24 * 60 * 60 * 1000);
  const loads = await prisma.load.findMany({
    where: { createdAt: { gte: since } },
    select: {
      id: true,
      referenceNumber: true,
      pickupDate: true,
      deliveryDate: true,
      originState: true,
      destState: true,
      equipmentType: true,
      carrierRate: true,
      createdAt: true,
      carrier: {
        select: {
          company: true,
          carrierProfile: { select: { mcNumber: true, dotNumber: true } },
        },
      },
    },
  });

  const match = loads.find((l) => rcVerifyToken({ id: l.id, referenceNumber: l.referenceNumber }) === token);

  if (!match) {
    // v3.8.arl — unambiguous. The old copy conflated "we have no record" with
    // "this expired", so a carrier could not tell a filing artifact from fraud.
    res.status(404).json({
      valid: false,
      error: "We have no record of this Rate Confirmation. Do not haul this load. Call SRL at (269) 220-6760 before you move.",
    });
    return;
  }

  res.json({
    valid: true,
    broker: {
      // v3.8.akg §13.3 Item 8.9 — sourced from canonical authority module.
      name: ENTITY_NAME,
      mc: MC_NUMBER,
      dot: DOT_NUMBER,
      contact: OPERATIONS_EMAIL,
    },
    load: {
      ref: match.referenceNumber,
      pickupDate: match.pickupDate,
      deliveryDate: match.deliveryDate,
      originState: match.originState,
      destState: match.destState,
      equipmentType: match.equipmentType,
    },
    carrier: match.carrier
      ? {
          company: match.carrier.company,
          mc: match.carrier.carrierProfile?.mcNumber,
          dot: match.carrier.carrierProfile?.dotNumber,
        }
      : null,
    // ARC 21 — DECIDED: carrierRate. This is a PUBLIC token endpoint verifying
    // a rate confirmation, and an RC states the carrier's rate. Returning the
    // customer number here would publish SRL's margin to anyone holding the
    // token — the v3.8.att class of leak, on a route with no session at all.
    rate: match.carrierRate ?? 0,
    issuedAt: match.createdAt,
  });
}
