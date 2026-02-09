"use client";

import { useAuthStore } from "@/hooks/useAuthStore";
import { useViewMode } from "@/hooks/useViewMode";
import { isAdmin, isCarrier } from "@/lib/roles";
import { CarrierOverview } from "@/components/dashboard/CarrierOverview";
import { EmployeeOverview } from "@/components/dashboard/EmployeeOverview";
import { CeoOverview } from "@/components/dashboard/CeoOverview";

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { viewMode } = useViewMode();

  if (isAdmin(user?.role)) {
    return viewMode === "ae" ? <CeoOverview /> : <CarrierOverview />;
  }
  if (isCarrier(user?.role)) return <CarrierOverview />;
  return <EmployeeOverview />;
}
