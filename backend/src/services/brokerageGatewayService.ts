/**
 * Brokerage Gateway — Unified integration with major freight brokerages.
 * Aggregates load search, posting, rate quotes, and tracking across providers.
 * Placeholder implementations return structured data for future API integration.
 */

// ─── Shared Types ─────────────────────────────────────────────────
export interface LoadFilters {
  origin?: string; destination?: string; equipment?: string;
  maxWeight?: number; pickupDateFrom?: string; pickupDateTo?: string; radius?: number;
}

export interface LoadData {
  origin: { city: string; state: string; zip: string };
  destination: { city: string; state: string; zip: string };
  equipment: string; weight: number;
  pickupDate: string; deliveryDate: string; rate?: number; notes?: string;
}

export interface BrokerageLoad {
  provider: string; externalId: string; origin: string; destination: string;
  equipment: string; weight: number | null; rate: number | null;
  pickupDate: string; deliveryDate: string | null; distance: number | null; postedAt: string;
}

export interface RateQuote {
  provider: string; origin: string; destination: string; equipment: string;
  lowRate: number; avgRate: number; highRate: number; currency: string; validUntil: string;
}

export interface CarrierStatusResult {
  provider: string; carrierId: string; status: string; approved: boolean; notes: string | null;
}

export interface TrackingUpdate {
  provider: string; loadId: string; status: string;
  location: string | null; timestamp: string; eta: string | null;
}

export interface PostLoadResult {
  provider: string; success: boolean; externalId: string | null; message: string;
}

// ─── Provider Base + Factory ──────────────────────────────────────
const warnedProviders = new Set<string>();

interface ProviderConfig {
  name: string; baseUrl: string; envKeys: string[];
  prefix: string; rateRange: [number, number, number]; // low, avg, high
}

class BrokerageProvider {
  constructor(private cfg: ProviderConfig) {}
  get name() { return this.cfg.name; }

  isConfigured(): boolean {
    const missing = this.cfg.envKeys.filter((k) => !process.env[k]);
    if (missing.length > 0) {
      if (!warnedProviders.has(this.cfg.name)) {
        console.warn(`[BrokerageGateway] ${this.cfg.name}: missing env vars ${missing.join(", ")} — skipping`);
        warnedProviders.add(this.cfg.name);
      }
      return false;
    }
    return true;
  }

  // TODO: Replace placeholder implementations with real API calls
  async getAvailableLoads(filters: LoadFilters): Promise<BrokerageLoad[]> {
    if (!this.isConfigured()) return [];
    return [{
      provider: this.cfg.name, externalId: `${this.cfg.prefix}-PLACEHOLDER`,
      origin: filters.origin || "", destination: filters.destination || "",
      equipment: filters.equipment || "VAN", weight: null, rate: null,
      pickupDate: filters.pickupDateFrom || "", deliveryDate: null,
      distance: null, postedAt: new Date().toISOString(),
    }];
  }

  async postLoad(_loadData: LoadData): Promise<PostLoadResult> {
    if (!this.isConfigured()) return { provider: this.cfg.name, success: false, externalId: null, message: "Not configured" };
    return { provider: this.cfg.name, success: true, externalId: `${this.cfg.prefix}-${Date.now()}`, message: "Load posted (placeholder)" };
  }

  async getRate(origin: string, destination: string, equipment: string): Promise<RateQuote | null> {
    if (!this.isConfigured()) return null;
    const [low, avg, high] = this.cfg.rateRange;
    return { provider: this.cfg.name, origin, destination, equipment, lowRate: low, avgRate: avg, highRate: high, currency: "USD", validUntil: new Date(Date.now() + 86400000).toISOString() };
  }

  async getCarrierStatus(carrierId: string): Promise<CarrierStatusResult | null> {
    if (!this.isConfigured()) return null;
    return { provider: this.cfg.name, carrierId, status: "ACTIVE", approved: true, notes: null };
  }

  async trackShipment(loadId: string): Promise<TrackingUpdate | null> {
    if (!this.isConfigured()) return null;
    return { provider: this.cfg.name, loadId, status: "IN_TRANSIT", location: null, timestamp: new Date().toISOString(), eta: null };
  }
}

// ─── Provider Registry ───────────────────────────────────────────
const PROVIDER_CONFIGS: ProviderConfig[] = [
  { name: "DAT", baseUrl: "https://freight.dat.com/api/v2", envKeys: ["DAT_API_KEY", "DAT_API_SECRET"], prefix: "DAT", rateRange: [1.85, 2.25, 2.75] },
  { name: "Truckstop", baseUrl: "https://api.truckstop.com/v2", envKeys: ["TRUCKSTOP_API_KEY"], prefix: "TS", rateRange: [1.80, 2.20, 2.65] },
  { name: "CHRobinson", baseUrl: "https://api.chrobinson.com/v1", envKeys: ["CHROBINSON_API_KEY"], prefix: "CHR", rateRange: [1.90, 2.30, 2.80] },
  { name: "Echo", baseUrl: "https://api.echo.com/v2", envKeys: ["ECHO_API_KEY"], prefix: "ECHO", rateRange: [1.75, 2.15, 2.60] },
  { name: "UberFreight", baseUrl: "https://api.uberfreight.com/v1", envKeys: ["UBER_FREIGHT_API_KEY"], prefix: "UF", rateRange: [1.88, 2.28, 2.70] },
  { name: "Project44", baseUrl: "https://api.project44.com/v4", envKeys: ["PROJECT44_API_KEY"], prefix: "P44", rateRange: [1.82, 2.22, 2.68] },
];

export type ProviderName = "DAT" | "Truckstop" | "CHRobinson" | "Echo" | "UberFreight" | "Project44";

const providers: Record<string, BrokerageProvider> = {};
for (const cfg of PROVIDER_CONFIGS) {
  providers[cfg.name] = new BrokerageProvider(cfg);
}

// ─── BrokerageGateway — Unified Aggregator ───────────────────────
export class BrokerageGateway {
  /** Search loads across multiple providers in parallel */
  async searchLoads(providerNames: ProviderName[], filters: LoadFilters): Promise<BrokerageLoad[]> {
    const results = await Promise.allSettled(
      providerNames.map((n) => providers[n]?.getAvailableLoads(filters) ?? Promise.resolve([]))
    );
    return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  }

  /** Post a load to multiple providers in parallel */
  async postLoad(providerNames: ProviderName[], loadData: LoadData): Promise<PostLoadResult[]> {
    const results = await Promise.allSettled(
      providerNames.map((n) => providers[n]?.postLoad(loadData) ?? Promise.resolve({ provider: n, success: false, externalId: null, message: "Unknown provider" }))
    );
    return results.map((r) => r.status === "fulfilled" ? r.value : { provider: "unknown", success: false, externalId: null, message: String((r as PromiseRejectedResult).reason) });
  }

  /** Get rate quotes from multiple providers in parallel */
  async getRates(providerNames: ProviderName[], origin: string, destination: string, equipment: string): Promise<RateQuote[]> {
    const results = await Promise.allSettled(
      providerNames.map((n) => providers[n]?.getRate(origin, destination, equipment) ?? Promise.resolve(null))
    );
    return results
      .filter((r): r is PromiseFulfilledResult<RateQuote | null> => r.status === "fulfilled" && r.value !== null)
      .map((r) => r.value!);
  }
}

export const brokerageGateway = new BrokerageGateway();
