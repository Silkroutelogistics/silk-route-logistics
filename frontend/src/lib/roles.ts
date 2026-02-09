export type UserRole = "ADMIN" | "CEO" | "BROKER" | "CARRIER" | "DISPATCH" | "OPERATIONS" | "ACCOUNTING" | "SHIPPER" | "FACTOR";

export const EMPLOYEE_ROLES: UserRole[] = ["ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS", "ACCOUNTING"];
export const CARRIER_ONLY_ROUTES = ["scorecard", "revenue", "documents", "factoring"];
export const EMPLOYEE_ONLY_ROUTES = ["tracking", "finance", "crm", "sops", "drivers", "market", "edi", "carriers", "fleet", "compliance", "audit", "orders", "violations"];

export function isAdmin(role: string | undefined): boolean {
  return role === "ADMIN" || role === "CEO";
}

export function isCeo(role: string | undefined): boolean {
  return role === "CEO";
}

export function isCarrier(role: string | undefined): boolean {
  return role === "CARRIER";
}

export function isEmployee(role: string | undefined): boolean {
  return EMPLOYEE_ROLES.includes(role as UserRole);
}
