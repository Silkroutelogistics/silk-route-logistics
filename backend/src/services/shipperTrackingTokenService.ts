import { prisma } from "../config/database";
import type { ShipperTrackingToken } from "@prisma/client";
import { log } from "../lib/logger";

/**
 * Shipper Tracking Token service.
 *
 * Canonical location for BOL-print token generation and
 * delivery-event expiry refresh.
 *
 * Expiry rule (locked v3.7.k, decision F3):
 *  - actualDeliveryDatetime set:
 *      expiresAt = actualDeliveryDatetime + 180d
 *  - actualDeliveryDatetime null:
 *      expiresAt = createdAt + 90d (failsafe for
 *      cancelled/abandoned loads)
 *
 * Delivery refresh never shortens an existing longer
 * expiry (tokens only grow, never shrink, on state
 * transitions).
 *
 * See CLAUDE.md §14 for PII-scope rationale
 * (shipperName visible on public /track lookups).
 *
 * Tokens issued here use accessLevel=STATUS_ONLY.
 * 5E.b should verify the public /track projection
 * honoring STATUS_ONLY hides everything it should per
 * Phase 5E audit F1–F7 decisions; if current projection
 * is looser, 5E.b scope expands to projection tightening.
 */

// 55-char confusable-excluded alphabet (matches
// shipperPortalController:731 pattern — no 0/O/1/I/l).
const TOKEN_CHARS =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
const TOKEN_LENGTH = 12;

const POST_DELIVERY_EXPIRY_DAYS = 180;
const PRE_DELIVERY_EXPIRY_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

function generateTokenString(): string {
  let out = "";
  for (let i = 0; i < TOKEN_LENGTH; i++) {
    out += TOKEN_CHARS[Math.floor(Math.random() * TOKEN_CHARS.length)];
  }
  return out;
}

export function computeExpiresAt(load: {
  actualDeliveryDatetime: Date | null;
  createdAt: Date;
}): Date {
  if (load.actualDeliveryDatetime) {
    return new Date(
      load.actualDeliveryDatetime.getTime() + POST_DELIVERY_EXPIRY_DAYS * DAY_MS,
    );
  }
  return new Date(load.createdAt.getTime() + PRE_DELIVERY_EXPIRY_DAYS * DAY_MS);
}

/**
 * Generate (or return existing non-expired) STATUS_ONLY
 * tracking token for a BOL-print event.
 *
 * Idempotent: a second call for the same loadId returns
 * the same row as long as the existing token is still
 * valid. Never generates duplicates for BOL re-prints.
 *
 * Throws on unknown loadId or on shipperId mismatch
 * (cross-shipper leak guard).
 */
export async function generateBOLPrintToken(
  loadId: string,
  shipperId: string,
): Promise<ShipperTrackingToken> {
  const load = await prisma.load.findUnique({
    where: { id: loadId },
    select: {
      id: true,
      customerId: true,
      createdAt: true,
      actualDeliveryDatetime: true,
    },
  });
  if (!load) {
    throw new Error(`[tracking-token] Load not found: ${loadId}`);
  }
  if (load.customerId && load.customerId !== shipperId) {
    throw new Error(
      `[tracking-token] Shipper mismatch for load ${loadId}: ` +
        `provided ${shipperId}, load has ${load.customerId}`,
    );
  }

  // Idempotency — return existing non-expired STATUS_ONLY
  // token if one exists for this load.
  const existing = await prisma.shipperTrackingToken.findFirst({
    where: {
      loadId,
      accessLevel: "STATUS_ONLY",
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  const expiresAt = computeExpiresAt(load);
  const token = generateTokenString();

  return await prisma.shipperTrackingToken.create({
    data: {
      loadId,
      shipperId,
      token,
      accessLevel: "STATUS_ONLY",
      expiresAt,
    },
  });
}

/**
 * Refresh expiresAt on all non-expired STATUS_ONLY tokens
 * for a load that has just been marked delivered.
 *
 * Never shortens an existing expiry — only extends.
 * FULL-access tokens (shipper-portal-share flow) are
 * untouched.
 */
export async function refreshBOLTrackingTokenExpiry(
  loadId: string,
): Promise<void> {
  const load = await prisma.load.findUnique({
    where: { id: loadId },
    select: { id: true, actualDeliveryDatetime: true },
  });
  if (!load || !load.actualDeliveryDatetime) return;

  const newExpiresAt = new Date(
    load.actualDeliveryDatetime.getTime() + POST_DELIVERY_EXPIRY_DAYS * DAY_MS,
  );

  const tokens = await prisma.shipperTrackingToken.findMany({
    where: {
      loadId,
      accessLevel: "STATUS_ONLY",
      expiresAt: { gt: new Date() },
    },
  });

  for (const t of tokens) {
    if (newExpiresAt > t.expiresAt) {
      await prisma.shipperTrackingToken.update({
        where: { id: t.id },
        data: { expiresAt: newExpiresAt },
      });
      log.info(
        {
          loadId,
          tokenPrefix: t.token.substring(0, 4),
          oldExpiresAt: t.expiresAt,
          newExpiresAt,
        },
        "[tracking-token] delivery refresh extended expiry",
      );
    }
  }
}
