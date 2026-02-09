"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Search, User, Truck, Clock, AlertTriangle, CheckCircle2, Phone, MapPin, Shield, Package, Plus, X } from "lucide-react";

interface Driver {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  licenseType: string;
  licenseNumber: string | null;
  licenseExpiry: string;
  status: string;
  currentLocation: string | null;
  hosDrivingUsed: number;
  hosOnDutyUsed: number;
  hosCycleUsed: number;
  hosCycleLimit: number;
  hireDate: string;
  violations: number;
  safetyScore: number;
  assignedEquipment?: { id: string; unitNumber: string; type: string; make: string; model: string | null } | null;
}

interface Equipment {
  id: string;
  unitNumber: string;
  type: string;
  year: number | null;
  make: string;
  model: string | null;
  vin: string | null;
  status: string;
  mileage: number | null;
  nextServiceDate: string | null;
  assignedDriver?: { id: string; firstName: string; lastName: string } | null;
}

interface DriverStats {
  totalDrivers: number;
  onRoute: number;
  available: number;
  offDuty: number;
  avgSafetyScore: number;
}

const STATUS_COLORS: Record<string, string> = {
  AVAILABLE: "bg-green-500/20 text-green-400",
  ON_ROUTE: "bg-blue-500/20 text-blue-400",
  OFF_DUTY: "bg-slate-500/20 text-slate-400",
  SLEEPER: "bg-purple-500/20 text-purple-400",
  ACTIVE: "bg-green-500/20 text-green-400",
  IN_SHOP: "bg-yellow-500/20 text-yellow-400",
  OUT_OF_SERVICE: "bg-red-500/20 text-red-400",
};

const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: "Available",
  ON_ROUTE: "On Route",
  OFF_DUTY: "Off Duty",
  SLEEPER: "Sleeper",
  ACTIVE: "Active",
  IN_SHOP: "In Shop",
  OUT_OF_SERVICE: "Out of Service",
};

type Tab = "drivers" | "equipment";

