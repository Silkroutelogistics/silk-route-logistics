import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { prisma } from "../config/database";
import { isTokenBlacklisted } from "../utils/tokenBlacklist";

export interface AuthRequest extends Request<any, any, any, any> {
  user?: {
    id: string;
    email: string;
    role: string;
    firstName?: string;
    lastName?: string;
  };
  token?: string; // Store raw token for blacklist on logout
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  // Check Authorization header first, then fall back to httpOnly cookie
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.split(" ")[1] : req.cookies?.srl_token;

  if (!token) {
    res.status(401).json({ error: "No token provided" });
    return;
  }

  try {
    // Explicit algorithm to prevent algorithm confusion attacks
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] }) as { userId: string };

    // Check if token has been revoked (logout blacklist)
    const blacklisted = await isTokenBlacklisted(token);
    if (blacklisted) {
      res.status(401).json({ error: "Token has been revoked" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, role: true, firstName: true, lastName: true, isActive: true },
    });

    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    // Check if user account is still active
    if (!user.isActive) {
      res.status(403).json({ error: "Account has been deactivated" });
      return;
    }

    req.user = user;
    req.token = token; // Store for logout blacklisting
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

export function authorize(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}
