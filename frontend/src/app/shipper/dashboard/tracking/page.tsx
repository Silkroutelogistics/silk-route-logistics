"use client";

import { MapPin, Bell, Truck, Clock, CheckCircle2, Package, Navigation, Radio, Search, Share2, History, X, ExternalLink, Copy, ChevronDown } from "lucide-react";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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

type Tab = "active" | "history";
type RiskFilter = "ALL" | "GREEN" | "AMBER" | "RED";

interface TimelineEvent {
  type: "event" | "checkCall";
  eventType: string;
  status: string;
  city: string;
  state: string;
  lat: number | null;
  lng: number | null;
  timestamp: string;
  detail: string | null;
}

interface TimelineResponse {
  loadId: string;
  referenceNumber: string;
  timeline: TimelineEvent[];
  stops: { stopNumber: number; type: string; facility: string; appointment: string | null; actualArrival: string | null; actualDeparture: string | null; onTime: boolean | null }[];
}

interface HistoryShipment {
  id: string;
  origin: string;
  dest: string;
  status: string;
  carrier: string;
  equipment: string;
  pickDate: string;
  delDate: string;
  rate: number;
  progress: number;
  loadId: string;
  deliveredAt: string | null;
}

function fmtTimestamp(ts: string) {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function ShipperTrackingPage() {
  const [tab, setTab] = useState<Tab>("active");
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [timelineLoadId, setTimelineLoadId] = useState<string | null>(null);
  const [shareLoadId, setShareLoadId] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Active tracking data
  const { data, isLoading } = useQuery({
    queryKey: ["shipper-tracking"],
    queryFn: () => api.get<TrackingResponse>("/shipper-portal/tracking").then((r) => r.data),
    refetchInterval: 60000,
  });

  // History data
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["shipper-tracking-history"],
    queryFn: () => api.get<{ shipments: HistoryShipment[] }>("/shipper-portal/tracking/history").then((r) => r.data),
    enabled: tab === "history",
  });

  // Timeline drawer
  const { data: timelineData } = useQuery({
    queryKey: ["shipper-timeline", timelineLoadId],
    queryFn: () => api.get<TimelineResponse>(`/shipper-portal/tracking/${timelineLoadId}/timeline`).then((r) => r.data),
    enabled: !!timelineLoadId,
  });

  // Share link mutation
  const shareMutation = useMutation({
    mutationFn: (loadId: string) => api.post<{ url: string; expiresAt: string }>(`/shipper-portal/tracking/${loadId}/share`).then((r) => r.data),
  });

  const allActive = data?.shipments || [];
  const atRisk = allActive.filter((s) => s.riskLevel === "RED" || s.riskLevel === "AMBER");

  // Filter active shipments
  const filteredActive = allActive.filter((s) => {
    if (riskFilter !== "ALL" && s.riskLevel !== riskFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return s.id.toLowerCase().includes(q) || s.origin.toLowerCase().includes(q) || s.dest.toLowerCase().includes(q) || s.carrier.toLowerCase().includes(q);
    }
    return true;
  });

  const filteredHistory = (historyData?.shipments || []).filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.id.toLowerCase().includes(q) || s.origin.toLowerCase().includes(q) || s.dest.toLowerCase().includes(q);
  });

  const activeList = tab === "active" ? filteredActive : [];
  const selected = tab === "active"
    ? (filteredActive.find((s) => s.id === selectedId) || filteredActive[0]) as TrackingShipment | undefined
    : undefined;

  const handleShare = (loadId: string) => {
    setShareLoadId(loadId);
    setCopiedLink(false);
    shareMutation.mutate(loadId);
  };

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif text-2xl text-[#0F1117]">Live Freight Tracking</h1>
          <p className="text-xs text-gray-500 mt-1">Real-time shipment visibility &amp; status updates</p>
        </div>
        <span className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-xs text-emerald-600">
          <Radio className="w-3 h-3" /> Live
        </span>
      </div>

      {/* KPI Summary Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <ShipperCard padding="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Package className="w-4 h-4 text-[#BA7517]" />
            <span className="text-[11px] text-gray-500 uppercase tracking-wide">Active</span>
          </div>
          <p className="text-xl font-bold text-[#0F1117]">{isLoading ? "—" : allActive.length}</p>
        </ShipperCard>
        <ShipperCard padding="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Truck className="w-4 h-4 text-blue-500" />
            <span className="text-[11px] text-gray-500 uppercase tracking-wide">In Transit</span>
          </div>
          <p className="text-xl font-bold text-[#0F1117]">{isLoading ? "—" : allActive.filter(s => s.status === "IN_TRANSIT").length}</p>
        </ShipperCard>
        <ShipperCard padding="p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-emerald-700" />
            <span className="text-[11px] text-gray-500 uppercase tracking-wide">On Schedule</span>
          </div>
          <p className="text-xl font-bold text-[#0F1117]">{isLoading ? "—" : allActive.filter(s => s.riskLevel === "GREEN").length}</p>
        </ShipperCard>
        <ShipperCard padding="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Bell className="w-4 h-4 text-amber-700" />
            <span className="text-[11px] text-gray-500 uppercase tracking-wide">At Risk</span>
          </div>
          <p className="text-xl font-bold text-[#0F1117]">{isLoading ? "—" : atRisk.length}</p>
        </ShipperCard>
      </div>

      {/* Tabs + Search + Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          <button onClick={() => { setTab("active"); setSearch(""); }} className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${tab === "active" ? "bg-white text-[#0F1117] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            <Radio className="w-3 h-3 inline mr-1" /> Active
          </button>
          <button onClick={() => { setTab("history"); setSearch(""); }} className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${tab === "history" ? "bg-white text-[#0F1117] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            <History className="w-3 h-3 inline mr-1" /> History
          </button>
        </div>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-700" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by ref, origin, destination..."
            className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-[#0F1117] placeholder:text-gray-400 focus:outline-none focus:border-[#C9A84C]/50"
          />
        </div>

        {tab === "active" && (
          <div className="flex gap-1">
            {(["ALL", "GREEN", "AMBER", "RED"] as RiskFilter[]).map((rf) => (
              <button key={rf} onClick={() => setRiskFilter(rf)} className={`px-2 py-1 text-[10px] font-medium rounded transition ${
                riskFilter === rf
                  ? rf === "RED" ? "bg-red-100 text-red-700" : rf === "AMBER" ? "bg-amber-100 text-amber-700" : rf === "GREEN" ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-700"
                  : "bg-gray-50 text-gray-400 hover:bg-gray-100"
              }`}>
                {rf === "ALL" ? "All" : rf}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* At-Risk Alerts Banner */}
      {tab === "active" && atRisk.length > 0 && riskFilter !== "GREEN" && (
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

      {/* ─── ACTIVE TAB ─── */}
      {tab === "active" && (
        <div className="grid lg:grid-cols-[1fr_360px] gap-5">
          {/* Selected Shipment Detail */}
          <div className="space-y-4">
            {!selected && !isLoading && (
              <ShipperCard padding="p-8">
                <div className="text-center text-gray-700 text-sm">
                  {search || riskFilter !== "ALL" ? "No shipments match your filters" : "No active shipments to track"}
                </div>
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
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-[#0F1117]">{selected.id}</span>
                        {selected.loadId && (
                          <button onClick={() => handleShare(selected.loadId!)} className="text-gray-700 hover:text-[#BA7517] transition" title="Share tracking link">
                            <Share2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {selected.loadId && (
                          <button onClick={() => setTimelineLoadId(selected.loadId!)} className="text-gray-700 hover:text-[#BA7517] transition" title="View full timeline">
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
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
                      <p className="text-sm font-semibold text-[#0F1117]">{selected.eta || "—"}</p>
                    </div>
                  </div>

                  {/* Route Display */}
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg mb-4">
                    <div className="flex-1">
                      <div className="text-[10px] text-gray-700 uppercase">Origin</div>
                      <div className="text-sm font-medium text-[#0F1117] flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-emerald-700 shrink-0" /> {selected.origin}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-gray-500 shrink-0">
                      <div className="w-8 h-px bg-gray-300" />
                      <Navigation className="w-3.5 h-3.5 text-[#BA7517]" />
                      <div className="w-8 h-px bg-gray-300" />
                    </div>
                    <div className="flex-1 text-right">
                      <div className="text-[10px] text-gray-700 uppercase">Destination</div>
                      <div className="text-sm font-medium text-[#0F1117] flex items-center justify-end gap-1">
                        {selected.dest} <MapPin className="w-3 h-3 text-red-700 shrink-0" />
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
                            <span className={`text-[10px] mt-1 ${done ? "text-[#0F1117] font-medium" : "text-gray-400"}`}>{step}</span>
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
                    <div className="flex justify-between text-[10px] text-gray-700 mb-1">
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
                      <Truck className="w-4 h-4 text-[#BA7517]" />
                      <span className="text-xs font-bold text-[#0F1117]">Last Known Position</span>
                      <span className="ml-auto text-[10px] text-gray-700">via ELD</span>
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
                    <div className="text-xs font-bold text-[#0F1117] mb-3">Recent Updates</div>
                    <div className="space-y-2">
                      {selected.checkCalls.slice(0, 5).map((cc, i) => (
                        <div key={i} className="flex items-start gap-3 text-xs">
                          <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-[#C9A84C] shrink-0" />
                          <div className="flex-1">
                            <span className="text-gray-700">{cc.city}, {cc.state}</span>
                            <span className="text-gray-700 ml-2">{cc.method}</span>
                          </div>
                          <span className="text-gray-700 shrink-0">{fmtTimestamp(cc.timestamp)}</span>
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
              <div className="text-xs font-bold text-[#0F1117] mb-3">
                Active Shipments ({isLoading ? "..." : filteredActive.length})
              </div>
              {isLoading ? (
                [...Array(3)].map((_, i) => (
                  <div key={i} className="p-3 rounded-lg border border-gray-200 mb-2">
                    <div className="h-4 bg-gray-200 rounded animate-pulse w-24 mb-2" />
                    <div className="h-3 bg-gray-200 rounded animate-pulse w-36 mb-2" />
                    <div className="h-1.5 bg-gray-200 rounded animate-pulse" />
                  </div>
                ))
              ) : filteredActive.length === 0 ? (
                <div className="py-6 text-center text-xs text-gray-700">
                  {search || riskFilter !== "ALL" ? "No matches" : "No active shipments"}
                </div>
              ) : (
                filteredActive.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => setSelectedId(s.id)}
                    className={`p-3 rounded-lg border mb-2 cursor-pointer transition-colors ${
                      (selected?.id === s.id) ? "border-[#C9A84C]/50 bg-[#C9A84C]/5" : "border-gray-200 hover:border-[#C9A84C]/30"
                    }`}
                  >
                    <div className="flex justify-between mb-1.5">
                      <span className="font-mono text-[11px] font-semibold text-[#0F1117]">{s.id}</span>
                      <ShipperBadge status={s.status} />
                    </div>
                    <div className="text-xs text-gray-600 mb-2">{s.origin} &rarr; {s.dest}</div>
                    {s.checkCalls.length > 0 && (
                      <div className="text-[10px] text-gray-700 mb-1.5">
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
                      <span className="text-[10px] text-gray-700">ETA: {s.eta}</span>
                      <span className="text-[10px] text-gray-700">{s.progress}%</span>
                    </div>
                  </div>
                ))
              )}
            </ShipperCard>

            {atRisk.length === 0 && !isLoading && allActive.length > 0 && (
              <ShipperCard padding="p-4" className="!bg-emerald-50 !border-emerald-200">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-xs font-medium text-emerald-600">All shipments on schedule</span>
                </div>
              </ShipperCard>
            )}
          </div>
        </div>
      )}

      {/* ─── HISTORY TAB ─── */}
      {tab === "history" && (
        <ShipperCard padding="p-4">
          <div className="text-xs font-bold text-[#0F1117] mb-4">Completed Shipments</div>
          {historyLoading ? (
            <div className="py-8 text-center text-xs text-gray-700">Loading history...</div>
          ) : filteredHistory.length === 0 ? (
            <div className="py-8 text-center text-xs text-gray-700">
              {search ? "No matches found" : "No completed shipments yet"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] text-gray-500 uppercase tracking-wider border-b border-gray-100">
                    <th className="text-left py-2 px-2 font-medium">Ref#</th>
                    <th className="text-left py-2 px-2 font-medium">Route</th>
                    <th className="text-left py-2 px-2 font-medium">Carrier</th>
                    <th className="text-left py-2 px-2 font-medium">Delivered</th>
                    <th className="text-right py-2 px-2 font-medium">Rate</th>
                    <th className="text-center py-2 px-2 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((s) => (
                    <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="py-2.5 px-2 font-mono font-semibold text-[#0F1117]">{s.id}</td>
                      <td className="py-2.5 px-2 text-gray-600">{s.origin} &rarr; {s.dest}</td>
                      <td className="py-2.5 px-2 text-gray-600">{s.carrier}</td>
                      <td className="py-2.5 px-2 text-gray-500">
                        {s.deliveredAt ? new Date(s.deliveredAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : s.delDate}
                      </td>
                      <td className="py-2.5 px-2 text-right font-medium text-[#0F1117]">${s.rate.toLocaleString()}</td>
                      <td className="py-2.5 px-2 text-center">
                        <button
                          onClick={() => setTimelineLoadId(s.loadId)}
                          className="text-[#BA7517] hover:underline text-[10px] font-medium"
                        >
                          Timeline
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ShipperCard>
      )}

      {/* ─── Timeline Drawer ─── */}
      {timelineLoadId && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20" onClick={() => setTimelineLoadId(null)} />
          <div className="relative w-full max-w-md bg-white shadow-xl overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#0F1117]">Shipment Timeline</h3>
                {timelineData && <p className="text-[10px] text-gray-700 font-mono">{timelineData.referenceNumber}</p>}
              </div>
              <button onClick={() => setTimelineLoadId(null)} className="text-gray-700 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5">
              {/* Stops summary */}
              {timelineData?.stops && timelineData.stops.length > 0 && (
                <div className="mb-5">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Stops</div>
                  {timelineData.stops.map((stop) => (
                    <div key={stop.stopNumber} className="flex items-center gap-3 mb-2 p-2 bg-gray-50 rounded-lg text-xs">
                      <div className="w-5 h-5 rounded-full bg-[#C9A84C]/20 text-[#C9A84C] flex items-center justify-center text-[10px] font-bold shrink-0">
                        {stop.stopNumber}
                      </div>
                      <div className="flex-1">
                        <div className="text-[#0F1117] font-medium">{stop.facility || stop.type}</div>
                        {stop.actualArrival && <div className="text-gray-700">Arrived: {fmtTimestamp(stop.actualArrival)}</div>}
                      </div>
                      {stop.onTime !== null && (
                        <span className={`text-[10px] font-medium ${stop.onTime ? "text-emerald-600" : "text-red-500"}`}>
                          {stop.onTime ? "On Time" : "Late"}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Timeline events */}
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-3">Event Log</div>
              {!timelineData ? (
                <div className="py-6 text-center text-xs text-gray-700">Loading timeline...</div>
              ) : timelineData.timeline.length === 0 ? (
                <div className="py-6 text-center text-xs text-gray-700">No events recorded</div>
              ) : (
                <div className="relative pl-4 border-l-2 border-gray-100">
                  {timelineData.timeline.map((evt, i) => (
                    <div key={i} className="relative mb-4 pb-1">
                      <div className={`absolute -left-[21px] top-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                        evt.eventType === "STATUS_CHANGE" ? "bg-[#C9A84C]"
                        : evt.eventType === "ALERT" ? "bg-red-500"
                        : evt.eventType === "CHECK_CALL" ? "bg-blue-500"
                        : "bg-gray-400"
                      }`} />
                      <div className="text-xs">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-medium text-[#0F1117]">
                            {evt.eventType === "STATUS_CHANGE" ? `Status → ${evt.status}` :
                             evt.eventType === "CHECK_CALL" ? "Check Call" :
                             evt.eventType === "LOCATION_UPDATE" ? "Location Update" :
                             evt.eventType === "GEOFENCE" ? "Geofence Event" :
                             evt.eventType}
                          </span>
                          {evt.detail && (
                            <span className="text-[10px] text-gray-700">{evt.detail}</span>
                          )}
                        </div>
                        {(evt.city || evt.state) && (
                          <div className="text-gray-500">{evt.city}{evt.city && evt.state ? ", " : ""}{evt.state}</div>
                        )}
                        <div className="text-gray-700 text-[10px]">{fmtTimestamp(evt.timestamp)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Share Link Modal ─── */}
      {shareLoadId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/20" onClick={() => setShareLoadId(null)} />
          <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-[#0F1117]">Share Tracking Link</h3>
              <button onClick={() => setShareLoadId(null)} className="text-gray-700 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            {shareMutation.isPending ? (
              <div className="py-4 text-center text-xs text-gray-700">Generating link...</div>
            ) : shareMutation.data ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-lg">
                  <ExternalLink className="w-3.5 h-3.5 text-[#BA7517] shrink-0" />
                  <span className="text-xs text-gray-600 truncate flex-1">{shareMutation.data.url}</span>
                  <button onClick={() => copyLink(shareMutation.data!.url)} className="text-[#BA7517] hover:text-[#b89a3f] shrink-0">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                {copiedLink && <p className="text-[10px] text-emerald-600 text-center">Link copied to clipboard!</p>}
                <p className="text-[10px] text-gray-700 text-center">
                  Expires {new Date(shareMutation.data.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </p>
              </div>
            ) : shareMutation.isError ? (
              <div className="py-4 text-center text-xs text-red-500">Failed to generate link</div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
