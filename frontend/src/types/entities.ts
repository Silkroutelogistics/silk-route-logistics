/**
 * Shared entity types for SRL frontend.
 * Single source of truth — import from "@/types/entities" instead of redefining per-page.
 */

// ─── Load ───────────────────────────────────────────────

export type LoadStatus =
  | "DRAFT" | "PLANNED" | "POSTED" | "TENDERED" | "CONFIRMED"
  | "BOOKED" | "DISPATCHED" | "AT_PICKUP" | "LOADED" | "PICKED_UP"
  | "IN_TRANSIT" | "AT_DELIVERY" | "DELIVERED" | "POD_RECEIVED"
  | "INVOICED" | "COMPLETED" | "TONU" | "CANCELLED";

export interface Load {
  id: string;
  referenceNumber: string;
  status: LoadStatus | string;
  originCity: string;
  originState: string;
  originZip?: string;
  originAddress?: string;
  destCity: string;
  destState: string;
  destZip?: string;
  destAddress?: string;
  weight: number | null;
  equipmentType: string;
  commodity: string | null;
  rate: number;
  customerRate?: number;
  carrierRate?: number;
  distance: number | null;
  pickupDate: string;
  deliveryDate?: string;
  createdAt: string;
  pieces?: number;
  specialInstructions?: string;
  poster?: PersonRef | null;
  carrier?: PersonRef | null;
  customerId?: string;
  driverId?: string;
  invoiceId?: string | null;
}

// ─── Tender ─────────────────────────────────────────────

export type TenderStatus = "OFFERED" | "ACCEPTED" | "COUNTERED" | "DECLINED" | "EXPIRED";

export interface LoadTender {
  id: string;
  loadId: string;
  carrierId: string;
  status: TenderStatus | string;
  offeredRate: number;
  counterRate: number | null;
  expiresAt: string;
  respondedAt: string | null;
  createdAt: string;
  carrier?: { companyName: string; user?: PersonRef };
}

// ─── Carrier ────────────────────────────────────────────

export interface CarrierProfile {
  id: string;
  userId: string;
  companyName: string;
  mcNumber: string | null;
  dotNumber: string | null;
  equipmentTypes: string[];
  serviceRegions: string[];
  operatingRegions: string[];
  status: string;
  onboardingStatus: string;
  activeLoads?: number;
  score?: number;
  user?: PersonRef & { email?: string };
}

// ─── Invoice ────────────────────────────────────────────

export type InvoiceStatus = "DRAFT" | "SUBMITTED" | "SENT" | "UNDER_REVIEW" | "APPROVED" | "FUNDED" | "PAID";

export interface Invoice {
  id: string;
  invoiceNumber: string;
  loadId: string;
  amount: number;
  status: InvoiceStatus | string;
  dueDate: string | null;
  paidDate: string | null;
  createdAt: string;
  load?: Pick<Load, "referenceNumber" | "originCity" | "originState" | "destCity" | "destState">;
}

// ─── User ───────────────────────────────────────────────

export type UserRole = "ADMIN" | "CEO" | "BROKER" | "DISPATCH" | "OPERATIONS" | "AE" | "CARRIER" | "SHIPPER";

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole | string;
  company: string | null;
  phone: string | null;
  isActive: boolean;
}

// ─── Notification ───────────────────────────────────────

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  actionUrl?: string;
  readAt: string | null;
  createdAt: string;
}

// ─── Shared ─────────────────────────────────────────────

export interface PersonRef {
  id?: string;
  firstName: string;
  lastName: string;
  company: string | null;
  phone?: string;
}

// ─── API Response Wrappers ──────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

export interface LoadsResponse {
  loads: Load[];
  total: number;
  totalPages: number;
}

export interface CarriersResponse {
  carriers: CarrierProfile[];
  total: number;
}
