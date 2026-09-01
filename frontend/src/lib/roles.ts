export type UserRole = "ADMIN" | "CEO" | "BROKER" | "CARRIER" | "DISPATCH" | "OPERATIONS" | "ACCOUNTING" | "SHIPPER" | "FACTOR" | "ACCOUNT_EXECUTIVE" | "CARRIER_REVIEWER";

// v3.8.aue — ACCOUNT_EXECUTIVE is an employee role. Adding it here also feeds
// isEmployee() and useRoleGuard(), so the /dashboard route guard follows free.
// v3.8.awy — CARRIER_REVIEWER is an employee role, so isEmployee() and the
// /dashboard route guard follow from listing it here.
export const EMPLOYEE_ROLES: UserRole[] = ["ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS", "ACCOUNTING", "ACCOUNT_EXECUTIVE", "CARRIER_REVIEWER"];
export const CARRIER_ONLY_ROUTES = ["scorecard", "revenue", "documents", "factoring"];
export const EMPLOYEE_ONLY_ROUTES = ["tracking", "finance", "crm", "sops", "drivers", "market", "edi", "carriers", "fleet", "compliance", "audit", "orders", "violations", "payables", "settlements", "bench"];

export function isAdmin(role: string | undefined): boolean {
  return role === "ADMIN" || role === "CEO";
}

export function isCeo(role: string | undefined): boolean {
  return role === "CEO";
}

export function isCarrier(role: string | undefined): boolean {
  return role === "CARRIER";
}

export function isShipper(role: string | undefined): boolean {
  return role === "SHIPPER";
}

export function isEmployee(role: string | undefined): boolean {
  return EMPLOYEE_ROLES.includes(role as UserRole);
}

/**
 * May this role work the carrier-approval queue?
 *
 * v3.8.awy — the UI counterpart to CARRIER_REVIEWER_ALLOW in the backend
 * middleware. Deliberately NARROWER than isAdmin: it gates the reversible
 * queue actions (approve, decline, request info, re-vet, document verify) and
 * nothing else. Terminate, either override, authority-grant-date, tier changes,
 * Quick Pay and the test-account flag stay on isAdmin, because the backend
 * refuses this role there and a button that 403s is worse than no button.
 *
 * ADMIN and CEO are included so existing gates keep their present behaviour;
 * this widens who sees the queue controls, it never narrows it.
 */
export function canReviewCarriers(role: string | undefined): boolean {
  return isAdmin(role) || role === "CARRIER_REVIEWER";
}
