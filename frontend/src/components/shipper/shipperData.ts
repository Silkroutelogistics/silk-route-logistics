// Shipper portal data types — wired to /api/shipper-portal/* endpoints

export interface Shipment {
  id: string;
  origin: string;
  dest: string;
  status: string;
  carrier: string;
  equipment: string;
  pickDate: string;
  delDate: string;
  rate: number;
  weight: string;
  distance: string;
  eta: string;
  progress: number;
  loadId?: string;
}

export interface Invoice {
  id: string;
  shipment: string;
  amount: number;
  issued: string;
  due: string;
  status: string;
}

export interface Quote {
  id: string;
  origin: string;
  dest: string;
  equipment: string;
  rate: string;
  status: string;
  expires: string;
  distance: string;
}

// ─── API Response Types ──────────────────────────────────

export interface DashboardResponse {
  kpis: { activeShipments: number; monthSpend: number; onTimePercent: number; openQuotes: number };
  recentShipments: Shipment[];
  spendTrend: { month: string; spend: number }[];
  openQuotes: Quote[];
}

export interface ShipmentsResponse {
  shipments: Shipment[];
  total: number;
  totalPages: number;
}

export interface InvoicesResponse {
  invoices: Invoice[];
  total: number;
  totalPages: number;
  billing: { outstandingBalance: number; unpaidCount: number; ytdBilled: number; avgPaymentCycleDays: number };
}

export interface AnalyticsResponse {
  metrics: { totalShipments: number; avgCostPerMile: number; avgTransitDays: number };
  spendByMonth: number[];
  onTimeByMonth: number[];
  months: string[];
  topLanes: { lane: string; spend: number; loads: number; pct: number }[];
  carrierScorecard: { name: string; otd: number; score: string; loads: number }[];
}

export interface TrackingShipment extends Shipment {
  checkCalls: { status: string; city: string; state: string; timestamp: string; method: string }[];
  eldPosition: { lat: number; lng: number; speed: number; address: string } | null;
  riskLevel: string;
}

export interface TrackingResponse {
  shipments: TrackingShipment[];
}

export interface DocumentsResponse {
  typeCounts: { type: string; count: number }[];
  documents: { id: string; name: string; type: string; shipment: string; date: string; size: number; url: string }[];
}
