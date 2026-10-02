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

let errorObserver: ((message: string) => void) | undefined;

/**
 * Hear every error-level line. lib/cronRun.ts is the listener: a scheduled job
 * that catches and logs its own failure must still record as FAILED.
 */
export function setErrorObserver(fn: (message: string) => void) {
  errorObserver = fn;
}

export const log = pino({
  level,
  hooks: {
    logMethod(args, method, lvl) {
      if (lvl >= 50 && errorObserver) {
        try {
          const [a, b] = args as unknown[];
          const msg = typeof a === "string" ? a : String(b ?? "");
          const cause = (a as { err?: { message?: string } } | null)?.err?.message;
          errorObserver(cause ? `${msg} ${cause}`.trim() : msg);
        } catch {
          // An observer must never cost a log line.
        }
      }
      return method.apply(this, args);
    },
  },
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
