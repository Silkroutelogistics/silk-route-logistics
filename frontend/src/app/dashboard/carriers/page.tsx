"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/hooks/useAuthStore";
import {
  Search, Shield, Truck, MapPin, Star, CheckCircle2, Clock, AlertCircle, X,
  ChevronDown, ChevronUp, MessageSquare, FileText, Users, Phone, Mail, Building2,
  TrendingUp, TrendingDown, DollarSign, Package, Award, ShieldAlert, Calendar,
  BarChart3, Percent, Hash,
} from "lucide-react";

interface CarrierPerformance {
  overallScore: number;
  onTimePickup: number;
  onTimeDelivery: number;
  communication: number;
  claimRatio: number;
  docTimeliness: number;
}

interface Carrier {
  id: string;
  userId: string;
  company: string;
  contactName: string;
  email: string;
  phone: string | null;
  mcNumber: string | null;
  dotNumber: string | null;
  tier: string;
  equipmentTypes: string[];
  operatingRegions: string[];
  safetyScore: number | null;
  numberOfTrucks: number | null;
  onboardingStatus: string;
  insuranceExpiry: string | null;
  w9Uploaded: boolean;
  insuranceCertUploaded: boolean;
  authorityDocUploaded: boolean;
  approvedAt: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  completedLoads: number;
  activeLoads: number;
  totalRevenue: number;
  tendersAccepted: number;
  tendersDeclined: number;
  tendersTotal: number;
  acceptanceRate: number;
  performance: CarrierPerformance | null;
  createdAt: string;
}

const TIER_COLORS: Record<string, string> = {
  PLATINUM: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  GOLD: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  SILVER: "bg-slate-400/20 text-slate-300 border-slate-400/30",
  BRONZE: "bg-orange-500/20 text-orange-400 border-orange-500/30",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-500/20 text-yellow-400",
  DOCUMENTS_SUBMITTED: "bg-blue-500/20 text-blue-400",
  UNDER_REVIEW: "bg-purple-500/20 text-purple-400",
  APPROVED: "bg-green-500/20 text-green-400",
  REJECTED: "bg-red-500/20 text-red-400",
};

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white/5 rounded-xl border border-white/10 p-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">{icon}</div>
        <div>
          <p className="text-2xl font-bold text-white">{value}</p>
          <p className="text-xs text-slate-400">{label}</p>
          {sub && <p className="text-[10px] text-slate-500">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-white/5 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs text-white font-medium">{value || "—"}</span>
    </div>
  );
}

function PerformanceBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-400">{label}</span>
        <span className="text-white font-medium">{value}%</span>
      </div>
      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function insuranceBadge(expiry: string | null) {
  const days = daysUntil(expiry);
  if (days === null) return <span className="text-xs text-slate-500">No data</span>;
  if (days < 0) return <span className="px-2 py-0.5 rounded text-xs bg-red-500/20 text-red-400">Expired</span>;
  if (days <= 30) return <span className="px-2 py-0.5 rounded text-xs bg-yellow-500/20 text-yellow-400">Exp in {days}d</span>;
  return <span className="px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-400">Valid ({days}d)</span>;
}

