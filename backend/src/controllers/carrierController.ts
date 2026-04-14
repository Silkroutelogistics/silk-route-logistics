import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import path from "path";
import multer from "multer";
import { prisma } from "../config/database";
import { env } from "../config/env";
import { AuthRequest } from "../middleware/auth";
import { carrierRegisterSchema, verifyCarrierSchema } from "../validators/carrier";
import { calculateTier, getBonusPercentage } from "../services/tierService";
import { sendInsuranceVerificationEmail, validateInsuranceCoverage } from "../services/insuranceVerificationService";
import { log } from "../lib/logger";
import { onCarrierApproved } from "../services/integrationService";
import { uploadFile } from "../services/storageService";
import { runFmcsaScan } from "../services/complianceMonitorService";
import { vetAndStoreReport } from "../services/carrierVettingService";
import { sendEmail, wrap } from "../services/emailService";
import { runIdentityCheck } from "../services/identityVerificationService";
import { screenCarrier } from "../services/ofacScreeningService";

export async function registerCarrier(req: Request, res: Response) {
  try {
  const data = carrierRegisterSchema.parse(req.body);
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  // Check for existing DOT/MC before attempting create
  if (data.dotNumber) {
    const existingDot = await prisma.carrierProfile.findUnique({ where: { dotNumber: data.dotNumber } });
    if (existingDot) {
      res.status(409).json({ error: `DOT number ${data.dotNumber} is already registered with another carrier` });
      return;
    }
  }
  if (data.mcNumber) {
    const existingMc = await prisma.carrierProfile.findUnique({ where: { mcNumber: data.mcNumber } });
    if (existingMc) {
      res.status(409).json({ error: `MC number ${data.mcNumber} is already registered with another carrier` });
      return;
    }
  }

  const passwordHash = await bcrypt.hash(data.password, 12);
  const user = await prisma.user.create({
    data: {
      email: data.email,
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      company: data.company,
      phone: data.phone,
      role: "CARRIER",
      carrierProfile: {
        create: {
          mcNumber: data.mcNumber,
          dotNumber: data.dotNumber,
          equipmentTypes: data.equipmentTypes,
          operatingRegions: data.operatingRegions,
          onboardingStatus: "PENDING",
          // Contact + address (for compliance fingerprinting)
          contactName: `${data.firstName} ${data.lastName}`,
          contactPhone: data.phone,
          contactEmail: data.email,
          address: data.address,
          city: data.city,
          state: data.state,
          zip: data.zip,
          numberOfTrucks: data.numberOfTrucks ?? null,
          // Extended insurance details
          autoLiabilityProvider: data.autoLiabilityProvider,
          autoLiabilityAmount: data.autoLiabilityAmount,
          autoLiabilityPolicy: data.autoLiabilityPolicy,
          autoLiabilityExpiry: data.autoLiabilityExpiry ? new Date(data.autoLiabilityExpiry) : undefined,
          cargoInsuranceProvider: data.cargoInsuranceProvider,
          cargoInsuranceAmount: data.cargoInsuranceAmount,
          cargoInsurancePolicy: data.cargoInsurancePolicy,
          cargoInsuranceExpiry: data.cargoInsuranceExpiry ? new Date(data.cargoInsuranceExpiry) : undefined,
          generalLiabilityProvider: data.generalLiabilityProvider,
          generalLiabilityAmount: data.generalLiabilityAmount,
          generalLiabilityPolicy: data.generalLiabilityPolicy,
          generalLiabilityExpiry: data.generalLiabilityExpiry ? new Date(data.generalLiabilityExpiry) : undefined,
          workersCompProvider: data.workersCompProvider,
          workersCompAmount: data.workersCompAmount,
          workersCompPolicy: data.workersCompPolicy,
          workersCompExpiry: data.workersCompExpiry ? new Date(data.workersCompExpiry) : undefined,
          additionalInsuredSRL: data.additionalInsuredSRL ?? false,
          waiverOfSubrogation: data.waiverOfSubrogation ?? false,
          thirtyDayCancellationNotice: data.thirtyDayCancellationNotice ?? false,
          insuranceAgentName: data.insuranceAgentName,
          insuranceAgentEmail: data.insuranceAgentEmail || undefined,
          insuranceAgentPhone: data.insuranceAgentPhone,
          insuranceAgencyName: data.insuranceAgencyName,
        },
      },
    },
    include: { carrierProfile: true },
  });

  // Handle file uploads (photoId, articlesOfInc) if present
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
  if (files && user.carrierProfile) {
    const profileId = user.carrierProfile.id;
    const uploadPromises: Promise<void>[] = [];

    if (files.photoId?.[0]) {
      const file = files.photoId[0];
      const key = `carrier-docs/${profileId}/photo-id-${Date.now()}${path.extname(file.originalname)}`;
      uploadPromises.push(
        uploadFile(file.buffer, key, file.mimetype).then(async (url) => {
          await prisma.document.create({
            data: { fileName: file.originalname, fileUrl: url, fileType: file.mimetype, fileSize: file.size, userId: user.id },
          });
        })
      );
    }

    if (files.articlesOfInc?.[0]) {
      const file = files.articlesOfInc[0];
      const key = `carrier-docs/${profileId}/articles-${Date.now()}${path.extname(file.originalname)}`;
      uploadPromises.push(
        uploadFile(file.buffer, key, file.mimetype).then(async (url) => {
          await prisma.document.create({
            data: { fileName: file.originalname, fileUrl: url, fileType: file.mimetype, fileSize: file.size, userId: user.id },
          });
          await prisma.carrierProfile.update({ where: { id: profileId }, data: { authorityDocUploaded: true } });
        })
      );
    }

    // Fire and forget — don't block response
    Promise.all(uploadPromises).catch((e) => log.error({ err: e }, "[Registration Files] Upload error:"));
  }

  // Store EIN in identity verification if provided
  if (data.ein && user.carrierProfile) {
    await prisma.carrierIdentityVerification.upsert({
      where: { carrierId: user.carrierProfile.id },
      create: {
        carrierId: user.carrierProfile.id,
        w9TinFull: data.ein,
        w9TinLastFour: data.ein.slice(-4),
      },
      update: {
        w9TinFull: data.ein,
        w9TinLastFour: data.ein.slice(-4),
      },
    });
  }

  // No JWT issued at registration — carrier must be approved first
  res.status(201).json({
    message: "Carrier application submitted successfully. Your application is under review.",
    user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role },
    carrierProfile: user.carrierProfile,
  });

  // ── Post-registration automation (fire-and-forget) ──
  const profileId = user.carrierProfile?.id;
  const dot = data.dotNumber;
  const mc = data.mcNumber;

  // 1. Send registration confirmation email
  const submittedDate = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  sendEmail(
    data.email,
    "Application Received — Silk Route Logistics",
    wrap(`
      <h2 style="color:#0f172a;margin-bottom:4px">Welcome, ${data.firstName}!</h2>
      <p style="color:#64748b;font-size:14px;margin-bottom:24px">Your carrier application has been received and is under review.</p>

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin-bottom:24px">
        <p style="font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">Application Details</p>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#334155;width:40%">Company</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#475569">${data.company}</td></tr>
          <tr><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#334155">Contact</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#475569">${data.firstName} ${data.lastName}</td></tr>
          <tr><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#334155">DOT Number</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#475569">${dot}</td></tr>
          <tr><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#334155">MC Number</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#475569">${mc || "N/A"}</td></tr>
          <tr><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#334155">Equipment</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#475569">${data.equipmentTypes.join(", ")}</td></tr>
          <tr><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#334155">Regions</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#475569">${data.operatingRegions.join(", ")}</td></tr>
          <tr><td style="padding:10px 12px;font-weight:600;color:#334155">Submitted</td><td style="padding:10px 12px;color:#475569">${submittedDate}</td></tr>
        </table>
      </div>

      <h3 style="color:#0f172a;font-size:16px;margin-bottom:16px">What Happens Next</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tr>
          <td style="padding:12px 0;vertical-align:top;width:36px"><div style="width:28px;height:28px;background:#16a34a;color:#fff;border-radius:50%;text-align:center;line-height:28px;font-weight:700;font-size:13px">1</div></td>
          <td style="padding:12px 0;padding-left:12px"><strong style="color:#334155">Compliance Verification</strong><br><span style="color:#64748b;font-size:14px">Our Compass engine is verifying your FMCSA authority, insurance, safety record, and OFAC status automatically.</span></td>
        </tr>
        <tr>
          <td style="padding:12px 0;vertical-align:top"><div style="width:28px;height:28px;background:#d4a574;color:#0f172a;border-radius:50%;text-align:center;line-height:28px;font-weight:700;font-size:13px">2</div></td>
          <td style="padding:12px 0;padding-left:12px"><strong style="color:#334155">Team Review</strong><br><span style="color:#64748b;font-size:14px">A carrier relations specialist will review your application. We may contact you for additional documentation.</span></td>
        </tr>
        <tr>
          <td style="padding:12px 0;vertical-align:top"><div style="width:28px;height:28px;background:#e2e8f0;color:#64748b;border-radius:50%;text-align:center;line-height:28px;font-weight:700;font-size:13px">3</div></td>
          <td style="padding:12px 0;padding-left:12px"><strong style="color:#334155">Approval & Portal Access</strong><br><span style="color:#64748b;font-size:14px">Once approved, you'll receive your login credentials and can start browsing available loads immediately.</span></td>
        </tr>
      </table>

      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 16px;margin-bottom:24px">
        <p style="color:#92400e;font-size:14px;margin:0"><strong>Typical review time:</strong> 1–2 business days. Most applications are reviewed within 24 hours.</p>
      </div>

      <div style="text-align:center;margin:24px 0;padding:20px;background:#f8fafc;border-radius:8px">
        <p style="color:#64748b;font-size:14px;margin-bottom:8px">Questions about your application?</p>
        <p style="margin:0"><a href="tel:+12692206760" style="color:#d4a574;font-weight:700;font-size:16px;text-decoration:none">(269) 220-6760</a></p>
        <p style="color:#94a3b8;font-size:13px;margin-top:4px"><a href="mailto:operations@silkroutelogistics.ai" style="color:#d4a574">operations@silkroutelogistics.ai</a> &bull; Mon–Fri 7AM–7PM ET</p>
      </div>
    `)
  ).catch((e) => log.error({ err: e }, "[Registration Email] Error:"));

  // 2. Notify all ADMIN users about the new application
  prisma.user.findMany({ where: { role: "ADMIN" } }).then((admins) => {
    if (admins.length === 0) return;
    const reviewUrl = "https://silkroutelogistics.ai/dashboard/carriers";
    const truckCount = (req.body as Record<string, unknown>).numberOfTrucks || "—";
    for (const admin of admins) {
      sendEmail(
        admin.email,
        `New Carrier Application — ${data.company} (DOT: ${dot})`,
        wrap(`
          <h2 style="color:#0f172a;margin-bottom:4px">New Carrier Application</h2>
          <p style="color:#64748b;font-size:14px">Hi ${admin.firstName}, a new carrier has submitted an application and is awaiting review.</p>

          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:20px 0">
            <table style="width:100%;border-collapse:collapse">
              <tr><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#334155;width:40%">Company</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#475569">${data.company}</td></tr>
              <tr><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#334155">Contact</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#475569">${data.firstName} ${data.lastName}</td></tr>
              <tr><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#334155">Email</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#475569"><a href="mailto:${data.email}" style="color:#d4a574">${data.email}</a></td></tr>
              <tr><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#334155">Phone</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#475569">${data.phone || "Not provided"}</td></tr>
              <tr><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#334155">DOT#</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#475569">${dot}</td></tr>
              <tr><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#334155">MC#</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#475569">${mc || "N/A"}</td></tr>
              <tr><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#334155">Trucks</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#475569">${truckCount}</td></tr>
              <tr><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#334155">Equipment</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#475569">${data.equipmentTypes.join(", ")}</td></tr>
              <tr><td style="padding:10px 12px;font-weight:600;color:#334155">Regions</td><td style="padding:10px 12px;color:#475569">${data.operatingRegions.join(", ")}</td></tr>
            </table>
          </div>

          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;margin-bottom:20px">
            <p style="color:#166534;font-size:14px;margin:0">Compass compliance checks (FMCSA, OFAC, identity verification) have been triggered automatically.</p>
          </div>

          <div style="text-align:center;margin:24px 0">
            <a href="${reviewUrl}" style="display:inline-block;background:#d4a574;color:#0f172a;padding:14px 36px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:15px">Review Application</a>
          </div>
        `)
      ).catch((e) => log.error({ err: e }, `[Admin Notify] Error emailing ${admin.email}:`));
    }
  }).catch((e) => log.error({ err: e }, "[Admin Notify] Error fetching admins:"));

  // 3. Build chameleon fingerprint (needs address, phone, EIN stored first)
  if (profileId) {
    const { buildFingerprint } = await import("../services/chameleonDetectionService");
    buildFingerprint(profileId, req.ip || undefined).catch((e) =>
      log.error({ err: e }, "[Compass Chameleon] Fingerprint build error:")
    );
  }

  // 4. Auto-trigger Compass vetting (background)
  if (dot) {
    vetAndStoreReport(dot, profileId, mc, "AUTO_REGISTRATION").then(async (report) => {
      // Auto-approve A-grade carriers (score >= 90, no instant-fail flags)
      if (report.grade === "A" && report.recommendation === "APPROVE" && profileId) {
        try {
          await prisma.carrierProfile.update({
            where: { id: profileId },
            data: { onboardingStatus: "APPROVED", approvedAt: new Date() },
          });
          await prisma.user.update({
            where: { id: user.id },
            data: { isVerified: true },
          });
          // Notify carrier of auto-approval
          await prisma.notification.create({
            data: {
              userId: user.id,
              type: "ONBOARDING",
              title: "Application Approved!",
              message: "Your carrier application has been automatically approved. Welcome to Silk Route Logistics!",
              actionUrl: "/carrier/dashboard",
            },
          });
          log.info(`[Compass Auto-Approve] Carrier ${data.company} (DOT: ${dot}) auto-approved with grade A (score: ${report.score})`);
        } catch (e: any) {
          log.error({ err: e }, "[Compass Auto-Approve] Error:");
        }
      }
    }).catch((e) =>
      log.error({ err: e }, "[Compass Auto-Vet] Registration vetting error:")
    );
  }

  // 5. Auto-trigger identity verification (background)
  if (profileId) {
    runIdentityCheck(profileId).catch((e) =>
      log.error({ err: e }, "[Compass Identity] Auto identity check error:")
    );
  }

  // 6. Auto-trigger OFAC screening (background)
  if (profileId) {
    screenCarrier(profileId).catch((e) =>
      log.error({ err: e }, "[Compass OFAC] Auto OFAC screening error:")
    );
  }
  } catch (err: unknown) {
    log.error({ err: err }, "[Carrier Registration] Error:");
    const message = err instanceof Error ? err.message : "Registration failed";
    if (message.includes("Unique constraint")) {
      res.status(409).json({ error: "A carrier with this email, DOT, or MC number is already registered" });
    } else {
      res.status(500).json({ error: message });
    }
  }
}

