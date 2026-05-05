/**
 * PackageType — mirrors the Prisma enum added in v3.8.a (backend schema).
 * Frontend carries a literal union rather than importing @prisma/client to
 * keep this bundle tree-shake-friendly. Must stay in sync with
 * `backend/prisma/schema.prisma` enum PackageType.
 */
export type PackageType =
  | "PLT"
  | "SKID"
  | "CTN"
  | "BOX"
  | "DRUM"
  | "BALE"
  | "BUNDLE"
  | "CRATE"
  | "ROLL"
  | "OTHER";

export const PACKAGE_TYPE_OPTIONS: ReadonlyArray<{ value: PackageType; label: string }> = [
  { value: "PLT", label: "PLT — Pallet" },
  { value: "SKID", label: "SKID — Skid" },
  { value: "CTN", label: "CTN — Carton" },
  { value: "BOX", label: "BOX — Box" },
  { value: "DRUM", label: "DRUM — Drum" },
  { value: "BALE", label: "BALE — Bale" },
  { value: "BUNDLE", label: "BUNDLE — Bundle" },
  { value: "CRATE", label: "CRATE — Crate" },
  { value: "ROLL", label: "ROLL — Roll" },
  { value: "OTHER", label: "OTHER — Other" },
];

/**
 * LineItemFormData — per-row state for the Order Builder's LineItemsSection.
 * Numeric inputs carry `string` for the same reason every other numeric
 * OrderForm field does: raw input capture, parse to number at submit.
 * Maps 1:1 to backend LoadLineItem on submit (with numeric coercion + null
 * substitution for empty strings).
 */
export interface LineItemFormData {
  pieces: string;
  packageType: PackageType;
  description: string;
  weight: string;
  dimensionsLength: string;
  dimensionsWidth: string;
  dimensionsHeight: string;
  freightClass: string;
  nmfcCode: string;
  hazmat: boolean;
  hazmatUnNumber: string;
  hazmatClass: string;
  hazmatEmergencyContact: string;
  hazmatPlacardRequired: boolean;
  stackable: boolean;
  turnable: boolean;
  // v3.8.xx — class-source provenance. UI-only state; never serialized to
  // the backend. "ae" = manually picked from dropdown (locked, no
  // auto-overrides). "auto" = filled by auto-suggest (eligible for upgrade
  // when better signal arrives — e.g. keyword set first, density upgrades
  // later). null = never been set / cleared (eligible for auto-suggest).
  _classSource?: "ae" | "auto" | null;
}

export const emptyLineItem = (): LineItemFormData => ({
  pieces: "",
  packageType: "PLT",
  description: "",
  weight: "",
  dimensionsLength: "",
  dimensionsWidth: "",
  dimensionsHeight: "",
  freightClass: "",
  nmfcCode: "",
  hazmat: false,
  hazmatUnNumber: "",
  hazmatClass: "",
  hazmatEmergencyContact: "",
  hazmatPlacardRequired: false,
  stackable: true,
  turnable: true,
  _classSource: null,
});

export type DispatchMethod = "waterfall" | "loadboard" | "direct_tender" | "dat";
export type WaterfallMode = "manual" | "semi_auto" | "full_auto";
export type ShipmentPriority = "standard" | "hot";
export type CheckCallProtocol = "standard" | "expedited";
export type FuelSurchargeType = "included" | "separate";

export interface Accessorial {
  type: string;      // Detention | Lumper | TONU | Layover | Reweigh | Driver assist | Other
  amount: number;
  payer: "Customer" | "Carrier" | "SRL";
}

export interface OrderForm {
  // Customer
  customerId: string;

  // Origin
  originFacilityId: string;
  originCompany: string;
  originAddress: string;
  originCity: string;
  originState: string;
  originZip: string;
  originContactName: string;
  originContactPhone: string;
  originDockInfo: string;
  originLoadType: "live" | "drop";
  originLat: number | null;
  originLng: number | null;

  // Destination
  destFacilityId: string;
  destCompany: string;
  destAddress: string;
  destCity: string;
  destState: string;
  destZip: string;
  destContactName: string;
  destContactPhone: string;
  destDockInfo: string;
  destLoadType: "live" | "drop";
  destLat: number | null;
  destLng: number | null;

  // Dates
  pickupDate: string;
  deliveryDate: string;
  pickupTimeStart: string;
  pickupTimeEnd: string;
  deliveryTimeStart: string;
  deliveryTimeEnd: string;

