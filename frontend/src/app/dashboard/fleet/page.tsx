"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/hooks/useAuthStore";
import {
  Truck, Plus, Search, X, Wrench, CheckCircle2, AlertTriangle, XCircle,
  ChevronDown, ChevronUp, MapPin, Calendar, Fuel, Shield, Settings2,
} from "lucide-react";

interface TruckData {
  id: string; unitNumber: string; type: string; year: number | null;
  make: string | null; model: string | null; vin: string | null;
  licensePlate: string | null; licensePlateState: string | null;
  fuelType: string | null; ownershipType: string; status: string;
  mileage: number; registrationExpiry: string | null;
  insuranceExpiry: string | null; nextInspectionDate: string | null;
  nextServiceDate: string | null; nextServiceMileage: number | null;
  assignedDriver: { id: string; firstName: string; lastName: string } | null;
  createdAt: string;
}

interface TrailerData {
  id: string; unitNumber: string; type: string; year: number | null;
  make: string | null; model: string | null; length: number | null;
  capacity: number | null; ownershipType: string; status: string;
  reeferUnit: boolean; reeferModel: string | null;
  registrationExpiry: string | null; nextInspectionDate: string | null;
  assignedDriver: { id: string; firstName: string; lastName: string } | null;
  createdAt: string;
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  ACTIVE: <CheckCircle2 className="w-4 h-4 text-green-400" />,
  IN_SHOP: <Wrench className="w-4 h-4 text-yellow-400" />,
  OUT_OF_SERVICE: <XCircle className="w-4 h-4 text-red-400" />,
  SOLD: <AlertTriangle className="w-4 h-4 text-slate-400" />,
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-500/20 text-green-400",
  IN_SHOP: "bg-yellow-500/20 text-yellow-400",
  OUT_OF_SERVICE: "bg-red-500/20 text-red-400",
  SOLD: "bg-slate-500/20 text-slate-400",
};

const TRUCK_TYPES = ["DAY_CAB", "SLEEPER", "STRAIGHT", "BOX_TRUCK"];
const TRAILER_TYPES = ["DRY_VAN", "REEFER", "FLATBED", "STEP_DECK", "LOWBOY", "TANKER", "CAR_HAULER", "CONESTOGA"];

function isExpiringSoon(date: string | null) {
  if (!date) return false;
  const d = new Date(date);
  const thirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return d <= thirtyDays;
}

function isExpired(date: string | null) {
  if (!date) return false;
  return new Date(date) <= new Date();
}

