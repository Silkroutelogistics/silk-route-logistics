/**
 * NMFC commodity catalog — Phase B (v3.8.yy).
 *
 * Hand-curated entries scoped to SRL's COLDCHAIN + WELLNESS verticals
 * (per §18.7). Each entry maps a description-substring alias to a freight
 * class. The lookup is consumed by getAutoSuggestedClass in ./types.ts and
 * takes precedence over the density formula for fixed-class entries.
 *
 * Scope of v3.8.yy ship (per docs/audits/nmfc-catalog-scope-2026-05-05.md
 * Option 1):
 *   - freightClass populated where defensible from public LTL guidance + class-density
 *     reasoning. Each entry has an inline `basis` comment citing the rationale.
 *   - nmfcCode left null. NMFC item numbers are NMFTA's proprietary identifiers
 *     that require authoritative verification (NMFTA ClassIT subscription, NMFTA
 *     free-trial sweep, or carrier rate-sheet cross-reference) before they go on
 *     real BOLs. The class is what affects pricing; the NMFC# is documentary.
 *     The AE can fill nmfcCode manually from carrier rate sheets / ops research.
 *   - Catalog density-variable entries (freightClass = null) fall through to the
 *     density formula in getAutoSuggestedClass. Used when NMFC marks a commodity
 *     as density-variable (frozen prepared meals, dairy NOI, frozen seafood) —
 *     density is the right answer per NMFC's own treatment.
 *
 * Order matters: findCatalogEntry returns the FIRST entry with a matching alias.
 * More-specific entries (hazmat, fragility-driven) come first; broad NOI entries
 * come last so they only match when nothing else does.
 */

export interface NmfcEntry {
  /** Canonical key — internal identifier, no UI exposure. */
  commodityKey: string;
  /** Lowercase substrings to match against the description input. First-hit wins. */
  aliases: string[];
  /**
   * Assigned freight class. `null` means density-variable per NMFC; the lookup
   * falls through to the density formula in that case.
   */
  freightClass: string | null;
  /**
   * NMFC item number. Intentionally null in v3.8.yy — populated only after
   * authoritative verification per scope doc 2026-05-05.
   */
  nmfcCode: string | null;
  /**
   * Inline rationale for the class assignment. Not displayed in the UI;
   * documentary so future review can audit each entry's basis.
   */
  basis: string;
}

