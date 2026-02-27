"use client";

import { MapPin, Bell, Truck, Clock, CheckCircle2, Package, Navigation, Radio } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ShipperCard, ShipperBadge } from "@/components/shipper";
import type { TrackingResponse, TrackingShipment } from "@/components/shipper/shipperData";

const STATUS_STEPS = ["Picked Up", "In Transit", "At Delivery", "Delivered"];

function getStepIndex(status: string): number {
  const map: Record<string, number> = {
    PICKED_UP: 0, AT_PICKUP: 0, LOADED: 0,
    IN_TRANSIT: 1, DISPATCHED: 1,
    AT_DELIVERY: 2,
    DELIVERED: 3, POD_RECEIVED: 3, COMPLETED: 3,
  };
  return map[status] ?? -1;
}

export default function ShipperTrackingPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["shipper-tracking"],
    queryFn: () => api.get<TrackingResponse>("/shipper-portal/tracking").then((r) => r.data),
    refetchInterval: 60000,
  });

  const active = data?.shipments || [];
  const atRisk = active.filter((s) => s.riskLevel === "RED" || s.riskLevel === "AMBER");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = active.find((s) => s.id === selectedId) || active[0] as TrackingShipment | undefined;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif text-2xl text-[#0D1B2A]">Live Freight Tracking</h1>
          <p className="text-xs text-gray-500 mt-1">Real-time shipment visibility &amp; status updates</p>
        </div>
        <span className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-xs text-emerald-600">
          <Radio className="w-3 h-3" /> Live
        </span>
      </div>

      {/* KPI Summary Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <ShipperCard padding="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Package className="w-4 h-4 text-[#C9A84C]" />
            <span className="text-[11px] text-gray-500 uppercase tracking-wide">Active</span>
          </div>
          <p className="text-xl font-bold text-[#0D1B2A]">{isLoading ? "—" : active.length}</p>
        </ShipperCard>
        <ShipperCard padding="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Truck className="w-4 h-4 text-blue-500" />
            <span className="text-[11px] text-gray-500 uppercase tracking-wide">In Transit</span>
          </div>
          <p className="text-xl font-bold text-[#0D1B2A]">{isLoading ? "—" : active.filter(s => s.status === "IN_TRANSIT").length}</p>
        </ShipperCard>
        <ShipperCard padding="p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span className="text-[11px] text-gray-500 uppercase tracking-wide">On Schedule</span>
          </div>
          <p className="text-xl font-bold text-[#0D1B2A]">{isLoading ? "—" : active.filter(s => s.riskLevel === "GREEN").length}</p>
        </ShipperCard>
        <ShipperCard padding="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Bell className="w-4 h-4 text-amber-500" />
            <span className="text-[11px] text-gray-500 uppercase tracking-wide">At Risk</span>
          </div>
          <p className="text-xl font-bold text-[#0D1B2A]">{isLoading ? "—" : atRisk.length}</p>
        </ShipperCard>
      </div>

      {/* At-Risk Alerts Banner */}
      {atRisk.length > 0 && (
        <div className="mb-5 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-center gap-2 mb-1.5">
            <Bell size={14} className="text-amber-600" />
            <span className="text-xs font-bold text-amber-700">At-Risk Alert{atRisk.length > 1 ? "s" : ""}</span>
          </div>
          {atRisk.map((s) => (
            <div key={s.id} className="text-xs text-amber-800 leading-relaxed mb-0.5">
              <span className="font-mono font-semibold">{s.id}</span> — {s.riskLevel === "RED" ? "Critical delay" : "Possible delay"} on {s.origin} &rarr; {s.dest}. Your rep has been notified.
            </div>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_360px] gap-5">
        {/* Selected Shipment Detail */}
        <div className="space-y-4">
          {!selected && !isLoading && (
            <ShipperCard padding="p-8">
              <div className="text-center text-gray-400 text-sm">No active shipments to track</div>
            </ShipperCard>
          )}

          {isLoading && (
            <ShipperCard padding="p-6">
              <div className="space-y-3">
                <div className="h-5 bg-gray-200 rounded animate-pulse w-48" />
                <div className="h-4 bg-gray-200 rounded animate-pulse w-72" />
                <div className="h-12 bg-gray-100 rounded animate-pulse" />
              </div>
            </ShipperCard>
          )}

          {selected && (
            <>
              {/* Route & Status Card */}
              <ShipperCard padding="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <span className="font-mono text-sm font-bold text-[#0D1B2A]">{selected.id}</span>
                    <div className="flex items-center gap-2 mt-1">
                      <ShipperBadge status={selected.status} />
                      {selected.riskLevel === "RED" && <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] rounded font-medium">DELAYED</span>}
                      {selected.riskLevel === "AMBER" && <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded font-medium">AT RISK</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Clock className="w-3 h-3" /> ETA
                    </div>
                    <p className="text-sm font-semibold text-[#0D1B2A]">{selected.eta || "—"}</p>
                  </div>
                </div>

                {/* Route Display */}
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg mb-4">
                  <div className="flex-1">
                    <div className="text-[10px] text-gray-400 uppercase">Origin</div>
                    <div className="text-sm font-medium text-[#0D1B2A] flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-emerald-500 shrink-0" /> {selected.origin}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-gray-300 shrink-0">
                    <div className="w-8 h-px bg-gray-300" />
                    <Navigation className="w-3.5 h-3.5 text-[#C9A84C]" />
                    <div className="w-8 h-px bg-gray-300" />
                  </div>
                  <div className="flex-1 text-right">
                    <div className="text-[10px] text-gray-400 uppercase">Destination</div>
                    <div className="text-sm font-medium text-[#0D1B2A] flex items-center justify-end gap-1">
                      {selected.dest} <MapPin className="w-3 h-3 text-red-400 shrink-0" />
                    </div>
                  </div>
                </div>

                {/* Progress Steps */}
                <div className="flex items-center justify-between">
                  {STATUS_STEPS.map((step, i) => {
                    const currentStep = getStepIndex(selected.status);
                    const done = i <= currentStep;
                    const active = i === currentStep;
                    return (
                      <div key={step} className="flex items-center flex-1">
                        <div className="flex flex-col items-center">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                            done ? (active ? "bg-[#C9A84C] text-white" : "bg-emerald-500 text-white") : "bg-gray-200 text-gray-400"
                          }`}>
                            {done && !active ? "✓" : i + 1}
                          </div>
                          <span className={`text-[10px] mt-1 ${done ? "text-[#0D1B2A] font-medium" : "text-gray-400"}`}>{step}</span>
                        </div>
                        {i < STATUS_STEPS.length - 1 && (
                          <div className={`flex-1 h-0.5 mx-1 mt-[-12px] ${i < currentStep ? "bg-emerald-400" : "bg-gray-200"}`} />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Progress bar */}
                <div className="mt-4">
                  <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                    <span>Progress</span>
                    <span>{selected.progress}%</span>
                  </div>
                  <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        selected.riskLevel === "RED" ? "bg-red-500" : selected.riskLevel === "AMBER" ? "bg-amber-500" : "bg-[#C9A84C]"
                      }`}
                      style={{ width: `${selected.progress}%` }}
                    />
                  </div>
                </div>
              </ShipperCard>

              {/* ELD / Last Known Position */}
              {selected.eldPosition && (
                <ShipperCard padding="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Truck className="w-4 h-4 text-[#C9A84C]" />
                    <span className="text-xs font-bold text-[#0D1B2A]">Last Known Position</span>
                    <span className="ml-auto text-[10px] text-gray-400">via ELD</span>
                  </div>
                  <div className="text-sm text-gray-700">{selected.eldPosition.address}</div>
                  <div className="flex gap-4 mt-1.5 text-[11px] text-gray-500">
                    <span>Speed: {selected.eldPosition.speed} mph</span>
                    <span>{selected.eldPosition.lat.toFixed(4)}, {selected.eldPosition.lng.toFixed(4)}</span>
                  </div>
                </ShipperCard>
              )}

              {/* Check Call History */}
              {selected.checkCalls && selected.checkCalls.length > 0 && (
                <ShipperCard padding="p-4">
                  <div className="text-xs font-bold text-[#0D1B2A] mb-3">Recent Updates</div>
                  <div className="space-y-2">
                    {selected.checkCalls.slice(0, 5).map((cc, i) => (
                      <div key={i} className="flex items-start gap-3 text-xs">
                        <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-[#C9A84C] shrink-0" />
                        <div className="flex-1">
                          <span className="text-gray-700">{cc.city}, {cc.state}</span>
                          <span className="text-gray-400 ml-2">{cc.method}</span>
                        </div>
                        <span className="text-gray-400 shrink-0">{cc.timestamp}</span>
                      </div>
                    ))}
                  </div>
                </ShipperCard>
              )}
            </>
          )}
        </div>

        {/* Shipment List Sidebar */}
        <div className="space-y-3">
          <ShipperCard padding="p-4">
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
                <div
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={`p-3 rounded-lg border mb-2 cursor-pointer transition-colors ${
                    (selected?.id === s.id) ? "border-[#C9A84C]/50 bg-[#C9A84C]/5" : "border-gray-200 hover:border-[#C9A84C]/30"
                  }`}
                >
                  <div className="flex justify-between mb-1.5">
                    <span className="font-mono text-[11px] font-semibold text-[#0D1B2A]">{s.id}</span>
                    <ShipperBadge status={s.status} />
                  </div>
                  <div className="text-xs text-gray-600 mb-2">{s.origin} &rarr; {s.dest}</div>
                  {s.checkCalls.length > 0 && (
                    <div className="text-[10px] text-gray-400 mb-1.5">
                      Last: {s.checkCalls[0].city}, {s.checkCalls[0].state} &middot; {s.checkCalls[0].method}
                    </div>
                  )}
                  <div className="bg-gray-200 rounded h-[5px] overflow-hidden">
                    <div
                      className={`h-full rounded ${s.riskLevel === "RED" ? "bg-red-500" : s.riskLevel === "AMBER" ? "bg-amber-500" : "bg-blue-500"}`}
                      style={{ width: `${s.progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] text-gray-400">ETA: {s.eta}</span>
                    <span className="text-[10px] text-gray-400">{s.progress}%</span>
                  </div>
                </div>
              ))
            )}
          </ShipperCard>

          {/* On-Schedule Indicator */}
          {atRisk.length === 0 && !isLoading && active.length > 0 && (
            <ShipperCard padding="p-4" className="!bg-emerald-50 !border-emerald-200">
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
