"use client";

import { useAuthStore } from "@/hooks/useAuthStore";
import { isCarrier } from "@/lib/roles";
import { CarrierOverview } from "@/components/dashboard/CarrierOverview";
import { EmployeeOverview } from "@/components/dashboard/EmployeeOverview";
import { CeoOverview } from "@/components/dashboard/CeoOverview";

export default function DashboardPage() {
  const { user } = useAuthStore();
  if (user?.role === "CEO" || user?.role === "ADMIN") return <CeoOverview />;
  if (isCarrier(user?.role)) return <CarrierOverview />;
  return <EmployeeOverview />;
}
