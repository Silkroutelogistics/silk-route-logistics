/**
 * Chameleon Carrier Detection Service
 * Detects carriers reapplying under new identities by fingerprinting
 * phone, email, address, and EIN, then cross-referencing.
 */

import crypto from "crypto";
import { prisma } from "../config/database";
import { sendEmail, wrap } from "./emailService";
import { log } from "../lib/logger";

// ── Helpers ──

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

function normalizeEmail(email: string): string {
  // Hash domain only for chameleon detection (same person may use same domain)
  return email.split("@")[1]?.toLowerCase() || email.toLowerCase();
}

function normalizeAddress(address: string, zip: string): string {
  // Lowercase, strip non-alphanumeric, append zip
  const cleaned = address.toLowerCase().replace(/[^a-z0-9]/g, "");
  const zipClean = zip.replace(/\D/g, "").substring(0, 5);
  return `${cleaned}${zipClean}`;
}

// ── Build Fingerprint ──

export async function buildFingerprint(carrierId: string, registrationIp?: string): Promise<void> {
  const carrier = await prisma.carrierProfile.findUnique({
    where: { id: carrierId },
    include: {
      user: { select: { email: true, phone: true } },
      identityVerification: { select: { w9TinLastFour: true } },
    },
  });

  if (!carrier) throw new Error("Carrier not found");

  const phone = carrier.contactPhone || carrier.user.phone || "";
  const email = carrier.contactEmail || carrier.user.email;
  const address = carrier.address || "";
  const zip = carrier.zip || "";

  const phoneHash = phone ? sha256(normalizePhone(phone)) : null;
  const emailHash = email ? sha256(normalizeEmail(email)) : null;
  const addressHash = address && zip ? sha256(normalizeAddress(address, zip)) : null;
  const einHash = carrier.identityVerification?.w9TinLastFour
    ? sha256(carrier.identityVerification.w9TinLastFour)
    : null;

  // Enhanced fingerprinting: IP address + DOT number cross-reference
  const ipHash = registrationIp ? sha256(registrationIp) : (carrier as any).registrationIpHash || null;
  const dotHash = carrier.dotNumber ? sha256(carrier.dotNumber) : null;

  await prisma.carrierFingerprint.upsert({
    where: { carrierId },
    create: { carrierId, phoneHash, emailHash, addressHash, einHash, ipHash, dotHash },
    update: { phoneHash, emailHash, addressHash, einHash, ...(ipHash ? { ipHash } : {}), ...(dotHash ? { dotHash } : {}) },
  });
}

// ── Check Chameleon ──

type MatchField = "PHONE" | "EMAIL" | "ADDRESS" | "EIN" | "IP" | "DOT";

interface ChameleonResult {
  matches: Array<{
    matchedCarrierId: string;
    matchedCompany: string | null;
    matchedStatus: string;
    fields: MatchField[];
    riskScore: number;
  }>;
  riskLevel: "NONE" | "LOW" | "MEDIUM" | "HIGH";
  totalMatches: number;
}

export async function checkChameleon(carrierId: string): Promise<ChameleonResult> {
  // Ensure fingerprint exists
  await buildFingerprint(carrierId);

  const fp = await prisma.carrierFingerprint.findUnique({ where: { carrierId } });
  if (!fp) {
    return { matches: [], riskLevel: "NONE", totalMatches: 0 };
  }

  // Build OR conditions for each hash (including enhanced IP + DOT)
  const orConditions: any[] = [];
  if (fp.phoneHash) orConditions.push({ phoneHash: fp.phoneHash });
  if (fp.emailHash) orConditions.push({ emailHash: fp.emailHash });
  if (fp.addressHash) orConditions.push({ addressHash: fp.addressHash });
  if (fp.einHash) orConditions.push({ einHash: fp.einHash });
  if ((fp as any).ipHash) orConditions.push({ ipHash: (fp as any).ipHash });
  if ((fp as any).dotHash) orConditions.push({ dotHash: (fp as any).dotHash });

  if (orConditions.length === 0) {
    return { matches: [], riskLevel: "NONE", totalMatches: 0 };
  }

  // Find matching fingerprints (excluding self)
  const matchingFps = await prisma.carrierFingerprint.findMany({
    where: {
      AND: [
        { carrierId: { not: carrierId } },
        { OR: orConditions },
      ],
    },
    include: {
      carrier: {
        select: {
          id: true,
          companyName: true,
          onboardingStatus: true,
          status: true,
        },
      },
    },
  });

  const matches: ChameleonResult["matches"] = [];

  for (const mfp of matchingFps) {
    const fields: MatchField[] = [];
    if (fp.phoneHash && mfp.phoneHash === fp.phoneHash) fields.push("PHONE");
    if (fp.emailHash && mfp.emailHash === fp.emailHash) fields.push("EMAIL");
    if (fp.addressHash && mfp.addressHash === fp.addressHash) fields.push("ADDRESS");
    if (fp.einHash && mfp.einHash === fp.einHash) fields.push("EIN");
    if ((fp as any).ipHash && (mfp as any).ipHash === (fp as any).ipHash) fields.push("IP");
    if ((fp as any).dotHash && (mfp as any).dotHash === (fp as any).dotHash) fields.push("DOT");

    if (fields.length === 0) continue;

    // Calculate risk score
    let riskScore = fields.length * 25; // base: 25 per field match
    // Higher risk if matched carrier was suspended/rejected
    const badStatus = ["SUSPENDED", "REJECTED"].includes(mfp.carrier.onboardingStatus);
    if (badStatus) riskScore = Math.min(100, riskScore + 25);

    const matchType = fields.length > 1 ? "MULTI" as const : fields[0];

    // Create or update ChameleonMatch record
    const existingMatch = await prisma.chameleonMatch.findFirst({
      where: {
        carrierId,
        matchedCarrierId: mfp.carrierId,
        status: { in: ["OPEN", "REVIEWED"] },
      },
    });

    if (!existingMatch) {
      await prisma.chameleonMatch.create({
        data: {
          carrierId,
          matchedCarrierId: mfp.carrierId,
          matchType,
          riskScore,
          status: "OPEN",
        },
      });
    }

    matches.push({
      matchedCarrierId: mfp.carrierId,
      matchedCompany: mfp.carrier.companyName || "Unknown",
      matchedStatus: mfp.carrier.onboardingStatus,
      fields,
      riskScore,
    });
  }

  // Determine overall risk level
  let riskLevel: ChameleonResult["riskLevel"] = "NONE";
  if (matches.length > 0) {
    const maxRisk = Math.max(...matches.map((m) => m.riskScore));
    if (maxRisk >= 75 || matches.length >= 3) riskLevel = "HIGH";
    else if (maxRisk >= 50 || matches.length >= 2) riskLevel = "MEDIUM";
    else riskLevel = "LOW";
  }

  // Update carrier profile with chameleon check results
  await prisma.carrierProfile.update({
    where: { id: carrierId },
    data: {
      lastChameleonCheckAt: new Date(),
      chameleonRiskLevel: riskLevel,
    },
  });

  // Email admins on MEDIUM or HIGH risk chameleon matches
  if (riskLevel === "MEDIUM" || riskLevel === "HIGH") {
    sendChameleonAlertEmail(carrierId, riskLevel, matches).catch((e) =>
      log.error({ err: e }, "[Chameleon] Alert email error:")
    );
  }

  return {
    matches,
    riskLevel,
    totalMatches: matches.length,
  };
}

