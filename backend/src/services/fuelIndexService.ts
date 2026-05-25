// EIA weekly diesel-price feed — upstream supplier to the EXISTING
// FuelSurchargeTable / fuelSurchargeTableService.lookupFuelSurcharge pipeline.
// Does NOT compute a per-mile rate, does NOT touch autoQuoteService, does NOT
// write to Load.fuelSurcharge. It only resolves "this week's diesel price" for
// a given EiaRegion and parks it in FuelIndexCache.
//
// HTTP shape mirrors mileageService: native fetch + AbortSignal.timeout(10_000)
// + throw on non-200/timeout + no retry. On any per-region fetch failure the
// LAST CACHED VALUE is preserved (stale is acceptable for weekly data) and the
// error is logged. The refresh loop continues with the next region rather than
// aborting the whole sweep.
//
// Provider toggle via env.FSC_INDEX_PROVIDER (see backend/src/config/env.ts):
//   "eia"    — primary; fetches from EIA Open Data API v2 weekly retail diesel
//   "manual" — short-circuits the fetch entirely; consumers read whatever an
//              operator has previously written into FuelIndexCache (e.g. via a
//              direct DB upsert when EIA is unavailable for an extended period).

import { prisma } from "../config/database";
import { env } from "../config/env";
import { log } from "../lib/logger";
import { EiaRegion, EIA_REGIONS, EIA_REGION_LABELS } from "./eiaRegionMap";

// ─── EIA v2 API constants ────────────────────────────────────────────────────
//
// Route: /v2/petroleum/pri/gnd/data/ (weekly retail gasoline + diesel prices)
// Reference: https://www.eia.gov/opendata/ + /petroleum/gasdiesel/
//
// VERIFY-ON-FIRST-FETCH: the facet IDs below match EIA's documented v2
// conventions for the weekly No. 2 diesel retail series. If EIA's series
// identifiers have shifted, the throw-on-non-200 path in fetchEiaPrice will
// surface a 4xx loudly on the first refresh, and the on-demand script (see
// backend/scripts/refresh-fuel-index.ts) will report exactly which region's
// facet pair failed. Live verification is the canonical confirmation step.

const EIA_BASE_URL = "https://api.eia.gov/v2/petroleum/pri/gnd/data/";
const EIA_PRODUCT_FACET = "EPD2D"; // No. 2 Diesel
const EIA_PROCESS_FACET = "PTE";   // Retail Sales by Refiners (published retail price)

// EIA "duoarea" facet IDs per region. PADD5 maps to R5XCA (West Coast LESS
// California) per the v3.8.akq sprint decision: non-CA West Coast states should
// not be priced off an aggregate that bakes in California's CARB-diesel premium.
// California-origin loads resolve to SCA via the eiaRegionMap helper.
const EIA_DUOAREA_FACET: Record<EiaRegion, string> = {
  NATIONAL: "NUS",
  PADD1: "R10",
  PADD2: "R20",
  PADD3: "R30",
  PADD4: "R40",
  PADD5: "R5XCA",
  CA: "SCA",
};

const CACHE_DAYS = 7; // weekly cadence; expiresAt drives stale-flag without forcing eviction
const FETCH_TIMEOUT_MS = 10_000;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FuelIndexResult {
  region: EiaRegion;
  indexPrice: number;       // $/gal
  indexDate: Date;          // EIA week-ending date
  source: "EIA_DOE" | "MANUAL";
  fetchedAt: Date;
  expiresAt: Date;
  stale: boolean;           // true if expiresAt < now
}

export interface RefreshOutcome {
  region: EiaRegion;
  ok: boolean;
  indexPrice?: number;
  indexDate?: Date;
  // Free-text annotation used for BOTH success and failure paths:
  //   - manual-provider skip: "manual provider — no fetch performed" (ok=true)
  //   - missing API key:      "EIA_API_KEY not set in environment"   (ok=false)
  //   - per-region failure:   the underlying error message            (ok=false)
  // Consumers decide outcome via the `ok` boolean; this is display-only.
  note?: string;
}

// ─── Reader ──────────────────────────────────────────────────────────────────

/**
 * Read the current cached diesel price for a region. Returns null only if the
 * region has never been written to the cache (first run, manual provider with
 * no operator-set value). Returns the cached row even if stale — staleness is
 * surfaced via the `stale` flag so callers can decide whether to use it or
 * fall back further.
 *
 * Does NOT trigger a fetch. The weekly cron job and the on-demand script are
 * the only writers; per-quote reads must remain cache-only to avoid hammering
 * EIA on every rate request.
 */
