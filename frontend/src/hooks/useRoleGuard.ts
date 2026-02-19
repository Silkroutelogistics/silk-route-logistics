"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/hooks/useAuthStore";
import { isAdmin, isCarrier, isEmployee, isShipper, CARRIER_ONLY_ROUTES, EMPLOYEE_ONLY_ROUTES } from "@/lib/roles";

export function useRoleGuard() {
  const { user } = useAuthStore();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!user) return;

    // Shippers should never be on /dashboard/* — redirect to shipper portal
    if (isShipper(user.role) && pathname.startsWith("/dashboard")) {
      router.replace("/shipper/dashboard");
      return;
    }

    if (isAdmin(user.role)) return;

    const segment = pathname.split("/dashboard/")[1]?.split("/")[0];
    if (!segment) return;

    if (isCarrier(user.role) && EMPLOYEE_ONLY_ROUTES.includes(segment)) {
      router.replace("/dashboard/overview");
    }

    if (isEmployee(user.role) && CARRIER_ONLY_ROUTES.includes(segment)) {
      router.replace("/dashboard/overview");
    }
  }, [user, pathname, router]);
}