  // Refs
  bolNumber: string;
  appointmentNumber: string;
  poNumbers: string[];
  distance: string;
  lumperEstimate: string;

  // Freight — load-level fields only. Per-line details (commodity,
  // pieces, weight, dimensions, freight class, NMFC, hazmat, stackable,
  // turnable) moved to `lineItems` in v3.8.c.
  mode: "FTL" | "LTL";
  equipmentType: string;
  temperatureControlled: boolean;
  tempMin: string;
  tempMax: string;
  tempMode: "continuous" | "cycling";
  customsRequired: boolean;
  driverMode: "solo" | "team";
  liveOrDrop: "live" | "drop";
  cargoValue: string;
  dockAssignment: string;

  // Shipment line items (v3.8.c). One-to-many commodity breakdown;
  // maps 1:1 to LoadLineItem on submit. Always contains ≥ 1 row.
  lineItems: LineItemFormData[];

  // Pricing
  customerRate: string;
  targetCost: string;
  fuelSurchargeType: FuelSurchargeType;
  fuelSurchargeAmount: string;
  accessorials: Accessorial[];

  // Instructions
  specialInstructions: string;
  driverInstructions: string;
  internalNotes: string;

  // Dispatch
  dispatchMethod: DispatchMethod;
  waterfallMode: WaterfallMode;
  directTenderCarrierId: string;
  shipmentPriority: ShipmentPriority;
  checkCallProtocol: CheckCallProtocol;
  trackingLinkAutoSend: boolean;
}

export const emptyOrderForm = (): OrderForm => ({
  customerId: "",
  originFacilityId: "",
  originCompany: "",
  originAddress: "",
  originCity: "",
  originState: "",
  originZip: "",
  originContactName: "",
  originContactPhone: "",
  originDockInfo: "",
  originLoadType: "live",
  originLat: null,
  originLng: null,
  destFacilityId: "",
  destCompany: "",
  destAddress: "",
  destCity: "",
  destState: "",
  destZip: "",
  destContactName: "",
  destContactPhone: "",
  destDockInfo: "",
  destLoadType: "live",
  destLat: null,
  destLng: null,
  pickupDate: "",
  deliveryDate: "",
  pickupTimeStart: "",
  pickupTimeEnd: "",
  deliveryTimeStart: "",
  deliveryTimeEnd: "",
  bolNumber: "",
  appointmentNumber: "",
  poNumbers: [],
  distance: "",
  lumperEstimate: "",
  mode: "FTL",
  equipmentType: "Dry Van 53'",
  lineItems: [emptyLineItem()],
  temperatureControlled: false,
  tempMin: "",
  tempMax: "",
  tempMode: "continuous",
  customsRequired: false,
  driverMode: "solo",
  liveOrDrop: "live",
  cargoValue: "",
  dockAssignment: "",
  customerRate: "",
  targetCost: "",
  fuelSurchargeType: "included",
  fuelSurchargeAmount: "",
  accessorials: [],
  specialInstructions: "",
  driverInstructions: "",
  internalNotes: "",
  dispatchMethod: "waterfall",
  waterfallMode: "full_auto",
  directTenderCarrierId: "",
  shipmentPriority: "standard",
  checkCallProtocol: "standard",
  trackingLinkAutoSend: true,
});

export const EQUIPMENT_OPTIONS = [
  "Dry Van 53'",
  "Reefer 53'",
  "Flatbed 48'",
  "Step Deck",
  "LTL",
];

export const FREIGHT_CLASSES = [
  "50", "55", "60", "65", "70", "77.5", "85", "92.5",
  "100", "110", "125", "150", "175", "200", "250", "300", "400", "500",
];

/**
 * Commodity → freight class heuristic. Order Builder auto-suggests a
 * class when the user types a commodity name. Lookup is substring-match
 * (first key that appears in the commodity string wins). AE can always
 * override via the class dropdown.
 */
export const COMMODITY_CLASS_MAP: Record<string, string> = {
  "auto parts":  "70",
  "automotive":  "70",
  "car parts":   "70",
  "electronics": "70",
  "computers":   "70",
  "technology":  "70",
  "furniture":   "100",
  "household":   "100",
  "home goods":  "100",
  "machinery":   "85",
  "equipment":   "85",
  "food":        "55",
  "produce":     "55",
  "beverage":    "55",
  "clothing":    "65",
  "apparel":     "65",
  "textile":     "65",
  "paper":       "50",
  "cardboard":   "50",
  "steel":       "50",
  "metal":       "50",
  "plastic":     "77.5",
  "chemical":    "85",
  "building":    "77.5",
  "lumber":      "55",
};