export const NMFC_CATALOG: NmfcEntry[] = [
  // ─── Hazmat-driven (override commodity class with hazmat handling) ───
  {
    commodityKey: "aerosol-personal-care",
    aliases: ["aerosol", "hairspray", "dry shampoo", "deodorant spray", "spray sunscreen"],
    freightClass: "100",
    nmfcCode: null,
    basis: "Aerosol personal care = DOT hazmat (compressed gas + flammable propellant). Class 100 with hazmat surcharge per typical LTL treatment.",
  },
  {
    commodityKey: "lithium-battery-device",
    aliases: ["lithium battery", "rechargeable beauty", "electric facial", "ipl device", "led wand"],
    freightClass: "92.5",
    nmfcCode: null,
    basis: "Lithium-battery beauty devices = DOT hazmat under UN3481/UN3091. Class 92.5 with hazmat handling per IATA/DOT shipping rules.",
  },

  // ─── High-fragility / high-value (class-bumped above raw density) ───
  {
    commodityKey: "fragrance",
    aliases: ["perfume", "cologne", "fragrance", "eau de"],
    freightClass: "100",
    nmfcCode: null,
    basis: "Glass-packed fragrance: high-value + fragility + small-format cases. Class 100 typical across LTL rate sheets.",
  },
  {
    commodityKey: "color-cosmetics",
    aliases: ["lipstick", "mascara", "eyeshadow", "color cosmetics", "makeup palette"],
    freightClass: "100",
    nmfcCode: null,
    basis: "Color cosmetics: small-package + high-value + frequent glass/mirror componentry. Class 100 typical.",
  },
  {
    commodityKey: "baby-food-refrigerated",
    aliases: ["baby food", "infant food"],
    freightClass: "70",
    nmfcCode: null,
    basis: "Refrigerated/glass-jar baby food (Little Spoon shape). Class 70 driven by fragility + retailer DC damage rate, not raw density.",
  },
  {
    commodityKey: "premium-beverage-glass",
    aliases: ["kombucha", "cold-press juice", "cold press juice", "premium juice", "glass beverage"],
    freightClass: "77.5",
    nmfcCode: null,
    basis: "Glass-packed premium beverages (kombucha, cold-press juice). Class 77.5 driven by glass fragility + small-format cases. Density alone would say 50–55 — bumped for handling.",
  },

  // ─── Refrigerated specific (class-bumped for cold-chain + handling) ───
  {
    commodityKey: "yogurt-refrigerated",
    aliases: ["yogurt", "yoghurt"],
    freightClass: "70",
    nmfcCode: null,
    basis: "Refrigerated yogurt in plastic/glass containers. Class 70 typical — fragility + retailer DC damage rate (Sephora/Walmart/Kroger chargebacks). Density alone would say 50.",
  },
  {
    commodityKey: "pharma-refrigerated",
    aliases: ["pharmaceutical", "rx product", "prescription medication", "biologic"],
    freightClass: "77.5",
    nmfcCode: null,
    basis: "Refrigerated pharmaceuticals: high-value + cold-chain + special handling (chain-of-custody, temperature logger requirements). Class 77.5 typical.",
  },

  // ─── Wellness mid-tier (typical class for personal-care commodity NOI) ───
  {
    commodityKey: "skincare",
    aliases: ["skincare", "skin care", "moisturizer", "facial serum", "face serum", "body lotion", "facial cream"],
    freightClass: "85",
    nmfcCode: null,
    basis: "Skincare creams/serums in plastic or glass containers. Class 85 mid-tier per LTL educational materials — covers most clean-beauty SKUs that aren't fragrance/color cosmetics.",
  },
  {
    commodityKey: "supplements",
    aliases: ["supplement", "vitamin", "capsule", "protein powder", "wellness powder"],
    freightClass: "70",
    nmfcCode: null,
    basis: "Dietary supplements (capsules, powders, gummies). Class 70 typical — moderate density + standard handling.",
  },
  {
    commodityKey: "cosmetics-noi",
    aliases: ["cosmetics", "personal care", "beauty product"],
    freightClass: "70",
    nmfcCode: null,
    basis: "Cosmetics NOI catch-all. Class 70 typical baseline; specific overrides (color cosmetics, fragrance, skincare) handled by entries above.",
  },

  // ─── Density-variable per NMFC (fall through to density formula) ───
  {
    commodityKey: "frozen-prepared-meals",
    aliases: ["frozen meal", "frozen prepared", "frozen entree", "frozen dinner"],
    freightClass: null,
    nmfcCode: null,
    basis: "Frozen prepared meals — density-variable per NMFC's own treatment. Density formula gives the right class because frozen entrees range widely (light frozen pizza to dense lasagna).",
  },
  {
    commodityKey: "dairy-refrigerated-noi",
    aliases: ["refrigerated dairy", "milk", "cream", "cheese"],
    freightClass: null,
    nmfcCode: null,
    basis: "Refrigerated dairy NOI — density-variable per NMFC. Specific products that diverge (yogurt, baby food) handled above; density formula handles the rest.",
  },
  {
    commodityKey: "frozen-seafood",
    aliases: ["frozen seafood", "frozen fish", "frozen shrimp"],
    freightClass: null,
    nmfcCode: null,
    basis: "Frozen seafood — density-variable per typical NMFC treatment. Density spans whitefish (lighter) to shrimp (denser).",
  },
];

/**
 * Substring-match lookup. Returns the first NmfcEntry whose any-alias is a
 * substring of the (lowercased) description. Returns null if no match.
 *
 * Order-sensitive: catalog entries are listed most-specific first. The first
 * match wins.
 */
export function findCatalogEntry(description: string): NmfcEntry | null {
  const q = description.trim().toLowerCase();
  if (!q) return null;
  for (const entry of NMFC_CATALOG) {
    for (const alias of entry.aliases) {
      if (q.includes(alias)) return entry;
    }
  }
  return null;
}
