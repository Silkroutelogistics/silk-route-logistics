import "express-async-errors";
import express from "express";
import path from "path";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import hpp from "hpp";
import { env } from "./config/env";
import routes from "./routes";
import { errorHandler } from "./middleware/errorHandler";
import { securityHeaders, sanitizeInput } from "./middleware/security";
import { auditMiddleware } from "./middleware/auditTrail";
import { startSchedulers } from "./services/schedulerService";
import { initCronJobs } from "./cron";

const app = express();

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
        connectSrc: ["'self'"],
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
  "http://localhost:3000",
];
// Merge any extra origins from env (for staging/preview deploys)
if (env.CORS_ORIGIN) {
  for (const origin of env.CORS_ORIGIN.split(",").map((o) => o.trim())) {
    if (origin && !allowedOrigins.includes(origin)) {
      allowedOrigins.push(origin);
    }
  }
}
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, health checks)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  })
);

// 4. Global rate limiter: 100 requests per 15 min on /api/
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

// 5. Strict auth rate limiter: 10 requests per 15 min on /api/auth/
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
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

// ─── Health Check (outside rate limiter) ────────────────────
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: "1.0.0",
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
});

export default app;
