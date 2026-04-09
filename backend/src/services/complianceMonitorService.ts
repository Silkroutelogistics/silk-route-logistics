/**
 * Compass by SRL — Compliance Monitor
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
import { sendEmail, wrap } from "./emailService";
import { log } from "../lib/logger";

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

  // HARD BLOCK: expired insurance (with grace period check)
  if (carrier.insuranceExpiry && carrier.insuranceExpiry <= now) {
    // Check for active insurance grace period
    if (carrier.insuranceGracePeriodEnd && carrier.insuranceGracePeriodEnd > now) {
      const graceDaysLeft = Math.ceil((carrier.insuranceGracePeriodEnd.getTime() - now.getTime()) / 86_400_000);
      warnings.push(`Insurance expired but grace period active (${graceDaysLeft} days remaining)`);
    } else {
      blocked_reasons.push("Insurance has expired");
    }
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

  // HARD BLOCK: no signed carrier-broker agreement
  const agreement = await prisma.carrierAgreement.findFirst({
    where: { carrierId, status: "SIGNED" },
    orderBy: { signedAt: "desc" },
  });
  if (!agreement) {
    blocked_reasons.push("No signed carrier-broker agreement on file");
  } else if (agreement.expiresAt && agreement.expiresAt < now) {
    blocked_reasons.push("Carrier-broker agreement has expired");
  }

  // HARD BLOCK: OFAC potential match (auto-suspended carriers already caught above, but belt-and-suspenders)
  if (carrier.ofacStatus === "POTENTIAL_MATCH") {
    blocked_reasons.push("OFAC/SDN potential match — pending review");
  }

  // SOFT WARNING: probationary carrier (< 3 loads, < 90 days)
  const completedLoads = carrier.cppTotalLoads || 0;
  const daysSinceApproval = carrier.cppJoinedDate
    ? Math.ceil((now.getTime() - new Date(carrier.cppJoinedDate).getTime()) / 86_400_000)
    : 0;
  if (completedLoads < 3 && daysSinceApproval < 90) {
    warnings.push(`Probationary carrier: ${completedLoads}/3 loads, ${daysSinceApproval}/90 days — manual dispatch approval recommended`);
  }

  // SOFT WARNING: document expiry (COI, W-9, authority)
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 86_400_000);
  if (carrier.coiExpiryDate && new Date(carrier.coiExpiryDate) < now) {
    blocked_reasons.push("Certificate of Insurance expired");
  } else if (carrier.coiExpiryDate && new Date(carrier.coiExpiryDate) < thirtyDaysFromNow) {
    warnings.push(`Certificate of Insurance expiring ${new Date(carrier.coiExpiryDate).toISOString().split("T")[0]}`);
  }
  if (carrier.w9ExpiryDate && new Date(carrier.w9ExpiryDate) < now) {
    warnings.push("W-9 expired — new W-9 required");
  }
  if (carrier.authorityDocExpiryDate && new Date(carrier.authorityDocExpiryDate) < now) {
    warnings.push("Authority document expired");
  }

  // SOFT WARNING: chameleon risk
  if (carrier.chameleonRiskLevel === "HIGH") {
    blocked_reasons.push("HIGH chameleon risk — suspected identity fraud");
  } else if (carrier.chameleonRiskLevel === "MEDIUM") {
    warnings.push("MEDIUM chameleon risk — identity overlap with other carriers");
  }

  // SOFT WARNING: low vetting score
  if (carrier.lastVettingScore !== null && carrier.lastVettingScore !== undefined) {
    if (carrier.lastVettingScore < 40) {
      blocked_reasons.push(`Vetting score CRITICAL: ${carrier.lastVettingScore}/100`);
    } else if (carrier.lastVettingScore < 60) {
      warnings.push(`Vetting score HIGH risk: ${carrier.lastVettingScore}/100`);
    }
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
      identityVerification: { select: { identityStatus: true, identityScore: true } },
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
      // Vetting upgrade fields
      vettingGrade: c.vettingGrade || null,
      identityStatus: c.identityVerification?.identityStatus || null,
      chameleonRiskLevel: c.chameleonRiskLevel || null,
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
    include: { user: { select: { company: true, firstName: true, lastName: true, email: true } } },
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

      // Authority revoked/suspended -> CRITICAL alert + auto-block + email
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
          data: { onboardingStatus: "SUSPENDED", autoSuspendedAt: new Date(), autoSuspendReason: "FMCSA auto-suspension" },
        });
        results.alerts++;

        // Email carrier about suspension
        sendFmcsaSuspensionEmail(carrier.user.email, carrierName, fmcsaResult.operatingStatus, carrier.dotNumber!, "AUTHORITY_REVOKED")
          .catch((e) => log.error({ err: e }, `[WeeklyFMCSA] Suspension email error for ${carrierName}:`));

        // Email admins about critical finding
        sendFmcsaAdminAlert(carrierName, carrier.dotNumber!, fmcsaResult.operatingStatus, "Authority revoked/not authorized")
          .catch((e) => log.error({ err: e }, `[WeeklyFMCSA] Admin alert email error:`));
      }

      // Insurance not on file -> CRITICAL alert + auto-block + email
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

        // Email carrier about missing insurance
        sendFmcsaSuspensionEmail(carrier.user.email, carrierName, "INSURANCE NOT ON FILE", carrier.dotNumber!, "OUT_OF_SERVICE")
          .catch((e) => log.error({ err: e }, `[WeeklyFMCSA] Insurance email error for ${carrierName}:`));

        // Email admins
        sendFmcsaAdminAlert(carrierName, carrier.dotNumber!, "INSURANCE NOT ON FILE", "FMCSA reports no insurance on file for this carrier")
          .catch((e) => log.error({ err: e }, `[WeeklyFMCSA] Admin insurance alert error:`));
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

      // FMCSA contact change detection (Compass)
      const fmcsaPhone = (fmcsaResult as any).phone || null;
      const fmcsaEmail = (fmcsaResult as any).email || null;
      const fmcsaAddress = (fmcsaResult as any).physicalAddress || null;
      if (carrier.fmcsaContactLastSync) {
        const contactChanges: string[] = [];
        if (fmcsaPhone && carrier.fmcsaPhone && fmcsaPhone !== carrier.fmcsaPhone) contactChanges.push(`Phone: ${carrier.fmcsaPhone} → ${fmcsaPhone}`);
        if (fmcsaEmail && carrier.fmcsaEmail && fmcsaEmail !== carrier.fmcsaEmail) contactChanges.push(`Email: ${carrier.fmcsaEmail} → ${fmcsaEmail}`);
        if (fmcsaAddress && carrier.fmcsaAddress && fmcsaAddress !== carrier.fmcsaAddress) contactChanges.push(`Address changed`);

        if (contactChanges.length > 0) {
          await prisma.complianceAlert.create({
            data: {
              type: "FMCSA_CONTACT_CHANGE",
              entityType: "CarrierProfile",
              entityId: carrier.id,
              entityName: carrierName,
              expiryDate: new Date(Date.now() + 7 * 86_400_000),
              severity: contactChanges.length >= 2 ? "CRITICAL" : "WARNING",
              status: "ACTIVE",
            },
          });
          results.alerts++;
          log.info(`[Compass] FMCSA contact change for ${carrierName}: ${contactChanges.join(", ")}`);
        }
      }
      // Store current FMCSA contact info for next comparison
      await prisma.carrierProfile.update({
        where: { id: carrier.id },
        data: {
          fmcsaPhone: fmcsaPhone || carrier.fmcsaPhone,
          fmcsaEmail: fmcsaEmail || carrier.fmcsaEmail,
          fmcsaAddress: fmcsaAddress || carrier.fmcsaAddress,
          fmcsaContactLastSync: new Date(),
        },
      }).catch(() => {});

      // Out of service -> CRITICAL alert + auto-block + email
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
          data: { onboardingStatus: "SUSPENDED", autoSuspendedAt: new Date(), autoSuspendReason: "FMCSA auto-suspension" },
        });
        results.alerts++;

        // Email carrier about out-of-service suspension
        sendFmcsaSuspensionEmail(carrier.user.email, carrierName, "OUT OF SERVICE", carrier.dotNumber!, "OUT_OF_SERVICE")
          .catch((e) => log.error({ err: e }, `[WeeklyFMCSA] OOS email error for ${carrierName}:`));

        // Email admins
        sendFmcsaAdminAlert(carrierName, carrier.dotNumber!, "OUT OF SERVICE", `Out-of-service date: ${fmcsaResult.outOfServiceDate}`)
          .catch((e) => log.error({ err: e }, `[WeeklyFMCSA] Admin OOS alert error:`));
      }
    } catch (err) {
      log.error({ err }, `[WeeklyFMCSA] Error scanning carrier ${carrier.id}`);
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
      let subject = `Reminder: ${carrierName} - Insurance renewal`;
      let urgency = "Please check your insurance status.";

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
        log.info(`[ComplianceReminder] Email send failed for ${carrier.user.email}, logging anyway`);
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
      log.error({ err }, `[DailyReminders] Error for carrier ${carrier.id}`);
      results.errors++;
    }
  }

  return results;
}

// ────────────────────────────────────────────────────────────
// checkAutoReversal — auto-reinstate suspended carriers
// ────────────────────────────────────────────────────────────

export async function checkAutoReversal() {
  const results = { checked: 0, reinstated: 0, errors: 0 };

  const suspendedCarriers = await prisma.carrierProfile.findMany({
    where: {
      autoSuspendedAt: { not: null },
      onboardingStatus: "SUSPENDED",
      dotNumber: { not: null },
    },
    include: {
      user: { select: { company: true, firstName: true, lastName: true, email: true } },
    },
  });

  for (const carrier of suspendedCarriers) {
    try {
      if (!carrier.dotNumber) continue;
      results.checked++;

      const fmcsaResult = await verifyCarrierWithFMCSA(carrier.dotNumber);

      if (
        fmcsaResult.verified &&
        fmcsaResult.operatingStatus === "AUTHORIZED" &&
        !fmcsaResult.outOfServiceDate &&
        fmcsaResult.insuranceOnFile
      ) {
        await prisma.carrierProfile.update({
          where: { id: carrier.id },
          data: {
            onboardingStatus: "APPROVED",
            autoSuspendedAt: null,
            autoSuspendReason: null,
            fmcsaAuthorityStatus: "AUTHORIZED",
            fmcsaLastChecked: new Date(),
          },
        });

        const carrierName = carrier.user.company || `${carrier.user.firstName} ${carrier.user.lastName}`;
        await prisma.complianceAlert.create({
          data: {
            type: "AUTO_REINSTATED",
            entityType: "CarrierProfile",
            entityId: carrier.id,
            entityName: carrierName,
            expiryDate: new Date(Date.now() + 365 * 86_400_000),
            severity: "INFO",
            status: "ACTIVE",
          },
        });

        try {
          await sendEmail(
            carrier.user.email,
            `[SRL] Account Reinstated - ${carrierName}`,
            `<div style="font-family: Arial, sans-serif;">
              <h2>Your Account Has Been Reinstated</h2>
              <p>Dear ${carrierName},</p>
              <p>Your carrier account has been automatically reinstated after our system verified
              your FMCSA authority is active, no out-of-service status, and insurance is on file.</p>
              <p>You may now accept loads again.</p>
              <p>— SRL Compliance Team</p>
            </div>`,
          );
        } catch { /* non-critical */ }

        results.reinstated++;
      }
    } catch (err) {
      log.error({ err: err }, `[AutoReversal] Error for carrier ${carrier.id}:`);
      results.errors++;
    }
  }

  log.info(`[AutoReversal] ${results.checked} checked, ${results.reinstated} reinstated, ${results.errors} errors`);
  return results;
}