// ── Full Chameleon Scan (all carriers) ──

export async function runFullChameleonScan(): Promise<{
  scanned: number;
  matchesFound: number;
  errors: number;
}> {
  const carriers = await prisma.carrierProfile.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });

  let scanned = 0;
  let matchesFound = 0;
  let errors = 0;

  for (const carrier of carriers) {
    try {
      await buildFingerprint(carrier.id);
      scanned++;
    } catch (err) {
      errors++;
      log.error({ err: err }, `[Chameleon] Fingerprint build error for ${carrier.id}:`);
    }
  }

  // Cross-reference after all fingerprints are built
  for (const carrier of carriers) {
    try {
      const result = await checkChameleon(carrier.id);
      matchesFound += result.totalMatches;
    } catch (err) {
      errors++;
      log.error({ err: err }, `[Chameleon] Check error for ${carrier.id}:`);
    }
  }

  log.info(`[Chameleon] Full scan complete: ${scanned} scanned, ${matchesFound} matches, ${errors} errors`);
  return { scanned, matchesFound, errors };
}

// ── Chameleon Alert Email ──

async function sendChameleonAlertEmail(
  carrierId: string,
  riskLevel: string,
  matches: { matchedCarrierId: string; matchedCompany: string | null; matchedStatus?: string; fields: (string | { field: string; similarity: number })[]; riskScore: number }[],
) {
  // Look up the flagged carrier
  const carrier = await prisma.carrierProfile.findUnique({
    where: { id: carrierId },
    include: { user: { select: { company: true, firstName: true, lastName: true, email: true } } },
  });
  if (!carrier) return;

  const carrierName = carrier.user.company || `${carrier.user.firstName} ${carrier.user.lastName}`;
  const levelColor = riskLevel === "HIGH" ? "#dc2626" : "#f59e0b";

  const matchRows = matches.map((m) =>
    `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${m.matchedCompany}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${m.fields.join(", ")}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center">${m.riskScore}</td>
    </tr>`
  ).join("");

  const body = `
    <div style="background:${levelColor};color:#fff;padding:12px 20px;border-radius:8px 8px 0 0;text-align:center">
      <h2 style="margin:0;font-size:18px">CHAMELEON ALERT: ${riskLevel} RISK</h2>
    </div>
    <div style="padding:20px">
      <p style="color:#64748b;margin:0 0 16px">Potential identity fraud detected for carrier <strong>${carrierName}</strong> (MC# ${carrier.mcNumber || "N/A"}, DOT# ${carrier.dotNumber || "N/A"}).</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <tr style="background:#f1f5f9">
          <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">Matched Carrier</th>
          <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">Matching Fields</th>
          <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #e2e8f0">Risk Score</th>
        </tr>
        ${matchRows}
      </table>
      <p style="color:#64748b;font-size:14px">Please review this carrier in the Compliance Console and take appropriate action.</p>
      <p style="text-align:center;margin-top:16px">
        <a href="https://silkroutelogistics.ai/dashboard/compliance" style="display:inline-block;padding:12px 28px;background:#d4a574;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Review in Console</a>
      </p>
    </div>
  `;

  // Send to ADMIN and OPERATIONS users
  const recipients = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "OPERATIONS"] }, isActive: true },
    select: { email: true },
  });

  for (const admin of recipients) {
    await sendEmail(
      admin.email,
      `[SRL FRAUD ALERT] Chameleon ${riskLevel} Risk: ${carrierName}`,
      wrap(body),
    ).catch((e) => log.error({ err: e }, `[Chameleon] Email to ${admin.email} failed:`));
  }

  log.info(`[Chameleon] Alert email sent to ${recipients.length} admins for ${carrierName} (${riskLevel})`);
}
