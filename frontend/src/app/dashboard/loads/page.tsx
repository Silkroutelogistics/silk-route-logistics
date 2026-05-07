"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/hooks/useAuthStore";
import { isCarrier } from "@/lib/roles";
import {
  Search, MapPin, Truck, Calendar, DollarSign, Download, Package,
  Thermometer, Shield, Phone, FileText, X, Users, Send, ChevronRight,
  ClipboardCheck, Globe, Info, Clock, AlertTriangle, Trash2,
} from "lucide-react";

import { RateConfirmationModal } from "@/components/loads/RateConfirmationModal";
import { CreateLoadModal } from "@/components/loads/CreateLoadModal";
import { SlideDrawer } from "@/components/ui/SlideDrawer";
import { downloadCSV } from "@/lib/csvExport";
import { NEXT_STATUS, STATUS_ACTIONS } from "@/lib/loadStatusActions";

import type { Load as BaseLoad, LoadTender } from "@/types/entities";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Load extends BaseLoad {
  freightClass?: string;
  hazmat?: boolean;
  tempMin?: number;
  tempMax?: number;
  customsRequired?: boolean;
  bondType?: string;
  accessorials?: string[];
  contactName?: string;
  contactPhone?: string;
  tenders?: (LoadTender & {
    carrier: { user: { company: string | null; firstName: string; lastName: string } };
  })[];
  documents?: { id: string; fileName: string; fileUrl: string }[];
  datPostId?: string;
  datPostedAt?: string;
  datPostedFields?: any;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-slate-500/20 text-gray-600", POSTED: "bg-blue-500/20 text-blue-400",
  TENDERED: "bg-indigo-500/20 text-indigo-400", CONFIRMED: "bg-purple-500/20 text-purple-400",
  BOOKED: "bg-violet-500/20 text-violet-400", DISPATCHED: "bg-orange-500/20 text-orange-400",
  AT_PICKUP: "bg-amber-500/20 text-amber-400", LOADED: "bg-yellow-500/20 text-yellow-400",
  PICKED_UP: "bg-yellow-500/20 text-yellow-400", IN_TRANSIT: "bg-cyan-500/20 text-cyan-400",
  AT_DELIVERY: "bg-teal-500/20 text-teal-400", DELIVERED: "bg-green-500/20 text-green-400",
  POD_RECEIVED: "bg-emerald-500/20 text-emerald-400", INVOICED: "bg-lime-500/20 text-lime-400",
  COMPLETED: "bg-emerald-500/20 text-emerald-400",
  TONU: "bg-red-500/20 text-red-400", CANCELLED: "bg-red-500/20 text-red-400",
};

const TENDER_COLORS: Record<string, string> = {
  OFFERED: "bg-blue-500/20 text-blue-400", ACCEPTED: "bg-green-500/20 text-green-400",
  COUNTERED: "bg-yellow-500/20 text-yellow-400", DECLINED: "bg-red-500/20 text-red-400",
  EXPIRED: "bg-slate-500/20 text-gray-600",
};

const MARGIN_ROLES = ["ADMIN", "CEO", "BROKER", "ACCOUNTING"];

type StatusTab = "attention" | "DRAFT" | "POSTED" | "TENDERED" | "BOOKED" | "all";
type PanelTab = "details" | "tracking" | "invoice" | "documents" | "history" | "carrier" | "exceptions";

const PANEL_TABS: { key: PanelTab; icon: typeof Info; label: string }[] = [
  { key: "details", icon: Info, label: "Details" },
  { key: "tracking", icon: MapPin, label: "Tracking" },
  { key: "invoice", icon: DollarSign, label: "Invoice" },
  { key: "documents", icon: FileText, label: "Documents" },
  { key: "history", icon: Clock, label: "History" },
  { key: "carrier", icon: Truck, label: "Carrier" },
  { key: "exceptions", icon: AlertTriangle, label: "Exceptions" },
];

const STATUS_PIPELINE = [
  "POSTED", "TENDERED", "CONFIRMED", "BOOKED", "DISPATCHED",
  "AT_PICKUP", "LOADED", "IN_TRANSIT", "AT_DELIVERY", "DELIVERED",
  "POD_RECEIVED", "INVOICED", "COMPLETED",
];

// v3.8.e — NEXT_STATUS + STATUS_ACTIONS moved to lib/loadStatusActions.ts
// so the Track & Trace LoadDetailDrawer can reuse the same maps without
// copy-paste drift. Imported above.

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function needsAttention(l: Load): boolean {
  const now = Date.now();
  const pickup = new Date(l.pickupDate).getTime();
  const h48 = 48 * 60 * 60 * 1000;
  if (l.status === "POSTED" && pickup - now < h48 && !l.carrier) return true;
  if (l.status === "BOOKED" && pickup < now) return true;
  return false;
}

function matchesTab(l: Load, tab: StatusTab): boolean {
  if (tab === "all") return true;
  if (tab === "attention") return needsAttention(l);
  if (tab === "TENDERED") return ["TENDERED", "CONFIRMED"].includes(l.status);
  return l.status === tab;
}

/* ================================================================== */
/*  Main Page                                                          */
/* ================================================================== */

