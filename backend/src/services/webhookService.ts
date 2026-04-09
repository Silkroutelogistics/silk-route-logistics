/**
 * Webhook Service — fires outbound webhooks on SRL events.
 *
 * Events: LOAD_POSTED, LOAD_BOOKED, LOAD_DISPATCHED, LOAD_DELIVERED,
 *         TENDER_ACCEPTED, TENDER_DECLINED, INVOICE_APPROVED, CARRIER_VETTED
 *
 * Security: HMAC-SHA256 signature in X-SRL-Signature header.
 * Safety: SSRF prevention via isUrlSafe() before every outbound request.
 */

import crypto from "crypto";
import { prisma } from "../config/database";
import { isUrlSafe } from "../lib/urlSafety";
import { isFeatureEnabled } from "../config/features";
import { log } from "../lib/logger";

export type WebhookEvent =
  | "LOAD_POSTED"
  | "LOAD_BOOKED"
  | "LOAD_DISPATCHED"
  | "LOAD_DELIVERED"
  | "TENDER_ACCEPTED"
  | "TENDER_DECLINED"
  | "INVOICE_APPROVED"
  | "CARRIER_VETTED";

interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: Record<string, any>;
}

/** Sign a payload with HMAC-SHA256 */
function sign(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Fire webhooks for a given event. Runs async (fire-and-forget).
 * Automatically disables endpoints after 10 consecutive failures.
 */
export async function fireWebhooks(event: WebhookEvent, data: Record<string, any>) {
  if (!isFeatureEnabled("webhookEvents")) return;

  const endpoints = await prisma.webhookEndpoint.findMany({
    where: {
      isEnabled: true,
      deletedAt: null,
      events: { has: event },
    },
  });

  if (endpoints.length === 0) return;

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };
  const body = JSON.stringify(payload);

  const results = endpoints.map(async (ep) => {
    // SSRF check
    const urlCheck = await isUrlSafe(ep.url);
    if (!urlCheck.safe) {
      log.warn(`[Webhook] SSRF blocked for ${ep.name}: ${urlCheck.reason}`);
      return;
    }

    const signature = sign(body, ep.secret);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-SRL-Signature": signature,
      "X-SRL-Event": event,
      ...(ep.headers as Record<string, string> || {}),
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(ep.url, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      await prisma.webhookEndpoint.update({
        where: { id: ep.id },
        data: {
          lastFiredAt: new Date(),
          lastStatus: response.status,
          failCount: response.ok ? 0 : ep.failCount + 1,
          isEnabled: ep.failCount + 1 >= 10 && !response.ok ? false : undefined,
        },
      });

      if (!response.ok) {
        log.warn(`[Webhook] ${ep.name} returned ${response.status} for ${event}`);
      }
    } catch (err: any) {
      const newFailCount = ep.failCount + 1;
      await prisma.webhookEndpoint.update({
        where: { id: ep.id },
        data: {
          lastFiredAt: new Date(),
          failCount: newFailCount,
          isEnabled: newFailCount >= 10 ? false : undefined,
        },
      });
      log.error(`[Webhook] ${ep.name} failed for ${event}: ${err.message}`);
    }
  });

  // Fire-and-forget — don't block the caller
  Promise.allSettled(results);
}
