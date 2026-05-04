export type CrmTab =
  | "profile"
  | "contacts"
  | "loads"
  | "rates"
  | "facilities"
  | "notes"
  | "docs"
  | "orders"
  | "activity";

export interface CrmCustomer {
  id: string;
  name: string;
  type: string;
  status: string;
  onboardingStatus?: string;
  industry: string | null;
  industryType: string | null;
  city: string | null;
  state: string | null;
  email: string | null;
  phone: string | null;
  contactName: string | null;
  rating: number;
  creditLimit: number | null;
  creditStatus: string;
  creditCheckDate: string | null;
  creditCheckSource: string | null;
  creditCheckResult: string | null;
  creditCheckNotes: string | null;
  secCikNumber: string | null;
  accountRepId: string | null;
  accountRep?: { id: string; firstName: string | null; lastName: string | null; email: string } | null;
  paymentTerms: string | null;
  taxId: string | null;
  address: string | null;
  zip: string | null;
  billingAddress: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingZip: string | null;
  notes: string | null;
  createdAt: string;
  totalRevenue?: number;
  totalLoads?: number;
  totalShipments?: number;
  _count?: { shipments?: number; loads?: number };
}

export type ContactSalesRole =
  | "DECISION_MAKER"
  | "CHAMPION"
  | "GATEKEEPER"
  | "TECHNICAL"
  | "BILLING"
  | "OTHER";

export interface CrmContact {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  isBilling: boolean;
  receivesTrackingLink: boolean;
  role: string | null;
  salesRole: ContactSalesRole | null;
  introducedVia: string | null;
  doNotContact: boolean;
}

export interface CrmFacility {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  facilityType: "pickup" | "delivery" | "both";
  isPrimary: boolean;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  operatingHours: Record<string, { open: string; close: string }> | null;
  dockInfo: string | null;
  loadType: "live" | "drop";
  estimatedLoadTimeMinutes: number | null;
  appointmentRequired: boolean;
  appointmentInstructions: string | null;
  lumperInfo: string | null;
  specialInstructions: string | null;
}

export interface CrmNote {
  id: string;
  noteType: "shipping_instruction" | "receiving_instruction" | "customer_preference" | "operational";
  facilityId: string | null;
  facility: { id: string; name: string } | null;
  title: string | null;
  content: string;
  followUpDate: string | null;
  source: string;
  createdByName: string | null;
  createdAt: string;
}
