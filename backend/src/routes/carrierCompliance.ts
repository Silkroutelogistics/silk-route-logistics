import { Router, Response } from "express";
import { prisma } from "../config/database";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { z } from "zod";
import { validateBody } from "../middleware/validate";
import { sendInsuranceVerificationEmail, validateInsuranceCoverage } from "../services/insuranceVerificationService";
import { log } from "../lib/logger";

const router = Router();

router.use(authenticate);
router.use(authorize("CARRIER"));

// GET /api/carrier-compliance/overview — Carrier's compliance dashboard
router.get("/overview", async (req: AuthRequest, res: Response) => {
  const profile = await prisma.carrierProfile.findUnique({
    where: { userId: req.user!.id },
    include: {
      user: { select: { company: true, firstName: true, lastName: true } },
    },
  });

  if (!profile) {
    res.status(404).json({ error: "Carrier profile not found" });
    return;
  }

  // Get alerts specific to this carrier
  const alerts = await prisma.complianceAlert.findMany({
    where: {
      entityType: "CarrierProfile",
      entityId: profile.id,
      status: "ACTIVE",
    },
    orderBy: { createdAt: "desc" },
  });

  // Insurance status
  const now = new Date();
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const insuranceStatus = !profile.insuranceExpiry
    ? "UNKNOWN"
    : profile.insuranceExpiry <= now
      ? "EXPIRED"
      : profile.insuranceExpiry <= thirtyDays
        ? "EXPIRING_SOON"
        : "VALID";

  // Document status
  const docStatus = {
    w9: profile.w9Uploaded,
    insuranceCert: profile.insuranceCertUploaded,
    authorityDoc: profile.authorityDocUploaded,
  };

  // FMCSA status
  const fmcsaStatus = {
    authorityStatus: profile.fmcsaAuthorityStatus || "UNKNOWN",
    safetyRating: profile.safetyRating || "NOT RATED",
    lastChecked: profile.fmcsaLastChecked,
    basicScores: profile.fmcsaBasicScores,
  };

  // Get related driver/truck alerts if any
  const relatedAlerts = await prisma.complianceAlert.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { entityType: "CarrierProfile", entityId: profile.id },
        { entityType: "Driver" },
        { entityType: "Truck" },
        { entityType: "Trailer" },
      ],
    },
    orderBy: [{ severity: "asc" }, { expiryDate: "asc" }],
    take: 20,
  });

  res.json({
    carrier: {
      company: profile.user.company || `${profile.user.firstName} ${profile.user.lastName}`,
      mcNumber: profile.mcNumber,
      dotNumber: profile.dotNumber,
      tier: profile.tier,
      safetyScore: profile.safetyScore,
    },
    insurance: {
      status: insuranceStatus,
      expiry: profile.insuranceExpiry,
      company: profile.insuranceCompany,
      policyNumber: profile.insurancePolicyNumber,
      cargoAmount: profile.cargoInsuranceAmount,
      autoLiability: profile.autoLiabilityAmount,
      generalLiability: profile.generalLiabilityAmount,
      // Extended insurance details
      autoLiabilityProvider: profile.autoLiabilityProvider,
      autoLiabilityPolicy: profile.autoLiabilityPolicy,
      autoLiabilityExpiry: profile.autoLiabilityExpiry,
      cargoInsuranceProvider: profile.cargoInsuranceProvider,
      cargoInsurancePolicy: profile.cargoInsurancePolicy,
      cargoInsuranceExpiry: profile.cargoInsuranceExpiry,
      generalLiabilityProvider: profile.generalLiabilityProvider,
      generalLiabilityPolicy: profile.generalLiabilityPolicy,
      generalLiabilityExpiry: profile.generalLiabilityExpiry,
      workersCompProvider: profile.workersCompProvider,
      workersCompAmount: profile.workersCompAmount,
      workersCompPolicy: profile.workersCompPolicy,
      workersCompExpiry: profile.workersCompExpiry,
      additionalInsuredSRL: profile.additionalInsuredSRL,
      waiverOfSubrogation: profile.waiverOfSubrogation,
      thirtyDayCancellationNotice: profile.thirtyDayCancellationNotice,
    },
    documents: docStatus,
    fmcsa: fmcsaStatus,
    alerts: relatedAlerts,
    alertsSummary: {
      critical: relatedAlerts.filter(a => a.severity === "CRITICAL").length,
      warning: relatedAlerts.filter(a => a.severity === "WARNING").length,
      info: relatedAlerts.filter(a => a.severity === "INFO").length,
    },
  });
});

