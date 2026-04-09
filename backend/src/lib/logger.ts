/**
 * Structured Logger — JSON-based logging via Pino.
 *
 * Replaces console.log with queryable, structured output.
 * Usage:
 *   import { log } from "../lib/logger";
 *   log.info({ loadId, carrierId }, "Load assigned to carrier");
 *   log.error({ err, loadId }, "Failed to create tender");
 */

import pino from "pino";

const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug");

export const log = pino({
  level,
  ...(process.env.NODE_ENV !== "production" && {
    transport: {
      target: "pino/file",
      options: { destination: 1 }, // stdout
    },
    formatters: {
      level: (label: string) => ({ level: label }),
    },
  }),
  base: {
    service: "srl-api",
    env: process.env.NODE_ENV || "development",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ["password", "token", "secret", "authorization", "cookie", "*.password", "*.token"],
    censor: "[REDACTED]",
  },
});

/** Create a child logger with context (e.g., per-request, per-service) */
export function childLogger(context: Record<string, unknown>) {
  return log.child(context);
}
