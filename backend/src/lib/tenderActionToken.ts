import jwt from "jsonwebtoken";
import { env } from "../config/env";

/**
 * v3.8.als §13.3 Item 142 — magic-link tender accept/decline tokens.
 *
 * A signed, self-contained token embedded in the tender-offered email's
 * accept/decline CTA buttons so the carrier can act without logging in.
 * The token IS the authorization — it embeds the tender id + the carrier's
 * User.id, both signed with JWT_SECRET. The public endpoint at
 * GET /api/tender-action/:token verifies it, then delegates to the existing
 * acceptTender/declineTender controllers with a synthetic actor set to the
 * embedded carrierUserId (which satisfies their carrier-userId ownership
 * gate). Same JWT_SECRET + HS256 as the auth tokens; same lifecycle pattern
 * as the public /tracking token.
 */

export interface TenderActionPayload {
  tenderId: string;
  action: "accept" | "decline";
  carrierUserId: string;
}

const API_BASE = "https://api.silkroutelogistics.ai";

export function mintTenderActionToken(
  payload: TenderActionPayload,
  expiresIn: string | number = "7d",
): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn,
  } as jwt.SignOptions);
}

export function verifyTenderActionToken(token: string): TenderActionPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as Record<string, unknown>;
    const tenderId = decoded.tenderId;
    const action = decoded.action;
    const carrierUserId = decoded.carrierUserId;
    if (
      typeof tenderId !== "string" ||
      typeof carrierUserId !== "string" ||
      (action !== "accept" && action !== "decline")
    ) {
      return null;
    }
    return { tenderId, action, carrierUserId };
  } catch {
    return null;
  }
}

/** Full magic-link URL for a given action token. */
export function tenderActionUrl(token: string): string {
  return `${API_BASE}/api/tender-action/${token}`;
}
