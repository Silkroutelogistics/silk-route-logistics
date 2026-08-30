import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import path from "path";
import multer from "multer";
import { prisma } from "../config/database";
import { env } from "../config/env";
import { AuthRequest } from "../middleware/auth";
import { carrierRegisterSchema, verifyCarrierSchema } from "../validators/carrier";
import { getBonusPercentage } from "../services/tierService";
import { sendInsuranceVerificationEmail, validateInsuranceCoverage, maybeSendInsuranceVerificationEmail, didInsuranceFieldsChange } from "../services/insuranceVerificationService";
import { log } from "../lib/logger";
import { onCarrierApproved } from "../services/integrationService";
import { uploadFile } from "../services/storageService";
import { runFmcsaScan, complianceCheck } from "../services/complianceMonitorService";
import { vetAndStoreReport } from "../services/carrierVettingService";
import { sendEmail, wrap, sendQuickPayApprovedEmail } from "../services/emailService";
import { getTierConfig, getEffectiveTier } from "../services/caravanService";
import { runIdentityCheck } from "../services/identityVerificationService";
import { screenCarrier } from "../services/ofacScreeningService";
import { populateAuthorityGrantedDate } from "../services/fmcsaService";
// The consent record names the version the server serves, never one the
// request supplied. See the bcaVersion write below.
import { BCA_VERSION } from "../data/agreements";
import { resolveCountry, extractClientIp } from "../services/geoService";
import { normalizePhoneE164 } from "../lib/phoneNormalization";
import { normalizeEmail, caseInsensitiveEmailFilter } from "../lib/emailNormalization";
import { verifyReceipt } from "../services/onboardingDraftService";
import { approveCarrier } from "../services/approvalService";
import { logAuthEvent } from "../lib/authEvents";
import { COMPLIANCE_EMAIL } from "../config/authority";
import * as crypto from "crypto";
import { pairedApplicationStatus } from "../lib/carrierOperational";

// v3.8.ala — Fire-and-forget compliance flag dispatch on registration
// duplicate hits. Sends a brief alert to COMPLIANCE_EMAIL +
// writes a SystemLog WARNING row for queryable forensic visibility.
// Hashes the colliding value (email or phone E.164) into the email
// body + log details so the destination + log table never carry
// plaintext PII of the attempted submission. Recipient resolution
// uses the COMPLIANCE_EMAIL constant per the directive "flag the
// attempt to compliance@"; the role-based dispatch pattern from
// chameleonDetectionService.ts is intentionally NOT used here —
// the directive specifies the single canonical inbox.
//
// Non-blocking: caller fires + forgets. Timing-side-channel guard:
// dispatch happens AFTER the 409 response is already sent, so a
// duplicate-hit response is indistinguishable from a non-collision
// response from the attacker's clock.
function flagRegistrationDuplicate(opts: {
  collidedField: "email" | "phone";
  attemptedValue: string;
  attemptIp: string | null;
  attemptCountry: string | null;
}): void {
  const valueHash = crypto.createHash("sha256").update(opts.attemptedValue).digest("hex").slice(0, 16);
  const subject = `[SRL Possible Impersonation] Registration attempt against existing identity`;
  const html = wrap(`
    <h2 style="color:#0A2540;margin-bottom:4px">Registration duplicate — possible impersonation signal</h2>
    <p style="color:#3A4A5F;font-size:14px;line-height:1.6">
      A carrier registration attempt collided with an existing account on the
      <strong>${opts.collidedField}</strong> field. Per the no-double-brokering
      posture, every duplicate hit is surfaced to compliance for review.
    </p>
    <div style="background:#FBF7F0;border:1px solid #EFE6D3;border-radius:8px;padding:16px;margin:16px 0">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tr><td style="color:#6B7685;padding:4px 0;width:40%">Collided field</td><td style="color:#0A2540;font-weight:600">${opts.collidedField}</td></tr>
        <tr><td style="color:#6B7685;padding:4px 0">Attempted value SHA-256 (first 16)</td><td style="color:#0A2540;font-family:monospace">${valueHash}</td></tr>
        <tr><td style="color:#6B7685;padding:4px 0">Attempt IP</td><td style="color:#0A2540;font-family:monospace">${opts.attemptIp || "—"}</td></tr>
        <tr><td style="color:#6B7685;padding:4px 0">Attempt country (geoip)</td><td style="color:#0A2540;font-family:monospace">${opts.attemptCountry || "—"}</td></tr>
        <tr><td style="color:#6B7685;padding:4px 0">Timestamp</td><td style="color:#0A2540;font-family:monospace">${new Date().toISOString()}</td></tr>
      </table>
    </div>
    <p style="color:#3A4A5F;font-size:13px;line-height:1.6">
      The attempt was rejected with a generic 409. No PII of the attempted
      value is included above — only the SHA-256 prefix, sufficient for
      cross-referencing repeat attempts without exposing the value itself.
    </p>
    <p style="color:#6B7685;font-size:12px;margin-top:24px">
      Source: <code>registration-duplicate</code> · See SystemLog WARNING
      rows with this source for the full event stream.
    </p>
  `);
  sendEmail(COMPLIANCE_EMAIL, subject, html).catch((err) =>
    log.error({ err, valueHash, collidedField: opts.collidedField }, "[Reg Duplicate Flag] Email send failed"),
  );
  prisma.systemLog.create({
    data: {
      logType: "SECURITY",
      severity: "WARNING",
      source: "registration-duplicate",
      message: `Registration duplicate (${opts.collidedField}) — possible impersonation signal`,
      details: {
        collidedField: opts.collidedField,
        attemptedValueHash: valueHash,
        attemptIp: opts.attemptIp,
        attemptCountry: opts.attemptCountry,
      } as any,
    },
  }).catch((err) =>
    log.error({ err, valueHash, collidedField: opts.collidedField }, "[Reg Duplicate Flag] SystemLog write failed"),
  );
}

