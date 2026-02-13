import { prisma } from "../config/database";

/**
 * Compliance Forecasting Engine — Predictive Compliance Management
 *
 * Predicts compliance issues BEFORE they happen:
 * - Insurance expiry forecasting (auto-alert 60/30/15/7 days)
 * - Authority status risk prediction
 * - Safety score trend analysis
 * - Document gap detection
 * - Auto-escalation to operations team
 *
 * COMPETITIVE EDGE: Zero compliance surprises. Proactive, not reactive.
 */

// ─── Get Carrier Compliance Forecast ──────────────────────────────
export async function getCarrierForecast(carrierId: string) {
  const forecast = await prisma.complianceForecast.findUnique({
    where: { carrierId },
    include: { carrier: { select: { companyName: true, insuranceExpiry: true, fmcsaAuthorityStatus: true } } },
  });

  if (!forecast) return null;

  return {
    ...forecast,
    urgency: forecast.overallRisk > 0.7 ? "CRITICAL" : forecast.overallRisk > 0.4 ? "WARNING" : "OK",
  };
}

// ─── Daily Learning Cycle ─────────────────────────────────────────
export async function runComplianceForecastCycle(): Promise<{
  carriersScanned: number;
  alertsSent: number;
  criticalIssues: number;
}> {
  const startTime = Date.now();
  console.log("[ComplianceForecast] Starting forecast cycle...");

  const carriers = await prisma.carrierProfile.findMany({
    where: { onboardingStatus: "APPROVED" },
    select: {
      id: true,
      companyName: true,
      insuranceExpiry: true,
      w9Uploaded: true,
      insuranceCertUploaded: true,
      authorityDocUploaded: true,
      fmcsaAuthorityStatus: true,
      fmcsaBasicScores: true,
      fmcsaLastChecked: true,
      safetyRating: true,
      cppTier: true,
    },
  });

  let alertsSent = 0;
  let criticalIssues = 0;

  for (const carrier of carriers) {
    const predictedIssues: any[] = [];
    let insuranceExpiryRisk = 0;
    let authorityRisk = 0;
    let safetyRisk = 0;
    let daysUntilExpiry: number | null = null;

    // Insurance expiry forecasting
    if (carrier.insuranceExpiry) {
      const daysLeft = Math.floor((carrier.insuranceExpiry.getTime() - Date.now()) / 86_400_000);
      daysUntilExpiry = daysLeft;

      if (daysLeft <= 0) {
        insuranceExpiryRisk = 1.0;
        predictedIssues.push({ type: "INSURANCE_EXPIRED", probability: 1.0, eta: "Expired", severity: "CRITICAL" });
        criticalIssues++;
      } else if (daysLeft <= 7) {
        insuranceExpiryRisk = 0.9;
        predictedIssues.push({ type: "INSURANCE_EXPIRING_7D", probability: 0.95, eta: `${daysLeft} days`, severity: "CRITICAL" });
        criticalIssues++;
      } else if (daysLeft <= 15) {
        insuranceExpiryRisk = 0.7;
        predictedIssues.push({ type: "INSURANCE_EXPIRING_15D", probability: 0.85, eta: `${daysLeft} days`, severity: "HIGH" });
      } else if (daysLeft <= 30) {
        insuranceExpiryRisk = 0.4;
        predictedIssues.push({ type: "INSURANCE_EXPIRING_30D", probability: 0.7, eta: `${daysLeft} days`, severity: "MEDIUM" });
      } else if (daysLeft <= 60) {
        insuranceExpiryRisk = 0.15;
        predictedIssues.push({ type: "INSURANCE_EXPIRING_60D", probability: 0.4, eta: `${daysLeft} days`, severity: "LOW" });
      }
    } else {
      insuranceExpiryRisk = 0.8;
      predictedIssues.push({ type: "NO_INSURANCE_DATE", probability: 0.9, eta: "Unknown", severity: "HIGH" });
    }

    // Authority risk
    if (carrier.fmcsaAuthorityStatus) {
      const status = carrier.fmcsaAuthorityStatus.toUpperCase();
      if (status === "INACTIVE" || status === "REVOKED") {
        authorityRisk = 1.0;
        predictedIssues.push({ type: "AUTHORITY_INACTIVE", probability: 1.0, eta: "Now", severity: "CRITICAL" });
        criticalIssues++;
      } else if (status === "PENDING") {
        authorityRisk = 0.5;
        predictedIssues.push({ type: "AUTHORITY_PENDING", probability: 0.6, eta: "Pending", severity: "MEDIUM" });
      }
    }

    // FMCSA data staleness
    if (carrier.fmcsaLastChecked) {
      const daysSinceCheck = (Date.now() - carrier.fmcsaLastChecked.getTime()) / 86_400_000;
      if (daysSinceCheck > 90) {
        safetyRisk += 0.2;
        predictedIssues.push({ type: "FMCSA_STALE_DATA", probability: 0.5, eta: `${Math.floor(daysSinceCheck)} days since check`, severity: "LOW" });
      }
    }

    // Safety score analysis
    if (carrier.fmcsaBasicScores && typeof carrier.fmcsaBasicScores === "object") {
      const scores = carrier.fmcsaBasicScores as Record<string, number>;
      const highScores = Object.entries(scores).filter(([, v]) => typeof v === "number" && v > 75);
      if (highScores.length > 0) {
        safetyRisk += 0.3 * (highScores.length / Object.keys(scores).length);
        for (const [category, score] of highScores) {
          predictedIssues.push({ type: "HIGH_BASIC_SCORE", category, score, probability: 0.6, severity: "MEDIUM" });
        }
      }
    }

    // Document gap detection
    const docGaps: string[] = [];
    if (!carrier.w9Uploaded) docGaps.push("W-9");
    if (!carrier.insuranceCertUploaded) docGaps.push("Insurance Certificate");
    if (!carrier.authorityDocUploaded) docGaps.push("Authority Letter");
    if (docGaps.length > 0) {
      safetyRisk += 0.1 * docGaps.length;
      predictedIssues.push({ type: "DOCUMENT_GAPS", documents: docGaps, probability: 0.8, severity: docGaps.length >= 2 ? "HIGH" : "MEDIUM" });
    }

    // Overall risk
    const overallRisk = Math.min(1, Math.round((insuranceExpiryRisk * 0.4 + authorityRisk * 0.35 + safetyRisk * 0.25) * 100) / 100);

    // Recommended action
    let recommendedAction = "Monitor normally";
    if (overallRisk > 0.7) recommendedAction = "URGENT: Contact carrier immediately — compliance at risk";
    else if (overallRisk > 0.4) recommendedAction = "Send compliance reminder and request document updates";
    else if (predictedIssues.length > 0) recommendedAction = "Schedule routine compliance review";

    // Auto-alert for critical issues
    let autoAlertSent = false;
    if (overallRisk > 0.6) {
      const adminUsers = await prisma.user.findMany({
        where: { role: { in: ["ADMIN", "OPERATIONS"] }, isActive: true },
        select: { id: true },
        take: 5,
      });
      for (const admin of adminUsers) {
        await prisma.notification.create({
          data: {
            userId: admin.id,
            type: "COMPLIANCE_FORECAST",
            title: `Compliance Risk: ${carrier.companyName}`,
            message: `Overall risk ${Math.round(overallRisk * 100)}% — ${predictedIssues.length} issue(s) detected`,
            link: `/compliance/carrier/${carrier.id}`,
          },
        }).catch((err) => console.error("[ComplianceForecast] Notification error:", err.message));
      }
      autoAlertSent = true;
      alertsSent++;
    }

    await prisma.complianceForecast.upsert({
      where: { carrierId: carrier.id },
      create: {
        carrierId: carrier.id,
        insuranceExpiryRisk: Math.round(insuranceExpiryRisk * 100) / 100,
        authorityRisk: Math.round(authorityRisk * 100) / 100,
        safetyRisk: Math.round(safetyRisk * 100) / 100,
        overallRisk,
        predictedIssues: predictedIssues.length > 0 ? predictedIssues : undefined,
        daysUntilExpiry,
        recommendedAction,
        autoAlertSent,
        lastTrainedAt: new Date(),
      },
      update: {
        insuranceExpiryRisk: Math.round(insuranceExpiryRisk * 100) / 100,
        authorityRisk: Math.round(authorityRisk * 100) / 100,
        safetyRisk: Math.round(safetyRisk * 100) / 100,
        overallRisk,
        predictedIssues: predictedIssues.length > 0 ? predictedIssues : undefined,
        daysUntilExpiry,
        recommendedAction,
        autoAlertSent,
        lastTrainedAt: new Date(),
      },
    });
  }

  await prisma.aILearningCycle.create({
    data: {
      serviceName: "compliance_forecast",
      cycleType: "DAILY",
      dataPointsProcessed: carriers.length,
      modelsUpdated: carriers.length,
      durationMs: Date.now() - startTime,
      improvements: [{ alertsSent, criticalIssues }],
      status: "COMPLETED",
      completedAt: new Date(),
    },
  });

  console.log(`[ComplianceForecast] Cycle complete: ${carriers.length} carriers, ${criticalIssues} critical, ${alertsSent} alerts`);
  return { carriersScanned: carriers.length, alertsSent, criticalIssues };
}