export function suggestFreightClass(commodity: string): string | null {
  const q = commodity.trim().toLowerCase();
  if (!q) return null;
  for (const [keyword, cls] of Object.entries(COMMODITY_CLASS_MAP)) {
    if (q.includes(keyword)) return cls;
  }
  return null;
}

/**
 * Density-based freight-class suggestion (v3.8.ww).
 *
 * Public NMFC density table (lb/cu ft → class). When dimensions and
 * weight are all known, density is more accurate than keyword matching
 * and should be preferred. Returns null if any input is missing or
 * non-positive.
 *
 * Phase B (NMFC commodity catalog with NMFC# overrides for the 20% of
 * cases where density and assigned class diverge — e.g. fragile, hazmat,
 * high-value items where stowability/liability factors override raw
 * density) is scoped separately under docs/audits/nmfc-catalog-scope-
 * 2026-05-05.md and not implemented here.
 *
 * Volume conversion: L/W/H are in inches; 1 cu ft = 1728 cu in.
 */
export function suggestFreightClassByDensity(
  lengthIn: number,
  widthIn: number,
  heightIn: number,
  weightLb: number,
): string | null {
  if (
    !Number.isFinite(lengthIn) || lengthIn <= 0 ||
    !Number.isFinite(widthIn)  || widthIn  <= 0 ||
    !Number.isFinite(heightIn) || heightIn <= 0 ||
    !Number.isFinite(weightLb) || weightLb <= 0
  ) {
    return null;
  }
  const cubicFeet = (lengthIn * widthIn * heightIn) / 1728;
  if (cubicFeet <= 0) return null;
  const density = weightLb / cubicFeet;

  if (density >= 50)   return "50";
  if (density >= 35)   return "55";
  if (density >= 30)   return "60";
  if (density >= 22.5) return "65";
  if (density >= 15)   return "70";
  if (density >= 13.5) return "77.5";
  if (density >= 12)   return "85";
  if (density >= 10.5) return "92.5";
  if (density >= 9)    return "100";
  if (density >= 8)    return "110";
  if (density >= 7)    return "125";
  if (density >= 6)    return "150";
  if (density >= 5)    return "175";
  if (density >= 4)    return "200";
  if (density >= 3)    return "250";
  if (density >= 2)    return "300";
  if (density >= 1)    return "400";
  return "500";
}

// v3.8.yy — NMFC commodity catalog import (Phase B). Catalog entries take
// precedence over density when they declare a fixed class — the catalog is
// where commodity-specific overrides live (handling/fragility/value-driven
// classes that diverge from raw density). Density-variable catalog entries
// fall through to the density formula.
import { findCatalogEntry } from "./nmfcCatalog";

/**
 * Combined auto-suggest with three-tier priority chain:
 *   1. NMFC catalog match with a fixed class → return that class. This is
 *      the v3.8.yy override path: catalog entries are commodity-specific
 *      and capture handling/fragility/value factors that density misses.
 *   2. Density formula when L/W/H/weight all populate. Used when the
 *      catalog has no entry, or when the catalog entry is density-variable.
 *   3. Keyword fallback (legacy COMMODITY_CLASS_MAP) when there's no
 *      catalog match AND density can't compute. If the catalog DID match
 *      (density-variable) but density signal is missing, return null
 *      rather than falling to keyword — catalog is more specific than
 *      keyword and a partial catalog hit shouldn't get keyword-stomped.
 */
export function getAutoSuggestedClass(item: {
  description: string;
  weight: string;
  dimensionsLength: string;
  dimensionsWidth: string;
  dimensionsHeight: string;
}): string | null {
  // 1. NMFC catalog
  const catalog = findCatalogEntry(item.description);
  if (catalog?.freightClass) return catalog.freightClass;

  // 2. Density
  const L = parseFloat(item.dimensionsLength);
  const W = parseFloat(item.dimensionsWidth);
  const H = parseFloat(item.dimensionsHeight);
  const wt = parseFloat(item.weight);
  const byDensity = suggestFreightClassByDensity(L, W, H, wt);
  if (byDensity) return byDensity;

  // 3. Keyword fallback only when catalog had NO match. Density-variable
  // catalog hit + missing density signal → return null (don't downgrade to
  // a less-specific keyword answer).
  if (catalog) return null;
  return suggestFreightClass(item.description);
}
