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
  actualDeliveryDate?: string;
  createdAt: string;
  pieces?: number;
  specialInstructions?: string;
  poster?: PersonRef | null;
  carrier?: PersonRef | null;
  customerId?: string;
  carrierId?: string | null;
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
  createdAt?: string;
  insuranceExpiry?: string;
  activeLoads?: number;
  score?: number;
  user?: PersonRef & { email?: string };
}

// ─── Invoice ────────────────────────────────────────────

export type InvoiceStatus = "DRAFT" | "SUBMITTED" | "SENT" | "UNDER_REVIEW" | "APPROVED" | "FUNDED" | "PAID";

export interface Invoice {
  id: string;
  invoiceNumber: string;
  loadId?: string;
  amount: number;
  totalAmount?: number;
  status: InvoiceStatus | string;
  dueDate?: string | null;
  paidDate?: string | null;
  paidAt?: string | null;
  createdAt: string;
  advanceAmount?: number | null;
  advanceRate?: number | null;
  factoringFee?: number | null;
  lineHaulAmount?: number | null;
  fuelSurchargeAmount?: number | null;
  accessorialsAmount?: number | null;
  paidAmount?: number | null;
  load?: Pick<Load, "referenceNumber" | "originCity" | "originState" | "destCity" | "destState"> & {
    customer?: { id: string; name: string } | null;
  };
  user?: PersonRef & { id?: string };
  lineItems?: { id: string; description: string; quantity: number; rate: number; amount: number; type: string }[];
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
  totpEnabled?: boolean;
  lastLogin?: string | null;
  createdAt?: string;
  carrierProfile?: { safetyScore: number | null };
  _count?: { loadsPosted: number };
}

// ─── Notification ───────────────────────────────────────

export interface Notification {
  id: string;
  type?: string;
  title: string;
  message: string;
  actionUrl?: string;
  read?: boolean;
  readAt?: string | null;
  createdAt: string;
}

// ─── Carrier Detail (full profile for carriers page) ────

export interface CarrierDetail extends CarrierProfile {
  company?: string;
  contactName?: string;
  email?: string;
  phone?: string | null;
  tier?: string;
  safetyScore?: number | null;
  numberOfTrucks?: number | null;
  w9Uploaded?: boolean;
  insuranceCertUploaded?: boolean;
  authorityDocUploaded?: boolean;
  approvedAt?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  completedLoads?: number;
  totalRevenue?: number;
  tendersAccepted?: number;
  tendersDeclined?: number;
  tendersTotal?: number;
  acceptanceRate?: number;
  lastVettingScore?: number | null;
  lastVettingGrade?: string | null;
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
