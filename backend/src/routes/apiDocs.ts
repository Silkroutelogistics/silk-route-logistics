/**
 * API Documentation — auto-generated route catalog.
 *
 * GET /api/docs — returns JSON describing all API endpoints.
 * No Swagger dependency — lightweight, hand-curated documentation
 * that stays in sync because it's defined next to the routes.
 */

import { Router } from "express";

const router = Router();

interface EndpointDoc {
  method: string;
  path: string;
  description: string;
  auth: string;
  body?: Record<string, string>;
}

const endpoints: EndpointDoc[] = [
  // ─── Auth ─────────────────────────────────────────
  { method: "POST", path: "/api/auth/login", description: "Login with email + password → returns pendingOtp", auth: "none" },
  { method: "POST", path: "/api/auth/verify-otp", description: "Verify OTP code → returns JWT + user", auth: "none" },
  { method: "POST", path: "/api/auth/logout", description: "Logout + blacklist token", auth: "JWT" },
  { method: "POST", path: "/api/auth/change-password", description: "Change password (requires current)", auth: "JWT" },
  { method: "GET", path: "/api/auth/me", description: "Get current user profile", auth: "JWT" },

  // ─── Loads ────────────────────────────────────────
  { method: "GET", path: "/api/loads", description: "List loads (paginated, filterable by status)", auth: "JWT (BROKER, ADMIN, CEO, DISPATCH, OPERATIONS)" },
  { method: "POST", path: "/api/loads", description: "Create a new load", auth: "JWT (BROKER, ADMIN, CEO)", body: { originCity: "string", originState: "string (2-letter)", destCity: "string", destState: "string", equipmentType: "string", rate: "number", pickupDate: "ISO date" } },
  { method: "GET", path: "/api/loads/:id", description: "Get load details", auth: "JWT" },
  { method: "PUT", path: "/api/loads/:id", description: "Update load", auth: "JWT (BROKER, ADMIN, CEO)" },
  { method: "DELETE", path: "/api/loads/:id", description: "Soft-delete load", auth: "JWT (ADMIN, CEO)" },

  // ─── Tenders ──────────────────────────────────────
  { method: "POST", path: "/api/loads/:id/tender", description: "Create tender for a load", auth: "JWT (BROKER, ADMIN, CEO)", body: { carrierId: "string", offeredRate: "number" } },
  { method: "GET", path: "/api/loads/:id/tenders", description: "List tenders for a load", auth: "JWT (BROKER, ADMIN, CEO, DISPATCH, OPERATIONS)" },
  { method: "POST", path: "/api/tenders/:id/accept", description: "Carrier accepts tender", auth: "JWT (CARRIER)" },
  { method: "POST", path: "/api/tenders/:id/counter", description: "Carrier counter-offers", auth: "JWT (CARRIER)", body: { counterRate: "number" } },
  { method: "POST", path: "/api/tenders/:id/decline", description: "Carrier declines tender", auth: "JWT (CARRIER)" },
  { method: "POST", path: "/api/loads/:id/waterfall", description: "Launch waterfall tender campaign", auth: "JWT (BROKER, ADMIN, CEO, DISPATCH)", body: { candidates: "WaterfallCandidate[]", expirationMinutes: "number (15-1440)" } },

  // ─── Carriers ─────────────────────────────────────
  { method: "GET", path: "/api/carriers", description: "List all carriers (paginated)", auth: "JWT (ADMIN, CEO, BROKER)" },
  { method: "GET", path: "/api/carrier-match/:loadId", description: "Smart-match carriers for a load", auth: "JWT (BROKER, ADMIN, CEO, DISPATCH, OPERATIONS, AE)" },
  { method: "GET", path: "/api/carrier/tenders", description: "Carrier's tender inbox", auth: "JWT (CARRIER)" },

  // ─── Invoices ─────────────────────────────────────
  { method: "GET", path: "/api/invoices", description: "List invoices (paginated, filterable)", auth: "JWT" },
  { method: "POST", path: "/api/invoices", description: "Create invoice for a load", auth: "JWT (BROKER, ADMIN, CEO)", body: { loadId: "string", amount: "number" } },
  { method: "GET", path: "/api/invoices/:id", description: "Get invoice details", auth: "JWT" },

  // ─── Shipper Portal ───────────────────────────────
  { method: "GET", path: "/api/shipper-portal/dashboard", description: "Shipper dashboard KPIs", auth: "JWT (SHIPPER)" },
  { method: "GET", path: "/api/shipper-portal/shipments", description: "Shipper's shipments list", auth: "JWT (SHIPPER)" },
  { method: "GET", path: "/api/shipper-portal/tracking", description: "Live shipment tracking", auth: "JWT (SHIPPER)" },
  { method: "GET", path: "/api/shipper-portal/tracking/history", description: "Completed shipment history", auth: "JWT (SHIPPER)" },
  { method: "POST", path: "/api/shipper-portal/tracking/:loadId/share", description: "Generate shareable tracking link", auth: "JWT (SHIPPER)" },
  { method: "GET", path: "/api/shipper-portal/invoices", description: "Shipper's invoices", auth: "JWT (SHIPPER)" },
  { method: "GET", path: "/api/shipper-portal/analytics", description: "Shipper analytics (spend, OTD, lanes)", auth: "JWT (SHIPPER)" },
  { method: "POST", path: "/api/shipper-portal/instant-quote", description: "Get instant freight quote", auth: "JWT (SHIPPER)", body: { originCity: "string", originState: "string", destCity: "string", destState: "string", equipmentType: "string" } },

  // ─── Tracking ─────────────────────────────────────
  { method: "GET", path: "/api/tracking/:token", description: "Public tracking by token (no auth)", auth: "none" },
  { method: "POST", path: "/api/load-tracking/:loadId/status", description: "Update load status with location", auth: "JWT (BROKER, ADMIN, DISPATCH, OPERATIONS, CEO)" },

  // ─── Webhook Subscriptions ────────────────────────
  { method: "GET", path: "/api/webhook-subscriptions", description: "List webhook endpoints", auth: "JWT (ADMIN, CEO, BROKER)" },
  { method: "POST", path: "/api/webhook-subscriptions", description: "Create webhook endpoint", auth: "JWT (ADMIN, CEO)", body: { name: "string", url: "https URL", events: "string[]" } },
  { method: "DELETE", path: "/api/webhook-subscriptions/:id", description: "Delete webhook endpoint", auth: "JWT (ADMIN, CEO)" },

  // ─── System ───────────────────────────────────────
  { method: "GET", path: "/health", description: "Health check (uptime, DB, memory)", auth: "none" },
  { method: "GET", path: "/api/build-version", description: "Current build version", auth: "none" },
  { method: "GET", path: "/api/features", description: "Feature flags status", auth: "none" },
  { method: "GET", path: "/api/plugins", description: "Plugin registry status", auth: "none" },
];

router.get("/", (_req, res) => {
  res.json({
    title: "Silk Route Logistics API",
    version: "3.2",
    totalEndpoints: endpoints.length,
    endpoints,
  });
});

export default router;
