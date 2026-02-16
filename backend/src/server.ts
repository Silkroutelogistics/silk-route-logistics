import "express-async-errors";
import express from "express";
import path from "path";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import hpp from "hpp";
import { env } from "./config/env";
import { prisma } from "./config/database";
import routes from "./routes";
import { errorHandler } from "./middleware/errorHandler";
import { securityHeaders, sanitizeInput } from "./middleware/security";
import { auditMiddleware } from "./middleware/auditTrail";
import { startSchedulers } from "./services/schedulerService";
import { initCronJobs } from "./cron";
import { seedCronRegistry } from "./services/cronRegistryService";

const app = express();
const BUILD_VERSION = Date.now().toString();

// Trust proxy (Render uses reverse proxy)
app.set("trust proxy", 1);

// ─── Security Middleware (order matters) ────────────────────

// 1. Helmet with strict CSP
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https://api.silkroutelogistics.ai", "http://localhost:4000"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  })
);

// 2. Additional security headers
app.use(securityHeaders);

// 3. CORS locked to specific origins
const allowedOrigins = [
  "https://silkroutelogistics.ai",
  "https://www.silkroutelogistics.ai",
  "https://silk-route-logistics.pages.dev",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:4000",
];
// Merge any extra origins from env (for staging/preview deploys)
if (env.CORS_ORIGIN) {
  for (const origin of env.CORS_ORIGIN.split(",").map((o) => o.trim())) {
    if (origin && !allowedOrigins.includes(origin)) {
      allowedOrigins.push(origin);
    }
  }
}
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, health checks)
    if (!origin) return callback(null, true);
    // Exact match, *.pages.dev previews, or *.silkroutelogistics.ai subdomains
    if (allowedOrigins.includes(origin) || /\.pages\.dev$/.test(origin) || /\.silkroutelogistics\.ai$/.test(origin)) {
      return callback(null, true);
    }
    // Deny without throwing (avoids 500 errors)
    callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  exposedHeaders: ["Content-Disposition"],
  maxAge: 86400,
};

// Explicit preflight handler — MUST be before cors middleware
app.options("*", (req, res) => {
  const origin = req.headers.origin;
  if (origin && (allowedOrigins.includes(origin) || /\.pages\.dev$/.test(origin) || /\.silkroutelogistics\.ai$/.test(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Requested-With");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
  res.sendStatus(204);
});

// CORS middleware for all other requests
app.use(cors(corsOptions));

// 4. Global rate limiter: 300 requests per 15 min on /api/
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

// 5. Strict auth rate limiter: 30 requests per 15 min on /api/auth/
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts, please try again later" },
});

// 6. HPP — prevent HTTP parameter pollution
app.use(hpp());

// 7. Body parsing with size limits to prevent payload attacks
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// 8. Cookie parser (for httpOnly JWT cookies)
app.use(cookieParser());

// 9. Input sanitization (trim + escape all string fields)
app.use(sanitizeInput);

// ─── Static Files ───────────────────────────────────────────
app.use("/uploads", express.static(path.resolve(env.UPLOAD_DIR)));

// ─── Build Version (force logout on deploy) ─────────────────
app.get("/api/build-version", (_req, res) => {
  res.json({ version: BUILD_VERSION });
});

// ─── Health Check (outside rate limiter) ────────────────────
app.get("/health", async (_req, res) => {
  let dbOk = false;
  let dbLatency = 0;
  try {
    const s = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatency = Date.now() - s;
    dbOk = true;
  } catch { /* db down */ }

  const mem = process.memoryUsage();
  res.json({
    status: dbOk ? "ok" : "degraded",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    environment: env.NODE_ENV,
    database: { connected: dbOk, latencyMs: dbLatency },
    memory: {
      rss: `${(mem.rss / 1024 / 1024).toFixed(1)} MB`,
      heapUsed: `${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB`,
    },
  });
});

// ─── Apply Rate Limiters ────────────────────────────────────
app.use("/api/auth", authLimiter);
app.use("/api", apiLimiter);

// ─── Audit Trail Middleware ─────────────────────────────────
app.use(auditMiddleware as any);

// ─── API Routes ─────────────────────────────────────────────
app.use("/api", routes);

// ─── Global Error Handler ───────────────────────────────────
app.use(errorHandler);

// ─── Start Server ───────────────────────────────────────────
app.listen(env.PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
  startSchedulers();
  initCronJobs();
  seedCronRegistry().catch((e) => console.error("[CronRegistry] Seed error:", e.message));
});

export default app;
