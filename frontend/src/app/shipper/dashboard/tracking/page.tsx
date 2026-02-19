"use client";

import { MapPin, Bell } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ShipperCard, ShipperBadge } from "@/components/shipper";
import type { TrackingResponse, TrackingShipment } from "@/components/shipper/shipperData";

export default function ShipperTrackingPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["shipper-tracking"],
    queryFn: () => api.get<TrackingResponse>("/shipper-portal/tracking").then((r) => r.data),
    refetchInterval: 60000, // Refresh every 60s for live tracking
  });

  const active = data?.shipments || [];
  const atRisk = active.filter((s) => s.riskLevel === "RED" || s.riskLevel === "AMBER");
  const selectedShipment = active[0] as TrackingShipment | undefined;

  return (
    <div>
      <h1 className="font-serif text-2xl text-[#0D1B2A] mb-6">Live Freight Tracking &amp; Visibility</h1>
      <div className="grid grid-cols-[1fr_340px] gap-5">
        {/* Map placeholder */}
        <ShipperCard padding="p-0" className="min-h-[450px] overflow-hidden relative">
          <div className="w-full h-full min-h-[450px] bg-gradient-to-br from-[#1B2D45] to-[#0D1B2A] flex items-center justify-center flex-col gap-3">
            <MapPin size={48} className="text-[#C9A84C]" />
            <div className="text-base font-semibold text-white">Live GPS Freight Tracking Map</div>
            <div className="text-xs text-gray-400 max-w-[300px] text-center leading-relaxed">
              Real-time GPS shipment tracking with weather overlays, geofencing, traffic data, and at-risk freight alerts. Full supply chain visibility powered by carrier integration.
            </div>
            {selectedShipment && (
              <>
                <div className="flex items-center gap-1 mt-3">
                  {[...Array(8)].map((_, i) => {
                    const prog = Math.floor((selectedShipment.progress / 100) * 8);
                    return (
                      <div key={i} className={`rounded-full ${
                        i === prog ? "w-3.5 h-3.5 bg-[#C9A84C] border-2 border-white shadow-[0_0_12px_rgba(201,168,76,0.6)]" :
                        i < prog ? "w-2 h-2 bg-emerald-500" : "w-2 h-2 bg-gray-500"
                      }`} />
                    );
                  })}
                </div>
                <div className="text-[10px] text-gray-500 mt-1">
                  {selectedShipment.origin} ──── {selectedShipment.progress}% ──── {selectedShipment.dest}
                </div>
                {selectedShipment.eldPosition && (
                  <div className="text-[10px] text-[#C9A84C] mt-1">
                    ELD: {selectedShipment.eldPosition.address} · {selectedShipment.eldPosition.speed} mph
                  </div>
                )}
              </>
            )}
          </div>
        </ShipperCard>

        {/* Active shipments sidebar */}
        <div>
          <ShipperCard padding="p-4" className="mb-3">
            <div className="text-xs font-bold text-[#0D1B2A] mb-3">
              Active Shipments ({isLoading ? "..." : active.length})
            </div>
            {isLoading ? (
              [...Array(3)].map((_, i) => (
                <div key={i} className="p-3 rounded-lg border border-gray-200 mb-2">
                  <div className="h-4 bg-gray-200 rounded animate-pulse w-24 mb-2" />
                  <div className="h-3 bg-gray-200 rounded animate-pulse w-36 mb-2" />
                  <div className="h-1.5 bg-gray-200 rounded animate-pulse" />
                </div>
              ))
            ) : active.length === 0 ? (
              <div className="py-6 text-center text-xs text-gray-400">No active shipments</div>
            ) : (
              active.map((s) => (
                <div key={s.id} className="p-3 rounded-lg border border-gray-200 mb-2 cursor-pointer hover:border-[#C9A84C]/30 transition-colors">
                  <div className="flex justify-between mb-1.5">
                    <span className="font-mono text-[11px] font-semibold text-[#0D1B2A]">{s.id}</span>
                    <ShipperBadge status={s.status} />
                  </div>
                  <div className="text-xs text-gray-600 mb-2">{s.origin} &rarr; {s.dest}</div>
                  {/* Check call info */}
                  {s.checkCalls.length > 0 && (
                    <div className="text-[10px] text-gray-400 mb-1.5">
                      Last update: {s.checkCalls[0].city}, {s.checkCalls[0].state} &middot; {s.checkCalls[0].method}
                    </div>
                  )}
                  <div className="bg-gray-200 rounded h-[5px] overflow-hidden">
                    <div className={`h-full rounded ${s.riskLevel === "RED" ? "bg-red-500" : s.riskLevel === "AMBER" ? "bg-amber-500" : "bg-blue-500"}`} style={{ width: `${s.progress}%` }} />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] text-gray-400">ETA: {s.eta}</span>
                    <span className="text-[10px] text-gray-400">{s.progress}%</span>
                  </div>
                </div>
              ))
            )}
          </ShipperCard>

          {/* At-Risk Alerts */}
          {atRisk.length > 0 && (
            <ShipperCard padding="p-4" className="!bg-amber-500/[0.08] !border-amber-500/20">
              <div className="flex items-center gap-2 mb-2">
                <Bell size={16} className="text-amber-500" />
                <span className="text-xs font-bold text-amber-500">At-Risk Alert{atRisk.length > 1 ? "s" : ""}</span>
              </div>
              {atRisk.map((s) => (
                <div key={s.id} className="text-xs text-gray-600 leading-relaxed mb-1">
                  {s.id} — {s.riskLevel === "RED" ? "Critical delay" : "Possible delay"} on route {s.origin} &rarr; {s.dest}. Your rep has been notified.
                </div>
              ))}
            </ShipperCard>
          )}
          {atRisk.length === 0 && !isLoading && (
            <ShipperCard padding="p-4" className="!bg-emerald-500/[0.06] !border-emerald-500/20">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-xs font-medium text-emerald-600">All shipments on schedule</span>
              </div>
            </ShipperCard>
          )}
        </div>
      </div>
    </div>
  );
}
