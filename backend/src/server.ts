import express from "express";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import routes from "./routes";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

// Security middleware
app.use(helmet());
const allowedOrigins = env.CORS_ORIGIN.split(",").map((o) => o.trim());
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use("/uploads", express.static(path.resolve(env.UPLOAD_DIR)));

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API routes
app.use("/api", routes);

// Error handling
app.use(errorHandler);

app.listen(env.PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
});

export default app;
