import rateLimit from "express-rate-limit";

/**
 * Shared upload rate limiters.
 *
 * These are mounted at ROUTE level (immediately before the multer middleware)
 * rather than as path prefixes in server.ts. That matters: `app.use("/api/x", limiter)`
 * also throttles every sibling under `/api/x`, so mounting an upload limiter on
 * `/api/carrier-loads` would cap the carrier portal's ordinary load polling at the
 * upload rate. Route-level mounting hits exactly the multipart handlers.
 *
 * Before this existed, only `/api/documents` and `/api/documents/upload` were
 * covered (server.ts). Every other multipart route — carrier compliance docs,
 * per-load documents, exception receipts, COI reads, SOP uploads — fell through
 * to the general apiLimiter at 300 requests / 15 min. With a 10 MB cap and up to
 * 10 files per request that is a large amount of unbudgeted object-storage write
 * volume per IP.
 */

/**
 * Externally-reachable upload routes (carrier portal, shipper portal, public).
 * 20 per 15 minutes — matches the limit already applied to /api/documents.
 */
export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many uploads, please try again later" },
});

/**
 * AE-internal upload routes (already behind authorize() for staff roles).
 *
 * Deliberately more generous than uploadLimiter: staff legitimately bulk-upload
 * during an onboarding push, and throttling them at 20/15min would create real
 * operational friction. 100 still bounds a runaway client or a compromised staff
 * session, which is the actual threat here.
 */
export const staffUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many uploads, please try again later" },
});