export async function uploadCarrierDocuments(req: AuthRequest, res: Response) {
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    res.status(400).json({ error: "No files uploaded" });
    return;
  }

  const profile = await prisma.carrierProfile.findUnique({ where: { userId: req.user!.id } });
  if (!profile) {
    res.status(404).json({ error: "Carrier profile not found" });
    return;
  }

  const documents = await Promise.all(
    files.map(async (file) => {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const ext = path.extname(file.originalname).toLowerCase();
      const key = `carrier-docs/${uniqueSuffix}${ext}`;
      const fileUrl = await uploadFile(file.buffer, key, file.mimetype);

      // Auto-detect docType from filename
      const fname = file.originalname.toLowerCase();
      let docType = "OTHER";
      if (fname.includes("w9") || fname.includes("w-9")) docType = "W9";
      else if (fname.includes("insurance") || fname.includes("cert") || fname.includes("coi")) docType = "COI";
      else if (fname.includes("authority") || fname.includes("mc")) docType = "AUTHORITY";
      else if (fname.includes("boc")) docType = "BOC3";

      return prisma.document.create({
        data: {
          fileName: file.originalname,
          fileUrl,
          fileType: file.mimetype,
          fileSize: file.size,
          userId: req.user!.id,
          entityType: "CARRIER",
          entityId: profile.id,
          docType,
          status: "PENDING",
        },
      });
    })
  );

  const updateData: Record<string, boolean | string> = {};
  for (const file of files) {
    const name = file.originalname.toLowerCase();
    if (name.includes("w9")) updateData.w9Uploaded = true;
    if (name.includes("insurance") || name.includes("cert")) updateData.insuranceCertUploaded = true;
    if (name.includes("authority")) updateData.authorityDocUploaded = true;
  }

  if (Object.keys(updateData).length > 0) {
    updateData.onboardingStatus = "DOCUMENTS_SUBMITTED";
    await prisma.carrierProfile.update({ where: { id: profile.id }, data: updateData });
  }

  res.status(201).json(documents);
}

