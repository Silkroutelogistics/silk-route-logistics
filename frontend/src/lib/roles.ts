export type UserRole = "ADMIN" | "BROKER" | "CARRIER" | "DISPATCH" | "OPERATIONS" | "ACCOUNTING" | "SHIPPER" | "FACTOR";

export const EMPLOYEE_ROLES: UserRole[] = ["ADMIN", "BROKER", "DISPATCH", "OPERATIONS", "ACCOUNTING"];
export const CARRIER_ONLY_ROUTES = ["scorecard", "revenue", "documents", "factoring"];
export const EMPLOYEE_ONLY_ROUTES = ["tracking", "finance", "crm", "sops", "drivers", "market", "edi"];

export function isAdmin(role: string | undefined): boolean {
  return role === "ADMIN";
}

export function isCarrier(role: string | undefined): boolean {
  return role === "CARRIER";
}

export function isEmployee(role: string | undefined): boolean {
  return EMPLOYEE_ROLES.includes(role as UserRole);
}