export default function FleetPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const canManage = ["ADMIN", "OPERATIONS", "CEO"].includes(user?.role || "");
  const [tab, setTab] = useState<"trucks" | "trailers">("trucks");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState<Record<string, string>>({});

  const { data: truckData } = useQuery({
    queryKey: ["trucks", search, statusFilter, typeFilter],
    queryFn: () => {
      const p = new URLSearchParams();
      if (search) p.set("search", search);
      if (statusFilter) p.set("status", statusFilter);
      if (typeFilter) p.set("type", typeFilter);
      return api.get<{ trucks: TruckData[]; total: number }>(`/fleet/trucks?${p}`).then(r => r.data);
    },
    enabled: tab === "trucks",
  });

  const { data: trailerData } = useQuery({
    queryKey: ["trailers", search, statusFilter, typeFilter],
    queryFn: () => {
      const p = new URLSearchParams();
      if (search) p.set("search", search);
      if (statusFilter) p.set("status", statusFilter);
      if (typeFilter) p.set("type", typeFilter);
      return api.get<{ trailers: TrailerData[]; total: number }>(`/fleet/trailers?${p}`).then(r => r.data);
    },
    enabled: tab === "trailers",
  });

  const { data: overview } = useQuery({
    queryKey: ["fleet-overview"],
    queryFn: () => api.get("/fleet/overview").then(r => r.data),
  });

  const createTruck = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post("/fleet/trucks", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["trucks"] }); queryClient.invalidateQueries({ queryKey: ["fleet-overview"] }); setShowCreate(false); setForm({}); },
  });

  const createTrailer = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post("/fleet/trailers", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["trailers"] }); queryClient.invalidateQueries({ queryKey: ["fleet-overview"] }); setShowCreate(false); setForm({}); },
  });

  const handleCreate = () => {
    if (tab === "trucks") {
      createTruck.mutate({
        unitNumber: form.unitNumber, type: form.type || "SLEEPER",
        year: form.year ? parseInt(form.year) : undefined,
        make: form.make || undefined, model: form.model || undefined,
        vin: form.vin || undefined, licensePlate: form.licensePlate || undefined,
        licensePlateState: form.licensePlateState || undefined,
        mileage: form.mileage ? parseInt(form.mileage) : 0,
        ownershipType: form.ownershipType || "COMPANY",
        fuelType: form.fuelType || "Diesel",
      });
    } else {
      createTrailer.mutate({
        unitNumber: form.unitNumber, type: form.type || "DRY_VAN",
        year: form.year ? parseInt(form.year) : undefined,
        make: form.make || undefined, model: form.model || undefined,
        length: form.length ? parseInt(form.length) : undefined,
        capacity: form.capacity ? parseInt(form.capacity) : undefined,
        ownershipType: form.ownershipType || "COMPANY",
        reeferUnit: form.type === "REEFER",
      });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Fleet Management</h1>
          <p className="text-sm text-slate-400 mt-1">
            {overview?.totalTrucks || 0} trucks &middot; {overview?.totalTrailers || 0} trailers
          </p>
        </div>
        {canManage && (
          <button onClick={() => { setShowCreate(true); setForm({}); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90">
            <Plus className="w-4 h-4" /> Add {tab === "trucks" ? "Truck" : "Trailer"}
          </button>
        )}
      </div>

      {/* Overview Stats */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Active Trucks" value={overview?.trucksByStatus?.ACTIVE || 0} color="text-green-400" />
        <StatCard label="In Shop" value={(overview?.trucksByStatus?.IN_SHOP || 0) + (overview?.trailersByStatus?.IN_SHOP || 0)} color="text-yellow-400" />
        <StatCard label="Active Trailers" value={overview?.trailersByStatus?.ACTIVE || 0} color="text-blue-400" />
        <StatCard label="Drivers Assigned" value={overview?.driversAssigned || 0} sub={`of ${overview?.totalDrivers || 0}`} color="text-gold" />
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1 bg-white/5 rounded-lg p-1 w-fit">
        <button onClick={() => { setTab("trucks"); setSearch(""); setStatusFilter(""); setTypeFilter(""); }}
          className={`px-5 py-2 rounded-md text-sm font-medium transition-all cursor-pointer ${tab === "trucks" ? "bg-gold text-navy" : "text-slate-400 hover:text-white"}`}>
          Trucks ({overview?.totalTrucks || 0})
        </button>
        <button onClick={() => { setTab("trailers"); setSearch(""); setStatusFilter(""); setTypeFilter(""); }}
          className={`px-5 py-2 rounded-md text-sm font-medium transition-all cursor-pointer ${tab === "trailers" ? "bg-gold text-navy" : "text-slate-400 hover:text-white"}`}>
          Trailers ({overview?.totalTrailers || 0})
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${tab}...`}
            className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white">
          <option value="" className="bg-navy">All Statuses</option>
          <option value="ACTIVE" className="bg-navy">Active</option>
          <option value="IN_SHOP" className="bg-navy">In Shop</option>
          <option value="OUT_OF_SERVICE" className="bg-navy">Out of Service</option>
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white">
          <option value="" className="bg-navy">All Types</option>
          {(tab === "trucks" ? TRUCK_TYPES : TRAILER_TYPES).map(t => (
            <option key={t} value={t} className="bg-navy">{t.replace(/_/g, " ")}</option>
          ))}
        </select>
      </div>

      {/* Asset List */}
      <div className="space-y-3">
        {tab === "trucks" && truckData?.trucks?.map((truck) => (
          <div key={truck.id} className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
            <button onClick={() => setExpanded(expanded === truck.id ? null : truck.id)}
              className="w-full text-left p-5 hover:bg-white/[0.03] transition">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                    <Truck className="w-6 h-6 text-blue-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-white text-lg">{truck.unitNumber}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1 ${STATUS_COLORS[truck.status] || ""}`}>
                        {STATUS_ICON[truck.status]} {truck.status.replace(/_/g, " ")}
                      </span>
                      <span className="px-2 py-0.5 bg-white/10 rounded text-xs text-slate-300">{truck.ownershipType.replace(/_/g, " ")}</span>
                    </div>
                    <div className="flex flex-wrap gap-4 mt-1.5 text-xs text-slate-400">
                      {truck.year && truck.make && <span>{truck.year} {truck.make} {truck.model || ""}</span>}
                      <span>{truck.type.replace(/_/g, " ")}</span>
                      <span>{truck.mileage.toLocaleString()} mi</span>
                      {truck.assignedDriver && (
                        <span className="text-green-400">Driver: {truck.assignedDriver.firstName} {truck.assignedDriver.lastName}</span>
                      )}
                      {!truck.assignedDriver && <span className="text-yellow-400">Unassigned</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {isExpired(truck.insuranceExpiry) && <AlertTriangle className="w-4 h-4 text-red-400" />}
                  {isExpiringSoon(truck.registrationExpiry) && <AlertTriangle className="w-4 h-4 text-yellow-400" />}
                  {expanded === truck.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </div>
              </div>
            </button>
            {expanded === truck.id && (
              <div className="border-t border-white/10 p-5 bg-white/[0.02]">
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <DetailItem icon={<Shield className="w-3.5 h-3.5" />} label="VIN" value={truck.vin || "—"} />
                  <DetailItem icon={<MapPin className="w-3.5 h-3.5" />} label="Plate" value={truck.licensePlate ? `${truck.licensePlate} (${truck.licensePlateState})` : "—"} />
                  <DetailItem icon={<Fuel className="w-3.5 h-3.5" />} label="Fuel" value={truck.fuelType || "Diesel"} />
                  <DetailItem icon={<Settings2 className="w-3.5 h-3.5" />} label="Next Service" value={truck.nextServiceDate ? new Date(truck.nextServiceDate).toLocaleDateString() : "—"} warn={isExpiringSoon(truck.nextServiceDate)} />
                  <DetailItem icon={<Calendar className="w-3.5 h-3.5" />} label="Registration" value={truck.registrationExpiry ? new Date(truck.registrationExpiry).toLocaleDateString() : "—"} warn={isExpiringSoon(truck.registrationExpiry)} />
                  <DetailItem icon={<Shield className="w-3.5 h-3.5" />} label="Insurance" value={truck.insuranceExpiry ? new Date(truck.insuranceExpiry).toLocaleDateString() : "—"} warn={isExpiringSoon(truck.insuranceExpiry)} />
                  <DetailItem icon={<Calendar className="w-3.5 h-3.5" />} label="Next Inspection" value={truck.nextInspectionDate ? new Date(truck.nextInspectionDate).toLocaleDateString() : "—"} warn={isExpiringSoon(truck.nextInspectionDate)} />
                  <DetailItem label="Mileage" value={`${truck.mileage.toLocaleString()} mi`} />
                </div>
              </div>
            )}
          </div>
        ))}

        {tab === "trailers" && trailerData?.trailers?.map((trailer) => (
          <div key={trailer.id} className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
            <button onClick={() => setExpanded(expanded === trailer.id ? null : trailer.id)}
              className="w-full text-left p-5 hover:bg-white/[0.03] transition">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${trailer.reeferUnit ? "bg-cyan-500/10" : "bg-orange-500/10"}`}>
                    <Truck className={`w-6 h-6 ${trailer.reeferUnit ? "text-cyan-400" : "text-orange-400"}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-white text-lg">{trailer.unitNumber}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1 ${STATUS_COLORS[trailer.status] || ""}`}>
                        {STATUS_ICON[trailer.status]} {trailer.status.replace(/_/g, " ")}
                      </span>
                      <span className="px-2 py-0.5 bg-white/10 rounded text-xs text-slate-300">{trailer.type.replace(/_/g, " ")}</span>
                      {trailer.reeferUnit && <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 rounded text-xs">Reefer</span>}
                    </div>
                    <div className="flex flex-wrap gap-4 mt-1.5 text-xs text-slate-400">
                      {trailer.year && trailer.make && <span>{trailer.year} {trailer.make} {trailer.model || ""}</span>}
                      {trailer.length && <span>{trailer.length}ft</span>}
                      {trailer.capacity && <span>{trailer.capacity.toLocaleString()} lbs cap</span>}
                      {trailer.assignedDriver && (
                        <span className="text-green-400">Driver: {trailer.assignedDriver.firstName} {trailer.assignedDriver.lastName}</span>
                      )}
                    </div>
                  </div>
                </div>
                {expanded === trailer.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </div>
            </button>
            {expanded === trailer.id && (
              <div className="border-t border-white/10 p-5 bg-white/[0.02]">
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <DetailItem label="Registration" value={trailer.registrationExpiry ? new Date(trailer.registrationExpiry).toLocaleDateString() : "—"} warn={isExpiringSoon(trailer.registrationExpiry)} />
                  <DetailItem label="Next Inspection" value={trailer.nextInspectionDate ? new Date(trailer.nextInspectionDate).toLocaleDateString() : "—"} warn={isExpiringSoon(trailer.nextInspectionDate)} />
                  <DetailItem label="Ownership" value={trailer.ownershipType.replace(/_/g, " ")} />
                  {trailer.reeferUnit && <DetailItem label="Reefer Model" value={trailer.reeferModel || "—"} />}
                </div>
              </div>
            )}
          </div>
        ))}

        {((tab === "trucks" && (!truckData?.trucks || truckData.trucks.length === 0)) ||
          (tab === "trailers" && (!trailerData?.trailers || trailerData.trailers.length === 0))) && (
          <div className="text-center py-16 text-slate-500">
            <Truck className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No {tab} found</p>
            {canManage && <p className="text-xs mt-1">Click &quot;Add {tab === "trucks" ? "Truck" : "Trailer"}&quot; to add your first unit</p>}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-navy border border-white/10 rounded-2xl w-full max-w-lg p-6 space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Add {tab === "trucks" ? "Truck" : "Trailer"}</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <FormField label="Unit Number *" value={form.unitNumber || ""} onChange={v => setForm(f => ({ ...f, unitNumber: v }))} />
              <div>
                <label className="block text-xs text-slate-400 mb-1">Type</label>
                <select value={form.type || ""} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white">
                  {(tab === "trucks" ? TRUCK_TYPES : TRAILER_TYPES).map(t => (
                    <option key={t} value={t} className="bg-navy">{t.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>
              <FormField label="Year" value={form.year || ""} onChange={v => setForm(f => ({ ...f, year: v }))} type="number" />
              <FormField label="Make" value={form.make || ""} onChange={v => setForm(f => ({ ...f, make: v }))} />
              <FormField label="Model" value={form.model || ""} onChange={v => setForm(f => ({ ...f, model: v }))} />
              {tab === "trucks" && (
                <>
                  <FormField label="VIN" value={form.vin || ""} onChange={v => setForm(f => ({ ...f, vin: v }))} />
                  <FormField label="License Plate" value={form.licensePlate || ""} onChange={v => setForm(f => ({ ...f, licensePlate: v }))} />
                  <FormField label="Plate State" value={form.licensePlateState || ""} onChange={v => setForm(f => ({ ...f, licensePlateState: v }))} />
                  <FormField label="Mileage" value={form.mileage || ""} onChange={v => setForm(f => ({ ...f, mileage: v }))} type="number" />
                </>
              )}
              {tab === "trailers" && (
                <>
                  <FormField label="Length (ft)" value={form.length || ""} onChange={v => setForm(f => ({ ...f, length: v }))} type="number" />
                  <FormField label="Capacity (lbs)" value={form.capacity || ""} onChange={v => setForm(f => ({ ...f, capacity: v }))} type="number" />
                </>
              )}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Ownership</label>
                <select value={form.ownershipType || "COMPANY"} onChange={e => setForm(f => ({ ...f, ownershipType: e.target.value }))}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white">
                  <option value="COMPANY" className="bg-navy">Company</option>
                  <option value="LEASED" className="bg-navy">Leased</option>
                  <option value="OWNER_OPERATOR" className="bg-navy">Owner Operator</option>
                </select>
              </div>
            </div>
            <button onClick={handleCreate} disabled={!form.unitNumber || createTruck.isPending || createTrailer.isPending}
              className="w-full px-4 py-2.5 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50">
              {(createTruck.isPending || createTrailer.isPending) ? "Creating..." : `Add ${tab === "trucks" ? "Truck" : "Trailer"}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color: string }) {
  return (
    <div className="bg-white/5 rounded-xl border border-white/10 p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <div className="flex items-baseline gap-2 mt-1">
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
        {sub && <span className="text-sm text-slate-500">{sub}</span>}
      </div>
    </div>
  );
}

function DetailItem({ icon, label, value, warn }: { icon?: React.ReactNode; label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-xs text-slate-500 mb-0.5">{icon}{label}</div>
      <p className={`text-sm ${warn ? "text-red-400 font-medium" : "text-white"}`}>{value}</p>
    </div>
  );
}

function FormField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
    </div>
  );
}