export async function registerCarrier(req: Request, res: Response) {
  try {
  const data = carrierRegisterSchema.parse(req.body);

  // v3.8.ald — Registration write site routes through normalizeEmail()
  // helper. Replaces alb's inline `.toLowerCase().trim()`. Single
  // source of truth for the canonical form across all email-touching
  // paths. See backend/src/lib/emailNormalization.ts.
  const normalizedEmail = normalizeEmail(data.email);
  if (!normalizedEmail) {
    res.status(400).json({ error: "Invalid email" });
    return;
  }
  data.email = normalizedEmail;

  // ── Arc 32: the gate ────────────────────────────────────────────────
  // Registration is the ONE server write the five-step wizard makes — Steps
  // 2-5 are React state until Submit — so this single check is the whole of
  // server-side enforcement. It sits ABOVE the duplicate-email lookup
  // deliberately: an unverified caller must not learn which addresses are
  // already registered.
  //
  // Fails CLOSED. A malformed, forged, expired, wrong-address or nonce-stale
  // receipt all land here, and the message names the remedy rather than the
  // failure class — the carrier's next action is identical in every case, and
  // the classes are already in the auth log.
  const receiptCheck = await verifyReceipt(data.verificationReceipt, data.email);
  if (!receiptCheck.ok) {
    logAuthEvent("onboarding.verify_failed", {
      email: data.email,
      req,
      reason: receiptCheck.reason === "expired" ? "expired_token" : "invalid_token",
    });
    res.status(403).json({
      error: "Please confirm your email address before submitting your application.",
      code: "EMAIL_NOT_VERIFIED",
      // The wizard reads this to reopen the verification step rather than
      // stranding the carrier on Step 5 with a message and no control.
      reverifyEmail: data.email,
    });
    return;
  }

  // The verified draft behind that receipt. Read AFTER the receipt is proven,
  // never as a substitute for proving it: the receipt is what binds this
  // submission to a mailbox, and looking a draft up by email would check a
  // browser-supplied address against whatever draft happened to match it.
  const verifiedDraft = await prisma.onboardingDraft
    .findFirst({
      where: { email: data.email.trim().toLowerCase(), verifiedAt: { not: null } },
      orderBy: { updatedAt: "desc" },
      select: { verifiedAt: true, verifiedFromIp: true, verifiedFromCountry: true },
    })
    .catch(() => null);

  // v3.8.ala — Capture registration IP + country early so duplicate-hit
  // compliance flag dispatch (below) carries forensic context.
  const registrationIp = extractClientIp(req);
  const registrationCountry = resolveCountry(registrationIp);

  // v3.8.ald — case-insensitive filter from the shared helper.
  const existing = await prisma.user.findFirst({ where: caseInsensitiveEmailFilter(data.email) });
  if (existing) {
    // v3.8.ala — Fire-and-forget compliance flag on email collision per
    // no-double-brokering posture. Generic 409 to the attacker; full
    // forensic event to compliance@ + SystemLog. Dispatch is non-
    // blocking — the response goes out first, the flag fires after.
    res.status(409).json({ error: "Email already registered" });
    flagRegistrationDuplicate({
      collidedField: "email",
      attemptedValue: data.email,
      attemptIp: registrationIp,
      attemptCountry: registrationCountry,
    });
    return;
  }

  // v3.8.ala — Phone duplicate check mirroring the email check above.
  // Both stored and submitted numbers are normalized to E.164 before
  // comparison so formatting differences (display-format "(269) 220-
  // 6760" vs digit-strip "2692206760" vs prefixed "+12692206760")
  // don't create false negatives. Storage stays as-typed; this check
  // is normalize-on-the-fly. Light scan at pre-revenue volumes; the
  // indexed `phoneNormalized` column refactor is banked for the
  // ~10K+ row threshold as a separate sprint. See backend/src/lib/
  // phoneNormalization.ts for the normalizer.
  const normalizedIncomingPhone = normalizePhoneE164(data.phone);
  if (normalizedIncomingPhone) {
    const existingPhones = await prisma.user.findMany({
      where: { phone: { not: null } },
      select: { id: true, phone: true },
    });
    const phoneCollision = existingPhones.find((u) =>
      normalizePhoneE164(u.phone) === normalizedIncomingPhone,
    );
    if (phoneCollision) {
      res.status(409).json({ error: "Phone number already registered" });
      flagRegistrationDuplicate({
        collidedField: "phone",
        attemptedValue: normalizedIncomingPhone,
        attemptIp: registrationIp,
        attemptCountry: registrationCountry,
      });
      return;
    }
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

  // v3.8.alc — required-doc gate hardened against client-asserted spoofing.
  // alb read req.body.docTypes directly; a curl POST with docTypes set
  // but no `files` would pass. Now derives presence from req.files.files
  // (multer payload) — a tag only counts as "present" if the file at
  // the same index actually exists. Same 422 + missing[] response.
  const CANADIAN_REGIONS = ["Eastern Canada", "Western Canada", "Central Canada", "Cross-Border"];
  const hasCanadianOps = Array.isArray(data.operatingRegions) && data.operatingRegions.some((r: string) => CANADIAN_REGIONS.includes(r));
  const requiredDocs = ["w9", "insurance", "authority", "wc", ...(hasCanadianOps ? ["safety"] : [])];
  const reqFiles = (req as any).files;
  const uploadedFiles: Express.Multer.File[] = Array.isArray(reqFiles?.files) ? reqFiles.files : [];
  const clientTags: unknown[] = Array.isArray((req.body as any).docTypes) ? (req.body as any).docTypes : [];
  const presentDocTypes = new Set<string>();
  for (let i = 0; i < uploadedFiles.length; i++) {
    const tag = typeof clientTags[i] === "string" ? (clientTags[i] as string).toLowerCase() : "";
    if (tag) presentDocTypes.add(tag);
  }
  const missingDocs = requiredDocs.filter((k) => !presentDocTypes.has(k));
  if (missingDocs.length > 0) {
    res.status(422).json({ error: "Missing required documents", missing: missingDocs });
    return;
  }

  const passwordHash = await bcrypt.hash(data.password, 12);
  const user = await prisma.user.create({
    data: {
      email: data.email,
      passwordHash,
      // v3.8.aqk GO-LIVE BLOCKER FIX: without this, carrierAuth.ts:316/405
      // computes `mustChangePassword = !user.passwordChangedAt` = true on the
      // carrier's FIRST login, routing them to /auth/force-password-change —
      // an AE-console page that bounces them to the AE login where their
      // credentials are rejected. A self-registering carrier chooses their own
      // password (with the strong-password + HIBP gate), so there is nothing
      // to force-change. Mirrors authController.ts:135.
      passwordChangedAt: new Date(),
      // THE MAILBOX IS ALREADY PROVEN — carry that proof forward rather than
      // asking for it a second time.
      //
      // The carrier verified this exact address between wizard Steps 1 and 2,
      // by typed code or by clicking the link, and `verifyReceipt` above has
      // just confirmed the receipt binds to it. Leaving emailVerifiedAt null
      // here meant the platform did not believe its own gate: the carrier was
      // emailed a SECOND verification link after submitting, and the Compass
      // auto-approve gate below refused to run until they clicked it. A carrier
      // who ignored that email sat unapproved for a reason nobody told them.
      //
      // Geo comes from the draft, captured server-side at the verifying click.
      // Both are null for a draft verified before that capture shipped, which
      // is the honest answer — the AE panel shows an empty row rather than an
      // invented origin.
      emailVerifiedAt: verifiedDraft?.verifiedAt ?? null,
      emailVerifiedFromIp: verifiedDraft?.verifiedFromIp ?? null,
      emailVerifiedFromCountry: verifiedDraft?.verifiedFromCountry ?? null,
      firstName: data.firstName,
      lastName: data.lastName,
      company: data.company,
      phone: data.phone,
      role: "CARRIER",
      carrierProfile: {
        create: {
          // v3.8.aqk GO-LIVE FIX: companyName was never persisted at
          // self-registration, so carriers rendered as "(no name)" in the AE
          // list/pickers and the EXECUTED Broker-Carrier Agreement PDF was
          // signed by the literal string "Carrier".
          companyName: data.company,
          mcNumber: data.mcNumber,
          dotNumber: data.dotNumber,
          equipmentTypes: data.equipmentTypes,
          operatingRegions: data.operatingRegions,
          onboardingStatus: "PENDING",
          status: "NEW", // B2 — paired; see lib/carrierOperational
          // v3.8.aje — Resolved country from registration IP (geoip-lite).
          // Compared against User.emailVerifiedFromCountry at verify-click
          // time to surface country-jump fraud signals in the AE drawer.
          registrationCountry: registrationCountry,
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
          // v3.8.aiw — Effective date pair (industry-standard COI verification).
          autoLiabilityProvider: data.autoLiabilityProvider,
          autoLiabilityAmount: data.autoLiabilityAmount,
          autoLiabilityPolicy: data.autoLiabilityPolicy,
          autoLiabilityEffective: data.autoLiabilityEffective ? new Date(data.autoLiabilityEffective) : undefined,
          autoLiabilityExpiry: data.autoLiabilityExpiry ? new Date(data.autoLiabilityExpiry) : undefined,
          cargoInsuranceProvider: data.cargoInsuranceProvider,
          cargoInsuranceAmount: data.cargoInsuranceAmount,
          cargoInsurancePolicy: data.cargoInsurancePolicy,
          cargoInsuranceEffective: data.cargoInsuranceEffective ? new Date(data.cargoInsuranceEffective) : undefined,
          cargoInsuranceExpiry: data.cargoInsuranceExpiry ? new Date(data.cargoInsuranceExpiry) : undefined,
          generalLiabilityProvider: data.generalLiabilityProvider,
          generalLiabilityAmount: data.generalLiabilityAmount,
          generalLiabilityPolicy: data.generalLiabilityPolicy,
          generalLiabilityEffective: data.generalLiabilityEffective ? new Date(data.generalLiabilityEffective) : undefined,
          generalLiabilityExpiry: data.generalLiabilityExpiry ? new Date(data.generalLiabilityExpiry) : undefined,
          workersCompProvider: data.workersCompProvider,
          workersCompAmount: data.workersCompAmount,
          workersCompPolicy: data.workersCompPolicy,
          workersCompEffective: data.workersCompEffective ? new Date(data.workersCompEffective) : undefined,
          workersCompExpiry: data.workersCompExpiry ? new Date(data.workersCompExpiry) : undefined,
          additionalInsuredSRL: data.additionalInsuredSRL ?? false,
          waiverOfSubrogation: data.waiverOfSubrogation ?? false,
          thirtyDayCancellationNotice: data.thirtyDayCancellationNotice ?? false,
          insuranceAgentName: data.insuranceAgentName,
          insuranceAgentEmail: data.insuranceAgentEmail || undefined,
          insuranceAgentPhone: data.insuranceAgentPhone,
          insuranceAgencyName: data.insuranceAgencyName,
          // v3.8.aja — BCA click-wrap audit trail captured server-side.
          // agreedAt = server-now (authoritative — not client-supplied).
          // IP from req.ip (Render forwards x-forwarded-for via Express
          // 'trust proxy' setting). UA from req.headers.
          //
          // v3.8.asb — the version is now server-stamped too. It used to be
          // `data.bcaVersion || null`, a client-supplied string on a consent
          // record: the same defect the two signing routes in carrierAuth got
          // a 409 guard for, on the one surface that guard never sees, because
          // this write comes in on the registration payload rather than
          // /sign-bca. The onboarding page's fallback constant had drifted
          // three months stale, so a failed agreement fetch stamped a version
          // that no longer described the text being shown.
          //
          // This route is not a version-negotiation surface — the applicant is
          // registering, and refusing the whole registration over a stale tab
          // would be the wrong trade. The page fetches the body and now blocks
          // the acknowledgement until it has loaded, so the text acknowledged
          // is this version's text, and the server records the version it
          // actually serves. The request no longer decides.
          bcaAgreedAt: new Date(),
          bcaAgreedFromIp: req.ip || (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || null,
          bcaAgreedFromUserAgent: (req.headers["user-agent"] as string) || null,
          bcaVersion: BCA_VERSION,
        },
      },
    },
    include: { carrierProfile: true },
  });

  // ── v3.8.avl — a failed upload is RECORDED, never silently dropped ──
  //
  // This block used to be `Promise.all(uploadPromises).catch(log.error)`: fire
  // and forget, with a catch that only logged. In production storageService
  // REFUSES uploads when object storage is unconfigured — deliberately, and
  // loudly at its own layer — and that refusal landed in this catch and stopped.
  // The application succeeded, no Document row was written, and the AE opened
  // the carrier to DOCUMENTS (0) with nothing to distinguish "submitted
  // nothing" from "submitted four and we lost them". The production documents
  // table held ZERO rows across every carrier that had ever applied.
  //
  // Two things were wrong and both are fixed here:
  //   1. the refusal was swallowed, so nobody learned anything
  //   2. photoId and articlesOfInc wrote Document rows with NO entityType or
  //      entityId, so even a SUCCESSFUL upload was invisible to the AE drawer,
  //      which queries entityType=CARRIER + entityId=profileId
  //
  // The registration still succeeds. A carrier must not lose a completed
  // application because our object store is misconfigured — that is our fault,
  // not theirs, and the remedy is an env var, not a re-application. But the
  // failure is now a row the AE can see, an admin notification, and an ERROR
  // log, instead of a clean zero that reads like nothing was ever sent.
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
  if (files && user.carrierProfile) {
    const profileId = user.carrierProfile.id;

    type FlagField = "w9Uploaded" | "insuranceCertUploaded" | "authorityDocUploaded" | null;
    interface PendingUpload {
      file: Express.Multer.File;
      storagePath: string;
      docType: string;
      flagField: FlagField;
    }
    const pending: PendingUpload[] = [];
    const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    if (files.photoId?.[0]) {
      const f = files.photoId[0];
      pending.push({
        file: f,
        storagePath: `carrier-docs/${profileId}/photo-id-${stamp()}${path.extname(f.originalname)}`,
        docType: "OTHER",
        flagField: null,
      });
    }

    if (files.articlesOfInc?.[0]) {
      const f = files.articlesOfInc[0];
      pending.push({
        file: f,
        storagePath: `carrier-docs/${profileId}/articles-${stamp()}${path.extname(f.originalname)}`,
        docType: "REGISTRATION",
        flagField: "authorityDocUploaded",
      });
    }

    // v3.8.ajr — Step 3 staged documents from the /onboarding file picker,
    // bundled with the registration POST as `files[]` paired by index with
    // `docTypes[]`. DOC_TYPE_MAP translates the frontend tag into the canonical
    // Document.docType plus the CarrierProfile flag driving Document Completeness.
    const stagedFiles = (files.files || []) as Express.Multer.File[];
    const docTypesArr: string[] = Array.isArray((req.body as any).docTypes)
      ? (req.body as any).docTypes
      : ((req.body as any).docTypes ? [(req.body as any).docTypes] : []);
    const DOC_TYPE_MAP: Record<string, { docType: string; flagField: FlagField }> = {
      w9:        { docType: "W9",           flagField: "w9Uploaded" },
      insurance: { docType: "COI",          flagField: "insuranceCertUploaded" },
      authority: { docType: "AUTHORITY",    flagField: "authorityDocUploaded" },
      // v3.8.aky — Document.docType is a free-form String?, NOT a Prisma enum,
      // so WORKERS_COMP needs no migration.
      wc:        { docType: "WORKERS_COMP", flagField: null },
      safety:    { docType: "OTHER",        flagField: null },
    };
    for (let i = 0; i < stagedFiles.length; i++) {
      const f = stagedFiles[i];
      const tagKey = (docTypesArr[i] || "").toLowerCase();
      const mapped = DOC_TYPE_MAP[tagKey] || { docType: "OTHER", flagField: null };
      pending.push({
        file: f,
        storagePath: `carrier-docs/${profileId}/${tagKey || "other"}-${stamp()}${path.extname(f.originalname).toLowerCase()}`,
        docType: mapped.docType,
        flagField: mapped.flagField,
      });
    }

    // Runs after the response, so the carrier is not held waiting on object
    // storage — but every outcome is recorded before it finishes.
    void (async () => {
      const failures: string[] = [];

      for (const u of pending) {
        try {
          const url = await uploadFile(u.file.buffer, u.storagePath, u.file.mimetype);
          await prisma.document.create({
            data: {
              fileName: u.file.originalname,
              fileUrl: url,
              fileType: u.file.mimetype,
              fileSize: u.file.size,
              // entityType + entityId are what make the row visible to the AE
              // drawer AND the carrier portal. Omitting them was defect (2).
              entityType: "CARRIER",
              entityId: profileId,
              docType: u.docType,
              status: "PENDING",
              uploadSource: "CARRIER_PORTAL",
              userId: user.id,
            },
          });
          if (u.flagField) {
            await prisma.carrierProfile.update({
              where: { id: profileId },
              data: { [u.flagField]: true },
            });
          }
        } catch (err) {
          failures.push(`${u.docType}:${u.file.originalname}`);
          log.error(
            { err, profileId, docType: u.docType, fileName: u.file.originalname },
            "[Registration Files] PERSIST FAILED — recording an UPLOAD_FAILED row so the AE never sees a clean zero",
          );
          // The honest artifact: the document WAS submitted and we did not keep
          // it. The empty fileUrl is deliberate — there is nothing to link to.
          // The completeness flag is NOT set, so the carrier still reads as
          // missing that document, which is true.
          await prisma.document
            .create({
              data: {
                fileName: u.file.originalname,
                fileUrl: "",
                fileType: u.file.mimetype,
                fileSize: u.file.size,
                entityType: "CARRIER",
                entityId: profileId,
                docType: u.docType,
                status: "UPLOAD_FAILED",
                uploadSource: "CARRIER_PORTAL",
                userId: user.id,
                notes: "Storage refused or failed at registration. The carrier submitted this file; it was not retained. Ask them to re-upload once storage is confirmed.",
              },
            })
            .catch((e2) => log.error({ err: e2, profileId }, "[Registration Files] could not even record the failure"));
        }
      }

      if (failures.length > 0) {
        // An AE must learn this without reading logs.
        try {
          const admins = await prisma.user.findMany({
            where: { role: { in: ["ADMIN", "CEO"] }, isActive: true },
            select: { id: true },
          });
          await prisma.notification.createMany({
            data: admins.map((a) => ({
              userId: a.id,
              type: "SYSTEM_ALERT",
              title: "Carrier documents were NOT stored",
              message:
                `${data.company} submitted ${failures.length} document(s) that failed to store: ` +
                `${failures.join(", ")}. The application was accepted. Object storage is likely ` +
                `unconfigured — check S3_BUCKET_NAME / AWS_ACCESS_KEY_ID before asking the carrier to re-upload.`,
              actionUrl: "/dashboard/carriers?status=PENDING",
            })),
          });
        } catch (e) {
          log.error({ err: e }, "[Registration Files] failed to notify admins of the document loss");
        }
      }
    })();
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

  // ── v3.8.asb — the Quick Pay pilot REQUEST ──
  //
  // A tick at onboarding, and nothing more. It records that the carrier asked
  // to be considered; it does not enable Quick Pay, does not set
  // quickPayEnabled, and does not let a fee be recorded on any load. An AE
  // approves or declines it from the pending queue.
  //
  // Awaited rather than fire-and-forget, because the carrier is about to be
  // told their application was submitted and the request is part of what they
  // submitted. Wrapped so a failure here cannot fail a registration that has
  // already created the user — the account is real either way, and a carrier
  // whose request was lost can ask again from the portal. The failure is
  // logged loudly so it is not silent.
  if (data.requestQuickPayPilot === true && user.carrierProfile) {
    try {
      await prisma.quickPayEnrollment.create({
        data: { carrierProfileId: user.carrierProfile.id, status: "PENDING" },
      });
      // Tell the desk. Fire-and-forget: the request is recorded either way, and
      // the queue still holds it if the signal fails.
      void notifyQuickPayPilotRequested(user.carrierProfile.id, "onboarding");
    } catch (err) {
      log.error(
        { err, carrierProfileId: user.carrierProfile.id, email: data.email },
        "[QuickPayPilot] Registration requested the pilot but the enrolment row could not be created",
      );
    }
  }

  // No JWT issued at registration — carrier must be approved first.
  // v3.8.ajq — Add applicationReference for the carrier-facing
  // confirmation screen. Derived from user.id last 8 chars uppercased
  // (cuid format → mostly alphanumeric, stable, no schema change).
  // Carrier saves it for future reference; AE lookup still works via
  // email/MC/DOT search on /dashboard/carriers.
  const applicationReference = `APP-${user.id.slice(-8).toUpperCase()}`;
  res.status(201).json({
    message: "Carrier application submitted successfully. Your application is under review.",
    applicationReference,
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
          <td style="padding:12px 0;padding-left:12px"><strong style="color:#334155">Approval &amp; Portal Access</strong><br><span style="color:#64748b;font-size:14px">You can sign in right now with this email address and the password you created during the application — we never send temporary credentials. Once approved, available loads appear in your portal.</span></td>
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

  // 1.5. SUPERSEDED 2026-08-30 — the second verification email is GONE.
  //
  // WHAT IT DID, and when it was right. v3.8.aje minted a 24h `VERIFY:<token>`
  // OtpCode row and emailed the carrier a click link landing at
  // /carrier/verify-email. The click captured its IP and country for the
  // country-jump fraud signal and set User.emailVerifiedAt. When it shipped,
  // registration was the FIRST server write in the whole flow — there was no
  // earlier moment at which a mailbox could have been proven, so proving it
  // afterwards was the only option available.
  //
  // WHAT CHANGED. Arc 32 moved verification EARLIER, to between wizard Steps 1
  // and 2, where nothing is submitted until the mailbox answers. Once that
  // landed this became a second proof of a fact already established — and not a
  // harmless one:
  //
  //   - the carrier verified the same address twice, the second time with no
  //     explanation of why the first had not counted;
  //   - User.emailVerifiedAt stayed null until they clicked it, so the Compass
  //     auto-approve gate below refused to run;
  //   - a carrier who ignored the second email sat unapproved indefinitely for
  //     a reason nobody surfaced anywhere.
  //
  // WHAT REPLACED IT. The user create above carries emailVerifiedAt and the
  // verifying IP and country straight off the draft, so the fraud signal keeps
  // its three-point geo baseline (registration / email-verify / last-login) and
  // now reflects the FIRST verification instead of a second one the carrier had
  // to be chased for.
  //
  // The /carrier/verify-email route and its token minting REMAIN — they are the
  // recovery path for an address changed after registration, and deleting them
  // would take that with it. What is gone is sending one unprompted at signup.

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

      // v3.8.ajc — In-app notification for the NotificationBell.
      // Previously admin-side only fired email; the bell at
      // CeoOverview header polled /api/notifications/unread-count
      // but never incremented for new carrier registrations because
      // no Notification row was created server-side. This closes
      // the gap: every admin now gets both an email + an in-app
      // notification with a deep-link to /dashboard/carriers
      // PENDING tab.
      prisma.notification.create({
        data: {
          userId: admin.id,
          type: "ONBOARDING",
          title: "New carrier application",
          message: `${data.company} (DOT: ${dot}) submitted a carrier application — review pending.`,
          actionUrl: "/dashboard/carriers?status=PENDING",
        },
      }).catch((e) => log.error({ err: e }, `[Admin Notify] In-app notification create error for ${admin.email}:`));
    }
  }).catch((e) => log.error({ err: e }, "[Admin Notify] Error fetching admins:"));

  // 2.5. v3.8.akz Item 1 Path β — Insurance-agent verification email.
  // Original design intent was: when the registration payload includes
  // insurance data + all 4 agent fields are populated, the platform
  // emails the agent for verification that the policy is real. The
  // sender + recipient logic in insuranceVerificationService has been
  // healthy since pre-aky, but registerCarrier never invoked it — only
  // updateCarrier (admin) + the carrier-compliance route + the
  // expiry-reminder cron fired it. Wired here via the unified
  // maybeSendInsuranceVerificationEmail gate. For registration, change-
  // condition is computed off the request body (carrier may have skipped
  // Step 3 Insurance — though canNext now requires it). Completeness-
  // condition (all 4 agent fields) is enforced inside the helper via a
  // post-write CarrierProfile read. Fire-and-forget per the rest of the
  // post-registration chain.
  if (profileId) {
    const insuranceFieldsInRegistration = didInsuranceFieldsChange(req.body as Record<string, unknown>);
    maybeSendInsuranceVerificationEmail(profileId, insuranceFieldsInRegistration)
      .then((result) => {
        if (!result.sent && result.reason) {
          log.info({ carrierId: profileId, reason: result.reason }, "[InsVerify] Skipped after registration");
        }
      })
      .catch((err) => {
        log.error({ err, carrierId: profileId }, "[InsVerify] Registration auto-send failed");
      });
  }

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
      // Auto-approve A-grade carriers (score >= 90, no instant-fail flags).
      // v3.8.aje — Additional gate: email must be verified before auto-approve
      // fires. Compass A-grade without email proof still surfaces in the AE
      // queue (status stays PENDING) — AE manual approval has its own
      // discretion; the auto-path is held until the carrier proves inbox
      // control. Re-checked here via fresh DB read in case the carrier
      // verified between registration and Compass returning.
      if (report.grade === "A" && report.recommendation === "APPROVE" && profileId) {
        const freshUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { emailVerifiedAt: true },
        });
        if (!freshUser?.emailVerifiedAt) {
          log.info(
            { userId: user.id, profileId },
            "[Compass Auto-Approve] Held — email not yet verified; carrier stays PENDING for AE review.",
          );
          return;
        }
        try {
          // Arc 33 — both approval paths converge HERE rather than each writing
          // their own status flip. Before this, the AE path called
          // approveCarrier (which emails a welcome) while this one wrote the
          // columns inline and sent only an in-app notification — so an
          // auto-approved carrier was never congratulated by email and a
          // manually-approved one was. A carrier must not be able to infer HOW
          // they were approved from WHETHER they heard about it.
          //
          // approvedById is null because no human approved this. The source is
          // recorded internally; the carrier-facing email is identical.
          await approveCarrier({ carrierId: profileId, approvedById: null, source: "COMPASS_AUTO" });
          log.info(`[Compass Auto-Approve] Carrier ${data.company} (DOT: ${dot}) auto-approved with grade A (score: ${report.score})`);
        } catch (e: any) {
          log.error({ err: e }, "[Compass Auto-Approve] Error:");
        }
      }
    }).catch((e) => {
      log.error({ err: e }, "[Compass Auto-Vet] Registration vetting error:");
      // v3.8.ajx C9 — Persist a queryable SystemLog WARNING so ops can find
      // carriers whose registration auto-vetting failed entirely (FMCSA
      // timeout, network blip, downstream service degradation). log.error
      // above goes to Render stdout (transient); this row survives + is
      // queryable from AE dashboards via source filter.
      prisma.systemLog.create({
        data: {
          logType: "INTEGRATION",
          severity: "WARNING",
          source: "compass-auto-vet",
          message: `Auto-vetting failed during carrier registration (DOT: ${dot}, MC: ${mc || "n/a"}) — manual re-vet required`,
          details: {
            carrierProfileId: profileId,
            userId: user.id,
            company: data.company,
            dot,
            mc,
            err: e instanceof Error ? e.message : String(e),
          },
        },
      }).catch(() => { /* logging-table contention swallowed */ });
    });
  }

  // 5. Auto-trigger identity verification (background)
  if (profileId) {
    runIdentityCheck(profileId).catch((e) => {
      log.error({ err: e }, "[Compass Identity] Auto identity check error:");
      // v3.8.ajx C9 — Persist same WARNING shape for identity check failures.
      prisma.systemLog.create({
        data: {
          logType: "INTEGRATION",
          severity: "WARNING",
          source: "compass-identity-check",
          message: `Auto identity-check failed during carrier registration (profileId: ${profileId}) — manual re-run required`,
          details: {
            carrierProfileId: profileId,
            userId: user.id,
            company: data.company,
            err: e instanceof Error ? e.message : String(e),
          },
        },
      }).catch(() => { /* swallow */ });
    });
  }

  // 6. Auto-trigger OFAC screening (background)
  if (profileId) {
    screenCarrier(profileId).catch((e) => {
      log.error({ err: e }, "[Compass OFAC] Auto OFAC screening error:");
      // v3.8.ajx C9 — Persist same WARNING shape for OFAC screening failures.
      // OFAC failures are P0 from a compliance-posture standpoint — carriers
      // CANNOT proceed past PENDING without a clean OFAC screen per §14, so
      // ops needs immediate visibility on missed screenings.
      prisma.systemLog.create({
        data: {
          logType: "INTEGRATION",
          severity: "WARNING",
          source: "compass-ofac-screen",
          message: `Auto OFAC screening failed during carrier registration (profileId: ${profileId}) — manual re-screen required before approval`,
          details: {
            carrierProfileId: profileId,
            userId: user.id,
            company: data.company,
            err: e instanceof Error ? e.message : String(e),
          },
        },
      }).catch(() => { /* swallow */ });
    });
  }

  // 7. Populate authorityGrantedDate from FMCSA (background, v3.8.ahk —
  //    Item 182 sprint 2 of 5). Fire-and-forget because the carrier is
  //    PENDING and cannot haul until the team approves them, so
  //    registration latency stays untouched and the field fills in
  //    seconds later via FMCSA's authority endpoint. Null grant
  //    (intrastate-only, DOT-without-MC, brand-new filing) persists as
  //    null — the downstream gate in v3.8.ahl will soft-grandfather
  //    unknown values per Item 182 locked decisions.
  if (profileId && dot) {
    populateAuthorityGrantedDate(dot)
      .then((grantDate) => {
        if (grantDate) {
          return prisma.carrierProfile.update({
            where: { id: profileId },
            data: { authorityGrantedDate: grantDate },
          });
        }
      })
      .catch((e) => log.error({ err: e }, "[Authority Age] Populate error during registration:"));
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
      // B2 — paired. The one writer whose value is a variable rather than a
      // literal, so it resolves through the same table the others use.
      // `?? undefined` leaves status untouched when an onboarding value has no
      // application-side counterpart, rather than inventing one.
      status: pairedApplicationStatus(status) ?? undefined,
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
    currentTier === "SILVER" ? 90 : currentTier === "GOLD" ? 95 : 100;
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
    currentTier === "SILVER" ? 90 : currentTier === "GOLD" ? 95 : 100;
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
        status: "APPROVED", // B2 — paired; see lib/carrierOperational
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

  // v3.8.ahk — Sync populate of authorityGrantedDate before create.
  // Admin-setup creates immediately-APPROVED carriers, so the authority
  // grant date must be present at row birth — the downstream gate in
  // v3.8.ahl needs an anchor to compute age against, and admins
  // creating carriers manually expect the compliance data to be ready
  // when they navigate to the carrier detail view. The helper is
  // defensive-by-design (no-throw, returns null on any error or
  // missing webKey), so the worst case here is a null persisted date
  // which the gate treats as soft-grandfather per Item 182.
  let authorityGrantedDate: Date | null = null;
  try {
    authorityGrantedDate = await populateAuthorityGrantedDate(dotNumber || "");
  } catch (e) {
    log.error({ err: e }, "[Authority Age] Populate error during admin-setup:");
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
      status: "APPROVED", // B2 — paired; see lib/carrierOperational
      approvedAt: new Date(),
      w9Uploaded: true,
      insuranceCertUploaded: true,
      authorityDocUploaded: true,
      insuranceExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      safetyScore: 100,
      tier: "PLATINUM",
      authorityGrantedDate,
    },
  });

  res.status(201).json(profile);
}

