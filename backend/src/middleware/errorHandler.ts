import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

const isProduction = process.env.NODE_ENV === "production";

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  // Log the full error server-side (always)
  if (isProduction) {
    console.error(`[ERROR] ${err.message}`);
  } else {
    console.error(err);
  }

  // Validation errors — safe to return details
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation error",
      details: err.errors.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      })),
    });
    return;
  }

  // CORS errors
  if (err.message === "Not allowed by CORS") {
    res.status(403).json({ error: "Origin not allowed" });
    return;
  }

  // Payload too large (body-parser limit exceeded)
  if ((err as any).type === "entity.too.large") {
    res.status(413).json({ error: "Request payload too large" });
    return;
  }

  // JSON parse errors
  if ((err as any).type === "entity.parse.failed") {
    res.status(400).json({ error: "Invalid JSON in request body" });
    return;
  }

  // Multer file upload errors
  if (err.message?.includes("Only PDF, JPEG, and PNG files are allowed")) {
    res.status(400).json({ error: err.message });
    return;
  }

  // Default: generic message in production, detailed in development
  const status = (err as any).status || (err as any).statusCode || 500;
  res.status(status).json({
    error: isProduction ? "Internal server error" : err.message,
    ...(isProduction ? {} : { stack: err.stack }),
  });
}
