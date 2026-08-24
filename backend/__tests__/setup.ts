import { vi } from "vitest";

// Mock Prisma client
vi.mock("../src/config/database", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
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
      updateMany: vi.fn(),
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
      count: vi.fn(),
    },
    // Quick Pay Agreement §3 condition 2 — "this Quick Pay Agreement is
    // signed". Every path that can deduct a Quick Pay fee queries this model,
    // so a test of any of those paths needs it here or the call throws.
    carrierAgreement: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    // B4 — the waterfall now reads the routing guide when scoring. A missing
    // mock here does not fail loudly; it throws "findFirst is not a function"
    // deep inside scoring, which reads like a scoring bug rather than a fixture
    // gap.
    routingGuide: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    routingGuideEntry: {
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    customer: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    settlement: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    carrierPay: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      // Real Prisma has findUnique and production reads settlements by id on
      // three paths (accountingController.updatePayment / submitPayment,
      // carrierPayController.getCarrierPayById, the carrier-portal routes). The
      // mock did not, so a test exercising any of them died on
      // "Cannot read properties of undefined" rather than on its assertion.
      // Same class as the v3.8.alh findFirst gap: mirror the client, never
      // alias one method to another, or the divergence hides.
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      aggregate: vi.fn(),
      count: vi.fn(),
    },
    trainingCourse: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    driver: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
    },
    driverCourseProgress: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    carrierTrainingRequirement: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn(),
      upsert: vi.fn(),
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
      count: vi.fn(),
    },
    // v3.8.asb — the APPROVED accessorial ledger is now the money input for
    // BOTH the carrier settlement and the customer invoice, so every test that
    // touches either path queries this model. Absent here, the call throws.
    loadAccessorial: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    approvalQueue: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    factoringFund: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    rateConfirmation: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    quickPayEnrollment: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    checkCall: {
      updateMany: vi.fn(),
    },
    message: {
      findMany: vi.fn(),
    },
    document: {
      findMany: vi.fn(),
      // documentationReceivedAt reads the POD through this to start the
      // payment clock, so any settlement-timing test needs it present.
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
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
    staffSession: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
    },
    authEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
    systemLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    emailLog: {
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
