"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/hooks/useAuthStore";
import { isCarrier } from "@/lib/roles";
import {
  Search, MapPin, Clock, CheckCircle2, Circle, Truck, Package, Download,
  ChevronRight, Radio, Activity, AlertTriangle, Signal,
} from "lucide-react";

interface Shipment {
  id: string; shipmentNumber: string; proNumber: string | null; bolNumber: string | null;
  status: string; originCity: string; originState: string; destCity: string; destState: string;
  weight: number | null; commodity: string | null; equipmentType: string; rate: number;
  pickupDate: string; deliveryDate: string; lastLocation: string | null; lastLocationAt: string | null; eta: string | null;
  driver?: { firstName: string; lastName: string } | null;
  equipment?: { unitNumber: string; type: string } | null;
  customer?: { name: string } | null;
}

interface ELDOverview {
  activeDrivers: number;
  activeVehicles: number;
  hosViolations: number;
  connectedDevices: number;
  lastSync: string;
  providers: { name: string; connected: boolean; devices: number }[];
}

interface DriverLocation {
  driverId: string;
  driverName: string;
  status: string;
  location: { latitude: number; longitude: number; address: string; speed: number; heading: string; timestamp: string };
}

const statusSteps = ["PENDING", "BOOKED", "DISPATCHED", "PICKED_UP", "IN_TRANSIT", "DELIVERED"];
const statusLabels: Record<string, string> = {
  PENDING: "Pending", BOOKED: "Booked", DISPATCHED: "Dispatched", PICKED_UP: "Picked Up",
  IN_TRANSIT: "In Transit", DELIVERED: "Delivered", COMPLETED: "Completed",
};
const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-slate-500/20 text-slate-400", BOOKED: "bg-blue-500/20 text-blue-400",
  DISPATCHED: "bg-orange-500/20 text-orange-400", PICKED_UP: "bg-yellow-500/20 text-yellow-400",
  IN_TRANSIT: "bg-cyan-500/20 text-cyan-400", DELIVERED: "bg-green-500/20 text-green-400",
  COMPLETED: "bg-emerald-500/20 text-emerald-400",
};

const NEXT_STATUS: Record<string, string> = {
  PENDING: "BOOKED", BOOKED: "DISPATCHED", DISPATCHED: "PICKED_UP",
  PICKED_UP: "IN_TRANSIT", IN_TRANSIT: "DELIVERED",
};

type Tab = "shipments" | "eld";

