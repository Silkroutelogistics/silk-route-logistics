"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Crosshair, Package, Truck, Search, ChevronRight, X, Download,
  Calendar, DollarSign, MapPin, CheckCircle, Loader2, AlertTriangle,
  Zap, Clock, ChevronDown, ChevronUp,
} from "lucide-react";
import { downloadCSV } from "@/lib/csvExport";

import type { Load, CarrierProfile } from "@/types/entities";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CarrierMatch {
  carrierId: string;
  score: number;
  reasons: string[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const fmtDate = (d: string) => {
  if (!d) return "—";
  const dt = new Date(d);
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
};

const fmtMoney = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const equipAbbrev = (eq: string) => {
  if (!eq) return "—";
  const map: Record<string, string> = {
    "Dry Van": "DV", "Reefer": "RF", "Flatbed": "FB", "Step Deck": "SD",
    "Car Hauler": "CH", "Tanker": "TK", "Lowboy": "LB", "Conestoga": "CN",
  };
  return map[eq] || eq.substring(0, 2).toUpperCase();
};

const matchesEquipment = (carrierTypes: string[], loadType: string): boolean => {
  if (!carrierTypes || carrierTypes.length === 0) return true;
  const loadNorm = loadType.toLowerCase();
  return carrierTypes.some((t) => {
    const norm = t.toLowerCase();
    return norm === loadNorm || norm.includes(loadNorm) || loadNorm.includes(norm);
  });
};

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function DispatchBoardPage() {
  const queryClient = useQueryClient();
  const [selectedLoadId, setSelectedLoadId] = useState<string | null>(null);
  const [selectedCarrierId, setSelectedCarrierId] = useState<string | null>(null);
  const [loadSearch, setLoadSearch] = useState("");
  const [carrierSearch, setCarrierSearch] = useState("");
  const [equipFilter, setEquipFilter] = useState("");
  const [confirmingAssign, setConfirmingAssign] = useState(false);
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null);

  // Waterfall tendering state
  const [showWaterfall, setShowWaterfall] = useState(false);
  const [waterfallExpiry, setWaterfallExpiry] = useState(60);
  const [waterfallLoading, setWaterfallLoading] = useState(false);
  const [waterfallResult, setWaterfallResult] = useState<{ campaignId: string; tenderCount: number } | null>(null);
  const [waterfallStatusLoadId, setWaterfallStatusLoadId] = useState<string | null>(null);

  /* ── Data queries ────────────────────────────────────────── */

  const [dispatchTab, setDispatchTab] = useState<"POSTED" | "TENDERED" | "BOOKED" | "all">("all");

  const { data: loadsData, isLoading: loadsLoading } = useQuery({
    queryKey: ["dispatch-loads"],
    queryFn: async () => {
      const [posted, tendered, booked] = await Promise.all([
        api.get<{ loads: Load[] }>("/loads?status=POSTED&limit=50").then((r) => r.data),
        api.get<{ loads: Load[] }>("/loads?status=TENDERED&limit=50").then((r) => r.data),
        api.get<{ loads: Load[] }>("/loads?status=BOOKED&limit=50").then((r) => r.data),
      ]);
      return { loads: [...(posted.loads || []), ...(tendered.loads || []), ...(booked.loads || [])] };
    },
    refetchInterval: 15000,
  });

  const { data: carriersData, isLoading: carriersLoading } = useQuery({
    queryKey: ["dispatch-carriers"],
    queryFn: () =>
      api.get<{ carriers?: CarrierProfile[]; data?: CarrierProfile[] }>("/carrier/all").then((r) => {
        const list = r.data?.carriers || r.data?.data || (Array.isArray(r.data) ? r.data as unknown as CarrierProfile[] : []);
        return list;
      }),
    refetchInterval: 30000,
  });

  const selectedLoad = useMemo(
    () => (loadsData?.loads || []).find((l) => l.id === selectedLoadId) || null,
    [loadsData, selectedLoadId],
  );

  const { data: matchScores } = useQuery({
    queryKey: ["carrier-match", selectedLoadId],
    queryFn: () =>
      api.get<{ matches?: CarrierMatch[] }>(`/carrier-match/${selectedLoadId}`).then((r) => r.data?.matches || []),
    enabled: !!selectedLoadId,
  });

  const matchScoreMap = useMemo(() => {
    const m = new Map<string, number>();
    if (matchScores) {
      for (const s of matchScores) m.set(s.carrierId, s.score);
    }
    return m;
  }, [matchScores]);

  /* ── Filtered lists ──────────────────────────────────────── */

  const filteredLoads = useMemo(() => {
    let loads = loadsData?.loads || [];
    if (dispatchTab !== "all") {
      const statusGroup = dispatchTab === "TENDERED" ? ["TENDERED", "CONFIRMED"] : [dispatchTab];
      loads = loads.filter((l) => statusGroup.includes(l.status));
    }
    if (!loadSearch) return loads;
    const q = loadSearch.toLowerCase();
    return loads.filter((l) =>
      l.referenceNumber.toLowerCase().includes(q) ||
      `${l.originCity} ${l.originState}`.toLowerCase().includes(q) ||
      `${l.destCity} ${l.destState}`.toLowerCase().includes(q) ||
      (l.commodity || "").toLowerCase().includes(q)
    );
  }, [loadsData, loadSearch, dispatchTab]);

  const filteredCarriers = useMemo(() => {
    let list = carriersData || [];
    // Filter by equipment if a load is selected
    if (selectedLoad) {
      list = list.filter((c) => matchesEquipment(c.equipmentTypes || [], selectedLoad.equipmentType));
    }
    if (equipFilter) {
      list = list.filter((c) =>
        (c.equipmentTypes || []).some((t) => t.toLowerCase().includes(equipFilter.toLowerCase()))
      );
    }
    if (carrierSearch) {
      const q = carrierSearch.toLowerCase();
      list = list.filter((c) =>
        c.companyName.toLowerCase().includes(q) ||
        (c.mcNumber || "").includes(q)
      );
    }
    // Sort by match score if available
    if (matchScoreMap.size > 0) {
      list = [...list].sort((a, b) => (matchScoreMap.get(b.userId) || 0) - (matchScoreMap.get(a.userId) || 0));
    }
    return list;
  }, [carriersData, selectedLoad, equipFilter, carrierSearch, matchScoreMap]);

  const selectedCarrier = useMemo(
    () => filteredCarriers.find((c) => c.id === selectedCarrierId || c.userId === selectedCarrierId) || null,
    [filteredCarriers, selectedCarrierId],
  );

  /* ── Assignment mutation ─────────────────────────────────── */

  const assignMutation = useMutation({
    mutationFn: () => {
      if (!selectedLoad || !selectedCarrier) throw new Error("No load or carrier selected");
      return api.post(`/loads/${selectedLoad.id}/tenders`, {
        carrierId: selectedCarrier.userId,
        offeredRate: selectedLoad.rate,
      });
    },
    onSuccess: () => {
      setAssignSuccess(`${selectedLoad?.referenceNumber} assigned to ${selectedCarrier?.companyName}`);
      setSelectedLoadId(null);
      setSelectedCarrierId(null);
      setConfirmingAssign(false);
      queryClient.invalidateQueries({ queryKey: ["dispatch-loads"] });
      queryClient.invalidateQueries({ queryKey: ["dispatch-carriers"] });
      setTimeout(() => setAssignSuccess(null), 4000);
    },
  });

  // Waterfall status query
  const { data: waterfallStatus, refetch: refetchWaterfall } = useQuery({
    queryKey: ["waterfall-status", waterfallStatusLoadId],
    queryFn: () => api.get(`/loads/${waterfallStatusLoadId}/waterfall`).then((r) => r.data),
    enabled: !!waterfallStatusLoadId,
    refetchInterval: 15000,
  });

  // Launch waterfall
  const launchWaterfall = async () => {
    if (!selectedLoad || !matchScores || matchScores.length === 0) return;
    setWaterfallLoading(true);
    try {
      const topMatches = matchScores.slice(0, 5);
      const candidates = topMatches.map((m: CarrierMatch) => {
        const carrier = (carriersData || []).find((c) => c.userId === m.carrierId);
        return {
          carrierId: carrier?.id || m.carrierId,
          carrierUserId: m.carrierId,
          companyName: carrier?.companyName || "Unknown",
          score: m.score,
          offeredRate: selectedLoad.rate,
        };
      }).filter((c: any) => c.carrierId);

      const result = await api.post(`/loads/${selectedLoad.id}/waterfall`, {
        candidates,
        expirationMinutes: waterfallExpiry,
      });
      setWaterfallResult({ campaignId: result.data.campaignId, tenderCount: result.data.tenders.length });
      setWaterfallStatusLoadId(selectedLoad.id);
      setShowWaterfall(false);
      queryClient.invalidateQueries({ queryKey: ["dispatch-loads"] });
      setTimeout(() => setWaterfallResult(null), 5000);
    } catch (err) {
      console.error("Waterfall launch failed:", err);
    } finally {
      setWaterfallLoading(false);
    }
  };

  const estimatedMargin = selectedLoad
    ? Math.round(selectedLoad.rate * 0.15)
    : 0;
  const marginPct = 15;

  /* ── Render ──────────────────────────────────────────────── */

  return (
    <div className="p-4 lg:p-6 h-[calc(100vh-2rem)] flex flex-col gap-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Crosshair className="w-6 h-6 text-gold" /> Dispatch Board
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Match & assign — tender, confirm, book carriers
          </p>
        </div>
        <div className="flex items-center gap-2">
          {filteredLoads.length > 0 && (
            <button onClick={() => downloadCSV(
              filteredLoads.map((l) => ({
                ref: l.referenceNumber, status: l.status,
                origin: `${l.originCity}, ${l.originState}`, dest: `${l.destCity}, ${l.destState}`,
                equipment: l.equipmentType, rate: l.rate, miles: l.distance || "",
                pickup: l.pickupDate?.split("T")[0] || "", carrier: l.carrier?.company || "Unassigned",
              })),
              [
                { key: "ref", label: "Reference #" }, { key: "status", label: "Status" },
                { key: "origin", label: "Origin" }, { key: "dest", label: "Destination" },
                { key: "equipment", label: "Equipment" }, { key: "rate", label: "Rate ($)" },
                { key: "miles", label: "Miles" }, { key: "pickup", label: "Pickup Date" },
                { key: "carrier", label: "Carrier" },
              ],
              `srl-dispatch-${new Date().toISOString().split("T")[0]}.csv`,
            )} className="flex items-center gap-1.5 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-slate-300 hover:bg-white/10 transition cursor-pointer">
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          )}
          {assignSuccess && (
            <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-2 text-sm text-green-400">
              <CheckCircle className="w-4 h-4" />
              {assignSuccess}
            </div>
          )}
          {waterfallResult && (
            <div className="flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 rounded-lg px-4 py-2 text-sm text-purple-400">
              <Zap className="w-4 h-4" />
              Waterfall {waterfallResult.campaignId} launched — {waterfallResult.tenderCount} carriers queued
            </div>
          )}
        </div>
      </div>

      {/* Split pane container */}
      <div className="flex-1 flex flex-col gap-0 min-h-0">

        {/* TOP HALF: Unassigned Loads */}
        <div className="flex-1 min-h-0 flex flex-col bg-white/5 border border-white/10 rounded-t-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0 bg-gradient-to-r from-[#C9A84C]/10 to-transparent">
            <div className="flex items-center gap-3">
              <Package className="w-4 h-4 text-gold" />
              {(["all", "POSTED", "TENDERED", "BOOKED"] as const).map((tab) => {
                const allLoads = loadsData?.loads || [];
                const count = tab === "all" ? allLoads.length
                  : tab === "TENDERED" ? allLoads.filter((l) => ["TENDERED", "CONFIRMED"].includes(l.status)).length
                  : allLoads.filter((l) => l.status === tab).length;
                const label = tab === "all" ? "All" : tab === "POSTED" ? "Posted" : tab === "TENDERED" ? "Tendered" : "Booked";
                return (
                  <button key={tab} onClick={() => setDispatchTab(tab)}
                    className={`text-xs font-semibold uppercase tracking-wider px-2 py-1 rounded-md transition cursor-pointer ${
                      dispatchTab === tab ? "text-gold bg-gold/15" : "text-slate-400 hover:text-slate-200"
                    }`}>
                    {label} <span className="text-[10px] ml-0.5 opacity-70">{count}</span>
                  </button>
                );
              })}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-500" />
              <input
                value={loadSearch}
                onChange={(e) => setLoadSearch(e.target.value)}
                placeholder="Search loads..."
                className="pl-8 pr-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-gold/50 w-48"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadsLoading ? (
              <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading loads...
              </div>
            ) : filteredLoads.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-slate-500 text-sm">
                No unassigned loads found
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[#0F1117]/90 ">
                  <tr className="text-[10px] text-slate-500 uppercase tracking-wider">
                    <th className="text-left px-4 py-2 font-medium">Ref#</th>
                    <th className="text-left px-4 py-2 font-medium">Status</th>
                    <th className="text-left px-4 py-2 font-medium">Route</th>
                    <th className="text-left px-4 py-2 font-medium">Equip</th>
                    <th className="text-right px-4 py-2 font-medium">Rate</th>
                    <th className="text-left px-4 py-2 font-medium">PU Date</th>
                    <th className="text-right px-4 py-2 font-medium">Miles</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLoads.map((load) => {
                    const isSelected = load.id === selectedLoadId;
                    return (
                      <tr
                        key={load.id}
                        onClick={() => {
                          setSelectedLoadId(isSelected ? null : load.id);
                          setSelectedCarrierId(null);
                          setConfirmingAssign(false);
                        }}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-[#C9A84C]/10 border-l-2 border-[#C9A84C]"
                            : "hover:bg-white/5 border-l-2 border-transparent"
                        }`}
                      >
                        <td className="px-4 py-2.5 font-mono text-xs text-white">{load.referenceNumber}</td>
                        <td className="px-4 py-2.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            load.status === "POSTED" ? "bg-blue-500/20 text-blue-400"
                            : load.status === "BOOKED" ? "bg-violet-500/20 text-violet-400"
                            : "bg-indigo-500/20 text-indigo-400"
                          }`}>{load.status}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-white">{load.originCity}, {load.originState}</span>
                          <ChevronRight className="w-3 h-3 inline mx-1 text-slate-500" />
                          <span className="text-white">{load.destCity}, {load.destState}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="px-1.5 py-0.5 bg-white/10 rounded text-xs text-slate-300 font-medium">
                            {equipAbbrev(load.equipmentType)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-gold font-medium">{fmtMoney(load.rate)}</td>
                        <td className="px-4 py-2.5 text-slate-300">{fmtDate(load.pickupDate)}</td>
                        <td className="px-4 py-2.5 text-right text-slate-400">{load.distance ? `${load.distance} mi` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* DIVIDER / CONFIRMATION PANEL */}
        {confirmingAssign && selectedLoad && selectedCarrier ? (
          <div className="shrink-0 bg-gradient-to-r from-gold/10 via-gold/5 to-transparent border-x border-white/10 px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gold font-semibold">ASSIGN:</span>
                  <span className="text-white font-medium">{selectedLoad.referenceNumber}</span>
                  <span className="text-slate-400">
                    ({selectedLoad.originCity}, {selectedLoad.originState} → {selectedLoad.destCity}, {selectedLoad.destState}, {equipAbbrev(selectedLoad.equipmentType)}, {fmtMoney(selectedLoad.rate)})
                  </span>
                  <ChevronRight className="w-4 h-4 text-gold" />
                  <span className="text-white font-medium">{selectedCarrier.companyName}</span>
                  {matchScoreMap.has(selectedCarrier.userId) && (
                    <span className="text-xs text-slate-400">(Score: {matchScoreMap.get(selectedCarrier.userId)})</span>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  Estimated Margin: <span className="text-green-400 font-medium">{fmtMoney(estimatedMargin)} ({marginPct}%)</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => assignMutation.mutate()}
                  disabled={assignMutation.isPending}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gold text-navy font-semibold rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50 transition cursor-pointer"
                >
                  {assignMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  Confirm Assignment
                </button>
                <button
                  onClick={() => { setConfirmingAssign(false); setSelectedCarrierId(null); }}
                  className="px-3 py-2 bg-white/10 text-white rounded-lg text-sm hover:bg-white/20 transition cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
            {assignMutation.isError && (
              <p className="text-xs text-red-400 mt-2 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Assignment failed. Please try again.
              </p>
            )}
          </div>
        ) : (
          <div className="shrink-0 h-1 bg-gradient-to-r from-[#C9A84C]/20 via-[#2A2F42] to-[#2A2F42]" />
        )}

        {/* BOTTOM HALF: Available Carriers */}
        <div className="flex-1 min-h-0 flex flex-col bg-white/5 border border-white/10 rounded-b-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0 bg-gradient-to-r from-blue-500/10 to-transparent">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-blue-400" />
              <h2 className="text-sm font-semibold text-blue-400 uppercase tracking-wider">Available Carriers</h2>
              <span className="text-xs text-slate-400 bg-white/5 px-2 py-0.5 rounded-full">
                {filteredCarriers.length} carrier{filteredCarriers.length !== 1 ? "s" : ""}
              </span>
              {selectedLoad && (
                <span className="text-xs text-gold bg-gold/10 px-2 py-0.5 rounded-full">
                  Filtered: {equipAbbrev(selectedLoad.equipmentType)} match
                </span>
              )}
              {selectedLoad && matchScores && matchScores.length >= 2 && (
                <button
                  onClick={() => setShowWaterfall(true)}
                  className="flex items-center gap-1.5 px-3 py-1 bg-purple-500/20 text-purple-400 text-xs font-medium rounded-lg hover:bg-purple-500/30 transition cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5" /> Waterfall Tender
                </button>
              )}
              {selectedLoad && (
                <button
                  onClick={() => setWaterfallStatusLoadId(waterfallStatusLoadId === selectedLoad.id ? null : selectedLoad.id)}
                  className="text-xs text-slate-400 hover:text-slate-200 transition cursor-pointer"
                >
                  {waterfallStatusLoadId === selectedLoad.id ? <ChevronUp className="w-3.5 h-3.5 inline" /> : <ChevronDown className="w-3.5 h-3.5 inline" />} Status
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <select
                value={equipFilter}
                onChange={(e) => setEquipFilter(e.target.value)}
                className="px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-gold/50 cursor-pointer"
              >
                <option value="" style={{ backgroundColor: "#0F1117", color: "#f8fafc" }}>All Equipment</option>
                <option value="Dry Van" style={{ backgroundColor: "#0F1117", color: "#f8fafc" }}>Dry Van</option>
                <option value="Reefer" style={{ backgroundColor: "#0F1117", color: "#f8fafc" }}>Reefer</option>
                <option value="Flatbed" style={{ backgroundColor: "#0F1117", color: "#f8fafc" }}>Flatbed</option>
                <option value="Step Deck" style={{ backgroundColor: "#0F1117", color: "#f8fafc" }}>Step Deck</option>
              </select>
              <div className="relative">
                <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-500" />
                <input
                  value={carrierSearch}
                  onChange={(e) => setCarrierSearch(e.target.value)}
                  placeholder="Search carriers..."
                  className="pl-8 pr-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-gold/50 w-44"
                />
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {carriersLoading ? (
              <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading carriers...
              </div>
            ) : filteredCarriers.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-slate-500 text-sm">
                {selectedLoad ? "No carriers matching equipment type" : "No carriers available"}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[#0F1117]/90 ">
                  <tr className="text-[10px] text-slate-500 uppercase tracking-wider">
                    <th className="text-left px-4 py-2 font-medium">Carrier</th>
                    <th className="text-left px-4 py-2 font-medium">MC#</th>
                    <th className="text-left px-4 py-2 font-medium">Equipment</th>
                    <th className="text-left px-4 py-2 font-medium">Regions</th>
                    <th className="text-center px-4 py-2 font-medium">Score</th>
                    <th className="text-center px-4 py-2 font-medium">Status</th>
                    <th className="text-center px-4 py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCarriers.map((carrier) => {
                    const cId = carrier.id || carrier.userId;
                    const isSelected = selectedCarrierId === cId;
                    const score = matchScoreMap.get(carrier.userId);
                    return (
                      <tr
                        key={cId}
                        onClick={() => {
                          if (!selectedLoadId) return;
                          setSelectedCarrierId(isSelected ? null : cId);
                          if (!isSelected) setConfirmingAssign(true);
                          else setConfirmingAssign(false);
                        }}
                        className={`transition-colors ${
                          !selectedLoadId ? "opacity-60" : "cursor-pointer"
                        } ${
                          isSelected
                            ? "bg-[#C9A84C]/10 border-l-2 border-[#C9A84C]"
                            : "hover:bg-white/5 border-l-2 border-transparent"
                        }`}
                      >
                        <td className="px-4 py-2.5">
                          <span className="text-white font-medium">{carrier.companyName}</span>
                          {carrier.user && (
                            <span className="text-xs text-slate-500 ml-1.5">
                              ({carrier.user.firstName} {carrier.user.lastName})
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-400 font-mono">{carrier.mcNumber || "—"}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {(carrier.equipmentTypes || []).slice(0, 3).map((t) => (
                              <span key={t} className="px-1.5 py-0.5 bg-white/10 rounded text-[10px] text-slate-300">
                                {equipAbbrev(t)}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-400">
                          {(carrier.serviceRegions || []).slice(0, 3).join(", ") || "—"}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {score !== undefined ? (
                            <span className={`text-xs font-bold ${
                              score >= 80 ? "text-green-400" : score >= 50 ? "text-yellow-400" : "text-slate-400"
                            }`}>
                              {score}%
                            </span>
                          ) : (
                            <span className="text-xs text-slate-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            carrier.status === "APPROVED" ? "bg-green-500/20 text-green-400" :
                            carrier.status === "ACTIVE" ? "bg-green-500/20 text-green-400" :
                            "bg-slate-500/20 text-slate-400"
                          }`}>
                            {carrier.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {selectedLoadId && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedCarrierId(cId);
                                setConfirmingAssign(true);
                              }}
                              className="px-2.5 py-1 bg-gold/20 text-gold text-xs font-medium rounded hover:bg-gold/30 transition cursor-pointer"
                            >
                              Assign
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Waterfall Status Panel */}
      {waterfallStatusLoadId && waterfallStatus && (
        <div className="mt-4 bg-white/5 border border-purple-500/20 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-purple-400" />
              <h3 className="text-sm font-semibold text-purple-400 uppercase tracking-wider">Waterfall Status</h3>
              <span className="text-xs text-slate-400 font-mono">{waterfallStatus.referenceNumber}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                waterfallStatus.accepted ? "bg-green-500/20 text-green-400"
                : waterfallStatus.allDeclined ? "bg-red-500/20 text-red-400"
                : "bg-purple-500/20 text-purple-400"
              }`}>
                {waterfallStatus.accepted ? "ACCEPTED" : waterfallStatus.allDeclined ? "ALL DECLINED" : "IN PROGRESS"}
              </span>
              <button onClick={() => refetchWaterfall()} className="text-xs text-slate-500 hover:text-slate-300 cursor-pointer">Refresh</button>
              <button onClick={() => setWaterfallStatusLoadId(null)} className="text-slate-500 hover:text-slate-300 cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {(waterfallStatus.tenders || []).map((t: any, i: number) => (
              <div key={t.id} className={`flex-shrink-0 w-48 p-3 rounded-lg border ${
                t.status === "ACCEPTED" ? "border-green-500/30 bg-green-500/10"
                : t.status === "OFFERED" ? "border-purple-500/30 bg-purple-500/10"
                : t.status === "COUNTERED" ? "border-amber-500/30 bg-amber-500/10"
                : t.status === "DECLINED" ? "border-red-500/20 bg-red-500/5"
                : "border-white/10 bg-white/5"
              }`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] text-slate-400">#{t.sequence}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                    t.status === "ACCEPTED" ? "bg-green-500/30 text-green-400"
                    : t.status === "OFFERED" ? "bg-purple-500/30 text-purple-400"
                    : t.status === "COUNTERED" ? "bg-amber-500/30 text-amber-400"
                    : t.status === "DECLINED" ? "bg-red-500/30 text-red-400"
                    : "bg-slate-500/30 text-slate-400"
                  }`}>{t.status}</span>
                </div>
                <div className="text-xs text-white font-medium truncate">{t.companyName}</div>
                <div className="flex justify-between mt-1 text-[10px] text-slate-400">
                  <span>${t.offeredRate?.toLocaleString()}</span>
                  {t.counterRate && <span className="text-amber-400">Counter: ${t.counterRate.toLocaleString()}</span>}
                </div>
                {t.expiresAt && t.status === "OFFERED" && (
                  <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-500">
                    <Clock className="w-2.5 h-2.5" />
                    Expires {new Date(t.expiresAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Waterfall Launch Modal */}
      {showWaterfall && selectedLoad && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowWaterfall(false)} />
          <div className="relative bg-[#0F1117] border border-white/10 rounded-xl shadow-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-purple-400" />
                <h3 className="text-sm font-bold text-white">Waterfall Tender</h3>
              </div>
              <button onClick={() => setShowWaterfall(false)} className="text-slate-500 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mb-4 p-3 bg-white/5 rounded-lg">
              <div className="text-xs text-slate-400">Load</div>
              <div className="text-sm text-white font-medium">{selectedLoad.referenceNumber}</div>
              <div className="text-xs text-slate-500 mt-0.5">
                {selectedLoad.originCity}, {selectedLoad.originState} → {selectedLoad.destCity}, {selectedLoad.destState}
              </div>
              <div className="text-xs text-gold mt-1">Rate: ${selectedLoad.rate.toLocaleString()}</div>
            </div>

            <div className="mb-4">
              <div className="text-xs text-slate-400 mb-2">Top {Math.min(matchScores?.length || 0, 5)} matched carriers will be tendered sequentially</div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {(matchScores || []).slice(0, 5).map((m: CarrierMatch, i: number) => {
                  const carrier = (carriersData || []).find((c) => c.userId === m.carrierId);
                  return (
                    <div key={m.carrierId} className="flex items-center gap-3 p-2 bg-white/5 rounded text-xs">
                      <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-[10px] font-bold shrink-0">{i + 1}</span>
                      <span className="text-white flex-1 truncate">{carrier?.companyName || "Unknown"}</span>
                      <span className={`font-bold ${m.score >= 80 ? "text-green-400" : m.score >= 50 ? "text-yellow-400" : "text-slate-400"}`}>
                        {m.score}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mb-5">
              <label className="text-xs text-slate-400 block mb-1.5">Expiration per carrier (minutes)</label>
              <select
                value={waterfallExpiry}
                onChange={(e) => setWaterfallExpiry(Number(e.target.value))}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-purple-500/50 cursor-pointer"
              >
                <option value={30} style={{ backgroundColor: "#0F1117" }}>30 minutes</option>
                <option value={60} style={{ backgroundColor: "#0F1117" }}>1 hour</option>
                <option value={120} style={{ backgroundColor: "#0F1117" }}>2 hours</option>
                <option value={240} style={{ backgroundColor: "#0F1117" }}>4 hours</option>
                <option value={480} style={{ backgroundColor: "#0F1117" }}>8 hours</option>
              </select>
            </div>

            <div className="flex gap-2">
              <button
                onClick={launchWaterfall}
                disabled={waterfallLoading}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 text-white font-semibold rounded-lg text-sm hover:bg-purple-500 disabled:opacity-50 transition cursor-pointer"
              >
                {waterfallLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                Launch Waterfall
              </button>
              <button
                onClick={() => setShowWaterfall(false)}
                className="px-4 py-2.5 bg-white/10 text-white rounded-lg text-sm hover:bg-white/20 transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