// ────────────────────────────────────────────────────────────
// grantGracePeriod — admin grants insurance grace period (max 7 days)
// ────────────────────────────────────────────────────────────

export async function grantGracePeriod(
  carrierId: string,
  grantedBy: string,
  days: number = 7,
): Promise<{ success: boolean; expiresAt: Date }> {
  if (days < 1 || days > 7) {
    throw new Error("Grace period must be between 1 and 7 days");
  }

  const expiresAt = new Date(Date.now() + days * 86_400_000);

  await prisma.carrierProfile.update({
    where: { id: carrierId },
    data: {
      insuranceGracePeriodEnd: expiresAt,
      insuranceGraceGrantedBy: grantedBy,
    },
  });

  return { success: true, expiresAt };
}

// ────────────────────────────────────────────────────────────
// FMCSA Suspension Email — sent to carrier when auto-suspended
// ────────────────────────────────────────────────────────────

async function sendFmcsaSuspensionEmail(
  carrierEmail: string,
  carrierName: string,
  fmcsaStatus: string,
  dotNumber: string,
  reason: "AUTHORITY_REVOKED" | "OUT_OF_SERVICE",
) {
  const reasonLabel = reason === "AUTHORITY_REVOKED"
    ? "your FMCSA operating authority is no longer active"
    : "your carrier has been placed Out of Service by FMCSA";

  const body = `
    <div style="background:#dc2626;color:#fff;padding:12px 20px;border-radius:8px 8px 0 0;text-align:center">
      <h2 style="margin:0;font-size:18px">ACCOUNT SUSPENDED</h2>
    </div>
    <div style="padding:20px">
      <p>Dear ${carrierName},</p>
      <p>Your carrier account with Silk Route Logistics has been <strong>automatically suspended</strong> because ${reasonLabel}.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b;width:160px">DOT Number</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${dotNumber}</td></tr>
        <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">FMCSA Status</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#dc2626;font-weight:600">${fmcsaStatus}</td></tr>
        <tr><td style="padding:8px 12px;color:#64748b">Action Required</td>
            <td style="padding:8px 12px">Resolve the FMCSA issue and your account will be automatically reinstated during our next compliance scan.</td></tr>
      </table>
      <p style="color:#64748b;font-size:14px">If you believe this is an error, please contact our compliance team at compliance@silkroutelogistics.ai.</p>
    </div>
  `;

  await sendEmail(carrierEmail, `[SRL] Account Suspended — ${carrierName}`, wrap(body));
  log.info(`[FMCSA] Suspension email sent to ${carrierEmail} (${reason})`);
}

