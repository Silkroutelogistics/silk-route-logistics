"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Search, User, Truck, Clock, AlertTriangle, CheckCircle2, Phone, MapPin,
  Shield, Package, Plus, X, ChevronDown, ChevronUp, Heart, Snowflake, Link2,
} from "lucide-react";

interface Driver {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  licenseType: string;
  licenseNumber: string | null;
  licenseState: string | null;
  licenseExpiry: string;
  dateOfBirth: string | null;
  status: string;
  currentLocation: string | null;
  hosDrivingUsed: number;
  hosOnDutyUsed: number;
  hosCycleUsed: number;
  hosCycleLimit: number;
  hireDate: string;
  violations: number;
  safetyScore: number;
  medicalCardExpiry: string | null;
  drugTestDate: string | null;
  endorsements: string[];
  twicCard: boolean;
  twicExpiry: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  assignedEquipment?: { id: string; unitNumber: string; type: string; make: string; model: string | null } | null;
  assignedTruck?: { id: string; unitNumber: string; make: string; model: string; year: number } | null;
  assignedTrailer?: { id: string; unitNumber: string; type: string; make: string; model: string } | null;
}

interface TruckOption { id: string; unitNumber: string; make: string; model: string; year: number; }
interface TrailerOption { id: string; unitNumber: string; type: string; make: string; model: string; }

interface DriverStats {
  totalDrivers: number;
  onRoute: number;
  available: number;
  offDuty: number;
  avgSafetyScore: number;
  expiringLicenses: number;
  expiringMedical: number;
}

const STATUS_COLORS: Record<string, string> = {
  AVAILABLE: "bg-green-500/20 text-green-400",
  ON_ROUTE: "bg-blue-500/20 text-blue-400",
  OFF_DUTY: "bg-slate-500/20 text-slate-400",
  SLEEPER: "bg-purple-500/20 text-purple-400",
  INACTIVE: "bg-red-500/20 text-red-400",
};

const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: "Available",
  ON_ROUTE: "On Route",
  OFF_DUTY: "Off Duty",
  SLEEPER: "Sleeper",
  INACTIVE: "Inactive",
};

function daysUntil(date: string | null) {
  if (!date) return null;
  const diff = new Date(date).getTime() - Date.now();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  return days;
}

function expiryBadge(date: string | null, label: string) {
  if (!date) return null;
  const days = daysUntil(date);
  if (days === null) return null;
  const color = days < 0 ? "text-red-400" : days <= 30 ? "text-amber-400" : "text-green-400";
  const bg = days < 0 ? "bg-red-500/10" : days <= 30 ? "bg-amber-500/10" : "bg-green-500/10";
  const text = days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Today" : `${days}d`;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${bg} ${color}`}>
      {label}: {text}
    </span>
  );
}

