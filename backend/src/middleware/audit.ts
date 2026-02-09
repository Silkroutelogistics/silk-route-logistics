import { Response, NextFunction } from "express";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";

export function auditLog(action: string, entity: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    // Store the original json method
    const originalJson = res.json.bind(res);
    res.json = function (data: any) {
      // Log after response is sent (non-blocking)
      if (res.statusCode >= 200 && res.statusCode < 300 && req.user) {
        prisma.auditLog
          .create({
            data: {
              userId: req.user.id,
              action,
              entity,
              entityId: req.params.id || data?.id || null,
              ipAddress: req.ip || req.headers["x-forwarded-for"]?.toString() || null,
              userAgent: req.headers["user-agent"] || null,
            },
          })
          .catch(() => {}); // Don't fail the request if audit fails
      }
      return originalJson(data);
    };
    next();
  };
}
