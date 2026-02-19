"use client";

import Link from "next/link";
import { Package, Truck, Shield, DollarSign, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CarrierCard, CarrierBadge } from "@/components/carrier";
import { useCarrierAuth } from "@/hooks/useCarrierAuth";

export default function CarrierOverviewPage() {
  const { user } = useCarrierAuth();
  const profile = user?.carrierProfile;

  const { data: myLoads } = useQuery({
    queryKey: ["carrier-my-loads-dash"],
    queryFn: () => api.get("/carrier-loads/my-loads?limit=5").then((r) => r.data),
  });

  const { data: available } = useQuery({
    queryKey: ["carrier-available-dash"],
    queryFn: () => api.get("/carrier-loads/available?limit=5").then((r) => r.data),
  });

  const { data: paymentSummary } = useQuery({
    queryKey: ["carrier-payments-summary"],
    queryFn: () => api.get("/carrier-payments/summary").then((r) => r.data),
  });

  const { data: compliance } = useQuery({
    queryKey: ["carrier-compliance-dash"],
    queryFn: () => api.get("/carrier-compliance/overview").then((r) => r.data),
  });

  const activeLoads = myLoads?.loads?.filter((l: any) => !["DELIVERED", "POD_RECEIVED", "COMPLETED", "CANCELLED"].includes(l.status)) || [];
  const recentLoads = myLoads?.loads || [];
  const availableLoads = available?.loads || [];
  const alerts = compliance?.alerts || [];
  const criticalAlerts = compliance?.alertsSummary?.critical || 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-2xl text-[#0D1B2A] mb-1">
          Welcome back{user?.firstName ? `, ${user.firstName}` : ""}
        </h1>
        <p className="text-[13px] text-gray-500">
          {profile?.companyName || user?.company || "Carrier Portal"} &middot; {profile?.tier || "—"} Tier &middot; MC-{profile?.mcNumber || "—"}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <CarrierCard padding="p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Truck size={20} className="text-blue-500" />
            </div>
            <div>
              <div className="text-[11px] text-gray-400 font-medium">Active Loads</div>
              <div className="text-[28px] font-bold text-[#0D1B2A]">{activeLoads.length}</div>
            </div>
          </div>
        </CarrierCard>
        <CarrierCard padding="p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Package size={20} className="text-emerald-500" />
            </div>
            <div>
              <div className="text-[11px] text-gray-400 font-medium">Available Loads</div>
              <div className="text-[28px] font-bold text-[#0D1B2A]">{available?.total || 0}</div>
            </div>
          </div>
        </CarrierCard>
        <CarrierCard padding="p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <DollarSign size={20} className="text-amber-500" />
            </div>
            <div>
              <div className="text-[11px] text-gray-400 font-medium">Pending Pay</div>
              <div className="text-[28px] font-bold text-[#0D1B2A]">
                ${(paymentSummary?.totalPending?.amount || 0).toLocaleString()}
              </div>
            </div>
          </div>
        </CarrierCard>
        <CarrierCard padding="p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
              <Shield size={20} className="text-violet-500" />
            </div>
            <div>
              <div className="text-[11px] text-gray-400 font-medium">Compliance</div>
              <div className="text-[28px] font-bold text-[#0D1B2A]">
                {criticalAlerts > 0 ? (
                  <span className="text-red-500">{criticalAlerts} Alert{criticalAlerts > 1 ? "s" : ""}</span>
                ) : (
                  <span className="text-emerald-500">Good</span>
                )}
              </div>
            </div>
          </div>
        </CarrierCard>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { icon: Package, label: "Find Loads", href: "/carrier/dashboard/available-loads" },
          { icon: Truck, label: "My Loads", href: "/carrier/dashboard/my-loads" },
          { icon: Shield, label: "Compliance", href: "/carrier/dashboard/compliance" },
          { icon: DollarSign, label: "Payments", href: "/carrier/dashboard/payments" },
        ].map((a, i) => (
          <Link key={i} href={a.href}>
            <CarrierCard hover padding="p-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-[#C9A84C]/10 flex items-center justify-center">
                  <a.icon size={18} className="text-[#C9A84C]" />
                </div>
                <span className="text-[13px] font-semibold text-[#0D1B2A]">{a.label}</span>
              </div>
            </CarrierCard>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* My Active Loads */}
        <CarrierCard padding="p-0">
          <div className="px-5 py-4 flex justify-between items-center border-b border-gray-100">
            <h3 className="text-[15px] font-bold text-[#0D1B2A]">My Active Loads</h3>
            <Link href="/carrier/dashboard/my-loads" className="text-gray-500 text-[11px] font-semibold uppercase tracking-wider hover:text-[#C9A84C]">
              View All
            </Link>
          </div>
          {recentLoads.length === 0 ? (
            <div className="px-5 py-8 text-center text-xs text-gray-400">No loads assigned yet</div>
          ) : (
            recentLoads.slice(0, 5).map((load: any) => (
              <div key={load.id} className="px-5 py-3 border-b border-gray-100 flex justify-between items-center hover:bg-gray-50">
                <div>
                  <div className="text-xs font-mono font-semibold text-[#0D1B2A]">{load.referenceNumber}</div>
                  <div className="text-[11px] text-gray-400">
                    {load.originCity}, {load.originState} &rarr; {load.destCity}, {load.destState}
                  </div>
                </div>
                <div className="text-right flex items-center gap-3">
                  <span className="text-xs font-bold text-[#0D1B2A]">${(load.carrierRate || load.rate || 0).toLocaleString()}</span>
                  <CarrierBadge status={load.status} />
                </div>
              </div>
            ))
          )}
        </CarrierCard>

        {/* Available Loads */}
        <CarrierCard padding="p-0">
          <div className="px-5 py-4 flex justify-between items-center border-b border-gray-100">
            <h3 className="text-[15px] font-bold text-[#0D1B2A]">Available Loads</h3>
            <Link href="/carrier/dashboard/available-loads" className="text-gray-500 text-[11px] font-semibold uppercase tracking-wider hover:text-[#C9A84C]">
              View All
            </Link>
          </div>
          {availableLoads.length === 0 ? (
            <div className="px-5 py-8 text-center text-xs text-gray-400">No available loads right now</div>
          ) : (
            availableLoads.slice(0, 5).map((load: any) => (
              <div key={load.id} className="px-5 py-3 border-b border-gray-100 flex justify-between items-center hover:bg-gray-50">
                <div>
                  <div className="text-xs font-mono font-semibold text-[#0D1B2A]">{load.referenceNumber}</div>
                  <div className="text-[11px] text-gray-400">
                    {load.originCity}, {load.originState} &rarr; {load.destCity}, {load.destState}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{load.equipmentType} &middot; {load.weight ? `${Number(load.weight).toLocaleString()} lbs` : "—"}</div>
                </div>
                <span className="text-xs font-bold text-[#C9A84C]">${(load.carrierRate || load.rate || 0).toLocaleString()}</span>
              </div>
            ))
          )}
        </CarrierCard>
      </div>

      {/* Compliance Alerts */}
      {alerts.length > 0 && (
        <CarrierCard padding="p-4" className="!bg-amber-500/[0.06] !border-amber-500/20">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle size={16} className="text-amber-500" />
            <span className="text-xs font-bold text-amber-600">Compliance Alerts</span>
          </div>
          {alerts.slice(0, 3).map((a: any, i: number) => (
            <div key={i} className="text-xs text-gray-600 leading-relaxed mb-1">{a.message || a.type}</div>
          ))}
          <Link href="/carrier/dashboard/compliance" className="text-[11px] text-[#C9A84C] font-semibold mt-2 inline-block">
            View All &rarr;
          </Link>
        </CarrierCard>
      )}
    </div>
  );
}