// GET /api/carrier-compliance/documents — Carrier's compliance documents
router.get("/documents", async (req: AuthRequest, res: Response) => {
  const documents = await prisma.document.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: "desc" },
  });

  res.json({ documents });
});

// GET /api/carrier-compliance/csa-scores — CSA/BASIC scores
router.get("/csa-scores", async (req: AuthRequest, res: Response) => {
  const profile = await prisma.carrierProfile.findUnique({
    where: { userId: req.user!.id },
  });

  if (!profile) {
    res.status(404).json({ error: "Carrier profile not found" });
    return;
  }

  // BASIC scores from FMCSA data
  const basicScores = (profile.fmcsaBasicScores as Record<string, number> | null) || {
    unsafeDriving: 0,
    hoursOfService: 0,
    driverFitness: 0,
    controlledSubstances: 0,
    vehicleMaintenance: 0,
    hazmat: 0,
    crashIndicator: 0,
  };

  // Get scorecard data for SRL-specific metrics
  const scorecards = await prisma.carrierScorecard.findMany({
    where: { carrierId: profile.id },
    orderBy: { calculatedAt: "desc" },
    take: 6,
  });

  res.json({
    dotNumber: profile.dotNumber,
    safetyRating: profile.safetyRating,
    lastChecked: profile.fmcsaLastChecked,
    basicScores,
    srlMetrics: scorecards.length > 0 ? {
      onTimePickup: scorecards[0].onTimePickupPct,
      onTimeDelivery: scorecards[0].onTimeDeliveryPct,
      communication: scorecards[0].communicationScore,
      claimRatio: scorecards[0].claimRatio,
      docTimeliness: scorecards[0].documentSubmissionTimeliness,
      overallScore: scorecards[0].overallScore,
    } : null,
    history: scorecards,
  });
});

// POST /api/carrier-compliance/upload-document — Upload compliance document
router.post("/upload-document", async (req: AuthRequest, res: Response) => {
  // This is handled by the main document upload route
  // Just redirect or inform the carrier
  res.json({ message: "Use POST /api/documents/upload with entityType=CARRIER and docType as needed" });
});

// GET /api/carrier-compliance/expiration-calendar — Upcoming expirations
router.get("/expiration-calendar", async (req: AuthRequest, res: Response) => {
  const profile = await prisma.carrierProfile.findUnique({
    where: { userId: req.user!.id },
  });

  if (!profile) {
    res.status(404).json({ error: "Carrier profile not found" });
    return;
  }

  const expirations: Array<{ type: string; date: string | null; status: string }> = [];
  const now = new Date();
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  function getStatus(date: Date | null): string {
    if (!date) return "UNKNOWN";
    if (date <= now) return "EXPIRED";
    if (date <= thirtyDays) return "EXPIRING_SOON";
    return "VALID";
  }

  expirations.push({
    type: "Insurance",
    date: profile.insuranceExpiry?.toISOString() || null,
    status: getStatus(profile.insuranceExpiry),
  });

  // Get alerts for additional expirations
  const alerts = await prisma.complianceAlert.findMany({
    where: {
      entityType: "CarrierProfile",
      entityId: profile.id,
      status: "ACTIVE",
    },
  });

  for (const alert of alerts) {
    expirations.push({
      type: alert.type.replace(/_/g, " "),
      date: alert.expiryDate.toISOString(),
      status: alert.severity === "CRITICAL" ? "EXPIRED" : "EXPIRING_SOON",
    });
  }

  res.json({ expirations });
});