export async function getOnboardingStatus(req: AuthRequest, res: Response) {
  const profile = await prisma.carrierProfile.findUnique({
    where: { userId: req.user!.id },
    select: {
      onboardingStatus: true,
      w9Uploaded: true,
      insuranceCertUploaded: true,
      authorityDocUploaded: true,
      tier: true,
      approvedAt: true,
    },
  });

  if (!profile) {
    res.status(404).json({ error: "Carrier profile not found" });
    return;
  }
  res.json(profile);
}

export async function verifyCarrier(req: AuthRequest, res: Response) {
  const { status, safetyScore, notes } = verifyCarrierSchema.parse(req.body);
  const profile = await prisma.carrierProfile.findUnique({ where: { id: req.params.id } });
  if (!profile) {
    res.status(404).json({ error: "Carrier not found" });
    return;
  }

  const updated = await prisma.carrierProfile.update({
    where: { id: req.params.id },
    data: {
      onboardingStatus: status,
      safetyScore: safetyScore ?? null,
      approvedAt: status === "APPROVED" ? new Date() : null,
    },
  });

  if (status === "APPROVED") {
    await prisma.user.update({
      where: { id: profile.userId },
      data: { isVerified: true },
    });

    await prisma.notification.create({
      data: {
        userId: profile.userId,
        type: "ONBOARDING",
        title: "Application Approved",
        message: "Your carrier application has been approved. Welcome to Silk Route!",
        actionUrl: "/dashboard/overview",
      },
    });

    // Integration: create initial CPP scorecard + GUEST tier
    onCarrierApproved(profile.id).catch((e) => log.error({ err: e }, "[Integration] onCarrierApproved error:"));

    // Auto-trigger FMCSA scan to populate compliance data
    runFmcsaScan(profile.id).catch((e) => log.error({ err: e }, "[Compliance] Auto FMCSA scan error:"));

    // Send approval email to carrier
    const carrierUser = await prisma.user.findUnique({ where: { id: profile.userId } });
    if (carrierUser) {
      sendEmail(
        carrierUser.email,
        "Application Approved — Welcome to Silk Route Logistics!",
        wrap(`
          <h2 style="color:#0f172a">Congratulations, ${carrierUser.firstName}!</h2>
          <p>Your carrier application has been <strong style="color:#16a34a">approved</strong>. You can now log in to the Silk Route Logistics carrier portal.</p>
          <div style="text-align:center;margin:24px 0">
            <a href="https://silkroutelogistics.ai/carrier/login.html" style="display:inline-block;background:#d4a574;color:#0f172a;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px">Log In to Your Dashboard</a>
          </div>
          <h3 style="color:#0f172a">Getting Started</h3>
          <ul style="line-height:1.8">
            <li>Upload your W-9, Certificate of Insurance, and Operating Authority documents</li>
            <li>Set up two-factor authentication for account security</li>
            <li>Browse available loads on the load board</li>
          </ul>
          <p style="color:#64748b;font-size:13px;margin-top:24px">Questions? Contact your account representative or email <a href="mailto:operations@silkroutelogistics.ai">operations@silkroutelogistics.ai</a>.</p>
        `)
      ).catch((e) => log.error({ err: e }, "[Approval Email] Error:"));
    }
  }

  if (status === "REJECTED") {
    // Send rejection email to carrier
    const carrierUser = await prisma.user.findUnique({ where: { id: profile.userId } });
    if (carrierUser) {
      const reasonText = notes
        ? `<p><strong>Reason:</strong> ${notes}</p>`
        : `<p>If you believe this was in error or would like more information, please contact our team.</p>`;

      sendEmail(
        carrierUser.email,
        "Application Update — Silk Route Logistics",
        wrap(`
          <h2 style="color:#0f172a">Application Update</h2>
          <p>Hi ${carrierUser.firstName},</p>
          <p>After careful review, we are unable to approve your carrier application at this time.</p>
          ${reasonText}
          <h3 style="color:#0f172a">What You Can Do</h3>
          <ul style="line-height:1.8">
            <li>Review your FMCSA authority status and ensure it is active</li>
            <li>Verify your insurance coverage meets our minimum requirements ($1M liability, $100K cargo)</li>
            <li>Ensure all uploaded documents are current and legible</li>
            <li>Contact our operations team to discuss next steps</li>
          </ul>
          <p>You may reapply once the issues above have been resolved.</p>
          <p style="color:#64748b;font-size:13px;margin-top:24px">Questions? Contact <a href="mailto:operations@silkroutelogistics.ai">operations@silkroutelogistics.ai</a>.</p>
        `)
      ).catch((e) => log.error({ err: e }, "[Rejection Email] Error:"));
    }

    await prisma.notification.create({
      data: {
        userId: profile.userId,
        type: "ONBOARDING",
        title: "Application Not Approved",
        message: notes || "Your carrier application was not approved at this time. Contact support for more information.",
        actionUrl: "/onboarding",
      },
    });
  }

  res.json(updated);
}

