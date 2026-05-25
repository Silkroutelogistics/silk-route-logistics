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
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
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
      rate: true,
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
    res.status(404).json({ valid: false, error: "Rate Confirmation not found or verification expired" });
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
    rate: match.rate,
    issuedAt: match.createdAt,
  });
}
