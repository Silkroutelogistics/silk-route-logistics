import { Response, NextFunction } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "./auth";

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
    console.error("[AuditTrail] Failed to create entry:", action, entityType, entityId);
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

  // Skip auth, health, and chat routes
  const skipPaths = ["/api/auth", "/api/health", "/api/chat"];
  if (skipPaths.some((p) => req.path.startsWith(p))) {
    return next();
  }

  const startTime = Date.now();

  res.on("finish", () => {
    // Only log successful mutations (2xx status codes)
    if (res.statusCode >= 200 && res.statusCode < 300 && req.user?.id) {
      const action = methodToAction(req.method);
      const { entityType, entityId } = parseEntityFromPath(req.path);

      createAuditEntry(
        req.user.id,
        action,
        entityType,
        entityId || "unknown",
        {
          method: req.method,
          path: req.path,
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
