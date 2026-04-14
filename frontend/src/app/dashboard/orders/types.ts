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

  // Freight
  mode: "FTL" | "LTL";
  equipmentType: string;
  commodity: string;
  freightClass: string;
  nmfcCode: string;
  pallets: string;
  pieces: string;
  length: string;
  width: string;
  height: string;
  weight: string;
  stackable: boolean;
  hazmat: boolean;
  temperatureControlled: boolean;
  tempMin: string;
  tempMax: string;
  tempMode: "continuous" | "cycling";
  customsRequired: boolean;
  driverMode: "solo" | "team";
  liveOrDrop: "live" | "drop";
  cargoValue: string;
  dockAssignment: string;

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
  commodity: "",
  freightClass: "",
  nmfcCode: "",
  pallets: "",
  pieces: "",
  length: "",
  width: "",
  height: "",
  weight: "",
  stackable: true,
  hazmat: false,
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
