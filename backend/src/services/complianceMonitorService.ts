/**
 * Compliance Monitor Service
 * Core enforcement logic for the SRL Compliance Console.
 *
 * - complianceCheck: gate-check before carrier assignment
 * - getDashboardData: KPIs for the compliance dashboard
 * - getOverviewMatrix: carrier-level compliance matrix
 * - getCarrierCompliance: full detail for a single carrier
 * - runFmcsaScan / weeklyFmcsaScan: FMCSA verification
 * - dailyComplianceReminders: tiered email reminders
 */

import { prisma } from "../config/database";
import { verifyCarrierWithFMCSA } from "./fmcsaService";
import { sendEmail } from "./emailService";

// ────────────────────────────────────────────────────────────
// complianceCheck — called before carrier assignment
// ────────────────────────────────────────────────────────────

export async function complianceCheck(carrierId: string): Promise<{
  allowed: boolean;
  blocked_reasons: string[];
  warnings: string[];
}> {
  const carrier = await prisma.carrierProfile.findUnique({
    where: { id: carrierId },
    include: { user: { select: { company: true, firstName: true, lastName: true } } },
  });

  if (!carrier) {
    return { allowed: false, blocked_reasons: ["Carrier not found"], warnings: [] };
  }

  const blocked_reasons: string[] = [];
  const warnings: string[] = [];
  const now = new Date();

  // Check active overrides first (not expired)
  const activeOverride = await prisma.complianceOverride.findFirst({
    where: {
      carrierId,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
  });

  if (activeOverride) {
    return { allowed: true, blocked_reasons: [], warnings: ["Active compliance override in effect"] };
  }

  // HARD BLOCK: carrier suspended or deactivated
  if (carrier.onboardingStatus === "SUSPENDED") {
    blocked_reasons.push("Carrier is suspended");
  }
  if (carrier.onboardingStatus === "REJECTED") {
    blocked_reasons.push("Carrier application rejected");
  }

  // HARD BLOCK: expired insurance (auto/cargo)
  if (carrier.insuranceExpiry && carrier.insuranceExpiry <= now) {
    blocked_reasons.push("Insurance has expired");
  }

  // HARD BLOCK: FMCSA authority revoked or out of service
  if (carrier.fmcsaAuthorityStatus) {
    const status = carrier.fmcsaAuthorityStatus.toUpperCase();
    if (status === "REVOKED" || status === "NOT AUTHORIZED") {
      blocked_reasons.push("FMCSA authority revoked");
    }
    if (status === "OUT_OF_SERVICE" || status === "OOS") {
      blocked_reasons.push("Carrier is FMCSA Out-of-Service");
    }
  }

  // SOFT WARNING: insurance expiring within 30 days
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (carrier.insuranceExpiry && carrier.insuranceExpiry > now && carrier.insuranceExpiry <= thirtyDays) {
    warnings.push(`Insurance expiring on ${carrier.insuranceExpiry.toISOString().split("T")[0]}`);
  }

  // SOFT WARNING: low safety rating
  if (carrier.safetyRating) {
    const rating = carrier.safetyRating.toUpperCase();
    if (rating === "CONDITIONAL" || rating === "UNSATISFACTORY") {
      warnings.push(`FMCSA safety rating: ${carrier.safetyRating}`);
    }
  }

  // SOFT WARNING: missing documents
  if (!carrier.w9Uploaded) {
    warnings.push("W-9 not uploaded");
  }
  if (!carrier.insuranceCertUploaded) {
    warnings.push("Certificate of Insurance not uploaded");
  }
  if (!carrier.authorityDocUploaded) {
    warnings.push("Authority document not uploaded");
  }

  return {
    allowed: blocked_reasons.length === 0,
    blocked_reasons,
    warnings,
  };
}

// ────────────────────────────────────────────────────────────
// getDashboardData — KPIs for compliance dashboard
// ────────────────────────────────────────────────────────────

export async function getDashboardData() {
  const now = new Date();
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Total active carriers
  const totalCarriers = await prisma.carrierProfile.count({
    where: { onboardingStatus: "APPROVED" },
  });

  // Fully compliant: approved, insurance not expired, has W9 + COI + authority doc
  const fullyCompliant = await prisma.carrierProfile.count({
    where: {
      onboardingStatus: "APPROVED",
      insuranceExpiry: { gt: now },
      w9Uploaded: true,
      insuranceCertUploaded: true,
      authorityDocUploaded: true,
    },
  });

  // Expiring in 30 days
  const expiringSoon = await prisma.carrierProfile.count({
    where: {
      onboardingStatus: "APPROVED",
      insuranceExpiry: { gt: now, lte: thirtyDays },
    },
  });

  // Non-compliant / expired insurance
  const nonCompliant = await prisma.carrierProfile.count({
    where: {
      onboardingStatus: "APPROVED",
      OR: [
        { insuranceExpiry: { lte: now } },
        { insuranceExpiry: null },
      ],
    },
  });

  // Last scan date
  const lastScan = await prisma.complianceScan.findFirst({
    orderBy: { scannedAt: "desc" },
    select: { scannedAt: true },
  });

  // Compliance health chart data
  const complianceHealth = {
    compliant: fullyCompliant,
    expiring: expiringSoon,
    expired: nonCompliant,
  };

  // Expiring soon items (within 30 days)
  const expiringSoonItems = await prisma.carrierProfile.findMany({
    where: {
      onboardingStatus: "APPROVED",
      insuranceExpiry: { gt: now, lte: thirtyDays },
    },
    include: {
      user: { select: { company: true, firstName: true, lastName: true, email: true } },
    },
    orderBy: { insuranceExpiry: "asc" },
    take: 20,
  });

  // Critical alerts (expired insurance or authority)
  const criticalAlerts = await prisma.complianceAlert.findMany({
    where: {
      status: "ACTIVE",
      severity: "CRITICAL",
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  // Recently verified carriers (last 10 FMCSA checks)
  const recentScans = await prisma.complianceScan.findMany({
    orderBy: { scannedAt: "desc" },
    take: 10,
    include: {
      carrier: {
        include: {
          user: { select: { company: true, firstName: true, lastName: true } },
        },
      },
    },
  });

  return {
    totalCarriers,
    fullyCompliant,
    complianceRate: totalCarriers > 0 ? Math.round((fullyCompliant / totalCarriers) * 100) : 0,
    expiringSoon,
    nonCompliant,
    lastScanDate: lastScan?.scannedAt || null,
    complianceHealth,
    expiringSoonItems: expiringSoonItems.map((c) => ({
      carrierId: c.id,
      name: c.user.company || `${c.user.firstName} ${c.user.lastName}`,
      email: c.user.email,
      insuranceExpiry: c.insuranceExpiry,
      mcNumber: c.mcNumber,
      dotNumber: c.dotNumber,
    })),
    criticalAlerts,
    recentScans: recentScans.map((s) => ({
      id: s.id,
      carrierId: s.carrierId,
      carrierName:
        s.carrier.user.company ||
        `${s.carrier.user.firstName} ${s.carrier.user.lastName}`,
      scanType: s.scanType,
      status: s.status,
      scannedAt: s.scannedAt,
    })),
  };
}

// ────────────────────────────────────────────────────────────
// getOverviewMatrix — carrier compliance matrix
// ────────────────────────────────────────────────────────────

type ComplianceItemStatus = "valid" | "expiring" | "expired" | "missing" | "na";

function getItemStatus(
  hasItem: boolean,
  expiryDate: Date | null,
  now: Date,
  thirtyDays: Date
): ComplianceItemStatus {
  if (!hasItem && !expiryDate) return "missing";
  if (!expiryDate) return hasItem ? "valid" : "missing";
  if (expiryDate <= now) return "expired";
  if (expiryDate <= thirtyDays) return "expiring";
  return "valid";
}

export async function getOverviewMatrix(filters?: {
  sortBy?: string;
  status?: string;
  tier?: string;
}) {
  const now = new Date();
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const where: Record<string, unknown> = { onboardingStatus: "APPROVED" };
  if (filters?.tier) where.cppTier = filters.tier;

  const carriers = await prisma.carrierProfile.findMany({
    where,
    include: {
      user: { select: { company: true, firstName: true, lastName: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const matrix = carriers.map((c) => {
    const items: Record<string, ComplianceItemStatus> = {
      authority: c.fmcsaAuthorityStatus
        ? c.fmcsaAuthorityStatus.toUpperCase() === "AUTHORIZED"
          ? "valid"
          : "expired"
        : c.authorityDocUploaded
          ? "valid"
          : "missing",
      insuranceAuto: getItemStatus(
        !!c.autoLiabilityAmount,
        c.insuranceExpiry,
        now,
        thirtyDays
      ),
      insuranceCargo: getItemStatus(
        !!c.cargoInsuranceAmount,
        c.insuranceExpiry,
        now,
        thirtyDays
      ),
      w9: c.w9Uploaded ? "valid" : "missing",
      coi: c.insuranceCertUploaded ? "valid" : "missing",
      authorityDoc: c.authorityDocUploaded ? "valid" : "missing",
      fmcsaStatus: c.fmcsaAuthorityStatus
        ? c.fmcsaAuthorityStatus.toUpperCase() === "AUTHORIZED"
          ? "valid"
          : "expired"
        : "na",
    };

    // Determine overall status
    const values = Object.values(items);
    let overallStatus: string;
    if (values.includes("expired")) overallStatus = "non_compliant";
    else if (values.includes("expiring")) overallStatus = "expiring";
    else if (values.includes("missing")) overallStatus = "incomplete";
    else overallStatus = "compliant";

    return {
      carrierId: c.id,
      name: c.user.company || `${c.user.firstName} ${c.user.lastName}`,
      email: c.user.email,
      mcNumber: c.mcNumber,
      dotNumber: c.dotNumber,
      tier: c.cppTier,
      onboardingStatus: c.onboardingStatus,
      overallStatus,
      items,
      insuranceExpiry: c.insuranceExpiry,
      fmcsaLastChecked: c.fmcsaLastChecked,
    };
  });

  // Apply status filter
  let filtered = matrix;
  if (filters?.status) {
    filtered = matrix.filter((m) => m.overallStatus === filters.status);
  }

  // Apply sort
  if (filters?.sortBy === "expiry") {
    filtered.sort((a, b) => {
      const aDate = a.insuranceExpiry?.getTime() || Infinity;
      const bDate = b.insuranceExpiry?.getTime() || Infinity;
      return aDate - bDate;
    });
  } else if (filters?.sortBy === "name") {
    filtered.sort((a, b) => a.name.localeCompare(b.name));
  } else if (filters?.sortBy === "status") {
    const order: Record<string, number> = {
      non_compliant: 0,
      expiring: 1,
      incomplete: 2,
      compliant: 3,
    };
    filtered.sort(
      (a, b) => (order[a.overallStatus] ?? 99) - (order[b.overallStatus] ?? 99)
    );
  }

  return {
    carriers: filtered,
    summary: {
      total: matrix.length,
      compliant: matrix.filter((m) => m.overallStatus === "compliant").length,
      expiring: matrix.filter((m) => m.overallStatus === "expiring").length,
      nonCompliant: matrix.filter((m) => m.overallStatus === "non_compliant").length,
      incomplete: matrix.filter((m) => m.overallStatus === "incomplete").length,
    },
  };
}

// ────────────────────────────────────────────────────────────
// getCarrierCompliance — full detail for one carrier
// ────────────────────────────────────────────────────────────

export async function getCarrierCompliance(carrierId: string) {
  const now = new Date();
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const carrier = await prisma.carrierProfile.findUnique({
    where: { id: carrierId },
    include: {
      user: {
        select: {
          company: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
        },
      },
      complianceScans: {
        orderBy: { scannedAt: "desc" },
        take: 10,
      },
      complianceNotes: {
        orderBy: { createdAt: "desc" },
        include: {
          author: { select: { firstName: true, lastName: true, email: true } },
        },
      },
      complianceOverrides: {
        orderBy: { createdAt: "desc" },
        include: {
          admin: { select: { firstName: true, lastName: true, email: true } },
        },
      },
    },
  });

  if (!carrier) return null;

  // Compliance items
  const items: Record<string, { status: ComplianceItemStatus; detail?: string }> = {
    authority: {
      status: carrier.fmcsaAuthorityStatus
        ? carrier.fmcsaAuthorityStatus.toUpperCase() === "AUTHORIZED"
          ? "valid"
          : "expired"
        : carrier.authorityDocUploaded
          ? "valid"
          : "missing",
      detail: carrier.fmcsaAuthorityStatus || undefined,
    },
    insuranceAuto: {
      status: getItemStatus(!!carrier.autoLiabilityAmount, carrier.insuranceExpiry, now, thirtyDays),
      detail: carrier.autoLiabilityAmount
        ? `$${carrier.autoLiabilityAmount.toLocaleString()}`
        : undefined,
    },
    insuranceCargo: {
      status: getItemStatus(!!carrier.cargoInsuranceAmount, carrier.insuranceExpiry, now, thirtyDays),
      detail: carrier.cargoInsuranceAmount
        ? `$${carrier.cargoInsuranceAmount.toLocaleString()}`
        : undefined,
    },
    w9: { status: carrier.w9Uploaded ? "valid" : "missing" },
    coi: { status: carrier.insuranceCertUploaded ? "valid" : "missing" },
    authorityDoc: { status: carrier.authorityDocUploaded ? "valid" : "missing" },
    fmcsaStatus: {
      status: carrier.fmcsaAuthorityStatus
        ? carrier.fmcsaAuthorityStatus.toUpperCase() === "AUTHORIZED"
          ? "valid"
          : "expired"
        : "na",
      detail: carrier.fmcsaAuthorityStatus || undefined,
    },
  };

  // Active alerts
  const alerts = await prisma.complianceAlert.findMany({
    where: {
      entityType: "CarrierProfile",
      entityId: carrierId,
      status: "ACTIVE",
    },
    orderBy: { createdAt: "desc" },
  });

  // Active override
  const activeOverride = await prisma.complianceOverride.findFirst({
    where: {
      carrierId,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
    include: {
      admin: { select: { firstName: true, lastName: true, email: true } },
    },
  });

  return {
    carrier: {
      id: carrier.id,
      name: carrier.user.company || `${carrier.user.firstName} ${carrier.user.lastName}`,
      email: carrier.user.email,
      phone: carrier.user.phone,
      mcNumber: carrier.mcNumber,
      dotNumber: carrier.dotNumber,
      tier: carrier.cppTier,
      onboardingStatus: carrier.onboardingStatus,
      insuranceExpiry: carrier.insuranceExpiry,
      insuranceCompany: carrier.insuranceCompany,
      insurancePolicyNumber: carrier.insurancePolicyNumber,
      safetyRating: carrier.safetyRating,
      fmcsaAuthorityStatus: carrier.fmcsaAuthorityStatus,
      fmcsaLastChecked: carrier.fmcsaLastChecked,
      fmcsaBasicScores: carrier.fmcsaBasicScores,
    },
    items,
    alerts,
    scanHistory: carrier.complianceScans,
    notes: carrier.complianceNotes,
    overrides: carrier.complianceOverrides,
    activeOverride,
  };
}

// ────────────────────────────────────────────────────────────
// runFmcsaScan — manual or cron FMCSA check for a carrier
// ────────────────────────────────────────────────────────────

export async function runFmcsaScan(carrierId: string) {
  const carrier = await prisma.carrierProfile.findUnique({
    where: { id: carrierId },
    include: { user: { select: { company: true, firstName: true, lastName: true } } },
  });

  if (!carrier) throw new Error("Carrier not found");
  if (!carrier.dotNumber) throw new Error("Carrier has no DOT number on file");

  const carrierName = carrier.user.company || `${carrier.user.firstName} ${carrier.user.lastName}`;

  // Get previous scan data for comparison
  const previousScan = await prisma.complianceScan.findFirst({
    where: { carrierId },
    orderBy: { scannedAt: "desc" },
  });

  // Call FMCSA
  const fmcsaResult = await verifyCarrierWithFMCSA(carrier.dotNumber);

  // Detect changes
  const previousData = previousScan?.fmcsaData as Record<string, unknown> | null;
  const changesDetected: Record<string, { old: unknown; new: unknown }> = {};

  if (previousData) {
    const compareKeys = [
      "operatingStatus",
      "safetyRating",
      "insuranceOnFile",
      "outOfServiceDate",
    ];
    for (const key of compareKeys) {
      const oldVal = previousData[key];
      const newVal = (fmcsaResult as unknown as Record<string, unknown>)[key];
      if (oldVal !== newVal) {
        changesDetected[key] = { old: oldVal, new: newVal };
      }
    }
  }

  // Determine scan status
  let scanStatus = "PASSED";
  if (!fmcsaResult.verified) scanStatus = "FAILED";
  else if (fmcsaResult.outOfServiceDate) scanStatus = "FAILED";
  else if (Object.keys(changesDetected).length > 0) scanStatus = "CHANGES_DETECTED";

  // Create scan record
  const scan = await prisma.complianceScan.create({
    data: {
      carrierId,
      scanType: "FMCSA_MANUAL",
      fmcsaData: JSON.parse(JSON.stringify(fmcsaResult)),
      previousData: previousData ? JSON.parse(JSON.stringify(previousData)) : undefined,
      changesDetected:
        Object.keys(changesDetected).length > 0 ? JSON.parse(JSON.stringify(changesDetected)) : undefined,
      status: scanStatus,
    },
  });

  // Update carrier FMCSA fields
  await prisma.carrierProfile.update({
    where: { id: carrierId },
    data: {
      fmcsaAuthorityStatus: fmcsaResult.operatingStatus || undefined,
      safetyRating: fmcsaResult.safetyRating || undefined,
      fmcsaLastChecked: new Date(),
    },
  });

  // Generate alerts for issues
  if (!fmcsaResult.verified || fmcsaResult.outOfServiceDate) {
    await prisma.complianceAlert.create({
      data: {
        type: "FMCSA_AUTHORITY",
        entityType: "CarrierProfile",
        entityId: carrierId,
        entityName: carrierName,
        expiryDate: new Date(),
        severity: "CRITICAL",
        status: "ACTIVE",
      },
    });
  }

  if (!fmcsaResult.insuranceOnFile) {
    await prisma.complianceAlert.create({
      data: {
        type: "FMCSA_INSURANCE",
        entityType: "CarrierProfile",
        entityId: carrierId,
        entityName: carrierName,
        expiryDate: new Date(),
        severity: "CRITICAL",
        status: "ACTIVE",
      },
    });
  }

  return scan;
}

// ────────────────────────────────────────────────────────────
// weeklyFmcsaScan — scan all active carriers
// ────────────────────────────────────────────────────────────

export async function weeklyFmcsaScan() {
  const carriers = await prisma.carrierProfile.findMany({
    where: {
      onboardingStatus: "APPROVED",
      dotNumber: { not: null },
    },
    include: { user: { select: { company: true, firstName: true, lastName: true } } },
  });

  const results = { scanned: 0, passed: 0, failed: 0, alerts: 0, errors: 0 };

  for (const carrier of carriers) {
    try {
      if (!carrier.dotNumber) continue;

      const carrierName =
        carrier.user.company || `${carrier.user.firstName} ${carrier.user.lastName}`;

      // Get previous scan data
      const previousScan = await prisma.complianceScan.findFirst({
        where: { carrierId: carrier.id },
        orderBy: { scannedAt: "desc" },
      });

      const fmcsaResult = await verifyCarrierWithFMCSA(carrier.dotNumber);
      results.scanned++;

      // Detect changes
      const previousData = previousScan?.fmcsaData as Record<string, unknown> | null;
      const changesDetected: Record<string, { old: unknown; new: unknown }> = {};

      if (previousData) {
        const compareKeys = [
          "operatingStatus",
          "safetyRating",
          "insuranceOnFile",
          "outOfServiceDate",
        ];
        for (const key of compareKeys) {
          const oldVal = previousData[key];
          const newVal = (fmcsaResult as unknown as Record<string, unknown>)[key];
          if (oldVal !== newVal) {
            changesDetected[key] = { old: oldVal, new: newVal };
          }
        }
      }

      let scanStatus = "PASSED";
      if (!fmcsaResult.verified) scanStatus = "FAILED";
      else if (fmcsaResult.outOfServiceDate) scanStatus = "FAILED";

      // Create scan record
      await prisma.complianceScan.create({
        data: {
          carrierId: carrier.id,
          scanType: "FMCSA_AUTO",
          fmcsaData: JSON.parse(JSON.stringify(fmcsaResult)),
          previousData: previousData ? JSON.parse(JSON.stringify(previousData)) : undefined,
          changesDetected:
            Object.keys(changesDetected).length > 0 ? JSON.parse(JSON.stringify(changesDetected)) : undefined,
          status: scanStatus,
        },
      });

      // Update carrier FMCSA fields
      await prisma.carrierProfile.update({
        where: { id: carrier.id },
        data: {
          fmcsaAuthorityStatus: fmcsaResult.operatingStatus || undefined,
          safetyRating: fmcsaResult.safetyRating || undefined,
          fmcsaLastChecked: new Date(),
        },
      });

      if (scanStatus === "PASSED") {
        results.passed++;
      } else {
        results.failed++;
      }

      // Authority revoked/suspended -> CRITICAL alert + auto-block
      if (
        fmcsaResult.operatingStatus &&
        ["NOT AUTHORIZED", "REVOKED"].includes(fmcsaResult.operatingStatus.toUpperCase())
      ) {
        await prisma.complianceAlert.create({
          data: {
            type: "AUTHORITY_REVOKED",
            entityType: "CarrierProfile",
            entityId: carrier.id,
            entityName: carrierName,
            expiryDate: new Date(),
            severity: "CRITICAL",
            status: "ACTIVE",
          },
        });
        await prisma.carrierProfile.update({
          where: { id: carrier.id },
          data: { onboardingStatus: "SUSPENDED" },
        });
        results.alerts++;
      }

      // Insurance not on file -> CRITICAL alert + auto-block
      if (!fmcsaResult.insuranceOnFile) {
        await prisma.complianceAlert.create({
          data: {
            type: "FMCSA_INSURANCE_MISSING",
            entityType: "CarrierProfile",
            entityId: carrier.id,
            entityName: carrierName,
            expiryDate: new Date(),
            severity: "CRITICAL",
            status: "ACTIVE",
          },
        });
        results.alerts++;
      }

      // Safety rating downgraded -> WARNING alert
      if (
        changesDetected.safetyRating &&
        fmcsaResult.safetyRating &&
        ["CONDITIONAL", "UNSATISFACTORY"].includes(
          fmcsaResult.safetyRating.toUpperCase()
        )
      ) {
        await prisma.complianceAlert.create({
          data: {
            type: "SAFETY_RATING_DOWNGRADE",
            entityType: "CarrierProfile",
            entityId: carrier.id,
            entityName: carrierName,
            expiryDate: new Date(),
            severity: "WARNING",
            status: "ACTIVE",
          },
        });
        results.alerts++;
      }

      // Out of service -> CRITICAL alert + auto-block
      if (fmcsaResult.outOfServiceDate) {
        await prisma.complianceAlert.create({
          data: {
            type: "OUT_OF_SERVICE",
            entityType: "CarrierProfile",
            entityId: carrier.id,
            entityName: carrierName,
            expiryDate: new Date(),
            severity: "CRITICAL",
            status: "ACTIVE",
          },
        });
        await prisma.carrierProfile.update({
          where: { id: carrier.id },
          data: { onboardingStatus: "SUSPENDED" },
        });
        results.alerts++;
      }
    } catch (err) {
      console.error(
        `[WeeklyFMCSA] Error scanning carrier ${carrier.id}:`,
        err
      );
      results.errors++;
    }
  }

  return results;
}

// ────────────────────────────────────────────────────────────
// dailyComplianceReminders — tiered reminder emails
// ────────────────────────────────────────────────────────────

export async function dailyComplianceReminders() {
  const now = new Date();
  const results = { sent: 0, skipped: 0, errors: 0 };

  const carriers = await prisma.carrierProfile.findMany({
    where: {
      onboardingStatus: "APPROVED",
      insuranceExpiry: { not: null },
    },
    include: {
      user: { select: { company: true, firstName: true, lastName: true, email: true } },
    },
  });

  for (const carrier of carriers) {
    try {
      if (!carrier.insuranceExpiry) continue;

      const daysUntilExpiry = Math.floor(
        (carrier.insuranceExpiry.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
      );
      const carrierName =
        carrier.user.company || `${carrier.user.firstName} ${carrier.user.lastName}`;

      let tier: string | null = null;
      let subject: string;
      let urgency: string;

      if (daysUntilExpiry <= 0) {
        tier = "EXPIRED";
        subject = `[BLOCKED] ${carrierName} - Insurance has expired`;
        urgency = "Your carrier account has been BLOCKED due to expired insurance. Upload a new certificate of insurance immediately to restore access.";
      } else if (daysUntilExpiry <= 14) {
        tier = "CRITICAL_14";
        subject = `[CRITICAL] ${carrierName} - Insurance expires in ${daysUntilExpiry} days`;
        urgency = "Your insurance expires very soon. You WILL be blocked from accepting loads once it expires. Please upload your renewed certificate of insurance immediately.";
      } else if (daysUntilExpiry <= 30) {
        tier = "URGENT_30";
        subject = `[URGENT] ${carrierName} - Insurance expires in ${daysUntilExpiry} days`;
        urgency = "Your insurance is expiring soon. Please begin the renewal process and upload your new certificate of insurance.";
      } else if (daysUntilExpiry <= 60) {
        tier = "ACTION_60";
        subject = `Action Needed: ${carrierName} - Insurance expires in ${daysUntilExpiry} days`;
        urgency = "Your insurance will expire in the next 60 days. Please start the renewal process with your insurance provider.";
      } else if (daysUntilExpiry <= 90) {
        tier = "FRIENDLY_90";
        subject = `Reminder: ${carrierName} - Insurance renewal in ${daysUntilExpiry} days`;
        urgency = "This is a friendly reminder that your insurance will need to be renewed in the coming months. No action needed yet.";
      }

      if (!tier) continue;

      // Check if we already sent this tier's reminder
      const alreadySent = await prisma.complianceReminder.findFirst({
        where: {
          carrierId: carrier.id,
          itemType: "INSURANCE_EXPIRY",
          tier,
        },
      });

      if (alreadySent) {
        results.skipped++;
        continue;
      }

      // Send the email
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h2 style="color: #0f172a;">Silk Route Logistics - Compliance Notice</h2>
          <p>Dear ${carrierName},</p>
          <p>${urgency}</p>
          <p><strong>Insurance Expiry Date:</strong> ${carrier.insuranceExpiry.toISOString().split("T")[0]}</p>
          <p><strong>Policy Number:</strong> ${carrier.insurancePolicyNumber || "N/A"}</p>
          <p><strong>Insurance Company:</strong> ${carrier.insuranceCompany || "N/A"}</p>
          <br/>
          <p>Please log into the Silk Route Logistics carrier portal to upload your updated documents.</p>
          <p>Thank you,<br/>SRL Compliance Team</p>
        </div>
      `;

      try {
        await sendEmail(carrier.user.email, subject, html);
      } catch {
        console.log(`[ComplianceReminder] Email send failed for ${carrier.user.email}, logging anyway`);
      }

      // Record the reminder
      await prisma.complianceReminder.create({
        data: {
          carrierId: carrier.id,
          itemType: "INSURANCE_EXPIRY",
          tier,
          emailStatus: "SENT",
        },
      });

      results.sent++;
    } catch (err) {
      console.error(
        `[DailyReminders] Error for carrier ${carrier.id}:`,
        err
      );
      results.errors++;
    }
  }

  return results;
}