// ────────────────────────────────────────────────────────────
// FMCSA Admin Alert — sent to admins on critical findings
// ────────────────────────────────────────────────────────────

async function sendFmcsaAdminAlert(
  carrierName: string,
  dotNumber: string,
  fmcsaStatus: string,
  detail: string,
) {
  const body = `
    <div style="background:#dc2626;color:#fff;padding:12px 20px;border-radius:8px 8px 0 0;text-align:center">
      <h2 style="margin:0;font-size:18px">FMCSA CRITICAL ALERT</h2>
    </div>
    <div style="padding:20px">
      <p style="color:#64748b;margin:0 0 16px">A carrier has been <strong>auto-suspended</strong> due to a critical FMCSA finding.</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b;width:160px">Carrier</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${carrierName}</td></tr>
        <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">DOT Number</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${dotNumber}</td></tr>
        <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">FMCSA Status</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#dc2626;font-weight:600">${fmcsaStatus}</td></tr>
        <tr><td style="padding:8px 12px;color:#64748b">Detail</td>
            <td style="padding:8px 12px">${detail}</td></tr>
      </table>
      <p style="color:#64748b;font-size:14px"><strong>Action taken:</strong> Carrier auto-suspended. Any active loads assigned to this carrier should be reassigned immediately.</p>
      <p style="text-align:center;margin-top:16px">
        <a href="https://silkroutelogistics.ai/dashboard/compliance" style="display:inline-block;padding:12px 28px;background:#d4a574;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Review in Console</a>
      </p>
    </div>
  `;

  const admins = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "DISPATCH", "OPERATIONS"] }, isActive: true },
    select: { email: true },
  });

  for (const admin of admins) {
    await sendEmail(admin.email, `[SRL CRITICAL] FMCSA Alert: ${carrierName} — ${fmcsaStatus}`, wrap(body))
      .catch((e) => log.error({ err: e }, `[FMCSA] Admin email to ${admin.email} failed:`));
  }

  log.info(`[FMCSA] Admin alert sent to ${admins.length} users for ${carrierName}`);
}

