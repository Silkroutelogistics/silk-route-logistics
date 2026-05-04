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
  User, CheckSquare, ClipboardList, Upload, Eye, ArrowLeft, FolderOpen,
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

interface CarrierDoc {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  docType: string;
  status: string;
  notes: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; email: string };
}

const DOC_CATEGORIES: { key: string; label: string }[] = [
  { key: "W9", label: "W-9" },
  { key: "COI", label: "Certificate of Insurance" },
  { key: "AUTHORITY", label: "Operating Authority (MC)" },
  { key: "BOC3", label: "BOC-3 Filing" },
  { key: "CDL", label: "CDL" },
  { key: "MEDICAL_CARD", label: "Medical Card" },
  { key: "MVR", label: "Motor Vehicle Report" },
  { key: "REGISTRATION", label: "Equipment Registration" },
  { key: "INSPECTION", label: "Inspection Report" },
  { key: "OTHER", label: "Other" },
];

const DOC_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700",
  VERIFIED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
};

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
  SILVER: "bg-slate-400/20 text-gray-700 border-slate-400/30",
  GUEST: "bg-white/10 text-gray-600 border-white/20",
  NONE: "bg-gray-100 text-slate-500 border-gray-200",
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
    <div className="bg-gray-100 rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">{icon}</div>
        <div>
          <p className="text-2xl font-bold text-white">{value}</p>
          <p className="text-xs text-gray-600">{label}</p>
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
        <span className="text-gray-600">{label}</span>
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
    <div className="bg-gray-100 rounded-lg p-4">
      <h4 className="text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-2">{title}</h4>
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
      <span className="text-xs text-gray-600">{label}</span>
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
  const [panelTab, setPanelTab] = useState<"profile" | "insurance" | "compliance" | "compass" | "inspections" | "performance" | "history" | "documents">("profile");
  const [editingCarrier, setEditingCarrier] = useState<Carrier | null>(null);
  const [editingTab, setEditingTab] = useState<string | null>(null);
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
  const [docView, setDocView] = useState<"list" | "upload" | "preview">("list");
  const [previewDoc, setPreviewDoc] = useState<CarrierDoc | null>(null);
  const [uploadDocType, setUploadDocType] = useState("OTHER");
  const [uploadNotes, setUploadNotes] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);

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

  // Carrier documents
  const { data: docsData, refetch: refetchDocs } = useQuery({
    queryKey: ["carrier-docs", selectedCarrierId],
    queryFn: () => api.get<{ documents: CarrierDoc[] }>(`/carriers/${selectedCarrierId}/documents`).then(r => r.data),
    enabled: !!selectedCarrierId && panelTab === "documents",
  });

  const uploadDocMutation = useMutation({
    mutationFn: ({ carrierId, formData }: { carrierId: string; formData: FormData }) =>
      api.post(`/carriers/${carrierId}/documents`, formData, { headers: { "Content-Type": "multipart/form-data" } }),
    onSuccess: () => { refetchDocs(); setDocView("list"); setUploadFile(null); setUploadNotes(""); setUploadDocType("OTHER"); },
  });

  const updateDocStatus = useMutation({
    mutationFn: ({ carrierId, docId, status }: { carrierId: string; docId: string; status: string }) =>
      api.patch(`/carriers/${carrierId}/documents/${docId}`, { status }),
    onSuccess: () => refetchDocs(),
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

  const tierCounts = { PLATINUM: 0, GOLD: 0, SILVER: 0, GUEST: 0 };
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Carrier Pool</h1>
          <p className="text-gray-600 text-sm mt-1">{carriers.length} carriers in network</p>
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
        {(["PLATINUM", "GOLD", "SILVER", "GUEST"] as const).map((tier) => (
          <button key={tier} onClick={() => setTierFilter(tierFilter === tier ? "" : tier)}
            className={`bg-gray-100 rounded-xl border p-4 text-left transition ${tierFilter === tier ? "border-gold" : "border-gray-200 hover:border-white/20"}`}>
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
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-600" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by company, MC#, DOT#, email..."
            className="w-full pl-9 pr-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-gold/50" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-sm text-slate-700">
          <option value="" className="bg-[#0F1117] text-white">All Statuses</option>
          {["PENDING", "DOCUMENTS_SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED"].map((s) => (
            <option key={s} value={s} className="bg-[#0F1117] text-white">{s.replace(/_/g, " ")}</option>
          ))}
        </select>
        <select value={equipFilter} onChange={(e) => setEquipFilter(e.target.value)}
          className="px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-sm text-slate-700">
          <option value="" className="bg-[#0F1117] text-white">All Equipment</option>
          {["Dry Van", "Reefer", "Flatbed", "Step Deck", "Car Hauler", "Power Only"].map((t) => (
            <option key={t} value={t} className="bg-[#0F1117] text-white">{t}</option>
          ))}
        </select>
      </div>

      {/* Carrier List + Panel */}
      <div>
        {/* Carrier List — shrinks when panel open */}
        <div className={`transition-all duration-300 space-y-3`}>
          {filtered.map((carrier) => (
            <button key={carrier.id} onClick={() => { setSelectedCarrierId(carrier.id); setPanelTab("profile"); }}
              className={`w-full text-left bg-gray-100 rounded-xl border overflow-hidden p-4 hover:bg-white/[0.07] transition ${selectedCarrierId === carrier.id ? "border-gold/50 bg-white/[0.07]" : "border-gray-200"}`}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
                  <Truck className="w-5 h-5 text-gold" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-white text-sm truncate">{carrier.company}</p>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${TIER_COLORS[carrier.tier] || ""}`}>{carrier.tier}</span>
                    {carrier.lastVettingScore != null && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#C5A572]/10 text-[#C5A572] border border-[#C5A572]/20 flex items-center gap-0.5">
                        <Compass className="w-2.5 h-2.5" /> {carrier.lastVettingScore}
                      </span>
                    )}
                    {compassCarrierId === carrier.id && compassResult && !carrier.lastVettingScore && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#C5A572]/10 text-[#C5A572] border border-[#C5A572]/20 flex items-center gap-0.5">
                        <Compass className="w-2.5 h-2.5" /> {compassResult.score}
                      </span>
                    )}
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${STATUS_COLORS[carrier.onboardingStatus] || "bg-white/10 text-gray-600"}`}>
                      {carrier.onboardingStatus.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-[11px] text-gray-600">
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
              <Truck className="w-12 h-12 text-gray-700 mb-4" />
              <h3 className="text-lg font-semibold text-white mb-1">No carriers match your criteria</h3>
              <p className="text-sm text-gray-600 mb-4 max-w-sm">Invite carriers to join your network</p>
              <a href="/onboarding" className="px-4 py-2 bg-gold text-navy rounded-lg text-sm font-medium">Invite Carriers</a>
            </div>
          )}
        </div>

        {/* RIGHT: Slide Panel */}
        {selectedCarrier && (
          <div className="fixed top-0 right-0 bottom-0 w-[720px] border-l border-gray-200 bg-white flex flex-row overflow-hidden shadow-2xl z-40 animate-slide-in-right">
            {/* Vertical Icon Tab Strip */}
            <div className="w-[66px] shrink-0 border-r border-gray-100 bg-gray-50/80 flex flex-col items-center pt-5 gap-3">
              {([
                { key: "profile", icon: User, label: "Profile" },
                { key: "insurance", icon: Shield, label: "Insurance" },
                { key: "compliance", icon: CheckSquare, label: "Compliance" },
                { key: "compass", icon: Compass, label: "Compass" },
                { key: "inspections", icon: ClipboardList, label: "Inspect" },
                { key: "performance", icon: BarChart3, label: "Perform" },
                { key: "history", icon: Clock, label: "History" },
                { key: "documents", icon: FolderOpen, label: "Docs" },
              ] as const).map(({ key, icon: Icon, label }) => (
                <button key={key} onClick={() => { setPanelTab(key); setEditingTab(null); setDocView("list"); setPreviewDoc(null); }} title={label}
                  className="flex flex-col items-center gap-1.5 py-1 transition-all duration-150">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-150 ${panelTab === key ? "bg-[#C5A572] text-[#0A2540] shadow-sm" : "text-gray-400 hover:bg-gray-200/80 hover:text-gray-600"}`}>
                    <Icon className={`w-[18px] h-[18px] transition-all duration-150 ${panelTab === key ? "stroke-[2.5]" : "stroke-[1.5]"}`} />
                  </div>
                  <span className={`text-[10px] leading-none transition-all duration-150 ${panelTab === key ? "text-[#C5A572] font-semibold" : "text-gray-400 font-medium"}`}>{label}</span>
                </button>
              ))}
            </div>

            {/* Content Area */}
            <div className="flex-1 flex flex-col min-w-0">
              {/* Panel Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 shrink-0">
                <h2 className="text-base font-semibold text-gray-900 truncate">{selectedCarrier.company}</h2>
                <button onClick={closePanel} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Tab Content */}
              <div className="flex-1 overflow-y-auto">

              <div className="p-5 space-y-5">

                {/* ===== PROFILE TAB ===== */}
                {panelTab === "profile" && (
                  <div className="space-y-5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${TIER_COLORS[selectedCarrier.tier] || ""}`}>{selectedCarrier.tier}</span>
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[selectedCarrier.onboardingStatus] || "bg-white/10 text-gray-600"}`}>
                        {selectedCarrier.onboardingStatus.replace(/_/g, " ")}
                      </span>
                      {(selectedCarrier.lastVettingScore != null || (compassCarrierId === selectedCarrier.id && compassResult)) && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#C5A572]/10 text-[#C5A572] border border-[#C5A572]/20 flex items-center gap-1">
                          <Compass className="w-3 h-3" /> Compass: {selectedCarrier.lastVettingScore ?? compassResult?.score ?? "—"}
                        </span>
                      )}
                    </div>

                    <div className="bg-gray-100 rounded-lg p-4 space-y-0.5">
                      <InfoRow label="Contact" value={selectedCarrier.contactName} />
                      <InfoRow label="Email" value={<a href={`mailto:${selectedCarrier.email}`} className="text-gold hover:underline text-xs">{selectedCarrier.email}</a>} />
                      <InfoRow label="Phone" value={selectedCarrier.phone || "—"} />
                      <InfoRow label="MC#" value={selectedCarrier.mcNumber ? `MC-${selectedCarrier.mcNumber}` : "—"} />
                      <InfoRow label="DOT#" value={selectedCarrier.dotNumber || "—"} />
                      <InfoRow label="Location" value={selectedCarrier.city && selectedCarrier.state ? `${selectedCarrier.city}, ${selectedCarrier.state} ${selectedCarrier.zip || ""}` : "—"} />
                    </div>

                    <div className="bg-gray-100 rounded-lg p-4 space-y-3">
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider">Equipment</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {selectedCarrier.equipmentTypes.map((eq) => (
                            <span key={eq} className="px-2 py-0.5 bg-white/10 rounded text-xs text-gray-700">{eq}</span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider">Regions</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {selectedCarrier.operatingRegions.map((r) => (
                            <span key={r} className="px-2 py-0.5 bg-white/10 rounded text-xs text-gray-700">{r}</span>
                          ))}
                        </div>
                      </div>
                      <InfoRow label="Fleet" value={selectedCarrier.numberOfTrucks ? `${selectedCarrier.numberOfTrucks} trucks` : "—"} />
                    </div>

                    <InfoRow label="Member Since" value={new Date(selectedCarrier.createdAt).toLocaleDateString()} />

                    <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-200">
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
                      {isAdmin && editingTab !== "profile" && (
                        <button onClick={() => { openEdit(selectedCarrier); setEditingTab("profile"); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg text-xs hover:bg-blue-500/30 transition">
                          <BarChart3 className="w-3.5 h-3.5" /> Edit Profile
                        </button>
                      )}
                    </div>

                    {/* Inline Profile Edit */}
                    {editingTab === "profile" && (
                      <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-semibold text-gray-900">Edit Profile</h4>
                          <button onClick={() => setEditingTab(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 mb-1 block">Tier</label>
                          <select value={editForm.tier} onChange={(e) => setEditForm({ ...editForm, tier: e.target.value })}
                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm">
                            {["SILVER", "GOLD", "PLATINUM"].map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 mb-1 block">Safety Score (%)</label>
                          <input type="number" min="0" max="100" value={editForm.safetyScore}
                            onChange={(e) => setEditForm({ ...editForm, safetyScore: e.target.value })}
                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 mb-1 block">Number of Trucks</label>
                          <input type="number" min="1" value={editForm.numberOfTrucks}
                            onChange={(e) => setEditForm({ ...editForm, numberOfTrucks: e.target.value })}
                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm" />
                        </div>
                        <button onClick={() => { updateCarrier.mutate({ id: selectedCarrier.id, data: editForm as any }); setEditingTab(null); }}
                          disabled={updateCarrier.isPending}
                          className="w-full px-4 py-2 bg-[#C5A572] text-[#0A2540] rounded-lg text-sm font-semibold hover:bg-[#d4b65c] transition disabled:opacity-50">
                          {updateCarrier.isPending ? "Saving..." : "Save Changes"}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* ===== INSURANCE TAB ===== */}
                {panelTab === "insurance" && (
                  <div className="space-y-4">
                    <InsuranceBlock title="AUTO LIABILITY" provider={selectedCarrier.autoLiabilityProvider} policy={selectedCarrier.autoLiabilityPolicy} amount={selectedCarrier.autoLiabilityAmount} expiry={selectedCarrier.autoLiabilityExpiry} />
                    <InsuranceBlock title="CARGO INSURANCE" provider={selectedCarrier.cargoInsuranceProvider} policy={selectedCarrier.cargoInsurancePolicy} amount={selectedCarrier.cargoInsuranceAmount} expiry={selectedCarrier.cargoInsuranceExpiry} />
                    <InsuranceBlock title="GENERAL LIABILITY" provider={selectedCarrier.generalLiabilityProvider} policy={selectedCarrier.generalLiabilityPolicy} amount={selectedCarrier.generalLiabilityAmount} expiry={selectedCarrier.generalLiabilityExpiry} />
                    <InsuranceBlock title="WORKERS COMPENSATION" provider={selectedCarrier.workersCompProvider} policy={selectedCarrier.workersCompPolicy} amount={selectedCarrier.workersCompAmount} expiry={selectedCarrier.workersCompExpiry} />

                    <div className="flex items-center gap-4 pt-3 border-t border-gray-200">
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
                      <div className="bg-gray-100 rounded-lg p-3 mt-2">
                        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Insurance Agent</span>
                        <div className="flex flex-wrap gap-3 mt-1 text-xs">
                          {selectedCarrier.insuranceAgentName && <span className="text-white">{selectedCarrier.insuranceAgentName}</span>}
                          {selectedCarrier.insuranceAgencyName && <span className="text-gray-600">({selectedCarrier.insuranceAgencyName})</span>}
                          {selectedCarrier.insuranceAgentEmail && <a href={`mailto:${selectedCarrier.insuranceAgentEmail}`} className="text-gold hover:underline">{selectedCarrier.insuranceAgentEmail}</a>}
                          {selectedCarrier.insuranceAgentPhone && <span className="text-gray-700">{selectedCarrier.insuranceAgentPhone}</span>}
                        </div>
                      </div>
                    )}

                    {isAdmin && editingTab !== "insurance" && (
                      <button onClick={() => { openEdit(selectedCarrier); setEditingTab("insurance"); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg text-xs hover:bg-blue-500/30 transition mt-2">
                        <BarChart3 className="w-3.5 h-3.5" /> Edit Insurance
                      </button>
                    )}
                    {editingTab === "insurance" && (
                      <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-semibold text-gray-900">Edit Insurance Details</h4>
                          <button onClick={() => setEditingTab(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 mb-1 block">Tier</label>
                          <select value={editForm.tier} onChange={(e) => setEditForm({ ...editForm, tier: e.target.value })}
                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm">
                            {["SILVER", "GOLD", "PLATINUM"].map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-gray-500 mb-1 block">Safety Score (%)</label>
                            <input type="number" min="0" max="100" value={editForm.safetyScore}
                              onChange={(e) => setEditForm({ ...editForm, safetyScore: e.target.value })}
                              className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded text-xs" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 mb-1 block">Number of Trucks</label>
                            <input type="number" min="1" value={editForm.numberOfTrucks}
                              onChange={(e) => setEditForm({ ...editForm, numberOfTrucks: e.target.value })}
                              className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded text-xs" />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 mb-1 block">Insurance Expiry</label>
                          <input type="date" value={editForm.insuranceExpiry}
                            onChange={(e) => setEditForm({ ...editForm, insuranceExpiry: e.target.value })}
                            className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded text-xs" />
                        </div>
                        {[
                          { label: "Auto Liability", prefix: "autoLiability" },
                          { label: "Motor Cargo Insurance", prefix: "cargoInsurance" },
                          { label: "General Liability", prefix: "generalLiability" },
                          { label: "Workers' Compensation", prefix: "workersComp" },
                        ].map(({ label, prefix }) => (
                          <div key={prefix}>
                            <p className="text-xs font-semibold text-gray-700 mb-1">{label}</p>
                            <div className="grid grid-cols-2 gap-2">
                              <input placeholder="Provider" value={(editForm as any)[`${prefix}Provider`]} onChange={(e) => setEditForm({ ...editForm, [`${prefix}Provider`]: e.target.value })}
                                className="px-2 py-1.5 bg-white border border-gray-200 rounded text-xs" />
                              <input placeholder="Policy #" value={(editForm as any)[`${prefix}Policy`]} onChange={(e) => setEditForm({ ...editForm, [`${prefix}Policy`]: e.target.value })}
                                className="px-2 py-1.5 bg-white border border-gray-200 rounded text-xs" />
                              <input placeholder="Amount $" value={(editForm as any)[`${prefix}Amount`]} onChange={(e) => setEditForm({ ...editForm, [`${prefix}Amount`]: e.target.value })}
                                className="px-2 py-1.5 bg-white border border-gray-200 rounded text-xs" />
                              <input type="date" value={(editForm as any)[`${prefix}Expiry`]} onChange={(e) => setEditForm({ ...editForm, [`${prefix}Expiry`]: e.target.value })}
                                className="px-2 py-1.5 bg-white border border-gray-200 rounded text-xs" />
                            </div>
                          </div>
                        ))}
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 text-xs text-gray-700">
                            <input type="checkbox" checked={editForm.additionalInsuredSRL as boolean} onChange={(e) => setEditForm({ ...editForm, additionalInsuredSRL: e.target.checked })} className="rounded" />
                            SRL listed as Additional Insured
                          </label>
                          <label className="flex items-center gap-2 text-xs text-gray-700">
                            <input type="checkbox" checked={editForm.waiverOfSubrogation as boolean} onChange={(e) => setEditForm({ ...editForm, waiverOfSubrogation: e.target.checked })} className="rounded" />
                            Waiver of Subrogation
                          </label>
                          <label className="flex items-center gap-2 text-xs text-gray-700">
                            <input type="checkbox" checked={editForm.thirtyDayCancellationNotice as boolean} onChange={(e) => setEditForm({ ...editForm, thirtyDayCancellationNotice: e.target.checked })} className="rounded" />
                            30-day cancellation notice
                          </label>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-700 mb-1">Insurance Agent Contact</p>
                          <div className="grid grid-cols-2 gap-2">
                            <input placeholder="Agent Name" value={editForm.insuranceAgentName} onChange={(e) => setEditForm({ ...editForm, insuranceAgentName: e.target.value })}
                              className="px-2 py-1.5 bg-white border border-gray-200 rounded text-xs" />
                            <input placeholder="Agent Email" type="email" value={editForm.insuranceAgentEmail} onChange={(e) => setEditForm({ ...editForm, insuranceAgentEmail: e.target.value })}
                              className="px-2 py-1.5 bg-white border border-gray-200 rounded text-xs" />
                            <input placeholder="Agent Phone" value={editForm.insuranceAgentPhone} onChange={(e) => setEditForm({ ...editForm, insuranceAgentPhone: e.target.value })}
                              className="px-2 py-1.5 bg-white border border-gray-200 rounded text-xs" />
                            <input placeholder="Agency Name" value={editForm.insuranceAgencyName} onChange={(e) => setEditForm({ ...editForm, insuranceAgencyName: e.target.value })}
                              className="px-2 py-1.5 bg-white border border-gray-200 rounded text-xs" />
                          </div>
                        </div>
                        <button onClick={() => { updateCarrier.mutate({ id: selectedCarrier.id, data: editForm as any }); setEditingTab(null); }}
                          disabled={updateCarrier.isPending}
                          className="w-full px-4 py-2 bg-[#C5A572] text-[#0A2540] rounded-lg text-sm font-semibold hover:bg-[#d4b65c] transition disabled:opacity-50">
                          {updateCarrier.isPending ? "Saving..." : "Save Changes"}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* ===== COMPLIANCE TAB ===== */}
                {panelTab === "compliance" && (
                  <div className="space-y-4">
                    <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Compliance Status</h3>
                    <div className="bg-gray-100 rounded-lg p-4 space-y-2">
                      <ComplianceRow label="IRP Registration" status={selectedCarrier.onboardingStatus === "APPROVED"} />
                      <ComplianceRow label="IFTA Decal" status={selectedCarrier.onboardingStatus === "APPROVED"} />
                      <ComplianceRow label="BOC-3 Filing" status={selectedCarrier.onboardingStatus === "APPROVED"} />
                      <ComplianceRow label="MCS-150 (Biennial Update)" status={selectedCarrier.dotNumber !== null} />
                      <ComplianceRow label="UCR Registration" status={selectedCarrier.onboardingStatus === "APPROVED"} />
                    </div>

                    <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Document Completeness</h3>
                    <div className="bg-gray-100 rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between py-1 border-b border-white/5">
                        <span className="text-xs text-gray-600">W-9</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${selectedCarrier.w9Uploaded ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                          {selectedCarrier.w9Uploaded ? "Uploaded" : "Missing"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1 border-b border-white/5">
                        <span className="text-xs text-gray-600">Insurance Certificate</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${selectedCarrier.insuranceCertUploaded ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                          {selectedCarrier.insuranceCertUploaded ? "Uploaded" : "Missing"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1">
                        <span className="text-xs text-gray-600">Operating Authority</span>
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
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-[#C5A572] text-[#C5A572] rounded-lg text-xs hover:bg-[#C5A572]/10 transition disabled:opacity-50">
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
                        <div className="bg-gray-100 rounded-lg p-4">
                          <div className="flex items-center gap-6 flex-wrap">
                            <div>
                              <span className="text-[10px] text-slate-500 uppercase">Score</span>
                              <p className="text-2xl font-bold text-[#C5A572]">{compassResult.score}/100</p>
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
                                  check.result === "PASS" ? "text-gray-700" :
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

                        <div className="flex items-center gap-3 pt-2 border-t border-gray-200">
                          <button onClick={() => runCompass(selectedCarrier.id)} disabled={compassLoading === selectedCarrier.id}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs text-gray-600 hover:text-white transition">
                            <RefreshCw className={`w-3 h-3 ${compassLoading === selectedCarrier.id ? "animate-spin" : ""}`} /> Re-run
                          </button>
                          <span className="text-[10px] text-slate-600">Vetted: {new Date(compassResult.vettedAt).toLocaleString()}</span>
                        </div>
                      </div>
                    ) : selectedCarrier.lastVettingScore != null ? (
                      <div className="bg-gray-100 rounded-lg p-4">
                        <div className="flex items-center gap-4">
                          <div>
                            <span className="text-[10px] text-slate-500 uppercase">Last Score</span>
                            <p className="text-2xl font-bold text-[#C5A572]">{selectedCarrier.lastVettingScore}/100</p>
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
                      <div className="bg-gray-100 rounded-lg p-6 text-center">
                        <Compass className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                        <p className="text-xs text-slate-500">No Compass report on file. Run Compass to vet this carrier.</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ===== INSPECTIONS TAB ===== */}
                {panelTab === "inspections" && (
                  <div className="space-y-4">
                    <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">FMCSA Inspection Summary</h3>
                    <div className="bg-gray-100 rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between py-1.5 border-b border-white/5">
                        <span className="text-xs text-gray-600">Driver Inspections</span>
                        <span className="text-xs text-white font-medium">&mdash;</span>
                      </div>
                      <div className="flex items-center justify-between py-1.5 border-b border-white/5">
                        <span className="text-xs text-gray-600">Driver OOS Rate</span>
                        <span className="text-xs text-slate-500">&mdash; (Nat&apos;l avg: 5.51%)</span>
                      </div>
                      <div className="flex items-center justify-between py-1.5 border-b border-white/5">
                        <span className="text-xs text-gray-600">Vehicle Inspections</span>
                        <span className="text-xs text-white font-medium">&mdash;</span>
                      </div>
                      <div className="flex items-center justify-between py-1.5">
                        <span className="text-xs text-gray-600">Vehicle OOS Rate</span>
                        <span className="text-xs text-slate-500">&mdash; (Nat&apos;l avg: 20.72%)</span>
                      </div>
                    </div>

                    <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Crash History</h3>
                    <div className="bg-gray-100 rounded-lg p-4">
                      <div className="grid grid-cols-4 gap-3 text-center">
                        <div><p className="text-lg font-bold text-white">&mdash;</p><p className="text-[10px] text-slate-500">Total</p></div>
                        <div><p className="text-lg font-bold text-red-400">&mdash;</p><p className="text-[10px] text-slate-500">Fatal</p></div>
                        <div><p className="text-lg font-bold text-yellow-400">&mdash;</p><p className="text-[10px] text-slate-500">Injury</p></div>
                        <div><p className="text-lg font-bold text-gray-700">&mdash;</p><p className="text-[10px] text-slate-500">Towaway</p></div>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-600">FMCSA data populated after Compass vetting with valid DOT number.</p>
                  </div>
                )}

                {/* ===== PERFORMANCE TAB ===== */}
                {panelTab === "performance" && (
                  <div className="space-y-4">
                    <div className="bg-gray-100 rounded-lg p-4">
                      <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">Caravan Tier</h3>
                      <div className="flex items-center gap-3 mb-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${TIER_COLORS[selectedCarrier.tier] || ""}`}>{selectedCarrier.tier}</span>
                        <span className="text-slate-500 text-xs">&rarr;</span>
                        <span className="text-xs text-gray-700">
                          {selectedCarrier.tier === "SILVER" ? "GOLD (M4 needed)" :
                           selectedCarrier.tier === "GOLD" ? "PLATINUM (M5 needed)" :
                           selectedCarrier.tier === "PLATINUM" ? "Max tier reached" : "SILVER (onboarding needed)"}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600">
                        <span>Milestone: M{selectedCarrier.completedLoads >= 50 ? "7" : selectedCarrier.completedLoads >= 25 ? "5" : selectedCarrier.completedLoads >= 10 ? "3" : selectedCarrier.completedLoads >= 1 ? "1" : "0"}</span>
                        {selectedCarrier.completedLoads < 10 && (
                          <span className="ml-2 text-slate-500">Progress: {selectedCarrier.completedLoads}/{selectedCarrier.completedLoads < 1 ? "1 load to M1 (First Load)" : "10 loads to M2 (Proven)"}</span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-gray-100 rounded-lg p-3 text-center">
                        <p className="text-xl font-bold text-white">{selectedCarrier.completedLoads}</p>
                        <p className="text-[10px] text-slate-500">Completed Loads</p>
                      </div>
                      <div className="bg-gray-100 rounded-lg p-3 text-center">
                        <p className="text-xl font-bold text-blue-400">{selectedCarrier.activeLoads}</p>
                        <p className="text-[10px] text-slate-500">Active Loads</p>
                      </div>
                      <div className="bg-gray-100 rounded-lg p-3 text-center">
                        <p className="text-xl font-bold text-green-400">${(selectedCarrier.totalRevenue / 1000).toFixed(1)}k</p>
                        <p className="text-[10px] text-slate-500">Revenue</p>
                      </div>
                      <div className="bg-gray-100 rounded-lg p-3 text-center">
                        <p className="text-xl font-bold text-gold">{selectedCarrier.acceptanceRate}%</p>
                        <p className="text-[10px] text-slate-500">Accept Rate</p>
                      </div>
                    </div>

                    <div className="bg-gray-100 rounded-lg p-4 text-xs text-gray-600 space-y-1">
                      <InfoRow label="Tenders Accepted" value={selectedCarrier.tendersAccepted} />
                      <InfoRow label="Tenders Declined" value={selectedCarrier.tendersDeclined} />
                      <InfoRow label="Total Tenders" value={selectedCarrier.tendersTotal} />
                    </div>

                    {selectedCarrier.performance ? (
                      <div className="bg-gray-100 rounded-lg p-4 space-y-3">
                        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">Performance Scores</h3>
                        <PerformanceBar label="On-Time Pickup" value={selectedCarrier.performance.onTimePickup} color="bg-green-500" />
                        <PerformanceBar label="On-Time Delivery" value={selectedCarrier.performance.onTimeDelivery} color="bg-blue-500" />
                        <PerformanceBar label="Communication" value={selectedCarrier.performance.communication} color="bg-purple-500" />
                        <PerformanceBar label="Doc Timeliness" value={selectedCarrier.performance.docTimeliness} color="bg-gold" />
                        <InfoRow label="Claim Ratio" value={`${selectedCarrier.performance.claimRatio}%`} />
                      </div>
                    ) : (
                      <div className="bg-gray-100 rounded-lg p-4 text-center">
                        <p className="text-xs text-slate-500">On-Time: —% | Avg Transit: — days</p>
                        <p className="text-[10px] text-slate-600 mt-1">Performance data available after completing loads.</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ===== HISTORY TAB ===== */}
                {panelTab === "history" && (
                  <div className="space-y-4">
                    <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Compass Reports</h3>
                    {compassCarrierId === selectedCarrier.id && compassResult ? (
                      <div className="bg-gray-100 rounded-lg p-4 space-y-2">
                        <div className="flex items-start gap-2 text-xs">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#C5A572] mt-1.5 shrink-0" />
                          <div>
                            <span className="text-white">{new Date(compassResult.vettedAt).toLocaleString()}</span>
                            <span className="text-slate-500 ml-2">Score: {compassResult.score}/100, Grade {compassResult.grade}</span>
                          </div>
                        </div>
                      </div>
                    ) : selectedCarrier.lastVettingScore != null ? (
                      <div className="bg-gray-100 rounded-lg p-4">
                        <div className="flex items-start gap-2 text-xs">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#C5A572] mt-1.5 shrink-0" />
                          <span className="text-white">Last Score: {selectedCarrier.lastVettingScore}/100{selectedCarrier.lastVettingGrade ? `, Grade ${selectedCarrier.lastVettingGrade}` : ""}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-gray-100 rounded-lg p-4 text-center">
                        <p className="text-xs text-slate-500">No Compass reports on file.</p>
                      </div>
                    )}

                    <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Status Changes</h3>
                    <div className="bg-gray-100 rounded-lg p-4 space-y-2">
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

                    <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Tender History</h3>
                    <div className="bg-gray-100 rounded-lg p-4">
                      {selectedCarrier.tendersTotal > 0 ? (
                        <p className="text-xs text-gray-600">{selectedCarrier.tendersTotal} total tenders | {selectedCarrier.tendersAccepted} accepted | {selectedCarrier.tendersDeclined} declined</p>
                      ) : (
                        <p className="text-xs text-slate-500 text-center">No tender history.</p>
                      )}
                    </div>
                  </div>
                )}

                {/* ===== DOCUMENTS TAB ===== */}
                {panelTab === "documents" && selectedCarrier && (() => {
                  const carrierDocs = docsData?.documents || [];
                  const grouped = DOC_CATEGORIES.map(cat => ({
                    ...cat,
                    docs: carrierDocs.filter(d => d.docType === cat.key),
                  })).filter(g => g.docs.length > 0);

                  // Upload view
                  if (docView === "upload") return (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-gray-900">Upload Document</h3>
                        <button onClick={() => setDocView("list")} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Category</label>
                        <select value={uploadDocType} onChange={e => setUploadDocType(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm">
                          {DOC_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">File</label>
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                          onChange={e => setUploadFile(e.target.files?.[0] || null)}
                          className="w-full text-xs text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-[#C5A572]/10 file:text-[#C5A572] hover:file:bg-[#C5A572]/20" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Notes (optional)</label>
                        <textarea value={uploadNotes} onChange={e => setUploadNotes(e.target.value)} rows={2}
                          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs resize-none" placeholder="e.g. Received via email from carrier" />
                      </div>
                      <button disabled={!uploadFile || uploadDocMutation.isPending}
                        onClick={() => {
                          if (!uploadFile) return;
                          const fd = new FormData();
                          fd.append("file", uploadFile);
                          fd.append("docType", uploadDocType);
                          if (uploadNotes) fd.append("notes", uploadNotes);
                          uploadDocMutation.mutate({ carrierId: selectedCarrier.id, formData: fd });
                        }}
                        className="w-full px-4 py-2 bg-[#C5A572] text-[#0A2540] rounded-lg text-sm font-semibold hover:bg-[#d4b65c] transition disabled:opacity-50">
                        {uploadDocMutation.isPending ? "Uploading..." : "Upload Document"}
                      </button>
                    </div>
                  );

                  // Preview view
                  if (docView === "preview" && previewDoc) return (
                    <div className="space-y-4">
                      <button onClick={() => { setDocView("list"); setPreviewDoc(null); }}
                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
                        <ArrowLeft className="w-3.5 h-3.5" /> Back to list
                      </button>
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-gray-900 break-all">{previewDoc.fileName}</h3>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {DOC_CATEGORIES.find(c => c.key === previewDoc.docType)?.label || previewDoc.docType} &middot; {new Date(previewDoc.createdAt).toLocaleDateString()} &middot; {(previewDoc.fileSize / 1024).toFixed(0)} KB
                          </p>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${DOC_STATUS_COLORS[previewDoc.status] || ""}`}>{previewDoc.status}</span>
                      </div>
                      {previewDoc.notes && <p className="text-xs text-gray-500 italic">{previewDoc.notes}</p>}
                      <div className="bg-gray-100 rounded-lg overflow-hidden border border-gray-200" style={{ minHeight: 300 }}>
                        {previewDoc.fileType.startsWith("image/") ? (
                          <img src={previewDoc.fileUrl} alt={previewDoc.fileName} className="w-full object-contain max-h-[500px]" />
                        ) : previewDoc.fileType === "application/pdf" ? (
                          <iframe src={previewDoc.fileUrl} className="w-full" style={{ height: 500 }} title={previewDoc.fileName} />
                        ) : (
                          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                            <FileText className="w-10 h-10 mb-2" />
                            <p className="text-xs">Preview not available</p>
                            <a href={previewDoc.fileUrl} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-[#C5A572] hover:underline mt-1">Download file</a>
                          </div>
                        )}
                      </div>
                      {isAdmin && (
                        <div className="flex gap-2">
                          <button onClick={() => { updateDocStatus.mutate({ carrierId: selectedCarrier.id, docId: previewDoc.id, status: "VERIFIED" }); setPreviewDoc({ ...previewDoc, status: "VERIFIED" }); }}
                            className="flex-1 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-medium hover:bg-green-200 transition">
                            <CheckCircle2 className="w-3 h-3 inline mr-1" />Verify
                          </button>
                          <button onClick={() => { updateDocStatus.mutate({ carrierId: selectedCarrier.id, docId: previewDoc.id, status: "REJECTED" }); setPreviewDoc({ ...previewDoc, status: "REJECTED" }); }}
                            className="flex-1 px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs font-medium hover:bg-red-200 transition">
                            <X className="w-3 h-3 inline mr-1" />Reject
                          </button>
                        </div>
                      )}
                    </div>
                  );

                  // List view (default)
                  return (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Documents ({carrierDocs.length})</h3>
                        {isAdmin && (
                          <button onClick={() => setDocView("upload")}
                            className="flex items-center gap-1 px-2.5 py-1 bg-[#C5A572]/10 text-[#C5A572] rounded-lg text-xs font-medium hover:bg-[#C5A572]/20 transition">
                            <Upload className="w-3 h-3" /> Upload
                          </button>
                        )}
                      </div>

                      {carrierDocs.length === 0 ? (
                        <div className="bg-gray-100 rounded-lg p-8 text-center">
                          <FolderOpen className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                          <p className="text-xs text-gray-400">No documents on file.</p>
                          {isAdmin && <button onClick={() => setDocView("upload")} className="text-xs text-[#C5A572] hover:underline mt-1">Upload the first document</button>}
                        </div>
                      ) : (
                        grouped.map(group => (
                          <div key={group.key}>
                            <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">{group.label}</h4>
                            <div className="space-y-1.5">
                              {group.docs.map(doc => (
                                <div key={doc.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100 hover:border-gray-200 transition group">
                                  <div className="w-7 h-7 rounded bg-gray-200/80 flex items-center justify-center shrink-0">
                                    <FileText className="w-3.5 h-3.5 text-gray-500" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <button onClick={() => { setPreviewDoc(doc); setDocView("preview"); }}
                                      className="text-xs font-medium text-gray-800 hover:text-[#C5A572] truncate block text-left w-full">
                                      {doc.fileName}
                                    </button>
                                    <p className="text-[10px] text-gray-400">{new Date(doc.createdAt).toLocaleDateString()} &middot; {doc.user.firstName} {doc.user.lastName}</p>
                                  </div>
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium shrink-0 ${DOC_STATUS_COLORS[doc.status] || ""}`}>{doc.status}</span>
                                  <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition">
                                    <button onClick={() => { setPreviewDoc(doc); setDocView("preview"); }} title="Preview"
                                      className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600"><Eye className="w-3 h-3" /></button>
                                    {isAdmin && doc.status !== "VERIFIED" && (
                                      <button onClick={() => updateDocStatus.mutate({ carrierId: selectedCarrier.id, docId: doc.id, status: "VERIFIED" })} title="Verify"
                                        className="p-1 rounded hover:bg-green-100 text-gray-400 hover:text-green-600"><CheckCircle2 className="w-3 h-3" /></button>
                                    )}
                                    {isAdmin && doc.status !== "REJECTED" && (
                                      <button onClick={() => updateDocStatus.mutate({ carrierId: selectedCarrier.id, docId: doc.id, status: "REJECTED" })} title="Reject"
                                        className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600"><X className="w-3 h-3" /></button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  );
                })()}

              </div>
            </div>
            </div>
          </div>
        )}
      </div>


      {/* Confirm Approve/Reject Modal */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-white mb-2">
              {confirmAction.status === "APPROVED" ? "Approve Carrier" : "Reject Carrier"}
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              Are you sure you want to <strong className={confirmAction.status === "APPROVED" ? "text-green-600" : "text-red-600"}>
                {confirmAction.status === "APPROVED" ? "approve" : "reject"}
              </strong> <strong className="text-white">{confirmAction.company}</strong>?
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
