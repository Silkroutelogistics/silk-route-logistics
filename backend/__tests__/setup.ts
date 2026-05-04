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
      count: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    auditTrail: {
      create: vi.fn(),
    },
    load: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    shipment: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      aggregate: vi.fn(),
    },
    invoice: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    },
    loadTender: {
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    carrierProfile: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    customer: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    notification: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    cronRegistry: {
      findMany: vi.fn(),
    },
    errorLog: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    invoiceLineItem: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    checkCall: {
      updateMany: vi.fn(),
    },
    message: {
      findMany: vi.fn(),
    },
    document: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    eDITransaction: {
      create: vi.fn(),
    },
    brokerIntegration: {
      findMany: vi.fn(),
    },
    riskLog: {
      findMany: vi.fn(),
    },
    systemLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    tokenBlacklist: {
      upsert: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
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
    DAT_API_KEY: "",
    DAT_API_SECRET: "",
    DAT_API_URL: "",
    HIGHWAY_API_KEY: "",
    FMCSA_API_KEY: "",
  },
}));
