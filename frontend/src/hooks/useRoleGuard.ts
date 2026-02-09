"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/hooks/useAuthStore";
import { isAdmin, isCarrier, isEmployee, CARRIER_ONLY_ROUTES, EMPLOYEE_ONLY_ROUTES } from "@/lib/roles";

export function useRoleGuard() {
  const { user } = useAuthStore();
  const pathname = usePathname();

  useEffect(() => {
    if (!user) return;

    // Admin can access all routes
    if (isAdmin(user.role)) return;

    const segment = pathname.split("/dashboard/")[1]?.split("/")[0];
    if (!segment) return;

    if (isCarrier(user.role) && EMPLOYEE_ONLY_ROUTES.includes(segment)) {
      window.location.href = "/dashboard/overview";
    }

    if (isEmployee(user.role) && CARRIER_ONLY_ROUTES.includes(segment)) {
      window.location.href = "/dashboard/overview";
    }
  }, [user, pathname]);
}
