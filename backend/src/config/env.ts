import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string(),
  JWT_EXPIRES_IN: z.string().default("24h"),
  CORS_ORIGIN: z.string().default("http://localhost:3000,https://silkroutelogistics.ai,https://www.silkroutelogistics.ai,https://silk-route-logistics.pages.dev"),
  MAX_FILE_SIZE: z.coerce.number().default(10485760),
  UPLOAD_DIR: z.string().default("./uploads"),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("noreply@silkroutelogistics.ai"),
  FMCSA_WEB_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ENCRYPTION_KEY: z.string().optional(),
  OPENPHONE_WEBHOOK_SECRET: z.string().optional(),
  DAT_API_KEY: z.string().optional(),
  DAT_API_SECRET: z.string().optional(),
  DAT_API_URL: z.string().optional().default("https://freight.dat.com/api/v2"),
  MILEAGE_PROVIDER: z.enum(["google", "milemaker", "pcmiler"]).default("google"),
  MILEMAKER_CLIENT_ID: z.string().optional(),
  MILEMAKER_CLIENT_SECRET: z.string().optional(),
  PCMILER_API_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);
