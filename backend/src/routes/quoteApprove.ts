/**
 * v3.8.akn §13.3 Item 180.4 — Customer-facing quote approve magic-link.
 *
 * Public (NO auth middleware) endpoint that customers hit when they
 * click the magic-link button in the quote email. The signed JWT token
 * IS the auth — only someone with access to the customer's inbox can
 * possess a valid token, and the token expires 7 days after issue so
 * stale links can't be replayed indefinitely.
 *
 * Pattern mirrors:
 *   * v3.8.aje email-verification token (carrier registration flow)
 *   * v3.7.k tracking-link token (public BOL tracking page)
 *   * §13.3 Item 142 banked magic-link tender accept (not yet shipped)
 *
 * Idempotent: a customer who clicks the link twice (or who already
 * approved via the AE Console's mark-approved button) gets a success
 * response either way. Backend never destroys state on re-click.
 *
 * Mounted at /api/quote-approve in routes/index.ts. NO authenticate
 * middleware applied — explicitly public-by-design.
 */

import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../config/database";
import { env } from "../config/env";
import { log } from "../lib/logger";
import { logCustomerActivity } from "../services/customerActivityService";
import { DOMAIN } from "../config/authority";

const router = Router();

interface QuoteApprovalPayload {
  orderId: string;
  action: "quote_approve";
}

/**
 * Sign a 7-day JWT carrying the order ID + action discriminator. Called
 * by orders.ts buildQuoteEmail when constructing the magic-link URL in
 * the email body.
 */
export function signQuoteApprovalToken(orderId: string): string {
  const payload: QuoteApprovalPayload = { orderId, action: "quote_approve" };
  return jwt.sign(payload, env.JWT_SECRET, { algorithm: "HS256", expiresIn: "7d" });
}

/**
 * Build the public approval URL embedded in quote emails. Frontend
 * static page at /quote/approve/[token] reads the token from URL +
 * POSTs to this endpoint.
 */
export function buildQuoteApprovalUrl(orderId: string): string {
  const token = signQuoteApprovalToken(orderId);
  // Canonical domain from authority module (v3.8.akg). Same hardcoded
  // pattern as carrierController.ts:311 verify-email + cron/index.ts:672
  // carrier portal URL + srl-chrome.ts:21 BOL tracking URL.
  return `https://${DOMAIN}/quote/approve/${encodeURIComponent(token)}`;
}

// POST /api/quote-approve — verify token + mark order approved. Public.
router.post("/", async (req: Request, res: Response) => {
  try {
    const { token } = (req.body ?? {}) as { token?: string };
    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "Missing approval token" });
    }

    // Verify + decode. JWT library throws TokenExpiredError or
    // JsonWebTokenError on bad input; map to a friendly 401 either way
    // so the public page can render the right user-facing message.
    let payload: QuoteApprovalPayload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET) as QuoteApprovalPayload;
    } catch (err: any) {
      const expired = err?.name === "TokenExpiredError";
      return res.status(401).json({
        error: expired
          ? "This approval link has expired (7-day limit). Contact your AE for a new quote."
          : "Invalid approval link.",
        code: expired ? "TOKEN_EXPIRED" : "TOKEN_INVALID",
      });
    }

    if (payload.action !== "quote_approve") {
      return res.status(401).json({ error: "Invalid approval link.", code: "TOKEN_INVALID" });
    }

    // Look up the order. 404 if it was deleted/cancelled after the
    // token was issued (e.g. AE cancelled the order before the customer
    // got around to clicking the link).
    const order = await prisma.order.findUnique({
      where: { id: payload.orderId },
      include: { customer: { select: { id: true, name: true } } },
    });
    if (!order) {
      return res.status(404).json({ error: "Order not found. It may have been cancelled.", code: "ORDER_NOT_FOUND" });
    }

    // Idempotent return: if already approved, just echo current state.
    if (order.status === "quote_approved" || order.quoteApprovedAt) {
      return res.json({
        success: true,
        alreadyApproved: true,
        orderNumber: order.orderNumber,
        customerName: order.customer?.name ?? null,
        approvedAt: order.quoteApprovedAt,
      });
    }

    const now = new Date();
    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { status: "quote_approved", quoteApprovedAt: now },
    });

    // Audit trail — same shape as the AE-side approve-quote handler
    // emits, but with actorType=SHIPPER so the activity log
    // distinguishes self-service approvals from AE-confirmed ones.
    // (ActorType enum at services/customerActivityService.ts:5 has
    // "SHIPPER" as the closest semantic — customers in this codebase
    // ARE shippers per Customer.type schema default. metadata.source
    // = "magic_link" provides finer discrimination if needed.)
    if (order.customerId) {
      await logCustomerActivity({
        customerId: order.customerId,
        eventType: "quote_approved",
        description: `Quote ${order.orderNumber} approved via magic link`,
        actorType: "SHIPPER",
        actorName: order.customer?.name ?? "Customer",
        metadata: { orderId: order.id, source: "magic_link" },
      });
    }

    res.json({
      success: true,
      alreadyApproved: false,
      orderNumber: updated.orderNumber,
      customerName: order.customer?.name ?? null,
      approvedAt: updated.quoteApprovedAt,
    });
  } catch (err) {
    log.error({ err }, "[QuoteApprove] error");
    res.status(500).json({ error: "Server error. Please contact your AE." });
  }
});

export default router;