export default function CarrierPoolPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "ADMIN" || user?.role === "CEO";
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [equipFilter, setEquipFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingCarrier, setEditingCarrier] = useState<Carrier | null>(null);
  const [editForm, setEditForm] = useState({ safetyScore: "", tier: "", numberOfTrucks: "", insuranceExpiry: "" });

  const { data } = useQuery({
    queryKey: ["carrier-all"],
    queryFn: () => api.get<{ carriers: Carrier[]; total: number }>("/carrier/all").then((r) => r.data),
  });

  const updateCarrier = useMutation({
    mutationFn: ({ id, data: body }: { id: string; data: Record<string, string> }) =>
      api.patch(`/carrier/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["carrier-all"] });
      setEditingCarrier(null);
    },
  });

  const verifyCarrier = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.post(`/carrier/verify/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["carrier-all"] }),
  });

  const carriers = data?.carriers || [];
  const filtered = carriers.filter((c) => {
    if (tierFilter && c.tier !== tierFilter) return false;
    if (statusFilter && c.onboardingStatus !== statusFilter) return false;
    if (equipFilter && !c.equipmentTypes.includes(equipFilter)) return false;
    if (search) {
      const q = search.toLowerCase();
      return c.company.toLowerCase().includes(q) || c.contactName.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) || (c.mcNumber || "").includes(q) || (c.dotNumber || "").includes(q);
    }
    return true;
  });

  const tierCounts = { PLATINUM: 0, GOLD: 0, SILVER: 0, BRONZE: 0 };
  carriers.forEach((c) => { if (c.tier in tierCounts) tierCounts[c.tier as keyof typeof tierCounts]++; });

  const totalRevenue = carriers.reduce((s, c) => s + c.totalRevenue, 0);
  const totalLoads = carriers.reduce((s, c) => s + c.completedLoads, 0);
  const avgSafety = carriers.filter((c) => c.safetyScore).length > 0
    ? Math.round(carriers.reduce((s, c) => s + (c.safetyScore || 0), 0) / carriers.filter((c) => c.safetyScore).length)
    : 0;
  const expiringSoon = carriers.filter((c) => { const d = daysUntil(c.insuranceExpiry); return d !== null && d >= 0 && d <= 30; }).length;
  const pendingOnboard = carriers.filter((c) => c.onboardingStatus !== "APPROVED").length;

  function openEdit(c: Carrier) {
    setEditingCarrier(c);
    setEditForm({
      safetyScore: c.safetyScore?.toString() || "",
      tier: c.tier,
      numberOfTrucks: c.numberOfTrucks?.toString() || "",
      insuranceExpiry: c.insuranceExpiry ? new Date(c.insuranceExpiry).toISOString().split("T")[0] : "",
    });
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Carrier Pool</h1>
          <p className="text-slate-400 text-sm mt-1">{carriers.length} carriers in network</p>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard icon={<Users className="w-5 h-5 text-gold" />} label="Total Carriers" value={carriers.length} />
        <StatCard icon={<DollarSign className="w-5 h-5 text-green-400" />} label="Total Revenue" value={`$${(totalRevenue / 1000).toFixed(0)}k`} sub={`${totalLoads} loads completed`} />
        <StatCard icon={<Shield className="w-5 h-5 text-blue-400" />} label="Avg Safety Score" value={`${avgSafety}%`} />
        <StatCard icon={<ShieldAlert className="w-5 h-5 text-yellow-400" />} label="Insurance Expiring" value={expiringSoon} sub="Within 30 days" />
        <StatCard icon={<Clock className="w-5 h-5 text-purple-400" />} label="Pending Onboarding" value={pendingOnboard} />
      </div>

      {/* Tier Cards */}
      <div className="grid sm:grid-cols-4 gap-4">
        {(["PLATINUM", "GOLD", "SILVER", "BRONZE"] as const).map((tier) => (
          <button key={tier} onClick={() => setTierFilter(tierFilter === tier ? "" : tier)}
            className={`bg-white/5 rounded-xl border p-4 text-left transition ${tierFilter === tier ? "border-gold" : "border-white/10 hover:border-white/20"}`}>
            <div className="flex items-center justify-between mb-1">
              <span className={`px-2 py-0.5 rounded text-xs font-bold ${TIER_COLORS[tier]}`}>{tier}</span>
              <span className="text-2xl font-bold text-white">{tierCounts[tier]}</span>
            </div>
            <p className="text-xs text-slate-500">carriers</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by company, MC#, DOT#, email..."
            className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white">
          <option value="" className="bg-navy">All Statuses</option>
          {["PENDING", "DOCUMENTS_SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED"].map((s) => (
            <option key={s} value={s} className="bg-navy">{s.replace(/_/g, " ")}</option>
          ))}
        </select>
        <select value={equipFilter} onChange={(e) => setEquipFilter(e.target.value)}
          className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white">
          <option value="" className="bg-navy">All Equipment</option>
          {["Dry Van", "Reefer", "Flatbed", "Step Deck", "Car Hauler", "Power Only"].map((t) => (
            <option key={t} value={t} className="bg-navy">{t}</option>
          ))}
        </select>
      </div>

      {/* Carrier List */}
      <div className="space-y-3">
        {filtered.map((carrier) => (
          <div key={carrier.id} className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
            <button onClick={() => setExpanded(expanded === carrier.id ? null : carrier.id)}
              className="w-full text-left p-5 hover:bg-white/5 transition">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gold/10 flex items-center justify-center shrink-0">
                    <Truck className="w-6 h-6 text-gold" />
                  </div>
                  <div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <p className="font-semibold text-white">{carrier.company}</p>
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${TIER_COLORS[carrier.tier] || ""}`}>{carrier.tier}</span>
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[carrier.onboardingStatus] || "bg-white/10 text-slate-400"}`}>
                        {carrier.onboardingStatus.replace(/_/g, " ")}
                      </span>
                      {insuranceBadge(carrier.insuranceExpiry)}
                    </div>
                    <div className="flex flex-wrap items-center gap-4 mt-1.5 text-xs text-slate-400">
                      <span className="flex items-center gap-1"><Truck className="w-3 h-3" /> {carrier.equipmentTypes.join(", ")}</span>
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {carrier.operatingRegions.slice(0, 3).join(", ")}{carrier.operatingRegions.length > 3 ? ` +${carrier.operatingRegions.length - 3}` : ""}</span>
                      {carrier.numberOfTrucks && <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {carrier.numberOfTrucks} trucks</span>}
                      {carrier.mcNumber && <span className="flex items-center gap-1"><Hash className="w-3 h-3" /> MC-{carrier.mcNumber}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-6 shrink-0">
                  <div className="hidden sm:flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-sm font-bold text-white">{carrier.completedLoads}</p>
                      <p className="text-[10px] text-slate-500">Loads</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-white">{carrier.acceptanceRate}%</p>
                      <p className="text-[10px] text-slate-500">Accept Rate</p>
                    </div>
                    {carrier.safetyScore && (
                      <div className="text-right">
                        <p className={`text-sm font-bold ${carrier.safetyScore >= 90 ? "text-green-400" : carrier.safetyScore >= 75 ? "text-yellow-400" : "text-red-400"}`}>
                          {carrier.safetyScore}%
                        </p>
                        <p className="text-[10px] text-slate-500">Safety</p>
                      </div>
                    )}
                  </div>
                  {expanded === carrier.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </div>
              </div>
            </button>

            {expanded === carrier.id && (
              <div className="border-t border-white/10 p-5 bg-white/[0.02] space-y-5">
                {/* Three column detail */}
                <div className="grid md:grid-cols-3 gap-5">
                  {/* Contact & Company Info */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Contact Information</h3>
                    <div className="bg-white/5 rounded-lg p-3 space-y-0.5">
                      <InfoRow label="Contact" value={carrier.contactName} />
                      <InfoRow label="Email" value={<a href={`mailto:${carrier.email}`} className="text-gold hover:underline">{carrier.email}</a>} />
                      <InfoRow label="Phone" value={carrier.phone} />
                      <InfoRow label="MC Number" value={carrier.mcNumber} />
                      <InfoRow label="DOT Number" value={carrier.dotNumber} />
                      <InfoRow label="Location" value={carrier.city && carrier.state ? `${carrier.city}, ${carrier.state} ${carrier.zip || ""}` : null} />
                      <InfoRow label="Member Since" value={new Date(carrier.createdAt).toLocaleDateString()} />
                    </div>
                  </div>

                  {/* Operations & Equipment */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Operations</h3>
                    <div className="bg-white/5 rounded-lg p-3 space-y-3">
                      <div>
                        <span className="text-[10px] text-slate-500">Equipment Types</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {carrier.equipmentTypes.map((eq) => (
                            <span key={eq} className="px-2 py-0.5 bg-white/10 rounded text-xs text-slate-300">{eq}</span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500">Operating Regions</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {carrier.operatingRegions.map((r) => (
                            <span key={r} className="px-2 py-0.5 bg-white/10 rounded text-xs text-slate-300">{r}</span>
                          ))}
                        </div>
                      </div>
                      <InfoRow label="Fleet Size" value={carrier.numberOfTrucks ? `${carrier.numberOfTrucks} trucks` : "—"} />
                      <InfoRow label="Insurance Expiry" value={carrier.insuranceExpiry ? new Date(carrier.insuranceExpiry).toLocaleDateString() : "—"} />
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-[10px] text-slate-500">Documents:</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${carrier.w9Uploaded ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>W9</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${carrier.insuranceCertUploaded ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>Insurance</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${carrier.authorityDocUploaded ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>Authority</span>
                      </div>
                    </div>
                  </div>

                  {/* Performance Metrics */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Performance</h3>
                    <div className="bg-white/5 rounded-lg p-3 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="text-center p-2 bg-white/5 rounded-lg">
                          <p className="text-lg font-bold text-white">{carrier.completedLoads}</p>
                          <p className="text-[10px] text-slate-500">Completed</p>
                        </div>
                        <div className="text-center p-2 bg-white/5 rounded-lg">
                          <p className="text-lg font-bold text-blue-400">{carrier.activeLoads}</p>
                          <p className="text-[10px] text-slate-500">Active</p>
                        </div>
                        <div className="text-center p-2 bg-white/5 rounded-lg">
                          <p className="text-lg font-bold text-green-400">${(carrier.totalRevenue / 1000).toFixed(1)}k</p>
                          <p className="text-[10px] text-slate-500">Revenue</p>
                        </div>
                        <div className="text-center p-2 bg-white/5 rounded-lg">
                          <p className="text-lg font-bold text-gold">{carrier.acceptanceRate}%</p>
                          <p className="text-[10px] text-slate-500">Accept Rate</p>
                        </div>
                      </div>
                      <div className="text-xs text-slate-400">
                        Tenders: {carrier.tendersAccepted} accepted / {carrier.tendersDeclined} declined / {carrier.tendersTotal} total
                      </div>
                      {carrier.performance && (
                        <div className="space-y-2 pt-1">
                          <PerformanceBar label="On-Time Pickup" value={carrier.performance.onTimePickup} color="bg-green-500" />
                          <PerformanceBar label="On-Time Delivery" value={carrier.performance.onTimeDelivery} color="bg-blue-500" />
                          <PerformanceBar label="Communication" value={carrier.performance.communication} color="bg-purple-500" />
                          <PerformanceBar label="Doc Timeliness" value={carrier.performance.docTimeliness} color="bg-gold" />
                          <InfoRow label="Claim Ratio" value={`${carrier.performance.claimRatio}%`} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
                  <a href="/dashboard/messages" className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 text-white rounded-lg text-xs hover:bg-white/20 transition">
                    <MessageSquare className="w-3.5 h-3.5" /> Message
                  </a>
                  <a href="/dashboard/loads" className="flex items-center gap-1.5 px-3 py-1.5 bg-gold/20 text-gold rounded-lg text-xs hover:bg-gold/30 transition">
                    <FileText className="w-3.5 h-3.5" /> Tender Load
                  </a>
                  {isAdmin && carrier.onboardingStatus !== "APPROVED" && (
                    <button onClick={() => verifyCarrier.mutate({ id: carrier.id, status: "APPROVED" })}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg text-xs hover:bg-green-500/30 transition">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                    </button>
                  )}
                  {isAdmin && carrier.onboardingStatus !== "REJECTED" && (
                    <button onClick={() => verifyCarrier.mutate({ id: carrier.id, status: "REJECTED" })}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-xs hover:bg-red-500/30 transition">
                      <AlertCircle className="w-3.5 h-3.5" /> Reject
                    </button>
                  )}
                  {isAdmin && (
                    <button onClick={() => openEdit(carrier)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg text-xs hover:bg-blue-500/30 transition">
                      <BarChart3 className="w-3.5 h-3.5" /> Edit Profile
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            <Truck className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p>No carriers found matching your criteria</p>
          </div>
        )}
      </div>

      {/* Edit Carrier Modal */}
      {editingCarrier && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1e293b] rounded-2xl border border-white/10 p-6 w-full max-w-md space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-white">Edit Carrier — {editingCarrier.company}</h2>
              <button onClick={() => setEditingCarrier(null)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Tier</label>
                <select value={editForm.tier} onChange={(e) => setEditForm({ ...editForm, tier: e.target.value })}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white">
                  {["BRONZE", "SILVER", "GOLD", "PLATINUM"].map((t) => (
                    <option key={t} value={t} className="bg-navy">{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Safety Score (%)</label>
                <input type="number" min="0" max="100" value={editForm.safetyScore}
                  onChange={(e) => setEditForm({ ...editForm, safetyScore: e.target.value })}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Number of Trucks</label>
                <input type="number" min="1" value={editForm.numberOfTrucks}
                  onChange={(e) => setEditForm({ ...editForm, numberOfTrucks: e.target.value })}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Insurance Expiry</label>
                <input type="date" value={editForm.insuranceExpiry}
                  onChange={(e) => setEditForm({ ...editForm, insuranceExpiry: e.target.value })}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white" />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setEditingCarrier(null)}
                className="flex-1 px-4 py-2 bg-white/10 text-white rounded-lg text-sm hover:bg-white/20 transition">Cancel</button>
              <button onClick={() => updateCarrier.mutate({ id: editingCarrier.id, data: editForm })}
                disabled={updateCarrier.isPending}
                className="flex-1 px-4 py-2 bg-gold text-black rounded-lg text-sm font-medium hover:bg-gold/90 transition disabled:opacity-50">
                {updateCarrier.isPending ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