// ────────────────────────────────────────────────────────────
// ENTERPRISE CRON: Insurance Expiry Auto-Suspension
// Runs daily — suspends carriers with expired insurance (no grace period)
// and sends warnings at 30, 14, 7 days before expiry.
// ────────────────────────────────────────────────────────────

export async function processInsuranceExpiryEnforcement() {
  const now = new Date();
  let suspended = 0;
  let warned = 0;

  // 1. Auto-suspend carriers with expired insurance (no grace period)
  const expiredCarriers = await prisma.carrierProfile.findMany({
    where: {
      onboardingStatus: "APPROVED",
      insuranceExpiry: { lt: now },
      insuranceGracePeriodEnd: { lt: now }, // Grace period also expired or null
    },
    include: { user: { select: { id: true, email: true, firstName: true, company: true } } },
  });

  // Also include carriers with no grace period at all
  const expiredNoGrace = await prisma.carrierProfile.findMany({
    where: {
      onboardingStatus: "APPROVED",
      insuranceExpiry: { lt: now },
      insuranceGracePeriodEnd: null,
    },
    include: { user: { select: { id: true, email: true, firstName: true, company: true } } },
  });

  const allExpired = [...expiredCarriers, ...expiredNoGrace];
  const seenIds = new Set<string>();

  for (const carrier of allExpired) {
    if (seenIds.has(carrier.id)) continue;
    seenIds.add(carrier.id);

    await prisma.carrierProfile.update({
      where: { id: carrier.id },
      data: {
        onboardingStatus: "SUSPENDED",
        suspensionReason: `Auto-suspended: Insurance expired on ${carrier.insuranceExpiry?.toISOString().split("T")[0]}`,
        suspendedAt: now,
      },
    });

    await prisma.complianceAlert.create({
      data: {
        type: "INSURANCE_EXPIRED",
        entityType: "CARRIER",
        entityId: carrier.id,
        entityName: carrier.companyName || carrier.user.company || "Unknown",
        severity: "CRITICAL",
        status: "ACTIVE",
        expiryDate: new Date(now.getTime() + 90 * 86_400_000),
      },
    });

    await prisma.notification.create({
      data: {
        userId: carrier.user.id,
        type: "COMPLIANCE",
        title: "Account Suspended — Insurance Expired",
        message: "Your carrier account has been suspended because your insurance has expired. Please update your insurance certificate to restore access.",
        actionUrl: "/carrier/dashboard/compliance",
      },
    });

    suspended++;
  }

  // 2. Warn carriers with insurance expiring within 30 days (dedup: one per day)
  const warningWindows = [30, 14, 7, 3, 1];
  for (const daysLeft of warningWindows) {
    const windowStart = new Date(now.getTime() + (daysLeft - 1) * 86_400_000);
    const windowEnd = new Date(now.getTime() + daysLeft * 86_400_000);

    const expiringCarriers = await prisma.carrierProfile.findMany({
      where: {
        onboardingStatus: "APPROVED",
        insuranceExpiry: { gte: windowStart, lt: windowEnd },
      },
      include: { user: { select: { id: true, email: true, firstName: true } } },
    });

    for (const carrier of expiringCarriers) {
      // Dedup: check if warning already sent today
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const alreadySent = await prisma.notification.findFirst({
        where: {
          userId: carrier.user.id,
          type: "COMPLIANCE",
          title: { contains: "Insurance Expiring" },
          createdAt: { gte: todayStart },
        },
      });
      if (alreadySent) continue;

      await prisma.notification.create({
        data: {
          userId: carrier.user.id,
          type: "COMPLIANCE",
          title: `Insurance Expiring in ${daysLeft} Day${daysLeft !== 1 ? "s" : ""}`,
          message: `Your insurance expires on ${carrier.insuranceExpiry?.toISOString().split("T")[0]}. Please renew and upload your updated Certificate of Insurance to avoid account suspension.`,
          actionUrl: "/carrier/dashboard/compliance",
        },
      });

      if (daysLeft <= 7) {
        await sendEmail(
          carrier.user.email,
          `[SRL] Insurance Expiring in ${daysLeft} Day${daysLeft !== 1 ? "s" : ""} — Action Required`,
          wrap(`
            <div style="padding:20px">
              <h2 style="color:#dc2626;margin:0 0 16px">Insurance Expiry Warning</h2>
              <p style="color:#64748b">Hi ${carrier.user.firstName || "Carrier"},</p>
              <p style="color:#64748b">Your insurance expires on <strong>${carrier.insuranceExpiry?.toISOString().split("T")[0]}</strong>. Your account will be <strong>automatically suspended</strong> if your insurance is not renewed before the expiry date.</p>
              <p style="text-align:center;margin-top:16px">
                <a href="https://silkroutelogistics.ai/carrier/dashboard/compliance" style="display:inline-block;padding:12px 28px;background:#d4a574;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Upload New Certificate</a>
              </p>
            </div>
          `)
        ).catch((e) => log.error({ err: e }, `[InsuranceExpiry] Email failed for ${carrier.user.email}:`));
      }

      warned++;
    }
  }

  log.info(`[InsuranceExpiry] Enforcement complete: ${suspended} suspended, ${warned} warned`);
  return { suspended, warned };
}

