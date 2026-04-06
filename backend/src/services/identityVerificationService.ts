/**
 * Identity Verification Service
 * Validates carrier identity through email domain, phone type,
 * business entity (SOS), and orchestrates full identity checks.
 */

import { prisma } from "../config/database";
import dns from "dns";

// ── Disposable email domain blocklist (200+ known throwaway domains) ──
const DISPOSABLE_DOMAINS = new Set([
  // Major disposable services
  "mailinator.com", "guerrillamail.com", "tempmail.com", "throwaway.email",
  "yopmail.com", "sharklasers.com", "guerrillamailblock.com", "grr.la",
  "dispostable.com", "mailnesia.com", "maildrop.cc", "10minutemail.com",
  "trashmail.com", "fakeinbox.com", "mailcatch.com", "tempr.email",
  "discard.email", "getnada.com", "mohmal.com", "mailsac.com",
  "temp-mail.org", "burpcollaborator.net", "mytemp.email",
  // Additional common disposable domains
  "guerrillamail.info", "guerrillamail.net", "guerrillamail.de",
  "tempail.com", "harakirimail.com", "tempinbox.com",
  "mailexpire.com", "throwam.com", "trashmail.net", "trashmail.me",
  "tmpmail.net", "tmpmail.org", "binkmail.com", "safetymail.info",
  "mailtemp.info", "inboxclean.com", "inboxclean.org",
  "mintemail.com", "filzmail.com", "jetable.org",
  "nospam.ze.tc", "nospamfor.us", "kurzepost.de",
  "objectmail.com", "proxymail.eu", "spamfree24.org",
  "spamgourmet.com", "spam4.me", "trashmail.at",
  "wegwerfmail.de", "wegwerfmail.net", "wegwerfmail.org",
  "wh4f.org", "mailzilla.com", "mailzilla.org",
  "monumentmail.com", "crazymailing.com", "deadaddress.com",
  "despammed.com", "devnullmail.com", "dfgh.net",
  "dodgeit.com", "dodgit.com", "donemail.ru",
  "e4ward.com", "emailgo.de", "emailias.com",
  "emailsensei.com", "emailtemporario.com.br", "emailwarden.com",
  "ephemail.net", "ero-tube.org", "evopo.com",
  "explodemail.com", "fastacura.com", "fastchevy.com",
  "fastchrysler.com", "fastkawasaki.com", "fastmazda.com",
  "fastnissan.com", "fastsubaru.com", "fastsuzuki.com",
  "fasttoyota.com", "fightallspam.com", "filzmail.com",
  "fixmail.tk", "flyspam.com", "frapmail.com",
  "getairmail.com", "getonemail.com", "getonemail.net",
  "girlsundertheinfluence.com", "gishpuppy.com",
  "great-host.in", "greensloth.com", "gsrv.co.uk",
  "haltospam.com", "hidzz.com", "hotpop.com",
  "ieatspam.eu", "ieatspam.info", "imails.info",
  "inboxbear.com", "insorg-mail.info", "ipoo.org",
  "irish2me.com", "jetable.com", "jetable.fr.nf",
  "jnxjn.com", "kasmail.com", "kaspop.com",
  "keepmymail.com", "killmail.com", "killmail.net",
  "klzlk.com", "koszmail.pl", "kurzepost.de",
  "lifebyfood.com", "link2mail.net", "litedrop.com",
  "lol.ovpn.to", "lookugly.com", "lopl.co.cc",
  "lr78.com", "lroid.com", "lukop.dk",
  "m21.cc", "mail-temporaire.fr", "mail.by",
  "mailbidon.com", "mailblocks.com", "mailbucket.org",
  "mailcat.biz", "mailcatch.com", "mailde.de",
  "mailde.info", "maileater.com", "mailexpire.com",
  "mailin8r.com", "mailinater.com", "mailinator2.com",
  "mailincubator.com", "mailme.ir", "mailme.lv",
  "mailmetrash.com", "mailmoat.com", "mailms.com",
  "mailnull.com", "mailquack.com", "mailshell.com",
  "mailsiphon.com", "mailslite.com", "mailtemp.info",
  "mailtothis.com", "mailtrash.net", "mailzilla.com",
  "makemetheking.com", "manifestgenerator.com",
  "messagebeamer.de", "mezimages.net", "mfsa.ru",
  "mt2015.com", "mx0.wwwnew.eu", "mypartyclip.de",
  "myphantom.com", "mysamp.de", "mytrashmail.com",
  "nabala.com", "neomailbox.com", "nervmich.net",
  "nervtansen.de", "netmails.com", "netmails.net",
  "neverbox.com", "no-spam.ws", "nobulk.com",
  "noclickemail.com", "nogmailspam.info", "nomail.xl.cx",
  "nomail2me.com", "nomorespamemails.com", "notmailinator.com",
  "nowhere.org", "nowmymail.com", "nurfuerspam.de",
  "nus.edu.sg", "nwldx.com", "oneoffemail.com",
  "onewaymail.com", "oopi.org", "ordinaryamerican.net",
  "owlpic.com", "pancakemail.com", "pjjkp.com",
  "plexolan.de", "pookmail.com", "privacy.net",
  "prtnx.com", "putthisinyouremail.com", "qq.com",
  "quickinbox.com", "rcpt.at", "reallymymail.com",
  "recode.me", "recursor.net", "regbypass.com",
  "rhyta.com", "rklips.com", "rmqkr.net",
  "rppkn.com", "rtrtr.com", "s0ny.net",
  "safe-mail.net", "safersignup.de", "safetypost.de",
  "sandelf.de", "saynotospams.com", "scatmail.com",
  "schafmail.de", "selfdestructingmail.com",
  "shieldedmail.com", "shiftmail.com", "shitmail.me",
  "shortmail.net", "sibmail.com", "skeefmail.com",
  "slaskpost.se", "slipry.net", "slushmail.com",
  "smashmail.de", "snoopmail.com", "sofimail.com",
  "sofort-mail.de", "softpls.asia", "sogetthis.com",
  "soodonims.com", "spam.la", "spam.su",
  "spamavert.com", "spambob.com", "spambob.net",
  "spambob.org", "spambog.com", "spambog.de",
  "spambog.ru", "spambox.info", "spambox.us",
  "spamcannon.com", "spamcannon.net", "spamcero.com",
  "spamcorptastic.com", "spamcowboy.com", "spamcowboy.net",
  "spamcowboy.org", "spamday.com", "spamex.com",
  "spamfighter.cf", "spamfighter.ga", "spamfighter.gq",
  "spamfighter.ml", "spamfighter.tk", "spamfree.eu",
  "spamfree24.com", "spamfree24.de", "spamfree24.info",
  "spamfree24.net", "spamfree24.org", "spamhereplease.com",
  "spamhole.com", "spamify.com", "spaminator.de",
  "spamkill.info", "spaml.com", "spaml.de",
  "spammotel.com", "spamobox.com", "spamoff.de",
  "spamslicer.com", "spamspot.com", "spamstack.net",
  "spamtrail.com", "spamtrap.ro", "speed.1s.fr",
  "superrito.com", "suremail.info", "svk.jp",
  "sweetxxx.de", "tafmail.com", "tafoi.gr",
  "thanksnospam.info", "thankyou2010.com", "thc.st",
  "thelimestones.com", "thisisnotmyrealemail.com",
  "thismail.net", "throwawayemailaddress.com",
  "tittbit.in", "tizi.com", "tmailinator.com",
  "tradermail.info", "trash-amil.com", "trash-mail.at",
  "trash-mail.com", "trash-mail.de", "trash2009.com",
  "trashemail.de", "trashymail.com", "trashymail.net",
  "turual.com", "twinmail.de", "tyldd.com",
  "uggsrock.com", "upliftnow.com", "uplipht.com",
  "venompen.com", "veryreallynicemail.com", "vidchart.com",
  "viditag.com", "viewcastmedia.com", "viewcastmedia.net",
  "viewcastmedia.org", "vomoto.com", "vpn.st",
  "vsimcard.com", "vubby.com", "wasteland.rfc822.org",
  "webemail.me", "weg-werf-email.de", "wegwerfadresse.de",
  "wegwerfemail.com", "wegwerfemail.de", "wegwerfmail.de",
  "wilemail.com", "willhackforfood.biz", "willselfdestruct.com",
  "winemaven.info", "wronghead.com", "wuzup.net",
  "wuzupmail.net", "wwwnew.eu", "xagloo.com",
  "xemaps.com", "xents.com", "xmaily.com",
  "xoxy.net", "yapped.net", "yep.it",
  "yogamaven.com", "yomail.info", "yopmail.fr",
  "yopmail.net", "ypmail.webarnak.fr.eu.org",
  "yuurok.com", "zehnminutenmail.de", "zippymail.info",
  "zoaxe.com", "zoemail.org",
]);

const FREE_PROVIDERS = new Set([
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "aol.com",
  "icloud.com", "mail.com", "protonmail.com", "zoho.com", "gmx.com",
  "yandex.com", "live.com", "msn.com", "me.com", "inbox.com",
]);

// Known VoIP area codes and prefixes (US) — expanded list
const VOIP_PREFIXES = [
  // Google Voice commonly assigned area codes
  "747", "562", "209", "559", "657", "951", "626",
  // TextNow / TextFree / Bandwidth commonly assigned
  "332", "929", "838", "463", "743", "726", "854",
  // Pinger / Sideline / Grasshopper VoIP ranges
  "475", "959", "680", "689", "472",
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
