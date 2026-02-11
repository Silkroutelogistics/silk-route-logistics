"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/hooks/useAuthStore";
import { isCarrier } from "@/lib/roles";
import {
  Search, MapPin, Clock, CheckCircle2, Circle, Truck, Package, Download,
  ChevronRight, ChevronDown, Radio, Activity, AlertTriangle, Signal,
  PhoneCall, MessageSquare, Plus, Send,
} from "lucide-react";

/* ═══ Types ═══ */

interface TrackedLoad {
  id: string; referenceNumber: string; status: string;
  originCity: string; originState: string; destCity: string; destState: string;
  equipmentType: string; rate: number; pickupDate: string; deliveryDate: string;
  carrier?: { firstName: string; lastName: string; company: string | null; phone?: string } | null;
  customer?: { name: string } | null;
  driver?: { firstName: string; lastName: string } | null;
  shipments?: { id: string; shipmentNumber: string; lastLocation: string | null; lastLocationAt: string | null; eta: string | null }[];
}

interface CheckCall {
  id: string; status: string; location: string | null; city: string | null; state: string | null;
  notes: string | null; contactedBy: string | null; method: string | null; createdAt: string;
  calledBy?: { firstName: string; lastName: string } | null;
}

interface ELDOverview {
  activeDrivers: number; activeVehicles: number; hosViolations: number;
  connectedDevices: number; lastSync: string;
  providers: { name: string; connected: boolean; devices: number }[];
}

interface DriverLocation {
  driverId: string; driverName: string; status: string;
  location: { latitude: number; longitude: number; address: string; speed: number; heading: string; timestamp: string };
}

/* ═══ Status Pipeline ═══ */

const LOAD_PIPELINE = [
  "POSTED", "TENDERED", "CONFIRMED", "BOOKED", "DISPATCHED",
  "AT_PICKUP", "LOADED", "IN_TRANSIT", "AT_DELIVERY",
  "DELIVERED", "POD_RECEIVED", "INVOICED", "COMPLETED",
];

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft", POSTED: "Posted", TENDERED: "Tendered", CONFIRMED: "Confirmed",
  BOOKED: "Booked", DISPATCHED: "Dispatched", AT_PICKUP: "At Pickup", LOADED: "Loaded",
  PICKED_UP: "Picked Up", IN_TRANSIT: "In Transit", AT_DELIVERY: "At Delivery",
  DELIVERED: "Delivered", POD_RECEIVED: "POD Received", INVOICED: "Invoiced",
  COMPLETED: "Completed", TONU: "TONU", CANCELLED: "Cancelled",
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-slate-500/20 text-slate-400", POSTED: "bg-blue-500/20 text-blue-400",
  TENDERED: "bg-indigo-500/20 text-indigo-400", CONFIRMED: "bg-purple-500/20 text-purple-400",
  BOOKED: "bg-violet-500/20 text-violet-400", DISPATCHED: "bg-orange-500/20 text-orange-400",
  AT_PICKUP: "bg-amber-500/20 text-amber-400", LOADED: "bg-yellow-500/20 text-yellow-400",
  PICKED_UP: "bg-yellow-500/20 text-yellow-400", IN_TRANSIT: "bg-cyan-500/20 text-cyan-400",
  AT_DELIVERY: "bg-teal-500/20 text-teal-400", DELIVERED: "bg-green-500/20 text-green-400",
  POD_RECEIVED: "bg-emerald-500/20 text-emerald-400", INVOICED: "bg-lime-500/20 text-lime-400",
  COMPLETED: "bg-emerald-500/20 text-emerald-400", TONU: "bg-red-500/20 text-red-400",
  CANCELLED: "bg-red-500/20 text-red-400",
};

const CHECK_CALL_STATUSES = ["CHECKED_IN", "AT_PICKUP", "LOADED", "IN_TRANSIT", "AT_DELIVERY", "DELIVERED", "ISSUE"] as const;
const CHECK_CALL_METHODS = ["PHONE", "EMAIL", "ELD", "GPS", "CARRIER_UPDATE"] as const;