// ────────────────────────────────────────────────────────────
// ENTERPRISE CRON: Monthly Full Re-Vetting (Compass)
// Re-runs full 29-check vetting for all APPROVED carriers.
// Auto-suspends CRITICAL risk carriers.
// ────────────────────────────────────────────────────────────

export async function monthlyCarrierReVetting() {
  const { vetAndStoreReport } = await import("./carrierVettingService");

  const carriers = await prisma.carrierProfile.findMany({
    where: {
      onboardingStatus: "APPROVED",
      dotNumber: { not: null },
    },
    select: { id: true, dotNumber: true, mcNumber: true, companyName: true, userId: true },
  });

  let revetted = 0;
  let critical = 0;
  let suspended = 0;
  let errors = 0;

  for (const carrier of carriers) {
    if (!carrier.dotNumber) continue;

    try {
      const report = await vetAndStoreReport(carrier.dotNumber, carrier.id, carrier.mcNumber || undefined, "CRON");
      revetted++;

      // Auto-suspend carriers that dropped to CRITICAL
      if (report.riskLevel === "CRITICAL") {
        critical++;

        await prisma.carrierProfile.update({
          where: { id: carrier.id },
          data: {
            onboardingStatus: "SUSPENDED",
            suspensionReason: `Auto-suspended by monthly re-vetting: score ${report.score}/100 (CRITICAL). Flags: ${report.flags.slice(0, 3).join(", ")}`,
            suspendedAt: new Date(),
          },
        });

        await prisma.notification.create({
          data: {
            userId: carrier.userId,
            type: "COMPLIANCE",
            title: "Account Suspended — Compliance Review Failed",
            message: `Your carrier account has been suspended following a routine compliance review (score: ${report.score}/100). Please contact support.`,
            actionUrl: "/carrier/dashboard",
          },
        });

        suspended++;
      }

      // Notify admins of HIGH risk carriers (not suspended, but flagged)
      if (report.riskLevel === "HIGH") {
        await prisma.complianceAlert.create({
          data: {
            type: "VETTING_DECLINE",
            entityType: "CARRIER",
            entityId: carrier.id,
            entityName: carrier.companyName || "Unknown",
            severity: "HIGH",
            status: "ACTIVE",
            expiryDate: new Date(Date.now() + 30 * 86_400_000),
          },
        });
      }
    } catch (e: any) {
      errors++;
      log.error({ err: e }, `[MonthlyReVet] Error for carrier ${carrier.id}:`);
    }
  }

  log.info(`[MonthlyReVet] Complete: ${revetted}/${carriers.length} revetted, ${critical} CRITICAL, ${suspended} suspended, ${errors} errors`);
  return { total: carriers.length, revetted, critical, suspended, errors };
}

