/**
 * Track & Trace SSE (Server-Sent Events) — Phase 3
 * Real-time event stream for the dispatch console.
 * Clients subscribe to load updates; backend broadcasts on status changes, alerts, location pings.
 */
import { Router, Response } from "express";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(authenticate);

// ── Connected SSE clients ──────────────────────────────────────────────
interface SSEClient {
  id: string;
  userId: string;
  res: Response;
  connectedAt: Date;
}

const clients: Map<string, SSEClient> = new Map();

/**
 * GET /api/track-trace/stream — SSE endpoint for real-time dispatch updates
 */
router.get(
  "/stream",
  authorize("BROKER", "ADMIN", "DISPATCH", "OPERATIONS", "CEO", "AE") as any,
  (req: AuthRequest, res: Response) => {
    const clientId = `${req.user!.id}-${Date.now()}`;

    // Set SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    });

    // Send initial connection event
    res.write(`event: connected\ndata: ${JSON.stringify({ clientId, timestamp: new Date().toISOString() })}\n\n`);

    // Register client
    clients.set(clientId, {
      id: clientId,
      userId: req.user!.id,
      res,
      connectedAt: new Date(),
    });

    // Heartbeat every 30 seconds to keep connection alive
    const heartbeat = setInterval(() => {
      try {
        res.write(`event: heartbeat\ndata: ${JSON.stringify({ t: Date.now() })}\n\n`);
      } catch {
        clearInterval(heartbeat);
        clients.delete(clientId);
      }
    }, 30000);

    // Cleanup on disconnect
    req.on("close", () => {
      clearInterval(heartbeat);
      clients.delete(clientId);
    });
  }
);

/**
 * GET /api/track-trace/stream/clients — Admin: show connected clients count
 */
router.get(
  "/stream/clients",
  authorize("ADMIN") as any,
  (_req: AuthRequest, res: Response) => {
    res.json({
      connected: clients.size,
      clients: Array.from(clients.values()).map((c) => ({
        id: c.id,
        userId: c.userId,
        connectedAt: c.connectedAt,
      })),
    });
  }
);

// ── Broadcast helpers (called from other services) ─────────────────────

export type SSEEventType =
  | "location_update"
  | "status_change"
  | "alert"
  | "geofence"
  | "check_call"
  | "eta_update"
  | "accessorial"
  | "board_refresh"
  | "waterfall_tendered"
  | "waterfall_completed"
  | "waterfall_fallback";

export interface SSEEvent {
  type: SSEEventType;
  loadId: string;
  data: Record<string, any>;
}

/**
 * Broadcast an event to all connected SSE clients.
 */
export function broadcastSSE(event: SSEEvent) {
  const payload = `event: ${event.type}\ndata: ${JSON.stringify({ loadId: event.loadId, ...event.data, timestamp: new Date().toISOString() })}\n\n`;

  const deadClients: string[] = [];
  for (const [id, client] of clients) {
    try {
      client.res.write(payload);
    } catch {
      deadClients.push(id);
    }
  }

  // Cleanup dead connections
  for (const id of deadClients) {
    clients.delete(id);
  }
}

/**
 * Broadcast to a specific user only.
 */
export function broadcastToUser(userId: string, event: SSEEvent) {
  const payload = `event: ${event.type}\ndata: ${JSON.stringify({ loadId: event.loadId, ...event.data, timestamp: new Date().toISOString() })}\n\n`;

  for (const [id, client] of clients) {
    if (client.userId === userId) {
      try {
        client.res.write(payload);
      } catch {
        clients.delete(id);
      }
    }
  }
}

export default router;
