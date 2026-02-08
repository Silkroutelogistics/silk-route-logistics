// ─── User ────────────────────────────────────────────
export type UserRole = "CARRIER" | "BROKER" | "SHIPPER" | "FACTOR" | "ADMIN";

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  company?: string;
  role: UserRole;
  phone?: string;
  mcNumber?: string;
  dotNumber?: string;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Load ────────────────────────────────────────────
export type LoadStatus = "POSTED" | "BOOKED" | "IN_TRANSIT" | "DELIVERED" | "COMPLETED" | "CANCELLED";

export interface Load {
  id: string;
  referenceNumber: string;
  status: LoadStatus;
  originCity: string;
  originState: string;
  originZip: string;
  destCity: string;
  destState: string;
  destZip: string;
  weight?: number;
  equipmentType: string;
  commodity?: string;
  rate: number;
  distance?: number;
  notes?: string;
  pickupDate: string;
  deliveryDate: string;
  posterId: string;
  poster?: Pick<User, "id" | "company" | "firstName" | "lastName">;
  carrierId?: string;
  carrier?: Pick<User, "id" | "company" | "firstName" | "lastName">;
  createdAt: string;
  updatedAt: string;
}

// ─── Invoice ─────────────────────────────────────────
export type InvoiceStatus = "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "FUNDED" | "PAID" | "REJECTED";

export interface Invoice {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  amount: number;
  factoringFee?: number;
  advanceRate?: number;
  advanceAmount?: number;
  dueDate?: string;
  paidAt?: string;
  userId: string;
  loadId: string;
  load?: Pick<Load, "originCity" | "originState" | "destCity" | "destState">;
  documents?: Document[];
  createdAt: string;
  updatedAt: string;
}

// ─── Document ────────────────────────────────────────
export interface Document {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  userId: string;
  loadId?: string;
  invoiceId?: string;
  createdAt: string;
}

// ─── API Responses ───────────────────────────────────
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

export interface AuthResponse {
  user: Pick<User, "id" | "email" | "firstName" | "lastName" | "role">;
  token: string;
}

export interface ApiError {
  error: string;
  details?: unknown;
}