// ────────────────────────────────────────────────────────────
// ENTERPRISE CRON: FMCSA Authority Change Detection
// Checks all APPROVED carriers' FMCSA status for changes.
// Auto-suspends on revocation/OOS, alerts on conditional.
// ────────────────────────────────────────────────────────────

export async function detectFmcsaAuthorityChanges() {
  const carriers = await prisma.carrierProfile.findMany({
    where: {
      onboardingStatus: "APPROVED",
      dotNumber: { not: null },
    },
    select: {
      id: true, dotNumber: true, companyName: true, userId: true,
      fmcsaAuthorityStatus: true, safetyRating: true,
    },
  });

  let checked = 0;
  let changes = 0;
  let suspensions = 0;
  let errors = 0;

  for (const carrier of carriers) {
    if (!carrier.dotNumber) continue;

    try {
      const fmcsa = await verifyCarrierWithFMCSA(carrier.dotNumber);
      checked++;

      const previousStatus = carrier.fmcsaAuthorityStatus?.toUpperCase() || "UNKNOWN";
      const currentStatus = fmcsa.operatingStatus?.toUpperCase() || "UNKNOWN";
      const previousRating = carrier.safetyRating?.toUpperCase();
      const currentRating = fmcsa.safetyRating?.toUpperCase();

      // Detect authority status change
      if (previousStatus !== currentStatus) {
        changes++;

        await prisma.carrierProfile.update({
          where: { id: carrier.id },
          data: {
            fmcsaAuthorityStatus: fmcsa.operatingStatus,
            safetyRating: fmcsa.safetyRating || carrier.safetyRating,
            fmcsaLastChecked: new Date(),
          },
        });

        // Create compliance alert
        await prisma.complianceAlert.create({
          data: {
            type: "FMCSA_STATUS_CHANGE",
            entityType: "CARRIER",
            entityId: carrier.id,
            entityName: carrier.companyName || "Unknown",
            severity: ["REVOKED", "NOT AUTHORIZED", "OUT_OF_SERVICE", "OOS"].includes(currentStatus) ? "CRITICAL" : "HIGH",
            status: "ACTIVE",
            expiryDate: new Date(Date.now() + 30 * 86_400_000),
          },
        });

        // Auto-suspend on revocation or OOS
        if (["REVOKED", "NOT AUTHORIZED", "OUT_OF_SERVICE", "OOS"].includes(currentStatus)) {
          await prisma.carrierProfile.update({
            where: { id: carrier.id },
            data: {
              onboardingStatus: "SUSPENDED",
              suspensionReason: `Auto-suspended: FMCSA authority changed from ${previousStatus} to ${currentStatus}`,
              suspendedAt: new Date(),
            },
          });

          await prisma.notification.create({
            data: {
              userId: carrier.userId,
              type: "COMPLIANCE",
              title: "Account Suspended — FMCSA Authority Change",
              message: `Your carrier account has been suspended: FMCSA authority status changed to ${currentStatus}. Please contact support.`,
              actionUrl: "/carrier/dashboard",
            },
          });

          suspensions++;
          log.info(`[FMCSAWatch] AUTO-SUSPENDED carrier ${carrier.id}: ${previousStatus} → ${currentStatus}`);
        }
      }

      // Detect safety rating change
      if (previousRating && currentRating && previousRating !== currentRating) {
        await prisma.complianceAlert.create({
          data: {
            type: "FMCSA_RATING_CHANGE",
            entityType: "CARRIER",
            entityId: carrier.id,
            entityName: carrier.companyName || "Unknown",
            severity: currentRating === "UNSATISFACTORY" ? "CRITICAL" : "MEDIUM",
            status: "ACTIVE",
            expiryDate: new Date(Date.now() + 30 * 86_400_000),
          },
        });

        // Auto-suspend on UNSATISFACTORY
        if (currentRating === "UNSATISFACTORY") {
          await prisma.carrierProfile.update({
            where: { id: carrier.id },
            data: {
              onboardingStatus: "SUSPENDED",
              suspensionReason: `Auto-suspended: FMCSA safety rating changed to UNSATISFACTORY`,
              suspendedAt: new Date(),
              safetyRating: "UNSATISFACTORY",
            },
          });
          suspensions++;
        }
      }
    } catch (e: any) {
      errors++;
      log.error({ err: e }, `[FMCSAWatch] Error checking carrier ${carrier.id}:`);
    }
  }

  log.info(`[FMCSAWatch] Complete: ${checked} checked, ${changes} changes, ${suspensions} suspended, ${errors} errors`);
  return { checked, changes, suspensions, errors };
}