export default function DriversPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("drivers");
  const [search, setSearch] = useState("");
  const [showAddDriver, setShowAddDriver] = useState(false);
  const [showAddEquipment, setShowAddEquipment] = useState(false);
  const [driverForm, setDriverForm] = useState({
    firstName: "", lastName: "", phone: "", email: "", licenseType: "CDL-A",
    licenseNumber: "", licenseExpiry: "", status: "AVAILABLE", currentLocation: "",
  });
  const [equipForm, setEquipForm] = useState({
    unitNumber: "", type: "Dry Van", year: "", make: "", model: "", vin: "", status: "ACTIVE", mileage: "",
  });

  const { data: stats } = useQuery({
    queryKey: ["driver-stats"],
    queryFn: () => api.get<DriverStats>("/drivers/stats").then((r) => r.data),
  });

  const { data: driversData } = useQuery({
    queryKey: ["drivers", search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      params.set("limit", "50");
      return api.get<{ drivers: Driver[]; total: number }>(`/drivers?${params.toString()}`).then((r) => r.data);
    },
  });

  const { data: equipData } = useQuery({
    queryKey: ["equipment", search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      params.set("limit", "50");
      return api.get<{ equipment: Equipment[]; total: number }>(`/equipment?${params.toString()}`).then((r) => r.data);
    },
  });

  const createDriver = useMutation({
    mutationFn: () => api.post("/drivers", {
      ...driverForm,
      licenseExpiry: driverForm.licenseExpiry ? new Date(driverForm.licenseExpiry).toISOString() : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      queryClient.invalidateQueries({ queryKey: ["driver-stats"] });
      setShowAddDriver(false);
      setDriverForm({ firstName: "", lastName: "", phone: "", email: "", licenseType: "CDL-A", licenseNumber: "", licenseExpiry: "", status: "AVAILABLE", currentLocation: "" });
    },
  });

  const createEquipment = useMutation({
    mutationFn: () => api.post("/equipment", {
      ...equipForm,
      year: equipForm.year ? parseInt(equipForm.year) : undefined,
      mileage: equipForm.mileage ? parseInt(equipForm.mileage) : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipment"] });
      setShowAddEquipment(false);
      setEquipForm({ unitNumber: "", type: "Dry Van", year: "", make: "", model: "", vin: "", status: "ACTIVE", mileage: "" });
    },
  });

  const drivers = driversData?.drivers || [];
  const equipment = equipData?.equipment || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Driver & Equipment Management</h1>
        <button
          onClick={() => tab === "drivers" ? setShowAddDriver(true) : setShowAddEquipment(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90"
        >
          <Plus className="w-4 h-4" /> {tab === "drivers" ? "Add Driver" : "Add Equipment"}
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid sm:grid-cols-4 gap-4">
        <div className="bg-white/5 rounded-xl border border-white/10 p-5">
          <p className="text-sm text-slate-400">Total Drivers</p>
          <p className="text-2xl font-bold mt-1 text-white">{stats?.totalDrivers || 0}</p>
        </div>
        <div className="bg-white/5 rounded-xl border border-white/10 p-5">
          <p className="text-sm text-slate-400">On Route</p>
          <p className="text-2xl font-bold mt-1 text-blue-400">{stats?.onRoute || 0}</p>
        </div>
        <div className="bg-white/5 rounded-xl border border-white/10 p-5">
          <p className="text-sm text-slate-400">Available</p>
          <p className="text-2xl font-bold mt-1 text-green-400">{stats?.available || 0}</p>
        </div>
        <div className="bg-white/5 rounded-xl border border-white/10 p-5">
          <p className="text-sm text-slate-400">Avg Safety Score</p>
          <p className="text-2xl font-bold mt-1 text-gold">{stats?.avgSafetyScore || 0}%</p>
        </div>
      </div>

      {/* Tabs & Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex bg-white/5 rounded-lg p-1">
          <button onClick={() => { setTab("drivers"); setSearch(""); }}
            className={`px-5 py-2 rounded-md text-sm font-medium transition ${tab === "drivers" ? "bg-gold text-navy" : "text-slate-400 hover:text-white"}`}>
            Drivers ({driversData?.total || 0})
          </button>
          <button onClick={() => { setTab("equipment"); setSearch(""); }}
            className={`px-5 py-2 rounded-md text-sm font-medium transition ${tab === "equipment" ? "bg-gold text-navy" : "text-slate-400 hover:text-white"}`}>
            Equipment ({equipData?.total || 0})
          </button>
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === "drivers" ? "Search drivers..." : "Search equipment..."}
            className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
        </div>
      </div>

      {/* Drivers Tab */}
      {tab === "drivers" && (
        <div className="space-y-3">
          {drivers.map((d) => (
            <div key={d.id} className="bg-white/5 rounded-xl border border-white/10 p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-gold/10 flex items-center justify-center shrink-0">
                    <User className="w-5 h-5 text-gold" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-white">{d.firstName} {d.lastName}</p>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[d.status] || ""}`}>
                        {STATUS_LABELS[d.status] || d.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                      {d.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {d.phone}</span>}
                      {d.currentLocation && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {d.currentLocation}</span>}
                      <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> {d.licenseType} — Exp: {new Date(d.licenseExpiry).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1">
                    <Shield className={`w-4 h-4 ${d.safetyScore >= 95 ? "text-green-400" : d.safetyScore >= 90 ? "text-amber-400" : "text-red-400"}`} />
                    <span className="text-sm font-bold text-white">{d.safetyScore}%</span>
                  </div>
                  <p className="text-xs text-slate-500">Safety Score</p>
                </div>
              </div>

              {/* HOS Bars */}
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">Driving</span>
                    <span className="font-medium text-slate-300">{d.hosDrivingUsed}h / 11h</span>
                  </div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${d.hosDrivingUsed > 9 ? "bg-red-500" : d.hosDrivingUsed > 7 ? "bg-amber-500" : "bg-green-500"}`}
                      style={{ width: `${(d.hosDrivingUsed / 11) * 100}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">On-Duty</span>
                    <span className="font-medium text-slate-300">{d.hosOnDutyUsed}h / 14h</span>
                  </div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${d.hosOnDutyUsed > 12 ? "bg-red-500" : d.hosOnDutyUsed > 10 ? "bg-amber-500" : "bg-blue-500"}`}
                      style={{ width: `${(d.hosOnDutyUsed / 14) * 100}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">Cycle</span>
                    <span className="font-medium text-slate-300">{d.hosCycleUsed}h / {d.hosCycleLimit}h</span>
                  </div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${d.hosCycleUsed > 60 ? "bg-amber-500" : "bg-indigo-500"}`}
                      style={{ width: `${(d.hosCycleUsed / d.hosCycleLimit) * 100}%` }} />
                  </div>
                </div>
              </div>

              {/* Bottom row */}
              <div className="flex items-center gap-4 mt-4 text-xs text-slate-400">
                {d.assignedEquipment && (
                  <span className="flex items-center gap-1"><Truck className="w-3 h-3" /> {d.assignedEquipment.unitNumber} — {d.assignedEquipment.make}</span>
                )}
                {d.violations > 0 && <span className="flex items-center gap-1 text-red-400"><AlertTriangle className="w-3 h-3" /> {d.violations} violation(s)</span>}
                {d.violations === 0 && <span className="flex items-center gap-1 text-green-400"><CheckCircle2 className="w-3 h-3" /> Clean record</span>}
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Hired: {new Date(d.hireDate).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
          {drivers.length === 0 && (
            <div className="text-center py-12 text-slate-500">No drivers found</div>
          )}
        </div>
      )}

      {/* Equipment Tab */}
      {tab === "equipment" && (
        <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-white/10">
                <th className="text-left px-5 py-3 font-medium">Unit</th>
                <th className="text-left px-5 py-3 font-medium">Type</th>
                <th className="text-left px-5 py-3 font-medium">Year / Make</th>
                <th className="text-left px-5 py-3 font-medium">Status</th>
                <th className="text-left px-5 py-3 font-medium">Mileage</th>
                <th className="text-left px-5 py-3 font-medium">Next Service</th>
                <th className="text-left px-5 py-3 font-medium">Assigned To</th>
              </tr>
            </thead>
            <tbody>
              {equipment.map((e) => (
                <tr key={e.id} className="border-b border-white/5">
                  <td className="px-5 py-3 font-medium text-white">{e.unitNumber}</td>
                  <td className="px-5 py-3 text-slate-300">{e.type}</td>
                  <td className="px-5 py-3 text-slate-300">{e.year} {e.make} {e.model || ""}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[e.status] || ""}`}>
                      {STATUS_LABELS[e.status] || e.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-300">{e.mileage ? `${e.mileage.toLocaleString()} mi` : "N/A"}</td>
                  <td className="px-5 py-3 text-slate-300">{e.nextServiceDate ? new Date(e.nextServiceDate).toLocaleDateString() : "—"}</td>
                  <td className="px-5 py-3 text-slate-300">{e.assignedDriver ? `${e.assignedDriver.firstName} ${e.assignedDriver.lastName}` : "—"}</td>
                </tr>
              ))}
              {equipment.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-500">No equipment found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Driver Modal */}
      {showAddDriver && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-white/10 rounded-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Add Driver</h2>
              <button onClick={() => setShowAddDriver(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input value={driverForm.firstName} onChange={(e) => setDriverForm((f) => ({ ...f, firstName: e.target.value }))} placeholder="First Name *"
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white" />
              <input value={driverForm.lastName} onChange={(e) => setDriverForm((f) => ({ ...f, lastName: e.target.value }))} placeholder="Last Name *"
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input value={driverForm.phone} onChange={(e) => setDriverForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Phone"
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white" />
              <input value={driverForm.email} onChange={(e) => setDriverForm((f) => ({ ...f, email: e.target.value }))} placeholder="Email"
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input value={driverForm.licenseNumber} onChange={(e) => setDriverForm((f) => ({ ...f, licenseNumber: e.target.value }))} placeholder="License Number"
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white" />
              <input value={driverForm.licenseExpiry} onChange={(e) => setDriverForm((f) => ({ ...f, licenseExpiry: e.target.value }))} type="date"
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white" />
            </div>
            <input value={driverForm.currentLocation} onChange={(e) => setDriverForm((f) => ({ ...f, currentLocation: e.target.value }))} placeholder="Current Location (e.g. Kalamazoo, MI)"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white" />
            <button onClick={() => createDriver.mutate()} disabled={!driverForm.firstName || !driverForm.lastName || createDriver.isPending}
              className="w-full px-4 py-2.5 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50">
              Add Driver
            </button>
          </div>
        </div>
      )}

      {/* Add Equipment Modal */}
      {showAddEquipment && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-white/10 rounded-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Add Equipment</h2>
              <button onClick={() => setShowAddEquipment(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input value={equipForm.unitNumber} onChange={(e) => setEquipForm((f) => ({ ...f, unitNumber: e.target.value }))} placeholder="Unit Number *"
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white" />
              <select value={equipForm.type} onChange={(e) => setEquipForm((f) => ({ ...f, type: e.target.value }))}
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white">
                <option value="Dry Van" className="bg-[#0f172a]">Dry Van</option>
                <option value="Reefer" className="bg-[#0f172a]">Reefer</option>
                <option value="Flatbed" className="bg-[#0f172a]">Flatbed</option>
                <option value="Step Deck" className="bg-[#0f172a]">Step Deck</option>
                <option value="Car Hauler" className="bg-[#0f172a]">Car Hauler</option>
                <option value="53' Dry Van Trailer" className="bg-[#0f172a]">53&apos; Dry Van Trailer</option>
                <option value="53' Reefer Trailer" className="bg-[#0f172a]">53&apos; Reefer Trailer</option>
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <input value={equipForm.year} onChange={(e) => setEquipForm((f) => ({ ...f, year: e.target.value }))} placeholder="Year" type="number"
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white" />
              <input value={equipForm.make} onChange={(e) => setEquipForm((f) => ({ ...f, make: e.target.value }))} placeholder="Make *"
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white" />
              <input value={equipForm.model} onChange={(e) => setEquipForm((f) => ({ ...f, model: e.target.value }))} placeholder="Model"
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input value={equipForm.vin} onChange={(e) => setEquipForm((f) => ({ ...f, vin: e.target.value }))} placeholder="VIN"
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white" />
              <input value={equipForm.mileage} onChange={(e) => setEquipForm((f) => ({ ...f, mileage: e.target.value }))} placeholder="Mileage" type="number"
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white" />
            </div>
            <button onClick={() => createEquipment.mutate()} disabled={!equipForm.unitNumber || !equipForm.make || createEquipment.isPending}
              className="w-full px-4 py-2.5 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50">
              Add Equipment
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