export default function LoadsPage() {
  const { user } = useAuthStore();
  const canCreate = !isCarrier(user?.role);
  const canSeeMargin = MARGIN_ROLES.includes(user?.role || "");
  const queryClient = useQueryClient();

  /* ---- UI state ---- */
  const [selectedLoadId, setSelectedLoadId] = useState<string | null>(null);
  const [filters, setFilters] = useState({ originState: "", destState: "", equipmentType: "", status: "", search: "" });
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<StatusTab>("all");
  const [laneFilter, setLaneFilter] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<PanelTab>("details");

  /* ---- Clone / Create state ---- */
  const [showCreate, setShowCreate] = useState(false);
  const [cloneData, setCloneData] = useState<Record<string, unknown> | null>(null);

  /* ---- Tender / Compliance state ---- */
  const [showTender, setShowTender] = useState(false);
  const [showRateConf, setShowRateConf] = useState(false);
  const [tenderCarrierId, setTenderCarrierId] = useState("");
  const [tenderRate, setTenderRate] = useState("");
  const [complianceResult, setComplianceResult] = useState<{
    allowed: boolean; blocked_reasons: string[]; warnings: string[];
  } | null>(null);
  const [checkingCompliance, setCheckingCompliance] = useState(false);
  const [invoiceToast, setInvoiceToast] = useState<string | null>(null);

  /* ---- DAT state ---- */
  const [showDatAdvanced, setShowDatAdvanced] = useState(false);
  const [datAdvForm, setDatAdvForm] = useState({
    originCity: "", originState: "", destCity: "", destState: "",
    equipmentType: "", weight: "", rate: "", pickupDate: "",
    deliveryDate: "", loadType: "FULL", comments: "",
  });

  /* ---- Queries ---- */
  const query = new URLSearchParams();
  if (filters.status) query.set("status", filters.status);
  else query.set("activeOnly", "true");
  if (filters.originState) query.set("originState", filters.originState);
  if (filters.destState) query.set("destState", filters.destState);
  if (filters.equipmentType) query.set("equipmentType", filters.equipmentType);
  if (filters.search) query.set("search", filters.search);
  query.set("page", String(page));

  const { data } = useQuery({
    queryKey: ["loads", filters, page],
    queryFn: () =>
      api.get<{ loads: Load[]; total: number; totalPages: number }>(`/loads?${query.toString()}`).then((r) => r.data),
    // v3.8.aao — Sprint 36 Item 50 (A0.3-G1). Auto-refresh on 30s
    // interval so AE Console reflects carrier-side tender accept
    // without manual refresh. Backend SSE infrastructure exists at
    // /api/track-trace/stream but has zero frontend consumers — wiring
    // is post-BKN architectural priority. 30s polling is the
    // pre-BKN-volume acceptable trade-off.
    refetchInterval: 30_000,
  });

  const { data: loadDetail } = useQuery({
    queryKey: ["load", selectedLoadId],
    queryFn: () => api.get<Load>(`/loads/${selectedLoadId}`).then((r) => r.data),
    enabled: !!selectedLoadId,
    refetchInterval: 30_000, // v3.8.aao — Sprint 36 Item 50 (A0.3-G1)
  });

  // v3.4.u — legacy /carrier-match/:loadId retired. Consolidated into
  // waterfallScoringService via /waterfalls/load/:loadId/carrier-matches.
  // The new endpoint returns the 100pt 30/25/20/15/10 scoring and a
  // leaner payload (carrierId, companyName, tier, matchScore, breakdown).
  const { data: suggestedCarriers } = useQuery({
    queryKey: ["carrier-match", selectedLoadId],
    queryFn: () =>
      api
        .get<{
          carriers: Array<{
            carrierId: string;
            userId: string;
            companyName: string | null;
            tier: string;
            matchScore: number;
            equipmentMatch: "exact" | "compatible" | "none";
            breakdown: {
              laneRunCount: number;
              onTimePct: number;
              estimatedRate: number | null;
            };
          }>;
        }>(`/waterfalls/load/${selectedLoadId}/carrier-matches`)
        .then((r) => ({
          carriers: r.data.carriers.map((c) => ({
            carrierId: c.carrierId,
            company: c.companyName ?? "—",
            tier: c.tier,
            equipmentTypes: [] as string[],
            safetyScore: null as number | null,
            complianceStatus: "green",
            matchScore: c.matchScore,
          })),
          total: r.data.carriers.length,
        })),
    enabled: !!selectedLoadId && !!loadDetail && loadDetail.status === "POSTED" && canCreate,
  });

  const { data: datResponses } = useQuery({
    queryKey: ["dat-responses", selectedLoadId],
    queryFn: () =>
      api
        .get<{
          responses: {
            id: string; carrierName: string; mcNumber: string; dotNumber: string;
            equipment: string; offeredRate: number; phone: string; email: string;
            driverAvailable: boolean; truckCount: number;
          }[];
          mock?: boolean;
        }>(`/dat/responses/${selectedLoadId}`)
        .then((r) => r.data),
    enabled: !!selectedLoadId && !!(loadDetail?.datPostId || loadDetail?.status === "POSTED"),
  });

  /* ---- Mutations ---- */
  const invalidateLoadQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["load", selectedLoadId] });
    queryClient.invalidateQueries({ queryKey: ["loads"] });
  };

  const updateStatus = useMutation({
    mutationFn: ({ loadId, status }: { loadId: string; status: string }) =>
      api.patch(`/loads/${loadId}/status`, { status }),
    onSuccess: invalidateLoadQueries,
  });

  const carrierUpdateStatus = useMutation({
    mutationFn: ({ loadId, status }: { loadId: string; status: string }) =>
      api.patch(`/loads/${loadId}/carrier-status`, { status }),
    onSuccess: invalidateLoadQueries,
  });

  const createTender = useMutation({
    mutationFn: ({ loadId, carrierId, offeredRate }: { loadId: string; carrierId: string; offeredRate: number }) =>
      api.post(`/loads/${loadId}/tenders`, { carrierId, offeredRate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["load", selectedLoadId] });
      setShowTender(false);
      setTenderCarrierId("");
      setTenderRate("");
    },
  });

  const generateInvoice = useMutation({
    mutationFn: (loadId: string) => api.post(`/invoices/generate/${loadId}`).then((r) => r.data),
    onSuccess: (invoiceData) => {
      invalidateLoadQueries();
      const invoiceNum = invoiceData?.invoiceNumber || invoiceData?.referenceNumber || "Invoice";
      setInvoiceToast(`Invoice ${invoiceNum} generated successfully`);
      setTimeout(() => setInvoiceToast(null), 4000);
    },
  });

  const datPostMutation = useMutation({
    mutationFn: (loadId: string) => api.post("/dat/post-load", { loadId }),
    onSuccess: invalidateLoadQueries,
  });

  const datPostAdvancedMutation = useMutation({
    mutationFn: (body: Record<string, any>) => api.post("/dat/post-load-advanced", body),
    onSuccess: () => {
      invalidateLoadQueries();
      setShowDatAdvanced(false);
    },
  });

  const datRemoveMutation = useMutation({
    mutationFn: (datPostId: string) => api.delete(`/dat/remove-post/${datPostId}`),
    onSuccess: invalidateLoadQueries,
  });

  /* ---- PDF helpers ---- */
  const downloadPdf = async (loadId: string, refNum: string) => {
    const res = await api.get(`/pdf/rate-confirmation/${loadId}`, { responseType: "blob" });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement("a");
    a.href = url;
    a.download = `RateConf-${refNum}.pdf`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const downloadBol = async (loadId: string, refNum: string) => {
    const res = await api.get(`/pdf/bol-load/${loadId}`, { responseType: "blob" });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement("a");
    a.href = url;
    a.download = `BOL-${refNum}.pdf`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  /* ---- Derived data ---- */
  const allLoads = data?.loads || [];

  const tabCounts = useMemo(() => {
    const c = { attention: 0, DRAFT: 0, POSTED: 0, TENDERED: 0, BOOKED: 0, all: allLoads.length };
    allLoads.forEach((l) => {
      if (needsAttention(l)) c.attention++;
      if (l.status === "DRAFT") c.DRAFT++;
      if (l.status === "POSTED") c.POSTED++;
      if (["TENDERED", "CONFIRMED"].includes(l.status)) c.TENDERED++;
      if (l.status === "BOOKED") c.BOOKED++;
    });
    return c;
  }, [allLoads]);

  const laneCards = useMemo(() => {
    const map = new Map<string, { count: number; totalRate: number }>();
    allLoads.forEach((l) => {
      const key = `${l.originState} → ${l.destState}`;
      const prev = map.get(key) || { count: 0, totalRate: 0 };
      map.set(key, { count: prev.count + 1, totalRate: prev.totalRate + l.rate });
    });
    return Array.from(map.entries())
      .map(([lane, v]) => ({ lane, count: v.count, avgRate: Math.round(v.totalRate / v.count) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [allLoads]);

  const filteredLoads = useMemo(() => {
    let list = allLoads.filter((l) => matchesTab(l, activeTab));
    if (laneFilter) list = list.filter((l) => `${l.originState} → ${l.destState}` === laneFilter);
    return list;
  }, [allLoads, activeTab, laneFilter]);

  const load = loadDetail;

  /* ---- Tab button helper ---- */
  const tabBtn = (key: StatusTab, label: string, count: number) => (
    <button
      key={key}
      onClick={() => { setActiveTab(key); setPage(1); }}
      className={`relative px-5 py-2.5 text-sm whitespace-nowrap transition-colors ${
        activeTab === key
          ? "text-[#C5A572] font-bold"
          : "text-gray-600 hover:text-slate-200"
      }`}
    >
      {label}
      <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
        activeTab === key ? "bg-[#C5A572]/20 text-[#C5A572]" : "bg-gray-100 text-slate-500"
      }`}>
        {count}
      </span>
      {activeTab === key && (
        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#C5A572] rounded-full" />
      )}
    </button>
  );

  /* ---- Panel content dispatcher ---- */
  const renderPanelContent = () => {
    if (!load) return null;
    switch (panelTab) {
      case "details":
        return <PanelDetails load={load} canSeeMargin={canSeeMargin} />;
      case "tracking":
        return <PanelTracking load={load} />;
      case "invoice":
        return <PanelInvoice load={load} canCreate={canCreate} generateInvoice={generateInvoice} />;
      case "documents":
        return <PanelDocuments load={load} />;
      case "history":
        return <PanelHistory load={load} />;
      case "carrier":
        return (
          <PanelCarrier
            load={load}
            canCreate={canCreate}
            canSeeMargin={canSeeMargin}
            suggestedCarriers={suggestedCarriers}
            tenders={load.tenders}
            datResponses={datResponses}
            datPostMutation={datPostMutation}
            datRemoveMutation={datRemoveMutation}
            onAdvancedDat={() => setShowDatAdvanced(true)}
            onQuickTender={(cId) => {
              setTenderCarrierId(cId);
              setTenderRate(String(load.rate));
              setShowTender(true);
              setComplianceResult(null);
            }}
          />
        );
      case "exceptions":
        return <PanelExceptions load={load} />;
      default:
        return null;
    }
  };

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */

  return (
    <div className="p-6 space-y-4">
      {/* ---- Header ---- */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Load Board</h1>
          <p className="text-slate-400 text-sm mt-1">Build, price & post — {data?.total || 0} loads</p>
        </div>
        {canCreate && (
          <button onClick={() => { setCloneData(null); setShowCreate(true); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-gold text-navy font-semibold rounded-lg text-xs hover:bg-gold/90 transition cursor-pointer">
            + New Load
          </button>
        )}
        {load && canCreate && (
          <button onClick={() => { setCloneData(load as unknown as Record<string, unknown>); setShowCreate(true); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-xs text-gray-700 hover:bg-gray-100 transition cursor-pointer">
            Clone Load
          </button>
        )}
        {filteredLoads.length > 0 && (
          <button onClick={() => downloadCSV(
            filteredLoads.map((l) => ({
              ref: l.referenceNumber, status: l.status,
              origin: `${l.originCity}, ${l.originState}`, dest: `${l.destCity}, ${l.destState}`,
              equipment: l.equipmentType, rate: l.rate, distance: l.distance || "",
              pickup: l.pickupDate?.split("T")[0] || "", delivery: l.deliveryDate?.split("T")[0] || "",
              commodity: l.commodity || "", weight: l.weight || "",
            })),
            [
              { key: "ref", label: "Reference #" }, { key: "status", label: "Status" },
              { key: "origin", label: "Origin" }, { key: "dest", label: "Destination" },
              { key: "equipment", label: "Equipment" }, { key: "rate", label: "Rate ($)" },
              { key: "distance", label: "Miles" }, { key: "pickup", label: "Pickup Date" },
              { key: "delivery", label: "Delivery Date" }, { key: "commodity", label: "Commodity" },
              { key: "weight", label: "Weight (lbs)" },
            ],
            `srl-loads-${activeTab}-${new Date().toISOString().split("T")[0]}.csv`,
          )} className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-xs text-gray-700 hover:bg-gray-100 transition cursor-pointer">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        )}
      </div>

      {/* ---- UPGRADE 1: Status Tabs ---- */}
      <div className="flex flex-wrap gap-0.5 overflow-x-auto border-b border-gray-200 scrollbar-none">
        {tabBtn("attention", "Needs Attention", tabCounts.attention)}
        {tabBtn("DRAFT", "Drafts", tabCounts.DRAFT)}
        {tabBtn("POSTED", "Posted", tabCounts.POSTED)}
        {tabBtn("TENDERED", "Tendered", tabCounts.TENDERED)}
        {tabBtn("BOOKED", "Booked", tabCounts.BOOKED)}
        {tabBtn("all", "All", tabCounts.all)}
      </div>

      {/* ---- UPGRADE 2: Lane Cards ---- */}
      {laneCards.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
          {laneCards.map((lc) => (
            <button
              key={lc.lane}
              onClick={() => setLaneFilter(laneFilter === lc.lane ? null : lc.lane)}
              className={`min-w-[180px] shrink-0 rounded-xl p-3 text-left transition-all ${
                laneFilter === lc.lane
                  ? "bg-gray-100 border-2 border-[#C5A572] shadow-[0_0_12px_rgba(201,168,76,0.15)]"
                  : "bg-gray-100 border border-gray-200 hover:border-white/25"
              }`}
            >
              <p className="text-white font-bold text-base">{lc.lane}</p>
              <div className="flex items-center justify-between mt-1">
                <span className="text-slate-400 text-xs">{lc.count} load{lc.count !== 1 ? "s" : ""}</span>
                <span className="text-[#C5A572] text-sm font-semibold">${lc.avgRate.toLocaleString()}</span>
              </div>
            </button>
          ))}
          {laneFilter && (
            <button
              onClick={() => setLaneFilter(null)}
              className="shrink-0 self-center px-3 py-1.5 text-xs text-gray-600 hover:text-white bg-gray-100 rounded-lg border border-gray-200"
            >
              <X className="w-3 h-3 inline mr-1" />Clear Lane
            </button>
          )}
        </div>
      )}

      {/* ---- Filters ---- */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            placeholder="Search loads..."
            value={filters.search}
            onChange={(e) => { setFilters((f) => ({ ...f, search: e.target.value })); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-[#C5A572]/20"
          />
        </div>
        <select
          value={filters.equipmentType}
          onChange={(e) => { setFilters((f) => ({ ...f, equipmentType: e.target.value })); setPage(1); }}
          className="px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-sm text-white"
        >
          <option value="" className="bg-[#0F1117] text-white">All Equipment</option>
          {["Dry Van", "Reefer", "Flatbed", "Step Deck", "Car Hauler"].map((t) => (
            <option key={t} value={t} className="bg-[#0F1117] text-white">{t}</option>
          ))}
        </select>
      </div>

      {/* ---- Main: Load list + Detail Panel ---- */}
      <div className="flex gap-0">
        {/* Load list */}
        <div className={`space-y-3 transition-all duration-300 ${selectedLoadId ? "w-full lg:w-[45%] lg:shrink-0" : "w-full"}`}>
          {filteredLoads.map((ld) => (
            <button
              key={ld.id}
              onClick={() => { setSelectedLoadId(ld.id); setPanelTab("details"); }}
              className={`block w-full text-left rounded-xl border p-4 hover:border-[#C5A572]/30 transition ${
                selectedLoadId === ld.id
                  ? "bg-white/10 border-[#C5A572]/40"
                  : "bg-gray-100 border-gray-200"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm text-slate-400 truncate">{ld.referenceNumber}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${STATUS_COLORS[ld.status] || "bg-white/10 text-white"}`}>
                      {ld.status.replace(/_/g, " ")}
                    </span>
                    {needsAttention(ld) && (
                      <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 animate-pulse" title="Needs attention" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-white text-sm">
                    <MapPin className="w-3.5 h-3.5 text-[#C5A572] shrink-0" />
                    <span className="truncate">
                      {ld.originCity}, {ld.originState} &rarr; {ld.destCity}, {ld.destState}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3 mt-1 text-xs text-slate-400">
                    <span className="flex items-center gap-1"><Truck className="w-3 h-3" /> {ld.equipmentType}</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> {new Date(ld.pickupDate).toLocaleDateString()}
                    </span>
                    {ld.distance && <span>{ld.distance} mi</span>}
                  </div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <div className="flex items-center gap-1 text-[#C5A572]">
                    <DollarSign className="w-4 h-4" />
                    <span className="text-lg font-bold">{ld.rate.toLocaleString()}</span>
                  </div>
                  {ld.distance && (
                    <p className="text-xs text-slate-500">${(ld.rate / ld.distance).toFixed(2)}/mi</p>
                  )}
                </div>
              </div>
            </button>
          ))}

          {filteredLoads.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Package className="w-12 h-12 text-slate-400 mb-4" />
              <h3 className="text-lg font-semibold text-white mb-1">No loads match your filters</h3>
              <p className="text-sm text-slate-400 mb-4 max-w-sm">
                Adjust your filters or create a new load to get started.
              </p>
            </div>
          )}

          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm bg-gray-100 rounded-lg text-gray-600 disabled:opacity-30"
              >
                Prev
              </button>
              <span className="text-sm text-slate-400">Page {page} of {data.totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={page === data.totalPages}
                className="px-3 py-1.5 text-sm bg-gray-100 rounded-lg text-gray-600 disabled:opacity-30"
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* ---- UPGRADE 3: Slide-out Detail Panel ---- */}
        {selectedLoadId && load && (
          <div className="w-full lg:w-[55%] shrink-0 lg:ml-4 fixed inset-0 z-40 lg:relative lg:inset-auto lg:z-auto bg-[#161921] border border-gray-200 rounded-xl flex flex-col overflow-hidden lg:sticky lg:top-0 h-full lg:h-[calc(100vh-4rem)]">
            {/* Mobile close bar */}
            <button onClick={() => setSelectedLoadId(null)} className="lg:hidden flex items-center gap-2 px-4 py-2 border-b border-gray-200 text-slate-400 hover:text-white shrink-0">
              <X className="w-4 h-4" /> <span className="text-sm">Close</span>
            </button>
            <div className="flex flex-1 min-h-0">
            {/* Vertical icon strip */}
            <div className="w-12 shrink-0 bg-[#161921] border-r border-[#2A2F42] flex flex-col items-center py-2 gap-1">
              {PANEL_TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setPanelTab(t.key)}
                  title={t.label}
                  className={`w-9 h-9 flex items-center justify-center rounded-lg transition ${
                    panelTab === t.key
                      ? "bg-[#C5A572] text-[#0F1117]"
                      : "text-gray-600 hover:text-white hover:bg-gray-100"
                  }`}
                >
                  <t.icon className="w-4 h-4" />
                </button>
              ))}
            </div>

            {/* Panel content */}
            <div className="flex-1 overflow-y-auto">
              {/* Panel header */}
              <div className="sticky top-0 bg-[#0F1117]/95 backdrop-blur border-b border-gray-200 p-4 z-10">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="text-lg font-bold text-white truncate">{load.referenceNumber}</h2>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${STATUS_COLORS[load.status] || ""}`}>
                        {load.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p className="text-sm text-slate-400">
                      {load.originCity}, {load.originState} &rarr; {load.destCity}, {load.destState}
                    </p>
                    <p className="text-xs text-slate-500">{new Date(load.pickupDate).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                    {/* Tender button */}
                    {canCreate && load.status === "POSTED" && (
                      <button
                        onClick={() => setShowTender(true)}
                        className="px-3 py-1.5 bg-gold text-navy font-medium rounded-lg text-xs hover:bg-gold/90"
                      >
                        <Send className="w-3 h-3 inline mr-1" />Tender
                      </button>
                    )}
                    {/* Status advance.
                        v3.8.j Layer 3 — Suppressed for POSTED loads.
                        Pre-v3.8.j the button was labeled "Tender" on POSTED
                        loads, which AE users mistook for the real
                        carrier-tender action. Clicking it just flipped the
                        status flag with no carrier involved, walking the
                        load through TENDERED → CONFIRMED → BOOKED purely as
                        status changes (the L6894191249 bug, 2026-04-30).
                        Real tendering goes through the Tender modal
                        (setShowTender(true) below) which creates a
                        LoadTender record + carrier assignment, after which
                        the load reaches BOOKED via tenderController.
                        acceptTender automatically. The status-advance
                        button reappears at BOOKED ("Dispatch") and onward
                        for the rest of the chain. */}
                    {canCreate && NEXT_STATUS[load.status] && load.status !== "POSTED" && (
                      <button
                        onClick={() => updateStatus.mutate({ loadId: load.id, status: NEXT_STATUS[load.status] })}
                        disabled={updateStatus.isPending}
                        className="px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg text-xs hover:bg-blue-500/30 disabled:opacity-50"
                      >
                        <ChevronRight className="w-3 h-3 inline mr-1" />{STATUS_ACTIONS[load.status]}
                      </button>
                    )}
                    {/* BOL download */}
                    <button
                      onClick={() => downloadBol(load.id, load.referenceNumber)}
                      className="px-3 py-1.5 bg-[#C5A572]/20 text-[#C5A572] rounded-lg text-xs hover:bg-[#C5A572]/30"
                      title="Download BOL"
                    >
                      <Download className="w-3 h-3 inline mr-1" />BOL
                    </button>
                    {/* Rate Conf */}
                    {canCreate && !["DRAFT", "CANCELLED", "TONU"].includes(load.status) && (
                      <button
                        onClick={() => setShowRateConf(true)}
                        className="px-3 py-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg text-xs hover:bg-indigo-500/30"
                        title="Rate Confirmation"
                      >
                        <ClipboardCheck className="w-3 h-3 inline mr-1" />Rate Conf
                      </button>
                    )}
                    {/* Rate Conf PDF */}
                    {canCreate && !["DRAFT", "POSTED", "CANCELLED", "TONU"].includes(load.status) && (
                      <button
                        onClick={() => downloadPdf(load.id, load.referenceNumber)}
                        className="px-3 py-1.5 bg-purple-500/20 text-purple-400 rounded-lg text-xs hover:bg-purple-500/30"
                        title="Download Rate Confirmation PDF"
                      >
                        <FileText className="w-3 h-3 inline mr-1" />PDF
                      </button>
                    )}
                    {/* DAT post */}
                    {canCreate && load.status === "POSTED" && !load.datPostId && (
                      <button
                        onClick={() => datPostMutation.mutate(load.id)}
                        disabled={datPostMutation.isPending}
                        className="px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg text-xs hover:bg-green-500/30 disabled:opacity-50"
                        title="Post to DAT"
                      >
                        <Globe className="w-3 h-3 inline mr-1" />{datPostMutation.isPending ? "Posting..." : "DAT"}
                      </button>
                    )}
                    {/* DAT remove */}
                    {canCreate && load.datPostId && (
                      <button
                        onClick={() => datRemoveMutation.mutate(load.datPostId!)}
                        disabled={datRemoveMutation.isPending}
                        className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-xs hover:bg-red-500/30 disabled:opacity-50"
                        title="Remove DAT Post"
                      >
                        <X className="w-3 h-3 inline mr-1" />DAT
                      </button>
                    )}
                    {/* Cancel Load */}
                    {canCreate && ["POSTED", "BOOKED", "DISPATCHED"].includes(load.status) && (
                      <button onClick={() => {
                        if (confirm("Cancel this load? This will notify the carrier and reverse any credit holds.")) {
                          updateStatus.mutate({ loadId: load.id, status: "CANCELLED" });
                        }
                      }} className="flex items-center gap-1 px-2.5 py-1.5 bg-red-500/10 text-red-400 rounded text-xs hover:bg-red-500/20">
                        <X className="w-3 h-3" /> Cancel
                      </button>
                    )}
                    {/* TONU */}
                    {canCreate && ["BOOKED", "DISPATCHED"].includes(load.status) && (
                      <button onClick={() => {
                        if (confirm("Mark as TONU (Truck Ordered Not Used)?")) {
                          updateStatus.mutate({ loadId: load.id, status: "TONU" });
                        }
                      }} className="flex items-center gap-1 px-2.5 py-1.5 bg-orange-500/10 text-orange-400 rounded text-xs hover:bg-orange-500/20">
                        <AlertTriangle className="w-3 h-3" /> TONU
                      </button>
                    )}
                    {/* Delete */}
                    {["DRAFT", "CANCELLED", "TONU"].includes(load.status) && canCreate && (
                      <button onClick={async () => {
                        if (confirm("Permanently delete this load?")) {
                          await api.delete(`/loads/${load.id}`);
                          queryClient.invalidateQueries({ queryKey: ["loads"] });
                          setSelectedLoadId(null);
                        }
                      }} className="flex items-center gap-1 px-2.5 py-1.5 bg-red-500/20 text-red-400 rounded text-xs hover:bg-red-500/30">
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                    )}
                    {/* Carrier actions */}
                    {isCarrier(user?.role) && load.carrier?.firstName === user?.firstName && (
                      <CarrierActions load={load} carrierUpdateStatus={carrierUpdateStatus} />
                    )}
                    {/* Close */}
                    <button
                      onClick={() => setSelectedLoadId(null)}
                      className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-gray-100"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Active panel tab content */}
              <div className="p-4">{renderPanelContent()}</div>
            </div>
            </div>{/* end inner flex wrapper */}
          </div>
        )}
      </div>

      {/* ---- Modals / Drawers ---- */}
      {load && (
        <>
          {/* Tender drawer */}
          <SlideDrawer
            open={showTender}
            onClose={() => { setShowTender(false); setComplianceResult(null); }}
            title="Tender Load to Carrier"
            width="max-w-md"
          >
            <TenderForm
              load={load}
              canSeeMargin={canSeeMargin}
              suggestedCarriers={suggestedCarriers}
              tenderCarrierId={tenderCarrierId}
              setTenderCarrierId={(v) => { setTenderCarrierId(v); setComplianceResult(null); }}
              tenderRate={tenderRate}
              setTenderRate={setTenderRate}
              complianceResult={complianceResult}
              checkingCompliance={checkingCompliance}
              onSubmit={async () => {
                if (!tenderCarrierId || !tenderRate) return;
                if (!complianceResult) {
                  setCheckingCompliance(true);
                  try {
                    const res = await api.post(`/compliance/carrier/${tenderCarrierId}/check`);
                    const result = res.data as { allowed: boolean; blocked_reasons: string[]; warnings: string[] };
                    setComplianceResult(result);
                    if (result.allowed && result.warnings.length === 0) {
                      createTender.mutate({
                        loadId: load.id,
                        carrierId: tenderCarrierId,
                        offeredRate: parseFloat(tenderRate),
                      });
                    }
                  } catch {
                    createTender.mutate({
                      loadId: load.id,
                      carrierId: tenderCarrierId,
                      offeredRate: parseFloat(tenderRate),
                    });
                  } finally {
                    setCheckingCompliance(false);
                  }
                  return;
                }
                if (complianceResult.allowed) {
                  createTender.mutate({
                    loadId: load.id,
                    carrierId: tenderCarrierId,
                    offeredRate: parseFloat(tenderRate),
                  });
                }
              }}
              isPending={createTender.isPending}
            />
          </SlideDrawer>

          {/* DAT Advanced drawer */}
          <SlideDrawer open={showDatAdvanced} onClose={() => setShowDatAdvanced(false)} title="Advanced DAT Post">
            <DatAdvancedForm
              form={datAdvForm}
              setForm={setDatAdvForm}
              loadId={load.id}
              mutate={datPostAdvancedMutation.mutate}
              isPending={datPostAdvancedMutation.isPending}
              isError={datPostAdvancedMutation.isError}
            />
          </SlideDrawer>

          {/* Rate confirmation modal */}
          <RateConfirmationModal open={showRateConf} onClose={() => setShowRateConf(false)} load={showRateConf ? load : null} />
        </>
      )}

      {/* CreateLoadModal rendered outside the {load && ...} block so it can
          open for "new load" flows when no load is selected. Modal handles
          its own open/closed state via props. */}
      <CreateLoadModal open={showCreate} onClose={() => { setShowCreate(false); setCloneData(null); }} cloneFrom={cloneData} />

      {/* Invoice toast */}
      {invoiceToast && (
        <div className="fixed bottom-6 right-6 z-50 px-5 py-3 bg-green-600 text-white rounded-xl shadow-xl text-sm font-medium flex items-center gap-2 animate-in slide-in-from-bottom">
          <FileText className="w-4 h-4" /> {invoiceToast}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Sub-components: Panel tabs                                         */
/* ================================================================== */

function LaneRateWidget({ originState, destState, equipment, currentRate }: {
  originState: string; destState: string; equipment: string; currentRate: number;
}) {
  const { data } = useQuery({
    queryKey: ["lane-rate", originState, destState, equipment],
    queryFn: () => api.get(`/analytics/lane-rate/${originState}/${destState}?equipment=${encodeURIComponent(equipment)}`).then((r) => r.data),
    enabled: !!originState && !!destState,
    staleTime: 5 * 60 * 1000,
  });
  if (!data || data.sampleSize === 0) return null;
  const diff = currentRate - data.avgRate;
  const diffPct = ((diff / data.avgRate) * 100).toFixed(1);
  const trendColor = data.trend === "RISING" ? "text-red-400" : data.trend === "FALLING" ? "text-green-400" : "text-gray-600";
  return (
    <section>
      <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Lane Rate Intelligence</h3>
      <div className="p-3 bg-gray-100 rounded-lg border border-gray-200 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-600">{originState} → {destState} ({data.equipmentType || equipment})</span>
          <span className="text-slate-500">{data.sampleSize} loads</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-[10px] text-slate-500">Low</p>
            <p className="text-sm text-[#0A2540] font-medium">${data.minRate?.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500">Avg</p>
            <p className="text-sm text-[#BA7517] font-bold">${data.avgRate?.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500">High</p>
            <p className="text-sm text-[#0A2540] font-medium">${data.maxRate?.toLocaleString()}</p>
          </div>
        </div>
        <div className="flex items-center justify-between text-xs pt-1 border-t border-white/5">
          <span className="text-gray-600">
            Your rate: <span className={diff > 0 ? "text-green-400" : diff < 0 ? "text-red-400" : "text-gray-700"}>
              {diff > 0 ? "+" : ""}{diffPct}% vs avg
            </span>
          </span>
          {data.trend && data.trend !== "UNKNOWN" && (
            <span className={`${trendColor}`}>
              {data.trend === "RISING" ? "↑" : data.trend === "FALLING" ? "↓" : "→"} {data.trend.toLowerCase()}
              {data.trendPct ? ` ${data.trendPct > 0 ? "+" : ""}${data.trendPct.toFixed(1)}%` : ""}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

function Detail({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-xs text-slate-400 mb-0.5">{icon}{label}</div>
      <p className="text-sm text-white">{value}</p>
    </div>
  );
}

/* ---- Details Tab ---- */
function PanelDetails({ load, canSeeMargin }: { load: Load; canSeeMargin: boolean }) {
  return (
    <div className="space-y-5">
      {/* Reference chips */}
      <div className="flex flex-wrap gap-2">
        <span className="px-2.5 py-1 bg-gray-100 rounded-lg text-xs text-gray-700 border border-gray-200">
          Ref: {load.referenceNumber}
        </span>
        {load.freightClass && (
          <span className="px-2.5 py-1 bg-gray-100 rounded-lg text-xs text-gray-700 border border-gray-200">
            Class: {load.freightClass}
          </span>
        )}
        {load.customsRequired && (
          <span className="px-2.5 py-1 bg-amber-500/10 rounded-lg text-xs text-amber-400 border border-amber-500/20">
            Customs Required
          </span>
        )}
        {load.bondType && (
          <span className="px-2.5 py-1 bg-gray-100 rounded-lg text-xs text-gray-700 border border-gray-200">
            Bond: {load.bondType}
          </span>
        )}
        {load.datPostId && (
          <span className="px-2.5 py-1 bg-green-500/10 rounded-lg text-xs text-green-400 border border-green-500/20">
            <Globe className="w-3 h-3 inline mr-1" />DAT Posted
          </span>
        )}
      </div>

      {/* Pickup / Delivery timeline */}
      <section className="space-y-1">
        <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Pickup &amp; Delivery Timeline</h3>

        {/* Pickup */}
        <div className="flex items-start gap-3">
          <div className="flex flex-col items-center">
            <div className="w-3 h-3 rounded-full bg-[#C5A572] border-2 border-[#C5A572]/40" />
            <div className="w-0.5 h-10 bg-white/10" />
          </div>
          <div className="pb-2">
            <p className="text-xs text-slate-500 uppercase tracking-wider">Pickup</p>
            <p className="text-white font-medium">{load.originCity}, {load.originState} {load.originZip || ""}</p>
            <div className="flex flex-wrap gap-3 mt-1 text-xs text-slate-400">
              <span>Requested: {new Date(load.pickupDate).toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        {/* Delivery */}
        <div className="flex items-start gap-3">
          <div className="flex flex-col items-center">
            <div className="w-3 h-3 rounded-full bg-green-500 border-2 border-green-500/40" />
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider">Delivery</p>
            <p className="text-white font-medium">{load.destCity}, {load.destState} {load.destZip || ""}</p>
            {load.deliveryDate && (
              <div className="flex flex-wrap gap-3 mt-1 text-xs text-slate-400">
                <span>Requested: {new Date(load.deliveryDate).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        </div>

        {load.distance && (
          <p className="text-xs text-slate-400 pl-6 pt-1">Distance: {load.distance} miles</p>
        )}
      </section>

      {/* Freight details */}
      <section>
        <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Freight Details</h3>
        <div className="grid grid-cols-2 gap-3">
          <Detail icon={<Truck className="w-4 h-4" />} label="Equipment" value={load.equipmentType} />
          <Detail icon={<Package className="w-4 h-4" />} label="Commodity" value={load.commodity || "\u2014"} />
          <Detail label="Weight" value={load.weight ? `${load.weight.toLocaleString()} lbs` : "\u2014"} />
          {load.pieces != null && <Detail label="Pieces" value={String(load.pieces)} />}
          {load.hazmat && (
            <Detail icon={<Shield className="w-4 h-4 text-red-400" />} label="Hazmat" value="Yes" />
          )}
          {load.tempMin != null && (
            <Detail
              icon={<Thermometer className="w-4 h-4" />}
              label="Temperature"
              value={`${load.tempMin}\u00B0F - ${load.tempMax}\u00B0F`}
            />
          )}
        </div>
        {load.accessorials && load.accessorials.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {load.accessorials.map((a: any, i: number) => {
              const label =
                typeof a === "string"
                  ? a
                  : a && typeof a === "object" && "type" in a
                  ? `${a.type}${a.amount ? ` ($${a.amount})` : ""}`
                  : "Accessorial";
              return (
                <span key={i} className="px-2 py-0.5 bg-white/10 rounded text-xs text-slate-400">{label}</span>
              );
            })}
          </div>
        )}
        {load.specialInstructions && (
          <div className="mt-3 p-3 bg-gray-100 rounded-lg border border-gray-200">
            <span className="text-xs text-gray-600">Special Instructions</span>
            <p className="text-sm text-[#0A2540] mt-1">{load.specialInstructions}</p>
          </div>
        )}
      </section>

      {/* Rate / Margin */}
      <section>
        <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Rate</h3>
        <div className="flex items-center gap-2 text-[#C5A572]">
          <DollarSign className="w-5 h-5" />
          <span className="text-2xl font-bold">{load.rate.toLocaleString()}</span>
        </div>
        {load.distance && (
          <p className="text-xs text-slate-400 mt-1">${(load.rate / load.distance).toFixed(2)}/mile</p>
        )}
        {canSeeMargin && load.tenders && load.tenders.length > 0 && (
          <div className="mt-2 p-2 bg-gray-100 rounded-lg border border-gray-200">
            {(() => {
              const accepted = load.tenders.find((t) => t.status === "ACCEPTED");
              if (!accepted) return <p className="text-xs text-slate-500">No accepted tender yet</p>;
              const carrierCost = accepted.counterRate || accepted.offeredRate;
              const margin = load.rate - carrierCost;
              const pct = load.rate > 0 ? ((margin / load.rate) * 100).toFixed(1) : "0";
              return (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">Margin</span>
                  <span className={`text-sm font-medium ${margin >= 0 ? "text-green-400" : "text-red-400"}`}>
                    ${margin.toLocaleString()} ({pct}%)
                  </span>
                </div>
              );
            })()}
          </div>
        )}
      </section>

      {/* Lane Rate Intelligence */}
      <LaneRateWidget originState={load.originState} destState={load.destState} equipment={load.equipmentType} currentRate={load.rate} />

      {/* Contact */}
      {(load.contactName || load.poster) && (
        <section>
          <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Contact</h3>
          {load.contactName && (
            <p className="text-sm text-white">
              {load.contactName}{load.contactPhone ? ` \u2014 ${load.contactPhone}` : ""}
            </p>
          )}
          {load.poster && (
            <p className="text-xs text-slate-400 mt-1">
              Posted by {load.poster.company || `${load.poster.firstName} ${load.poster.lastName}`}
              {load.poster.phone ? ` | ${load.poster.phone}` : ""}
            </p>
          )}
        </section>
      )}
    </div>
  );
}

/* ---- Tracking Tab ---- */
function PanelTracking({ load }: { load: Load }) {
  const mapped = load.status === "PICKED_UP" ? "LOADED" : load.status;
  const currentIdx = STATUS_PIPELINE.indexOf(mapped);
  return (
    <div className="space-y-4">
      <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider">Status Pipeline</h3>
      <div className="space-y-0">
        {STATUS_PIPELINE.map((st, i) => {
          const done = i <= currentIdx;
          const active = i === currentIdx;
          return (
            <div key={st} className="flex items-start gap-3 relative">
              {/* Connector line */}
              {i < STATUS_PIPELINE.length - 1 && (
                <div className={`absolute left-[5px] top-3 w-0.5 h-6 ${done ? "bg-green-500/40" : "bg-slate-800"}`} />
              )}
              {/* Dot */}
              <div
                className={`w-3 h-3 rounded-full shrink-0 mt-0.5 z-10 ${
                  done
                    ? active
                      ? "bg-[#C5A572] ring-2 ring-[#C5A572]/30"
                      : "bg-green-500"
                    : "bg-slate-700"
                }`}
              />
              <span
                className={`text-xs pb-3 ${
                  done ? (active ? "text-[#C5A572] font-semibold" : "text-green-400") : "text-slate-600"
                }`}
              >
                {st.replace(/_/g, " ")}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 p-3 bg-gray-100 rounded-lg border border-gray-200">
        <p className="text-xs text-gray-600">
          Check calls and ETA tracking details will appear here once GPS integration is active.
        </p>
      </div>
    </div>
  );
}

/* ---- Invoice Tab ---- */
function PanelInvoice({
  load,
  canCreate,
  generateInvoice,
}: {
  load: Load;
  canCreate: boolean;
  generateInvoice: { mutate: (id: string) => void; isPending: boolean };
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider">Invoice</h3>
      {load.invoiceId ? (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
          <p className="text-sm text-emerald-400 font-medium">Invoice generated</p>
          <a href="/dashboard/invoices" className="text-xs text-emerald-300 hover:underline mt-1 inline-block">
            View in Invoices &rarr;
          </a>
        </div>
      ) : canCreate && ["DELIVERED", "POD_RECEIVED"].includes(load.status) ? (
        <button
          onClick={() => generateInvoice.mutate(load.id)}
          disabled={generateInvoice.isPending}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white font-medium rounded-lg text-sm hover:bg-green-500 disabled:opacity-50"
        >
          <FileText className="w-4 h-4" />
          {generateInvoice.isPending ? "Generating..." : "Generate Invoice"}
        </button>
      ) : (
        <p className="text-sm text-slate-500">No invoice yet. Invoice can be generated once load is delivered.</p>
      )}
    </div>
  );
}

/* ---- Documents Tab ---- */
function PanelDocuments({ load }: { load: Load }) {
  return (
    <div className="space-y-4">
      <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider">Documents</h3>
      {load.documents && load.documents.length > 0 ? (
        <div className="space-y-2">
          {load.documents.map((doc) => (
            <a
              key={doc.id}
              href={doc.fileUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-sm text-gray-700 hover:text-[#C5A572] p-2 bg-gray-100 rounded-lg border border-gray-200 transition"
            >
              <FileText className="w-4 h-4" /> {doc.fileName}
            </a>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">No documents attached to this load.</p>
      )}
    </div>
  );
}

/* ---- History Tab ---- */
function PanelHistory({ load }: { load: Load }) {
  return (
    <div className="space-y-4">
      <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider">Audit Trail</h3>
      <div className="space-y-2">
        <div className="flex items-center gap-3 p-3 bg-gray-100 rounded-lg border border-gray-200">
          <Clock className="w-4 h-4 text-gray-600 shrink-0" />
          <div>
            <p className="text-sm text-[#0A2540]">Load created</p>
            <p className="text-xs text-gray-600">{new Date(load.createdAt).toLocaleString()}</p>
          </div>
        </div>
        {load.datPostedAt && (
          <div className="flex items-center gap-3 p-3 bg-gray-100 rounded-lg border border-gray-200">
            <Globe className="w-4 h-4 text-green-700 shrink-0" />
            <div>
              <p className="text-sm text-[#0A2540]">Posted to DAT</p>
              <p className="text-xs text-gray-600">{new Date(load.datPostedAt).toLocaleString()}</p>
            </div>
          </div>
        )}
        <div className="flex items-center gap-3 p-3 bg-gray-100 rounded-lg border border-gray-200">
          <div className={`w-3 h-3 rounded-full shrink-0 ${
            STATUS_COLORS[load.status]?.includes("green") ? "bg-green-500" : "bg-[#C5A572]"
          }`} />
          <div>
            <p className="text-sm text-[#0A2540]">Current status: {load.status.replace(/_/g, " ")}</p>
          </div>
        </div>
        {load.tenders && load.tenders.length > 0 && (
          <>
            <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider pt-2">Tender Events</h4>
            {load.tenders.map((t) => (
              <div key={t.id} className="flex items-center gap-3 p-3 bg-gray-100 rounded-lg border border-gray-200">
                <Send className="w-4 h-4 text-blue-700 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#0A2540] truncate">
                    Tender to {t.carrier?.user?.company || `${t.carrier?.user?.firstName} ${t.carrier?.user?.lastName}`}
                  </p>
                  <p className="text-xs text-gray-600">{new Date(t.createdAt).toLocaleString()}</p>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${TENDER_COLORS[t.status] || ""}`}>
                  {t.status}
                </span>
              </div>
            ))}
          </>
        )}
      </div>
      <p className="text-xs text-slate-500">Detailed audit trail available in load history API.</p>
    </div>
  );
}