// ────────────────────────────────────────────────────────────
// ENTERPRISE CRON: Document Expiry Scanner
// Sends reminders for expiring documents and creates alerts.
// ────────────────────────────────────────────────────────────

export async function processDocumentExpiryAlerts() {
  const now = new Date();
  const warningWindows = [30, 14, 7, 1]; // days before expiry
  let alerts = 0;

  const docFields = [
    { field: "coiExpiryDate" as const, label: "Certificate of Insurance", severity: "CRITICAL" },
    { field: "w9ExpiryDate" as const, label: "W-9 Form", severity: "HIGH" },
    { field: "authorityDocExpiryDate" as const, label: "Authority Document", severity: "HIGH" },
  ];

  for (const docType of docFields) {
    for (const daysLeft of warningWindows) {
      const windowStart = new Date(now.getTime() + (daysLeft - 1) * 86_400_000);
      const windowEnd = new Date(now.getTime() + daysLeft * 86_400_000);

      const carriers = await prisma.carrierProfile.findMany({
        where: {
          onboardingStatus: "APPROVED",
          [docType.field]: { gte: windowStart, lt: windowEnd },
        },
        include: { user: { select: { id: true, email: true, firstName: true } } },
      });

      for (const carrier of carriers) {
        // Dedup
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const alreadySent = await prisma.notification.findFirst({
          where: {
            userId: carrier.user.id,
            type: "COMPLIANCE",
            title: { contains: docType.label },
            createdAt: { gte: todayStart },
          },
        });
        if (alreadySent) continue;

        await prisma.notification.create({
          data: {
            userId: carrier.user.id,
            type: "COMPLIANCE",
            title: `${docType.label} Expiring in ${daysLeft} Day${daysLeft !== 1 ? "s" : ""}`,
            message: `Your ${docType.label} expires soon. Please upload an updated document to maintain your active carrier status.`,
            actionUrl: "/carrier/dashboard/compliance",
          },
        });

        alerts++;
      }
    }
  }

  log.info(`[DocExpiry] ${alerts} document expiry alerts sent`);
  return { alerts };
}
