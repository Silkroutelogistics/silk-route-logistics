/**
 * Identity Verification Service
 * Validates carrier identity through email domain, phone type,
 * business entity (SOS), and orchestrates full identity checks.
 */

import { prisma } from "../config/database";
import dns from "dns";

// ── Disposable email domain blocklist (subset — npm package recommended for production) ──
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "tempmail.com", "throwaway.email",
  "yopmail.com", "sharklasers.com", "guerrillamailblock.com", "grr.la",
  "dispostable.com", "mailnesia.com", "maildrop.cc", "10minutemail.com",
  "trashmail.com", "fakeinbox.com", "mailcatch.com", "tempr.email",
  "discard.email", "getnada.com", "mohmal.com", "mailsac.com",
  "temp-mail.org", "burpcollaborator.net", "mytemp.email",
]);

const FREE_PROVIDERS = new Set([
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "aol.com",
  "icloud.com", "mail.com", "protonmail.com", "zoho.com", "gmx.com",
  "yandex.com", "live.com", "msn.com", "me.com", "inbox.com",
]);

// Known VoIP prefix ranges (US)
const VOIP_PREFIXES = [
  // Google Voice commonly uses these area codes
  "747", "562", "209", "559",
];

// ── Types ──

interface EmailDomainResult {
  valid: boolean;
  provider: "BUSINESS" | "FREE" | "DISPOSABLE";
  hasMxRecords: boolean;
  isDisposable: boolean;
  domainAge: number | null; // days, null if unknown
}

interface PhoneTypeResult {
  phoneType: "LANDLINE" | "MOBILE" | "VOIP";
  carrier: string | null;
  isVoip: boolean;
}

interface BusinessEntityResult {
  verified: boolean;
  entityName: string | null;
  filingNumber: string | null;
  status: "ACTIVE" | "INACTIVE" | "DISSOLVED" | "NOT_FOUND";
  state: string | null;
}

interface IdentityCheckResult {
  identityScore: number;
  identityStatus: "UNVERIFIED" | "PARTIAL" | "VERIFIED" | "FAILED";
  email: EmailDomainResult;
  phone: PhoneTypeResult;
  business: BusinessEntityResult;
}

// ── Email Domain Validation ──

export async function validateEmailDomain(email: string): Promise<EmailDomainResult> {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) {
    return { valid: false, provider: "DISPOSABLE", hasMxRecords: false, isDisposable: false, domainAge: null };
  }

  // Check disposable
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { valid: false, provider: "DISPOSABLE", hasMxRecords: true, isDisposable: true, domainAge: null };
  }

  // Check free provider
  const isFree = FREE_PROVIDERS.has(domain);

  // Check MX records
  let hasMxRecords = false;
  try {
    const records = await dns.promises.resolveMx(domain);
    hasMxRecords = records.length > 0;
  } catch {
    hasMxRecords = false;
  }

  // Domain age via RDAP (best-effort, free)
  let domainAge: number | null = null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const rdapRes = await fetch(`https://rdap.org/domain/${domain}`, {
      signal: controller.signal,
      headers: { Accept: "application/rdap+json" },
    });
    clearTimeout(timeout);
    if (rdapRes.ok) {
      const rdapData = await rdapRes.json() as any;
      const registrationEvent = rdapData?.events?.find((e: any) => e.eventAction === "registration");
      if (registrationEvent?.eventDate) {
        const regDate = new Date(registrationEvent.eventDate);
        domainAge = Math.floor((Date.now() - regDate.getTime()) / 86_400_000);
      }
    }
  } catch {
    // Domain age lookup failed — non-critical
  }

  const provider = isFree ? "FREE" as const : "BUSINESS" as const;

  return {
    valid: hasMxRecords,
    provider,
    hasMxRecords,
    isDisposable: false,
    domainAge,
  };
}

// ── Phone Type Detection ──

export async function detectPhoneType(phone: string): Promise<PhoneTypeResult> {
  // Normalize to last 10 digits
  const digits = phone.replace(/\D/g, "").slice(-10);
  if (digits.length < 10) {
    return { phoneType: "MOBILE", carrier: null, isVoip: false };
  }

  const areaCode = digits.substring(0, 3);

  // Check known VoIP prefixes
  const isKnownVoip = VOIP_PREFIXES.includes(areaCode);

  // Try numverify free tier if API key configured
  const numverifyKey = process.env.NUMVERIFY_API_KEY;
  if (numverifyKey) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(
        `http://apilayer.net/api/validate?access_key=${numverifyKey}&number=1${digits}`,
        { signal: controller.signal },
      );
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json() as any;
        if (data.valid) {
          const lineType = data.line_type?.toLowerCase() || "";
          const isVoip = lineType === "voip" || lineType.includes("voip");
          return {
            phoneType: isVoip ? "VOIP" : lineType === "landline" ? "LANDLINE" : "MOBILE",
            carrier: data.carrier || null,
            isVoip,
          };
        }
      }
    } catch {
      // API failed — fall through to heuristic
    }
  }

  return {
    phoneType: isKnownVoip ? "VOIP" : "MOBILE",
    carrier: null,
    isVoip: isKnownVoip,
  };
}

// ── Secretary of State / Business Entity Verification ──