/* ---- Carrier Tab ---- */
function PanelCarrier({
  load,
  canCreate,
  canSeeMargin,
  suggestedCarriers,
  tenders,
  datResponses,
  datPostMutation,
  datRemoveMutation,
  onAdvancedDat,
  onQuickTender,
}: {
  load: Load;
  canCreate: boolean;
  canSeeMargin: boolean;
  suggestedCarriers?: {
    carriers: {
      carrierId: string; company: string; tier: string;
      equipmentTypes: string[]; safetyScore: number | null;
      complianceStatus: string; matchScore: number;
    }[];
    total: number;
  };
  tenders?: Load["tenders"];
  datResponses?: {
    responses: {
      id: string; carrierName: string; mcNumber: string; dotNumber: string;
      equipment: string; offeredRate: number; phone: string; email: string;
      driverAvailable: boolean; truckCount: number;
    }[];
    mock?: boolean;
  };
  datPostMutation: { mutate: (id: string) => void; isPending: boolean };
  datRemoveMutation: { mutate: (id: string) => void; isPending: boolean };
  onAdvancedDat: () => void;
  onQuickTender: (carrierId: string) => void;
}) {
  return (
    <div className="space-y-5">
      {/* Assigned carrier */}
      {load.carrier && (
        <section>
          <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Assigned Carrier</h3>
          <div className="p-3 bg-gray-100 rounded-lg border border-gray-200">
            <p className="text-[#0A2540] font-medium">
              {load.carrier.company || `${load.carrier.firstName} ${load.carrier.lastName}`}
            </p>
            {load.carrier.phone && (
              <p className="text-sm text-gray-600 flex items-center gap-1 mt-1">
                <Phone className="w-3.5 h-3.5" /> {load.carrier.phone}
              </p>
            )}
          </div>
        </section>
      )}

      {/* Suggested carriers (from carrier match) */}
      {load.status === "POSTED" && canCreate && suggestedCarriers && suggestedCarriers.carriers.length > 0 && (
        <section>
          <h3 className="text-xs font-medium text-[#C5A572] uppercase tracking-wider mb-2 flex items-center gap-1">
            <Users className="w-3.5 h-3.5" /> Suggested Carriers
          </h3>
          <p className="text-xs text-slate-500 mb-2">{suggestedCarriers.total} candidates evaluated</p>
          <div className="space-y-2">
            {suggestedCarriers.carriers.slice(0, 5).map((c) => {
              const isRed = c.complianceStatus === "red";
              const isAmber = c.complianceStatus === "amber";
              return (
                <div key={c.carrierId} className="flex items-center justify-between p-2 bg-gray-100 rounded-lg border border-gray-200">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${isRed ? "bg-red-500" : isAmber ? "bg-amber-500" : "bg-green-500"}`} />
                    <div className="min-w-0">
                      <p className="text-sm text-[#0A2540] truncate">{c.company}</p>
                      <p className="text-xs text-slate-500">{c.equipmentTypes.join(", ")}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-600">{c.matchScore}%</span>
                    {isRed ? (
                      <span className="px-2 py-1 bg-red-500/20 text-red-700 rounded text-xs">Non-Compliant</span>
                    ) : (
                      <button
                        onClick={() => onQuickTender(c.carrierId)}
                        className="px-2 py-1 bg-[#C5A572]/20 text-[#C5A572] rounded text-xs hover:bg-[#C5A572]/30"
                      >
                        Quick Tender
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* DAT Responses */}
      {datResponses && datResponses.responses.length > 0 && (
        <section>
          <h3 className="text-xs font-medium text-green-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Globe className="w-3.5 h-3.5" /> DAT Responses
            {datResponses.mock && <span className="text-slate-500 normal-case">(simulated)</span>}
          </h3>
          <div className="space-y-2">
            {datResponses.responses.map((r) => (
              <div key={r.id} className="p-2 bg-gray-100 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-[#0A2540]">{r.carrierName}</p>
                    <p className="text-xs text-slate-500">MC: {r.mcNumber} | DOT: {r.dotNumber}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-[#BA7517] font-medium">${r.offeredRate.toLocaleString()}</p>
                    {r.driverAvailable && <span className="text-xs text-green-700">Driver available</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* DAT actions */}
      {canCreate && load.status === "POSTED" && (
        <section>
          <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">DAT Load Board</h3>
          <div className="flex gap-2">
            {!load.datPostId ? (
              <>
                <button
                  onClick={() => datPostMutation.mutate(load.id)}
                  disabled={datPostMutation.isPending}
                  className="flex-1 px-3 py-2 bg-green-500/20 text-green-400 rounded-lg text-xs hover:bg-green-500/30 disabled:opacity-50"
                >
                  <Globe className="w-3 h-3 inline mr-1" />
                  {datPostMutation.isPending ? "Posting..." : "Quick Post"}
                </button>
                <button
                  onClick={onAdvancedDat}
                  className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-xs hover:bg-gray-100 border border-gray-200"
                >
                  Advanced Post
                </button>
              </>
            ) : (
              <button
                onClick={() => datRemoveMutation.mutate(load.datPostId!)}
                disabled={datRemoveMutation.isPending}
                className="flex-1 px-3 py-2 bg-red-500/20 text-red-400 rounded-lg text-xs hover:bg-red-500/30 disabled:opacity-50"
              >
                <X className="w-3 h-3 inline mr-1" />
                {datRemoveMutation.isPending ? "Removing..." : "Remove DAT Post"}
              </button>
            )}
          </div>
        </section>
      )}

      {/* Tender history */}
      {tenders && tenders.length > 0 && (
        <section>
          <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Tender History</h3>
          <div className="space-y-2">
            {tenders.map((t) => (
              <div key={t.id} className="flex items-center justify-between p-2 bg-gray-100 rounded-lg border border-gray-200">
                <div className="min-w-0">
                  <p className="text-sm text-[#0A2540] truncate">
                    {t.carrier?.user?.company || `${t.carrier?.user?.firstName} ${t.carrier?.user?.lastName}`}
                  </p>
                  <p className="text-xs text-gray-600">{new Date(t.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {canSeeMargin ? (
                    <div className="text-right">
                      <p className="text-xs text-[#0A2540]">${t.offeredRate.toLocaleString()}</p>
                      {t.counterRate && (
                        <p className="text-xs text-yellow-700">Counter: ${t.counterRate.toLocaleString()}</p>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-600">&mdash;</span>
                  )}
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${TENDER_COLORS[t.status] || ""}`}>
                    {t.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ---- Exceptions Tab ---- */
function PanelExceptions({ load }: { load: Load }) {
  const hasIssue = ["TONU", "CANCELLED"].includes(load.status);
  return (
    <div className="space-y-4">
      <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider">Exceptions</h3>
      {hasIssue ? (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-sm text-red-400 font-medium">
            {load.status === "TONU" ? "TONU \u2014 Truck Ordered Not Used" : "Load Cancelled"}
          </p>
          <p className="text-xs text-slate-400 mt-1">Review claims or delays associated with this load.</p>
        </div>
      ) : (
        <p className="text-sm text-slate-500">No exceptions or issues reported for this load.</p>
      )}
    </div>
  );
}

/* ---- Carrier Actions (for carrier role) ---- */
function CarrierActions({
  load,
  carrierUpdateStatus,
}: {
  load: Load;
  carrierUpdateStatus: { mutate: (v: { loadId: string; status: string }) => void; isPending: boolean };
}) {
  const btn = (status: string, label: string, cls: string, Icon: typeof MapPin) => (
    <button
      onClick={() => carrierUpdateStatus.mutate({ loadId: load.id, status })}
      disabled={carrierUpdateStatus.isPending}
      className={`px-3 py-1.5 ${cls} rounded-lg text-xs disabled:opacity-50`}
    >
      <Icon className="w-3 h-3 inline mr-1" />{label}
    </button>
  );
  return (
    <>
      {["BOOKED", "DISPATCHED"].includes(load.status) &&
        btn("AT_PICKUP", "At Pickup", "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30", MapPin)}
      {load.status === "AT_PICKUP" &&
        btn("LOADED", "Mark Loaded", "bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30", Truck)}
      {["LOADED", "PICKED_UP"].includes(load.status) &&
        btn("IN_TRANSIT", "In Transit", "bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30", Truck)}
      {load.status === "IN_TRANSIT" &&
        btn("AT_DELIVERY", "At Delivery", "bg-teal-500/20 text-teal-400 hover:bg-teal-500/30", MapPin)}
      {load.status === "AT_DELIVERY" &&
        btn("DELIVERED", "Delivered", "bg-green-500/20 text-green-400 hover:bg-green-500/30", Package)}
    </>
  );
}

/* ================================================================== */
/*  Sub-components: Forms                                              */
/* ================================================================== */

function TenderForm({
  load,
  canSeeMargin,
  suggestedCarriers,
  tenderCarrierId,
  setTenderCarrierId,
  tenderRate,
  setTenderRate,
  complianceResult,
  checkingCompliance,
  onSubmit,
  isPending,
}: {
  load: Load;
  canSeeMargin: boolean;
  suggestedCarriers?: { carriers: { carrierId: string; company: string; tier: string; complianceStatus: string }[] };
  tenderCarrierId: string;
  setTenderCarrierId: (v: string) => void;
  tenderRate: string;
  setTenderRate: (v: string) => void;
  complianceResult: { allowed: boolean; blocked_reasons: string[]; warnings: string[] } | null;
  checkingCompliance: boolean;
  onSubmit: () => void;
  isPending: boolean;
}) {
  const inputCls =
    "w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-white placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20";

  // v3.8.aao — Sprint 36 Item 49 (Y1). Replaces static <select> bound
  // to waterfall-scored subset (which returned 0 matches for a brand-
  // new platform with no historical lane data, blocking AE from
  // tendering to the only available carrier — BKN).
  //
  // Pattern matches RC Modal Section 6 (Sprint 31 + 32 carrier picker):
  // search input → /api/carrier/all → dropdown of all approved carriers.
  // Waterfall scoring info preserved as advisory "Matched" tag — not
  // gate. AE picks ANY approved carrier; compliance check still fires
  // post-selection per existing safety.
  const [carrierSearch, setCarrierSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [selectedCarrier, setSelectedCarrier] = useState<{
    id: string;
    company: string;
    tier: string;
    mcNumber: string | null;
    dotNumber: string | null;
  } | null>(null);

  const { data: carriers } = useQuery({
    queryKey: ["tender-carrier-search", carrierSearch],
    queryFn: () =>
      api.get("/carrier/all", { params: { search: carrierSearch, limit: 10 } }).then((r) => r.data),
    enabled: showSearch && carrierSearch.length >= 2,
  });

  // Set of carrier IDs surfaced by waterfall scoring — used to render
  // the advisory "Matched" tag on rows the engine flagged for this lane.
  const matchedCarrierIds = new Set(
    (suggestedCarriers?.carriers ?? []).map((c) => c.carrierId)
  );

  // v3.8.aap — Sprint 36b Item 57. Tender backend expects
  // CarrierProfile.id (LoadTender.carrierId FK references
  // CarrierProfile.id per schema.prisma:1342, NOT User.id).
  // /api/carrier/all returns CarrierProfile records where c.id IS
  // CarrierProfile.id per carrierController.ts:773. Pre-Sprint-36
  // static <select> used c.carrierId from waterfall service which
  // was correctly CarrierProfile.id. Sprint 36 Y1 over-corrected
  // to userId-or-id heuristic that resolved to User.id, causing
  // tender backend findUnique 404 ("Carrier not found").
  const pickCarrier = (c: any) => {
    setTenderCarrierId(c.id); // CarrierProfile.id, not User.id
    setSelectedCarrier({
      id: c.id,
      company: c.company || c.user?.company || "Unknown",
      tier: c.tier || "GUEST",
      mcNumber: c.mcNumber || null,
      dotNumber: c.dotNumber || null,
    });
    setShowSearch(false);
    setCarrierSearch("");
  };

  // v3.8.aap — Sprint 36b Item 57. /api/carrier/all returns ALL
  // CarrierProfile records (filtered only by deletedAt:null —
  // see carrierController.ts:743). For tender pickers we need
  // compliance-eligible carriers only. Pre-Sprint-36 the picker
  // sourced from /waterfalls/load/:id/carrier-matches which
  // pre-filtered. Y1 swap to /api/carrier/all dropped that filter.
  // Client-side filter keeps the fix surgical (no backend change);
  // ?eligible=true query param consolidation is Item A28-2 post-BKN.
  function isCarrierEligibleForTender(c: any): boolean {
    if (c?.onboardingStatus !== "APPROVED") return false;
    if (c?.insuranceExpiry) {
      const expiry = new Date(c.insuranceExpiry);
      if (expiry <= new Date()) return false;
    }
    return true;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        {load.referenceNumber} &mdash; {load.originCity}, {load.originState} &rarr; {load.destCity}, {load.destState}
      </p>
      <div className="relative">
        <label className="block text-xs text-gray-500 mb-1">Select Carrier</label>
        {selectedCarrier ? (
          <div className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-slate-900 truncate">{selectedCarrier.company}</p>
                <span className={`px-2 py-0.5 text-[10px] rounded font-medium ${
                  selectedCarrier.tier === "PLATINUM" || selectedCarrier.tier === "GOLD"
                    ? "bg-[#C5A572]/15 text-[#BA7517]"
                    : "bg-slate-100 text-slate-600"
                }`}>
                  {selectedCarrier.tier}
                </span>
                {matchedCarrierIds.has(selectedCarrier.id) && (
                  <span className="px-2 py-0.5 text-[10px] rounded bg-green-100 text-green-700 font-medium">
                    Matched
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                MC: {selectedCarrier.mcNumber || "N/A"} | DOT: {selectedCarrier.dotNumber || "N/A"}
              </p>
            </div>
            <button
              onClick={() => { setSelectedCarrier(null); setTenderCarrierId(""); }}
              className="text-xs text-slate-500 hover:text-slate-900 px-2 py-1"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={carrierSearch}
              onChange={(e) => { setCarrierSearch(e.target.value); setShowSearch(true); }}
              onFocus={() => setShowSearch(true)}
              placeholder="Search by company name, MC#, or DOT#..."
              className={`${inputCls} pl-10`}
            />
            {showSearch && carriers && (() => {
              // v3.8.aap — Sprint 36b. Two-pass: hit-count gate (zero
              // search matches) vs eligibility-filter gate (matches
              // exist but ineligible). Distinct empty-state messages.
              const allHits = (carriers.carriers || carriers || []);
              const eligibleHits = allHits.filter(isCarrierEligibleForTender);
              return (
              <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-2xl max-h-60 overflow-y-auto">
                {allHits.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-slate-500">No carriers found</div>
                ) : eligibleHits.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-slate-500">
                    No eligible carriers found. Try a broader search.
                  </div>
                ) : (
                  eligibleHits.map((c: any) => {
                    return (
                      <button
                        key={c.id}
                        onClick={() => pickCarrier(c)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-left transition cursor-pointer"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm text-slate-900 truncate">{c.company || c.user?.company || "Unknown"}</p>
                            {matchedCarrierIds.has(c.id) && (
                              <span className="px-1.5 py-0.5 text-[10px] rounded bg-green-100 text-green-700 font-medium shrink-0">
                                Matched
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500">
                            MC: {c.mcNumber || "N/A"} | DOT: {c.dotNumber || "N/A"}
                          </p>
                        </div>
                        {c.tier && (
                          <span className={`px-2 py-0.5 text-[10px] rounded font-medium shrink-0 ${
                            c.tier === "PLATINUM" || c.tier === "GOLD"
                              ? "bg-[#C5A572]/15 text-[#BA7517]"
                              : "bg-slate-100 text-slate-600"
                          }`}>
                            {c.tier}
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
              );
            })()}
          </div>
        )}
      </div>
      {canSeeMargin ? (
        <div>
          <label className="block text-xs text-gray-500 mb-1">Offered Rate ($)</label>
          <input type="number" value={tenderRate} onChange={(e) => setTenderRate(e.target.value)} className={inputCls} />
        </div>
      ) : (
        <div className="p-3 bg-slate-100 rounded-lg">
          <p className="text-xs text-gray-500">Carrier rate is set by your broker or admin.</p>
        </div>
      )}
      {complianceResult && !complianceResult.allowed && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-sm font-medium text-red-400 mb-1">Carrier Blocked</p>
          {complianceResult.blocked_reasons.map((r, i) => (
            <p key={i} className="text-xs text-red-300">- {r}</p>
          ))}
        </div>
      )}
      {complianceResult && complianceResult.allowed && complianceResult.warnings.length > 0 && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <p className="text-sm font-medium text-amber-400 mb-1">Compliance Warnings</p>
          {complianceResult.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-300">- {w}</p>
          ))}
        </div>
      )}
      <button
        onClick={onSubmit}
        disabled={
          !tenderCarrierId || !tenderRate || isPending || checkingCompliance ||
          (complianceResult !== null && !complianceResult.allowed)
        }
        className="w-full px-4 py-2.5 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50"
      >
        {checkingCompliance
          ? "Checking Compliance..."
          : complianceResult && complianceResult.allowed && complianceResult.warnings.length > 0
            ? "Send Tender (with warnings)"
            : "Send Tender"}
      </button>
    </div>
  );
}

function DatAdvancedForm({
  form,
  setForm,
  loadId,
  mutate,
  isPending,
  isError,
}: {
  form: {
    originCity: string; originState: string; destCity: string; destState: string;
    equipmentType: string; weight: string; rate: string; pickupDate: string;
    deliveryDate: string; loadType: string; comments: string;
  };
  setForm: React.Dispatch<React.SetStateAction<typeof form>>;
  loadId: string;
  mutate: (body: Record<string, any>) => void;
  isPending: boolean;
  isError: boolean;
}) {
  const inputCls =
    "w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-white placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20";
  const selCls =
    "w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-white focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20";
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Override load details for the DAT posting. Leave blank to use load defaults.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Origin City</label>
          <input value={form.originCity} onChange={(e) => setForm((f) => ({ ...f, originCity: e.target.value }))} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Origin State</label>
          <input value={form.originState} onChange={(e) => setForm((f) => ({ ...f, originState: e.target.value }))} maxLength={2} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Dest City</label>
          <input value={form.destCity} onChange={(e) => setForm((f) => ({ ...f, destCity: e.target.value }))} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Dest State</label>
          <input value={form.destState} onChange={(e) => setForm((f) => ({ ...f, destState: e.target.value }))} maxLength={2} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Equipment Type</label>
          <select value={form.equipmentType} onChange={(e) => setForm((f) => ({ ...f, equipmentType: e.target.value }))} className={selCls}>
            <option value="">Use default</option>
            {["Dry Van", "Reefer", "Flatbed", "Step Deck", "Car Hauler"].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Weight (lbs)</label>
          <input type="number" value={form.weight} onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Rate ($)</label>
          <input type="number" value={form.rate} onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Load Type</label>
          <select value={form.loadType} onChange={(e) => setForm((f) => ({ ...f, loadType: e.target.value }))} className={selCls}>
            <option value="FULL">Full Truckload</option>
            <option value="PARTIAL">Partial</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Pickup Date</label>
          <input type="date" value={form.pickupDate} onChange={(e) => setForm((f) => ({ ...f, pickupDate: e.target.value }))} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Delivery Date</label>
          <input type="date" value={form.deliveryDate} onChange={(e) => setForm((f) => ({ ...f, deliveryDate: e.target.value }))} className={inputCls} />
        </div>
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Comments</label>
        <textarea
          value={form.comments}
          onChange={(e) => setForm((f) => ({ ...f, comments: e.target.value }))}
          rows={2}
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-white placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 resize-none"
        />
      </div>
      {isError && <p className="text-xs text-red-400">Failed to post. Please try again.</p>}
      <button
        onClick={() => {
          const body: Record<string, any> = { loadId };
          if (form.originCity) body.originCity = form.originCity;
          if (form.originState) body.originState = form.originState;
          if (form.destCity) body.destCity = form.destCity;
          if (form.destState) body.destState = form.destState;
          if (form.equipmentType) body.equipmentType = form.equipmentType;
          if (form.weight) body.weight = parseFloat(form.weight);
          if (form.rate) body.rate = parseFloat(form.rate);
          if (form.pickupDate) body.pickupDate = form.pickupDate;
          if (form.deliveryDate) body.deliveryDate = form.deliveryDate;
          if (form.loadType) body.loadType = form.loadType;
          if (form.comments) body.comments = form.comments;
          mutate(body);
        }}
        disabled={isPending}
        className="w-full px-4 py-2.5 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50"
      >
        {isPending ? "Posting to DAT..." : "Post to DAT"}
      </button>
    </div>
  );
}
