"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Crosshair, Package, Truck, Search, ChevronRight, X,
  Calendar, DollarSign, MapPin, CheckCircle, Loader2, AlertTriangle,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Load {
  id: string;
  referenceNumber: string;
  status: string;
  originCity: string;
  originState: string;
  destCity: string;
  destState: string;
  equipmentType: string;
  rate: number;
  pickupDate: string;
  deliveryDate?: string;
  weight: number | null;
  distance: number | null;
  commodity: string | null;
  carrier?: { company: string | null; firstName: string; lastName: string } | null;
}

interface CarrierProfile {
  id: string;
  userId: string;
  companyName: string;
  mcNumber: string | null;
  dotNumber: string | null;
  equipmentTypes: string[];
  serviceRegions: string[];
  activeLoads?: number;
  score?: number;
  status: string;
  user?: { firstName: string; lastName: string; email: string };
}

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

  /* ── Data queries ────────────────────────────────────────── */

  const { data: loadsData, isLoading: loadsLoading } = useQuery({
    queryKey: ["dispatch-loads"],
    queryFn: () =>
      api.get<{ loads: Load[] }>("/loads?status=POSTED&limit=50").then((r) => r.data),
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
    const loads = loadsData?.loads || [];
    if (!loadSearch) return loads;
    const q = loadSearch.toLowerCase();
    return loads.filter((l) =>
      l.referenceNumber.toLowerCase().includes(q) ||
      `${l.originCity} ${l.originState}`.toLowerCase().includes(q) ||
      `${l.destCity} ${l.destState}`.toLowerCase().includes(q) ||
      (l.commodity || "").toLowerCase().includes(q)
    );
  }, [loadsData, loadSearch]);

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
            Match unassigned loads with available carriers
          </p>
        </div>
        {assignSuccess && (
          <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-2 text-sm text-green-400">
            <CheckCircle className="w-4 h-4" />
            {assignSuccess}
          </div>
        )}
      </div>

      {/* Split pane container */}
      <div className="flex-1 flex flex-col gap-0 min-h-0">

        {/* TOP HALF: Unassigned Loads */}
        <div className="flex-1 min-h-0 flex flex-col bg-white/5 border border-white/10 rounded-t-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0 bg-gradient-to-r from-[#C9A84C]/10 to-transparent">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-gold" />
              <h2 className="text-sm font-semibold text-gold uppercase tracking-wider">Unassigned Loads</h2>
              <span className="text-xs text-slate-400 bg-white/5 px-2 py-0.5 rounded-full">
                {filteredLoads.length} load{filteredLoads.length !== 1 ? "s" : ""}
              </span>
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
                <thead className="sticky top-0 bg-[#0F1117]/90 backdrop-blur-sm">
                  <tr className="text-[10px] text-slate-500 uppercase tracking-wider">
                    <th className="text-left px-4 py-2 font-medium">Ref#</th>
                    <th className="text-left px-4 py-2 font-medium">Route</th>
                    <th className="text-left px-4 py-2 font-medium">Equip</th>
                    <th className="text-right px-4 py-2 font-medium">Rate</th>
                    <th className="text-left px-4 py-2 font-medium">PU Date</th>
                    <th className="text-right px-4 py-2 font-medium">Miles</th>
                    <th className="text-left px-4 py-2 font-medium">Commodity</th>
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
                        <td className="px-4 py-2.5 text-slate-400 truncate max-w-[140px]">{load.commodity || "—"}</td>
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
                <thead className="sticky top-0 bg-[#0F1117]/90 backdrop-blur-sm">
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
    </div>
  );
}
