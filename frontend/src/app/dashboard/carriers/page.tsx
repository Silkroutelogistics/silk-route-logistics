"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/hooks/useAuthStore";
import {
  Search, Shield, Truck, MapPin, Star, CheckCircle2, Clock, AlertCircle, X,
  MessageSquare, FileText, Users, Phone, Mail, Building2,
  TrendingUp, TrendingDown, DollarSign, Package, Award, ShieldAlert, Calendar,
  BarChart3, Percent, Hash, Compass, RefreshCw, ExternalLink, AlertTriangle, Download,
  User, CheckSquare, ClipboardList,
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
  // Extended insurance
  autoLiabilityProvider?: string | null;
  autoLiabilityAmount?: number | null;
  autoLiabilityPolicy?: string | null;
  autoLiabilityExpiry?: string | null;
  cargoInsuranceProvider?: string | null;
  cargoInsuranceAmount?: number | null;
  cargoInsurancePolicy?: string | null;
  cargoInsuranceExpiry?: string | null;
  generalLiabilityProvider?: string | null;
  generalLiabilityAmount?: number | null;
  generalLiabilityPolicy?: string | null;
  generalLiabilityExpiry?: string | null;
  workersCompProvider?: string | null;
  workersCompAmount?: number | null;
  workersCompPolicy?: string | null;
  workersCompExpiry?: string | null;
  additionalInsuredSRL?: boolean;
  waiverOfSubrogation?: boolean;
  thirtyDayCancellationNotice?: boolean;
  insuranceAgentName?: string | null;
  insuranceAgentEmail?: string | null;
  insuranceAgentPhone?: string | null;
  insuranceAgencyName?: string | null;
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

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function expiryColor(dateStr: string | null | undefined): string {
  const days = daysUntil(dateStr);
  if (days === null) return "text-slate-500";
  if (days < 0) return "text-red-400";
  if (days <= 30) return "text-red-400";
  if (days <= 60) return "text-yellow-400";
  return "text-green-400";
}

function formatExpiry(dateStr: string | null | undefined): string {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

function insuranceBadge(expiry: string | null) {
  const days = daysUntil(expiry);
  if (days === null) return <span className="text-xs text-slate-500">No data</span>;
  if (days < 0) return <span className="px-2 py-0.5 rounded text-xs bg-red-500/20 text-red-400">Expired</span>;
  if (days <= 30) return <span className="px-2 py-0.5 rounded text-xs bg-yellow-500/20 text-yellow-400">Exp in {days}d</span>;
  return <span className="px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-400">Valid ({days}d)</span>;
}

function InsuranceBlock({ title, provider, policy, amount, expiry }: {
  title: string; provider?: string | null; policy?: string | null; amount?: number | null; expiry?: string | null;
}) {
  const days = daysUntil(expiry);
  const hasData = provider || policy || amount || expiry;
  return (
    <div className="bg-white/5 rounded-lg p-4">
      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">{title}</h4>
      {hasData ? (
        <div className="space-y-0.5">
          <InfoRow label="Provider" value={provider || "—"} />
          <InfoRow label="Policy" value={policy || "—"} />
          <InfoRow label="Amount" value={amount ? `$${Number(amount).toLocaleString()}` : "—"} />
          <div className="flex justify-between py-1.5 border-b border-white/5 last:border-0">
            <span className="text-xs text-slate-500">Expiry</span>
            <span className={`text-xs font-medium ${expiryColor(expiry)}`}>
              {formatExpiry(expiry)} {days !== null && days >= 0 ? `(${days} days)` : days !== null ? "(Expired)" : ""}
            </span>
          </div>
        </div>
      ) : (
        <span className="text-xs text-red-400">Not on file</span>
      )}
    </div>
  );
}

function ComplianceRow({ label, status }: { label: string; status: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
      <span className="text-xs text-slate-400">{label}</span>
      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${status ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
        {status ? "Active" : "Not Verified"}
      </span>
    </div>
  );
}

export default function CarrierPoolPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "ADMIN" || user?.role === "CEO";
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [equipFilter, setEquipFilter] = useState("");
  const [selectedCarrierId, setSelectedCarrierId] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<"profile" | "insurance" | "compliance" | "compass" | "inspections" | "performance" | "history">("profile");
  const [editingCarrier, setEditingCarrier] = useState<Carrier | null>(null);
  const [editForm, setEditForm] = useState({
    safetyScore: "", tier: "", numberOfTrucks: "", insuranceExpiry: "",
    autoLiabilityProvider: "", autoLiabilityAmount: "", autoLiabilityPolicy: "", autoLiabilityExpiry: "",
    cargoInsuranceProvider: "", cargoInsuranceAmount: "", cargoInsurancePolicy: "", cargoInsuranceExpiry: "",
    generalLiabilityProvider: "", generalLiabilityAmount: "", generalLiabilityPolicy: "", generalLiabilityExpiry: "",
    workersCompProvider: "", workersCompAmount: "", workersCompPolicy: "", workersCompExpiry: "",
    additionalInsuredSRL: false, waiverOfSubrogation: false, thirtyDayCancellationNotice: false,
    insuranceAgentName: "", insuranceAgentEmail: "", insuranceAgentPhone: "", insuranceAgencyName: "",
  });
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

  const selectedCarrier = carriers.find((c) => c.id === selectedCarrierId) || null;

  // ESC to close panel
  const closePanel = useCallback(() => { setSelectedCarrierId(null); }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") closePanel(); };
    if (selectedCarrierId) {
      document.addEventListener("keydown", h);
      return () => document.removeEventListener("keydown", h);
    }
  }, [selectedCarrierId, closePanel]);

  function openEdit(c: Carrier) {
    setEditingCarrier(c);
    setEditForm({
      safetyScore: c.safetyScore?.toString() || "",
      tier: c.tier,
      numberOfTrucks: c.numberOfTrucks?.toString() || "",
      insuranceExpiry: c.insuranceExpiry ? new Date(c.insuranceExpiry).toISOString().split("T")[0] : "",
      autoLiabilityProvider: c.autoLiabilityProvider || "",
      autoLiabilityAmount: c.autoLiabilityAmount?.toString() || "",
      autoLiabilityPolicy: c.autoLiabilityPolicy || "",
      autoLiabilityExpiry: c.autoLiabilityExpiry ? new Date(c.autoLiabilityExpiry).toISOString().split("T")[0] : "",
      cargoInsuranceProvider: c.cargoInsuranceProvider || "",
      cargoInsuranceAmount: c.cargoInsuranceAmount?.toString() || "",
      cargoInsurancePolicy: c.cargoInsurancePolicy || "",
      cargoInsuranceExpiry: c.cargoInsuranceExpiry ? new Date(c.cargoInsuranceExpiry).toISOString().split("T")[0] : "",
      generalLiabilityProvider: c.generalLiabilityProvider || "",
      generalLiabilityAmount: c.generalLiabilityAmount?.toString() || "",
      generalLiabilityPolicy: c.generalLiabilityPolicy || "",
      generalLiabilityExpiry: c.generalLiabilityExpiry ? new Date(c.generalLiabilityExpiry).toISOString().split("T")[0] : "",
      workersCompProvider: c.workersCompProvider || "",
      workersCompAmount: c.workersCompAmount?.toString() || "",
      workersCompPolicy: c.workersCompPolicy || "",
      workersCompExpiry: c.workersCompExpiry ? new Date(c.workersCompExpiry).toISOString().split("T")[0] : "",
      additionalInsuredSRL: c.additionalInsuredSRL ?? false,
      waiverOfSubrogation: c.waiverOfSubrogation ?? false,
      thirtyDayCancellationNotice: c.thirtyDayCancellationNotice ?? false,
      insuranceAgentName: c.insuranceAgentName || "",
      insuranceAgentEmail: c.insuranceAgentEmail || "",
      insuranceAgentPhone: c.insuranceAgentPhone || "",
      insuranceAgencyName: c.insuranceAgencyName || "",
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

      // Use REAL backend 31-check data if available
      const backendChecks: CompassCheck[] = (fmcsa?.checks || []).map((c: { name: string; result: string; detail: string; deduction: number }) => ({
        name: c.name,
        result: c.result === "PASS" ? "PASS" : c.result === "WARNING" ? "WARNING" : "FAIL",
        detail: c.detail || "",
        deduction: c.deduction || 0,
      }));
      const backendFlags: string[] = fmcsa?.flags || [];
      const backendRisk = fmcsa?.riskLevel || null;
      const backendRec = fmcsa?.recommendation || null;

      // Use backend data if available, fall back to frontend-calculated
      const finalChecks = backendChecks.length > 0 ? backendChecks : checks;
      const score = (backendScore && backendScore > 0) ? backendScore : frontendScore;
      const grade = backendGrade || (score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F");
      const riskLevel = backendRisk || (score >= 80 ? "LOW" : score >= 60 ? "MEDIUM" : score >= 40 ? "HIGH" : "CRITICAL");
      const recommendation = backendRec || (score >= 75 ? "APPROVE" : score >= 50 ? "REVIEW" : "REJECT");
      const flags = backendFlags.length > 0 ? backendFlags : checks.filter((c) => c.result === "FAIL").map((c) => c.name);

      const result: CompassResult = {
        score,
        grade,
        riskLevel,
        recommendation,
        checks: finalChecks,
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

  async function downloadCompassPdf(carrierId: string) {
    try {
      const res = await api.get(`/carriers/${carrierId}/compass-report`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `Compass-Report-${carrierId}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Compass PDF download failed:", err);
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
          <option value="" className="bg-[#0F1117] text-white">All Statuses</option>
          {["PENDING", "DOCUMENTS_SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED"].map((s) => (
            <option key={s} value={s} className="bg-[#0F1117] text-white">{s.replace(/_/g, " ")}</option>
          ))}
        </select>
        <select value={equipFilter} onChange={(e) => setEquipFilter(e.target.value)}
          className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white">
          <option value="" className="bg-[#0F1117] text-white">All Equipment</option>
          {["Dry Van", "Reefer", "Flatbed", "Step Deck", "Car Hauler", "Power Only"].map((t) => (
            <option key={t} value={t} className="bg-[#0F1117] text-white">{t}</option>
          ))}
        </select>
      </div>

      {/* Carrier List + Slide Panel Layout */}
      <div className="flex gap-0 relative">
        {/* LEFT: Carrier List */}
        <div className={`transition-all duration-300 space-y-3 ${selectedCarrier ? "w-full lg:w-[40%] lg:min-w-[340px]" : "w-full"}`}>
          {filtered.map((carrier) => (
            <button key={carrier.id} onClick={() => { setSelectedCarrierId(carrier.id); setPanelTab("profile"); }}
              className={`w-full text-left bg-white/5 rounded-xl border overflow-hidden p-4 hover:bg-white/[0.07] transition ${selectedCarrierId === carrier.id ? "border-gold/50 bg-white/[0.07]" : "border-white/10"}`}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
                  <Truck className="w-5 h-5 text-gold" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-white text-sm truncate">{carrier.company}</p>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${TIER_COLORS[carrier.tier] || ""}`}>{carrier.tier}</span>
                    {carrier.lastVettingScore != null && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#C9A84C]/10 text-[#C9A84C] border border-[#C9A84C]/20 flex items-center gap-0.5">
                        <Compass className="w-2.5 h-2.5" /> {carrier.lastVettingScore}
                      </span>
                    )}
                    {compassCarrierId === carrier.id && compassResult && !carrier.lastVettingScore && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#C9A84C]/10 text-[#C9A84C] border border-[#C9A84C]/20 flex items-center gap-0.5">
                        <Compass className="w-2.5 h-2.5" /> {compassResult.score}
                      </span>
                    )}
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${STATUS_COLORS[carrier.onboardingStatus] || "bg-white/10 text-slate-400"}`}>
                      {carrier.onboardingStatus.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-[11px] text-slate-400">
                    <span className="flex items-center gap-1"><Truck className="w-3 h-3" /> {carrier.equipmentTypes.join(", ")}</span>
                    {carrier.mcNumber && <span className="flex items-center gap-1"><Hash className="w-3 h-3" /> MC-{carrier.mcNumber}</span>}
                    {!selectedCarrier && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {carrier.operatingRegions.slice(0, 3).join(", ")}{carrier.operatingRegions.length > 3 ? ` +${carrier.operatingRegions.length - 3}` : ""}</span>}
                  </div>
                </div>
                {!selectedCarrier && (
                  <div className="hidden sm:flex items-center gap-5 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-bold text-white">{carrier.completedLoads}</p>
                      <p className="text-[10px] text-slate-500">Loads</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-white">{carrier.acceptanceRate}%</p>
                      <p className="text-[10px] text-slate-500">Accept</p>
                    </div>
                  </div>
                )}
              </div>
            </button>
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

        {/* RIGHT: Slide Panel */}
        {selectedCarrier && (
          <div className="w-full lg:w-[60%] border-l border-white/10 bg-[#161921] rounded-r-xl flex flex-col lg:flex-row fixed inset-0 z-40 lg:relative lg:inset-auto lg:z-auto lg:sticky lg:top-0 h-full lg:h-[calc(100vh-12rem)] lg:ml-3 animate-slide-in-right">
            {/* Mobile close bar */}
            <button onClick={closePanel} className="lg:hidden flex items-center gap-2 px-4 py-2 border-b border-white/10 text-slate-400 hover:text-white shrink-0">
              <X className="w-4 h-4" /> <span className="text-sm">Close</span>
            </button>
            <div className="flex flex-1 min-h-0">
            {/* Vertical Tab Bar */}
            <div className="w-[44px] shrink-0 border-r border-white/10 bg-[#0F1117] flex flex-col py-2">
              {([
                { key: "profile", icon: User, label: "Profile" },
                { key: "insurance", icon: Shield, label: "Insurance" },
                { key: "compliance", icon: CheckSquare, label: "Compliance" },
                { key: "compass", icon: Compass, label: "Compass" },
                { key: "inspections", icon: ClipboardList, label: "Inspections" },
                { key: "performance", icon: BarChart3, label: "Performance" },
                { key: "history", icon: Clock, label: "History" },
              ] as const).map(({ key, icon: Icon, label }) => (
                <button key={key} onClick={() => setPanelTab(key)} title={label}
                  className={`w-[44px] h-[40px] flex items-center justify-center relative transition ${panelTab === key ? "text-[#C9A84C]" : "text-slate-400 hover:text-slate-200"}`}>
                  {panelTab === key && <div className="absolute left-0 top-1 bottom-1 w-[3px] bg-[#C9A84C] rounded-r" />}
                  <Icon className="w-[18px] h-[18px]" />
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto">
              {/* Panel Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-[#2A2F42] shrink-0">
                <h2 className="text-sm font-bold text-white truncate">{selectedCarrier.company}</h2>
                <button onClick={closePanel} className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white transition">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-5">

                {/* ===== PROFILE TAB ===== */}
                {panelTab === "profile" && (
                  <div className="space-y-5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${TIER_COLORS[selectedCarrier.tier] || ""}`}>{selectedCarrier.tier}</span>
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[selectedCarrier.onboardingStatus] || "bg-white/10 text-slate-400"}`}>
                        {selectedCarrier.onboardingStatus.replace(/_/g, " ")}
                      </span>
                      {(selectedCarrier.lastVettingScore != null || (compassCarrierId === selectedCarrier.id && compassResult)) && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#C9A84C]/10 text-[#C9A84C] border border-[#C9A84C]/20 flex items-center gap-1">
                          <Compass className="w-3 h-3" /> Compass: {selectedCarrier.lastVettingScore ?? compassResult?.score ?? "—"}
                        </span>
                      )}
                    </div>

                    <div className="bg-white/5 rounded-lg p-4 space-y-0.5">
                      <InfoRow label="Contact" value={selectedCarrier.contactName} />
                      <InfoRow label="Email" value={<a href={`mailto:${selectedCarrier.email}`} className="text-gold hover:underline text-xs">{selectedCarrier.email}</a>} />
                      <InfoRow label="Phone" value={selectedCarrier.phone || "—"} />
                      <InfoRow label="MC#" value={selectedCarrier.mcNumber ? `MC-${selectedCarrier.mcNumber}` : "—"} />
                      <InfoRow label="DOT#" value={selectedCarrier.dotNumber || "—"} />
                      <InfoRow label="Location" value={selectedCarrier.city && selectedCarrier.state ? `${selectedCarrier.city}, ${selectedCarrier.state} ${selectedCarrier.zip || ""}` : "—"} />
                    </div>

                    <div className="bg-white/5 rounded-lg p-4 space-y-3">
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider">Equipment</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {selectedCarrier.equipmentTypes.map((eq) => (
                            <span key={eq} className="px-2 py-0.5 bg-white/10 rounded text-xs text-slate-300">{eq}</span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider">Regions</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {selectedCarrier.operatingRegions.map((r) => (
                            <span key={r} className="px-2 py-0.5 bg-white/10 rounded text-xs text-slate-300">{r}</span>
                          ))}
                        </div>
                      </div>
                      <InfoRow label="Fleet" value={selectedCarrier.numberOfTrucks ? `${selectedCarrier.numberOfTrucks} trucks` : "—"} />
                    </div>

                    <InfoRow label="Member Since" value={new Date(selectedCarrier.createdAt).toLocaleDateString()} />

                    <div className="flex flex-wrap gap-2 pt-3 border-t border-white/10">
                      <a href="/dashboard/messages" className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 text-white rounded-lg text-xs hover:bg-white/20 transition">
                        <MessageSquare className="w-3.5 h-3.5" /> Message
                      </a>
                      <a href="/dashboard/loads" className="flex items-center gap-1.5 px-3 py-1.5 bg-gold/20 text-gold rounded-lg text-xs hover:bg-gold/30 transition">
                        <FileText className="w-3.5 h-3.5" /> Tender Load
                      </a>
                      {isAdmin && selectedCarrier.onboardingStatus !== "APPROVED" && (
                        <button onClick={() => setConfirmAction({ id: selectedCarrier.id, status: "APPROVED", company: selectedCarrier.company })}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg text-xs hover:bg-green-500/30 transition">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                        </button>
                      )}
                      {isAdmin && selectedCarrier.onboardingStatus !== "REJECTED" && (
                        <button onClick={() => setConfirmAction({ id: selectedCarrier.id, status: "REJECTED", company: selectedCarrier.company })}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-xs hover:bg-red-500/30 transition">
                          <AlertCircle className="w-3.5 h-3.5" /> Reject
                        </button>
                      )}
                      {isAdmin && (
                        <button onClick={() => openEdit(selectedCarrier)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg text-xs hover:bg-blue-500/30 transition">
                          <BarChart3 className="w-3.5 h-3.5" /> Edit Profile
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* ===== INSURANCE TAB ===== */}
                {panelTab === "insurance" && (
                  <div className="space-y-4">
                    <InsuranceBlock title="AUTO LIABILITY" provider={selectedCarrier.autoLiabilityProvider} policy={selectedCarrier.autoLiabilityPolicy} amount={selectedCarrier.autoLiabilityAmount} expiry={selectedCarrier.autoLiabilityExpiry} />
                    <InsuranceBlock title="CARGO INSURANCE" provider={selectedCarrier.cargoInsuranceProvider} policy={selectedCarrier.cargoInsurancePolicy} amount={selectedCarrier.cargoInsuranceAmount} expiry={selectedCarrier.cargoInsuranceExpiry} />
                    <InsuranceBlock title="GENERAL LIABILITY" provider={selectedCarrier.generalLiabilityProvider} policy={selectedCarrier.generalLiabilityPolicy} amount={selectedCarrier.generalLiabilityAmount} expiry={selectedCarrier.generalLiabilityExpiry} />
                    <InsuranceBlock title="WORKERS COMPENSATION" provider={selectedCarrier.workersCompProvider} policy={selectedCarrier.workersCompPolicy} amount={selectedCarrier.workersCompAmount} expiry={selectedCarrier.workersCompExpiry} />

                    <div className="flex items-center gap-4 pt-3 border-t border-white/10">
                      <span className={`text-xs flex items-center gap-1 ${selectedCarrier.additionalInsuredSRL ? "text-green-400" : "text-slate-600"}`}>
                        {selectedCarrier.additionalInsuredSRL ? <CheckCircle2 className="w-3 h-3" /> : <X className="w-3 h-3" />} Additional Insured
                      </span>
                      <span className={`text-xs flex items-center gap-1 ${selectedCarrier.waiverOfSubrogation ? "text-green-400" : "text-slate-600"}`}>
                        {selectedCarrier.waiverOfSubrogation ? <CheckCircle2 className="w-3 h-3" /> : <X className="w-3 h-3" />} Waiver of Subrogation
                      </span>
                      <span className={`text-xs flex items-center gap-1 ${selectedCarrier.thirtyDayCancellationNotice ? "text-green-400" : "text-slate-600"}`}>
                        {selectedCarrier.thirtyDayCancellationNotice ? <CheckCircle2 className="w-3 h-3" /> : <X className="w-3 h-3" />} 30-Day Notice
                      </span>
                    </div>

                    {/* Insurance Agent */}
                    {(selectedCarrier.insuranceAgentName || selectedCarrier.insuranceAgentEmail || selectedCarrier.insuranceAgencyName) && (
                      <div className="bg-white/5 rounded-lg p-3 mt-2">
                        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Insurance Agent</span>
                        <div className="flex flex-wrap gap-3 mt-1 text-xs">
                          {selectedCarrier.insuranceAgentName && <span className="text-white">{selectedCarrier.insuranceAgentName}</span>}
                          {selectedCarrier.insuranceAgencyName && <span className="text-slate-400">({selectedCarrier.insuranceAgencyName})</span>}
                          {selectedCarrier.insuranceAgentEmail && <a href={`mailto:${selectedCarrier.insuranceAgentEmail}`} className="text-gold hover:underline">{selectedCarrier.insuranceAgentEmail}</a>}
                          {selectedCarrier.insuranceAgentPhone && <span className="text-slate-300">{selectedCarrier.insuranceAgentPhone}</span>}
                        </div>
                      </div>
                    )}

                    {isAdmin && (
                      <button onClick={() => openEdit(selectedCarrier)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg text-xs hover:bg-blue-500/30 transition mt-2">
                        <BarChart3 className="w-3.5 h-3.5" /> Edit Insurance
                      </button>
                    )}
                  </div>
                )}

                {/* ===== COMPLIANCE TAB ===== */}
                {panelTab === "compliance" && (
                  <div className="space-y-4">
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Compliance Status</h3>
                    <div className="bg-white/5 rounded-lg p-4 space-y-2">
                      <ComplianceRow label="IRP Registration" status={selectedCarrier.onboardingStatus === "APPROVED"} />
                      <ComplianceRow label="IFTA Decal" status={selectedCarrier.onboardingStatus === "APPROVED"} />
                      <ComplianceRow label="BOC-3 Filing" status={selectedCarrier.onboardingStatus === "APPROVED"} />
                      <ComplianceRow label="MCS-150 (Biennial Update)" status={selectedCarrier.dotNumber !== null} />
                      <ComplianceRow label="UCR Registration" status={selectedCarrier.onboardingStatus === "APPROVED"} />
                    </div>

                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Document Completeness</h3>
                    <div className="bg-white/5 rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between py-1 border-b border-white/5">
                        <span className="text-xs text-slate-400">W-9</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${selectedCarrier.w9Uploaded ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                          {selectedCarrier.w9Uploaded ? "Uploaded" : "Missing"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1 border-b border-white/5">
                        <span className="text-xs text-slate-400">Insurance Certificate</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${selectedCarrier.insuranceCertUploaded ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                          {selectedCarrier.insuranceCertUploaded ? "Uploaded" : "Missing"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1">
                        <span className="text-xs text-slate-400">Operating Authority</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${selectedCarrier.authorityDocUploaded ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                          {selectedCarrier.authorityDocUploaded ? "Uploaded" : "Missing"}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* ===== COMPASS TAB ===== */}
                {panelTab === "compass" && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      {isAdmin && (
                        <button onClick={() => runCompass(selectedCarrier.id)} disabled={compassLoading === selectedCarrier.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-[#C9A84C] text-[#C9A84C] rounded-lg text-xs hover:bg-[#C9A84C]/10 transition disabled:opacity-50">
                          {compassLoading === selectedCarrier.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Compass className="w-3.5 h-3.5" />}
                          {compassLoading === selectedCarrier.id ? "Running..." : "Run Compass"}
                        </button>
                      )}
                      <button onClick={() => downloadCompassPdf(selectedCarrier.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 text-white rounded-lg text-xs hover:bg-white/20 transition">
                        <Download className="w-3.5 h-3.5" /> Download PDF
                      </button>
                    </div>

                    {(compassCarrierId === selectedCarrier.id && compassResult) ? (
                      <div className="space-y-4">
                        <div className="bg-white/5 rounded-lg p-4">
                          <div className="flex items-center gap-6 flex-wrap">
                            <div>
                              <span className="text-[10px] text-slate-500 uppercase">Score</span>
                              <p className="text-2xl font-bold text-[#C9A84C]">{compassResult.score}/100</p>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-500 uppercase">Grade</span>
                              <p className={`text-2xl font-bold ${GRADE_COLORS[compassResult.grade] || "text-white"}`}>{compassResult.grade}</p>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-500 uppercase">Risk</span>
                              <p className={`text-lg font-semibold ${RISK_COLORS[compassResult.riskLevel] || "text-white"}`}>{compassResult.riskLevel}</p>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-500 uppercase">Recommendation</span>
                              <p className={`px-2 py-0.5 rounded text-xs font-bold mt-1 inline-block ${
                                compassResult.recommendation === "APPROVE" ? "bg-green-500/20 text-green-400" :
                                compassResult.recommendation === "REVIEW" ? "bg-yellow-500/20 text-yellow-400" :
                                "bg-red-500/20 text-red-400"
                              }`}>{compassResult.recommendation}</p>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          {compassResult.checks.map((check, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs py-1 border-b border-white/5">
                              {check.result === "PASS" ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" />
                              ) : check.result === "WARNING" ? (
                                <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-0.5" />
                              ) : (
                                <X className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                              )}
                              <div className="flex-1">
                                <span className={`font-medium ${
                                  check.result === "PASS" ? "text-slate-300" :
                                  check.result === "WARNING" ? "text-yellow-400" : "text-red-400"
                                }`}>{check.name}</span>
                                {check.detail && <span className="text-slate-500 ml-2">{check.detail}</span>}
                              </div>
                            </div>
                          ))}
                        </div>

                        {compassResult.flags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {compassResult.flags.map((flag, i) => (
                              <span key={i} className="px-2 py-0.5 bg-red-500/10 text-red-400 rounded text-[10px] font-medium border border-red-500/20">
                                {flag}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center gap-3 pt-2 border-t border-white/10">
                          <button onClick={() => runCompass(selectedCarrier.id)} disabled={compassLoading === selectedCarrier.id}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-400 hover:text-white transition">
                            <RefreshCw className={`w-3 h-3 ${compassLoading === selectedCarrier.id ? "animate-spin" : ""}`} /> Re-run
                          </button>
                          <span className="text-[10px] text-slate-600">Vetted: {new Date(compassResult.vettedAt).toLocaleString()}</span>
                        </div>
                      </div>
                    ) : selectedCarrier.lastVettingScore != null ? (
                      <div className="bg-white/5 rounded-lg p-4">
                        <div className="flex items-center gap-4">
                          <div>
                            <span className="text-[10px] text-slate-500 uppercase">Last Score</span>
                            <p className="text-2xl font-bold text-[#C9A84C]">{selectedCarrier.lastVettingScore}/100</p>
                          </div>
                          {selectedCarrier.lastVettingGrade && (
                            <div>
                              <span className="text-[10px] text-slate-500 uppercase">Grade</span>
                              <p className={`text-2xl font-bold ${GRADE_COLORS[selectedCarrier.lastVettingGrade] || "text-white"}`}>{selectedCarrier.lastVettingGrade}</p>
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-2">Run Compass to see full check details.</p>
                      </div>
                    ) : (
                      <div className="bg-white/5 rounded-lg p-6 text-center">
                        <Compass className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                        <p className="text-xs text-slate-500">No Compass report on file. Run Compass to vet this carrier.</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ===== INSPECTIONS TAB ===== */}
                {panelTab === "inspections" && (
                  <div className="space-y-4">
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">FMCSA Inspection Summary</h3>
                    <div className="bg-white/5 rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between py-1.5 border-b border-white/5">
                        <span className="text-xs text-slate-400">Driver Inspections</span>
                        <span className="text-xs text-white font-medium">&mdash;</span>
                      </div>
                      <div className="flex items-center justify-between py-1.5 border-b border-white/5">
                        <span className="text-xs text-slate-400">Driver OOS Rate</span>
                        <span className="text-xs text-slate-500">&mdash; (Nat&apos;l avg: 5.51%)</span>
                      </div>
                      <div className="flex items-center justify-between py-1.5 border-b border-white/5">
                        <span className="text-xs text-slate-400">Vehicle Inspections</span>
                        <span className="text-xs text-white font-medium">&mdash;</span>
                      </div>
                      <div className="flex items-center justify-between py-1.5">
                        <span className="text-xs text-slate-400">Vehicle OOS Rate</span>
                        <span className="text-xs text-slate-500">&mdash; (Nat&apos;l avg: 20.72%)</span>
                      </div>
                    </div>

                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Crash History</h3>
                    <div className="bg-white/5 rounded-lg p-4">
                      <div className="grid grid-cols-4 gap-3 text-center">
                        <div><p className="text-lg font-bold text-white">&mdash;</p><p className="text-[10px] text-slate-500">Total</p></div>
                        <div><p className="text-lg font-bold text-red-400">&mdash;</p><p className="text-[10px] text-slate-500">Fatal</p></div>
                        <div><p className="text-lg font-bold text-yellow-400">&mdash;</p><p className="text-[10px] text-slate-500">Injury</p></div>
                        <div><p className="text-lg font-bold text-slate-300">&mdash;</p><p className="text-[10px] text-slate-500">Towaway</p></div>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-600">FMCSA data populated after Compass vetting with valid DOT number.</p>
                  </div>
                )}

                {/* ===== PERFORMANCE TAB ===== */}
                {panelTab === "performance" && (
                  <div className="space-y-4">
                    <div className="bg-white/5 rounded-lg p-4">
                      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Caravan Tier</h3>
                      <div className="flex items-center gap-3 mb-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${TIER_COLORS[selectedCarrier.tier] || ""}`}>{selectedCarrier.tier}</span>
                        <span className="text-slate-500 text-xs">&rarr;</span>
                        <span className="text-xs text-slate-300">
                          {selectedCarrier.tier === "BRONZE" ? "SILVER (M3 needed)" :
                           selectedCarrier.tier === "SILVER" ? "GOLD (M5 needed)" :
                           selectedCarrier.tier === "GOLD" ? "PLATINUM (M7 needed)" :
                           selectedCarrier.tier === "PLATINUM" ? "Max tier reached" : "BRONZE (M1 needed)"}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400">
                        <span>Milestone: M{selectedCarrier.completedLoads >= 50 ? "7" : selectedCarrier.completedLoads >= 25 ? "5" : selectedCarrier.completedLoads >= 10 ? "3" : selectedCarrier.completedLoads >= 1 ? "1" : "0"}</span>
                        {selectedCarrier.completedLoads < 10 && (
                          <span className="ml-2 text-slate-500">Progress: {selectedCarrier.completedLoads}/{selectedCarrier.completedLoads < 1 ? "1 load to M1 (First Load)" : "10 loads to M2 (Proven)"}</span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white/5 rounded-lg p-3 text-center">
                        <p className="text-xl font-bold text-white">{selectedCarrier.completedLoads}</p>
                        <p className="text-[10px] text-slate-500">Completed Loads</p>
                      </div>
                      <div className="bg-white/5 rounded-lg p-3 text-center">
                        <p className="text-xl font-bold text-blue-400">{selectedCarrier.activeLoads}</p>
                        <p className="text-[10px] text-slate-500">Active Loads</p>
                      </div>
                      <div className="bg-white/5 rounded-lg p-3 text-center">
                        <p className="text-xl font-bold text-green-400">${(selectedCarrier.totalRevenue / 1000).toFixed(1)}k</p>
                        <p className="text-[10px] text-slate-500">Revenue</p>
                      </div>
                      <div className="bg-white/5 rounded-lg p-3 text-center">
                        <p className="text-xl font-bold text-gold">{selectedCarrier.acceptanceRate}%</p>
                        <p className="text-[10px] text-slate-500">Accept Rate</p>
                      </div>
                    </div>

                    <div className="bg-white/5 rounded-lg p-4 text-xs text-slate-400 space-y-1">
                      <InfoRow label="Tenders Accepted" value={selectedCarrier.tendersAccepted} />
                      <InfoRow label="Tenders Declined" value={selectedCarrier.tendersDeclined} />
                      <InfoRow label="Total Tenders" value={selectedCarrier.tendersTotal} />
                    </div>

                    {selectedCarrier.performance ? (
                      <div className="bg-white/5 rounded-lg p-4 space-y-3">
                        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Performance Scores</h3>
                        <PerformanceBar label="On-Time Pickup" value={selectedCarrier.performance.onTimePickup} color="bg-green-500" />
                        <PerformanceBar label="On-Time Delivery" value={selectedCarrier.performance.onTimeDelivery} color="bg-blue-500" />
                        <PerformanceBar label="Communication" value={selectedCarrier.performance.communication} color="bg-purple-500" />
                        <PerformanceBar label="Doc Timeliness" value={selectedCarrier.performance.docTimeliness} color="bg-gold" />
                        <InfoRow label="Claim Ratio" value={`${selectedCarrier.performance.claimRatio}%`} />
                      </div>
                    ) : (
                      <div className="bg-white/5 rounded-lg p-4 text-center">
                        <p className="text-xs text-slate-500">On-Time: —% | Avg Transit: — days</p>
                        <p className="text-[10px] text-slate-600 mt-1">Performance data available after completing loads.</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ===== HISTORY TAB ===== */}
                {panelTab === "history" && (
                  <div className="space-y-4">
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Compass Reports</h3>
                    {compassCarrierId === selectedCarrier.id && compassResult ? (
                      <div className="bg-white/5 rounded-lg p-4 space-y-2">
                        <div className="flex items-start gap-2 text-xs">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#C9A84C] mt-1.5 shrink-0" />
                          <div>
                            <span className="text-white">{new Date(compassResult.vettedAt).toLocaleString()}</span>
                            <span className="text-slate-500 ml-2">Score: {compassResult.score}/100, Grade {compassResult.grade}</span>
                          </div>
                        </div>
                      </div>
                    ) : selectedCarrier.lastVettingScore != null ? (
                      <div className="bg-white/5 rounded-lg p-4">
                        <div className="flex items-start gap-2 text-xs">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#C9A84C] mt-1.5 shrink-0" />
                          <span className="text-white">Last Score: {selectedCarrier.lastVettingScore}/100{selectedCarrier.lastVettingGrade ? `, Grade ${selectedCarrier.lastVettingGrade}` : ""}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-white/5 rounded-lg p-4 text-center">
                        <p className="text-xs text-slate-500">No Compass reports on file.</p>
                      </div>
                    )}

                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Status Changes</h3>
                    <div className="bg-white/5 rounded-lg p-4 space-y-2">
                      <div className="flex items-start gap-2 text-xs">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                        <div>
                          <span className="text-white">{new Date(selectedCarrier.createdAt).toLocaleDateString()}</span>
                          <span className="text-slate-500 ml-2">Registered ({selectedCarrier.onboardingStatus.replace(/_/g, " ")})</span>
                        </div>
                      </div>
                      {selectedCarrier.approvedAt && (
                        <div className="flex items-start gap-2 text-xs">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-400 mt-1.5 shrink-0" />
                          <div>
                            <span className="text-white">{new Date(selectedCarrier.approvedAt).toLocaleDateString()}</span>
                            <span className="text-slate-500 ml-2">Approved</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tender History</h3>
                    <div className="bg-white/5 rounded-lg p-4">
                      {selectedCarrier.tendersTotal > 0 ? (
                        <p className="text-xs text-slate-400">{selectedCarrier.tendersTotal} total tenders | {selectedCarrier.tendersAccepted} accepted | {selectedCarrier.tendersDeclined} declined</p>
                      ) : (
                        <p className="text-xs text-slate-500 text-center">No tender history.</p>
                      )}
                    </div>
                  </div>
                )}

              </div>
            </div>
            </div>{/* end inner flex wrapper */}
          </div>
        )}
      </div>

      {/* Edit Carrier Drawer */}
      <SlideDrawer open={!!editingCarrier} onClose={() => setEditingCarrier(null)} title={`Edit Carrier — ${editingCarrier?.company || ""}`} width="max-w-lg">
            <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
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

              {/* Insurance Details Section */}
              <div className="pt-3 border-t border-gray-200">
                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-3">Insurance Details</h4>

                {/* Auto Liability */}
                <p className="text-xs font-semibold text-gray-600 mb-1">Auto Liability</p>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <input placeholder="Provider" value={editForm.autoLiabilityProvider} onChange={(e) => setEditForm({ ...editForm, autoLiabilityProvider: e.target.value })}
                    className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50" />
                  <input placeholder="Policy #" value={editForm.autoLiabilityPolicy} onChange={(e) => setEditForm({ ...editForm, autoLiabilityPolicy: e.target.value })}
                    className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50" />
                  <input type="number" placeholder="Amount $" value={editForm.autoLiabilityAmount} onChange={(e) => setEditForm({ ...editForm, autoLiabilityAmount: e.target.value })}
                    className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50" />
                  <input type="date" value={editForm.autoLiabilityExpiry} onChange={(e) => setEditForm({ ...editForm, autoLiabilityExpiry: e.target.value })}
                    className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50" />
                </div>

                {/* Cargo Insurance */}
                <p className="text-xs font-semibold text-gray-600 mb-1">Motor Cargo Insurance</p>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <input placeholder="Provider" value={editForm.cargoInsuranceProvider} onChange={(e) => setEditForm({ ...editForm, cargoInsuranceProvider: e.target.value })}
                    className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50" />
                  <input placeholder="Policy #" value={editForm.cargoInsurancePolicy} onChange={(e) => setEditForm({ ...editForm, cargoInsurancePolicy: e.target.value })}
                    className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50" />
                  <input type="number" placeholder="Amount $" value={editForm.cargoInsuranceAmount} onChange={(e) => setEditForm({ ...editForm, cargoInsuranceAmount: e.target.value })}
                    className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50" />
                  <input type="date" value={editForm.cargoInsuranceExpiry} onChange={(e) => setEditForm({ ...editForm, cargoInsuranceExpiry: e.target.value })}
                    className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50" />
                </div>

                {/* General Liability */}
                <p className="text-xs font-semibold text-gray-600 mb-1">General Liability</p>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <input placeholder="Provider" value={editForm.generalLiabilityProvider} onChange={(e) => setEditForm({ ...editForm, generalLiabilityProvider: e.target.value })}
                    className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50" />
                  <input placeholder="Policy #" value={editForm.generalLiabilityPolicy} onChange={(e) => setEditForm({ ...editForm, generalLiabilityPolicy: e.target.value })}
                    className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50" />
                  <input type="number" placeholder="Amount $" value={editForm.generalLiabilityAmount} onChange={(e) => setEditForm({ ...editForm, generalLiabilityAmount: e.target.value })}
                    className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50" />
                  <input type="date" value={editForm.generalLiabilityExpiry} onChange={(e) => setEditForm({ ...editForm, generalLiabilityExpiry: e.target.value })}
                    className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50" />
                </div>

                {/* Workers Comp */}
                <p className="text-xs font-semibold text-gray-600 mb-1">Workers&#39; Compensation</p>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <input placeholder="Provider" value={editForm.workersCompProvider} onChange={(e) => setEditForm({ ...editForm, workersCompProvider: e.target.value })}
                    className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50" />
                  <input placeholder="Policy #" value={editForm.workersCompPolicy} onChange={(e) => setEditForm({ ...editForm, workersCompPolicy: e.target.value })}
                    className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50" />
                  <input type="number" placeholder="Amount $" value={editForm.workersCompAmount} onChange={(e) => setEditForm({ ...editForm, workersCompAmount: e.target.value })}
                    className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50" />
                  <input type="date" value={editForm.workersCompExpiry} onChange={(e) => setEditForm({ ...editForm, workersCompExpiry: e.target.value })}
                    className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50" />
                </div>

                {/* Checkboxes */}
                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={editForm.additionalInsuredSRL} onChange={(e) => setEditForm({ ...editForm, additionalInsuredSRL: e.target.checked })}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-amber-500 focus:ring-amber-500" />
                    <span className="text-xs text-gray-700">SRL listed as Additional Insured</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={editForm.waiverOfSubrogation} onChange={(e) => setEditForm({ ...editForm, waiverOfSubrogation: e.target.checked })}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-amber-500 focus:ring-amber-500" />
                    <span className="text-xs text-gray-700">Waiver of Subrogation</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={editForm.thirtyDayCancellationNotice} onChange={(e) => setEditForm({ ...editForm, thirtyDayCancellationNotice: e.target.checked })}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-amber-500 focus:ring-amber-500" />
                    <span className="text-xs text-gray-700">30-day cancellation notice</span>
                  </label>
                </div>

                {/* Insurance Agent Contact */}
                <div className="pt-3 border-t border-gray-100 mt-2">
                  <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">Insurance Agent Contact</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <input placeholder="Agent Name" value={editForm.insuranceAgentName} onChange={(e) => setEditForm({ ...editForm, insuranceAgentName: e.target.value })}
                      className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50" />
                    <input placeholder="Agent Email" type="email" value={editForm.insuranceAgentEmail} onChange={(e) => setEditForm({ ...editForm, insuranceAgentEmail: e.target.value })}
                      className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50" />
                    <input placeholder="Agent Phone" value={editForm.insuranceAgentPhone} onChange={(e) => setEditForm({ ...editForm, insuranceAgentPhone: e.target.value })}
                      className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50" />
                    <input placeholder="Agency Name" value={editForm.insuranceAgencyName} onChange={(e) => setEditForm({ ...editForm, insuranceAgencyName: e.target.value })}
                      className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50" />
                  </div>
                </div>
              </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setEditingCarrier(null)}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition">Cancel</button>
              <button onClick={() => updateCarrier.mutate({ id: editingCarrier!.id, data: editForm as any })}
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