export async function getDashboard(req: AuthRequest, res: Response) {
  const profile = await prisma.carrierProfile.findUnique({
    where: { userId: req.user!.id },
    include: {
      scorecards: { orderBy: { calculatedAt: "desc" }, take: 1 },
      bonuses: { where: { status: "PENDING" } },
    },
  });

  if (!profile) {
    res.status(404).json({ error: "Carrier profile not found" });
    return;
  }

  const [activeLoads, weeklyRevenue, monthlyRevenue, recentNotifications] = await Promise.all([
    prisma.load.count({ where: { carrierId: req.user!.id, status: { in: ["BOOKED", "IN_TRANSIT"] } } }),
    prisma.invoice.aggregate({
      where: {
        userId: req.user!.id,
        status: { in: ["FUNDED", "PAID"] },
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      _sum: { amount: true },
    }),
    prisma.invoice.aggregate({
      where: {
        userId: req.user!.id,
        status: { in: ["FUNDED", "PAID"] },
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      _sum: { amount: true },
    }),
    prisma.notification.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const latestScore = profile.scorecards[0];

  res.json({
    carrier: {
      tier: profile.tier,
      onboardingStatus: profile.onboardingStatus,
      equipmentTypes: profile.equipmentTypes,
      operatingRegions: profile.operatingRegions,
    },
    stats: {
      activeLoads,
      weeklyRevenue: weeklyRevenue._sum.amount || 0,
      monthlyRevenue: monthlyRevenue._sum.amount || 0,
      currentScore: latestScore?.overallScore || 0,
    },
    pendingBonuses: profile.bonuses.reduce((sum, b) => sum + b.amount, 0),
    recentNotifications,
  });
}

export async function getScorecard(req: AuthRequest, res: Response) {
  const profile = await prisma.carrierProfile.findUnique({ where: { userId: req.user!.id } });
  if (!profile) {
    res.status(404).json({ error: "Carrier profile not found" });
    return;
  }

  const scorecards = await prisma.carrierScorecard.findMany({
    where: { carrierId: profile.id },
    orderBy: { calculatedAt: "desc" },
    take: 12,
  });

  const currentTier = profile.tier;
  const currentScore = scorecards[0]?.overallScore || 0;
  const nextTierThreshold =
    currentTier === "BRONZE" ? 90 : currentTier === "SILVER" ? 95 : currentTier === "GOLD" ? 98 : 100;
  const bonusPct = getBonusPercentage(currentTier);

  res.json({
    currentTier,
    currentScore,
    nextTierThreshold,
    bonusPercentage: bonusPct,
    pointsToNextTier: Math.max(0, nextTierThreshold - currentScore),
    scorecards,
  });
}

export async function getCarrierScore(req: AuthRequest, res: Response) {
  const profile = await prisma.carrierProfile.findUnique({ where: { id: req.params.id } });
  if (!profile) {
    res.status(404).json({ error: "Carrier profile not found" });
    return;
  }

  const scorecards = await prisma.carrierScorecard.findMany({
    where: { carrierId: profile.id },
    orderBy: { calculatedAt: "desc" },
    take: 12,
  });

  const currentTier = profile.tier;
  const currentScore = scorecards[0]?.overallScore || 0;
  const nextTierThreshold =
    currentTier === "BRONZE" ? 90 : currentTier === "SILVER" ? 95 : currentTier === "GOLD" ? 98 : 100;
  const bonusPct = getBonusPercentage(currentTier);

  res.json({
    carrierId: profile.id,
    companyName: profile.companyName,
    currentTier,
    currentScore,
    nextTierThreshold,
    bonusPercentage: bonusPct,
    pointsToNextTier: Math.max(0, nextTierThreshold - currentScore),
    scorecards,
  });
}

export async function getRevenue(req: AuthRequest, res: Response) {
  const period = (req.query.period as string) || "monthly";
  const now = new Date();
  let since: Date;

  if (period === "weekly") since = new Date(now.getTime() - 8 * 7 * 24 * 60 * 60 * 1000);
  else if (period === "ytd") since = new Date(now.getFullYear(), 0, 1);
  else since = new Date(now.getTime() - 12 * 30 * 24 * 60 * 60 * 1000);

  const invoices = await prisma.invoice.findMany({
    where: { userId: req.user!.id, createdAt: { gte: since } },
    include: { load: { select: { originCity: true, originState: true, destCity: true, destState: true } } },
    orderBy: { createdAt: "desc" },
  });

  const profile = await prisma.carrierProfile.findUnique({ where: { userId: req.user!.id } });
  const bonuses = profile
    ? await prisma.carrierBonus.findMany({
        where: { carrierId: profile.id, createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const totalRevenue = invoices.reduce((sum, inv) => sum + inv.amount, 0);
  const totalBonuses = bonuses.reduce((sum, b) => sum + b.amount, 0);
  const avgPerLoad = invoices.length > 0 ? totalRevenue / invoices.length : 0;

  res.json({
    period,
    totalRevenue,
    totalBonuses,
    avgPerLoad,
    loadCount: invoices.length,
    invoices,
    bonuses,
  });
}

export async function getBonuses(req: AuthRequest, res: Response) {
  const profile = await prisma.carrierProfile.findUnique({ where: { userId: req.user!.id } });
  if (!profile) {
    res.status(404).json({ error: "Carrier profile not found" });
    return;
  }

  const bonuses = await prisma.carrierBonus.findMany({
    where: { carrierId: profile.id },
    orderBy: { createdAt: "desc" },
  });

  res.json(bonuses);
}

/** Setup carrier profile for admin user (for carrier view) */
export async function setupAdminCarrierProfile(req: AuthRequest, res: Response) {
  const { mcNumber, dotNumber, equipmentTypes, operatingRegions, address, city, state, zip, numberOfTrucks, company } = req.body;

  // Check if profile already exists
  const existing = await prisma.carrierProfile.findUnique({ where: { userId: req.user!.id } });
  if (existing) {
    // Update existing profile
    const updated = await prisma.carrierProfile.update({
      where: { id: existing.id },
      data: {
        ...(mcNumber && { mcNumber }),
        ...(dotNumber && { dotNumber }),
        ...(equipmentTypes && { equipmentTypes }),
        ...(operatingRegions && { operatingRegions }),
        ...(address && { address }),
        ...(city && { city }),
        ...(state && { state }),
        ...(zip && { zip }),
        ...(numberOfTrucks && { numberOfTrucks: parseInt(numberOfTrucks) }),
        onboardingStatus: "APPROVED",
        approvedAt: existing.approvedAt || new Date(),
        w9Uploaded: true,
        insuranceCertUploaded: true,
        authorityDocUploaded: true,
      },
    });
    res.json(updated);
    return;
  }

  // Update company name on user if provided
  if (company) {
    await prisma.user.update({ where: { id: req.user!.id }, data: { company } });
  }

  const profile = await prisma.carrierProfile.create({
    data: {
      userId: req.user!.id,
      mcNumber: mcNumber || "",
      dotNumber: dotNumber || "",
      equipmentTypes: equipmentTypes || [],
      operatingRegions: operatingRegions || [],
      address: address || "",
      city: city || "",
      state: state || "",
      zip: zip || "",
      numberOfTrucks: numberOfTrucks ? parseInt(numberOfTrucks) : 1,
      onboardingStatus: "APPROVED",
      approvedAt: new Date(),
      w9Uploaded: true,
      insuranceCertUploaded: true,
      authorityDocUploaded: true,
      insuranceExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      safetyScore: 100,
      tier: "PLATINUM",
    },
  });

  res.status(201).json(profile);
}

/** Get all carriers with performance data for admin/broker view */
export async function getAllCarriers(req: AuthRequest, res: Response) {
  const includeDeleted = req.query.include_deleted === "true";
  const where = includeDeleted ? {} : { deletedAt: null };

  const carriers = await prisma.carrierProfile.findMany({
    where,
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true, company: true, phone: true } },
      scorecards: { orderBy: { calculatedAt: "desc" }, take: 1 },
      tenders: { select: { status: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const results = await Promise.all(
    carriers.map(async (c) => {
      const completedLoads = await prisma.load.count({
        where: { carrierId: c.userId, status: { in: ["DELIVERED", "COMPLETED"] } },
      });
      const activeLoads = await prisma.load.count({
        where: { carrierId: c.userId, status: { in: ["BOOKED", "IN_TRANSIT", "PICKED_UP"] } },
      });
      const totalRevenue = await prisma.invoice.aggregate({
        where: { userId: c.userId, status: { in: ["FUNDED", "PAID"] } },
        _sum: { amount: true },
      });
      const latestScorecard = c.scorecards[0] || null;
      const tendersAccepted = c.tenders.filter((t) => t.status === "ACCEPTED").length;
      const tendersDeclined = c.tenders.filter((t) => t.status === "DECLINED").length;
      const tendersTotal = c.tenders.length;

      return {
        id: c.id,
        userId: c.userId,
        company: c.user.company || `${c.user.firstName} ${c.user.lastName}`,
        contactName: `${c.user.firstName} ${c.user.lastName}`,
        email: c.user.email,
        phone: c.user.phone,
        mcNumber: c.mcNumber,
        dotNumber: c.dotNumber,
        tier: c.tier,
        equipmentTypes: c.equipmentTypes,
        operatingRegions: c.operatingRegions,
        safetyScore: c.safetyScore,
        numberOfTrucks: c.numberOfTrucks,
        onboardingStatus: c.onboardingStatus,
        insuranceExpiry: c.insuranceExpiry,
        w9Uploaded: c.w9Uploaded,
        insuranceCertUploaded: c.insuranceCertUploaded,
        authorityDocUploaded: c.authorityDocUploaded,
        approvedAt: c.approvedAt,
        address: c.address,
        city: c.city,
        state: c.state,
        zip: c.zip,
        // Extended insurance details
        autoLiabilityProvider: c.autoLiabilityProvider,
        autoLiabilityAmount: c.autoLiabilityAmount,
        autoLiabilityPolicy: c.autoLiabilityPolicy,
        autoLiabilityExpiry: c.autoLiabilityExpiry,
        cargoInsuranceProvider: c.cargoInsuranceProvider,
        cargoInsuranceAmount: c.cargoInsuranceAmount,
        cargoInsurancePolicy: c.cargoInsurancePolicy,
        cargoInsuranceExpiry: c.cargoInsuranceExpiry,
        generalLiabilityProvider: c.generalLiabilityProvider,
        generalLiabilityAmount: c.generalLiabilityAmount,
        generalLiabilityPolicy: c.generalLiabilityPolicy,
        generalLiabilityExpiry: c.generalLiabilityExpiry,
        workersCompProvider: c.workersCompProvider,
        workersCompAmount: c.workersCompAmount,
        workersCompPolicy: c.workersCompPolicy,
        workersCompExpiry: c.workersCompExpiry,
        additionalInsuredSRL: c.additionalInsuredSRL,
        waiverOfSubrogation: c.waiverOfSubrogation,
        thirtyDayCancellationNotice: c.thirtyDayCancellationNotice,
        completedLoads,
        activeLoads,
        totalRevenue: totalRevenue._sum.amount || 0,
        tendersAccepted,
        tendersDeclined,
        tendersTotal,
        acceptanceRate: tendersTotal > 0 ? Math.round((tendersAccepted / tendersTotal) * 100) : 0,
        performance: latestScorecard
          ? {
              overallScore: latestScorecard.overallScore,
              onTimePickup: latestScorecard.onTimePickupPct,
              onTimeDelivery: latestScorecard.onTimeDeliveryPct,
              communication: latestScorecard.communicationScore,
              claimRatio: latestScorecard.claimRatio,
              docTimeliness: latestScorecard.documentSubmissionTimeliness,
            }
          : null,
        lastVettingScore: c.lastVettingScore,
        lastVettingRisk: c.lastVettingRisk,
        lastVettedAt: c.lastVettedAt,
        createdAt: c.createdAt,
      };
    })
  );

  res.json({ carriers: results, total: results.length });
}

/** Get single carrier detail */
export async function getCarrierDetail(req: AuthRequest, res: Response) {
  const carrier = await prisma.carrierProfile.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true, company: true, phone: true } },
      scorecards: { orderBy: { calculatedAt: "desc" }, take: 6 },
      tenders: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { load: { select: { referenceNumber: true, originCity: true, originState: true, destCity: true, destState: true, rate: true } } },
      },
    },
  });

  if (!carrier) {
    res.status(404).json({ error: "Carrier not found" });
    return;
  }

  const loads = await prisma.load.findMany({
    where: { carrierId: carrier.userId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true, referenceNumber: true, originCity: true, originState: true,
      destCity: true, destState: true, rate: true, status: true, pickupDate: true, deliveryDate: true,
    },
  });

  res.json({ carrier, loads });
}

/** Update carrier profile (admin) */
export async function updateCarrier(req: AuthRequest, res: Response) {
  const {
    safetyScore, tier, numberOfTrucks, insuranceExpiry, onboardingStatus, status, notes,
    // Extended insurance fields
    autoLiabilityProvider, autoLiabilityAmount, autoLiabilityPolicy, autoLiabilityExpiry,
    cargoInsuranceProvider, cargoInsuranceAmount, cargoInsurancePolicy, cargoInsuranceExpiry,
    generalLiabilityProvider, generalLiabilityAmount, generalLiabilityPolicy, generalLiabilityExpiry,
    workersCompProvider, workersCompAmount, workersCompPolicy, workersCompExpiry,
    additionalInsuredSRL, waiverOfSubrogation, thirtyDayCancellationNotice,
    // Insurance agent contact
    insuranceAgentName, insuranceAgentEmail, insuranceAgentPhone, insuranceAgencyName,
  } = req.body;
  const data: Record<string, unknown> = {};
  if (safetyScore !== undefined) data.safetyScore = parseFloat(safetyScore);
  if (tier !== undefined) data.tier = tier;
  if (numberOfTrucks !== undefined) data.numberOfTrucks = parseInt(numberOfTrucks);
  if (insuranceExpiry !== undefined) data.insuranceExpiry = new Date(insuranceExpiry);
  if (onboardingStatus !== undefined) data.onboardingStatus = onboardingStatus;

  // Extended insurance fields
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

  // Insurance agent contact
  if (insuranceAgentName !== undefined) data.insuranceAgentName = insuranceAgentName || null;
  if (insuranceAgentEmail !== undefined) data.insuranceAgentEmail = insuranceAgentEmail || null;
  if (insuranceAgentPhone !== undefined) data.insuranceAgentPhone = insuranceAgentPhone || null;
  if (insuranceAgencyName !== undefined) data.insuranceAgencyName = insuranceAgencyName || null;

  // Other fields
  if (status !== undefined) data.status = status;
  if (notes !== undefined) data.notes = notes;

  const updated = await prisma.carrierProfile.update({
    where: { id: req.params.id },
    data,
  });

  // If insurance fields were updated, validate and auto-send verification
  const insuranceFieldsUpdated = [
    "autoLiabilityProvider", "autoLiabilityAmount", "cargoInsuranceProvider",
    "cargoInsuranceAmount", "generalLiabilityProvider", "generalLiabilityAmount",
    "insuranceAgentEmail",
  ].some((f) => data[f] !== undefined);

  if (insuranceFieldsUpdated && updated.insuranceAgentEmail) {
    sendInsuranceVerificationEmail(updated.id).catch((err) => {
      log.error({ err, carrierId: updated.id }, "[InsVerify] Auto-send failed after admin update");
    });
  }

  const validation = validateInsuranceCoverage(updated);
  res.json({ ...updated, insuranceValidation: validation });
}
