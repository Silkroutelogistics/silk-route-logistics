/**
 * SEC EDGAR Business Credit Lookup Service
 * Uses the free SEC EDGAR API to look up public company financials.
 * No API key required. Rate limit: 10 req/sec.
 */
import { log } from "../lib/logger";

// SEC EDGAR fair-access policy requires a User-Agent identifying the
// caller. Uses the compliance@ alias per the follow-up spec — this is
// a technical machine identifier, not a reply-to, so it doesn't
// conflict with Rule 13's outreach/transactional email guidance.
const USER_AGENT = "SilkRouteLogistics/1.0 (compliance@silkroutelogistics.ai)";
const TIMEOUT_MS = 10_000;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// ─── In-Memory Cache ─────────────────────────────────────────────
const cache = new Map<string, { data: any; ts: number }>();

function cacheGet<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { cache.delete(key); return null; }
  return entry.data as T;
}

function cacheSet(key: string, data: any) {
  cache.set(key, { data, ts: Date.now() });
  if (cache.size > 500) {
    const now = Date.now();
    for (const [k, v] of cache) { if (now - v.ts > CACHE_TTL) cache.delete(k); }
  }
}

// ─── Types ───────────────────────────────────────────────────────
export interface CompanyFinancials {
  revenue: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  netIncome: number | null;
  stockholdersEquity: number | null;
  debtToEquityRatio: number | null;
}

export interface CompanyCredit {
  found: boolean;
  companyName: string;
  ticker: string;
  cik: string;
  stateOfIncorporation: string;
  sicCode: string;
  sicDescription: string;
  latestAnnualFiling: string;
  financials: CompanyFinancials | null;
  riskAssessment: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
}

interface TickerEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

// ─── Helpers ─────────────────────────────────────────────────────
async function secFetch(url: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`SEC API ${res.status}: ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ─── Company Tickers Cache ───────────────────────────────────────
let tickersCache: TickerEntry[] | null = null;
let tickersCacheTs = 0;

async function loadTickers(): Promise<TickerEntry[]> {
  if (tickersCache && Date.now() - tickersCacheTs < CACHE_TTL) return tickersCache;

  const data = await secFetch("https://www.sec.gov/files/company_tickers.json");
  // data is { "0": { cik_str, ticker, title }, "1": ... }
  tickersCache = Object.values(data) as TickerEntry[];
  tickersCacheTs = Date.now();
  return tickersCache;
}

// ─── searchCompany ───────────────────────────────────────────────
export interface CompanyMatch {
  cik: string;
  ticker: string;
  companyName: string;
}

export async function searchCompany(companyName: string): Promise<CompanyMatch[]> {
  const cacheKey = `search:${companyName.toLowerCase()}`;
  const cached = cacheGet<CompanyMatch[]>(cacheKey);
  if (cached) return cached;

  const tickers = await loadTickers();
  const query = companyName.toLowerCase().trim();

  // Score-based matching: exact name match > starts-with > includes > word match
  const matches: { entry: TickerEntry; score: number }[] = [];

  for (const entry of tickers) {
    const title = entry.title.toLowerCase();
    const ticker = entry.ticker.toLowerCase();

    if (title === query || ticker === query) {
      matches.push({ entry, score: 100 });
    } else if (title.startsWith(query) || ticker.startsWith(query)) {
      matches.push({ entry, score: 80 });
    } else if (title.includes(query)) {
      matches.push({ entry, score: 60 });
    } else {
      // Check if all query words appear in the title
      const words = query.split(/\s+/);
      if (words.length > 1 && words.every(w => title.includes(w))) {
        matches.push({ entry, score: 40 });
      }
    }
  }

  matches.sort((a, b) => b.score - a.score);
  const results = matches.slice(0, 10).map(m => ({
    cik: m.entry.cik_str.toString(),
    ticker: m.entry.ticker,
    companyName: m.entry.title,
  }));

  cacheSet(cacheKey, results);
  return results;
}

// ─── getCompanyFilings ───────────────────────────────────────────
export interface CompanyFilingsResult {
  companyName: string;
  ticker: string;
  cik: string;
  sicCode: string;
  sicDescription: string;
  stateOfIncorporation: string;
  latestAnnualFiling: string;
}

export async function getCompanyFilings(cik: string): Promise<CompanyFilingsResult | null> {
  const paddedCik = cik.padStart(10, "0");
  const cacheKey = `filings:${paddedCik}`;
  const cached = cacheGet<CompanyFilingsResult>(cacheKey);
  if (cached) return cached;

  try {
    const data = await secFetch(`https://data.sec.gov/submissions/CIK${paddedCik}.json`);

    let latestAnnualFiling = "";
    const recentFilings = data.filings?.recent;
    if (recentFilings) {
      const forms: string[] = recentFilings.form || [];
      const dates: string[] = recentFilings.filingDate || [];
      for (let i = 0; i < forms.length; i++) {
        if (forms[i] === "10-K" || forms[i] === "10-K/A") {
          latestAnnualFiling = dates[i] || "";
          break;
        }
      }
    }

    const result: CompanyFilingsResult = {
      companyName: data.name || "",
      ticker: (data.tickers && data.tickers[0]) || "",
      cik,
      sicCode: data.sic || "",
      sicDescription: data.sicDescription || "",
      stateOfIncorporation: data.stateOfIncorporation || "",
      latestAnnualFiling,
    };

    cacheSet(cacheKey, result);
    return result;
  } catch (err) {
    log.error({ err: err }, `SEC EDGAR filings fetch failed for CIK ${cik}:`);
    return null;
  }
}

