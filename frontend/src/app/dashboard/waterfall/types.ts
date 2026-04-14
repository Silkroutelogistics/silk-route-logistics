export type BoardTab = "pending" | "active" | "dispatched" | "exhausted";

export type AutomationMode = "manual" | "semi_auto" | "full_auto";

export interface BoardSummary {
  pending: number;
  activeWaterfalls: number;
  dispatchedToday: number;
  exhausted: number;
  acceptanceRate: number | null;
}

export interface BoardPosition {
  id: string;
  position: number;
  status: "queued" | "tendered" | "accepted" | "declined" | "expired" | "skipped";
  carrierId: string | null;
  matchScore: string | number | null;
  offeredRate: string | number | null;
  tenderExpiresAt: string | null;
  isFallback: boolean;
}

export interface BoardLoad {
  id: string;
  loadNumber: string | null;
  referenceNumber: string;
  status: string;
  visibility: string;
  dispatchMethod: string | null;
  waterfallMode: string | null;
  originCity: string | null;
  originState: string | null;
  destCity: string | null;
  destState: string | null;
  equipmentType: string;
  pickupDate: string;
  deliveryDate: string;
  customerRate: number | null;
  carrierRate: number | null;
  rate: number;
  dispatchedAt: string | null;
  customer: { id: string; name: string } | null;
  waterfalls: {
    id: string;
    status: string;
    mode: string;
    currentPosition: number;
    totalPositions: number;
    positions: BoardPosition[];
  }[];
}

export interface BoardResponse {
  loads: BoardLoad[];
  total: number;
}

export const MODE_LABELS: Record<AutomationMode, string> = {
  manual: "Manual",
  semi_auto: "Semi-auto",
  full_auto: "Full auto",
};
