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