export default function TrackingPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const canUpdate = !isCarrier(user?.role);
  const [tab, setTab] = useState<Tab>("shipments");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<Shipment | null>(null);

  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (statusFilter) params.set("status", statusFilter);

  const { data } = useQuery({
    queryKey: ["shipments", search, statusFilter],
    queryFn: () => api.get<{ shipments: Shipment[]; total: number }>(`/shipments?${params.toString()}`).then((r) => r.data),
    enabled: tab === "shipments",
  });

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

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/shipments/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipments"] });
      if (selected) {
        const nextStatus = NEXT_STATUS[selected.status];
        if (nextStatus) setSelected({ ...selected, status: nextStatus });
      }
    },
  });

  const downloadBOL = async (shipmentId: string, shipmentNumber: string) => {
    const res = await api.get(`/pdf/bol/${shipmentId}`, { responseType: "blob" });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement("a");
    a.href = url; a.download = `BOL-${shipmentNumber}.pdf`; a.click();
    window.URL.revokeObjectURL(url);
  };

  const getStepIndex = (status: string) => statusSteps.indexOf(status);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Track & Trace</h1>
          <p className="text-sm text-slate-400 mt-1">Shipment tracking, ELD monitoring, and GPS locations</p>
        </div>
        <span className="flex items-center gap-1.5 px-2 py-1 bg-green-500/10 rounded text-xs text-green-400">
          <Radio className="w-3 h-3" /> Live Tracking
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/5 rounded-lg p-1 w-fit">
        <button onClick={() => setTab("shipments")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition ${tab === "shipments" ? "bg-gold text-navy" : "text-slate-400 hover:text-white"}`}>
          <Package className="w-3.5 h-3.5" /> Shipments ({data?.total || 0})
        </button>
        <button onClick={() => setTab("eld")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition ${tab === "eld" ? "bg-gold text-navy" : "text-slate-400 hover:text-white"}`}>
          <Signal className="w-3.5 h-3.5" /> ELD Monitor
        </button>
      </div>

      {/* ═══ SHIPMENTS TAB ═══ */}
      {tab === "shipments" && (
        <>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by shipment #, PRO #, or BOL #..."
                className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white">
              <option value="" className="bg-navy">All Statuses</option>
              {statusSteps.map(s => <option key={s} value={s} className="bg-navy">{statusLabels[s]}</option>)}
              <option value="COMPLETED" className="bg-navy">Completed</option>
            </select>
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            {/* Shipment List */}
            <div className="lg:col-span-2 space-y-3">
              {data?.shipments?.map((s) => (
                <button key={s.id} onClick={() => setSelected(s)}
                  className={`w-full text-left bg-white/5 rounded-xl border p-5 transition ${selected?.id === s.id ? "border-gold" : "border-white/10 hover:border-white/20"}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-white">{s.shipmentNumber}</p>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[s.status] || ""}`}>{statusLabels[s.status] || s.status}</span>
                      </div>
                      <p className="text-xs text-slate-500">{s.proNumber && `PRO: ${s.proNumber}`} {s.bolNumber && `| BOL: ${s.bolNumber}`}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gold">${s.rate.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-300 mb-2">
                    <MapPin className="w-3.5 h-3.5 text-gold shrink-0" />
                    <span>{s.originCity}, {s.originState}</span>
                    <span className="text-slate-500">&rarr;</span>
                    <span>{s.destCity}, {s.destState}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    {s.driver && <span className="flex items-center gap-1"><Truck className="w-3 h-3" /> {s.driver.firstName} {s.driver.lastName}</span>}
                    {s.equipment && <span className="flex items-center gap-1"><Package className="w-3 h-3" /> {s.equipment.unitNumber}</span>}
                    {s.eta && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> ETA: {new Date(s.eta).toLocaleDateString()}</span>}
                    {s.customer && <span>Customer: {s.customer.name}</span>}
                  </div>
                </button>
              ))}
              {(!data?.shipments || data.shipments.length === 0) && (
                <div className="text-center py-12 text-slate-500">No shipments found</div>
              )}
            </div>

            {/* Detail Panel */}
            <div className="space-y-4">
              {selected ? (
                <>
                  <div className="bg-white/5 rounded-xl border border-white/10 p-5">
                    <h3 className="font-semibold text-white text-sm mb-4">Status Timeline</h3>
                    <div className="space-y-0">
                      {statusSteps.map((step, i) => {
                        const currentIdx = getStepIndex(selected.status);
                        const done = i <= currentIdx;
                        const active = i === currentIdx;
                        return (
                          <div key={step} className="flex items-start gap-3">
                            <div className="flex flex-col items-center">
                              {done ? <CheckCircle2 className={`w-5 h-5 ${active ? "text-gold" : "text-green-400"}`} /> : <Circle className="w-5 h-5 text-slate-600" />}
                              {i < statusSteps.length - 1 && <div className={`w-0.5 h-6 ${done ? "bg-green-400/50" : "bg-slate-700"}`} />}
                            </div>
                            <div className="pb-4">
                              <p className={`text-sm ${done ? "text-white font-medium" : "text-slate-500"}`}>{statusLabels[step]}</p>
                              {active && selected.lastLocation && <p className="text-xs text-gold mt-0.5">Current — {selected.lastLocation}</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Status Update Buttons */}
                  {canUpdate && NEXT_STATUS[selected.status] && (
                    <button onClick={() => updateStatus.mutate({ id: selected.id, status: NEXT_STATUS[selected.status] })}
                      disabled={updateStatus.isPending}
                      className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-blue-500/20 text-blue-400 font-medium rounded-lg text-sm hover:bg-blue-500/30 disabled:opacity-50">
                      <ChevronRight className="w-4 h-4" /> {statusLabels[NEXT_STATUS[selected.status]] || NEXT_STATUS[selected.status]}
                    </button>
                  )}

                  <div className="bg-white/5 rounded-xl border border-white/10 p-5">
                    <h3 className="font-semibold text-white text-sm mb-3">Details</h3>
                    <div className="space-y-2 text-sm">
                      <Row label="Shipment #" value={selected.shipmentNumber} />
                      {selected.proNumber && <Row label="PRO #" value={selected.proNumber} />}
                      {selected.bolNumber && <Row label="BOL #" value={selected.bolNumber} />}
                      {selected.driver && <Row label="Driver" value={`${selected.driver.firstName} ${selected.driver.lastName}`} />}
                      {selected.equipment && <Row label="Equipment" value={`${selected.equipment.unitNumber} — ${selected.equipment.type}`} />}
                      <Row label="Pickup" value={new Date(selected.pickupDate).toLocaleDateString()} />
                      <Row label="Delivery" value={new Date(selected.deliveryDate).toLocaleDateString()} />
                      {selected.lastLocation && <Row label="Last Location" value={selected.lastLocation} />}
                      {selected.lastLocationAt && <Row label="Updated" value={new Date(selected.lastLocationAt).toLocaleString()} />}
                    </div>
                  </div>

                  <button onClick={() => downloadBOL(selected.id, selected.shipmentNumber)}
                    className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90">
                    <Download className="w-4 h-4" /> Download BOL
                  </button>
                </>
              ) : (
                <div className="bg-white/5 rounded-xl border border-white/10 p-12 text-center">
                  <Truck className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                  <p className="text-sm text-slate-500">Select a shipment to view details</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ═══ ELD TAB ═══ */}
      {tab === "eld" && (
        <>
          {/* ELD Overview Stats */}
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

          {/* ELD Providers */}
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

          {/* Driver Locations */}
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

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span className="text-slate-400">{label}</span><span className="text-white">{value}</span></div>;
}