export async function getFuelIndex(region: EiaRegion): Promise<FuelIndexResult | null> {
  const row = await prisma.fuelIndexCache.findUnique({ where: { region } });
  if (!row) return null;
  return {
    region: row.region as EiaRegion,
    indexPrice: row.indexPrice,
    indexDate: row.indexDate,
    source: row.source as "EIA_DOE" | "MANUAL",
    fetchedAt: row.fetchedAt,
    expiresAt: row.expiresAt,
    stale: row.expiresAt < new Date(),
  };
}

// ─── Writer / EIA fetch ──────────────────────────────────────────────────────

async function fetchEiaPrice(region: EiaRegion): Promise<{ price: number; date: Date }> {
  if (!env.EIA_API_KEY) {
    throw new Error("EIA_API_KEY not set in environment");
  }
  const duoarea = EIA_DUOAREA_FACET[region];

  const url = new URL(EIA_BASE_URL);
  url.searchParams.set("api_key", env.EIA_API_KEY);
  url.searchParams.set("frequency", "weekly");
  url.searchParams.append("data[0]", "value");
  url.searchParams.append("facets[duoarea][]", duoarea);
  url.searchParams.append("facets[product][]", EIA_PRODUCT_FACET);
  url.searchParams.append("facets[process][]", EIA_PROCESS_FACET);
  url.searchParams.append("sort[0][column]", "period");
  url.searchParams.append("sort[0][direction]", "desc");
  url.searchParams.set("length", "1");

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`EIA fetch failed for ${region} (duoarea=${duoarea}): HTTP ${res.status} ${res.statusText}`);
  }
  const json: any = await res.json();
  const row = json?.response?.data?.[0];
  if (!row || typeof row.value !== "number" || !row.period) {
    throw new Error(`EIA returned no data for ${region} (duoarea=${duoarea}); response shape unexpected`);
  }
  return { price: row.value, date: new Date(row.period) };
}

async function upsertCache(
  region: EiaRegion,
  price: number,
  indexDate: Date,
  source: "EIA_DOE" | "MANUAL",
): Promise<void> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + CACHE_DAYS);
  const fetchedAt = new Date();
  await prisma.fuelIndexCache.upsert({
    where: { region },
    create: { region, indexPrice: price, indexDate, source, fetchedAt, expiresAt },
    update: { indexPrice: price, indexDate, source, fetchedAt, expiresAt },
  });
}

/**
 * Refresh all 7 EIA regions in one sweep. Called by the weekly cron job
 * (backend/src/cron/index.ts) at Monday 22:00 UTC and by the on-demand script
 * (backend/scripts/refresh-fuel-index.ts) for manual seeding / verification.
 *
 * Honors FSC_INDEX_PROVIDER:
 *   - "manual"  : skips EIA fetch entirely, leaves cache untouched, returns
 *                 ok=true for each region with an explanatory note.
 *   - "eia"     : iterates EIA_REGIONS serially; per-region failure is logged
 *                 + reported but does NOT abort the sweep. Cached values for
 *                 failed regions are preserved.
 *
 * Returns a per-region outcome array so callers can surface a summary.
 */
export async function refreshAllRegions(): Promise<RefreshOutcome[]> {
  if (env.FSC_INDEX_PROVIDER === "manual") {
    log.info("[FuelIndex] FSC_INDEX_PROVIDER=manual — EIA fetch skipped; using cached values");
    return EIA_REGIONS.map((region) => ({
      region,
      ok: true,
      note: "manual provider — no fetch performed",
    }));
  }
  if (!env.EIA_API_KEY) {
    log.warn("[FuelIndex] EIA_API_KEY not set — fetch short-circuit, cached values preserved");
    return EIA_REGIONS.map((region) => ({
      region,
      ok: false,
      note: "EIA_API_KEY not set in environment",
    }));
  }

  const outcomes: RefreshOutcome[] = [];
  for (const region of EIA_REGIONS) {
    try {
      const { price, date } = await fetchEiaPrice(region);
      await upsertCache(region, price, date, "EIA_DOE");
      log.info(
        `[FuelIndex] ${region} (${EIA_REGION_LABELS[region]}): $${price.toFixed(3)}/gal week-ending ${date.toISOString().slice(0, 10)}`,
      );
      outcomes.push({ region, ok: true, indexPrice: price, indexDate: date });
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      log.warn(`[FuelIndex] ${region} fetch failed: ${msg} — cached value preserved`);
      outcomes.push({ region, ok: false, note: msg });
    }
  }
  return outcomes;
}
