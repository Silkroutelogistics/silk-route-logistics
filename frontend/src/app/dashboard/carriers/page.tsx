"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/hooks/useAuthStore";
import {
  Search, Shield, Truck, MapPin, Star, CheckCircle2, Clock, AlertCircle, X,
  ChevronDown, ChevronUp, MessageSquare, FileText, Users, Phone, Mail, Building2,
  TrendingUp, TrendingDown, DollarSign, Package, Award, ShieldAlert, Calendar,
  BarChart3, Percent, Hash, Compass, RefreshCw, ExternalLink, AlertTriangle,
} from "lucide-react";
import { SlideDrawer } from "@/components/ui/SlideDrawer";

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
  lastVettingScore?: number | null;
  lastVettingGrade?: string | null;
}

interface CompassCheck {
  name: string;
  result: "PASS" | "FAIL" | "WARNING";
  detail: string;
  deduction: number;
}

interface CompassResult {
  score: number;
  grade: string;
  riskLevel: string;
  recommendation: string;
  checks: CompassCheck[];
  flags: string[];
  trendDirection: string | null;
  vettedAt: string;
}

const RISK_COLORS: Record<string, string> = {
  LOW: "text-green-400",
  MEDIUM: "text-yellow-400",
  HIGH: "text-orange-400",
  CRITICAL: "text-red-400",
};

const GRADE_COLORS: Record<string, string> = {
  A: "text-green-400",
  B: "text-blue-400",
  C: "text-yellow-400",
  D: "text-orange-400",
  F: "text-red-400",
};

