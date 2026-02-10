import { vi } from "vitest";

// Mock Prisma client
vi.mock("../src/config/database", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    otpCode: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    load: {
      findMany: vi.fn(),
    },
    shipment: {
      findMany: vi.fn(),
    },
    invoice: {
      findMany: vi.fn(),
    },
  },
}));

// Mock env config
vi.mock("../src/config/env", () => ({
  env: {
    PORT: 4000,
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://test",
    JWT_SECRET: "test-secret-key-for-vitest",
    JWT_EXPIRES_IN: "7d",
    CORS_ORIGIN: "http://localhost:3000",
    MAX_FILE_SIZE: 10485760,
    UPLOAD_DIR: "./uploads",
    GEMINI_API_KEY: "test-gemini-key",
    RESEND_API_KEY: "",
    EMAIL_FROM: "noreply@test.com",
  },
}));