export async function verifyBusinessEntity(
  companyName: string,
  state?: string,
): Promise<BusinessEntityResult> {
  // Try OpenCorporates free API (50 lookups/day)
  try {
    const query = encodeURIComponent(companyName);
    const jurisdiction = state ? `&jurisdiction_code=us_${state.toLowerCase()}` : "";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(
      `https://api.opencorporates.com/v0.4/companies/search?q=${query}${jurisdiction}&per_page=5`,
      { signal: controller.signal },
    );
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json() as any;
      const companies = data?.results?.companies || [];

      if (companies.length > 0) {
        const best = companies[0].company;
        const status = best.current_status?.toUpperCase() || "";

        let sosStatus: "ACTIVE" | "INACTIVE" | "DISSOLVED" | "NOT_FOUND" = "ACTIVE";
        if (status.includes("DISSOLV") || status.includes("REVOKED") || status.includes("CANCEL")) {
          sosStatus = "DISSOLVED";
        } else if (status.includes("INACTIVE") || status.includes("DELINQUENT")) {
          sosStatus = "INACTIVE";
        }

        return {
          verified: sosStatus === "ACTIVE",
          entityName: best.name || null,
          filingNumber: best.company_number || null,
          status: sosStatus,
          state: best.jurisdiction_code?.replace("us_", "").toUpperCase() || state || null,
        };
      }
    }
  } catch {
    // OpenCorporates lookup failed — flag for manual review
  }

  return {
    verified: false,
    entityName: null,
    filingNumber: null,
    status: "NOT_FOUND",
    state: state || null,
  };
}

// ── Orchestrator: Run Full Identity Check ──

export async function runIdentityCheck(carrierId: string): Promise<IdentityCheckResult> {
  const carrier = await prisma.carrierProfile.findUnique({
    where: { id: carrierId },
    include: { user: { select: { email: true, phone: true } } },
  });

  if (!carrier) throw new Error("Carrier not found");

  const email = carrier.contactEmail || carrier.user.email;
  const phone = carrier.contactPhone || carrier.user.phone || "";
  const companyName = carrier.companyName || "";
  const state = carrier.state || undefined;

  // Run checks in parallel
  const [emailResult, phoneResult, businessResult] = await Promise.all([
    validateEmailDomain(email),
    detectPhoneType(phone),
    companyName ? verifyBusinessEntity(companyName, state) : Promise.resolve({
      verified: false, entityName: null, filingNumber: null, status: "NOT_FOUND" as const, state: null,
    }),
  ]);

  // Calculate identity score (0-100)
  let score = 0;

  // Email: up to 30 points
  if (emailResult.provider === "BUSINESS" && emailResult.hasMxRecords) score += 30;
  else if (emailResult.provider === "FREE" && emailResult.hasMxRecords) score += 15;
  else if (emailResult.isDisposable) score += 0;
  else if (emailResult.hasMxRecords) score += 20;

  // Domain age bonus
  if (emailResult.domainAge !== null) {
    if (emailResult.domainAge > 365) score += 10;
    else if (emailResult.domainAge > 90) score += 5;
  }

  // Phone: up to 25 points
  if (!phoneResult.isVoip) score += 25;
  else score += 5;

  // Business entity: up to 35 points
  if (businessResult.verified && businessResult.status === "ACTIVE") score += 35;
  else if (businessResult.status === "INACTIVE") score += 15;
  else if (businessResult.status === "DISSOLVED") score += 0;
  else score += 10; // NOT_FOUND — could be new business

  // Determine status
  let identityStatus: "UNVERIFIED" | "PARTIAL" | "VERIFIED" | "FAILED";
  if (score >= 75) identityStatus = "VERIFIED";
  else if (score >= 40) identityStatus = "PARTIAL";
  else if (emailResult.isDisposable || businessResult.status === "DISSOLVED") identityStatus = "FAILED";
  else identityStatus = "UNVERIFIED";

  // Persist to DB
  await prisma.carrierIdentityVerification.upsert({
    where: { carrierId },
    create: {
      carrierId,
      emailDomainValid: emailResult.hasMxRecords,
      emailDomainAge: emailResult.domainAge,
      emailIsDisposable: emailResult.isDisposable,
      emailProvider: emailResult.provider,
      phoneType: phoneResult.phoneType,
      phoneCarrier: phoneResult.carrier,
      phoneIsVoip: phoneResult.isVoip,
      sosVerified: businessResult.verified,
      sosState: businessResult.state,
      sosEntityName: businessResult.entityName,
      sosFilingNumber: businessResult.filingNumber,
      sosStatus: businessResult.status,
      identityScore: score,
      identityStatus,
    },
    update: {
      emailDomainValid: emailResult.hasMxRecords,
      emailDomainAge: emailResult.domainAge,
      emailIsDisposable: emailResult.isDisposable,
      emailProvider: emailResult.provider,
      phoneType: phoneResult.phoneType,
      phoneCarrier: phoneResult.carrier,
      phoneIsVoip: phoneResult.isVoip,
      sosVerified: businessResult.verified,
      sosState: businessResult.state,
      sosEntityName: businessResult.entityName,
      sosFilingNumber: businessResult.filingNumber,
      sosStatus: businessResult.status,
      identityScore: score,
      identityStatus,
    },
  });

  return {
    identityScore: score,
    identityStatus,
    email: emailResult,
    phone: phoneResult,
    business: businessResult,
  };
}
