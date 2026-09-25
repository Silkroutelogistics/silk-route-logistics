import { Response, NextFunction } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "./auth";
import { log } from "../lib/logger";

/**
 * Creates an audit trail entry for significant actions.
 * Call this from controllers after successful mutations.
 */
export async function createAuditEntry(
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  details?: Record<string, unknown>,
  ipAddress?: string
) {
  try {
    await prisma.auditTrail.create({
      data: {
        performedById: userId,
        action: action as any,
        entityType,
        entityId,
        changedFields: details ? (details as any) : undefined,
        ipAddress: ipAddress || null,
      },
    });
  } catch {
    // Non-blocking — don't fail the request if audit logging fails
    log.error({ action, entityType, entityId }, "[AuditTrail] Failed to create entry");
  }
}

/**
 * Express middleware that auto-logs write operations (POST, PUT, PATCH, DELETE).
 * Attaches to res.on('finish') to capture after the response completes.
 */
export function auditMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  // Only audit write operations
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    return next();
  }

  // THE PATH IS CAPTURED HERE, ONCE, AND IT IS NOT `req.path`.
  //
  // This middleware is mounted app-level (server.ts, `app.use(auditMiddleware)`),
  // so at THIS moment `req.path` is the absolute `/api/loads/<id>/status`. The
  // row, though, is written from `res.on("finish")` — and by then Express has
  // descended into the mounted routers and rewritten `req.url` to the innermost
  // mount-relative form, `/<id>/status`. Reading `req.path` there handed
  // parseEntityFromPath a path whose FIRST segment is the `:id`, so it wrote the
  // id into entityType (uppercased) and the action word into entityId.
  //
  // That is not a stray handful of rows. Measured read-only against production on
  // 2026-09-25: 3,408 of 3,799 audit_trails rows — 90% of the table — carry an
  // uppercased id in entityType, spanning 2026-02-19 to that same day. The
  // `entityId = 'status'` subset is 63 of them; the dominant shape is
  // `entityId = 'unknown'` (3,355), which is what `entityId || "unknown"` yields
  // when the mount-relative path has a single segment (`PATCH /api/customers/<id>`
  // → `/<id>`).
  //
  // WHY THE SKIP LIST STILL WORKED — which is both what made this survivable and
  // what hid it. `skipPaths` is tested HERE, before routing, where `req.path` is
  // still absolute, so `/api/auth` genuinely was skipped; §13.3 Item 273.10's
  // observation that no AE-auth rows exist is consistent with this rather than in
  // tension with it. Of the two readers, only the parse ran after the rewrite. One
  // value now serves both, so a later edit cannot reintroduce the split.
  //
  // `req.originalUrl` rather than a saved copy of `req.path`: Express sets it once
  // and never rewrites it, so it is immune to mounting BY CONSTRUCTION rather than
  // by being read early enough. The query string is dropped because an audit row
  // records which entity was touched, not with what filters.
  const auditPath = req.originalUrl.split("?")[0];

  // Skip auth, health, and chat routes
  const skipPaths = ["/api/auth", "/api/health", "/api/chat"];
  if (skipPaths.some((p) => auditPath.startsWith(p))) {
    return next();
  }

  const startTime = Date.now();

  res.on("finish", () => {
    // Only log successful mutations (2xx status codes)
    if (res.statusCode >= 200 && res.statusCode < 300 && req.user?.id) {
      const action = methodToAction(req.method);
      const { entityType, entityId } = parseEntityFromPath(auditPath);

      createAuditEntry(
        req.user.id,
        action,
        entityType,
        entityId || "unknown",
        {
          method: req.method,
          path: auditPath,
          statusCode: res.statusCode,
          duration: Date.now() - startTime,
        },
        req.ip
      );
    }
  });

  next();
}

function methodToAction(method: string): string {
  switch (method) {
    case "POST": return "CREATE";
    case "PUT": return "UPDATE";
    case "PATCH": return "UPDATE";
    case "DELETE": return "DELETE";
    default: return "OTHER";
  }
}

function parseEntityFromPath(path: string): { entityType: string; entityId: string } {
  // Parse /api/loads/abc123 → { entityType: "LOAD", entityId: "abc123" }
  const parts = path.replace(/^\/api\//, "").split("/").filter(Boolean);
  const entityType = (parts[0] || "unknown").toUpperCase().replace(/-/g, "_");
  const entityId = parts[1] || "";
  return { entityType, entityId };
}
