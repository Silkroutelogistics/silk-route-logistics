import express from "express";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import routes from "./routes";
import { errorHandler } from "./middleware/errorHandler";
import { auditMiddleware } from "./middleware/auditTrail";
import { startSchedulers } from "./services/schedulerService";
import { initCronJobs } from "./cron";

const app = express();

// Trust proxy (Render uses reverse proxy)
app.set("trust proxy", 1);

// Security middleware
app.use(helmet());
const allowedOrigins = env.CORS_ORIGIN.split(",").map((o) => o.trim());
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use("/uploads", express.static(path.resolve(env.UPLOAD_DIR)));

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: "1.0.0",
    email: {
      provider: "resend",
      configured: !!env.RESEND_API_KEY,
      from: env.EMAIL_FROM,
    },
  });
});

// Audit trail middleware for write operations
app.use(auditMiddleware as any);

// API routes
app.use("/api", routes);

// Error handling
app.use(errorHandler);

app.listen(env.PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
  startSchedulers();
  initCronJobs();
});

export default app;