// PATCH /api/carrier-compliance/insurance — Carrier updates their own insurance details
router.patch("/insurance", async (req: AuthRequest, res: Response) => {
  const profile = await prisma.carrierProfile.findUnique({ where: { userId: req.user!.id } });
  if (!profile) {
    res.status(404).json({ error: "Carrier profile not found" });
    return;
  }

  const {
    autoLiabilityProvider, autoLiabilityAmount, autoLiabilityPolicy, autoLiabilityExpiry,
    cargoInsuranceProvider, cargoInsuranceAmount, cargoInsurancePolicy, cargoInsuranceExpiry,
    generalLiabilityProvider, generalLiabilityAmount, generalLiabilityPolicy, generalLiabilityExpiry,
    workersCompProvider, workersCompAmount, workersCompPolicy, workersCompExpiry,
    additionalInsuredSRL, waiverOfSubrogation, thirtyDayCancellationNotice,
  } = req.body;

  const data: Record<string, unknown> = {};
  if (autoLiabilityProvider !== undefined) data.autoLiabilityProvider = autoLiabilityProvider;
  if (autoLiabilityAmount !== undefined) data.autoLiabilityAmount = autoLiabilityAmount ? parseFloat(autoLiabilityAmount) : null;
  if (autoLiabilityPolicy !== undefined) data.autoLiabilityPolicy = autoLiabilityPolicy;
  if (autoLiabilityExpiry !== undefined) data.autoLiabilityExpiry = autoLiabilityExpiry ? new Date(autoLiabilityExpiry) : null;
  if (cargoInsuranceProvider !== undefined) data.cargoInsuranceProvider = cargoInsuranceProvider;
  if (cargoInsuranceAmount !== undefined) data.cargoInsuranceAmount = cargoInsuranceAmount ? parseFloat(cargoInsuranceAmount) : null;
  if (cargoInsurancePolicy !== undefined) data.cargoInsurancePolicy = cargoInsurancePolicy;
  if (cargoInsuranceExpiry !== undefined) data.cargoInsuranceExpiry = cargoInsuranceExpiry ? new Date(cargoInsuranceExpiry) : null;
  if (generalLiabilityProvider !== undefined) data.generalLiabilityProvider = generalLiabilityProvider;
  if (generalLiabilityAmount !== undefined) data.generalLiabilityAmount = generalLiabilityAmount ? parseFloat(generalLiabilityAmount) : null;
  if (generalLiabilityPolicy !== undefined) data.generalLiabilityPolicy = generalLiabilityPolicy;
  if (generalLiabilityExpiry !== undefined) data.generalLiabilityExpiry = generalLiabilityExpiry ? new Date(generalLiabilityExpiry) : null;
  if (workersCompProvider !== undefined) data.workersCompProvider = workersCompProvider;
  if (workersCompAmount !== undefined) data.workersCompAmount = workersCompAmount ? parseFloat(workersCompAmount) : null;
  if (workersCompPolicy !== undefined) data.workersCompPolicy = workersCompPolicy;
  if (workersCompExpiry !== undefined) data.workersCompExpiry = workersCompExpiry ? new Date(workersCompExpiry) : null;
  if (additionalInsuredSRL !== undefined) data.additionalInsuredSRL = additionalInsuredSRL === true || additionalInsuredSRL === "true";
  if (waiverOfSubrogation !== undefined) data.waiverOfSubrogation = waiverOfSubrogation === true || waiverOfSubrogation === "true";
  if (thirtyDayCancellationNotice !== undefined) data.thirtyDayCancellationNotice = thirtyDayCancellationNotice === true || thirtyDayCancellationNotice === "true";

  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: "No insurance fields to update" });
    return;
  }

  const updated = await prisma.carrierProfile.update({
    where: { id: profile.id },
    data,
  });

  // Validate coverage against minimums
  const validation = validateInsuranceCoverage(updated);

  // Auto-send verification email to insurance agent if agent email exists
  if (updated.insuranceAgentEmail) {
    sendInsuranceVerificationEmail(updated.id).catch((err) => {
      log.error({ err, carrierId: updated.id }, "[InsVerify] Auto-send failed after insurance update");
    });
  }

  res.json({ message: "Insurance details updated", updated, validation });
});

export default router;