// ─── getCompanyFacts ─────────────────────────────────────────────
function extractLatestAnnual(concept: any): number | null {
  if (!concept?.units) return null;
  // Try USD first, then other units
  const units = concept.units.USD || Object.values(concept.units)[0];
  if (!Array.isArray(units)) return null;

  // Filter for annual (10-K) filings and get the most recent
  const annuals = units
    .filter((u: any) => u.form === "10-K" || u.form === "10-K/A")
    .sort((a: any, b: any) => {
      const dateA = a.end || a.filed || "";
      const dateB = b.end || b.filed || "";
      return dateB.localeCompare(dateA);
    });

  return annuals.length > 0 ? annuals[0].val : null;
}

export async function getCompanyFacts(cik: string): Promise<CompanyFinancials | null> {
  const paddedCik = cik.padStart(10, "0");
  const cacheKey = `facts:${paddedCik}`;
  const cached = cacheGet<CompanyFinancials>(cacheKey);
  if (cached) return cached;

  try {
    const data = await secFetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${paddedCik}.json`);
    const gaap = data?.facts?.["us-gaap"];
    if (!gaap) return null;

    // Try multiple concept names for each metric
    const revenue =
      extractLatestAnnual(gaap.Revenues) ??
      extractLatestAnnual(gaap.RevenueFromContractWithCustomerExcludingAssessedTax) ??
      extractLatestAnnual(gaap.SalesRevenueNet) ??
      extractLatestAnnual(gaap.RevenueFromContractWithCustomerIncludingAssessedTax) ??
      extractLatestAnnual(gaap.SalesRevenueGoodsNet);

    const totalAssets = extractLatestAnnual(gaap.Assets);

    const totalLiabilities =
      extractLatestAnnual(gaap.Liabilities) ??
      extractLatestAnnual(gaap.LiabilitiesAndStockholdersEquity);

    const netIncome =
      extractLatestAnnual(gaap.NetIncomeLoss) ??
      extractLatestAnnual(gaap.ProfitLoss) ??
      extractLatestAnnual(gaap.NetIncomeLossAvailableToCommonStockholdersBasic);

    const stockholdersEquity =
      extractLatestAnnual(gaap.StockholdersEquity) ??
      extractLatestAnnual(gaap.StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest);

    let debtToEquityRatio: number | null = null;
    if (totalLiabilities != null && stockholdersEquity != null && stockholdersEquity !== 0) {
      debtToEquityRatio = Math.round((totalLiabilities / stockholdersEquity) * 100) / 100;
    }

    const result: CompanyFinancials = {
      revenue,
      totalAssets,
      totalLiabilities,
      netIncome,
      stockholdersEquity,
      debtToEquityRatio,
    };

    cacheSet(cacheKey, result);
    return result;
  } catch (err) {
    log.error({ err: err }, `SEC EDGAR facts fetch failed for CIK ${cik}:`);
    return null;
  }
}

// ─── assessRisk ──────────────────────────────────────────────────
function assessRisk(financials: CompanyFinancials | null): "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN" {
  if (!financials) return "UNKNOWN";

  const { netIncome, totalAssets, totalLiabilities, stockholdersEquity } = financials;

  // No meaningful data
  if (netIncome == null && totalAssets == null) return "UNKNOWN";

  // HIGH: net loss or liabilities > assets
  if (netIncome != null && netIncome < 0) return "HIGH";
  if (totalAssets != null && totalLiabilities != null && totalLiabilities > totalAssets) return "HIGH";

  // MEDIUM: profitable but high leverage (D/E > 3)
  if (financials.debtToEquityRatio != null && financials.debtToEquityRatio > 3) return "MEDIUM";
  if (stockholdersEquity != null && totalLiabilities != null && stockholdersEquity < totalLiabilities && netIncome != null && netIncome > 0) return "MEDIUM";

  // LOW: profitable, equity > liabilities
  if (netIncome != null && netIncome > 0) return "LOW";

  return "UNKNOWN";
}

// ─── Full Credit Check ──────────────────────────────────────────
export async function creditCheck(companyName: string): Promise<CompanyCredit> {
  // 1. Search for the company
  const matches = await searchCompany(companyName);
  if (matches.length === 0) {
    return {
      found: false,
      companyName,
      ticker: "",
      cik: "",
      stateOfIncorporation: "",
      sicCode: "",
      sicDescription: "",
      latestAnnualFiling: "",
      financials: null,
      riskAssessment: "UNKNOWN",
    };
  }

  const best = matches[0];

  // 2. Get filings metadata and financial facts in parallel
  const [filings, financials] = await Promise.all([
    getCompanyFilings(best.cik),
    getCompanyFacts(best.cik),
  ]);

  return {
    found: true,
    companyName: filings?.companyName || best.companyName,
    ticker: filings?.ticker || best.ticker,
    cik: best.cik,
    stateOfIncorporation: filings?.stateOfIncorporation || "",
    sicCode: filings?.sicCode || "",
    sicDescription: filings?.sicDescription || "",
    latestAnnualFiling: filings?.latestAnnualFiling || "",
    financials,
    riskAssessment: assessRisk(financials),
  };
}

// ─── Recent filings list (v3.4.n — CRM credit check UI) ────────────

export interface RecentFiling {
  form: string;
  filedDate: string;
  reportDate: string | null;
  accessionNumber: string;
  description: string | null;
  url: string;
}

/**
 * Parse the submissions.recent feed into a flat list of 10-K / 10-Q /
 * 8-K filings. Used by the CRM Profile tab SEC credit check display.
 */
export async function getRecentFilings(cik: string, max = 20): Promise<RecentFiling[]> {
  const paddedCik = cik.padStart(10, "0");
  const cacheKey = `recent-filings:${paddedCik}:${max}`;
  const cached = cacheGet<RecentFiling[]>(cacheKey);
  if (cached) return cached;

  try {
    const data = await secFetch(`https://data.sec.gov/submissions/CIK${paddedCik}.json`);
    const recent = data?.filings?.recent;
    if (!recent) return [];

    const forms: string[] = recent.form ?? [];
    const filingDates: string[] = recent.filingDate ?? [];
    const reportDates: string[] = recent.reportDate ?? [];
    const accessionNumbers: string[] = recent.accessionNumber ?? [];
    const primaryDocuments: string[] = recent.primaryDocument ?? [];
    const descriptions: string[] = recent.primaryDocDescription ?? [];

    const targetForms = new Set(["10-K", "10-K/A", "10-Q", "10-Q/A", "8-K", "8-K/A"]);
    const result: RecentFiling[] = [];
    for (let i = 0; i < forms.length && result.length < max; i++) {
      if (!targetForms.has(forms[i])) continue;
      const accessionDashed = accessionNumbers[i] ?? "";
      const accessionPlain = accessionDashed.replace(/-/g, "");
      const primaryDoc = primaryDocuments[i] ?? "";
      const url = accessionPlain && primaryDoc
        ? `https://www.sec.gov/Archives/edgar/data/${Number(paddedCik)}/${accessionPlain}/${primaryDoc}`
        : `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${paddedCik}&type=${forms[i]}&dateb=&owner=include&count=40`;
      result.push({
        form: forms[i],
        filedDate: filingDates[i] ?? "",
        reportDate: reportDates[i] ?? null,
        accessionNumber: accessionDashed,
        description: descriptions[i] ?? null,
        url,
      });
    }

    cacheSet(cacheKey, result);
    return result;
  } catch (err) {
    log.error({ err, cik }, "[SEC] recent filings fetch failed");
    return [];
  }
}