/** Get all carriers with performance data for admin/broker view */
export async function getAllCarriers(req: AuthRequest, res: Response) {
  const includeDeleted = req.query.include_deleted === "true";
  // v3.8.alo §13.3 Item 189.b — opt-in test-carrier visibility for the
  // admin carriers page ONLY. Default (and EVERY picker caller) omits the
  // param → isTestAccount: false fence stays. The /dashboard/carriers admin
  // page passes ?include_test=true when its "Show test accounts" toggle is
  // on, so an admin can SEE flagged test carriers to un-flag them (without
  // it, a flagged carrier vanishes from this list = one-way door). The
  // Tender/RC pickers never pass the param, so they remain fenced per the
  // v3.8.aim Build 1 contract.
  const includeTest = req.query.include_test === "true";
  // isTestAccount: false applies unconditionally UNLESS include_test is set.
  const base: Record<string, unknown> = includeDeleted ? {} : { deletedAt: null };
  const where = includeTest ? base : { ...base, isTestAccount: false };

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
        // v3.8.atq — the WHERE above filters on isTestAccount but the response
        // never returned it, so the TEST badge on the carriers list and the
        // toggle's current state both read undefined. The fence worked; the
        // label for it was invisible. Found by the READ-never-WRITTEN audit.
        isTestAccount: c.isTestAccount,
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
        authorityGrantedDate: c.authorityGrantedDate,
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
        include: { load: { select: { referenceNumber: true, originCity: true, originState: true, destCity: true, destState: true } } },
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
      destCity: true, destState: true, status: true, pickupDate: true, deliveryDate: true,
    },
  });

  res.json({ carrier, loads });
}