const TIER_COLORS: Record<string, string> = {
  PLATINUM: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  GOLD: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  SILVER: "bg-slate-400/20 text-slate-300 border-slate-400/30",
  BRONZE: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  GUEST: "bg-white/10 text-slate-400 border-white/20",
  NONE: "bg-white/5 text-slate-500 border-white/10",
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
  const [confirmAction, setConfirmAction] = useState<{ id: string; status: string; company: string } | null>(null);
  const [compassResult, setCompassResult] = useState<CompassResult | null>(null);
  const [compassCarrierId, setCompassCarrierId] = useState<string | null>(null);
  const [compassLoading, setCompassLoading] = useState<string | null>(null);

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

  const tierCounts = { PLATINUM: 0, GOLD: 0, SILVER: 0, BRONZE: 0, GUEST: 0 };
  carriers.forEach((c) => { if (c.tier in tierCounts) tierCounts[c.tier as keyof typeof tierCounts]++; });
  const caravanMembers = carriers.filter((c) => c.tier && c.tier !== "NONE" && c.tier !== "GUEST").length;
  const avgCppScore = carriers.filter((c) => c.safetyScore).length > 0
    ? Math.round(carriers.filter((c) => c.safetyScore).reduce((s, c) => s + (c.safetyScore || 0), 0) / carriers.filter((c) => c.safetyScore).length)
    : 0;
  const complianceHealthy = carriers.filter((c) => c.onboardingStatus === "APPROVED" && (!c.insuranceExpiry || daysUntil(c.insuranceExpiry)! > 30)).length;

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

  async function runCompass(carrierId: string) {
    setCompassLoading(carrierId);
    try {
      const res = await api.post(`/carriers/${carrierId}/full-vet`);
      const data = res.data;
      // The full-vet endpoint returns a consolidated results object; extract the vetting report
      // from the FMCSA result or build a composite from all checks
      const fmcsa = data.results?.fmcsa?.data;
      const identity = data.results?.identity?.data;
      const chameleon = data.results?.chameleon?.data;
      const ofac = data.results?.ofac?.data;
      const eld = data.results?.eld?.data;
      const tin = data.results?.tin?.data;

      // Build composite checks from the full-vet results
      const checks: CompassCheck[] = [];
      const addCheck = (name: string, key: string, resultObj: Record<string, unknown> | undefined) => {
        if (!resultObj) {
          const status = data.results?.[key]?.status;
          checks.push({ name, result: status === "skipped" ? "WARNING" : "FAIL", detail: data.results?.[key]?.error || "Not available", deduction: -5 });
        } else {
          checks.push({ name, result: "PASS", detail: JSON.stringify(resultObj).slice(0, 80), deduction: 0 });
        }
      };

      // Map results to checks
      if (fmcsa) {
        checks.push({ name: "Operating Authority", result: fmcsa.operatingStatus === "AUTHORIZED" ? "PASS" : "WARNING", detail: fmcsa.operatingStatus || "Unknown", deduction: fmcsa.operatingStatus === "AUTHORIZED" ? 0 : -10 });
        checks.push({ name: "FMCSA Grade", result: "PASS", detail: `Grade ${fmcsa.grade}, Score ${fmcsa.score}`, deduction: 0 });
      } else {
        checks.push({ name: "Operating Authority", result: data.results?.fmcsa?.status === "skipped" ? "WARNING" : "FAIL", detail: data.results?.fmcsa?.error || "No DOT number", deduction: -10 });
      }

      checks.push({ name: "Identity Verification", result: identity ? "PASS" : "FAIL", detail: identity ? "Verified" : data.results?.identity?.error || "Failed", deduction: identity ? 0 : -10 });
      checks.push({ name: "Chameleon Detection", result: chameleon ? (chameleon.riskLevel === "LOW" ? "PASS" : "WARNING") : "FAIL", detail: chameleon ? `Risk: ${chameleon.riskLevel}, Matches: ${chameleon.matches}` : "Check failed", deduction: chameleon && chameleon.riskLevel === "LOW" ? 0 : -5 });
      checks.push({ name: "OFAC/SDN Screening", result: ofac ? "PASS" : "FAIL", detail: ofac ? "Clear" : data.results?.ofac?.error || "Failed", deduction: ofac ? 0 : -15 });
      checks.push({ name: "ELD Validation", result: eld ? "PASS" : "WARNING", detail: eld ? "Validated" : data.results?.eld?.error || "Not validated", deduction: eld ? 0 : -5 });
      checks.push({ name: "TIN Verification", result: tin ? "PASS" : "WARNING", detail: tin ? "Verified" : data.results?.tin?.error || "Not verified", deduction: tin ? 0 : -5 });
      checks.push({ name: "CSA BASIC Scores", result: data.results?.csa?.status === "completed" ? "PASS" : "WARNING", detail: data.results?.csa?.status === "completed" ? "Updated" : data.results?.csa?.error || "Skipped", deduction: 0 });
      checks.push({ name: "VIN Verification", result: data.results?.vin?.status === "completed" ? "PASS" : "WARNING", detail: data.results?.vin?.status === "completed" ? "Verified" : data.results?.vin?.error || "Not verified", deduction: 0 });

      // Use the REAL backend Compass score if available (from vetAndStoreReport 31-check engine)
      // The backend stores this in results.fmcsa.data.score/grade
      const backendScore = typeof fmcsa?.score === "number" ? fmcsa.score : null;
      const backendGrade = fmcsa?.grade || null;

      // Fallback: calculate from frontend check results if backend score unavailable
      const totalDeduction = checks.reduce((s, c) => s + c.deduction, 0);
      const frontendScore = Math.max(0, Math.min(100, 100 + totalDeduction));

      // Use backend score (real 31-check) if > 0, otherwise use frontend calculation
      const score = (backendScore && backendScore > 0) ? backendScore : frontendScore;
      const grade = backendGrade || (score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F");
      const riskLevel = score >= 80 ? "LOW" : score >= 60 ? "MEDIUM" : score >= 40 ? "HIGH" : "CRITICAL";
      const recommendation = score >= 75 ? "APPROVE" : score >= 50 ? "REVIEW" : "REJECT";
      const flags = checks.filter((c) => c.result === "FAIL").map((c) => c.name);

      const result: CompassResult = {
        score,
        grade,
        riskLevel,
        recommendation,
        checks,
        flags,
        trendDirection: "STABLE",
        vettedAt: new Date().toISOString(),
      };

      setCompassResult(result);
      setCompassCarrierId(carrierId);
      queryClient.invalidateQueries({ queryKey: ["carrier-all"] });
    } catch (err) {
      console.error("Compass vetting failed:", err);
    } finally {
      setCompassLoading(null);
    }
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
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        <StatCard icon={<Users className="w-5 h-5 text-gold" />} label="Total Carriers" value={carriers.length} />
        <StatCard icon={<Award className="w-5 h-5 text-gold" />} label="Caravan Members" value={caravanMembers} sub={`${carriers.length - caravanMembers} guest/unrated`} />
        <StatCard icon={<DollarSign className="w-5 h-5 text-green-400" />} label="Total Revenue" value={`$${(totalRevenue / 1000).toFixed(0)}k`} sub={`${totalLoads} loads completed`} />
        <StatCard icon={<Shield className="w-5 h-5 text-blue-400" />} label="Avg CPP Score" value={`${avgCppScore}%`} />
        <StatCard icon={<CheckCircle2 className="w-5 h-5 text-emerald-400" />} label="Compliance Health" value={complianceHealthy} sub={`of ${carriers.filter((c) => c.onboardingStatus === "APPROVED").length} approved`} />
        <StatCard icon={<ShieldAlert className="w-5 h-5 text-yellow-400" />} label="Insurance Expiring" value={expiringSoon} sub="Within 30 days" />
        <StatCard icon={<Clock className="w-5 h-5 text-purple-400" />} label="Pending Onboarding" value={pendingOnboard} />
      </div>

      {/* Tier Cards */}
      <div className="grid sm:grid-cols-5 gap-4">
        {(["PLATINUM", "GOLD", "SILVER", "BRONZE", "GUEST"] as const).map((tier) => (
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
          <option value="" className="bg-[#0f172a] text-white">All Statuses</option>
          {["PENDING", "DOCUMENTS_SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED"].map((s) => (
            <option key={s} value={s} className="bg-[#0f172a] text-white">{s.replace(/_/g, " ")}</option>
          ))}
        </select>
        <select value={equipFilter} onChange={(e) => setEquipFilter(e.target.value)}
          className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white">
          <option value="" className="bg-[#0f172a] text-white">All Equipment</option>
          {["Dry Van", "Reefer", "Flatbed", "Step Deck", "Car Hauler", "Power Only"].map((t) => (
            <option key={t} value={t} className="bg-[#0f172a] text-white">{t}</option>
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
                      {carrier.lastVettingScore != null && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#C9A84C]/10 text-[#C9A84C] border border-[#C9A84C]/20 flex items-center gap-1">
                          <Compass className="w-3 h-3" /> {carrier.lastVettingScore}
                        </span>
                      )}
                      {compassCarrierId === carrier.id && compassResult && !carrier.lastVettingScore && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#C9A84C]/10 text-[#C9A84C] border border-[#C9A84C]/20 flex items-center gap-1">
                          <Compass className="w-3 h-3" /> {compassResult.score}
                        </span>
                      )}
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
                  {isAdmin && (
                    <button
                      onClick={() => runCompass(carrier.id)}
                      disabled={compassLoading === carrier.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-[#C9A84C] text-[#C9A84C] rounded-lg text-xs hover:bg-[#C9A84C]/10 transition disabled:opacity-50"
                    >
                      {compassLoading === carrier.id ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Shield className="w-3.5 h-3.5" />
                      )}
                      {compassLoading === carrier.id ? "Running..." : "Run Compass"}
                    </button>
                  )}
                  {isAdmin && carrier.onboardingStatus !== "APPROVED" && (
                    <button onClick={() => setConfirmAction({ id: carrier.id, status: "APPROVED", company: carrier.company })}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg text-xs hover:bg-green-500/30 transition">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                    </button>
                  )}
                  {isAdmin && carrier.onboardingStatus !== "REJECTED" && (
                    <button onClick={() => setConfirmAction({ id: carrier.id, status: "REJECTED", company: carrier.company })}
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

                {/* Compass Report Inline */}
                {compassCarrierId === carrier.id && compassResult && (
                  <div className="mt-4 p-4 bg-white/5 rounded-xl border border-[#C9A84C]/20">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Compass className="w-5 h-5 text-[#C9A84C]" />
                        <h3 className="text-sm font-bold text-white uppercase tracking-wider">Compass Report</h3>
                      </div>
                      <button onClick={() => { setCompassResult(null); setCompassCarrierId(null); }} className="text-slate-400 hover:text-white">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Score Summary */}
                    <div className="flex items-center gap-6 mb-4 pb-3 border-b border-white/10">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">Score:</span>
                        <span className="text-xl font-bold text-[#C9A84C]">{compassResult.score}/100</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">Grade:</span>
                        <span className={`text-lg font-bold ${GRADE_COLORS[compassResult.grade] || "text-white"}`}>{compassResult.grade}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">Risk:</span>
                        <span className={`text-sm font-semibold ${RISK_COLORS[compassResult.riskLevel] || "text-white"}`}>{compassResult.riskLevel}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">Recommendation:</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                          compassResult.recommendation === "APPROVE" ? "bg-green-500/20 text-green-400" :
                          compassResult.recommendation === "REVIEW" ? "bg-yellow-500/20 text-yellow-400" :
                          "bg-red-500/20 text-red-400"
                        }`}>{compassResult.recommendation}</span>
                      </div>
                    </div>

                    {/* Checks Grid */}
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      {compassResult.checks.map((check, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-xs">
                          {check.result === "PASS" ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" />
                          ) : check.result === "WARNING" ? (
                            <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-0.5" />
                          ) : (
                            <X className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                          )}
                          <div>
                            <span className={`font-medium ${
                              check.result === "PASS" ? "text-slate-300" :
                              check.result === "WARNING" ? "text-yellow-400" : "text-red-400"
                            }`}>{check.name}</span>
                            {check.result !== "PASS" && (
                              <p className="text-[10px] text-slate-500 mt-0.5">{check.detail}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Flags */}
                    {compassResult.flags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {compassResult.flags.map((flag, i) => (
                          <span key={i} className="px-2 py-0.5 bg-red-500/10 text-red-400 rounded text-[10px] font-medium border border-red-500/20">
                            {flag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Footer Actions */}
                    <div className="flex items-center gap-3 pt-2 border-t border-white/10">
                      <button
                        onClick={() => runCompass(carrier.id)}
                        disabled={compassLoading === carrier.id}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-400 hover:text-white transition"
                      >
                        <RefreshCw className={`w-3 h-3 ${compassLoading === carrier.id ? "animate-spin" : ""}`} /> Re-run
                      </button>
                      <span className="text-[10px] text-slate-600">
                        Vetted: {new Date(compassResult.vettedAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Truck className="w-12 h-12 text-slate-300 mb-4" />
            <h3 className="text-lg font-semibold text-white mb-1">No carriers match your criteria</h3>
            <p className="text-sm text-slate-400 mb-4 max-w-sm">Invite carriers to join your network</p>
            <a href="/onboarding" className="px-4 py-2 bg-gold text-navy rounded-lg text-sm font-medium">Invite Carriers</a>
          </div>
        )}
      </div>

      {/* Edit Carrier Drawer */}
      <SlideDrawer open={!!editingCarrier} onClose={() => setEditingCarrier(null)} title={`Edit Carrier — ${editingCarrier?.company || ""}`} width="max-w-md">
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Tier</label>
                <select value={editForm.tier} onChange={(e) => setEditForm({ ...editForm, tier: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20">
                  {["BRONZE", "SILVER", "GOLD", "PLATINUM"].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Safety Score (%)</label>
                <input type="number" min="0" max="100" value={editForm.safetyScore}
                  onChange={(e) => setEditForm({ ...editForm, safetyScore: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Number of Trucks</label>
                <input type="number" min="1" value={editForm.numberOfTrucks}
                  onChange={(e) => setEditForm({ ...editForm, numberOfTrucks: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Insurance Expiry</label>
                <input type="date" value={editForm.insuranceExpiry}
                  onChange={(e) => setEditForm({ ...editForm, insuranceExpiry: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20" />
              </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setEditingCarrier(null)}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition">Cancel</button>
              <button onClick={() => updateCarrier.mutate({ id: editingCarrier!.id, data: editForm })}
                disabled={updateCarrier.isPending}
                className="flex-1 px-4 py-2 bg-gold text-navy rounded-lg text-sm font-medium hover:bg-gold/90 transition disabled:opacity-50">
                {updateCarrier.isPending ? "Saving..." : "Save Changes"}
              </button>
            </div>
            </div>
      </SlideDrawer>

      {/* Confirm Approve/Reject Modal */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {confirmAction.status === "APPROVED" ? "Approve Carrier" : "Reject Carrier"}
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              Are you sure you want to <strong className={confirmAction.status === "APPROVED" ? "text-green-600" : "text-red-600"}>
                {confirmAction.status === "APPROVED" ? "approve" : "reject"}
              </strong> <strong className="text-gray-900">{confirmAction.company}</strong>?
              {confirmAction.status === "REJECTED" && " This carrier will be blocked from accepting loads."}
              {confirmAction.status === "APPROVED" && " This carrier will be able to accept loads and appear on the load board."}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmAction(null)}
                className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition">
                Cancel
              </button>
              <button
                onClick={() => {
                  verifyCarrier.mutate({ id: confirmAction.id, status: confirmAction.status });
                  setConfirmAction(null);
                }}
                className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition ${
                  confirmAction.status === "APPROVED"
                    ? "bg-green-600 text-white hover:bg-green-700"
                    : "bg-red-600 text-white hover:bg-red-700"
                }`}>
                {confirmAction.status === "APPROVED" ? "Approve" : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