export interface CustomerCreditCheckResult {
  publiclyTraded: boolean;
  legalName: string | null;
  cik: string | null;
  ticker: string | null;
  sicCode: string | null;
  sicDescription: string | null;
  latestAnnualFiling: string | null;
  filingsHealthy: boolean;
  risk: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  recentFilings: RecentFiling[];
  profileUrl: string | null;
  /** Summary result code persisted on the customer row */
  result: "approved" | "flagged" | "not_found";
}

/**
 * High-level entry point used by /customers/:id/sec-credit-check.
 *
 * Returns a normalized result ready to persist on the Customer row and
 * render in the Profile tab inline swap. On a non-public company it
 * returns { publiclyTraded: false, result: "not_found" } so the caller
 * falls back to manual review.
 */
export async function customerCreditCheck(companyName: string): Promise<CustomerCreditCheckResult> {
  const check = await creditCheck(companyName);

  if (!check.found) {
    return {
      publiclyTraded: false,
      legalName: null,
      cik: null,
      ticker: null,
      sicCode: null,
      sicDescription: null,
      latestAnnualFiling: null,
      filingsHealthy: false,
      risk: "UNKNOWN",
      recentFilings: [],
      profileUrl: null,
      result: "not_found",
    };
  }

  const recentFilings = await getRecentFilings(check.cik);

  // Filings are "healthy" if a 10-K was filed within the last 15 months
  const fifteenMonthsAgo = Date.now() - 15 * 30 * 24 * 60 * 60 * 1000;
  const filingsHealthy = recentFilings.some(
    (f) => (f.form === "10-K" || f.form === "10-K/A") &&
           !!f.filedDate &&
           new Date(f.filedDate).getTime() >= fifteenMonthsAgo
  );

  // Map to our 3-value persisted result:
  //   LOW risk + healthy filings → approved
  //   MEDIUM/HIGH risk OR stale filings → flagged (manual review)
  //   Everything else → flagged
  const result: "approved" | "flagged" =
    check.riskAssessment === "LOW" && filingsHealthy ? "approved" : "flagged";

  const paddedCik = check.cik.padStart(10, "0");

  return {
    publiclyTraded: true,
    legalName: check.companyName,
    cik: check.cik,
    ticker: check.ticker,
    sicCode: check.sicCode,
    sicDescription: check.sicDescription,
    latestAnnualFiling: check.latestAnnualFiling || null,
    filingsHealthy,
    risk: check.riskAssessment,
    recentFilings,
    profileUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${paddedCik}&type=&dateb=&owner=include&count=40`,
    result,
  };
}