/** Update carrier profile (admin) */
export async function updateCarrier(req: AuthRequest, res: Response) {
  const {
    safetyScore, tier, numberOfTrucks, insuranceExpiry, onboardingStatus, status, notes,
    // Extended insurance fields (v3.8.aiw — added *Effective pair)
    autoLiabilityProvider, autoLiabilityAmount, autoLiabilityPolicy, autoLiabilityEffective, autoLiabilityExpiry,
    cargoInsuranceProvider, cargoInsuranceAmount, cargoInsurancePolicy, cargoInsuranceEffective, cargoInsuranceExpiry,
    generalLiabilityProvider, generalLiabilityAmount, generalLiabilityPolicy, generalLiabilityEffective, generalLiabilityExpiry,
    workersCompProvider, workersCompAmount, workersCompPolicy, workersCompEffective, workersCompExpiry,
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

  // Extended insurance fields (v3.8.aiw — added *Effective pair)
  if (autoLiabilityProvider !== undefined) data.autoLiabilityProvider = autoLiabilityProvider;
  if (autoLiabilityAmount !== undefined) data.autoLiabilityAmount = autoLiabilityAmount ? parseFloat(autoLiabilityAmount) : null;
  if (autoLiabilityPolicy !== undefined) data.autoLiabilityPolicy = autoLiabilityPolicy;
  if (autoLiabilityEffective !== undefined) data.autoLiabilityEffective = autoLiabilityEffective ? new Date(autoLiabilityEffective) : null;
  if (autoLiabilityExpiry !== undefined) data.autoLiabilityExpiry = autoLiabilityExpiry ? new Date(autoLiabilityExpiry) : null;
  if (cargoInsuranceProvider !== undefined) data.cargoInsuranceProvider = cargoInsuranceProvider;
  if (cargoInsuranceAmount !== undefined) data.cargoInsuranceAmount = cargoInsuranceAmount ? parseFloat(cargoInsuranceAmount) : null;
  if (cargoInsurancePolicy !== undefined) data.cargoInsurancePolicy = cargoInsurancePolicy;
  if (cargoInsuranceEffective !== undefined) data.cargoInsuranceEffective = cargoInsuranceEffective ? new Date(cargoInsuranceEffective) : null;
  if (cargoInsuranceExpiry !== undefined) data.cargoInsuranceExpiry = cargoInsuranceExpiry ? new Date(cargoInsuranceExpiry) : null;
  if (generalLiabilityProvider !== undefined) data.generalLiabilityProvider = generalLiabilityProvider;
  if (generalLiabilityAmount !== undefined) data.generalLiabilityAmount = generalLiabilityAmount ? parseFloat(generalLiabilityAmount) : null;
  if (generalLiabilityPolicy !== undefined) data.generalLiabilityPolicy = generalLiabilityPolicy;
  if (generalLiabilityEffective !== undefined) data.generalLiabilityEffective = generalLiabilityEffective ? new Date(generalLiabilityEffective) : null;
  if (generalLiabilityExpiry !== undefined) data.generalLiabilityExpiry = generalLiabilityExpiry ? new Date(generalLiabilityExpiry) : null;
  if (workersCompProvider !== undefined) data.workersCompProvider = workersCompProvider;
  if (workersCompAmount !== undefined) data.workersCompAmount = workersCompAmount ? parseFloat(workersCompAmount) : null;
  if (workersCompPolicy !== undefined) data.workersCompPolicy = workersCompPolicy;
  if (workersCompEffective !== undefined) data.workersCompEffective = workersCompEffective ? new Date(workersCompEffective) : null;
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

  // v3.8.akz Item 1 Path β — unified insurance-agent verification gate.
  // Replaces the prior single-field check (`updated.insuranceAgentEmail`
  // alone) with the two-condition gate that lives in insurance
  // VerificationService.maybeSendInsuranceVerificationEmail: (a) change-
  // condition via didInsuranceFieldsChange on the request payload, and
  // (b) completeness-condition on all 4 agent fields read from the post-
  // write CarrierProfile record. Fire-and-forget, non-blocking. Skip-
  // reasons logged at info level for AE forensic visibility.
  const insuranceFieldsUpdated = didInsuranceFieldsChange(data as Record<string, unknown>);
  if (insuranceFieldsUpdated) {
    maybeSendInsuranceVerificationEmail(updated.id, insuranceFieldsUpdated)
      .then((result) => {
        if (!result.sent && result.reason) {
          log.info({ carrierId: updated.id, reason: result.reason }, "[InsVerify] Skipped after admin update");
        }
      })
      .catch((err) => {
        log.error({ err, carrierId: updated.id }, "[InsVerify] Auto-send failed after admin update");
      });
  }

  const validation = validateInsuranceCoverage(updated);
  res.json({ ...updated, insuranceValidation: validation });
}

// POST /carrier/:id/authority-grant-date
//
// Dedicated, reason-required, audited endpoint to manually set
// CarrierProfile.authorityGrantedDate for a carrier whose FMCSA
// /carrier/{dot}/authority lookup did not yield a parseable GRANT entry
// (per the 2026-05-23 fmcsaService.getCarrierAuthority audit — the
// QCMobile endpoint returns current-status fields only, not the
// historical GRANT events the function's parser targets).
//
// Carriers in this state sit at AUTHORITY_UNVERIFIED past the 24h grace
// per the Item 182 authority-age gate (complianceMonitorService.ts:147
// branch). Without a manual entry path, every such carrier is
// hard-blocked at tender time despite holding real active FMCSA
// authority. This endpoint corrects the data.
//
// Deliberately NOT extended into updateCarrier per directive — that
// path is a multi-field silent PATCH without a required reason, which
// is wrong shape for a legal-identity-class data write (§3.13). This
// endpoint mirrors overrideBlock's discipline: reason required + audit
// trail emitted.
export async function setAuthorityGrantDate(req: AuthRequest, res: Response) {
  try {
    const { grantDate, reason } = req.body as { grantDate?: string; reason?: string };

    if (!grantDate || typeof grantDate !== "string") {
      res.status(400).json({ error: "grantDate is required (ISO date string or YYYY-MM-DD)" });
      return;
    }
    if (!reason || reason.trim().length < 10) {
      res.status(400).json({ error: "reason must be at least 10 characters" });
      return;
    }

    const parsed = new Date(grantDate);
    if (Number.isNaN(parsed.getTime())) {
      res.status(400).json({ error: "grantDate could not be parsed as a date" });
      return;
    }
    // Authority cannot be granted in the future.
    const now = new Date();
    if (parsed.getTime() > now.getTime()) {
      res.status(400).json({ error: "grantDate cannot be in the future" });
      return;
    }

    // Per sanitizeInput convention (security middleware): trim + length-cap,
    // no HTML encoding at write time. Cap at 500 chars — long enough for a
    // real audit explanation, short enough to defend against pathological
    // input. Reason flows through React's auto-escaping on every render
    // surface.
    const reasonClean = reason.trim().slice(0, 500);

    const carrierId = req.params.id;
    const adminId = req.user!.id;

    const carrier = await prisma.carrierProfile.findUnique({
      where: { id: carrierId },
      include: { user: { select: { company: true, firstName: true, lastName: true } } },
    });

    if (!carrier) {
      res.status(404).json({ error: "Carrier not found" });
      return;
    }

    const previousGrantDate = carrier.authorityGrantedDate;

    await prisma.carrierProfile.update({
      where: { id: carrierId },
      data: { authorityGrantedDate: parsed },
    });

    // Audit trail — mirrors overrideBlock convention with one
    // adaptation: AuditAction is a closed Prisma enum and
    // AUTHORITY_GRANT_DATE_SET is not a member. Per the v3.8.ahy /
    // Item 188 precedent (CLAUDE.md §11), use the generic UPDATE
    // action + encode the specific operation in changedFields.actionDetail
    // so downstream filters can grep on it. Equivalent
    // independent-filterability without schema migration churn.
    await prisma.auditTrail.create({
      data: {
        action: "UPDATE",
        entityType: "CarrierProfile",
        entityId: carrierId,
        performedById: adminId,
        changedFields: {
          actionDetail: "AUTHORITY_GRANT_DATE_SET",
          previousGrantDate: previousGrantDate ? previousGrantDate.toISOString() : null,
          newGrantDate: parsed.toISOString(),
          reason: reasonClean,
          carrierName: carrier.user?.company || `${carrier.user?.firstName ?? ""} ${carrier.user?.lastName ?? ""}`.trim(),
        } as any,
      },
    });

    // Trigger canonical compliance evaluation so the carrier's status
    // reflects the new grant date — passing at 18+ months, moving to
    // overridable 12-18 band, or hard-floored under 12 — instead of
    // sitting in AUTHORITY_UNVERIFIED.
    const compliance = await complianceCheck(carrierId);

    res.json({
      carrierId,
      authorityGrantedDate: parsed.toISOString(),
      previousGrantDate: previousGrantDate ? previousGrantDate.toISOString() : null,
      reason: reasonClean,
      compliance,
    });
  } catch (err) {
    log.error({ err: err }, "[Carrier] setAuthorityGrantDate error:");
    res.status(500).json({ error: "Failed to set authority grant date" });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// v3.8.asb — QUICK PAY PILOT: the AE side of request-then-approve
// ═══════════════════════════════════════════════════════════════════════════
//
// The carrier ticks a request at onboarding (registerCarrier above). It lands
// here as a QuickPayEnrollment{status:PENDING}. An AE approves or declines it
// with a reason, and can later withdraw an approved enrolment on notice.
//
// WHAT APPROVAL DOES, AND WHAT IT DOES NOT DO.
//   Approval opens the door. It does NOT set quickPayEnabled and does NOT by
//   itself put a fee on any load, because the carrier still has to read and
//   sign the Caravan Quick Pay Agreement. That signature happens at
//   POST /carrier-auth/quickpay-election, which now refuses anyone without an
//   APPROVED enrolment. Approval is SRL's consent; the signature is the
//   carrier's. Both are required and neither substitutes for the other.
//
// THE INVARIANT every charge path depends on:
//
//     CarrierProfile.quickPayEnabled === true
//        implies that carrier has a QuickPayEnrollment{status: APPROVED}
//
// One direction only. A carrier can be APPROVED with quickPayEnabled false —
// that is the normal state between approval and signature, and it is also
// where a carrier lands if they later switch Quick Pay off themselves, which
// they keep the right to do. What must never happen is the reverse: enabled
// true without an approval behind it. Two things hold it:
//   · the enable branch of /quickpay-election requires an APPROVED enrolment
//   · withdrawal below clears quickPayEnabled in the SAME transaction
//
// This is what lets accountingController.resolveElectedQuickPayFee keep
// reading quickPayEnabled and stay correct without an edit.
//
// WITHDRAWAL IS FORWARD-ONLY. See withdrawQuickPayEnrollment.

type QpEnrollmentStatus = "PENDING" | "APPROVED" | "DECLINED" | "WITHDRAWN";

/**
 * The carrier's CURRENT standing in the pilot: the single non-terminal
 * enrolment, or null.
 *
 * The `quick_pay_enrollment_one_live` partial unique index guarantees at most
 * one row in (PENDING, APPROVED) per carrier, so this findFirst is a lookup,
 * not a pick-the-best. DECLINED and WITHDRAWN rows accumulate as history and
 * are deliberately not returned — "was declined in June" is not a current
 * standing, and treating it as one would leave a carrier who re-requested
 * still reading as declined.
 *
 * Exported because the carrier-facing gate in routes/carrierAuth.ts and the
 * pricing gates in integrationService + routes/carrierPayments all ask the
 * same question, and asking it in one place is what keeps the answer the same
 * everywhere.
 */
export async function getLiveQuickPayEnrollment(carrierProfileId: string) {
  return prisma.quickPayEnrollment.findFirst({
    where: { carrierProfileId, status: { in: ["PENDING", "APPROVED"] } },
    orderBy: { requestedAt: "desc" },
  });
}

/** True when the carrier is approved into the pilot. The one question the money paths ask. */
export async function isQuickPayPilotApproved(carrierProfileId: string): Promise<boolean> {
  const live = await getLiveQuickPayEnrollment(carrierProfileId);
  return live?.status === "APPROVED";
}

/**
 * The most recent enrolment of ANY status, live or terminal.
 *
 * The carrier-facing gate needs this rather than the live one, because
 * "declined" and "withdrawn" are the two cases where the carrier most needs to
 * be told something specific, and both are terminal states the live lookup
 * skips on purpose.
 */
export async function getLatestQuickPayEnrollment(carrierProfileId: string) {
  return prisma.quickPayEnrollment.findFirst({
    where: { carrierProfileId },
    orderBy: { requestedAt: "desc" },
  });
}

/**
 * Tell the desk a carrier has asked to join the Quick Pay pilot.
 *
 * Before this, a PENDING enrolment was written and nothing else happened. The
 * only surface was an amber strip inside a carrier drawer on a page nobody has
 * a reason to open, so a request made on a Friday afternoon sat unseen until
 * someone happened to look — and the carrier, who has been told "we will let
 * you know", is waiting on that look. This desk is one person; the signal has
 * to come to them.
 *
 * Both the in-app bell and an email, matching the new-application notify above:
 * the bell is what they see while working, the email is what reaches them when
 * they are not. Fire-and-forget and individually caught — a request that was
 * recorded must never fail because a mail send did, and the carrier can be
 * approved from the queue whether or not this fired.
 */
export async function notifyQuickPayPilotRequested(
  carrierProfileId: string,
  source: "onboarding" | "portal",
): Promise<void> {
  try {
    const profile = await prisma.carrierProfile.findUnique({
      where: { id: carrierProfileId },
      select: {
        companyName: true,
        mcNumber: true,
        dotNumber: true,
        tier: true,
        user: { select: { email: true, firstName: true, lastName: true } },
      },
    });
    if (!profile) return;

    const company = profile.companyName || `${profile.user?.firstName ?? ""} ${profile.user?.lastName ?? ""}`.trim() || "A carrier";
    const authority = profile.mcNumber || (profile.dotNumber ? `DOT ${profile.dotNumber}` : "no MC on file");
    const where = source === "onboarding" ? "on their application" : "from their portal";

    const staff = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "CEO", "OPERATIONS"] }, isActive: true },
      select: { id: true, email: true, firstName: true },
    });
    if (staff.length === 0) return;

    for (const person of staff) {
      prisma.notification
        .create({
          data: {
            userId: person.id,
            type: "ONBOARDING",
            title: "Quick Pay pilot request",
            message: `${company} (${authority}) asked to join the Quick Pay pilot ${where}. Approve or decline it from the carrier's Quick Pay panel.`,
            actionUrl: "/dashboard/carriers",
          },
        })
        .catch((err) => log.error({ err }, `[QuickPayPilot] bell notification failed for ${person.email}`));

      sendEmail(
        person.email,
        `Quick Pay pilot request — ${company}`,
        wrap(`
          <h2 style="color:#0A2540;margin-bottom:4px">Quick Pay pilot request</h2>
          <p style="color:#3A4A5F;font-size:14px;margin-bottom:20px">Hi ${person.firstName}, ${company} asked to join the Quick Pay pilot ${where}. Nothing is enabled and no fee can be charged until you approve it.</p>

          <div style="background:#F5EEE0;border:1px solid #EFE6D3;border-radius:8px;padding:20px;margin-bottom:24px">
            <table style="width:100%;border-collapse:collapse">
              <tr><td style="padding:8px 12px;border-bottom:1px solid #EFE6D3;font-weight:600;color:#0A2540;width:40%">Carrier</td><td style="padding:8px 12px;border-bottom:1px solid #EFE6D3;color:#3A4A5F">${company}</td></tr>
              <tr><td style="padding:8px 12px;border-bottom:1px solid #EFE6D3;font-weight:600;color:#0A2540">Authority</td><td style="padding:8px 12px;border-bottom:1px solid #EFE6D3;color:#3A4A5F">${authority}</td></tr>
              <tr><td style="padding:8px 12px;border-bottom:1px solid #EFE6D3;font-weight:600;color:#0A2540">Tier</td><td style="padding:8px 12px;border-bottom:1px solid #EFE6D3;color:#3A4A5F">${profile.tier || "SILVER"}</td></tr>
              <tr><td style="padding:8px 12px;font-weight:600;color:#0A2540">Requested</td><td style="padding:8px 12px;color:#3A4A5F">${where === "on their application" ? "At application" : "From the carrier portal"}</td></tr>
            </table>
          </div>

          <div style="text-align:center;margin:24px 0">
            <a href="https://silkroutelogistics.ai/dashboard/carriers" style="display:inline-block;background:#BA7517;color:#FBF7F0;padding:14px 36px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:15px">Review the request</a>
          </div>
        `),
      ).catch((err) => log.error({ err }, `[QuickPayPilot] request email failed for ${person.email}`));
    }
  } catch (err) {
    log.error({ err, carrierProfileId }, "[QuickPayPilot] could not notify the desk of a pilot request");
  }
}

