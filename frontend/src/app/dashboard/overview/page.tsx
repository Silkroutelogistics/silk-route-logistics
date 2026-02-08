"use client";

import { useAuthStore } from "@/hooks/useAuthStore";
import { isCarrier } from "@/lib/roles";
import { CarrierOverview } from "@/components/dashboard/CarrierOverview";
import { EmployeeOverview } from "@/components/dashboard/EmployeeOverview";

export default function DashboardPage() {
  const { user } = useAuthStore();
  return isCarrier(user?.role) ? <CarrierOverview /> : <EmployeeOverview />;
}