export default function DriversPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAddDriver, setShowAddDriver] = useState(false);
  const [assignModal, setAssignModal] = useState<{ driverId: string; type: "truck" | "trailer" } | null>(null);
  const [driverForm, setDriverForm] = useState({
    firstName: "", lastName: "", phone: "", email: "", licenseType: "CDL-A",
    licenseNumber: "", licenseState: "", licenseExpiry: "", status: "AVAILABLE",
    currentLocation: "", medicalCardExpiry: "", drugTestDate: "",
    endorsements: [] as string[], twicCard: false,
    emergencyContactName: "", emergencyContactPhone: "",
  });

  const { data: stats } = useQuery({
    queryKey: ["driver-stats"],
    queryFn: () => api.get<DriverStats>("/drivers/stats").then((r) => r.data),
  });

  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (statusFilter) params.set("status", statusFilter);
  params.set("limit", "50");

  const { data: driversData } = useQuery({
    queryKey: ["drivers", search, statusFilter],
    queryFn: () => api.get<{ drivers: Driver[]; total: number }>(`/drivers?${params.toString()}`).then((r) => r.data),
  });

  const { data: trucksData } = useQuery({
    queryKey: ["trucks-available"],
    queryFn: () => api.get<{ trucks: TruckOption[] }>("/fleet/trucks?status=ACTIVE&limit=100").then((r) => r.data),
    enabled: !!assignModal && assignModal.type === "truck",
  });

  const { data: trailersData } = useQuery({
    queryKey: ["trailers-available"],
    queryFn: () => api.get<{ trailers: TrailerOption[] }>("/fleet/trailers?status=ACTIVE&limit=100").then((r) => r.data),
    enabled: !!assignModal && assignModal.type === "trailer",
  });

  const createDriver = useMutation({
    mutationFn: () => api.post("/drivers", {
      ...driverForm,
      licenseExpiry: driverForm.licenseExpiry ? new Date(driverForm.licenseExpiry).toISOString() : undefined,
      medicalCardExpiry: driverForm.medicalCardExpiry ? new Date(driverForm.medicalCardExpiry).toISOString() : undefined,
      drugTestDate: driverForm.drugTestDate ? new Date(driverForm.drugTestDate).toISOString() : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      queryClient.invalidateQueries({ queryKey: ["driver-stats"] });
      setShowAddDriver(false);
      setDriverForm({ firstName: "", lastName: "", phone: "", email: "", licenseType: "CDL-A", licenseNumber: "", licenseState: "", licenseExpiry: "", status: "AVAILABLE", currentLocation: "", medicalCardExpiry: "", drugTestDate: "", endorsements: [], twicCard: false, emergencyContactName: "", emergencyContactPhone: "" });
    },
  });

  const assignTruck = useMutation({
    mutationFn: ({ driverId, truckId }: { driverId: string; truckId: string | null }) =>
      api.patch(`/drivers/${driverId}/assign-truck`, { truckId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      setAssignModal(null);
    },
  });

  const assignTrailer = useMutation({
    mutationFn: ({ driverId, trailerId }: { driverId: string; trailerId: string | null }) =>
      api.patch(`/drivers/${driverId}/assign-trailer`, { trailerId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      setAssignModal(null);
    },
  });

  const drivers = driversData?.drivers || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Driver Management</h1>
          <p className="text-sm text-slate-400 mt-1">Compliance, HOS tracking, and fleet assignments</p>
        </div>
        <button onClick={() => setShowAddDriver(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90">
          <Plus className="w-4 h-4" /> Add Driver
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <StatCard label="Total" value={stats?.totalDrivers || 0} />
        <StatCard label="On Route" value={stats?.onRoute || 0} color="text-blue-400" />
        <StatCard label="Available" value={stats?.available || 0} color="text-green-400" />
        <StatCard label="Off Duty" value={stats?.offDuty || 0} color="text-slate-400" />
        <StatCard label="Safety Avg" value={`${stats?.avgSafetyScore || 0}%`} color="text-gold" />
        <StatCard label="License Exp" value={stats?.expiringLicenses || 0}
          color={stats?.expiringLicenses ? "text-red-400" : "text-green-400"}
          alert={!!stats?.expiringLicenses} />
        <StatCard label="Medical Exp" value={stats?.expiringMedical || 0}
          color={stats?.expiringMedical ? "text-amber-400" : "text-green-400"}
          alert={!!stats?.expiringMedical} />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, license..."
            className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
        </div>
        <div className="flex gap-1 bg-white/5 rounded-lg p-1">
          {["", "AVAILABLE", "ON_ROUTE", "OFF_DUTY", "SLEEPER"].map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition ${statusFilter === s ? "bg-gold text-navy" : "text-slate-400 hover:text-white"}`}>
              {s ? STATUS_LABELS[s] : "All"}
            </button>
          ))}
        </div>
      </div>

      {/* Driver List */}
      <div className="space-y-3">
        {drivers.map((d) => {
          const isExpanded = expanded === d.id;
          return (
            <div key={d.id} className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
              <button onClick={() => setExpanded(isExpanded ? null : d.id)} className="w-full text-left p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-gold/10 flex items-center justify-center shrink-0">
                      <User className="w-5 h-5 text-gold" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-white">{d.firstName} {d.lastName}</p>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[d.status] || ""}`}>
                          {STATUS_LABELS[d.status] || d.status}
                        </span>
                        {d.twicCard && <span className="px-1.5 py-0.5 rounded text-xs bg-indigo-500/20 text-indigo-400">TWIC</span>}
                        {d.endorsements?.length > 0 && d.endorsements.map(e => (
                          <span key={e} className="px-1.5 py-0.5 rounded text-xs bg-cyan-500/20 text-cyan-400">{e}</span>
                        ))}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 flex-wrap">
                        {d.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {d.phone}</span>}
                        {d.currentLocation && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {d.currentLocation}</span>}
                        <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> {d.licenseType}{d.licenseState ? ` (${d.licenseState})` : ""}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="flex items-center gap-1">
                        <Shield className={`w-4 h-4 ${d.safetyScore >= 95 ? "text-green-400" : d.safetyScore >= 90 ? "text-amber-400" : "text-red-400"}`} />
                        <span className="text-sm font-bold text-white">{d.safetyScore}%</span>
                      </div>
                      <p className="text-xs text-slate-500">Safety</p>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </div>

                {/* Compliance badges row */}
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  {expiryBadge(d.licenseExpiry, "License")}
                  {expiryBadge(d.medicalCardExpiry, "Medical")}
                  {expiryBadge(d.twicExpiry, "TWIC")}
                  {d.assignedTruck && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-blue-500/10 text-blue-400">
                      <Truck className="w-3 h-3" /> {d.assignedTruck.unitNumber}
                    </span>
                  )}
                  {d.assignedTrailer && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-purple-500/10 text-purple-400">
                      <Package className="w-3 h-3" /> {d.assignedTrailer.unitNumber}
                    </span>
                  )}
                </div>

                {/* HOS Bars */}
                <div className="grid sm:grid-cols-3 gap-4">
                  <HOSBar label="Driving" used={d.hosDrivingUsed} max={11} warnAt={9} critAt={10} />
                  <HOSBar label="On-Duty" used={d.hosOnDutyUsed} max={14} warnAt={12} critAt={13} />
                  <HOSBar label="Cycle" used={d.hosCycleUsed} max={d.hosCycleLimit} warnAt={60} critAt={65} />
                </div>
              </button>

              {/* Expanded Detail */}
              {isExpanded && (
                <div className="border-t border-white/10 p-5 bg-white/[0.02] space-y-4">
                  <div className="grid sm:grid-cols-3 gap-4 text-sm">
                    <InfoRow label="License #" value={d.licenseNumber || "—"} />
                    <InfoRow label="License State" value={d.licenseState || "—"} />
                    <InfoRow label="License Expiry" value={d.licenseExpiry ? new Date(d.licenseExpiry).toLocaleDateString() : "—"} />
                    <InfoRow label="Medical Card" value={d.medicalCardExpiry ? new Date(d.medicalCardExpiry).toLocaleDateString() : "—"} />
                    <InfoRow label="Drug Test" value={d.drugTestDate ? new Date(d.drugTestDate).toLocaleDateString() : "—"} />
                    <InfoRow label="Date of Birth" value={d.dateOfBirth ? new Date(d.dateOfBirth).toLocaleDateString() : "—"} />
                    <InfoRow label="Hire Date" value={new Date(d.hireDate).toLocaleDateString()} />
                    <InfoRow label="Violations" value={d.violations > 0 ? `${d.violations} violation(s)` : "Clean"} color={d.violations > 0 ? "text-red-400" : "text-green-400"} />
                    <InfoRow label="Email" value={d.email || "—"} />
                  </div>

                  {/* Emergency Contact */}
                  {(d.emergencyContactName || d.emergencyContactPhone) && (
                    <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-3">
                      <p className="text-xs text-red-400 font-medium mb-1 flex items-center gap-1"><Heart className="w-3 h-3" /> Emergency Contact</p>
                      <p className="text-sm text-white">{d.emergencyContactName} {d.emergencyContactPhone ? `— ${d.emergencyContactPhone}` : ""}</p>
                    </div>
                  )}

                  {/* Assignment Section */}
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-medium text-white flex items-center gap-1"><Link2 className="w-4 h-4 text-gold" /> Fleet Assignment</h3>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="bg-white/5 rounded-lg border border-white/10 p-3">
                      <p className="text-xs text-slate-500 mb-1">Assigned Truck</p>
                      {d.assignedTruck ? (
                        <p className="text-sm text-white">{d.assignedTruck.unitNumber} — {d.assignedTruck.year} {d.assignedTruck.make} {d.assignedTruck.model}</p>
                      ) : <p className="text-sm text-slate-400">None</p>}
                      <button onClick={(e) => { e.stopPropagation(); setAssignModal({ driverId: d.id, type: "truck" }); }}
                        className="mt-2 text-xs text-gold hover:text-gold/80">
                        {d.assignedTruck ? "Change Truck" : "Assign Truck"}
                      </button>
                    </div>
                    <div className="bg-white/5 rounded-lg border border-white/10 p-3">
                      <p className="text-xs text-slate-500 mb-1">Assigned Trailer</p>
                      {d.assignedTrailer ? (
                        <p className="text-sm text-white">{d.assignedTrailer.unitNumber} — {d.assignedTrailer.make} {d.assignedTrailer.model} ({d.assignedTrailer.type})</p>
                      ) : <p className="text-sm text-slate-400">None</p>}
                      <button onClick={(e) => { e.stopPropagation(); setAssignModal({ driverId: d.id, type: "trailer" }); }}
                        className="mt-2 text-xs text-gold hover:text-gold/80">
                        {d.assignedTrailer ? "Change Trailer" : "Assign Trailer"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {drivers.length === 0 && (
          <div className="text-center py-12 text-slate-500">No drivers found</div>
        )}
      </div>

      {/* Add Driver Modal */}
      {showAddDriver && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-navy border border-white/10 rounded-2xl w-full max-w-2xl p-6 space-y-4 my-8">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Add Driver</h2>
              <button onClick={() => setShowAddDriver(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Personal Information</p>
            <div className="grid grid-cols-2 gap-3">
              <Input label="First Name *" value={driverForm.firstName} onChange={(v) => setDriverForm((f) => ({ ...f, firstName: v }))} />
              <Input label="Last Name *" value={driverForm.lastName} onChange={(v) => setDriverForm((f) => ({ ...f, lastName: v }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Phone" value={driverForm.phone} onChange={(v) => setDriverForm((f) => ({ ...f, phone: v }))} />
              <Input label="Email" value={driverForm.email} onChange={(v) => setDriverForm((f) => ({ ...f, email: v }))} />
            </div>
            <Input label="Current Location" value={driverForm.currentLocation} onChange={(v) => setDriverForm((f) => ({ ...f, currentLocation: v }))} placeholder="e.g. Kalamazoo, MI" />

            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider pt-2">License & Compliance</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">License Type</label>
                <select value={driverForm.licenseType} onChange={(e) => setDriverForm((f) => ({ ...f, licenseType: e.target.value }))}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white">
                  {["CDL-A", "CDL-B", "CDL-C"].map(t => <option key={t} value={t} className="bg-navy">{t}</option>)}
                </select>
              </div>
              <Input label="License Number" value={driverForm.licenseNumber} onChange={(v) => setDriverForm((f) => ({ ...f, licenseNumber: v }))} />
              <Input label="License State" value={driverForm.licenseState} onChange={(v) => setDriverForm((f) => ({ ...f, licenseState: v }))} placeholder="e.g. MI" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Input label="License Expiry" value={driverForm.licenseExpiry} onChange={(v) => setDriverForm((f) => ({ ...f, licenseExpiry: v }))} type="date" />
              <Input label="Medical Card Expiry" value={driverForm.medicalCardExpiry} onChange={(v) => setDriverForm((f) => ({ ...f, medicalCardExpiry: v }))} type="date" />
              <Input label="Drug Test Date" value={driverForm.drugTestDate} onChange={(v) => setDriverForm((f) => ({ ...f, drugTestDate: v }))} type="date" />
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={driverForm.twicCard} onChange={(e) => setDriverForm((f) => ({ ...f, twicCard: e.target.checked }))}
                  className="w-4 h-4 rounded bg-white/5 border-white/10" />
                <span className="text-sm text-slate-300">TWIC Card</span>
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-500">Endorsements:</span>
                {["H", "N", "T", "P", "X", "S"].map(e => (
                  <label key={e} className="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={driverForm.endorsements.includes(e)}
                      onChange={(ev) => setDriverForm((f) => ({
                        ...f,
                        endorsements: ev.target.checked ? [...f.endorsements, e] : f.endorsements.filter(x => x !== e),
                      }))} className="w-3 h-3 rounded bg-white/5 border-white/10" />
                    <span className="text-xs text-slate-300">{e}</span>
                  </label>
                ))}
              </div>
            </div>

            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider pt-2">Emergency Contact</p>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Name" value={driverForm.emergencyContactName} onChange={(v) => setDriverForm((f) => ({ ...f, emergencyContactName: v }))} />
              <Input label="Phone" value={driverForm.emergencyContactPhone} onChange={(v) => setDriverForm((f) => ({ ...f, emergencyContactPhone: v }))} />
            </div>

            <button onClick={() => createDriver.mutate()} disabled={!driverForm.firstName || !driverForm.lastName || createDriver.isPending}
              className="w-full px-4 py-2.5 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50">
              Add Driver
            </button>
          </div>
        </div>
      )}

      {/* Assign Truck/Trailer Modal */}
      {assignModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-navy border border-white/10 rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                Assign {assignModal.type === "truck" ? "Truck" : "Trailer"}
              </h2>
              <button onClick={() => setAssignModal(null)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              <button onClick={() => {
                if (assignModal.type === "truck") assignTruck.mutate({ driverId: assignModal.driverId, truckId: null });
                else assignTrailer.mutate({ driverId: assignModal.driverId, trailerId: null });
              }} className="w-full text-left p-3 bg-white/5 rounded-lg border border-white/10 hover:border-white/20 text-sm text-slate-400">
                Unassign (None)
              </button>
              {assignModal.type === "truck" && trucksData?.trucks?.map((t) => (
                <button key={t.id} onClick={() => assignTruck.mutate({ driverId: assignModal.driverId, truckId: t.id })}
                  className="w-full text-left p-3 bg-white/5 rounded-lg border border-white/10 hover:border-gold/30 text-sm text-white">
                  <span className="font-medium">{t.unitNumber}</span>
                  <span className="text-slate-400 ml-2">{t.year} {t.make} {t.model}</span>
                </button>
              ))}
              {assignModal.type === "trailer" && trailersData?.trailers?.map((t) => (
                <button key={t.id} onClick={() => assignTrailer.mutate({ driverId: assignModal.driverId, trailerId: t.id })}
                  className="w-full text-left p-3 bg-white/5 rounded-lg border border-white/10 hover:border-gold/30 text-sm text-white">
                  <span className="font-medium">{t.unitNumber}</span>
                  <span className="text-slate-400 ml-2">{t.make} {t.model} ({t.type})</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color, alert }: { label: string; value: string | number; color?: string; alert?: boolean }) {
  return (
    <div className={`bg-white/5 rounded-xl border p-4 ${alert ? "border-red-500/30" : "border-white/10"}`}>
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`text-xl font-bold mt-0.5 ${color || "text-white"}`}>{value}</p>
    </div>
  );
}

function HOSBar({ label, used, max, warnAt, critAt }: { label: string; used: number; max: number; warnAt: number; critAt: number }) {
  const pct = Math.min((used / max) * 100, 100);
  const color = used >= critAt ? "bg-red-500" : used >= warnAt ? "bg-amber-500" : "bg-green-500";
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-400">{label}</span>
        <span className="font-medium text-slate-300">{used}h / {max}h</span>
      </div>
      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function InfoRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <span className="text-xs text-slate-500">{label}</span>
      <p className={`text-sm ${color || "text-white"}`}>{value}</p>
    </div>
  );
}

function Input({ label, value, onChange, placeholder, type }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || label.replace(" *", "")}
        type={type || "text"} className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
    </div>
  );
}
