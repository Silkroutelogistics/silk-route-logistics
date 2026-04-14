export type BoardTab =
  | "needs_attention"
  | "tendered"
  | "active"
  | "delivered"
  | "closed";

export type QuickFilter =
  | "all"
  | "calls_due"
  | "at_risk"
  | "exceptions"
  | "gps_stale"
  | "awaiting_pod";

export type ProgressState = "complete" | "active" | "pending" | "exception";

export interface BoardLoad {
  id: string;
  loadNumber: string | null;
  referenceNumber: string;
  status: string;
  stripe: "amber" | "red" | "purple" | "gray";
  progress: {
    booked: ProgressState;
    pickedUp: ProgressState;
    inTransit: ProgressState;
    delivered: ProgressState;
  };
  shipper: string | null;
  origin: { city: string | null; state: string | null; facility?: string | null };
  destination: { city: string | null; state: string | null; facility?: string | null };
  carrier: { id: string; name: string } | null;
  equipmentType: string;
  eta: string | null;
  pickupDate: string;
  deliveryDate: string;
  gpsStatus: "live" | "stale" | "none";
  callsDue: boolean;
  hasOpenException: boolean;
  openExceptionCount: number;
  awaitingPod: boolean;
  alertLevel: "GREEN" | "YELLOW" | "RED" | "CRITICAL";
  paperworkGates: {
    podVerified: boolean;
    customerInvoiced: boolean;
    carrierSettled: boolean;
  };
}

export interface BoardResponse {
  loads: BoardLoad[];
  total: number;
  counts: {
    all: number;
    callsDue: number;
    atRisk: number;
    exceptions: number;
    gpsStale: number;
    awaitingPod: number;
  };
}

export interface BoardSummary {
  active: number;
  onTime: number;
  atRisk: number;
  exceptions: number;
  checkCallsDue: number;
}

export const REGIONS = [
  "Northeast", "Southeast", "Midwest", "Great Lakes", "Southwest",
  "West Coast", "Upper Midwest", "Central Canada", "Eastern Canada",
] as const;

export const EQUIPMENT_TYPES = [
  "Dry Van", "Reefer", "Flatbed", "Step Deck", "LTL",
] as const;

export const STRIPE_COLORS: Record<BoardLoad["stripe"], string> = {
  amber: "bg-amber-500",
  red: "bg-red-500",
  purple: "bg-purple-500",
  gray: "bg-gray-400",
};

export const STRIPE_LEGEND: { label: string; color: string }[] = [
  { label: "Reefer", color: "bg-amber-500" },
  { label: "Expedited", color: "bg-red-500" },
  { label: "LTL", color: "bg-purple-500" },
  { label: "Dry Van", color: "bg-gray-400" },
];