const METHOD_ICONS: Record<string, typeof PhoneCall> = {
  PHONE: PhoneCall, EMAIL: MessageSquare, ELD: Signal, GPS: MapPin, CARRIER_UPDATE: Truck,
};

type Tab = "loads" | "eld";

/* ═══ Active loads filter — only show loads that are being tracked ═══ */
const TRACKABLE_STATUSES = [
  "BOOKED", "DISPATCHED", "AT_PICKUP", "LOADED", "PICKED_UP",
  "IN_TRANSIT", "AT_DELIVERY", "DELIVERED", "POD_RECEIVED",
];

export default function TrackingPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const canUpdate = !isCarrier(user?.role);
  const [tab, setTab] = useState<Tab>("loads");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expandedLoadId, setExpandedLoadId] = useState<string | null>(null);
  const [showCheckCallForm, setShowCheckCallForm] = useState<string | null>(null);

  // Fetch active loads for tracking
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (statusFilter) params.set("status", statusFilter);
  params.set("limit", "50");

  const { data: loadsData } = useQuery({
    queryKey: ["tracking-loads", search, statusFilter],
    queryFn: () => api.get<{ loads: TrackedLoad[]; total: number }>(`/loads?${params.toString()}`).then((r) => r.data),
    enabled: tab === "loads",
  });

  // Filter to trackable statuses if no specific filter applied
  const trackedLoads = loadsData?.loads?.filter(l =>
    statusFilter ? true : TRACKABLE_STATUSES.includes(l.status)
  ) || [];

  // Check calls for expanded load
  const { data: checkCalls } = useQuery({
    queryKey: ["check-calls", expandedLoadId],
    queryFn: () => api.get<CheckCall[]>(`/check-calls/load/${expandedLoadId}`).then((r) => r.data),
    enabled: !!expandedLoadId,
  });

  // ELD queries
  const { data: eldOverview } = useQuery({
    queryKey: ["eld-overview"],
    queryFn: () => api.get<ELDOverview>("/eld/overview").then((r) => r.data),
    enabled: tab === "eld",
  });

  const { data: driverLocations } = useQuery({
    queryKey: ["eld-locations"],
    queryFn: () => api.get<DriverLocation[]>("/eld/locations").then((r) => r.data),
    enabled: tab === "eld",
    refetchInterval: 30000,
  });

  // Check call creation
  const [ccForm, setCcForm] = useState({ status: "CHECKED_IN" as string, location: "", city: "", state: "", notes: "", method: "PHONE" as string });

  const createCheckCall = useMutation({
    mutationFn: (data: { loadId: string } & typeof ccForm) => api.post("/check-calls", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["check-calls", showCheckCallForm] });
      queryClient.invalidateQueries({ queryKey: ["tracking-loads"] });
      setShowCheckCallForm(null);
      setCcForm({ status: "CHECKED_IN", location: "", city: "", state: "", notes: "", method: "PHONE" });
    },
  });

  const updateLoadStatus = useMutation({
    mutationFn: ({ loadId, status }: { loadId: string; status: string }) =>
      api.patch(`/loads/${loadId}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tracking-loads"] }),
  });

  const toggleExpand = (loadId: string) => {
    setExpandedLoadId(expandedLoadId === loadId ? null : loadId);
  };

  const getStepIndex = (status: string) => {
    // Map PICKED_UP to LOADED for pipeline display
    const mapped = status === "PICKED_UP" ? "LOADED" : status;
    return LOAD_PIPELINE.indexOf(mapped);
  };

  const downloadBol = async (loadId: string, refNum: string) => {
    const res = await api.get(`/pdf/bol-load/${loadId}`, { responseType: "blob" });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement("a"); a.href = url; a.download = `BOL-${refNum}.pdf`; a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Track & Trace</h1>
          <p className="text-sm text-slate-400 mt-1">Load tracking, check calls, ELD monitoring & GPS</p>
        </div>
        <span className="flex items-center gap-1.5 px-2 py-1 bg-green-500/10 rounded text-xs text-green-400">
          <Radio className="w-3 h-3" /> Live Tracking
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/5 rounded-lg p-1 w-fit">
        <button onClick={() => setTab("loads")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all cursor-pointer ${tab === "loads" ? "bg-gold text-navy" : "text-slate-400 hover:text-white"}`}>
          <Package className="w-3.5 h-3.5" /> Active Loads ({trackedLoads.length})
        </button>
        <button onClick={() => setTab("eld")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all cursor-pointer ${tab === "eld" ? "bg-gold text-navy" : "text-slate-400 hover:text-white"}`}>
          <Signal className="w-3.5 h-3.5" /> ELD Monitor
        </button>
      </div>

      {/* ═══ LOADS TAB ═══ */}
      {tab === "loads" && (
        <>
          {/* Filters */}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by load ref #, city, or carrier..."
                className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white">
              <option value="" className="bg-navy">Active Loads</option>
              {LOAD_PIPELINE.map(s => <option key={s} value={s} className="bg-navy">{STATUS_LABELS[s]}</option>)}
              <option value="TONU" className="bg-navy">TONU</option>
              <option value="CANCELLED" className="bg-navy">Cancelled</option>
            </select>
          </div>

          {/* Load Table */}
          <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-white/10">
                  <th className="text-left px-4 py-3 font-medium w-8"></th>
                  <th className="text-left px-4 py-3 font-medium">Load</th>
                  <th className="text-left px-4 py-3 font-medium">Route</th>
                  <th className="text-left px-4 py-3 font-medium">Carrier</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Pickup</th>
                  <th className="text-left px-4 py-3 font-medium">Delivery</th>
                  <th className="text-right px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {trackedLoads.map((load) => {
                  const isExpanded = expandedLoadId === load.id;
                  const shipment = load.shipments?.[0];
                  return (
                    <LoadRow
                      key={load.id}
                      load={load}
                      shipment={shipment}
                      isExpanded={isExpanded}
                      checkCalls={isExpanded ? checkCalls : undefined}
                      canUpdate={canUpdate}
                      onToggle={() => toggleExpand(load.id)}
                      onAddCheckCall={() => { setShowCheckCallForm(load.id); setExpandedLoadId(load.id); }}
                      onDownloadBol={() => downloadBol(load.id, load.referenceNumber)}
                      onUpdateStatus={(status) => updateLoadStatus.mutate({ loadId: load.id, status })}
                    />
                  );
                })}
                {trackedLoads.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-500">No active loads being tracked</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Check Call Form Modal */}
          {showCheckCallForm && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
              <div className="bg-navy border border-white/10 rounded-2xl w-full max-w-lg p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <PhoneCall className="w-5 h-5 text-gold" /> New Check Call
                  </h2>
                  <button onClick={() => setShowCheckCallForm(null)} className="text-slate-400 hover:text-white">&times;</button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Status</label>
                    <select value={ccForm.status} onChange={(e) => setCcForm(f => ({ ...f, status: e.target.value }))}
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white">
                      {CHECK_CALL_STATUSES.map(s => <option key={s} value={s} className="bg-navy">{s.replace(/_/g, " ")}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Method</label>
                    <select value={ccForm.method} onChange={(e) => setCcForm(f => ({ ...f, method: e.target.value }))}
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white">
                      {CHECK_CALL_METHODS.map(m => <option key={m} value={m} className="bg-navy">{m.replace(/_/g, " ")}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Location</label>
                  <input value={ccForm.location} onChange={(e) => setCcForm(f => ({ ...f, location: e.target.value }))}
                    placeholder="e.g. I-94 rest area, mile marker 42" className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">City</label>
                    <input value={ccForm.city} onChange={(e) => setCcForm(f => ({ ...f, city: e.target.value }))}
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">State</label>
                    <input value={ccForm.state} onChange={(e) => setCcForm(f => ({ ...f, state: e.target.value }))} maxLength={2}
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Notes</label>
                  <textarea value={ccForm.notes} onChange={(e) => setCcForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                    placeholder="Driver confirmed on schedule..." className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
                </div>

                <button
                  onClick={() => createCheckCall.mutate({ loadId: showCheckCallForm, ...ccForm })}
                  disabled={createCheckCall.isPending}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50">
                  <Send className="w-4 h-4" /> Log Check Call
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══ ELD TAB ═══ */}
      {tab === "eld" && (
        <>
          {eldOverview && (
            <div className="grid sm:grid-cols-4 gap-4">
              <div className="bg-white/5 rounded-xl border border-white/10 p-5">
                <div className="flex items-center gap-2 text-gold mb-1"><Activity className="w-4 h-4" /><span className="text-xs text-slate-500">Active Drivers</span></div>
                <p className="text-2xl font-bold text-white">{eldOverview.activeDrivers}</p>
              </div>
              <div className="bg-white/5 rounded-xl border border-white/10 p-5">
                <div className="flex items-center gap-2 text-gold mb-1"><Truck className="w-4 h-4" /><span className="text-xs text-slate-500">Active Vehicles</span></div>
                <p className="text-2xl font-bold text-white">{eldOverview.activeVehicles}</p>
              </div>
              <div className="bg-white/5 rounded-xl border border-white/10 p-5">
                <div className="flex items-center gap-2 text-gold mb-1"><Signal className="w-4 h-4" /><span className="text-xs text-slate-500">Connected ELDs</span></div>
                <p className="text-2xl font-bold text-white">{eldOverview.connectedDevices}</p>
              </div>
              <div className={`bg-white/5 rounded-xl border p-5 ${eldOverview.hosViolations > 0 ? "border-red-500/30" : "border-white/10"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className={`w-4 h-4 ${eldOverview.hosViolations > 0 ? "text-red-400" : "text-green-400"}`} />
                  <span className="text-xs text-slate-500">HOS Violations</span>
                </div>
                <p className={`text-2xl font-bold ${eldOverview.hosViolations > 0 ? "text-red-400" : "text-green-400"}`}>{eldOverview.hosViolations}</p>
              </div>
            </div>
          )}

          {eldOverview?.providers && (
            <div className="grid sm:grid-cols-3 gap-3">
              {eldOverview.providers.map((p) => (
                <div key={p.name} className="bg-white/5 rounded-xl border border-white/10 p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white font-medium">{p.name}</p>
                    <p className="text-xs text-slate-500">{p.devices} device{p.devices !== 1 ? "s" : ""}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${p.connected ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                    {p.connected ? "Connected" : "Offline"}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="bg-white/5 rounded-xl border border-white/10">
            <div className="px-5 py-4 border-b border-white/10">
              <h2 className="font-semibold text-white flex items-center gap-2">
                <MapPin className="w-4 h-4 text-gold" /> Live Driver Locations
              </h2>
              <p className="text-xs text-slate-500 mt-1">GPS data from connected ELD devices (refreshes every 30s)</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-400 border-b border-white/10">
                    <th className="text-left px-5 py-3 font-medium">Driver</th>
                    <th className="text-left px-5 py-3 font-medium">Status</th>
                    <th className="text-left px-5 py-3 font-medium">Location</th>
                    <th className="text-right px-5 py-3 font-medium">Speed</th>
                    <th className="text-left px-5 py-3 font-medium">Heading</th>
                    <th className="text-right px-5 py-3 font-medium">Coordinates</th>
                  </tr>
                </thead>
                <tbody>
                  {driverLocations?.map((dl) => (
                    <tr key={dl.driverId} className="border-b border-white/5">
                      <td className="px-5 py-3 text-white font-medium">{dl.driverName}</td>
                      <td className="px-5 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${dl.status === "ON_ROUTE" ? "bg-blue-500/20 text-blue-400" : "bg-green-500/20 text-green-400"}`}>
                          {dl.status === "ON_ROUTE" ? "Driving" : "Available"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-300">{dl.location.address}</td>
                      <td className="px-5 py-3 text-right text-slate-300">{dl.location.speed} mph</td>
                      <td className="px-5 py-3 text-slate-300">{dl.location.heading}</td>
                      <td className="px-5 py-3 text-right text-slate-500 font-mono text-xs">
                        {dl.location.latitude.toFixed(4)}, {dl.location.longitude.toFixed(4)}
                      </td>
                    </tr>
                  ))}
                  {(!driverLocations || driverLocations.length === 0) && (
                    <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-500">No active drivers with ELD data</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-gold/5 border border-gold/20 rounded-xl p-5">
            <h3 className="font-semibold text-gold text-sm mb-2">ELD Integration Status</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              SRL&apos;s ELD monitoring system is pre-configured for Motive (KeepTruckin), Samsara, and Omnitracs.
              When API keys are added, the system will display real-time GPS tracking, HOS compliance data,
              DVIR reports, and fuel analytics from each provider. Currently showing simulated data for demonstration.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/* ═══ Load Row Component ═══ */

function LoadRow({
  load, shipment, isExpanded, checkCalls, canUpdate,
  onToggle, onAddCheckCall, onDownloadBol, onUpdateStatus,
}: {
  load: TrackedLoad;
  shipment?: { id: string; shipmentNumber: string; lastLocation: string | null; lastLocationAt: string | null; eta: string | null };
  isExpanded: boolean;
  checkCalls?: CheckCall[];
  canUpdate: boolean;
  onToggle: () => void;
  onAddCheckCall: () => void;
  onDownloadBol: () => void;
  onUpdateStatus: (status: string) => void;
}) {
  const pipelineIdx = (() => {
    const mapped = load.status === "PICKED_UP" ? "LOADED" : load.status;
    return LOAD_PIPELINE.indexOf(mapped);
  })();
  const progressPct = Math.max(0, Math.min(100, ((pipelineIdx + 1) / LOAD_PIPELINE.length) * 100));

  return (
    <>
      {/* Main Row */}
      <tr className={`border-b cursor-pointer transition ${isExpanded ? "border-gold/30 bg-white/[0.02]" : "border-white/5 hover:bg-white/[0.02]"}`}
        onClick={onToggle}>
        <td className="px-4 py-3">
          {isExpanded ? <ChevronDown className="w-4 h-4 text-gold" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
        </td>
        <td className="px-4 py-3">
          <p className="font-mono text-sm text-white">{load.referenceNumber}</p>
          {shipment && <p className="text-xs text-slate-500">{shipment.shipmentNumber}</p>}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5 text-sm text-slate-300">
            <MapPin className="w-3 h-3 text-gold shrink-0" />
            <span>{load.originCity}, {load.originState}</span>
            <span className="text-slate-600">&rarr;</span>
            <span>{load.destCity}, {load.destState}</span>
          </div>
        </td>
        <td className="px-4 py-3">
          {load.carrier ? (
            <div>
              <p className="text-sm text-white">{load.carrier.company || `${load.carrier.firstName} ${load.carrier.lastName}`}</p>
              {load.carrier.phone && <p className="text-xs text-slate-500">{load.carrier.phone}</p>}
            </div>
          ) : <span className="text-xs text-slate-500">Unassigned</span>}
        </td>
        <td className="px-4 py-3">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[load.status] || ""}`}>
            {STATUS_LABELS[load.status] || load.status}
          </span>
          {shipment?.lastLocation && (
            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
              <MapPin className="w-2.5 h-2.5" /> {shipment.lastLocation}
            </p>
          )}
        </td>
        <td className="px-4 py-3 text-sm text-slate-300">{new Date(load.pickupDate).toLocaleDateString()}</td>
        <td className="px-4 py-3 text-sm text-slate-300">{new Date(load.deliveryDate).toLocaleDateString()}</td>
        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-end gap-1">
            {canUpdate && (
              <button onClick={onAddCheckCall} title="Log Check Call"
                className="p-1.5 text-gold hover:bg-gold/10 rounded">
                <PhoneCall className="w-3.5 h-3.5" />
              </button>
            )}
            <button onClick={onDownloadBol} title="Download BOL"
              className="p-1.5 text-slate-400 hover:bg-white/10 rounded">
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      </tr>

      {/* Expanded Detail Row */}
      {isExpanded && (
        <tr className="border-b border-gold/20 bg-white/[0.01]">
          <td colSpan={8} className="px-4 py-4">
            <div className="grid lg:grid-cols-3 gap-4">
              {/* Status Pipeline */}
              <div className="bg-white/5 rounded-lg p-4">
                <h4 className="text-xs font-medium text-slate-400 mb-3">Load Pipeline</h4>
                {/* Progress Bar */}
                <div className="w-full bg-slate-800 rounded-full h-1.5 mb-4">
                  <div className="bg-gold rounded-full h-1.5 transition-all" style={{ width: `${progressPct}%` }} />
                </div>
                <div className="space-y-0">
                  {LOAD_PIPELINE.map((step, i) => {
                    const done = i <= pipelineIdx;
                    const active = i === pipelineIdx;
                    return (
                      <div key={step} className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${done ? (active ? "bg-gold" : "bg-green-500") : "bg-slate-700"}`} />
                        <span className={`text-xs ${done ? (active ? "text-gold font-medium" : "text-green-400") : "text-slate-600"}`}>
                          {STATUS_LABELS[step]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Check Call History */}
              <div className="lg:col-span-2 bg-white/5 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-medium text-slate-400">Check Call Log</h4>
                  {canUpdate && (
                    <button onClick={onAddCheckCall}
                      className="flex items-center gap-1 text-xs text-gold hover:text-gold/80">
                      <Plus className="w-3 h-3" /> Add Check Call
                    </button>
                  )}
                </div>
                {checkCalls && checkCalls.length > 0 ? (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {checkCalls.map((cc) => {
                      const MethodIcon = METHOD_ICONS[cc.method || "PHONE"] || PhoneCall;
                      return (
                        <div key={cc.id} className="flex items-start gap-3 p-2 bg-white/5 rounded-lg">
                          <div className="mt-0.5">
                            <MethodIcon className="w-3.5 h-3.5 text-slate-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[cc.status] || "bg-slate-500/20 text-slate-400"}`}>
                                {cc.status.replace(/_/g, " ")}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {cc.method?.replace(/_/g, " ")}
                              </span>
                              <span className="text-[10px] text-slate-600 ml-auto">
                                {new Date(cc.createdAt).toLocaleString()}
                              </span>
                            </div>
                            {cc.location && (
                              <p className="text-xs text-slate-300 mt-0.5 flex items-center gap-1">
                                <MapPin className="w-2.5 h-2.5" /> {cc.location}
                                {cc.city && ` — ${cc.city}, ${cc.state}`}
                              </p>
                            )}
                            {cc.notes && <p className="text-xs text-slate-400 mt-0.5">{cc.notes}</p>}
                            {cc.calledBy && (
                              <p className="text-[10px] text-slate-500 mt-0.5">by {cc.calledBy.firstName} {cc.calledBy.lastName}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-600 text-xs">
                    No check calls recorded yet
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            {canUpdate && (
              <div className="flex gap-2 mt-3">
                {["AT_PICKUP", "LOADED", "IN_TRANSIT", "AT_DELIVERY", "DELIVERED"].map((s) => {
                  const currentIdx = LOAD_PIPELINE.indexOf(load.status === "PICKED_UP" ? "LOADED" : load.status);
                  const targetIdx = LOAD_PIPELINE.indexOf(s);
                  if (targetIdx <= currentIdx) return null;
                  if (targetIdx > currentIdx + 2) return null; // Only show next 2 statuses
                  return (
                    <button key={s} onClick={() => onUpdateStatus(s)}
                      className="px-3 py-1.5 text-xs bg-white/10 text-slate-300 rounded-lg hover:bg-white/20 hover:text-white transition">
                      {STATUS_LABELS[s]}
                    </button>
                  );
                })}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
