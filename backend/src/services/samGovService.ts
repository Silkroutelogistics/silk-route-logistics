/**
 * SAM.gov Entity Exclusions API Service
 * Checks federal exclusion database (System for Award Management)
 * Free API — DEMO_KEY for low-volume, register at api.data.gov for production key (1000 req/hr)
 */

import { prisma } from "../config/database";
import { log } from "../lib/logger";

// ── Types ────────────────────────────────────────────────

export interface ExclusionMatch {
  name: string;
  classificationType: string; // "Firm" | "Individual"
  exclusionType: string; // "Ineligible (Proceedings Pending)" | "Prohibited" etc.
  exclusionProgram: string;
  activateDate: string;
  terminationDate: string | null;
  agencyCode: string;
  description: string;
}

export interface ExclusionResult {
  excluded: boolean;
  matches: ExclusionMatch[];
  totalResults: number;
  searchedAt: string;
}

// ── In-memory cache (24-hour TTL) ────────────────────────

interface CacheEntry {
  result: ExclusionResult;
  cachedAt: number;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const exclusionCache = new Map<string, CacheEntry>();

function getCached(key: string): ExclusionResult | null {
  const entry = exclusionCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    exclusionCache.delete(key);
    return null;
  }
  return entry.result;
}

function setCache(key: string, result: ExclusionResult): void {
  exclusionCache.set(key, { result, cachedAt: Date.now() });

  // Prune stale entries periodically (keep cache bounded)
  if (exclusionCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of exclusionCache) {
      if (now - v.cachedAt > CACHE_TTL_MS) exclusionCache.delete(k);
    }
  }
}

// ── SAM.gov API Configuration ────────────────────────────

const SAM_API_KEY = process.env.SAM_GOV_API_KEY || "DEMO_KEY";
const SAM_BASE_URL = "https://api.sam.gov/entity-information/v2/exclusions";

// ── Core Search Function ─────────────────────────────────

async function searchExclusions(searchTerm: string): Promise<ExclusionResult> {
  const cacheKey = searchTerm.toLowerCase().trim();
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const searchedAt = new Date().toISOString();

  try {
    const url = `${SAM_BASE_URL}?api_key=${SAM_API_KEY}&q=${encodeURIComponent(searchTerm)}&page=0&size=10`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      log.error(`SAM.gov API returned ${response.status}: ${response.statusText}`);
      return { excluded: false, matches: [], totalResults: 0, searchedAt };
    }

    const data = (await response.json()) as { totalRecords?: number; results?: any[] };
    const totalResults: number = data.totalRecords || 0;
    const records: any[] = data.results || [];

    const now = new Date();
    const matches: ExclusionMatch[] = records.map((r: any) => ({
      name: r.name || r.firm || r.firstName
        ? [r.firstName, r.lastName].filter(Boolean).join(" ") || r.firm || "Unknown"
        : "Unknown",
      classificationType: r.classificationType || "Unknown",
      exclusionType: r.exclusionType || "Unknown",
      exclusionProgram: r.exclusionProgram || "Unknown",
      activateDate: r.activateDate || "",
      terminationDate: r.terminationDate || null,
      agencyCode: r.agencyCode || "",
      description: r.description || "",
    }));

    // An entity is "excluded" if any match has no termination date or termination is in the future
    const excluded = matches.some((m) => {
      if (!m.terminationDate) return true; // No end date = still active
      return new Date(m.terminationDate) > now;
    });

    const result: ExclusionResult = { excluded, matches, totalResults, searchedAt };
    setCache(cacheKey, result);
    return result;
  } catch (err) {
    log.error({ err: err }, "SAM.gov exclusion check failed:");
    return { excluded: false, matches: [], totalResults: 0, searchedAt };
  }
}

// ── Public API ───────────────────────────────────────────

/**
 * Check SAM.gov federal exclusions for a company (and optionally by DOT number).
 * Merges results from both searches and deduplicates.
 */
export async function checkExclusions(
  companyName: string,
  dotNumber?: string
): Promise<ExclusionResult> {
  const nameResult = await searchExclusions(companyName);

  if (!dotNumber) return nameResult;

  // Also search by DOT number
  const dotResult = await searchExclusions(dotNumber);

  // Merge & deduplicate matches by name + activateDate
  const seen = new Set<string>();
  const allMatches: ExclusionMatch[] = [];

  for (const m of [...nameResult.matches, ...dotResult.matches]) {
    const key = `${m.name}|${m.activateDate}|${m.exclusionType}`;
    if (!seen.has(key)) {
      seen.add(key);
      allMatches.push(m);
    }
  }

  const now = new Date();
  const excluded = allMatches.some((m) => {
    if (!m.terminationDate) return true;
    return new Date(m.terminationDate) > now;
  });

  return {
    excluded,
    matches: allMatches,
    totalResults: nameResult.totalResults + dotResult.totalResults,
    searchedAt: new Date().toISOString(),
  };
}

/**
 * Convenience wrapper: look up carrier from DB, check exclusions,
 * update CarrierProfile and create ComplianceAlert if excluded.
 */
export async function checkCarrierExclusions(carrierId: string): Promise<ExclusionResult> {
  const carrier = await prisma.carrierProfile.findUnique({
    where: { id: carrierId },
    select: { id: true, companyName: true, dotNumber: true },
  });

  if (!carrier) {
    throw new Error(`Carrier not found: ${carrierId}`);
  }

  const companyName = carrier.companyName || "";
  if (!companyName && !carrier.dotNumber) {
    return {
      excluded: false,
      matches: [],
      totalResults: 0,
      searchedAt: new Date().toISOString(),
    };
  }

  const result = await checkExclusions(
    companyName || carrier.dotNumber || "",
    carrier.dotNumber || undefined
  );

  // Update carrier profile with exclusion check timestamp
  await prisma.carrierProfile.update({
    where: { id: carrierId },
    data: {
      fmcsaLastChecked: new Date(), // reuse existing timestamp field for last compliance check
    },
  });

  // Create ComplianceAlert if excluded
  if (result.excluded) {
    await prisma.complianceAlert.create({
      data: {
        type: "SAM_EXCLUSION",
        entityType: "CarrierProfile",
        entityId: carrierId,
        entityName: companyName || carrier.dotNumber || "Unknown",
        expiryDate: new Date(),
        severity: "CRITICAL",
        status: "ACTIVE",
      },
    });
  }

  return result;
}
