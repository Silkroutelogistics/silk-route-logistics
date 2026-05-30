import { prisma } from "../config/database";

/**
 * v3.8.alr §13.3 Item 8.1 — Customer inactivation gate.
 *
 * Returns whether a load may be created against the given customer.
 * An inactive customer (isActive=false) is hard-blocked for non-admins;
 * ADMIN/CEO can override (per the Item 8.1 spec "with ADMIN/CEO override").
 * A null/absent customerId or a non-existent customer is NOT blocked here —
 * existence + credit are enforced by the caller's own checks; this gate is
 * exclusively about the inactivation flag.
 */
export async function checkCustomerActive(
  customerId: string | null | undefined,
  userRole?: string,
): Promise<{ allowed: boolean; reason?: string }> {
  if (!customerId) return { allowed: true };

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { isActive: true, name: true, inactivationReason: true },
  });

  if (!customer || customer.isActive) return { allowed: true };

  // Inactive customer. ADMIN/CEO may override.
  if (userRole === "ADMIN" || userRole === "CEO") return { allowed: true };

  const suffix = customer.inactivationReason ? `: ${customer.inactivationReason}` : "";
  return {
    allowed: false,
    reason: `Customer "${customer.name}" is inactive${suffix}. Reactivate the customer before creating new loads.`,
  };
}
