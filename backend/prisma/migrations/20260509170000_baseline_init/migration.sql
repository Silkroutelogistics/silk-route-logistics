-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."AccessorialStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."AccessorialType" AS ENUM ('DETENTION_PU', 'DETENTION_DEL', 'LUMPER', 'TONU', 'LAYOVER', 'DEADHEAD', 'DRIVER_ASSIST', 'REEFER_FUEL', 'HAZMAT', 'INSIDE_DELIVERY', 'LIFTGATE', 'PALLET_EXCHANGE');

-- CreateEnum
CREATE TYPE "public"."AgreementStatus" AS ENUM ('DRAFT', 'SENT', 'SIGNED', 'EXPIRED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "public"."AlertLevel" AS ENUM ('GREEN', 'YELLOW', 'RED', 'CRITICAL');

-- CreateEnum
CREATE TYPE "public"."ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'ESCALATED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."ApprovalType" AS ENUM ('CARRIER_PAYMENT', 'INVOICE_VOID', 'CREDIT_OVERRIDE', 'FUND_ADJUSTMENT', 'BULK_PAYMENT');

-- CreateEnum
CREATE TYPE "public"."AssetStatus" AS ENUM ('ACTIVE', 'IN_SHOP', 'OUT_OF_SERVICE', 'SOLD', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "public"."AssignmentType" AS ENUM ('COMPANY_DRIVER', 'PARTNER_CARRIER');

-- CreateEnum
CREATE TYPE "public"."AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'APPROVE', 'REJECT', 'LOGIN', 'EXPORT', 'COMPLIANCE_OVERRIDE', 'CARRIER_SUSPENDED', 'SCAN', 'DISMISS', 'RESOLVE');

-- CreateEnum
CREATE TYPE "public"."BonusStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID');

-- CreateEnum
CREATE TYPE "public"."BonusType" AS ENUM ('PERFORMANCE', 'REFERRAL', 'VOLUME', 'TIER');

-- CreateEnum
CREATE TYPE "public"."CarrierApplicationStatus" AS ENUM ('NEW', 'REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "public"."CarrierMilestone" AS ENUM ('M1_FIRST_LOAD', 'M2_PROVEN', 'M3_RELIABLE', 'M4_PARTNER', 'M5_CORE', 'M6_FOUNDING');

-- CreateEnum
CREATE TYPE "public"."CarrierPayStatus" AS ENUM ('PENDING', 'SCHEDULED', 'PROCESSING', 'PAID', 'VOID', 'PREPARED', 'SUBMITTED', 'APPROVED', 'DISPUTED', 'ON_HOLD', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."CarrierPaymentMethod" AS ENUM ('QUICK_PAY', 'STANDARD', 'FACTORING');

-- CreateEnum
CREATE TYPE "public"."CarrierTier" AS ENUM ('SILVER', 'GOLD', 'PLATINUM', 'GUEST', 'NONE');

-- CreateEnum
CREATE TYPE "public"."ChameleonMatchStatus" AS ENUM ('OPEN', 'REVIEWED', 'DISMISSED', 'CONFIRMED_FRAUD');

-- CreateEnum
CREATE TYPE "public"."ChameleonMatchType" AS ENUM ('PHONE', 'EMAIL', 'ADDRESS', 'EIN', 'MULTI', 'IP', 'DOT');

-- CreateEnum
CREATE TYPE "public"."ChameleonRiskLevel" AS ENUM ('NONE', 'LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "public"."CheckCallDriverStatus" AS ENUM ('ON_SCHEDULE', 'DELAYED_WEATHER', 'DELAYED_MECHANICAL', 'DELAYED_SHIPPER', 'DELAYED_RECEIVER', 'STOPPED_REST', 'AT_PICKUP', 'AT_DELIVERY', 'LOADED', 'EMPTY', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."ClaimStatus" AS ENUM ('FILED', 'UNDER_REVIEW', 'INVESTIGATING', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "public"."ClaimType" AS ENUM ('DAMAGE', 'SHORTAGE', 'LATE', 'NO_SHOW', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."ContactSalesRole" AS ENUM ('DECISION_MAKER', 'CHAMPION', 'GATEKEEPER', 'TECHNICAL', 'BILLING', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."ContractRateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "public"."CreditGrade" AS ENUM ('A', 'B', 'C', 'D');

-- CreateEnum
CREATE TYPE "public"."CreditStatus" AS ENUM ('NOT_CHECKED', 'APPROVED', 'CONDITIONAL', 'DENIED', 'PENDING_REVIEW');

-- CreateEnum
CREATE TYPE "public"."CustomerType" AS ENUM ('SHIPPER', 'CONSIGNEE', 'BOTH');

-- CreateEnum
CREATE TYPE "public"."DelayReasonCode" AS ENUM ('WEATHER', 'TRAFFIC', 'MECHANICAL', 'SHIPPER_DELAY', 'RECEIVER_DELAY', 'DRIVER_HOS', 'CUSTOMS', 'DETENTION', 'ACCIDENT', 'ROAD_CLOSURE', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."DisputeStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'PROPOSED', 'APPROVED', 'DENIED', 'CLOSED');

-- CreateEnum
CREATE TYPE "public"."DisputeType" AS ENUM ('SHORT_PAY', 'WRONG_AMOUNT', 'MISSING_ACCESSORIAL', 'UNAUTHORIZED_DEDUCTION', 'LATE_PAYMENT', 'DOCUMENTATION', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."DriverStatus" AS ENUM ('AVAILABLE', 'ON_ROUTE', 'OFF_DUTY', 'SLEEPER', 'INACTIVE', 'ACTIVE', 'TERMINATED');

-- CreateEnum
CREATE TYPE "public"."EldVerificationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'NOT_ON_FMCSA_LIST', 'EXEMPT');

-- CreateEnum
CREATE TYPE "public"."EmailProviderType" AS ENUM ('BUSINESS', 'FREE', 'DISPOSABLE');

-- CreateEnum
CREATE TYPE "public"."EquipmentStatus" AS ENUM ('ACTIVE', 'IN_SHOP', 'OUT_OF_SERVICE');

-- CreateEnum
CREATE TYPE "public"."ExceptionSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "public"."FacialMatchStatus" AS ENUM ('PENDING', 'MATCHED', 'MISMATCH', 'SKIPPED', 'ERROR');

-- CreateEnum
CREATE TYPE "public"."FactoringTransactionType" AS ENUM ('INITIAL_DEPOSIT', 'CARRIER_PAYMENT_OUT', 'SHIPPER_PAYMENT_IN', 'QP_FEE_EARNED', 'ADJUSTMENT', 'WITHDRAWAL', 'FACTORING_RESERVE', 'RESERVE_RELEASE', 'REVERSAL');

-- CreateEnum
CREATE TYPE "public"."FraudReportCategory" AS ENUM ('DOUBLE_BROKERING', 'CARGO_THEFT', 'IDENTITY_THEFT', 'NO_SHOW', 'PAYMENT_ISSUE', 'IMPERSONATION', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."FraudReportStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'CONFIRMED', 'DISMISSED', 'PERMANENT');

-- CreateEnum
CREATE TYPE "public"."FuelSurchargeType" AS ENUM ('FLAT', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "public"."HookType" AS ENUM ('PRELOADED', 'LIVE_LOAD_UNLOAD', 'DROP_HOOK');

-- CreateEnum
CREATE TYPE "public"."IdentityStatus" AS ENUM ('UNVERIFIED', 'PARTIAL', 'VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."IntegrationStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ERROR');

-- CreateEnum
CREATE TYPE "public"."InvoiceStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'FUNDED', 'PAID', 'REJECTED', 'SENT', 'PARTIAL', 'OVERDUE', 'VOID');

-- CreateEnum
CREATE TYPE "public"."LineItemType" AS ENUM ('LINEHAUL', 'FUEL_SURCHARGE', 'ACCESSORIAL', 'DETENTION', 'LUMPER', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."LoadStatus" AS ENUM ('POSTED', 'BOOKED', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'DISPATCHED', 'PICKED_UP', 'DRAFT', 'TENDERED', 'CONFIRMED', 'AT_PICKUP', 'LOADED', 'AT_DELIVERY', 'POD_RECEIVED', 'INVOICED', 'TONU', 'PLANNED');

-- CreateEnum
CREATE TYPE "public"."LocationSource" AS ENUM ('ELD', 'CARRIER_PORTAL', 'CHECK_CALL_EMAIL', 'AE_MANUAL', 'GEOFENCE');

-- CreateEnum
CREATE TYPE "public"."LogSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "public"."LogType" AS ENUM ('API_CALL', 'ERROR', 'AUTH', 'PAYMENT', 'STATUS_CHANGE', 'CRON_JOB', 'INTEGRATION', 'ALERT', 'SECURITY');

-- CreateEnum
CREATE TYPE "public"."NotificationType" AS ENUM ('CARRIER_APPLICATION', 'LOAD_TENDERED', 'LOAD_UPDATE', 'PAYMENT_PENDING', 'PAYMENT_APPROVED', 'INVOICE_OVERDUE', 'FUND_ALERT', 'CREDIT_LIMIT', 'CPP_UPGRADE', 'DISPUTE_FILED', 'POD_RECEIVED', 'SYSTEM_ERROR', 'GENERAL', 'OFAC_MATCH', 'FRAUD_REPORT', 'ELD_INVALID', 'AGREEMENT_SIGNED', 'COMPLIANCE');

-- CreateEnum
CREATE TYPE "public"."OfacStatus" AS ENUM ('CLEAR', 'POTENTIAL_MATCH', 'CONFIRMED_MATCH', 'PENDING', 'ERROR');

-- CreateEnum
CREATE TYPE "public"."OnboardingStatus" AS ENUM ('PENDING', 'DOCUMENTS_SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "public"."OverbookingRisk" AS ENUM ('NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "public"."OverrideReason" AS ENUM ('COMPETITIVE_MATCH', 'VOLUME_BONUS', 'STRATEGIC_LANE', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."OwnershipType" AS ENUM ('COMPANY', 'LEASED', 'OWNER_OPERATOR');

-- CreateEnum
CREATE TYPE "public"."PackageType" AS ENUM ('PLT', 'SKID', 'CTN', 'BOX', 'DRUM', 'BALE', 'BUNDLE', 'CRATE', 'ROLL', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."PaymentMethod" AS ENUM ('ACH', 'CHECK', 'WIRE', 'QUICKPAY', 'FACTORING', 'ZELLE', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."PaymentTier" AS ENUM ('FLASH', 'EXPRESS', 'PRIORITY', 'PARTNER', 'ELITE', 'STANDARD');

-- CreateEnum
CREATE TYPE "public"."PhoneLineType" AS ENUM ('LANDLINE', 'MOBILE', 'VOIP');

-- CreateEnum
CREATE TYPE "public"."PhotoIdStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."PhotoIdType" AS ENUM ('DRIVERS_LICENSE', 'PASSPORT', 'STATE_ID');

-- CreateEnum
CREATE TYPE "public"."ProspectVertical" AS ENUM ('COLDCHAIN', 'WELLNESS', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "public"."QuickPayStatus" AS ENUM ('REQUESTED', 'VALIDATING', 'APPROVED', 'PROCESSING', 'PAID', 'DENIED', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "public"."RateType" AS ENUM ('FLAT', 'PER_MILE');

-- CreateEnum
CREATE TYPE "public"."ReleasedValueBasis" AS ENUM ('PER_POUND', 'PER_PIECE', 'TOTAL', 'NVD');

-- CreateEnum
CREATE TYPE "public"."ReportStatus" AS ENUM ('GENERATING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."ReportType" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "public"."RfpStatus" AS ENUM ('DRAFT', 'OPEN', 'IN_REVIEW', 'AWARDED', 'DECLINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "public"."ScorecardPeriod" AS ENUM ('WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "public"."SettlementPeriod" AS ENUM ('WEEKLY', 'BIWEEKLY');

-- CreateEnum
CREATE TYPE "public"."SettlementStatus" AS ENUM ('DRAFT', 'FINALIZED', 'PAID');

-- CreateEnum
CREATE TYPE "public"."ShipmentStatus" AS ENUM ('PENDING', 'BOOKED', 'DISPATCHED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."ShipmentType" AS ENUM ('DOMESTIC', 'CROSS_BORDER');

-- CreateEnum
CREATE TYPE "public"."ShipperPaymentTerms" AS ENUM ('NET15', 'NET30', 'NET60', 'COD');

-- CreateEnum
CREATE TYPE "public"."ShipperStatus" AS ENUM ('NEW', 'CONTACTED', 'ACTIVE', 'DECLINED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "public"."SosStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DISSOLVED', 'NOT_FOUND');

-- CreateEnum
CREATE TYPE "public"."StopType" AS ENUM ('PICKUP', 'DELIVERY');

-- CreateEnum
CREATE TYPE "public"."TenderStatus" AS ENUM ('OFFERED', 'ACCEPTED', 'COUNTERED', 'DECLINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "public"."TinMatchStatus" AS ENUM ('UNVERIFIED', 'MATCHED', 'MISMATCHED', 'IRS_ERROR', 'FORMAT_VALID', 'SUSPICIOUS');

-- CreateEnum
CREATE TYPE "public"."TrackingAccessLevel" AS ENUM ('FULL', 'STATUS_ONLY');

-- CreateEnum
CREATE TYPE "public"."TrackingEventType" AS ENUM ('STATUS_CHANGE', 'LOCATION_UPDATE', 'CHECK_CALL', 'ALERT', 'DOCUMENT', 'NOTE', 'TEMPERATURE', 'GEOFENCE');

-- CreateEnum
CREATE TYPE "public"."TrailerType" AS ENUM ('DRY_VAN', 'REEFER', 'FLATBED', 'STEP_DECK', 'LOWBOY', 'TANKER', 'CAR_HAULER', 'CONESTOGA', 'POWER_ONLY', 'CONTAINER');

-- CreateEnum
CREATE TYPE "public"."TruckType" AS ENUM ('DAY_CAB', 'SLEEPER', 'STRAIGHT', 'BOX_TRUCK');

-- CreateEnum
CREATE TYPE "public"."UcrStatus" AS ENUM ('VERIFIED', 'UNVERIFIED', 'EXPIRED', 'NOT_REQUIRED');

-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('CARRIER', 'BROKER', 'SHIPPER', 'FACTOR', 'ADMIN', 'DISPATCH', 'OPERATIONS', 'ACCOUNTING', 'CEO', 'AE', 'READONLY');

-- CreateEnum
CREATE TYPE "public"."VettingGrade" AS ENUM ('A', 'B', 'C', 'D', 'F');

-- CreateEnum
CREATE TYPE "public"."VinVerificationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'MISMATCH', 'NOT_FOUND');

-- CreateTable
CREATE TABLE "public"."NewsArticle" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "content" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceIcon" TEXT,
    "imageUrl" TEXT,
    "category" TEXT NOT NULL DEFAULT 'Industry',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "featured" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "NewsArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NewsSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "feedUrl" TEXT NOT NULL,
    "iconUrl" TEXT,
    "category" TEXT NOT NULL DEFAULT 'Industry',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastFetched" TIMESTAMP(3),
    "articleCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."address_book" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "address" TEXT NOT NULL,
    "address2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'US',
    "notes" TEXT,
    "pickupHours" TEXT,
    "deliveryHours" TEXT,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "address_book_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ai_api_usage" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "costUsd" DOUBLE PRECISION NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "queryType" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "errorType" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_api_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ai_learning_cycles" (
    "id" TEXT NOT NULL,
    "service_name" TEXT NOT NULL,
    "cycle_type" TEXT NOT NULL,
    "data_points_processed" INTEGER NOT NULL DEFAULT 0,
    "models_updated" INTEGER NOT NULL DEFAULT 0,
    "accuracy" DOUBLE PRECISION,
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "improvements" JSONB,
    "errors" JSONB,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "ai_learning_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ai_learning_logs" (
    "id" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "dataJson" JSONB NOT NULL DEFAULT '{}',
    "outcome" TEXT,
    "confidence" DOUBLE PRECISION,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_learning_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."anomaly_logs" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "anomalyType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "dataJson" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anomaly_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."approval_queue" (
    "id" TEXT NOT NULL,
    "type" "public"."ApprovalType" NOT NULL,
    "status" "public"."ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "referenceId" TEXT NOT NULL,
    "referenceType" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "requestedById" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "escalatedToId" TEXT,
    "escalatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "changes" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."audit_trails" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" "public"."AuditAction" NOT NULL,
    "changedFields" JSONB,
    "performedById" TEXT NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,

    CONSTRAINT "audit_trails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."automation_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "actionTaken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."broker_integrations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "apiEndpoint" TEXT,
    "apiKeyEncrypted" TEXT,
    "status" "public"."IntegrationStatus" NOT NULL DEFAULT 'INACTIVE',
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "config" TEXT,

    CONSTRAINT "broker_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."carrier_agreements" (
    "id" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "templateName" TEXT NOT NULL DEFAULT 'standard',
    "documentUrl" TEXT,
    "status" "public"."AgreementStatus" NOT NULL DEFAULT 'DRAFT',
    "sentAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "signedByName" TEXT,
    "signedByTitle" TEXT,
    "signatureData" TEXT,
    "signerIp" TEXT,
    "signerUserAgent" TEXT,
    "expiresAt" TIMESTAMP(3),
    "terminatedAt" TIMESTAMP(3),
    "terminatedBy" TEXT,
    "terminationReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carrier_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."carrier_bonuses" (
    "id" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "type" "public"."BonusType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "period" TEXT,
    "status" "public"."BonusStatus" NOT NULL DEFAULT 'PENDING',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "carrier_bonuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."carrier_call_logs" (
    "id" TEXT NOT NULL,
    "loadId" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "calledById" TEXT NOT NULL,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "callType" TEXT NOT NULL DEFAULT 'OUTBOUND',
    "outcome" TEXT NOT NULL,
    "offeredRate" DOUBLE PRECISION,
    "counterRate" DOUBLE PRECISION,
    "declineReason" TEXT,
    "callDuration" INTEGER,
    "notes" TEXT,
    "followUpDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "carrier_call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."carrier_fingerprints" (
    "id" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "phoneHash" TEXT,
    "emailHash" TEXT,
    "addressHash" TEXT,
    "einHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "dotHash" TEXT,
    "ipHash" TEXT,

    CONSTRAINT "carrier_fingerprints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."carrier_identity_verifications" (
    "id" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "photoIdUploaded" BOOLEAN NOT NULL DEFAULT false,
    "photoIdUrl" TEXT,
    "photoIdType" "public"."PhotoIdType",
    "photoIdStatus" "public"."PhotoIdStatus" NOT NULL DEFAULT 'PENDING',
    "photoIdVerifiedAt" TIMESTAMP(3),
    "photoIdVerifiedBy" TEXT,
    "selfieUploaded" BOOLEAN NOT NULL DEFAULT false,
    "selfieUrl" TEXT,
    "facialMatchScore" DOUBLE PRECISION,
    "facialMatchStatus" "public"."FacialMatchStatus" NOT NULL DEFAULT 'PENDING',
    "facialMatchVerifiedAt" TIMESTAMP(3),
    "sosVerified" BOOLEAN NOT NULL DEFAULT false,
    "sosState" TEXT,
    "sosEntityName" TEXT,
    "sosFilingNumber" TEXT,
    "sosStatus" "public"."SosStatus",
    "articlesOfIncUrl" TEXT,
    "w9TinVerified" BOOLEAN NOT NULL DEFAULT false,
    "w9TinLastFour" TEXT,
    "w9VerifiedAt" TIMESTAMP(3),
    "w9TinMatchStatus" "public"."TinMatchStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "w9TinMatchVerifiedAt" TIMESTAMP(3),
    "w9CompanyName" TEXT,
    "w9TinFull" TEXT,
    "emailDomainValid" BOOLEAN,
    "emailDomainAge" INTEGER,
    "emailIsDisposable" BOOLEAN,
    "emailProvider" "public"."EmailProviderType",
    "phoneType" "public"."PhoneLineType",
    "phoneCarrier" TEXT,
    "phoneIsVoip" BOOLEAN,
    "identityScore" INTEGER NOT NULL DEFAULT 0,
    "identityStatus" "public"."IdentityStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carrier_identity_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."carrier_intelligence" (
    "id" TEXT NOT NULL,
    "carrier_id" TEXT NOT NULL,
    "lane_key" TEXT,
    "reliability_score" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "on_time_score" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "communication_score" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "fall_off_risk" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "rate_negotiability" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "preferred_lanes" JSONB,
    "performance_trend" TEXT NOT NULL DEFAULT 'STABLE',
    "predicted_next_tier" TEXT,
    "churn_risk" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "total_data_points" INTEGER NOT NULL DEFAULT 0,
    "last_trained_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "avg_response_minutes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "claim_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "composite_score" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "damage_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "last_full_recalc" TIMESTAMP(3),
    "on_time_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "score_history_json" JSONB NOT NULL DEFAULT '[]',
    "tender_accept_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tier" TEXT NOT NULL DEFAULT 'GOOD',
    "total_loads_completed" INTEGER NOT NULL DEFAULT 0,
    "weight_config_json" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "carrier_intelligence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."carrier_pays" (
    "id" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "loadId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "quickPayDiscount" DOUBLE PRECISION,
    "netAmount" DOUBLE PRECISION NOT NULL,
    "status" "public"."CarrierPayStatus" NOT NULL DEFAULT 'PENDING',
    "paymentMethod" "public"."PaymentMethod",
    "checkNumber" TEXT,
    "referenceNumber" TEXT,
    "scheduledDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "settlementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "accessorialsTotal" DOUBLE PRECISION,
    "allDocsVerified" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "docCarrierInvoice" BOOLEAN NOT NULL DEFAULT false,
    "docLumperReceipt" BOOLEAN NOT NULL DEFAULT false,
    "docPod" BOOLEAN NOT NULL DEFAULT false,
    "docScaleTicket" BOOLEAN NOT NULL DEFAULT false,
    "docSignedBol" BOOLEAN NOT NULL DEFAULT false,
    "docSignedRateCon" BOOLEAN NOT NULL DEFAULT false,
    "docTempLog" BOOLEAN NOT NULL DEFAULT false,
    "dueDate" TIMESTAMP(3),
    "fuelSurcharge" DOUBLE PRECISION,
    "grossAmount" DOUBLE PRECISION,
    "lineHaul" DOUBLE PRECISION,
    "paymentDate" TIMESTAMP(3),
    "paymentNumber" TEXT,
    "paymentTier" "public"."PaymentTier" NOT NULL DEFAULT 'STANDARD',
    "preparedAt" TIMESTAMP(3),
    "preparedById" TEXT,
    "quickPayFeeAmount" DOUBLE PRECISION DEFAULT 0,
    "quickPayFeePercent" DOUBLE PRECISION DEFAULT 0,
    "rateConfirmationId" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectedById" TEXT,
    "rejectionReason" TEXT,
    "remitToAddress" TEXT,
    "remitToName" TEXT,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "carrier_pays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."carrier_preferences" (
    "id" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "preferredLanes" JSONB NOT NULL DEFAULT '[]',
    "preferredRegions" JSONB NOT NULL DEFAULT '[]',
    "avoidRegions" JSONB NOT NULL DEFAULT '[]',
    "preferredLoadTypes" JSONB NOT NULL DEFAULT '[]',
    "minRatePerMile" DOUBLE PRECISION,
    "maxDeadheadMiles" INTEGER NOT NULL DEFAULT 150,
    "preferredPayTerms" TEXT,
    "homeBaseLat" DOUBLE PRECISION,
    "homeBaseLng" DOUBLE PRECISION,
    "typicalRadiusMiles" INTEGER NOT NULL DEFAULT 500,
    "notifyMethod" TEXT NOT NULL DEFAULT 'EMAIL',
    "notifyFrequency" TEXT NOT NULL DEFAULT 'IMMEDIATE',
    "autoLearned" JSONB NOT NULL DEFAULT '{}',
    "lastUpdatedBy" TEXT NOT NULL DEFAULT 'SYSTEM',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "carrier_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."carrier_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mcNumber" TEXT,
    "dotNumber" TEXT,
    "insuranceExpiry" TIMESTAMP(3),
    "safetyScore" DOUBLE PRECISION,
    "tier" "public"."CarrierTier" NOT NULL DEFAULT 'SILVER',
    "equipmentTypes" TEXT[],
    "operatingRegions" TEXT[],
    "onboardingStatus" "public"."OnboardingStatus" NOT NULL DEFAULT 'PENDING',
    "approvedAt" TIMESTAMP(3),
    "w9Uploaded" BOOLEAN NOT NULL DEFAULT false,
    "insuranceCertUploaded" BOOLEAN NOT NULL DEFAULT false,
    "authorityDocUploaded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "numberOfTrucks" INTEGER,
    "state" TEXT,
    "zip" TEXT,
    "authorityLetterUrl" TEXT,
    "autoLiabilityAmount" DOUBLE PRECISION,
    "cargoInsuranceAmount" DOUBLE PRECISION,
    "coiUrl" TEXT,
    "companyName" TEXT,
    "contactEmail" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "eldProvider" TEXT,
    "fmcsaAuthorityStatus" TEXT,
    "fmcsaBasicScores" JSONB,
    "fmcsaLastChecked" TIMESTAMP(3),
    "generalLiabilityAmount" DOUBLE PRECISION,
    "insuranceCompany" TEXT,
    "insurancePolicyNumber" TEXT,
    "notes" TEXT,
    "numberOfDrivers" INTEGER,
    "paymentPreference" "public"."PaymentTier",
    "preferredLanes" JSONB,
    "safetyRating" TEXT,
    "status" "public"."CarrierApplicationStatus" NOT NULL DEFAULT 'NEW',
    "w9Url" TEXT,
    "emergencyApproveReason" TEXT,
    "emergencyApproved" BOOLEAN NOT NULL DEFAULT false,
    "emergencyApprovedAt" TIMESTAMP(3),
    "emergencyApprovedById" TEXT,
    "source" TEXT DEFAULT 'caravan',
    "cppJoinedDate" TIMESTAMP(3),
    "cppTier" "public"."CarrierTier" NOT NULL DEFAULT 'NONE',
    "cppTotalLoads" INTEGER NOT NULL DEFAULT 0,
    "cppTotalMiles" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "lastVettedAt" TIMESTAMP(3),
    "lastVettingRisk" TEXT,
    "lastVettingScore" INTEGER,
    "activeLoadCount" INTEGER NOT NULL DEFAULT 0,
    "authorityAgeDays" INTEGER,
    "authorityGrantedDate" TIMESTAMP(3),
    "autoSuspendReason" TEXT,
    "autoSuspendedAt" TIMESTAMP(3),
    "chameleonRiskLevel" "public"."ChameleonRiskLevel" NOT NULL DEFAULT 'NONE',
    "eldDeviceVerified" BOOLEAN NOT NULL DEFAULT false,
    "eldOnFmcsaList" "public"."EldVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "eldVerifiedAt" TIMESTAMP(3),
    "fmcsaAddress" TEXT,
    "fmcsaContactLastSync" TIMESTAMP(3),
    "fmcsaEmail" TEXT,
    "fmcsaPhone" TEXT,
    "insuranceGraceGrantedBy" TEXT,
    "insuranceGracePeriodEnd" TIMESTAMP(3),
    "lastChameleonCheckAt" TIMESTAMP(3),
    "ofacMatchDetails" JSONB,
    "ofacScreenedAt" TIMESTAMP(3),
    "ofacStatus" "public"."OfacStatus",
    "overbookingLastCheck" TIMESTAMP(3),
    "overbookingRisk" "public"."OverbookingRisk" NOT NULL DEFAULT 'NONE',
    "ucrStatus" "public"."UcrStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "ucrVerifiedAt" TIMESTAMP(3),
    "ucrYear" INTEGER,
    "vettingGrade" "public"."VettingGrade",
    "authorityDocExpiryDate" TIMESTAMP(3),
    "coiExpiryDate" TIMESTAMP(3),
    "registrationIpHash" TEXT,
    "registrationUserAgent" TEXT,
    "suspendedAt" TIMESTAMP(3),
    "suspensionReason" TEXT,
    "w9ExpiryDate" TIMESTAMP(3),
    "boc3Filed" BOOLEAN NOT NULL DEFAULT false,
    "iftaExpiryDate" TIMESTAMP(3),
    "iftaStatus" TEXT,
    "irpExpiryDate" TIMESTAMP(3),
    "irpStatus" TEXT,
    "loyaltyEscalator" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mcs150LastUpdate" TIMESTAMP(3),
    "mcs150Outdated" BOOLEAN,
    "milestone" "public"."CarrierMilestone" NOT NULL DEFAULT 'M1_FIRST_LOAD',
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 21,
    "quickPayAutoLimit" DOUBLE PRECISION NOT NULL DEFAULT 2000,
    "quickPayFeeRate" DOUBLE PRECISION NOT NULL DEFAULT 0.03,
    "quickPayMonthlyLimit" DOUBLE PRECISION NOT NULL DEFAULT 15000,
    "referralCount" INTEGER NOT NULL DEFAULT 0,
    "additionalInsuredSRL" BOOLEAN NOT NULL DEFAULT false,
    "autoLiabilityExpiry" TIMESTAMP(3),
    "autoLiabilityPolicy" TEXT,
    "autoLiabilityProvider" TEXT,
    "cargoInsuranceExpiry" TIMESTAMP(3),
    "cargoInsurancePolicy" TEXT,
    "cargoInsuranceProvider" TEXT,
    "generalLiabilityExpiry" TIMESTAMP(3),
    "generalLiabilityPolicy" TEXT,
    "generalLiabilityProvider" TEXT,
    "insuranceAgencyName" TEXT,
    "insuranceAgentEmail" TEXT,
    "insuranceAgentName" TEXT,
    "insuranceAgentPhone" TEXT,
    "thirtyDayCancellationNotice" BOOLEAN NOT NULL DEFAULT false,
    "waiverOfSubrogation" BOOLEAN NOT NULL DEFAULT false,
    "workersCompAmount" DOUBLE PRECISION,
    "workersCompExpiry" TIMESTAMP(3),
    "workersCompPolicy" TEXT,
    "workersCompProvider" TEXT,

    CONSTRAINT "carrier_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."carrier_scorecards" (
    "id" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "period" "public"."ScorecardPeriod" NOT NULL,
    "onTimePickupPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "onTimeDeliveryPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "communicationScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "claimRatio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "documentSubmissionTimeliness" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "acceptanceRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gpsCompliancePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overallScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tierAtTime" "public"."CarrierTier" NOT NULL,
    "bonusEarned" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "carrier_scorecards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."cash_positions" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalCapital" DOUBLE PRECISION NOT NULL DEFAULT 70000,
    "deployed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "available" DOUBLE PRECISION NOT NULL DEFAULT 70000,
    "pendingShipperAR" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bronzePaused" BOOLEAN NOT NULL DEFAULT false,
    "allQPPaused" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."chameleon_matches" (
    "id" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "matchedCarrierId" TEXT NOT NULL,
    "matchType" "public"."ChameleonMatchType" NOT NULL,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "status" "public"."ChameleonMatchStatus" NOT NULL DEFAULT 'OPEN',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chameleon_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."check_call_schedules" (
    "id" TEXT NOT NULL,
    "loadId" TEXT NOT NULL,
    "scheduledTime" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "response" TEXT,
    "responseText" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "carrierPhone" TEXT,
    "escalatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "check_call_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."check_calls" (
    "id" TEXT NOT NULL,
    "loadId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "location" TEXT,
    "city" TEXT,
    "state" TEXT,
    "notes" TEXT,
    "contactedBy" TEXT,
    "method" TEXT,
    "calledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "driverStatus" "public"."CheckCallDriverStatus",
    "etaUpdate" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "check_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."claims" (
    "id" TEXT NOT NULL,
    "claimNumber" TEXT NOT NULL,
    "loadId" TEXT NOT NULL,
    "claimType" "public"."ClaimType" NOT NULL,
    "status" "public"."ClaimStatus" NOT NULL DEFAULT 'FILED',
    "description" TEXT NOT NULL,
    "estimatedValue" DOUBLE PRECISION,
    "resolvedValue" DOUBLE PRECISION,
    "photos" TEXT[],
    "notes" JSONB,
    "filedById" TEXT NOT NULL,
    "assignedToId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."communications" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "direction" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "loadId" TEXT,
    "from" TEXT,
    "to" TEXT,
    "subject" TEXT,
    "body" TEXT,
    "phoneNumber" TEXT,
    "duration" INTEGER,
    "metadata" JSONB,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "communications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."compliance_alerts" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityName" TEXT NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "severity" TEXT NOT NULL DEFAULT 'WARNING',
    "notifiedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snoozedUntil" TIMESTAMP(3),

    CONSTRAINT "compliance_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."compliance_forecast" (
    "id" TEXT NOT NULL,
    "carrier_id" TEXT NOT NULL,
    "insurance_expiry_risk" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "authority_risk" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "safety_risk" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overall_risk" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "predicted_issues" JSONB,
    "days_until_expiry" INTEGER,
    "recommended_action" TEXT,
    "auto_alert_sent" BOOLEAN NOT NULL DEFAULT false,
    "last_trained_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compliance_forecast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."compliance_notes" (
    "id" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compliance_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."compliance_overrides" (
    "id" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compliance_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."compliance_reminders" (
    "id" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailStatus" TEXT NOT NULL DEFAULT 'SENT',

    CONSTRAINT "compliance_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."compliance_scans" (
    "id" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "scanType" TEXT NOT NULL DEFAULT 'FMCSA_AUTO',
    "fmcsaData" JSONB,
    "previousData" JSONB,
    "changesDetected" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PASSED',
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compliance_scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."contract_rates" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "originState" TEXT NOT NULL,
    "destState" TEXT NOT NULL,
    "equipmentType" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "flatRate" DOUBLE PRECISION,
    "fuelSurcharge" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minWeight" DOUBLE PRECISION,
    "maxWeight" DOUBLE PRECISION,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "expirationDate" TIMESTAMP(3) NOT NULL,
    "status" "public"."ContractRateStatus" NOT NULL DEFAULT 'ACTIVE',
    "volume" INTEGER,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "contract_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."cron_registry" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "schedule" TEXT NOT NULL,
    "description" TEXT,
    "lastRun" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastError" TEXT,
    "lastDuration" INTEGER,
    "nextRun" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cron_registry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."customer_activity" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "event_type" VARCHAR(64) NOT NULL,
    "description" TEXT NOT NULL,
    "actor_type" VARCHAR(20) NOT NULL DEFAULT 'SYSTEM',
    "actor_id" TEXT,
    "actor_name" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."customer_contacts" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receives_tracking_link" BOOLEAN NOT NULL DEFAULT false,
    "is_billing" BOOLEAN NOT NULL DEFAULT false,
    "role" VARCHAR(50),
    "sales_role" "public"."ContactSalesRole",
    "introduced_via" VARCHAR(120),
    "do_not_contact" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "customer_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."customer_facilities" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "state" VARCHAR(50),
    "zip" VARCHAR(20),
    "lat" DECIMAL(10,6),
    "lng" DECIMAL(10,6),
    "facility_type" VARCHAR(20) NOT NULL DEFAULT 'both',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "contact_name" TEXT,
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "operating_hours" JSONB,
    "dock_info" TEXT,
    "load_type" VARCHAR(20) NOT NULL DEFAULT 'live',
    "estimated_load_time_minutes" INTEGER,
    "appointment_required" BOOLEAN NOT NULL DEFAULT false,
    "appointment_instructions" TEXT,
    "lumper_info" TEXT,
    "special_instructions" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_facilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."customer_intelligence" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "lifetime_value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avg_load_frequency" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avg_load_value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "churn_risk" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "churn_reason" TEXT,
    "growth_potential" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "payment_reliability" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "avg_payment_days" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "preferred_lanes" JSONB,
    "preferred_equipment" JSONB,
    "seasonal_pattern" JSONB,
    "last_shipment_at" TIMESTAMP(3),
    "days_since_last_load" INTEGER NOT NULL DEFAULT 0,
    "engagement_score" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "recommended_action" TEXT,
    "last_trained_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "credit_score" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "dispute_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "payment_score" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "total_loads" INTEGER NOT NULL DEFAULT 0,
    "volume_trend" TEXT NOT NULL DEFAULT 'STABLE',

    CONSTRAINT "customer_intelligence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."customer_notes" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "note_type" VARCHAR(40) NOT NULL,
    "facility_id" TEXT,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "follow_up_date" DATE,
    "source" VARCHAR(20) NOT NULL DEFAULT 'manual',
    "created_by_id" TEXT,
    "created_by_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "rating" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "creditLimit" DOUBLE PRECISION,
    "paymentTerms" TEXT DEFAULT 'Net 30',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "annualRevenue" DOUBLE PRECISION,
    "avgLoadsPerMonth" INTEGER,
    "billingAddress" TEXT,
    "billingCity" TEXT,
    "billingEmail" TEXT,
    "billingState" TEXT,
    "billingZip" TEXT,
    "contractUrl" TEXT,
    "creditCheckDate" TIMESTAMP(3),
    "creditStatus" "public"."CreditStatus" NOT NULL DEFAULT 'NOT_CHECKED',
    "industryType" TEXT,
    "mcNumber" TEXT,
    "onboardingStatus" "public"."OnboardingStatus" NOT NULL DEFAULT 'PENDING',
    "preferredEquipment" TEXT[],
    "taxId" TEXT,
    "type" "public"."CustomerType" NOT NULL DEFAULT 'SHIPPER',
    "billingContactEmail" TEXT,
    "billingContactName" TEXT,
    "billingContactPhone" TEXT,
    "destinations" JSONB,
    "industry" TEXT,
    "origins" JSONB,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "userId" TEXT,
    "credit_check_source" VARCHAR(20),
    "credit_check_result" VARCHAR(20),
    "credit_check_notes" TEXT,
    "sec_cik_number" VARCHAR(20),
    "account_rep_id" TEXT,
    "current_touch" INTEGER,
    "last_resend_email_id" TEXT,
    "last_touch_sent_at" TIMESTAMP(3),
    "next_touch_due_at" TIMESTAMP(3),
    "personalized_hook" TEXT,
    "personalized_relevance" TEXT,
    "research_notes" TEXT,
    "researched_at" TIMESTAMP(3),
    "sequence_cluster" TEXT,
    "sequence_status" TEXT,
    "vertical" "public"."ProspectVertical" NOT NULL DEFAULT 'UNKNOWN',
    "approved_at" TIMESTAMP(3),
    "approved_by_id" TEXT,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."demand_forecasts" (
    "id" TEXT NOT NULL,
    "laneKey" TEXT NOT NULL,
    "equipmentType" TEXT NOT NULL DEFAULT 'DRY_VAN',
    "forecastDate" TIMESTAMP(3) NOT NULL,
    "predictedVolume" DOUBLE PRECISION NOT NULL,
    "actualVolume" DOUBLE PRECISION,
    "confidence" TEXT NOT NULL DEFAULT 'LOW',
    "trend" TEXT NOT NULL DEFAULT 'STABLE',
    "modelVersion" TEXT NOT NULL DEFAULT 'v1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demand_forecasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."detention_records" (
    "id" TEXT NOT NULL,
    "load_id" TEXT NOT NULL,
    "location_type" VARCHAR(20) NOT NULL,
    "facility_name" TEXT,
    "entered_at" TIMESTAMP(3) NOT NULL,
    "departed_at" TIMESTAMP(3),
    "elapsed_minutes" INTEGER,
    "billable" BOOLEAN NOT NULL DEFAULT false,
    "rate_per_hour" DECIMAL(10,2),
    "total_charge" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "detention_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."dock_schedules" (
    "id" TEXT NOT NULL,
    "facilityName" TEXT NOT NULL,
    "facilityAddress" TEXT,
    "facilityCity" TEXT NOT NULL,
    "facilityState" TEXT NOT NULL,
    "facilityZip" TEXT,
    "dockNumber" TEXT,
    "appointmentDate" TIMESTAMP(3) NOT NULL,
    "timeSlotStart" TEXT NOT NULL,
    "timeSlotEnd" TEXT NOT NULL,
    "loadId" TEXT,
    "carrierId" TEXT,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "truckNumber" TEXT,
    "trailerNumber" TEXT,
    "appointmentType" TEXT NOT NULL DEFAULT 'PICKUP',
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "checkedInAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "dwellTimeMinutes" INTEGER,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dock_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."documents" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "loadId" TEXT,
    "invoiceId" TEXT,
    "docType" TEXT,
    "entityId" TEXT,
    "entityType" TEXT,
    "notes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "category" TEXT,
    "upload_source" TEXT NOT NULL DEFAULT 'AE_CONSOLE',
    "exception_id" TEXT,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."drivers" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "licenseType" TEXT NOT NULL,
    "licenseNumber" TEXT,
    "licenseExpiry" TIMESTAMP(3),
    "status" "public"."DriverStatus" NOT NULL DEFAULT 'AVAILABLE',
    "currentLocation" TEXT,
    "hireDate" TIMESTAMP(3),
    "safetyScore" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "violations" INTEGER NOT NULL DEFAULT 0,
    "hosDrivingUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hosOnDutyUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hosCycleUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hosCycleLimit" DOUBLE PRECISION NOT NULL DEFAULT 70,
    "assignedEquipmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "assignedTrailerId" TEXT,
    "assignedTruckId" TEXT,
    "backgroundCheckDate" TIMESTAMP(3),
    "dateOfBirth" TIMESTAMP(3),
    "drugTestDate" TIMESTAMP(3),
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "endorsements" TEXT[],
    "licenseState" TEXT,
    "medicalCardExpiry" TIMESTAMP(3),
    "mvrDate" TIMESTAMP(3),
    "terminationDate" TIMESTAMP(3),
    "twicCard" BOOLEAN NOT NULL DEFAULT false,
    "twicExpiry" TIMESTAMP(3),
    "cppMilesEarned" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."edi_transactions" (
    "id" TEXT NOT NULL,
    "transactionSet" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "loadId" TEXT,
    "carrierId" TEXT,
    "rawPayload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "edi_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."eld_device_mappings" (
    "id" TEXT NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "external_vehicle_id" TEXT NOT NULL,
    "external_driver_id" TEXT,
    "carrier_id" TEXT,
    "driver_name" TEXT,
    "driver_phone" TEXT,
    "vehicle_name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMP(3),
    "last_latitude" DECIMAL(10,6),
    "last_longitude" DECIMAL(10,6),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eld_device_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."eld_events" (
    "id" TEXT NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "external_id" TEXT,
    "event_type" VARCHAR(40) NOT NULL,
    "vehicle_id" TEXT,
    "vehicle_name" TEXT,
    "driver_id" TEXT,
    "driver_name" TEXT,
    "latitude" DECIMAL(10,6),
    "longitude" DECIMAL(10,6),
    "speed_mph" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "engine_hours" DOUBLE PRECISION,
    "odometer_miles" DOUBLE PRECISION,
    "fuel_pct" DOUBLE PRECISION,
    "hos_status" VARCHAR(20),
    "hos_drive_remain" DOUBLE PRECISION,
    "hos_on_duty_remain" DOUBLE PRECISION,
    "address" TEXT,
    "city" TEXT,
    "state" VARCHAR(5),
    "payload" JSONB,
    "load_id" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eld_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."email_quote_logs" (
    "id" TEXT NOT NULL,
    "emailSubject" TEXT,
    "sender" TEXT,
    "classification" TEXT,
    "classificationConfidence" DOUBLE PRECISION,
    "extractedDataJson" JSONB NOT NULL DEFAULT '{}',
    "generatedRate" DOUBLE PRECISION,
    "rateConfidence" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'PENDING',
    "processingTimeMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_quote_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."email_sequences" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "prospectEmail" TEXT NOT NULL,
    "prospectName" TEXT NOT NULL,
    "templateName" TEXT NOT NULL DEFAULT 'prospect_outreach',
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "totalSteps" INTEGER NOT NULL DEFAULT 4,
    "nextSendAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "stopReason" TEXT,
    "schedule" JSONB NOT NULL,
    "metadata" JSONB,
    "startedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."equipment" (
    "id" TEXT NOT NULL,
    "unitNumber" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "year" INTEGER,
    "make" TEXT,
    "model" TEXT,
    "vin" TEXT,
    "status" "public"."EquipmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "mileage" INTEGER NOT NULL DEFAULT 0,
    "nextServiceDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."error_logs" (
    "id" TEXT NOT NULL,
    "errorType" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stackTrace" TEXT,
    "endpoint" TEXT,
    "method" TEXT,
    "userId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "statusCode" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "error_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."exception_alerts" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "loadId" TEXT,
    "invoiceId" TEXT,
    "carrierId" TEXT,
    "customerId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "severity" "public"."ExceptionSeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolvedNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exception_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."exception_configs" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "severity" "public"."ExceptionSeverity" NOT NULL DEFAULT 'WARNING',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "thresholdValue" DOUBLE PRECISION,
    "thresholdUnit" TEXT,
    "autoResolve" BOOLEAN NOT NULL DEFAULT false,
    "notifyRoles" TEXT[] DEFAULT ARRAY['ADMIN', 'OPERATIONS']::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exception_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."facility_profiles" (
    "id" TEXT NOT NULL,
    "facilityName" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "avgWaitTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgDockAccess" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgCommunication" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgSafety" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgOverall" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalRatings" INTEGER NOT NULL DEFAULT 0,
    "lastRatedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facility_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."facility_ratings" (
    "id" TEXT NOT NULL,
    "facilityName" TEXT NOT NULL,
    "facilityAddress" TEXT NOT NULL,
    "facilityCity" TEXT NOT NULL,
    "facilityState" TEXT NOT NULL,
    "facilityZip" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "loadId" TEXT NOT NULL,
    "locationType" TEXT NOT NULL,
    "waitTimeMinutes" INTEGER,
    "dockAccess" INTEGER NOT NULL,
    "communication" INTEGER NOT NULL,
    "safety" INTEGER NOT NULL,
    "overall" INTEGER NOT NULL,
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facility_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."factoring_fund" (
    "id" TEXT NOT NULL,
    "transactionType" "public"."FactoringTransactionType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "runningBalance" DOUBLE PRECISION NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "description" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "factoring_fund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."fall_off_events" (
    "id" TEXT NOT NULL,
    "loadId" TEXT NOT NULL,
    "originalCarrierId" TEXT,
    "reason" TEXT,
    "recoveryMethod" TEXT,
    "newCarrierId" TEXT,
    "recoveryTimeMin" DOUBLE PRECISION,
    "backupsSent" INTEGER NOT NULL DEFAULT 0,
    "backupsAccepted" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fall_off_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."financial_reports" (
    "id" TEXT NOT NULL,
    "reportType" "public"."ReportType" NOT NULL,
    "status" "public"."ReportStatus" NOT NULL DEFAULT 'GENERATING',
    "title" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "summary" JSONB,
    "pdfUrl" TEXT,
    "csvUrl" TEXT,
    "generatedById" TEXT,
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."fraud_reports" (
    "id" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,
    "category" "public"."FraudReportCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" TEXT[],
    "loadId" TEXT,
    "status" "public"."FraudReportStatus" NOT NULL DEFAULT 'PENDING',
    "permanentAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "carrierResponse" TEXT,
    "carrierRespondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fraud_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."fuel_surcharge_tables" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'DOE_NATIONAL',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "expirationDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fuel_surcharge_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."fuel_surcharge_tiers" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "fuelPriceMin" DOUBLE PRECISION NOT NULL,
    "fuelPriceMax" DOUBLE PRECISION NOT NULL,
    "surchargeRate" DOUBLE PRECISION NOT NULL,
    "surchargeType" "public"."FuelSurchargeType" NOT NULL DEFAULT 'PERCENTAGE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fuel_surcharge_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."geofence_events" (
    "id" TEXT NOT NULL,
    "load_id" TEXT NOT NULL,
    "event_type" VARCHAR(40) NOT NULL,
    "facility_name" TEXT,
    "lat" DECIMAL(10,6),
    "lng" DECIMAL(10,6),
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "geofence_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."instant_book_logs" (
    "id" TEXT NOT NULL,
    "loadId" TEXT NOT NULL,
    "postedRate" DOUBLE PRECISION NOT NULL,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "carrierId" TEXT,
    "timeToBookSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instant_book_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."invoice_line_items" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "rate" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "type" "public"."LineItemType" NOT NULL DEFAULT 'LINEHAUL',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."invoices" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "status" "public"."InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "amount" DOUBLE PRECISION NOT NULL,
    "factoringFee" DOUBLE PRECISION,
    "advanceRate" DOUBLE PRECISION,
    "advanceAmount" DOUBLE PRECISION,
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "loadId" TEXT NOT NULL,
    "accessorialsAmount" DOUBLE PRECISION,
    "createdById" TEXT,
    "fuelSurchargeAmount" DOUBLE PRECISION,
    "lineHaulAmount" DOUBLE PRECISION,
    "notes" TEXT,
    "paidAmount" DOUBLE PRECISION,
    "paymentMethod" "public"."PaymentMethod",
    "paymentReference" TEXT,
    "pdfUrl" TEXT,
    "reminderSent31" BOOLEAN NOT NULL DEFAULT false,
    "reminderSent45" BOOLEAN NOT NULL DEFAULT false,
    "reminderSent60" BOOLEAN NOT NULL DEFAULT false,
    "sentDate" TIMESTAMP(3),
    "totalAmount" DOUBLE PRECISION,
    "lastReminderAt" TIMESTAMP(3),
    "reminderSent7" BOOLEAN NOT NULL DEFAULT false,
    "reminderSent90" BOOLEAN NOT NULL DEFAULT false,
    "reminderSentDue" BOOLEAN NOT NULL DEFAULT false,
    "reminderSentPre7" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."lane_intelligence" (
    "id" TEXT NOT NULL,
    "origin_state" TEXT NOT NULL,
    "origin_city" TEXT,
    "dest_state" TEXT NOT NULL,
    "dest_city" TEXT,
    "lane_key" TEXT NOT NULL,
    "total_loads" INTEGER NOT NULL DEFAULT 0,
    "avg_transit_days" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avg_miles" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avg_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avg_rpm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "demand" TEXT NOT NULL DEFAULT 'MODERATE',
    "demand_trend" TEXT NOT NULL DEFAULT 'STABLE',
    "best_days_to_book" JSONB,
    "avg_lead_time_days" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "backhaul_lane_key" TEXT,
    "backhaul_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deadhead_avg_miles" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "competitor_density" TEXT NOT NULL DEFAULT 'MEDIUM',
    "seasonality" JSONB,
    "last_trained_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lane_intelligence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."lane_rate_intelligence" (
    "id" TEXT NOT NULL,
    "originZip" TEXT NOT NULL,
    "destZip" TEXT NOT NULL,
    "equipmentType" TEXT NOT NULL DEFAULT 'DRY_VAN',
    "avgRatePerMile" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minAccepted" DOUBLE PRECISION,
    "maxRejected" DOUBLE PRECISION,
    "acceptanceRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "volatility" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trend" TEXT NOT NULL DEFAULT 'STABLE',
    "seasonalJson" JSONB NOT NULL DEFAULT '{}',
    "confidence" TEXT NOT NULL DEFAULT 'LOW',
    "lastQuotedRate" DOUBLE PRECISION,
    "lastAcceptedRate" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lane_rate_intelligence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."learning_event_queue" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "learning_event_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."load_accessorials" (
    "id" TEXT NOT NULL,
    "load_id" TEXT NOT NULL,
    "stop_id" TEXT,
    "type" "public"."AccessorialType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "quantity" DECIMAL(10,2),
    "unit" VARCHAR(20),
    "rate" DECIMAL(10,2),
    "status" "public"."AccessorialStatus" NOT NULL DEFAULT 'PENDING',
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejected_reason" TEXT,
    "receipt_document_id" TEXT,
    "billed_to" VARCHAR(20),
    "carrier_invoice_id" TEXT,
    "shipper_invoice_id" TEXT,
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "load_accessorials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."load_activity" (
    "id" TEXT NOT NULL,
    "load_id" TEXT NOT NULL,
    "event_type" VARCHAR(64) NOT NULL,
    "description" TEXT NOT NULL,
    "actor_type" VARCHAR(20) NOT NULL DEFAULT 'SYSTEM',
    "actor_id" TEXT,
    "actor_name" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "load_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."load_bids" (
    "id" TEXT NOT NULL,
    "load_id" TEXT NOT NULL,
    "carrier_id" TEXT NOT NULL,
    "bid_rate" DECIMAL(10,2) NOT NULL,
    "bid_rate_per_mile" DECIMAL(8,2),
    "notes" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_id" TEXT,

    CONSTRAINT "load_bids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."load_delays" (
    "id" TEXT NOT NULL,
    "loadId" TEXT NOT NULL,
    "reasonCode" "public"."DelayReasonCode" NOT NULL,
    "description" TEXT,
    "delayMinutes" INTEGER NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reportedById" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "load_delays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."load_exceptions" (
    "id" TEXT NOT NULL,
    "load_id" TEXT NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "unit_type" VARCHAR(20),
    "description" TEXT,
    "location_text" TEXT,
    "location_lat" DECIMAL(10,6),
    "location_lng" DECIMAL(10,6),
    "reported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reported_by_id" TEXT,
    "reported_by_name" TEXT,
    "reported_source" VARCHAR(20) NOT NULL DEFAULT 'AE_CONSOLE',
    "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    "resolved_at" TIMESTAMP(3),
    "resolved_by_id" TEXT,
    "resolution_notes" TEXT,
    "eta_impact_minutes" INTEGER,
    "repair_shop_name" TEXT,
    "repair_shop_phone" TEXT,
    "repair_eta" TIMESTAMP(3),
    "repair_cost" DECIMAL(12,2),
    "repair_cost_responsibility" VARCHAR(20),
    "receipt_status" VARCHAR(20) NOT NULL DEFAULT 'NONE',
    "shipper_notified" BOOLEAN NOT NULL DEFAULT false,
    "shipper_notified_at" TIMESTAMP(3),

    CONSTRAINT "load_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."load_line_items" (
    "id" TEXT NOT NULL,
    "load_id" TEXT NOT NULL,
    "line_number" INTEGER NOT NULL,
    "pieces" INTEGER NOT NULL,
    "package_type" "public"."PackageType" NOT NULL,
    "description" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "dimensions_length" DOUBLE PRECISION,
    "dimensions_width" DOUBLE PRECISION,
    "dimensions_height" DOUBLE PRECISION,
    "freight_class" TEXT,
    "nmfc_code" TEXT,
    "hazmat" BOOLEAN NOT NULL DEFAULT false,
    "hazmat_un_number" TEXT,
    "hazmat_class" TEXT,
    "hazmat_emergency_contact" TEXT,
    "hazmat_placard_required" BOOLEAN,
    "stackable" BOOLEAN NOT NULL DEFAULT true,
    "turnable" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "load_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."load_notes" (
    "id" TEXT NOT NULL,
    "load_id" TEXT NOT NULL,
    "note_type" VARCHAR(32) NOT NULL DEFAULT 'internal',
    "content" TEXT NOT NULL,
    "source" VARCHAR(20) NOT NULL DEFAULT 'manual',
    "created_by_id" TEXT,
    "created_by_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "load_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."load_quickpay_overrides" (
    "id" TEXT NOT NULL,
    "loadId" TEXT NOT NULL,
    "tierDefaultRate" DECIMAL(5,4) NOT NULL,
    "appliedRate" DECIMAL(5,4) NOT NULL,
    "reason" "public"."OverrideReason" NOT NULL,
    "reasonNote" TEXT,
    "overriddenBy" TEXT NOT NULL,
    "overriddenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "load_quickpay_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."load_stops" (
    "id" TEXT NOT NULL,
    "load_id" TEXT NOT NULL,
    "stop_number" INTEGER NOT NULL,
    "stop_type" "public"."StopType" NOT NULL,
    "facility_name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" VARCHAR(2) NOT NULL,
    "zip" VARCHAR(10) NOT NULL,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "appointment_date" DATE,
    "appointment_time" TEXT,
    "appointment_ref" VARCHAR(100),
    "actual_arrival" TIMESTAMP(3),
    "actual_departure" TIMESTAMP(3),
    "detention_start" TIMESTAMP(3),
    "detention_minutes" INTEGER,
    "hook_type" "public"."HookType",
    "trailer_number" VARCHAR(50),
    "seal_number" VARCHAR(50),
    "commodity" TEXT,
    "weight" DOUBLE PRECISION,
    "pieces" INTEGER,
    "on_time" BOOLEAN,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "contact_name" TEXT,
    "contact_phone" TEXT,
    "dwell_minutes" INTEGER,
    "is_payable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "load_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."load_tenders" (
    "id" TEXT NOT NULL,
    "loadId" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "status" "public"."TenderStatus" NOT NULL DEFAULT 'OFFERED',
    "offeredRate" DOUBLE PRECISION NOT NULL,
    "counterRate" DOUBLE PRECISION,
    "respondedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "waterfall_position_id" TEXT,

    CONSTRAINT "load_tenders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."load_tracking_events" (
    "id" TEXT NOT NULL,
    "load_id" TEXT NOT NULL,
    "stop_id" TEXT,
    "event_type" "public"."TrackingEventType" NOT NULL,
    "status_from" "public"."LoadStatus",
    "status_to" "public"."LoadStatus",
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "location_city" VARCHAR(100),
    "location_state" VARCHAR(2),
    "location_source" "public"."LocationSource",
    "eta_destination" TIMESTAMP(3),
    "temperature_f" DECIMAL(5,1),
    "alert_level" "public"."AlertLevel",
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "load_tracking_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."loads" (
    "id" TEXT NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "status" "public"."LoadStatus" NOT NULL DEFAULT 'POSTED',
    "originCity" TEXT NOT NULL,
    "originState" TEXT NOT NULL,
    "originZip" TEXT NOT NULL,
    "destCity" TEXT NOT NULL,
    "destState" TEXT NOT NULL,
    "destZip" TEXT NOT NULL,
    "weight" DOUBLE PRECISION,
    "equipmentType" TEXT NOT NULL,
    "commodity" TEXT,
    "rate" DOUBLE PRECISION NOT NULL,
    "distance" DOUBLE PRECISION,
    "notes" TEXT,
    "pickupDate" TIMESTAMP(3) NOT NULL,
    "deliveryDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "posterId" TEXT NOT NULL,
    "carrierId" TEXT,
    "bondType" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "customsRequired" BOOLEAN NOT NULL DEFAULT false,
    "freightClass" TEXT,
    "hazmat" BOOLEAN NOT NULL DEFAULT false,
    "height" DOUBLE PRECISION,
    "length" DOUBLE PRECISION,
    "pieces" INTEGER,
    "specialInstructions" TEXT,
    "tempMax" DOUBLE PRECISION,
    "tempMin" DOUBLE PRECISION,
    "width" DOUBLE PRECISION,
    "customerId" TEXT,
    "driverId" TEXT,
    "trailerId" TEXT,
    "truckId" TEXT,
    "actualDeliveryDatetime" TIMESTAMP(3),
    "actualPickupDatetime" TIMESTAMP(3),
    "assignmentType" "public"."AssignmentType",
    "bolUrl" TEXT,
    "borderCrossingPoint" TEXT,
    "carrierConfirmedAt" TIMESTAMP(3),
    "carrierDispatcherName" TEXT,
    "carrierDispatcherPhone" TEXT,
    "carrierPaymentMethod" "public"."CarrierPaymentMethod",
    "carrierPaymentTier" "public"."PaymentTier",
    "carrierRate" DOUBLE PRECISION,
    "checkCallFrequency" TEXT DEFAULT '4 hours',
    "costPerMile" DOUBLE PRECISION,
    "customerRate" DOUBLE PRECISION,
    "customsBrokerName" TEXT,
    "customsBrokerPhone" TEXT,
    "deliveryAppointment" TEXT,
    "deliveryHours" TEXT,
    "deliveryInstructions" TEXT,
    "deliveryReference" TEXT,
    "deliveryTimeEnd" TEXT,
    "deliveryTimeStart" TEXT,
    "destAddress" TEXT,
    "destCompany" TEXT,
    "destContactName" TEXT,
    "destContactPhone" TEXT,
    "dimensionsHeight" DOUBLE PRECISION,
    "dimensionsLength" DOUBLE PRECISION,
    "dimensionsWidth" DOUBLE PRECISION,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "extraStopPay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fuelSurcharge" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fuelSurchargeType" "public"."FuelSurchargeType" NOT NULL DEFAULT 'FLAT',
    "grossMargin" DOUBLE PRECISION,
    "hazmatClass" TEXT,
    "hazmatEmergencyContact" TEXT,
    "hazmatPlacardRequired" BOOLEAN NOT NULL DEFAULT false,
    "hazmatUnNumber" TEXT,
    "isMultiStop" BOOLEAN NOT NULL DEFAULT false,
    "loadNumber" TEXT,
    "loadingType" TEXT,
    "marginPerMile" DOUBLE PRECISION,
    "marginPercent" DOUBLE PRECISION,
    "noBrokerClause" BOOLEAN NOT NULL DEFAULT true,
    "originAddress" TEXT,
    "originCompany" TEXT,
    "originContactName" TEXT,
    "originContactPhone" TEXT,
    "pallets" INTEGER,
    "parsPapsNumber" TEXT,
    "pickupHours" TEXT,
    "pickupInstructions" TEXT,
    "pickupNumber" TEXT,
    "pickupTimeEnd" TEXT,
    "pickupTimeStart" TEXT,
    "podReceivedAt" TIMESTAMP(3),
    "podSigned" BOOLEAN NOT NULL DEFAULT false,
    "podUrl" TEXT,
    "quickPayFeePercent" DOUBLE PRECISION,
    "rateConfirmationPdfUrl" TEXT,
    "rateType" "public"."RateType" NOT NULL DEFAULT 'FLAT',
    "revenuePerMile" DOUBLE PRECISION,
    "shipmentType" "public"."ShipmentType" NOT NULL DEFAULT 'DOMESTIC',
    "shipperPoNumber" TEXT,
    "shipperReference" TEXT,
    "stackable" BOOLEAN NOT NULL DEFAULT true,
    "statusUpdatedAt" TIMESTAMP(3),
    "statusUpdatedById" TEXT,
    "stops" JSONB,
    "tempContinuousMonitoring" BOOLEAN NOT NULL DEFAULT false,
    "temperatureControlled" BOOLEAN NOT NULL DEFAULT false,
    "tenderedAt" TIMESTAMP(3),
    "tenderedById" TEXT,
    "termsConditions" TEXT,
    "totalCarrierPay" DOUBLE PRECISION,
    "trailerLength" TEXT,
    "trailerNumber" TEXT,
    "truckNumber" TEXT,
    "unloadingType" TEXT,
    "accessorials" JSONB,
    "datPostId" TEXT,
    "datPostedAt" TIMESTAMP(3),
    "datPostedFields" JSONB,
    "trackingToken" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "cancellationReason" TEXT,
    "customer_ref" TEXT,
    "hookType" "public"."HookType",
    "urgency_level" VARCHAR(20) NOT NULL DEFAULT 'STANDARD',
    "consigneeFacility" TEXT,
    "shipperFacility" TEXT,
    "additionalRefs" JSONB,
    "appointmentNumber" TEXT,
    "bolNumber" TEXT,
    "codAmount" DOUBLE PRECISION,
    "declaredValue" DOUBLE PRECISION,
    "dockAssignment" TEXT,
    "driverInstructions" TEXT,
    "nmfcCode" TEXT,
    "paymentTermsLoad" TEXT,
    "poNumbers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sealNumber" TEXT,
    "turnable" BOOLEAN NOT NULL DEFAULT false,
    "contactEmail" TEXT,
    "glCode" TEXT,
    "glDepartment" TEXT,
    "region_origin" VARCHAR(32),
    "region_destination" VARCHAR(32),
    "shipper_code" VARCHAR(10),
    "pod_verified" BOOLEAN NOT NULL DEFAULT false,
    "customer_invoiced" BOOLEAN NOT NULL DEFAULT false,
    "carrier_settled" BOOLEAN NOT NULL DEFAULT false,
    "closed_at" TIMESTAMP(3),
    "tracking_link_sent" BOOLEAN NOT NULL DEFAULT false,
    "dispatch_method" VARCHAR(20),
    "visibility" VARCHAR(20) NOT NULL DEFAULT 'waterfall',
    "waterfall_mode" VARCHAR(20),
    "direct_tender_carrier_id" TEXT,
    "dispatched_at" TIMESTAMP(3),
    "dispatched_carrier_id" TEXT,
    "fallback_chain_started_at" TIMESTAMP(3),
    "fallback_posted_to_loadboard_at" TIMESTAMP(3),
    "fallback_posted_to_dat_at" TIMESTAMP(3),
    "mode" VARCHAR(10),
    "driver_mode" VARCHAR(10),
    "live_or_drop" VARCHAR(10),
    "cargo_value" DOUBLE PRECISION,
    "temp_mode" VARCHAR(20),
    "fuel_surcharge_amount" DOUBLE PRECISION,
    "target_carrier_cost" DOUBLE PRECISION,
    "customer_rate_per_mile" DOUBLE PRECISION,
    "lumper_estimate" DOUBLE PRECISION,
    "origin_facility_id" TEXT,
    "dest_facility_id" TEXT,
    "origin_lat" DECIMAL(10,6),
    "origin_lng" DECIMAL(10,6),
    "dest_lat" DECIMAL(10,6),
    "dest_lng" DECIMAL(10,6),
    "check_call_protocol" VARCHAR(20) NOT NULL DEFAULT 'standard',
    "shipment_priority" VARCHAR(20) NOT NULL DEFAULT 'standard',
    "is_hot_load" BOOLEAN NOT NULL DEFAULT false,
    "tracking_link_auto_send" BOOLEAN NOT NULL DEFAULT true,
    "order_id" TEXT,
    "proNumber" TEXT,
    "releasedValueDeclared" BOOLEAN NOT NULL DEFAULT false,
    "releasedValueBasis" "public"."ReleasedValueBasis",
    "piecesTendered" INTEGER,
    "piecesReceived" INTEGER,

    CONSTRAINT "loads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."marco_polo_conversations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "messagesJson" JSONB NOT NULL DEFAULT '[]',
    "console" TEXT NOT NULL DEFAULT 'ae',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marco_polo_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."match_results" (
    "id" TEXT NOT NULL,
    "loadId" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "matchScore" DOUBLE PRECISION NOT NULL,
    "laneScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rateScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "availabilityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "breakdown" JSONB,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "wasAssigned" BOOLEAN NOT NULL DEFAULT false,
    "wasCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cppScore" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "match_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."matching_outcomes" (
    "id" TEXT NOT NULL,
    "loadId" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "matchScore" DOUBLE PRECISION NOT NULL,
    "outcome" TEXT NOT NULL,
    "factors" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matching_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."messages" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "loadId" TEXT,
    "content" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."mileage_cache" (
    "id" TEXT NOT NULL,
    "origin_hash" TEXT NOT NULL,
    "destination_hash" TEXT NOT NULL,
    "origin_text" TEXT NOT NULL,
    "destination_text" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "practical_miles" DOUBLE PRECISION NOT NULL,
    "shortest_miles" DOUBLE PRECISION,
    "drive_time_hours" DOUBLE PRECISION NOT NULL,
    "toll_cost" DOUBLE PRECISION,
    "route_type" TEXT NOT NULL,
    "cached_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mileage_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "actionUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "link" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."orders" (
    "id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "customer_id" TEXT,
    "status" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "form_data" JSONB NOT NULL DEFAULT '{}',
    "customer_rate" DOUBLE PRECISION,
    "target_cost" DOUBLE PRECISION,
    "equipment_type" VARCHAR(50),
    "origin_city" VARCHAR(100),
    "origin_state" VARCHAR(50),
    "dest_city" VARCHAR(100),
    "dest_state" VARCHAR(50),
    "pickup_date" TIMESTAMP(3),
    "delivery_date" TIMESTAMP(3),
    "dispatch_method" VARCHAR(20),
    "load_id" TEXT,
    "quote_sent_at" TIMESTAMP(3),
    "quote_approved_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."otp_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."payment_disputes" (
    "id" TEXT NOT NULL,
    "disputeNumber" TEXT,
    "carrierPaymentId" TEXT NOT NULL,
    "loadId" TEXT,
    "carrierId" TEXT,
    "disputeType" "public"."DisputeType" NOT NULL,
    "disputedAmount" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "status" "public"."DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "investigationNotes" TEXT,
    "proposedResolution" TEXT,
    "proposedAmount" DOUBLE PRECISION,
    "resolutionNotes" TEXT,
    "resolutionAmount" DOUBLE PRECISION,
    "filedById" TEXT NOT NULL,
    "resolvedById" TEXT,
    "filedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."rate_confirmations" (
    "id" TEXT NOT NULL,
    "loadId" TEXT NOT NULL,
    "formData" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "sentAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "carrierRate" DOUBLE PRECISION,
    "fuelSurcharge" DOUBLE PRECISION,
    "accessorialTotal" DOUBLE PRECISION,
    "totalCharges" DOUBLE PRECISION,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "pdfUrl" TEXT,
    "rateConNumber" TEXT,
    "sentToEmail" TEXT,
    "signed" BOOLEAN NOT NULL DEFAULT false,
    "signedUrl" TEXT,

    CONSTRAINT "rate_confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."rate_intelligence" (
    "id" TEXT NOT NULL,
    "lane_key" TEXT NOT NULL,
    "equipment_type" TEXT NOT NULL,
    "avg_rate" DOUBLE PRECISION NOT NULL,
    "min_rate" DOUBLE PRECISION NOT NULL,
    "max_rate" DOUBLE PRECISION NOT NULL,
    "median_rate" DOUBLE PRECISION NOT NULL,
    "std_dev" DOUBLE PRECISION NOT NULL,
    "sample_size" INTEGER NOT NULL,
    "trend" TEXT NOT NULL DEFAULT 'STABLE',
    "trend_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "predicted_rate" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "seasonal_factor" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "day_of_week_factor" JSONB,
    "last_trained_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_intelligence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."recommendation_logs" (
    "id" TEXT NOT NULL,
    "loadId" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "matchScore" DOUBLE PRECISION NOT NULL,
    "factors" JSONB NOT NULL DEFAULT '{}',
    "outcome" TEXT NOT NULL DEFAULT 'PENDING',
    "recommendedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "recommendation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."rfp_bids" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "public"."RfpStatus" NOT NULL DEFAULT 'OPEN',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "lanes" JSONB NOT NULL,
    "totalLanes" INTEGER NOT NULL,
    "respondedLanes" INTEGER NOT NULL DEFAULT 0,
    "responses" JSONB,
    "awardedAt" TIMESTAMP(3),
    "awardedById" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "rfp_bids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."risk_logs" (
    "id" TEXT NOT NULL,
    "loadId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "level" TEXT NOT NULL,
    "factors" JSONB NOT NULL,
    "notified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."routing_guide_entries" (
    "id" TEXT NOT NULL,
    "routingGuideId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "carrierId" TEXT NOT NULL,
    "targetRate" DOUBLE PRECISION,
    "rateType" "public"."RateType" NOT NULL DEFAULT 'FLAT',
    "fuelSurcharge" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "transitDays" INTEGER,
    "acceptanceRate" DOUBLE PRECISION,
    "onTimePct" DOUBLE PRECISION,
    "totalLoads" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "routing_guide_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."routing_guides" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "originState" TEXT NOT NULL,
    "originCity" TEXT,
    "destState" TEXT NOT NULL,
    "destCity" TEXT,
    "equipmentType" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'FTL',
    "customerId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expirationDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "routing_guides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."scheduler_locks" (
    "id" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduler_locks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."settlements" (
    "id" TEXT NOT NULL,
    "settlementNumber" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "period" "public"."SettlementPeriod" NOT NULL,
    "grossPay" DOUBLE PRECISION NOT NULL,
    "deductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netSettlement" DOUBLE PRECISION NOT NULL,
    "status" "public"."SettlementStatus" NOT NULL DEFAULT 'DRAFT',
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."shipment_risk_logs" (
    "id" TEXT NOT NULL,
    "loadId" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "riskFactorsJson" JSONB NOT NULL DEFAULT '{}',
    "alertSent" BOOLEAN NOT NULL DEFAULT false,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_risk_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."shipments" (
    "id" TEXT NOT NULL,
    "shipmentNumber" TEXT NOT NULL,
    "proNumber" TEXT,
    "bolNumber" TEXT,
    "status" "public"."ShipmentStatus" NOT NULL DEFAULT 'PENDING',
    "originCity" TEXT NOT NULL,
    "originState" TEXT NOT NULL,
    "originZip" TEXT NOT NULL,
    "destCity" TEXT NOT NULL,
    "destState" TEXT NOT NULL,
    "destZip" TEXT NOT NULL,
    "weight" DOUBLE PRECISION,
    "pieces" INTEGER,
    "commodity" TEXT,
    "equipmentType" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "distance" DOUBLE PRECISION,
    "specialInstructions" TEXT,
    "pickupDate" TIMESTAMP(3) NOT NULL,
    "deliveryDate" TIMESTAMP(3) NOT NULL,
    "actualPickup" TIMESTAMP(3),
    "actualDelivery" TIMESTAMP(3),
    "customerId" TEXT,
    "driverId" TEXT,
    "equipmentId" TEXT,
    "lastLocation" TEXT,
    "lastLocationAt" TIMESTAMP(3),
    "eta" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "loadId" TEXT,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."shipper_credits" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "creditGrade" "public"."CreditGrade" NOT NULL DEFAULT 'B',
    "creditLimit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentUtilized" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentTerms" "public"."ShipperPaymentTerms" NOT NULL DEFAULT 'NET30',
    "avgDaysToPay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalInvoices" INTEGER NOT NULL DEFAULT 0,
    "onTimePayments" INTEGER NOT NULL DEFAULT 0,
    "latePayments" INTEGER NOT NULL DEFAULT 0,
    "lastCreditReview" TIMESTAMP(3),
    "autoBlocked" BOOLEAN NOT NULL DEFAULT false,
    "blockedReason" TEXT,
    "blockedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipper_credits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."shipper_tracking_tokens" (
    "id" TEXT NOT NULL,
    "load_id" TEXT NOT NULL,
    "token" VARCHAR(12) NOT NULL,
    "shipper_id" TEXT NOT NULL,
    "access_level" "public"."TrackingAccessLevel" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_accessed_at" TIMESTAMP(3),
    "access_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "shipper_tracking_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."sops" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT,
    "fileUrl" TEXT,
    "pages" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."system_logs" (
    "id" TEXT NOT NULL,
    "logType" "public"."LogType" NOT NULL,
    "severity" "public"."LogSeverity" NOT NULL DEFAULT 'INFO',
    "source" TEXT NOT NULL,
    "endpoint" TEXT,
    "userId" TEXT,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "ipAddress" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."system_metrics" (
    "id" TEXT NOT NULL,
    "metric_name" TEXT NOT NULL,
    "metric_value" DOUBLE PRECISION NOT NULL,
    "previous_value" DOUBLE PRECISION,
    "change_percent" DOUBLE PRECISION,
    "category" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "metadata" JSONB,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tag_assignments" (
    "id" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "assignedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tag_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tag_rules" (
    "id" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tag_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6B7280',
    "description" TEXT,
    "entityTypes" TEXT[] DEFAULT ARRAY['LOAD']::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."token_blacklist" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'logout',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_blacklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."trailers" (
    "id" TEXT NOT NULL,
    "unitNumber" TEXT NOT NULL,
    "type" "public"."TrailerType" NOT NULL DEFAULT 'DRY_VAN',
    "year" INTEGER,
    "make" TEXT,
    "model" TEXT,
    "vin" TEXT,
    "licensePlate" TEXT,
    "licensePlateState" TEXT,
    "length" INTEGER,
    "capacity" INTEGER,
    "ownershipType" "public"."OwnershipType" NOT NULL DEFAULT 'COMPANY',
    "status" "public"."AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "registrationExpiry" TIMESTAMP(3),
    "lastInspectionDate" TIMESTAMP(3),
    "nextInspectionDate" TIMESTAMP(3),
    "reeferUnit" BOOLEAN NOT NULL DEFAULT false,
    "reeferModel" TEXT,
    "reeferHours" INTEGER,
    "assignedDriverId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trailers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."trucks" (
    "id" TEXT NOT NULL,
    "unitNumber" TEXT NOT NULL,
    "type" "public"."TruckType" NOT NULL DEFAULT 'SLEEPER',
    "year" INTEGER,
    "make" TEXT,
    "model" TEXT,
    "vin" TEXT,
    "licensePlate" TEXT,
    "licensePlateState" TEXT,
    "color" TEXT,
    "fuelType" TEXT DEFAULT 'Diesel',
    "ownershipType" "public"."OwnershipType" NOT NULL DEFAULT 'COMPANY',
    "status" "public"."AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "mileage" INTEGER NOT NULL DEFAULT 0,
    "registrationExpiry" TIMESTAMP(3),
    "lastInspectionDate" TIMESTAMP(3),
    "nextInspectionDate" TIMESTAMP(3),
    "insuranceExpiry" TIMESTAMP(3),
    "ifta" BOOLEAN NOT NULL DEFAULT false,
    "iftaExpiry" TIMESTAMP(3),
    "lastServiceDate" TIMESTAMP(3),
    "nextServiceDate" TIMESTAMP(3),
    "nextServiceMileage" INTEGER,
    "assignedDriverId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "vinBodyClass" TEXT,
    "vinDecodedMake" TEXT,
    "vinDecodedModel" TEXT,
    "vinDecodedYear" INTEGER,
    "vinGvwr" TEXT,
    "vinModelYear" TEXT,
    "vinPlantCountry" TEXT,
    "vinVerificationStatus" "public"."VinVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "vinVerifiedAt" TIMESTAMP(3),

    CONSTRAINT "trucks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "company" TEXT,
    "role" "public"."UserRole" NOT NULL,
    "phone" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "passwordChangedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLogin" TIMESTAMP(3),
    "darkMode" BOOLEAN NOT NULL DEFAULT false,
    "preferredTheme" TEXT NOT NULL DEFAULT 'silk-route-classic',
    "totpBackupCodes" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "totpSecret" TEXT,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "preferences" JSONB,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."vetting_reports" (
    "id" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "grade" "public"."VettingGrade" NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "checksJson" JSONB NOT NULL,
    "flagsJson" JSONB,
    "fmcsaSnapshot" JSONB,
    "identityData" JSONB,
    "previousScore" INTEGER,
    "scoreDelta" INTEGER,
    "trendDirection" TEXT,
    "triggeredBy" TEXT,
    "vettingType" TEXT NOT NULL DEFAULT 'FULL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "triggeredByUserId" TEXT,

    CONSTRAINT "vetting_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."waterfall_positions" (
    "id" TEXT NOT NULL,
    "waterfall_id" TEXT NOT NULL,
    "carrier_id" TEXT,
    "position" INTEGER NOT NULL,
    "match_score" DECIMAL(5,2),
    "offered_rate" DECIMAL(10,2),
    "offered_rate_per_mile" DECIMAL(8,2),
    "margin_amount" DECIMAL(10,2),
    "margin_percent" DECIMAL(5,2),
    "status" VARCHAR(20) NOT NULL DEFAULT 'queued',
    "tender_sent_at" TIMESTAMP(3),
    "tender_expires_at" TIMESTAMP(3),
    "responded_at" TIMESTAMP(3),
    "decline_reason" TEXT,
    "is_fallback" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waterfall_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."waterfalls" (
    "id" TEXT NOT NULL,
    "load_id" TEXT NOT NULL,
    "mode" VARCHAR(20) NOT NULL DEFAULT 'full_auto',
    "status" VARCHAR(20) NOT NULL DEFAULT 'building',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "completed_carrier_id" TEXT,
    "total_positions" INTEGER NOT NULL DEFAULT 0,
    "current_position" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waterfalls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."webhook_endpoints" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[],
    "headers" JSONB,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT NOT NULL,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "lastFiredAt" TIMESTAMP(3),
    "lastStatus" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."website_leads" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "originCity" TEXT,
    "originState" TEXT,
    "destCity" TEXT,
    "destState" TEXT,
    "equipment" TEXT,
    "weight" TEXT,
    "pickupDate" TEXT,
    "details" TEXT,
    "inquiryType" TEXT,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "notes" TEXT,
    "assignedTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "website_leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NewsArticle_category_idx" ON "public"."NewsArticle"("category" ASC);

-- CreateIndex
CREATE INDEX "NewsArticle_featured_idx" ON "public"."NewsArticle"("featured" ASC);

-- CreateIndex
CREATE INDEX "NewsArticle_publishedAt_idx" ON "public"."NewsArticle"("publishedAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "NewsArticle_slug_key" ON "public"."NewsArticle"("slug" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "NewsArticle_sourceUrl_key" ON "public"."NewsArticle"("sourceUrl" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "NewsSource_name_key" ON "public"."NewsSource"("name" ASC);

-- CreateIndex
CREATE INDEX "address_book_companyName_idx" ON "public"."address_book"("companyName" ASC);

-- CreateIndex
CREATE INDEX "address_book_state_idx" ON "public"."address_book"("state" ASC);

-- CreateIndex
CREATE INDEX "address_book_type_idx" ON "public"."address_book"("type" ASC);

-- CreateIndex
CREATE INDEX "address_book_usageCount_idx" ON "public"."address_book"("usageCount" DESC);

-- CreateIndex
CREATE INDEX "ai_api_usage_createdAt_idx" ON "public"."ai_api_usage"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "ai_api_usage_model_idx" ON "public"."ai_api_usage"("model" ASC);

-- CreateIndex
CREATE INDEX "ai_api_usage_provider_idx" ON "public"."ai_api_usage"("provider" ASC);

-- CreateIndex
CREATE INDEX "ai_api_usage_queryType_idx" ON "public"."ai_api_usage"("queryType" ASC);

-- CreateIndex
CREATE INDEX "ai_api_usage_source_idx" ON "public"."ai_api_usage"("source" ASC);

-- CreateIndex
CREATE INDEX "ai_api_usage_userId_idx" ON "public"."ai_api_usage"("userId" ASC);

-- CreateIndex
CREATE INDEX "ai_learning_cycles_service_name_idx" ON "public"."ai_learning_cycles"("service_name" ASC);

-- CreateIndex
CREATE INDEX "ai_learning_cycles_started_at_idx" ON "public"."ai_learning_cycles"("started_at" ASC);

-- CreateIndex
CREATE INDEX "ai_learning_logs_createdAt_idx" ON "public"."ai_learning_logs"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "ai_learning_logs_eventType_idx" ON "public"."ai_learning_logs"("eventType" ASC);

-- CreateIndex
CREATE INDEX "ai_learning_logs_serviceName_idx" ON "public"."ai_learning_logs"("serviceName" ASC);

-- CreateIndex
CREATE INDEX "anomaly_logs_createdAt_idx" ON "public"."anomaly_logs"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "anomaly_logs_entityType_entityId_idx" ON "public"."anomaly_logs"("entityType" ASC, "entityId" ASC);

-- CreateIndex
CREATE INDEX "anomaly_logs_severity_idx" ON "public"."anomaly_logs"("severity" ASC);

-- CreateIndex
CREATE INDEX "anomaly_logs_status_idx" ON "public"."anomaly_logs"("status" ASC);

-- CreateIndex
CREATE INDEX "approval_queue_referenceId_idx" ON "public"."approval_queue"("referenceId" ASC);

-- CreateIndex
CREATE INDEX "approval_queue_requestedById_idx" ON "public"."approval_queue"("requestedById" ASC);

-- CreateIndex
CREATE INDEX "approval_queue_status_idx" ON "public"."approval_queue"("status" ASC);

-- CreateIndex
CREATE INDEX "approval_queue_type_idx" ON "public"."approval_queue"("type" ASC);

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "public"."audit_logs"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "public"."audit_logs"("entity" ASC, "entityId" ASC);

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "public"."audit_logs"("userId" ASC);

-- CreateIndex
CREATE INDEX "audit_trails_entityType_entityId_idx" ON "public"."audit_trails"("entityType" ASC, "entityId" ASC);

-- CreateIndex
CREATE INDEX "audit_trails_performedAt_idx" ON "public"."audit_trails"("performedAt" ASC);

-- CreateIndex
CREATE INDEX "automation_events_createdAt_idx" ON "public"."automation_events"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "automation_events_entityType_entityId_idx" ON "public"."automation_events"("entityType" ASC, "entityId" ASC);

-- CreateIndex
CREATE INDEX "automation_events_source_idx" ON "public"."automation_events"("source" ASC);

-- CreateIndex
CREATE INDEX "automation_events_type_idx" ON "public"."automation_events"("type" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "broker_integrations_provider_key" ON "public"."broker_integrations"("provider" ASC);

-- CreateIndex
CREATE INDEX "carrier_agreements_carrierId_idx" ON "public"."carrier_agreements"("carrierId" ASC);

-- CreateIndex
CREATE INDEX "carrier_agreements_status_idx" ON "public"."carrier_agreements"("status" ASC);

-- CreateIndex
CREATE INDEX "carrier_bonuses_carrierId_idx" ON "public"."carrier_bonuses"("carrierId" ASC);

-- CreateIndex
CREATE INDEX "carrier_call_logs_calledById_idx" ON "public"."carrier_call_logs"("calledById" ASC);

-- CreateIndex
CREATE INDEX "carrier_call_logs_carrierId_idx" ON "public"."carrier_call_logs"("carrierId" ASC);

-- CreateIndex
CREATE INDEX "carrier_call_logs_loadId_idx" ON "public"."carrier_call_logs"("loadId" ASC);

-- CreateIndex
CREATE INDEX "carrier_fingerprints_addressHash_idx" ON "public"."carrier_fingerprints"("addressHash" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "carrier_fingerprints_carrierId_key" ON "public"."carrier_fingerprints"("carrierId" ASC);

-- CreateIndex
CREATE INDEX "carrier_fingerprints_dotHash_idx" ON "public"."carrier_fingerprints"("dotHash" ASC);

-- CreateIndex
CREATE INDEX "carrier_fingerprints_einHash_idx" ON "public"."carrier_fingerprints"("einHash" ASC);

-- CreateIndex
CREATE INDEX "carrier_fingerprints_emailHash_idx" ON "public"."carrier_fingerprints"("emailHash" ASC);

-- CreateIndex
CREATE INDEX "carrier_fingerprints_ipHash_idx" ON "public"."carrier_fingerprints"("ipHash" ASC);

-- CreateIndex
CREATE INDEX "carrier_fingerprints_phoneHash_idx" ON "public"."carrier_fingerprints"("phoneHash" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "carrier_identity_verifications_carrierId_key" ON "public"."carrier_identity_verifications"("carrierId" ASC);

-- CreateIndex
CREATE INDEX "carrier_identity_verifications_identityStatus_idx" ON "public"."carrier_identity_verifications"("identityStatus" ASC);

-- CreateIndex
CREATE INDEX "carrier_intelligence_carrier_id_idx" ON "public"."carrier_intelligence"("carrier_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "carrier_intelligence_carrier_id_lane_key_key" ON "public"."carrier_intelligence"("carrier_id" ASC, "lane_key" ASC);

-- CreateIndex
CREATE INDEX "carrier_intelligence_composite_score_idx" ON "public"."carrier_intelligence"("composite_score" ASC);

-- CreateIndex
CREATE INDEX "carrier_intelligence_reliability_score_idx" ON "public"."carrier_intelligence"("reliability_score" ASC);

-- CreateIndex
CREATE INDEX "carrier_intelligence_tier_idx" ON "public"."carrier_intelligence"("tier" ASC);

-- CreateIndex
CREATE INDEX "carrier_pays_carrierId_status_idx" ON "public"."carrier_pays"("carrierId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "carrier_pays_dueDate_idx" ON "public"."carrier_pays"("dueDate" ASC);

-- CreateIndex
CREATE INDEX "carrier_pays_loadId_idx" ON "public"."carrier_pays"("loadId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "carrier_pays_paymentNumber_key" ON "public"."carrier_pays"("paymentNumber" ASC);

-- CreateIndex
CREATE INDEX "carrier_pays_paymentTier_idx" ON "public"."carrier_pays"("paymentTier" ASC);

-- CreateIndex
CREATE INDEX "carrier_pays_status_idx" ON "public"."carrier_pays"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "carrier_preferences_carrierId_key" ON "public"."carrier_preferences"("carrierId" ASC);

-- CreateIndex
CREATE INDEX "carrier_profiles_chameleonRiskLevel_idx" ON "public"."carrier_profiles"("chameleonRiskLevel" ASC);

-- CreateIndex
CREATE INDEX "carrier_profiles_cppTier_idx" ON "public"."carrier_profiles"("cppTier" ASC);

-- CreateIndex
CREATE INDEX "carrier_profiles_dotNumber_idx" ON "public"."carrier_profiles"("dotNumber" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "carrier_profiles_dotNumber_key" ON "public"."carrier_profiles"("dotNumber" ASC);

-- CreateIndex
CREATE INDEX "carrier_profiles_mcNumber_idx" ON "public"."carrier_profiles"("mcNumber" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "carrier_profiles_mcNumber_key" ON "public"."carrier_profiles"("mcNumber" ASC);

-- CreateIndex
CREATE INDEX "carrier_profiles_source_idx" ON "public"."carrier_profiles"("source" ASC);

-- CreateIndex
CREATE INDEX "carrier_profiles_status_idx" ON "public"."carrier_profiles"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "carrier_profiles_userId_key" ON "public"."carrier_profiles"("userId" ASC);

-- CreateIndex
CREATE INDEX "carrier_profiles_vettingGrade_idx" ON "public"."carrier_profiles"("vettingGrade" ASC);

-- CreateIndex
CREATE INDEX "carrier_scorecards_carrierId_period_idx" ON "public"."carrier_scorecards"("carrierId" ASC, "period" ASC);

-- CreateIndex
CREATE INDEX "chameleon_matches_carrierId_idx" ON "public"."chameleon_matches"("carrierId" ASC);

-- CreateIndex
CREATE INDEX "chameleon_matches_matchedCarrierId_idx" ON "public"."chameleon_matches"("matchedCarrierId" ASC);

-- CreateIndex
CREATE INDEX "chameleon_matches_status_idx" ON "public"."chameleon_matches"("status" ASC);

-- CreateIndex
CREATE INDEX "check_call_schedules_loadId_idx" ON "public"."check_call_schedules"("loadId" ASC);

-- CreateIndex
CREATE INDEX "check_call_schedules_status_scheduledTime_idx" ON "public"."check_call_schedules"("status" ASC, "scheduledTime" ASC);

-- CreateIndex
CREATE INDEX "check_calls_loadId_createdAt_idx" ON "public"."check_calls"("loadId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "claims_claimNumber_key" ON "public"."claims"("claimNumber" ASC);

-- CreateIndex
CREATE INDEX "claims_claimType_idx" ON "public"."claims"("claimType" ASC);

-- CreateIndex
CREATE INDEX "claims_loadId_idx" ON "public"."claims"("loadId" ASC);

-- CreateIndex
CREATE INDEX "claims_status_idx" ON "public"."claims"("status" ASC);

-- CreateIndex
CREATE INDEX "communications_createdAt_idx" ON "public"."communications"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "communications_entityType_entityId_idx" ON "public"."communications"("entityType" ASC, "entityId" ASC);

-- CreateIndex
CREATE INDEX "communications_loadId_idx" ON "public"."communications"("loadId" ASC);

-- CreateIndex
CREATE INDEX "communications_userId_idx" ON "public"."communications"("userId" ASC);

-- CreateIndex
CREATE INDEX "compliance_alerts_entityType_entityId_idx" ON "public"."compliance_alerts"("entityType" ASC, "entityId" ASC);

-- CreateIndex
CREATE INDEX "compliance_alerts_expiryDate_idx" ON "public"."compliance_alerts"("expiryDate" ASC);

-- CreateIndex
CREATE INDEX "compliance_alerts_status_severity_idx" ON "public"."compliance_alerts"("status" ASC, "severity" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "compliance_forecast_carrier_id_key" ON "public"."compliance_forecast"("carrier_id" ASC);

-- CreateIndex
CREATE INDEX "compliance_forecast_overall_risk_idx" ON "public"."compliance_forecast"("overall_risk" ASC);

-- CreateIndex
CREATE INDEX "compliance_notes_carrierId_idx" ON "public"."compliance_notes"("carrierId" ASC);

-- CreateIndex
CREATE INDEX "compliance_overrides_carrierId_idx" ON "public"."compliance_overrides"("carrierId" ASC);

-- CreateIndex
CREATE INDEX "compliance_overrides_expiresAt_idx" ON "public"."compliance_overrides"("expiresAt" ASC);

-- CreateIndex
CREATE INDEX "compliance_reminders_carrierId_idx" ON "public"."compliance_reminders"("carrierId" ASC);

-- CreateIndex
CREATE INDEX "compliance_reminders_sentAt_idx" ON "public"."compliance_reminders"("sentAt" ASC);

-- CreateIndex
CREATE INDEX "compliance_scans_carrierId_idx" ON "public"."compliance_scans"("carrierId" ASC);

-- CreateIndex
CREATE INDEX "compliance_scans_scannedAt_idx" ON "public"."compliance_scans"("scannedAt" ASC);

-- CreateIndex
CREATE INDEX "contract_rates_customerId_idx" ON "public"."contract_rates"("customerId" ASC);

-- CreateIndex
CREATE INDEX "contract_rates_originState_destState_equipmentType_idx" ON "public"."contract_rates"("originState" ASC, "destState" ASC, "equipmentType" ASC);

-- CreateIndex
CREATE INDEX "contract_rates_status_idx" ON "public"."contract_rates"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "cron_registry_jobName_key" ON "public"."cron_registry"("jobName" ASC);

-- CreateIndex
CREATE INDEX "customer_activity_customer_id_created_at_idx" ON "public"."customer_activity"("customer_id" ASC, "created_at" ASC);

-- CreateIndex
CREATE INDEX "customer_activity_event_type_idx" ON "public"."customer_activity"("event_type" ASC);

-- CreateIndex
CREATE INDEX "customer_contacts_customerId_idx" ON "public"."customer_contacts"("customerId" ASC);

-- CreateIndex
CREATE INDEX "customer_contacts_do_not_contact_idx" ON "public"."customer_contacts"("do_not_contact" ASC);

-- CreateIndex
CREATE INDEX "customer_contacts_receives_tracking_link_idx" ON "public"."customer_contacts"("receives_tracking_link" ASC);

-- CreateIndex
CREATE INDEX "customer_facilities_customer_id_idx" ON "public"."customer_facilities"("customer_id" ASC);

-- CreateIndex
CREATE INDEX "customer_intelligence_churn_risk_idx" ON "public"."customer_intelligence"("churn_risk" ASC);

-- CreateIndex
CREATE INDEX "customer_intelligence_credit_score_idx" ON "public"."customer_intelligence"("credit_score" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "customer_intelligence_customer_id_key" ON "public"."customer_intelligence"("customer_id" ASC);

-- CreateIndex
CREATE INDEX "customer_intelligence_engagement_score_idx" ON "public"."customer_intelligence"("engagement_score" ASC);

-- CreateIndex
CREATE INDEX "customer_notes_customer_id_note_type_idx" ON "public"."customer_notes"("customer_id" ASC, "note_type" ASC);

-- CreateIndex
CREATE INDEX "customer_notes_facility_id_idx" ON "public"."customer_notes"("facility_id" ASC);

-- CreateIndex
CREATE INDEX "customers_status_idx" ON "public"."customers"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "customers_userId_key" ON "public"."customers"("userId" ASC);

-- CreateIndex
CREATE INDEX "demand_forecasts_confidence_idx" ON "public"."demand_forecasts"("confidence" ASC);

-- CreateIndex
CREATE INDEX "demand_forecasts_forecastDate_idx" ON "public"."demand_forecasts"("forecastDate" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "demand_forecasts_laneKey_equipmentType_forecastDate_key" ON "public"."demand_forecasts"("laneKey" ASC, "equipmentType" ASC, "forecastDate" ASC);

-- CreateIndex
CREATE INDEX "detention_records_load_id_idx" ON "public"."detention_records"("load_id" ASC);

-- CreateIndex
CREATE INDEX "dock_schedules_appointmentDate_idx" ON "public"."dock_schedules"("appointmentDate" ASC);

-- CreateIndex
CREATE INDEX "dock_schedules_facilityName_idx" ON "public"."dock_schedules"("facilityName" ASC);

-- CreateIndex
CREATE INDEX "dock_schedules_loadId_idx" ON "public"."dock_schedules"("loadId" ASC);

-- CreateIndex
CREATE INDEX "dock_schedules_status_idx" ON "public"."dock_schedules"("status" ASC);

-- CreateIndex
CREATE INDEX "documents_entityType_entityId_idx" ON "public"."documents"("entityType" ASC, "entityId" ASC);

-- CreateIndex
CREATE INDEX "documents_loadId_docType_idx" ON "public"."documents"("loadId" ASC, "docType" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "drivers_assignedEquipmentId_key" ON "public"."drivers"("assignedEquipmentId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "drivers_assignedTrailerId_key" ON "public"."drivers"("assignedTrailerId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "drivers_assignedTruckId_key" ON "public"."drivers"("assignedTruckId" ASC);

-- CreateIndex
CREATE INDEX "edi_transactions_loadId_idx" ON "public"."edi_transactions"("loadId" ASC);

-- CreateIndex
CREATE INDEX "edi_transactions_transactionSet_status_idx" ON "public"."edi_transactions"("transactionSet" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "eld_device_mappings_carrier_id_idx" ON "public"."eld_device_mappings"("carrier_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "eld_device_mappings_provider_external_vehicle_id_key" ON "public"."eld_device_mappings"("provider" ASC, "external_vehicle_id" ASC);

-- CreateIndex
CREATE INDEX "eld_events_created_at_idx" ON "public"."eld_events"("created_at" ASC);

-- CreateIndex
CREATE INDEX "eld_events_event_type_idx" ON "public"."eld_events"("event_type" ASC);

-- CreateIndex
CREATE INDEX "eld_events_load_id_idx" ON "public"."eld_events"("load_id" ASC);

-- CreateIndex
CREATE INDEX "eld_events_provider_vehicle_id_idx" ON "public"."eld_events"("provider" ASC, "vehicle_id" ASC);

-- CreateIndex
CREATE INDEX "email_quote_logs_createdAt_idx" ON "public"."email_quote_logs"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "email_quote_logs_outcome_idx" ON "public"."email_quote_logs"("outcome" ASC);

-- CreateIndex
CREATE INDEX "email_sequences_prospectId_idx" ON "public"."email_sequences"("prospectId" ASC);

-- CreateIndex
CREATE INDEX "email_sequences_status_nextSendAt_idx" ON "public"."email_sequences"("status" ASC, "nextSendAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "equipment_unitNumber_key" ON "public"."equipment"("unitNumber" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "equipment_vin_key" ON "public"."equipment"("vin" ASC);

-- CreateIndex
CREATE INDEX "error_logs_createdAt_idx" ON "public"."error_logs"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "error_logs_errorType_idx" ON "public"."error_logs"("errorType" ASC);

-- CreateIndex
CREATE INDEX "error_logs_userId_idx" ON "public"."error_logs"("userId" ASC);

-- CreateIndex
CREATE INDEX "exception_alerts_configId_idx" ON "public"."exception_alerts"("configId" ASC);

-- CreateIndex
CREATE INDEX "exception_alerts_entityType_entityId_idx" ON "public"."exception_alerts"("entityType" ASC, "entityId" ASC);

-- CreateIndex
CREATE INDEX "exception_alerts_loadId_idx" ON "public"."exception_alerts"("loadId" ASC);

-- CreateIndex
CREATE INDEX "exception_alerts_status_idx" ON "public"."exception_alerts"("status" ASC);

-- CreateIndex
CREATE INDEX "exception_configs_category_idx" ON "public"."exception_configs"("category" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "exception_configs_code_key" ON "public"."exception_configs"("code" ASC);

-- CreateIndex
CREATE INDEX "exception_configs_isEnabled_idx" ON "public"."exception_configs"("isEnabled" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "facility_profiles_address_city_state_key" ON "public"."facility_profiles"("address" ASC, "city" ASC, "state" ASC);

-- CreateIndex
CREATE INDEX "facility_profiles_avgOverall_idx" ON "public"."facility_profiles"("avgOverall" ASC);

-- CreateIndex
CREATE INDEX "facility_profiles_zip_idx" ON "public"."facility_profiles"("zip" ASC);

-- CreateIndex
CREATE INDEX "facility_ratings_carrierId_idx" ON "public"."facility_ratings"("carrierId" ASC);

-- CreateIndex
CREATE INDEX "facility_ratings_facilityAddress_idx" ON "public"."facility_ratings"("facilityAddress" ASC);

-- CreateIndex
CREATE INDEX "facility_ratings_facilityZip_idx" ON "public"."facility_ratings"("facilityZip" ASC);

-- CreateIndex
CREATE INDEX "factoring_fund_createdAt_idx" ON "public"."factoring_fund"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "factoring_fund_transactionType_idx" ON "public"."factoring_fund"("transactionType" ASC);

-- CreateIndex
CREATE INDEX "fall_off_events_loadId_idx" ON "public"."fall_off_events"("loadId" ASC);

-- CreateIndex
CREATE INDEX "fall_off_events_status_idx" ON "public"."fall_off_events"("status" ASC);

-- CreateIndex
CREATE INDEX "financial_reports_periodStart_periodEnd_idx" ON "public"."financial_reports"("periodStart" ASC, "periodEnd" ASC);

-- CreateIndex
CREATE INDEX "financial_reports_reportType_idx" ON "public"."financial_reports"("reportType" ASC);

-- CreateIndex
CREATE INDEX "fraud_reports_carrierId_idx" ON "public"."fraud_reports"("carrierId" ASC);

-- CreateIndex
CREATE INDEX "fraud_reports_category_idx" ON "public"."fraud_reports"("category" ASC);

-- CreateIndex
CREATE INDEX "fraud_reports_reportedById_idx" ON "public"."fraud_reports"("reportedById" ASC);

-- CreateIndex
CREATE INDEX "fraud_reports_status_idx" ON "public"."fraud_reports"("status" ASC);

-- CreateIndex
CREATE INDEX "fuel_surcharge_tables_isActive_idx" ON "public"."fuel_surcharge_tables"("isActive" ASC);

-- CreateIndex
CREATE INDEX "fuel_surcharge_tiers_tableId_idx" ON "public"."fuel_surcharge_tiers"("tableId" ASC);

-- CreateIndex
CREATE INDEX "geofence_events_load_id_occurred_at_idx" ON "public"."geofence_events"("load_id" ASC, "occurred_at" ASC);

-- CreateIndex
CREATE INDEX "instant_book_logs_accepted_idx" ON "public"."instant_book_logs"("accepted" ASC);

-- CreateIndex
CREATE INDEX "instant_book_logs_loadId_idx" ON "public"."instant_book_logs"("loadId" ASC);

-- CreateIndex
CREATE INDEX "invoice_line_items_invoiceId_idx" ON "public"."invoice_line_items"("invoiceId" ASC);

-- CreateIndex
CREATE INDEX "invoices_dueDate_idx" ON "public"."invoices"("dueDate" ASC);

-- CreateIndex
CREATE INDEX "invoices_invoiceNumber_idx" ON "public"."invoices"("invoiceNumber" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoiceNumber_key" ON "public"."invoices"("invoiceNumber" ASC);

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "public"."invoices"("status" ASC);

-- CreateIndex
CREATE INDEX "invoices_userId_status_idx" ON "public"."invoices"("userId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "lane_intelligence_demand_idx" ON "public"."lane_intelligence"("demand" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "lane_intelligence_lane_key_key" ON "public"."lane_intelligence"("lane_key" ASC);

-- CreateIndex
CREATE INDEX "lane_intelligence_origin_state_dest_state_idx" ON "public"."lane_intelligence"("origin_state" ASC, "dest_state" ASC);

-- CreateIndex
CREATE INDEX "lane_rate_intelligence_confidence_idx" ON "public"."lane_rate_intelligence"("confidence" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "lane_rate_intelligence_originZip_destZip_equipmentType_key" ON "public"."lane_rate_intelligence"("originZip" ASC, "destZip" ASC, "equipmentType" ASC);

-- CreateIndex
CREATE INDEX "lane_rate_intelligence_updatedAt_idx" ON "public"."lane_rate_intelligence"("updatedAt" ASC);

-- CreateIndex
CREATE INDEX "learning_event_queue_createdAt_idx" ON "public"."learning_event_queue"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "learning_event_queue_eventType_idx" ON "public"."learning_event_queue"("eventType" ASC);

-- CreateIndex
CREATE INDEX "learning_event_queue_status_idx" ON "public"."learning_event_queue"("status" ASC);

-- CreateIndex
CREATE INDEX "load_accessorials_load_id_idx" ON "public"."load_accessorials"("load_id" ASC);

-- CreateIndex
CREATE INDEX "load_accessorials_status_idx" ON "public"."load_accessorials"("status" ASC);

-- CreateIndex
CREATE INDEX "load_activity_event_type_idx" ON "public"."load_activity"("event_type" ASC);

-- CreateIndex
CREATE INDEX "load_activity_load_id_created_at_idx" ON "public"."load_activity"("load_id" ASC, "created_at" ASC);

-- CreateIndex
CREATE INDEX "load_bids_carrier_id_idx" ON "public"."load_bids"("carrier_id" ASC);

-- CreateIndex
CREATE INDEX "load_bids_load_id_status_idx" ON "public"."load_bids"("load_id" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "load_delays_loadId_idx" ON "public"."load_delays"("loadId" ASC);

-- CreateIndex
CREATE INDEX "load_delays_reasonCode_idx" ON "public"."load_delays"("reasonCode" ASC);

-- CreateIndex
CREATE INDEX "load_delays_reportedAt_idx" ON "public"."load_delays"("reportedAt" ASC);

-- CreateIndex
CREATE INDEX "load_exceptions_category_idx" ON "public"."load_exceptions"("category" ASC);

-- CreateIndex
CREATE INDEX "load_exceptions_load_id_idx" ON "public"."load_exceptions"("load_id" ASC);

-- CreateIndex
CREATE INDEX "load_exceptions_status_idx" ON "public"."load_exceptions"("status" ASC);

-- CreateIndex
CREATE INDEX "load_line_items_load_id_idx" ON "public"."load_line_items"("load_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "load_line_items_load_id_line_number_key" ON "public"."load_line_items"("load_id" ASC, "line_number" ASC);

-- CreateIndex
CREATE INDEX "load_notes_load_id_created_at_idx" ON "public"."load_notes"("load_id" ASC, "created_at" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "load_quickpay_overrides_loadId_key" ON "public"."load_quickpay_overrides"("loadId" ASC);

-- CreateIndex
CREATE INDEX "load_quickpay_overrides_overriddenAt_idx" ON "public"."load_quickpay_overrides"("overriddenAt" ASC);

-- CreateIndex
CREATE INDEX "load_quickpay_overrides_reason_idx" ON "public"."load_quickpay_overrides"("reason" ASC);

-- CreateIndex
CREATE INDEX "load_stops_load_id_idx" ON "public"."load_stops"("load_id" ASC);

-- CreateIndex
CREATE INDEX "load_stops_load_id_stop_number_idx" ON "public"."load_stops"("load_id" ASC, "stop_number" ASC);

-- CreateIndex
CREATE INDEX "load_tenders_carrierId_status_idx" ON "public"."load_tenders"("carrierId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "load_tenders_loadId_idx" ON "public"."load_tenders"("loadId" ASC);

-- CreateIndex
CREATE INDEX "load_tenders_waterfall_position_id_idx" ON "public"."load_tenders"("waterfall_position_id" ASC);

-- CreateIndex
CREATE INDEX "load_tracking_events_alert_level_idx" ON "public"."load_tracking_events"("alert_level" ASC);

-- CreateIndex
CREATE INDEX "load_tracking_events_event_type_idx" ON "public"."load_tracking_events"("event_type" ASC);

-- CreateIndex
CREATE INDEX "load_tracking_events_load_id_created_at_idx" ON "public"."load_tracking_events"("load_id" ASC, "created_at" ASC);

-- CreateIndex
CREATE INDEX "load_tracking_events_load_id_idx" ON "public"."load_tracking_events"("load_id" ASC);

-- CreateIndex
CREATE INDEX "loads_carrierId_idx" ON "public"."loads"("carrierId" ASC);

-- CreateIndex
CREATE INDEX "loads_customerId_idx" ON "public"."loads"("customerId" ASC);

-- CreateIndex
CREATE INDEX "loads_deletedAt_idx" ON "public"."loads"("deletedAt" ASC);

-- CreateIndex
CREATE INDEX "loads_deliveryDate_idx" ON "public"."loads"("deliveryDate" ASC);

-- CreateIndex
CREATE INDEX "loads_destState_idx" ON "public"."loads"("destState" ASC);

-- CreateIndex
CREATE INDEX "loads_dispatch_method_waterfall_mode_status_idx" ON "public"."loads"("dispatch_method" ASC, "waterfall_mode" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "loads_loadNumber_idx" ON "public"."loads"("loadNumber" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "loads_loadNumber_key" ON "public"."loads"("loadNumber" ASC);

-- CreateIndex
CREATE INDEX "loads_originState_idx" ON "public"."loads"("originState" ASC);

-- CreateIndex
CREATE INDEX "loads_pickupDate_idx" ON "public"."loads"("pickupDate" ASC);

-- CreateIndex
CREATE INDEX "loads_posterId_idx" ON "public"."loads"("posterId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "loads_referenceNumber_key" ON "public"."loads"("referenceNumber" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "loads_shipper_code_key" ON "public"."loads"("shipper_code" ASC);

-- CreateIndex
CREATE INDEX "loads_statusUpdatedAt_idx" ON "public"."loads"("statusUpdatedAt" ASC);

-- CreateIndex
CREATE INDEX "loads_status_createdAt_idx" ON "public"."loads"("status" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "loads_status_idx" ON "public"."loads"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "loads_trackingToken_key" ON "public"."loads"("trackingToken" ASC);

-- CreateIndex
CREATE INDEX "loads_visibility_idx" ON "public"."loads"("visibility" ASC);

-- CreateIndex
CREATE INDEX "marco_polo_conversations_updatedAt_idx" ON "public"."marco_polo_conversations"("updatedAt" ASC);

-- CreateIndex
CREATE INDEX "marco_polo_conversations_userId_idx" ON "public"."marco_polo_conversations"("userId" ASC);

-- CreateIndex
CREATE INDEX "match_results_carrierId_idx" ON "public"."match_results"("carrierId" ASC);

-- CreateIndex
CREATE INDEX "match_results_loadId_idx" ON "public"."match_results"("loadId" ASC);

-- CreateIndex
CREATE INDEX "matching_outcomes_createdAt_idx" ON "public"."matching_outcomes"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "matching_outcomes_outcome_idx" ON "public"."matching_outcomes"("outcome" ASC);

-- CreateIndex
CREATE INDEX "messages_receiverId_readAt_idx" ON "public"."messages"("receiverId" ASC, "readAt" ASC);

-- CreateIndex
CREATE INDEX "messages_senderId_receiverId_idx" ON "public"."messages"("senderId" ASC, "receiverId" ASC);

-- CreateIndex
CREATE INDEX "mileage_cache_expires_at_idx" ON "public"."mileage_cache"("expires_at" ASC);

-- CreateIndex
CREATE INDEX "mileage_cache_origin_hash_destination_hash_idx" ON "public"."mileage_cache"("origin_hash" ASC, "destination_hash" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "mileage_cache_origin_hash_destination_hash_provider_key" ON "public"."mileage_cache"("origin_hash" ASC, "destination_hash" ASC, "provider" ASC);

-- CreateIndex
CREATE INDEX "notifications_createdAt_idx" ON "public"."notifications"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_idx" ON "public"."notifications"("userId" ASC, "readAt" ASC);

-- CreateIndex
CREATE INDEX "notifications_userId_read_idx" ON "public"."notifications"("userId" ASC, "read" ASC);

-- CreateIndex
CREATE INDEX "orders_created_by_id_status_idx" ON "public"."orders"("created_by_id" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "orders_customer_id_idx" ON "public"."orders"("customer_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_number_key" ON "public"."orders"("order_number" ASC);

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "public"."orders"("status" ASC);

-- CreateIndex
CREATE INDEX "otp_codes_userId_used_idx" ON "public"."otp_codes"("userId" ASC, "used" ASC);

-- CreateIndex
CREATE INDEX "payment_disputes_carrierPaymentId_idx" ON "public"."payment_disputes"("carrierPaymentId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "payment_disputes_disputeNumber_key" ON "public"."payment_disputes"("disputeNumber" ASC);

-- CreateIndex
CREATE INDEX "payment_disputes_status_idx" ON "public"."payment_disputes"("status" ASC);

-- CreateIndex
CREATE INDEX "rate_confirmations_loadId_idx" ON "public"."rate_confirmations"("loadId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "rate_confirmations_rateConNumber_key" ON "public"."rate_confirmations"("rateConNumber" ASC);

-- CreateIndex
CREATE INDEX "rate_confirmations_status_idx" ON "public"."rate_confirmations"("status" ASC);

-- CreateIndex
CREATE INDEX "rate_confirmations_totalCharges_idx" ON "public"."rate_confirmations"("totalCharges" ASC);

-- CreateIndex
CREATE INDEX "rate_intelligence_equipment_type_idx" ON "public"."rate_intelligence"("equipment_type" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "rate_intelligence_lane_key_equipment_type_key" ON "public"."rate_intelligence"("lane_key" ASC, "equipment_type" ASC);

-- CreateIndex
CREATE INDEX "rate_intelligence_lane_key_idx" ON "public"."rate_intelligence"("lane_key" ASC);

-- CreateIndex
CREATE INDEX "recommendation_logs_carrierId_idx" ON "public"."recommendation_logs"("carrierId" ASC);

-- CreateIndex
CREATE INDEX "recommendation_logs_loadId_idx" ON "public"."recommendation_logs"("loadId" ASC);

-- CreateIndex
CREATE INDEX "recommendation_logs_outcome_idx" ON "public"."recommendation_logs"("outcome" ASC);

-- CreateIndex
CREATE INDEX "rfp_bids_customerId_idx" ON "public"."rfp_bids"("customerId" ASC);

-- CreateIndex
CREATE INDEX "rfp_bids_status_idx" ON "public"."rfp_bids"("status" ASC);

-- CreateIndex
CREATE INDEX "risk_logs_createdAt_idx" ON "public"."risk_logs"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "risk_logs_level_idx" ON "public"."risk_logs"("level" ASC);

-- CreateIndex
CREATE INDEX "risk_logs_loadId_idx" ON "public"."risk_logs"("loadId" ASC);

-- CreateIndex
CREATE INDEX "routing_guide_entries_carrierId_idx" ON "public"."routing_guide_entries"("carrierId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "routing_guide_entries_routingGuideId_carrierId_key" ON "public"."routing_guide_entries"("routingGuideId" ASC, "carrierId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "routing_guide_entries_routingGuideId_rank_key" ON "public"."routing_guide_entries"("routingGuideId" ASC, "rank" ASC);

-- CreateIndex
CREATE INDEX "routing_guides_customerId_idx" ON "public"."routing_guides"("customerId" ASC);

-- CreateIndex
CREATE INDEX "routing_guides_isActive_idx" ON "public"."routing_guides"("isActive" ASC);

-- CreateIndex
CREATE INDEX "routing_guides_originState_destState_equipmentType_idx" ON "public"."routing_guides"("originState" ASC, "destState" ASC, "equipmentType" ASC);

-- CreateIndex
CREATE INDEX "settlements_carrierId_status_idx" ON "public"."settlements"("carrierId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "settlements_periodStart_periodEnd_idx" ON "public"."settlements"("periodStart" ASC, "periodEnd" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "settlements_settlementNumber_key" ON "public"."settlements"("settlementNumber" ASC);

-- CreateIndex
CREATE INDEX "shipment_risk_logs_loadId_idx" ON "public"."shipment_risk_logs"("loadId" ASC);

-- CreateIndex
CREATE INDEX "shipment_risk_logs_riskLevel_idx" ON "public"."shipment_risk_logs"("riskLevel" ASC);

-- CreateIndex
CREATE INDEX "shipment_risk_logs_scannedAt_idx" ON "public"."shipment_risk_logs"("scannedAt" ASC);

-- CreateIndex
CREATE INDEX "shipments_customerId_idx" ON "public"."shipments"("customerId" ASC);

-- CreateIndex
CREATE INDEX "shipments_driverId_idx" ON "public"."shipments"("driverId" ASC);

-- CreateIndex
CREATE INDEX "shipments_loadId_idx" ON "public"."shipments"("loadId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "shipments_proNumber_key" ON "public"."shipments"("proNumber" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "shipments_shipmentNumber_key" ON "public"."shipments"("shipmentNumber" ASC);

-- CreateIndex
CREATE INDEX "shipments_status_idx" ON "public"."shipments"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "shipper_credits_customerId_key" ON "public"."shipper_credits"("customerId" ASC);

-- CreateIndex
CREATE INDEX "shipper_tracking_tokens_load_id_idx" ON "public"."shipper_tracking_tokens"("load_id" ASC);

-- CreateIndex
CREATE INDEX "shipper_tracking_tokens_token_idx" ON "public"."shipper_tracking_tokens"("token" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "shipper_tracking_tokens_token_key" ON "public"."shipper_tracking_tokens"("token" ASC);

-- CreateIndex
CREATE INDEX "sops_category_idx" ON "public"."sops"("category" ASC);

-- CreateIndex
CREATE INDEX "system_logs_createdAt_idx" ON "public"."system_logs"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "system_logs_logType_idx" ON "public"."system_logs"("logType" ASC);

-- CreateIndex
CREATE INDEX "system_logs_severity_idx" ON "public"."system_logs"("severity" ASC);

-- CreateIndex
CREATE INDEX "system_metrics_category_idx" ON "public"."system_metrics"("category" ASC);

-- CreateIndex
CREATE INDEX "system_metrics_metric_name_recorded_at_idx" ON "public"."system_metrics"("metric_name" ASC, "recorded_at" ASC);

-- CreateIndex
CREATE INDEX "tag_assignments_entityType_entityId_idx" ON "public"."tag_assignments"("entityType" ASC, "entityId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "tag_assignments_tagId_entityType_entityId_key" ON "public"."tag_assignments"("tagId" ASC, "entityType" ASC, "entityId" ASC);

-- CreateIndex
CREATE INDEX "tag_rules_tagId_idx" ON "public"."tag_rules"("tagId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "public"."tags"("name" ASC);

-- CreateIndex
CREATE INDEX "token_blacklist_expiresAt_idx" ON "public"."token_blacklist"("expiresAt" ASC);

-- CreateIndex
CREATE INDEX "token_blacklist_tokenHash_idx" ON "public"."token_blacklist"("tokenHash" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "token_blacklist_tokenHash_key" ON "public"."token_blacklist"("tokenHash" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "trailers_assignedDriverId_key" ON "public"."trailers"("assignedDriverId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "trailers_unitNumber_key" ON "public"."trailers"("unitNumber" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "trailers_vin_key" ON "public"."trailers"("vin" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "trucks_assignedDriverId_key" ON "public"."trucks"("assignedDriverId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "trucks_unitNumber_key" ON "public"."trucks"("unitNumber" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "trucks_vin_key" ON "public"."trucks"("vin" ASC);

-- CreateIndex
CREATE INDEX "users_company_idx" ON "public"."users"("company" ASC);

-- CreateIndex
CREATE INDEX "users_email_idx" ON "public"."users"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email" ASC);

-- CreateIndex
CREATE INDEX "users_isActive_role_idx" ON "public"."users"("isActive" ASC, "role" ASC);

-- CreateIndex
CREATE INDEX "users_role_idx" ON "public"."users"("role" ASC);

-- CreateIndex
CREATE INDEX "vetting_reports_carrierId_idx" ON "public"."vetting_reports"("carrierId" ASC);

-- CreateIndex
CREATE INDEX "vetting_reports_createdAt_idx" ON "public"."vetting_reports"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "vetting_reports_grade_idx" ON "public"."vetting_reports"("grade" ASC);

-- CreateIndex
CREATE INDEX "waterfall_positions_carrier_id_idx" ON "public"."waterfall_positions"("carrier_id" ASC);

-- CreateIndex
CREATE INDEX "waterfall_positions_status_tender_expires_at_idx" ON "public"."waterfall_positions"("status" ASC, "tender_expires_at" ASC);

-- CreateIndex
CREATE INDEX "waterfall_positions_waterfall_id_position_idx" ON "public"."waterfall_positions"("waterfall_id" ASC, "position" ASC);

-- CreateIndex
CREATE INDEX "waterfalls_load_id_idx" ON "public"."waterfalls"("load_id" ASC);

-- CreateIndex
CREATE INDEX "waterfalls_status_idx" ON "public"."waterfalls"("status" ASC);

-- CreateIndex
CREATE INDEX "webhook_endpoints_isEnabled_deletedAt_idx" ON "public"."webhook_endpoints"("isEnabled" ASC, "deletedAt" ASC);

-- CreateIndex
CREATE INDEX "webhook_endpoints_userId_idx" ON "public"."webhook_endpoints"("userId" ASC);

-- CreateIndex
CREATE INDEX "website_leads_createdAt_idx" ON "public"."website_leads"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "website_leads_status_idx" ON "public"."website_leads"("status" ASC);

-- CreateIndex
CREATE INDEX "website_leads_type_idx" ON "public"."website_leads"("type" ASC);

-- AddForeignKey
ALTER TABLE "public"."approval_queue" ADD CONSTRAINT "approval_queue_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."approval_queue" ADD CONSTRAINT "approval_queue_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."audit_trails" ADD CONSTRAINT "audit_trails_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."carrier_agreements" ADD CONSTRAINT "carrier_agreements_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "public"."carrier_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."carrier_bonuses" ADD CONSTRAINT "carrier_bonuses_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "public"."carrier_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."carrier_call_logs" ADD CONSTRAINT "carrier_call_logs_calledById_fkey" FOREIGN KEY ("calledById") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."carrier_call_logs" ADD CONSTRAINT "carrier_call_logs_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "public"."carrier_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."carrier_fingerprints" ADD CONSTRAINT "carrier_fingerprints_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "public"."carrier_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."carrier_identity_verifications" ADD CONSTRAINT "carrier_identity_verifications_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "public"."carrier_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."carrier_intelligence" ADD CONSTRAINT "carrier_intelligence_carrier_id_fkey" FOREIGN KEY ("carrier_id") REFERENCES "public"."carrier_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."carrier_pays" ADD CONSTRAINT "carrier_pays_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."carrier_pays" ADD CONSTRAINT "carrier_pays_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."carrier_pays" ADD CONSTRAINT "carrier_pays_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "public"."loads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."carrier_pays" ADD CONSTRAINT "carrier_pays_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."carrier_pays" ADD CONSTRAINT "carrier_pays_rateConfirmationId_fkey" FOREIGN KEY ("rateConfirmationId") REFERENCES "public"."rate_confirmations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."carrier_pays" ADD CONSTRAINT "carrier_pays_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."carrier_pays" ADD CONSTRAINT "carrier_pays_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "public"."settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."carrier_profiles" ADD CONSTRAINT "carrier_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."carrier_scorecards" ADD CONSTRAINT "carrier_scorecards_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "public"."carrier_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."chameleon_matches" ADD CONSTRAINT "chameleon_matches_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "public"."carrier_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."chameleon_matches" ADD CONSTRAINT "chameleon_matches_matchedCarrierId_fkey" FOREIGN KEY ("matchedCarrierId") REFERENCES "public"."carrier_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."check_call_schedules" ADD CONSTRAINT "check_call_schedules_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "public"."loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."check_calls" ADD CONSTRAINT "check_calls_calledById_fkey" FOREIGN KEY ("calledById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."check_calls" ADD CONSTRAINT "check_calls_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "public"."loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."claims" ADD CONSTRAINT "claims_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."claims" ADD CONSTRAINT "claims_filedById_fkey" FOREIGN KEY ("filedById") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."claims" ADD CONSTRAINT "claims_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "public"."loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."communications" ADD CONSTRAINT "communications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."compliance_forecast" ADD CONSTRAINT "compliance_forecast_carrier_id_fkey" FOREIGN KEY ("carrier_id") REFERENCES "public"."carrier_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."compliance_notes" ADD CONSTRAINT "compliance_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."compliance_notes" ADD CONSTRAINT "compliance_notes_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "public"."carrier_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."compliance_overrides" ADD CONSTRAINT "compliance_overrides_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."compliance_overrides" ADD CONSTRAINT "compliance_overrides_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "public"."carrier_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."compliance_reminders" ADD CONSTRAINT "compliance_reminders_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "public"."carrier_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."compliance_scans" ADD CONSTRAINT "compliance_scans_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "public"."carrier_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."contract_rates" ADD CONSTRAINT "contract_rates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."contract_rates" ADD CONSTRAINT "contract_rates_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."customer_activity" ADD CONSTRAINT "customer_activity_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."customer_contacts" ADD CONSTRAINT "customer_contacts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."customer_facilities" ADD CONSTRAINT "customer_facilities_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."customer_intelligence" ADD CONSTRAINT "customer_intelligence_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."customer_notes" ADD CONSTRAINT "customer_notes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."customer_notes" ADD CONSTRAINT "customer_notes_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "public"."customer_facilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."customers" ADD CONSTRAINT "customers_account_rep_id_fkey" FOREIGN KEY ("account_rep_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."customers" ADD CONSTRAINT "customers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."detention_records" ADD CONSTRAINT "detention_records_load_id_fkey" FOREIGN KEY ("load_id") REFERENCES "public"."loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."dock_schedules" ADD CONSTRAINT "dock_schedules_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "public"."carrier_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."dock_schedules" ADD CONSTRAINT "dock_schedules_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."documents" ADD CONSTRAINT "documents_exception_id_fkey" FOREIGN KEY ("exception_id") REFERENCES "public"."load_exceptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."documents" ADD CONSTRAINT "documents_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "public"."invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."documents" ADD CONSTRAINT "documents_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "public"."loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."documents" ADD CONSTRAINT "documents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."drivers" ADD CONSTRAINT "drivers_assignedEquipmentId_fkey" FOREIGN KEY ("assignedEquipmentId") REFERENCES "public"."equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."drivers" ADD CONSTRAINT "drivers_assignedTrailerId_fkey" FOREIGN KEY ("assignedTrailerId") REFERENCES "public"."trailers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."drivers" ADD CONSTRAINT "drivers_assignedTruckId_fkey" FOREIGN KEY ("assignedTruckId") REFERENCES "public"."trucks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."edi_transactions" ADD CONSTRAINT "edi_transactions_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "public"."loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."eld_device_mappings" ADD CONSTRAINT "eld_device_mappings_carrier_id_fkey" FOREIGN KEY ("carrier_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."eld_events" ADD CONSTRAINT "eld_events_load_id_fkey" FOREIGN KEY ("load_id") REFERENCES "public"."loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."error_logs" ADD CONSTRAINT "error_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."exception_alerts" ADD CONSTRAINT "exception_alerts_configId_fkey" FOREIGN KEY ("configId") REFERENCES "public"."exception_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."exception_alerts" ADD CONSTRAINT "exception_alerts_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."factoring_fund" ADD CONSTRAINT "factoring_fund_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."fall_off_events" ADD CONSTRAINT "fall_off_events_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "public"."loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."financial_reports" ADD CONSTRAINT "financial_reports_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."fraud_reports" ADD CONSTRAINT "fraud_reports_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "public"."carrier_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."fraud_reports" ADD CONSTRAINT "fraud_reports_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."fuel_surcharge_tables" ADD CONSTRAINT "fuel_surcharge_tables_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."fuel_surcharge_tiers" ADD CONSTRAINT "fuel_surcharge_tiers_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "public"."fuel_surcharge_tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."geofence_events" ADD CONSTRAINT "geofence_events_load_id_fkey" FOREIGN KEY ("load_id") REFERENCES "public"."loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "public"."invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."invoices" ADD CONSTRAINT "invoices_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."invoices" ADD CONSTRAINT "invoices_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "public"."loads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."invoices" ADD CONSTRAINT "invoices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."load_accessorials" ADD CONSTRAINT "load_accessorials_load_id_fkey" FOREIGN KEY ("load_id") REFERENCES "public"."loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."load_accessorials" ADD CONSTRAINT "load_accessorials_stop_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "public"."load_stops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."load_activity" ADD CONSTRAINT "load_activity_load_id_fkey" FOREIGN KEY ("load_id") REFERENCES "public"."loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."load_bids" ADD CONSTRAINT "load_bids_load_id_fkey" FOREIGN KEY ("load_id") REFERENCES "public"."loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."load_delays" ADD CONSTRAINT "load_delays_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "public"."loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."load_delays" ADD CONSTRAINT "load_delays_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."load_exceptions" ADD CONSTRAINT "load_exceptions_load_id_fkey" FOREIGN KEY ("load_id") REFERENCES "public"."loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."load_line_items" ADD CONSTRAINT "load_line_items_load_id_fkey" FOREIGN KEY ("load_id") REFERENCES "public"."loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."load_notes" ADD CONSTRAINT "load_notes_load_id_fkey" FOREIGN KEY ("load_id") REFERENCES "public"."loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."load_quickpay_overrides" ADD CONSTRAINT "load_quickpay_overrides_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "public"."loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."load_stops" ADD CONSTRAINT "load_stops_load_id_fkey" FOREIGN KEY ("load_id") REFERENCES "public"."loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."load_tenders" ADD CONSTRAINT "load_tenders_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "public"."carrier_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."load_tenders" ADD CONSTRAINT "load_tenders_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "public"."loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."load_tenders" ADD CONSTRAINT "load_tenders_waterfall_position_id_fkey" FOREIGN KEY ("waterfall_position_id") REFERENCES "public"."waterfall_positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."load_tracking_events" ADD CONSTRAINT "load_tracking_events_load_id_fkey" FOREIGN KEY ("load_id") REFERENCES "public"."loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."load_tracking_events" ADD CONSTRAINT "load_tracking_events_stop_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "public"."load_stops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."loads" ADD CONSTRAINT "loads_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."loads" ADD CONSTRAINT "loads_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."loads" ADD CONSTRAINT "loads_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "public"."drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."loads" ADD CONSTRAINT "loads_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."loads" ADD CONSTRAINT "loads_posterId_fkey" FOREIGN KEY ("posterId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."loads" ADD CONSTRAINT "loads_statusUpdatedById_fkey" FOREIGN KEY ("statusUpdatedById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."loads" ADD CONSTRAINT "loads_tenderedById_fkey" FOREIGN KEY ("tenderedById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."loads" ADD CONSTRAINT "loads_trailerId_fkey" FOREIGN KEY ("trailerId") REFERENCES "public"."trailers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."loads" ADD CONSTRAINT "loads_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "public"."trucks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."marco_polo_conversations" ADD CONSTRAINT "marco_polo_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."match_results" ADD CONSTRAINT "match_results_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "public"."loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "public"."loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."otp_codes" ADD CONSTRAINT "otp_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."payment_disputes" ADD CONSTRAINT "payment_disputes_carrierPaymentId_fkey" FOREIGN KEY ("carrierPaymentId") REFERENCES "public"."carrier_pays"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."payment_disputes" ADD CONSTRAINT "payment_disputes_filedById_fkey" FOREIGN KEY ("filedById") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."payment_disputes" ADD CONSTRAINT "payment_disputes_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."rate_confirmations" ADD CONSTRAINT "rate_confirmations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."rate_confirmations" ADD CONSTRAINT "rate_confirmations_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "public"."loads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."rfp_bids" ADD CONSTRAINT "rfp_bids_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."rfp_bids" ADD CONSTRAINT "rfp_bids_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."risk_logs" ADD CONSTRAINT "risk_logs_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "public"."loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."routing_guide_entries" ADD CONSTRAINT "routing_guide_entries_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "public"."carrier_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."routing_guide_entries" ADD CONSTRAINT "routing_guide_entries_routingGuideId_fkey" FOREIGN KEY ("routingGuideId") REFERENCES "public"."routing_guides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."routing_guides" ADD CONSTRAINT "routing_guides_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."routing_guides" ADD CONSTRAINT "routing_guides_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."settlements" ADD CONSTRAINT "settlements_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."shipments" ADD CONSTRAINT "shipments_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."shipments" ADD CONSTRAINT "shipments_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "public"."drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."shipments" ADD CONSTRAINT "shipments_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "public"."equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."shipments" ADD CONSTRAINT "shipments_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "public"."loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."shipper_credits" ADD CONSTRAINT "shipper_credits_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."shipper_tracking_tokens" ADD CONSTRAINT "shipper_tracking_tokens_load_id_fkey" FOREIGN KEY ("load_id") REFERENCES "public"."loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."system_logs" ADD CONSTRAINT "system_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tag_assignments" ADD CONSTRAINT "tag_assignments_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "public"."tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tag_rules" ADD CONSTRAINT "tag_rules_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "public"."tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vetting_reports" ADD CONSTRAINT "vetting_reports_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "public"."carrier_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vetting_reports" ADD CONSTRAINT "vetting_reports_triggeredByUserId_fkey" FOREIGN KEY ("triggeredByUserId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."waterfall_positions" ADD CONSTRAINT "waterfall_positions_waterfall_id_fkey" FOREIGN KEY ("waterfall_id") REFERENCES "public"."waterfalls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."waterfalls" ADD CONSTRAINT "waterfalls_load_id_fkey" FOREIGN KEY ("load_id") REFERENCES "public"."loads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