/**
 * GET /api/carriers/quickpay-enrollments?status=PENDING
 *
 * The AE queue. Defaults to PENDING, oldest request first — a carrier who
 * asked three weeks ago should not sit behind one who asked this morning. The
 * (status, requestedAt) index exists for exactly this read.
 */
export async function listQuickPayEnrollments(req: AuthRequest, res: Response) {
  const raw = String(req.query.status ?? "PENDING").toUpperCase();
  const allowed: QpEnrollmentStatus[] = ["PENDING", "APPROVED", "DECLINED", "WITHDRAWN"];
  if (raw !== "ALL" && !allowed.includes(raw as QpEnrollmentStatus)) {
    res.status(400).json({
      error: `Unknown status "${req.query.status}". Use one of ${allowed.join(", ")} or ALL.`,
    });
    return;
  }

  const enrollments = await prisma.quickPayEnrollment.findMany({
    where: raw === "ALL" ? {} : { status: raw as QpEnrollmentStatus },
    orderBy: { requestedAt: "asc" },
    take: 200,
    include: {
      carrierProfile: {
        select: {
          id: true,
          companyName: true,
          mcNumber: true,
          dotNumber: true,
          tier: true,
          onboardingStatus: true,
          quickPayEnabled: true,
          isTestAccount: true,
        },
      },
      reviewedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      withdrawnBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  res.json({ status: raw, count: enrollments.length, enrollments });
}

/** Resolve :id (a CarrierProfile.id) or answer 404. Every AE action below starts here. */
async function loadPilotCarrier(carrierProfileId: string) {
  return prisma.carrierProfile.findUnique({
    where: { id: carrierProfileId },
    // v3.8.avl — tier + a reachable address, because the approval now sends an
    // email whose figures are read from the tier config rather than written
    // into the template. contactEmail is the carrier dispatch alias where one
    // exists; the login email is the fallback, per the carrier-email convention.
    select: {
      id: true, userId: true, companyName: true, quickPayEnabled: true,
      tier: true, contactEmail: true,
      user: { select: { email: true } },
    },
  });
}

/**
 * POST /api/carriers/:id/quickpay/approve
 *
 * Approves a PENDING request. Idempotent on an already-APPROVED enrolment so a
 * double-click is not an error.
 *
 * Deliberately does NOT set quickPayEnabled — see the invariant note above.
 * The carrier signs the Caravan Quick Pay Agreement at
 * POST /carrier-auth/quickpay-election, and that is what enables the account.
 * Flipping the flag here would enable Quick Pay on an unsigned instrument,
 * which is the thing every gate in this codebase exists to prevent.
 *
 * A carrier with no request on file cannot be approved into the pilot. This is
 * request-then-approve, not cold invite: SRL does not enrol a carrier in a
 * fee-bearing programme they never asked about.
 */
export async function approveQuickPayEnrollment(req: AuthRequest, res: Response) {
  const carrier = await loadPilotCarrier(req.params.id);
  if (!carrier) {
    res.status(404).json({ error: "Carrier not found" });
    return;
  }

  const live = await getLiveQuickPayEnrollment(carrier.id);
  if (!live) {
    res.status(409).json({
      error:
        "This carrier has not requested the Quick Pay pilot, so there is nothing to approve. They can request it from their portal.",
      code: "QP_PILOT_NOT_REQUESTED",
    });
    return;
  }
  if (live.status === "APPROVED") {
    res.json({ enrollment: live, alreadyApproved: true });
    return;
  }

  const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 2000) : null;
  const updated = await prisma.quickPayEnrollment.update({
    where: { id: live.id },
    data: {
      status: "APPROVED",
      reviewedAt: new Date(),
      reviewedById: req.user!.id,
      reviewNote: note || null,
    },
  });

  // ── v3.8.avl — the banner may only claim what actually happened ──
  //
  // This used to write an in-portal row, swallow its own failure, and return
  // 200 regardless — while the AE console said "the carrier has been notified".
  // No email was ever sent by this path at all. A carrier could be admitted to
  // the pilot and find out only by happening to open the portal.
  //
  // Every figure in the email is read from TIER_CONFIG rather than written
  // here. Quoting a fee to a carrier is a pricing statement in writing; a
  // hardcoded percentage is wrong the moment §8 moves.
  const tierKey = getEffectiveTier({ tier: carrier.tier });
  const cfg = getTierConfig(tierKey);

  let emailSent = false;
  try {
    await sendQuickPayApprovedEmail({
      to: carrier.contactEmail || carrier.user.email,
      companyName: carrier.companyName || "your company",
      tier: tierKey,
      fee7DayPct: Math.round(cfg.quickPayFee7Day * 1000) / 10,
      feeSameDayPct: Math.round(cfg.quickPayFeeSameDay * 1000) / 10,
      autoLimit: cfg.quickPayAutoLimit,
      monthlyLimit: cfg.quickPayMonthlyLimit,
      netDays: cfg.paymentTermsDays,
    });
    emailSent = true;
  } catch (err) {
    log.error({ err, carrierProfileId: carrier.id }, "[QuickPayPilot] approval EMAIL failed — the console will not claim it was sent");
  }

  // The in-portal row is a second channel, not the same one. Its actionUrl
  // doubles as the dedup key: re-approving an already-APPROVED enrollment
  // short-circuits above, so this cannot fire twice for one transition.
  let notifSent = false;
  try {
    await prisma.notification.create({
      data: {
        userId: carrier.userId,
        type: "GENERAL",
        title: "You are in the Quick Pay pilot",
        message:
          "Your request to join the Quick Pay pilot has been approved. One step left: read and sign the Caravan Quick Pay Agreement in your portal, and Quick Pay turns on for your loads.",
        actionUrl: "/carrier/dashboard/activation",
      },
    });
    notifSent = true;
  } catch (err) {
    log.error({ err }, "[QuickPayPilot] approval notification failed");
  }

  log.info(
    { carrierProfileId: carrier.id, enrollmentId: updated.id, by: req.user!.id, emailSent, notifSent },
    "[QuickPayPilot] approved",
  );
  res.json({ enrollment: updated, notified: emailSent || notifSent, emailSent, notifSent });
}

/**
 * POST /api/carriers/:id/quickpay/decline — reason required.
 *
 * Terminal for this attempt, not for the carrier: the partial unique index
 * only covers PENDING and APPROVED, so a declined carrier can request again
 * later and each attempt keeps its own row and its own reason. That history is
 * the point of the model.
 *
 * Declining a PENDING request touches no money — nothing was ever enabled. It
 * is a separate act from withdraw for that reason: the two read the same in a
 * status column and are completely different conversations.
 */
export async function declineQuickPayEnrollment(req: AuthRequest, res: Response) {
  const carrier = await loadPilotCarrier(req.params.id);
  if (!carrier) {
    res.status(404).json({ error: "Carrier not found" });
    return;
  }

  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (reason.length < 10) {
    res.status(400).json({
      error: "Give a reason of at least 10 characters. The carrier is told why, so write it for them to read.",
      code: "REASON_REQUIRED",
    });
    return;
  }

  const live = await getLiveQuickPayEnrollment(carrier.id);
  if (!live) {
    res.status(409).json({
      error: "This carrier has no open Quick Pay pilot request, so there is nothing to decline.",
      code: "QP_PILOT_NOT_REQUESTED",
    });
    return;
  }
  if (live.status === "APPROVED") {
    res.status(409).json({
      error:
        "This carrier is already approved into the pilot. Use withdraw, which stops future elections without disturbing loads already priced.",
      code: "QP_PILOT_ALREADY_APPROVED",
    });
    return;
  }

  const updated = await prisma.quickPayEnrollment.update({
    where: { id: live.id },
    data: {
      status: "DECLINED",
      reviewedAt: new Date(),
      reviewedById: req.user!.id,
      reviewNote: reason.slice(0, 2000),
    },
  });

  await prisma.notification
    .create({
      data: {
        userId: carrier.userId,
        type: "GENERAL",
        title: "Quick Pay pilot request declined",
        message: `We are not able to add you to the Quick Pay pilot right now. ${reason.slice(0, 400)} Your loads pay on your standard tier terms, at no fee, as always.`,
        actionUrl: "/carrier/dashboard/activation",
      },
    })
    .catch((err) => log.error({ err }, "[QuickPayPilot] decline notification failed"));

  log.info({ carrierProfileId: carrier.id, enrollmentId: updated.id, by: req.user!.id }, "[QuickPayPilot] declined");
  res.json({ enrollment: updated });
}

/**
 * POST /api/carriers/:id/quickpay/withdraw — reason required.
 *
 * WITHDRAWAL IS FORWARD-ONLY. THIS IS THE WHOLE POINT.
 *
 * Withdrawal stops FUTURE elections. It never re-prices work already done. A
 * carrier who hauled a load under terms SRL published, and who was told on the
 * rate confirmation what the fee on that load would be, keeps those terms. The
 * failure to avoid here is taking money back from a carrier who relied on what
 * we told them.
 *
 * Concretely, at the moment of withdrawal:
 *
 *  (i)  LOADS ALREADY FUNDED — untouched. Nothing is clawed back, no invoice
 *       is reissued, no settlement is reopened. The fee was disclosed on the
 *       rate confirmation before the carrier accepted, the carrier hauled on
 *       that basis, and the money moved. It is closed.
 *
 *  (ii) LOADS ELECTED BUT NOT YET FUNDED — the recorded election STANDS and
 *       pays at the recorded fee and the recorded speed. Load.quickPayFeePercent
 *       and Load.quickPaySpeed are deliberately NOT cleared, and the pricing
 *       gates deliberately do not re-check the pilot at funding time for a load
 *       that already carries an election. This is the case that matters most:
 *       the carrier is mid-haul or awaiting payment on a load whose rate
 *       confirmation states a fee and a pay date. Withdrawing the pilot
 *       underneath them would move a settlement they have already planned
 *       around, in SRL's favour, after the fact.
 *
 *       It also cuts the other way, and that is fine. If SRL withdraws a
 *       carrier for cause, that carrier still gets their 7-day money on the
 *       load already in flight. That is what "on notice" means.
 *
 *       Loads TENDERED but not yet rate-confirmed carry no election yet, so
 *       they simply price at standard terms — no fee, carrier paid more.
 *
 * (iii) THE SIGNED AGREEMENT — kept, untouched, still signed. The
 *       CarrierAgreement{templateName:"quick-pay"} row is the record of a
 *       thing that happened, and it governs the loads already priced under it.
 *       It is not revoked, not superseded, not marked void. If the carrier is
 *       re-approved later they do not re-sign the same version, and the
 *       existing signature keeps covering the loads it always covered.
 *
 * What DOES change, in one transaction: the enrolment goes WITHDRAWN and
 * quickPayEnabled goes false. From that moment no NEW rate confirmation can
 * record a fee (autoRateConfirmationService reads the enrolment), and the
 * carrier cannot re-enable themselves (/quickpay-election requires APPROVED).
 * The door closes; nothing behind it is disturbed.
 */
export async function withdrawQuickPayEnrollment(req: AuthRequest, res: Response) {
  const carrier = await loadPilotCarrier(req.params.id);
  if (!carrier) {
    res.status(404).json({ error: "Carrier not found" });
    return;
  }

  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (reason.length < 10) {
    res.status(400).json({
      error: "Give a reason of at least 10 characters. The carrier is told why, so write it for them to read.",
      code: "REASON_REQUIRED",
    });
    return;
  }

  const live = await getLiveQuickPayEnrollment(carrier.id);
  if (!live || live.status !== "APPROVED") {
    res.status(409).json({
      error: "This carrier is not currently approved into the Quick Pay pilot, so there is nothing to withdraw.",
      code: "QP_PILOT_NOT_APPROVED",
    });
    return;
  }

  // One transaction. The invariant "quickPayEnabled implies an APPROVED
  // enrolment" has to survive a crash between these two writes, and which
  // order fails safe stops mattering once they cannot be observed apart.
  const [updated] = await prisma.$transaction([
    prisma.quickPayEnrollment.update({
      where: { id: live.id },
      data: {
        status: "WITHDRAWN",
        withdrawnAt: new Date(),
        withdrawnById: req.user!.id,
        withdrawalReason: reason.slice(0, 2000),
      },
    }),
    prisma.carrierProfile.update({
      where: { id: carrier.id },
      data: { quickPayEnabled: false },
    }),
  ]);

  await prisma.notification
    .create({
      data: {
        userId: carrier.userId,
        type: "GENERAL",
        title: "Quick Pay pilot withdrawn",
        message: `Quick Pay has been withdrawn from your account. ${reason.slice(0, 400)} Any load that already has a Quick Pay fee on its rate confirmation still pays at that fee and on that schedule. This does not change a load you have already run, or one already in flight. New loads pay your standard tier terms, at no fee.`,
        actionUrl: "/carrier/dashboard/activation",
      },
    })
    .catch((err) => log.error({ err }, "[QuickPayPilot] withdrawal notification failed"));

  log.info({ carrierProfileId: carrier.id, enrollmentId: updated.id, by: req.user!.id }, "[QuickPayPilot] withdrawn");
  res.json({ enrollment: updated, quickPayEnabled: false });
}
